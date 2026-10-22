#!/usr/bin/env python3
"""동결 dome-motion v2의 A/B 원본을 파일만 읽어 대조해.

브라우저, 네트워크, 이미지 디코더를 사용하지 않아. 완료된 run-plan 로그,
계획/도구/소스 해시, 28+20+20 표본 및 동일 입력 조건을 확인해. 호출·타깃·
상태 복원·요청 품질을 표로 쓰고 15 PNG 쌍/품질의 파일과 조건을 따로 남겨.
completeMs 등 시간은 집계하지 않아. FPS·성능 개선·픽셀 화질 판정이 아니야.

기본은 high·medium A/B 4개 job 계획이야. --job-ids ID [ID ...]를 주면
원본 계획에서 지정한 job만 선택해. 선택한 품질마다 A/B 둘 다 필요하며,
원본 전체 계획의 SHA와 원래 로그 index를 검증해. 계획·로그는 바꾸지 않아.

--output은 존재하지 않는 새 디렉터리여야 해. 원본은 변경하지 않아.
출력: summary.json, summary.md, image-pairs.json. 종료 0=파일 검증 PASS,
1=FAIL, 2=INCOMPLETE(누락/진행/부분 기록). --help는 파일을 만들지 않아.
수집기와 fixture/helper/full-frame은 이 스크립트 옆 동결본과 대조하므로,
아카이브 재검증에서도 같은 버전의 tools/bench 파일을 함께 보존해 줘.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit


PHASES = ("rotation", "reveal", "crossfade")
FRACTIONS = (0, .25, .5, .75, 1)
WORLD_NAMES = ("FOREST3D", "OCEAN3D", "CLOUDS3D", "PEAKS3D")
SOURCE_NAMES = (
    "js/boot.js", "js/main.js", "js/quality.js", "js/scene/hall.js",
    "js/scene/seats.js", "js/scene/audience.js", "js/scene/screen.js",
    "js/scene/sphere.js", "js/scene/dome3d.js", "js/scene/domeshow.js",
    "js/audio/engine.js", "js/audio/performance.js", "js/scene/sphereplan.js",
    "vendor/three/three.core.js", "vendor/three/three.module.js",
)
TOOL_NAMES = {"collector": "dome-motion.mjs", "fixture": "full-frame-fixture.js",
              "helper": "browser.mjs", "referenceFullFrame": "full-frame.mjs"}
IMAGE_NAMES = ([f"rotation-{i:02d}" for i in (0, 7, 14, 21, 27)] +
               [f"{kind}-{int(f * 100)}" for kind in ("reveal", "crossfade") for f in FRACTIONS])
LIMITS = [
    "파일·기록 검증 PASS는 브라우저 재실행이나 실제 기기 성공을 뜻하지 않아.",
    "28개의 고정 1/60초 회전 step과 전환 5개 시각×4회 렌더야. 연속 4초 시청 검사가 아니야.",
    "음표 스케줄러가 꺼진 합성 음악 시계 fixture야. 오디오 품질·경합 검증이 아니야.",
    "cubeUpdateRequests.returnedNormally는 renderer.render의 정상 반환 관측이야. proxy draw/world program/픽셀 신선도 증명이 아니야.",
    "faceRequestCoverage는 제품과 같은 11×9 표본 규칙의 최초 사용 요청 검사야. 독립 가시 픽셀·최소 face mask 검증이 아니야.",
    "domeReadiness는 주 화면 돔 base/overlay의 draw 제출·프로그램 상태야. 큐브 내부 proxy 프로그램 검증과 달라.",
    "복원 검사는 실제로 만난 상태와 임시 wrapper에 한정돼. 강제 예외·비기본 XR/target 상태를 주입하지 않았어.",
    "completeMs/submitMs/completionWaitMs/times는 전부 집계 제외야. 계측 포함 진단값을 FPS나 성능 개선으로 쓰지 않아.",
    "PNG는 바이트 해시만 읽어. 디코딩·픽셀 지표·육안 검토·화질 판정은 하지 않아. viewport는 원본 선언값이야.",
    "manifest 전체 중 수집기가 HTTP 해시를 남긴 15개 경로만 직접 대조해. 다른 파일과 실제 실행 runner 바이트는 이 기록만으로 입증하지 못해.",
    "소스 SHA는 HTTP 원본의 해시야. 실행 main에는 fixture/suffix가 붙고 Three UUID 난수 경로도 분리돼. 원본 제품 그대로의 실행이라고 해석하지 않아.",
    "injectedMain.combinedSha256은 기록 형식만 확인해. 원본 소스 바이트가 포함되지 않아 결합 본문을 재계산하지 않아.",
]


class Incomplete(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ValueError(message)


def same(a, b, where="value"):
    """Boolean/type mismatches stay failures; only finite numbers get tolerance."""
    if type(a) in (int, float) and type(b) in (int, float):
        require(math.isfinite(a) and math.isfinite(b) and abs(a - b) <= 1e-8,
                f"{where}: {a!r} != {b!r}")
    elif isinstance(a, dict) and isinstance(b, dict):
        require(a.keys() == b.keys(), f"{where}: keys differ")
        for key in a:
            same(a[key], b[key], f"{where}.{key}")
    elif isinstance(a, list) and isinstance(b, list):
        require(len(a) == len(b), f"{where}: length differs")
        for index, (x, y) in enumerate(zip(a, b)):
            same(x, y, f"{where}[{index}]")
    else:
        require(type(a) is type(b) and a == b, f"{where}: {a!r} != {b!r}")


def status(checks):
    values = [x["status"] for x in checks]
    return "FAIL" if "FAIL" in values else "INCOMPLETE" if "INCOMPLETE" in values else "PASS"


def checked(checks, name, operation):
    try:
        value = operation()
        checks.append({"name": name, "status": "PASS"})
        return value
    except Incomplete as error:
        checks.append({"name": name, "status": "INCOMPLETE", "reason": str(error)})
    except (ValueError, KeyError, TypeError, IndexError, AttributeError, OverflowError, OSError) as error:
        checks.append({"name": name, "status": "FAIL", "reason": str(error)})
    return None


def digest(path):
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
            size += len(block)
    return {"path": str(path.resolve()), "bytes": size, "sha256": h.hexdigest()}


class Inputs:
    def __init__(self):
        self.files = {}

    def note(self, path, stable=True):
        path = path.resolve()
        if not path.is_file():
            raise Incomplete(f"Missing file: {path}")
        item = digest(path)
        item["closedInput"] = stable
        previous = self.files.get(str(path))
        if previous and previous["closedInput"]:
            same(item["sha256"], previous["sha256"], f"Input changed while reading: {path}")
        self.files[str(path)] = item
        return item

    def read_json(self, path, partial=False):
        item = self.note(path, not partial)
        try:
            data = path.read_bytes()
            actual = hashlib.sha256(data).hexdigest()
            if partial and actual != item["sha256"]:
                raise Incomplete(f"Unclosed JSON changed while reading: {path}")
            same(actual, item["sha256"], f"JSON read race: {path}")
            return json.loads(data)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            if partial:
                raise Incomplete(f"Unclosed/partial JSON: {path}: {error}") from error
            raise ValueError(f"Invalid closed JSON: {path}: {error}") from error

    def recheck(self):
        for item in list(self.files.values()):
            if item["closedInput"]:
                current = digest(Path(item["path"]))
                same(current["sha256"], item["sha256"], f"Closed input changed: {item['path']}")
                same(current["bytes"], item["bytes"], f"Closed input size: {item['path']}")


def within(root, relative):
    path = (root / relative).resolve()
    require(path.is_relative_to(root), f"Path escapes input root: {relative}")
    return path


def tool_hashes(inputs):
    folder = Path(__file__).resolve().parent
    hashes = {key: inputs.note(folder / name)["sha256"] for key, name in TOOL_NAMES.items()}
    source = (folder / TOOL_NAMES["collector"]).read_text(encoding="utf-8")
    start, end = "function installDomeMotion() {", "\nconst suffix ="
    require(source.count(start) == 1 and source.count(end) == 1, "Frozen suffix source boundary changed")
    body = source[source.index(start):source.index(end)]
    require(body.endswith("}"), "Unexpected suffix serialization boundary")
    hashes["suffix"] = hashlib.sha256(("\n;(" + body + ")();\n").encode()).hexdigest()
    return hashes


def run_side(label):
    return next((side for side in ("baseline", "candidate")
                 if label == side or label.startswith(side + "-")), None)


def normalize_root_url(value):
    # Browser URL serialization adds '/' to an empty root path. Do not trim
    # non-root paths or change hosts, ports, queries or fragments.
    parts = urlsplit(value)
    return parts._replace(path=parts.path or "/").geturl()


def read_plan(inputs, path, manifest, job_ids=None):
    plan = inputs.read_json(path)
    require(isinstance(plan, list) and plan, "Expected a nonempty original job plan")
    require(all(isinstance(job, dict) and isinstance(job.get("id"), str) for job in plan),
            "Every original plan job needs an id")
    original_ids = [job["id"] for job in plan]
    require(len(set(original_ids)) == len(original_ids), "Duplicate job id in original plan")
    if job_ids is None:
        require(len(plan) == 4, "Exactly four A/B high/medium jobs are required")
        selected = list(enumerate(plan))
    else:
        require(job_ids and len(set(job_ids)) == len(job_ids), "Empty or duplicate --job-ids selection")
        missing = sorted(set(job_ids) - set(original_ids))
        require(not missing, "Unknown selected job id: " + ", ".join(missing))
        # Keep original ordering and indices: logs bind both the full plan SHA
        # and each job's original index, even when only one quality is selected.
        wanted = set(job_ids)
        selected = [(index, job) for index, job in enumerate(plan) if job["id"] in wanted]
    seen = set()
    for _, job in selected:
        require(job["script"] == "tools/bench/dome-motion.mjs", "Unexpected collector in plan")
        require(len(job["args"]) == 2, "Expected [label, high|medium]")
        label, quality = job["args"]
        require(re.fullmatch(r"[A-Za-z0-9._-]+", label) is not None, "Unsafe run label")
        require(re.fullmatch(r"[A-Za-z0-9_-]+", job["id"]) is not None, "Unsafe job id")
        require(quality in ("high", "medium"), "Only high and medium are comparable here")
        side = run_side(label)
        require(side is not None, "Run label must be baseline/candidate or start baseline-/candidate-")
        require((side, quality) not in seen, "Duplicate A/B quality job")
        require(job["env"]["REVISION"] == manifest[side], "Plan revision differs from manifest")
        require(job["env"].get("SCREENSHOTS", "1") == "1", "15 screenshots per run are required")
        seen.add((side, quality))
    for quality in {quality for _, quality in seen}:
        require({side for side, value in seen if value == quality} == {"baseline", "candidate"},
                f"Selected {quality} requires both baseline and candidate jobs")
    return selected


def manifest_index(manifest):
    for side in ("baseline", "candidate"):
        require(re.fullmatch(r"[a-f0-9]{40}", manifest[side]) is not None, "Invalid manifest revision")
    files = manifest["files"]
    by_path = {entry["path"]: entry for entry in files}
    require(len(by_path) == len(files), "Duplicate manifest paths")
    for name in SOURCE_NAMES:
        require("public/" + name in by_path, f"Manifest lacks served source: {name}")
        for side in ("baseline", "candidate"):
            value = by_path["public/" + name][side + "Sha256"]
            require(value is None or re.fullmatch(r"[a-f0-9]{64}", value), "Invalid manifest SHA")
    return by_path


def phase(raw, name):
    return raw["rotation"] if name == "rotation" else raw["transitions"][name]


def rows(raw):
    return [(name, row) for name in PHASES for row in phase(raw, name)["samples"]]


def expected_quality(raw, job):
    quality = job["args"][1]
    dpr = raw["devicePixelRatio"]
    require(type(dpr) in (int, float) and math.isfinite(dpr) and dpr > 0, "Invalid raw DPR")
    return {"quality": quality, "settingsQuality": quality, "renderScale": 1,
            "pixelRatio": min(dpr, 1.5) if quality == "high" else min(dpr, 1.25) * .85,
            "cubeSize": 640 if quality == "high" else 512}


def verify_quality(raw, job):
    expected = expected_quality(raw, job)
    same(raw["requestedQuality"], expected, "Node requestedQuality")
    same(raw["meta"]["viewport"], raw["viewport"], "Viewport")
    for key, actual in (("WIDTH", raw["viewport"][0]), ("HEIGHT", raw["viewport"][1]),
                        ("DPR", raw["devicePixelRatio"])):
        if key in job["env"]:
            same(actual, float(job["env"][key]), f"Requested {key}")
    observations = [raw["meta"], raw["rotation"]["initial"]] + raw["warmupSamples"]
    observations += [raw["transitions"][name]["initial"]["state"] for name in PHASES[1:]]
    observations += [row[key] for _, row in rows(raw) for key in ("input", "sample", "output")]
    for index, observed in enumerate(observations):
        same({key: observed[key] for key in expected if key != "cubeSize"},
             {key: value for key, value in expected.items() if key != "cubeSize"}, f"Quality {index}")
        same(observed["requestedQualityCheck"]["status"], "PASS", "Recorded quality check")
        same(observed["requestedQualityCheck"]["expected"], expected, "Recorded expected quality")
    for _, row in rows(raw):
        for request in row["cubeUpdateRequests"]:
            same([request["width"], request["height"]], [expected["cubeSize"]] * 2, "Cube request size")
    return {"observations": len(observations), "expected": expected}


def verify_sources(raw, side, by_path, tools):
    same(raw["sourceConsistency"], "PASS", "Source consistency")
    same(raw["sourceHashes"], raw["sourceHashesAfter"], "Served source before/after")
    same(sorted(raw["sourceHashes"]), sorted(SOURCE_NAMES), "Served source path set")
    for name, observed in raw["sourceHashes"].items():
        expected = by_path["public/" + name][side + "Sha256"]
        same(observed, {"sha256": expected} if expected else {"httpStatus": 404}, f"Manifest {name}")
    same(raw["toolSources"], tools, "Recorded tools vs local frozen files")
    same(raw["toolSourcesAfter"], tools, "Tool source after")
    injected = raw["injectedMain"]
    same(injected["originalSha256"], raw["sourceHashes"]["js/main.js"]["sha256"], "Injected main original")
    for key in ("fixture", "suffix"):
        same(injected[key + "Sha256"], tools[key], f"Injected {key}")
    require(re.fullmatch(r"[a-f0-9]{64}", injected["combinedSha256"]) is not None,
            "Invalid recorded combined main SHA")


def verify_closed(raw, log, job, side, manifest):
    if raw.get("status") in ("RUNNING", "PREPARING", "NOT_RUN") or log.get("status") == "RUNNING":
        raise Incomplete("Run is not closed; it is excluded even if partial checks passed")
    require(raw.get("status") == "PASS" and log.get("status") == "PASS" and log.get("exitCode") == 0,
            f"Reported run result: raw={raw.get('status')}, log={log.get('status')}, exit={log.get('exitCode')}")
    require(raw["schema"] == 2 and raw["suite"] == "sphere-dome-motion-controlled", "Unexpected raw schema/suite")
    same([raw["label"], raw["quality"]], job["args"], "Raw label/quality")
    same(raw["revision"], manifest[side], "Raw revision")
    same(normalize_root_url(raw["baseURL"]), normalize_root_url(job["env"]["BASE_URL"]), "Raw URL")
    same([raw["venue"], raw["device"]], ["sphere", "desktop"], "Raw venue/device")
    require(raw["finishedAt"] and log["finishedAt"], "Missing completion timestamp")
    same(raw["timedOut"], False, "Timeout")
    same(raw["browserClose"]["status"], "CLOSED", "Browser close")
    same(raw["failures"], [], "Raw failures")
    for key in ("pageErrors", "consoleErrors", "failedRequests"):
        same(raw["diagnostics"][key], [], "Browser diagnostics " + key)
    require(raw["fixture"]["lite"] is False and raw["fixture"]["piece"] == "beethoven-ode-to-joy",
            "Expected full Beethoven fixture")
    scene = raw["fixture"]["sceneState"]
    same(scene["phase"], "playing", "Scene phase")
    for key in ("asleep", "interval", "recital", "practice"):
        same(scene[key], False, "Scene " + key)
    same(scene["audienceVisible"], True, "Audience visibility")
    same(raw["initialReadiness"]["status"], "READY", "Initial readiness")
    same(raw["initialReadiness"]["uiReady"], True, "Initial UI")
    same(raw["initialReadiness"]["domeVisible"], True, "Initial dome")


def verify_shape(raw, job):
    warmup = int(job["env"].get("WARMUP", 4))
    require(warmup > 0, "Invalid warmup count")
    same(raw["warmupFrames"], warmup, "Requested warmup")
    same(len(raw["warmupSamples"]), warmup, "Warmup samples")
    for key, value in {"rotationFrames": 28, "animationDt": 1 / 60, "yawSpanRadians": math.tau,
                       "transitionSeconds": 4, "checkpoints": list(FRACTIONS), "checkpointPasses": 4}.items():
        same(raw["policy"][key], value, "Policy " + key)
    for name in PHASES:
        run = phase(raw, name)
        same(run["status"], "PASS", name + " status")
        same(len(run["samples"]), 28 if name == "rotation" else 20, name + " count")
        for index, row in enumerate(run["samples"]):
            same(row["status"], "PASS", name + " sample status")
            same(row["failures"], [], name + " failures")
            same(row["exceptions"], [], name + " exceptions")
            same(row["output"]["wallTime"] - row["input"]["wallTime"], 1 / 60, "Animation dt")
            if name == "rotation":
                same(row["rotation"], {"index": index, "nominalYawRadians": index * math.tau / 27,
                                       "fixedDt": 1 / 60}, "Rotation input")
                same([row["output"][k] for k in ("current", "a", "mix", "overlayVisible")],
                     ["FOREST3D", 16, 0, False], "Settled rotation world")
                same(row["input"]["musicTime"], 25 + index / 60, "Rotation music input")
                same(row["output"]["wallTime"], 20 + (index + 1) / 60, "Rotation wall time")
                world_ids = [16]
            else:
                fraction = FRACTIONS[index // 4]
                source, target = ("ARCH", "FOREST3D") if name == "reveal" else ("FOREST3D", "PEAKS3D")
                a, b = (0, 16) if name == "reveal" else (16, 19)
                mix = 0 if fraction == 1 else 2 * fraction ** 2 if fraction < .5 else 1 - (-2 * fraction + 2) ** 2 / 2
                expected = {"a": b if fraction == 1 else a, "b": b, "mix": mix,
                            "reveal": int(name == "reveal" and fraction < 1), "overlayVisible": 0 < fraction < 1}
                same(row["transition"], {"kind": name, "from": source, "to": target,
                                         "elapsed": 4 * fraction, "duration": 4, "fraction": fraction}, "Transition input")
                same(row["checkpointPass"], index % 4, "Checkpoint pass")
                same(row["expected"], expected, "Independent transition expectation")
                same({k: row["output"][k] for k in expected}, expected, "Transition output")
                same(row["output"]["current"], target, "Transition current world")
                same(row["output"]["domeTime"], 20 + 4 * fraction, "Transition dome time")
                same(row["input"]["musicTime"], 25 + 4 * fraction, "Transition music input")
                world_ids = [b] if fraction == 1 or name == "reveal" else [a, b]
            same(sorted(slot["worldId"] for slot in row["output"]["slots"] if slot["worldId"] >= 16),
                 world_ids, name + " active cube worlds")
            same([slot["slot"] for slot in row["output"]["slots"]], ["A", "B"], "Cube slot roles")
            for slot in row["output"]["slots"]:
                if slot["worldId"] < 16:
                    same([slot["worldId"], slot["texture"], slot["target"]], [-1, None, None], "Released cube slot")
        if name != "rotation":
            same(len(run["checkpoints"]), 5, name + " checkpoint count")
            for index, checkpoint in enumerate(run["checkpoints"]):
                same(checkpoint, {"fraction": FRACTIONS[index], "status": "PASS",
                                  "sampleIndices": list(range(index * 4, index * 4 + 4)),
                                  "bothSlotsRequestedAtSampledTime": True}, "Checkpoint")
                last = run["samples"][index * 4 + 3]
                for face in last["faceRequestCoverage"]:
                    same(face["lastUpdateRequest"]["globalWorldTime"], last["output"]["domeTime"], "Last-pass request time")
    same([row["serial"] for _, row in rows(raw)], list(range(68)), "Sample serials")
    initial = raw["rotation"]["samples"][0]["demandedFaces"]
    union = sorted({face for row in raw["rotation"]["samples"] for face in row["demandedFaces"]})
    added = [face for face in union if face not in initial]
    require(added, "Rotation did not exercise newly demanded faces")
    same(raw["rotation"]["faceCoverage"], {"initial": initial, "union": union, "newlyDemanded": added}, "Face rule coverage")


def verify_calls(raw):
    targets, textures, previous = {}, {}, {}
    for name, row in rows(raw):
        require(isinstance(row["demandedFaces"], list) and len(set(row["demandedFaces"])) == len(row["demandedFaces"]), "Duplicate demanded face")
        require(all(type(f) is int and f in (0, 1, 2, 4, 5) for f in row["demandedFaces"]), "Invalid demanded face")
        for request in row["cubeUpdateRequests"]:
            require(type(request["world"]) is int and request["world"] in range(4), "Invalid cube world")
            require(type(request["face"]) is int and request["face"] in (0, 1, 2, 4, 5), "Invalid cube face")
            same(request["worldName"], WORLD_NAMES[request["world"]], "Cube world name")
            same(request["returnedNormally"], True, "Cube renderer normal return")
            require(request["target"] and request["texture"], "Missing target/texture identity")
            same(targets.setdefault(request["target"], request["texture"]), request["texture"], "Target texture reuse")
            same(textures.setdefault(request["texture"], request["target"]), request["target"], "Texture target identity")
            previous[(request["target"], request["world"], request["epoch"], request["face"])] = {
                "world": request["world"], "epoch": request["epoch"], "serial": row["serial"],
                "elapsedWorldTime": request["elapsedWorldTime"], "globalWorldTime": request["globalWorldTime"]}
        expected_coverage = [(slot, face) for slot in row["output"]["slots"] if slot["worldId"] >= 16 for face in row["demandedFaces"]]
        same(len(row["faceRequestCoverage"]), len(expected_coverage), "Face request count")
        for observed, (slot, face) in zip(row["faceRequestCoverage"], expected_coverage):
            same([observed[k] for k in ("slot", "target", "worldId", "face", "valid")],
                 [slot["slot"], slot["target"], slot["worldId"], face, True], "Face request coverage")
            require(slot["target"] in targets, "Unobserved active target")
            same(targets[slot["target"]], slot["texture"], "Active texture binding")
            record = observed["lastUpdateRequest"]
            key = (slot["target"], slot["worldId"] - 16, record["epoch"], face)
            require(key in previous, "Coverage has no recorded normally returned request")
            same(record, previous[key], "Last request provenance")
        for key in ("calls", "triangles"):
            value = row["sample"][key]
            require(type(value) is int and value >= 0, f"Invalid renderer {key}")
    require(len(targets) == 2 and len(textures) == 2, "Expected exactly two observed reusable targets/textures")
    inventory = raw["targetInventory"]
    require(len(inventory) == 2, "Expected two final target inventory records")
    same({x["target"]: x["texture"] for x in inventory}, targets, "Final target inventory")
    same(raw["finalProbe"]["inventory"], inventory, "Final probe inventory")


def verify_restoration(raw):
    state_keys = ("target", "face", "mip", "xr", "viewport", "scissor", "scissorTest")
    for _, row in rows(raw):
        same(row["hooks"], dict.fromkeys(("rendererOwned", "worldsOwned", "updateOwned", "restored"), True), "Probe ownership/restoration")
        require(row["worldCalls"], "No drawWorlds call observed")
        for call in row["worldCalls"]:
            require(not call.get("exception"), "drawWorlds exception")
            same(call["restored"], True, "Reported state restoration")
            same({k: call["before"][k] for k in state_keys}, {k: call["after"][k] for k in state_keys}, "Observed renderer state")
        same(row["glErrorAfterInspection"], 0, "Post-inspection GL error")
        same(row["contextLost"], False, "Post-inspection context")
    for sample in raw["warmupSamples"] + [row["sample"] for _, row in rows(raw)]:
        same(sample["glError"], 0, "Sample GL error")
        same(sample["contextLost"], False, "Sample context")
        same(sample["completed"], True, "Render completion probe")
        same(sample["visibility"], "visible", "Page visibility")
        same(sample["asleep"], False, "Awake fixture")


def verify_readiness(raw):
    for record in [raw["warmupReadiness"]] + [row["domeReadiness"] for _, row in rows(raw)]:
        same(record["status"], "VERIFIED", "Dome readiness")
        same(record["failures"], [], "Readiness failures")
        same(record["contextLost"], False, "Readiness GL context")
        same(record["path"], "two-pass", "Dome path")
        same([role["role"] for role in record["roles"]], ["base", "overlay"], "Dome roles")
        for role in record["roles"]:
            if role["required"]:
                require(role["visible"] is True and role["mainCameraDraws"] > 0, "Required dome role did not draw")
            if role["mainCameraDraws"] > 0:
                program = role["program"]
                same([program["status"], program["ready"], program["linked"]], ["VERIFIED", True, True], "Drawn dome program")
                require(program["diagnosticsRunnable"] is not False, "Program diagnostics failed")


def condition(snapshot):
    fields = ("current", "visible", "overlayVisible", "a", "b", "mix", "reveal", "domeTime", "live",
              "musicTime", "wallTime", "quality", "settingsQuality", "renderScale", "pixelRatio", "camera")
    result = {key: snapshot[key] for key in fields}
    result["activeCubeWorlds"] = sorted(slot["worldId"] for slot in snapshot["slots"] if slot["worldId"] >= 16)
    return result


def image_condition(raw, name):
    kind, number = name.rsplit("-", 1)
    index = int(number) if kind == "rotation" else FRACTIONS.index(int(number) / 100) * 4 + 3
    row = phase(raw, kind)["samples"][index]
    return {"phase": kind, "serial": row["serial"], "sampleIndex": index, "viewport": raw["viewport"],
            "devicePixelRatio": raw["devicePixelRatio"], "requestedQuality": raw["requestedQuality"],
            "piece": raw["fixture"]["piece"], "fixture": raw["fixture"], "input": condition(row["input"]),
            "output": condition(row["output"]), "checkpointPass": row.get("checkpointPass"),
            "rotation": row.get("rotation"), "transition": row.get("transition")}


def verify_images(inputs, raw, directory, stem, images):
    """Keep the other fourteen file records even when one checkpoint is missing."""
    checks = []
    entries = raw.get("screenshotsSaved", [])
    def verify_names():
        same(raw["screenshots"], True, "Screenshots enabled")
        names = [entry["name"] for entry in entries]
        require(len(names) == len(set(names)), "Duplicate screenshot name")
        require(set(names) <= set(IMAGE_NAMES) | {"failure"}, "Unexpected screenshot name")
        if raw.get("status") == "PASS":
            require("failure" not in names, "PASS raw includes failure screenshot")
    checked(checks, "pngNames", verify_names)
    for name in IMAGE_NAMES:
        file = directory / f"{stem}-{name}.png"
        image = images.setdefault(name, {"path": str(file), "status": "INCOMPLETE"})
        def verify_one():
            entry = next((entry for entry in entries if entry.get("name") == name), None)
            if entry is None:
                raise Incomplete("No recorded screenshot for " + name)
            image["recorded"] = entry
            same(entry["file"], file.name, "Screenshot filename")
            item = inputs.note(file)
            image["file"] = item
            same(item["sha256"], entry["sha256"], "Screenshot SHA " + name)
            same(item["bytes"], entry["bytes"], "Screenshot bytes " + name)
            image["condition"] = image_condition(raw, name)
        checked(checks, name, verify_one)
        image["status"] = checks[-1]["status"]
        if "reason" in checks[-1]:
            image["reason"] = checks[-1]["reason"]
    failed = next((c for c in checks if c["status"] == "FAIL"), None)
    missing = next((c for c in checks if c["status"] == "INCOMPLETE"), None)
    if failed:
        raise ValueError(failed["reason"])
    if missing:
        raise Incomplete(missing["reason"])


def audit_run(inputs, root, index, job, manifest, by_path, tools, plan_sha):
    label, quality = job["args"]
    side = run_side(label)
    stem = f"{label}-dome-motion-sphere-{quality}-desktop"
    directory = within(root, job["directory"])
    raw_path = directory / (stem + ".json")
    log_path = root / "logs" / f"{index:03d}-{job['id']}.json"
    log_text = log_path.with_suffix(".log")
    report = {"id": job["id"], "index": index, "side": side, "quality": quality,
              "rawPath": str(raw_path), "runPlanRecord": str(log_path), "logPath": str(log_text), "checks": [], "images": {}}
    report["images"] = {name: {"path": str(directory / f"{stem}-{name}.png"), "status": "INCOMPLETE"} for name in IMAGE_NAMES}
    checks = report["checks"]
    log = checked(checks, "runPlanRecord", lambda: inputs.read_json(log_path, partial=True))
    closed = bool(log and log.get("status") in ("PASS", "FAIL"))
    if closed:
        inputs.files[str(log_path.resolve())]["closedInput"] = True
    raw = checked(checks, "rawJSON", lambda: inputs.read_json(raw_path, partial=not closed))
    if raw:
        report["reportedRawStatus"] = raw.get("status")
        report["reportedFailures"] = raw.get("failures", [])
        report["sourceEvidence"] = {key: raw.get(key) for key in ("sourceHashes", "sourceHashesAfter", "toolSources", "toolSourcesAfter", "injectedMain")}
        report["warnings"] = raw.get("diagnostics", {}).get("warnings", [])
        report["observedSampleCounts"] = {name: len((raw.get("rotation", {}) if name == "rotation" else raw.get("transitions", {}).get(name, {})).get("samples", [])) for name in PHASES}
        if raw.get("status") == "FAIL":
            checks.append({"name": "reportedRawFailure", "status": "FAIL", "reason": "Collector explicitly recorded FAIL; preserved without reclassification"})
        if raw.get("status") not in ("PASS", "FAIL"):
            inputs.files[str(raw_path.resolve())]["closedInput"] = False
    if log:
        report["reportedLogStatus"] = log.get("status")
        report["exitCode"] = log.get("exitCode")
        if log.get("status") == "FAIL" or log.get("exitCode") not in (None, 0):
            checks.append({"name": "reportedProcessFailure", "status": "FAIL", "reason": f"run-plan recorded {log.get('status')}, exit={log.get('exitCode')}"})
        def verify_log():
            same(log["job"], job, "Logged plan job")
            same(log["index"], index, "Logged job index")
            same(log["planSha256"], plan_sha, "Logged plan SHA")
            same(log["collectorSha256"], tools["collector"], "Logged collector SHA")
            command = log["command"]
            require(len(command) == 4 and command[0] == "node" and Path(command[1]).as_posix().endswith("/tools/bench/dome-motion.mjs"), "Unexpected logged command")
            same(command[2:], job["args"], "Logged command args")
            report["executionCollectorPath"] = command[1]
            item = inputs.note(log_text, stable=closed)
            if not closed:
                raise Incomplete("run-plan log is still RUNNING; text hash is only a snapshot")
            same(log["logSha256"], item["sha256"], "Run-plan stdout/stderr SHA")
        checked(checks, "planAndLogSHA", verify_log)
    if raw and log:
        checked(checks, "closedResult", lambda: verify_closed(raw, log, job, side, manifest))
    if raw and closed and raw.get("status") in ("PASS", "FAIL"):
        checked(checks, "sourceAndToolSHA", lambda: verify_sources(raw, side, by_path, tools))
        checked(checks, "samplesAndEndpoints", lambda: verify_shape(raw, job))
        report["qualityEvidence"] = checked(checks, "requestedQuality", lambda: verify_quality(raw, job))
        checked(checks, "requestsAndTargets", lambda: verify_calls(raw))
        checked(checks, "restorationAndGL", lambda: verify_restoration(raw))
        checked(checks, "domeDrawAndPrograms", lambda: verify_readiness(raw))
    if raw:
        checked(checks, "pngFiles", lambda: verify_images(inputs, raw, directory, stem, report["images"]))
    report["status"] = status(checks)
    return report, raw


def compare_conditions(a, b):
    for key in ("venue", "device", "quality", "viewport", "devicePixelRatio", "fixture", "policy", "requestedQuality",
                "warmupFrames", "toolSources", "environment", "meta"):
        same(a[key], b[key], "A/B " + key)
    for name in PHASES:
        ra, rb = phase(a, name), phase(b, name)
        same(condition(ra["initial"] if name == "rotation" else ra["initial"]["state"]),
             condition(rb["initial"] if name == "rotation" else rb["initial"]["state"]), "A/B initial " + name)
        for index, (x, y) in enumerate(zip(ra["samples"], rb["samples"])):
            for field in ("input", "output"):
                same(condition(x[field]), condition(y[field]), f"A/B {name}[{index}] {field}")
            for field in (("rotation",) if name == "rotation" else ("transition", "expected", "checkpointPass")):
                same(x[field], y[field], f"A/B {name}[{index}] {field}")


def counts(raw):
    return {name: {"samples": len(phase(raw, name)["samples"]),
                   "rendererCalls": sum(row["sample"]["calls"] for row in phase(raw, name)["samples"]),
                   "rendererTriangles": sum(row["sample"]["triangles"] for row in phase(raw, name)["samples"]),
                   "cubeUpdateRequests": sum(len(row["cubeUpdateRequests"]) for row in phase(raw, name)["samples"]),
                   "worldCalls": sum(len(row["worldCalls"]) for row in phase(raw, name)["samples"]),
                   "observedTargets": len({r["target"] for row in phase(raw, name)["samples"] for r in row["cubeUpdateRequests"]}),
                   "requestScope": "renderer.render normal return only; not pixels"} for name in PHASES}


def make_pairs(reports, raws, qualities=("high", "medium")):
    pairs, images = [], []
    for quality in qualities:
        selected = {r["side"]: r for r in reports if r["quality"] == quality}
        pair = {"quality": quality, "checks": [], "eligible": False}
        a, b = selected.get("baseline"), selected.get("candidate")
        if not a or not b:
            pair["checks"].append({"name": "closedRuns", "status": "INCOMPLETE", "reason": "Missing A/B run"})
        elif a["status"] != "PASS" or b["status"] != "PASS":
            pair["checks"].append({"name": "closedRuns", "status": "FAIL" if "FAIL" in (a["status"], b["status"]) else "INCOMPLETE", "reason": "A/B run checks are not both PASS"})
        else:
            checked(pair["checks"], "identicalInputs", lambda: compare_conditions(raws[a["id"]], raws[b["id"]]))
        pair["status"] = status(pair["checks"])
        pair["eligible"] = pair["status"] == "PASS"
        if pair["eligible"]:
            pair["operationCounts"] = {side: counts(raws[report["id"]]) for side, report in selected.items()}
        for name in IMAGE_NAMES:
            image = {"quality": quality, "name": name, "eligible": pair["eligible"],
                     "pairStatus": pair["status"], "pixelEvaluation": "NOT_PERFORMED"}
            for side, run in (("baseline", a), ("candidate", b)):
                image[side] = run["images"].get(name, {"status": "INCOMPLETE", "reason": "No validated PNG/condition record"}) if run else {"status": "INCOMPLETE"}
            images.append(image)
        pairs.append(pair)
    return pairs, images


def markdown(summary):
    lines = ["# Sphere 돔 회전·전환 파일 대조", "", f"상태: **{summary['status']}**. 파일과 관측 기록의 검증 결과야.", "",
             "선택한 품질: " + ", ".join(summary.get("selectedQualities", [])) + ". 원본 계획의 index와 전체 SHA를 사용했어.", "",
             "## 실행별 검증", "", "| 실행 | 원본/로그 | 종합 | 품질 | 호출/타깃 | 복원/GL | 돔 draw/program | PNG |",
             "|---|---|---|---|---|---|---|---|"]
    for run in summary["runs"]:
        checks = {x["name"]: x["status"] for x in run["checks"]}
        fields = [checks.get(k, "NOT_CHECKED") for k in ("requestedQuality", "requestsAndTargets", "restorationAndGL", "domeDrawAndPrograms", "pngFiles")]
        lines.append(f"| {run['id']} | {run.get('reportedRawStatus', 'MISSING')}/{run.get('reportedLogStatus', 'MISSING')} | {run['status']} | " + " | ".join(fields) + " |")
    lines += ["", "## 같은 입력의 호출 수", "", "숫자는 각 단계 전체의 호출/삼각형 합계야. 시간·FPS·성능 개선율은 계산하지 않았어.", "",
              "| 품질 | 단계 | 표본 A/B | renderer 호출 A/B | 삼각형 A/B | cube 요청 A/B | 관측 타깃 A/B |",
              "|---|---|---|---|---|---|---|"]
    for pair in summary["pairs"]:
        if not pair["eligible"]:
            lines.append(f"| {pair['quality']} | 비교 제외: {pair['status']} | — | — | — | — | — |")
            continue
        for name in PHASES:
            a, b = (pair["operationCounts"][side][name] for side in ("baseline", "candidate"))
            fields = [f"{a[key]} / {b[key]}" for key in ("samples", "rendererCalls", "rendererTriangles", "cubeUpdateRequests", "observedTargets")]
            lines.append(f"| {pair['quality']} | {name} | " + " | ".join(fields) + " |")
    lines += ["", "## 실패·누락·진행 기록", ""]
    reasons = [("global", item) for item in summary["checks"] if item["status"] != "PASS"]
    reasons += [(r["id"], item) for r in summary["runs"] for item in r["checks"] if item["status"] != "PASS"]
    reasons += [(p["quality"], item) for p in summary["pairs"] for item in p["checks"] if item["status"] != "PASS"]
    lines += [f"- {owner} / {item['name']}: {item['status']} — {item.get('reason', '')}" for owner, item in reasons] or ["기록 검증에서 실패·누락을 찾지 못했어. 이것은 아래 미검증 범위의 성공 판정이 아니야."]
    lines += ["", "## 이미지와 출처", "", "품질별 15개 PNG 쌍의 절대 경로·SHA·카메라/음악/돔 조건은 image-pairs.json에 있어. 픽셀 평가는 하지 않았어.",
              "모든 입력 경로·바이트 수·SHA, 도구와 서버 소스 대조 범위는 summary.json의 provenance를 확인해.", "", "## 해석 한계", ""]
    lines += ["- " + text for text in LIMITS]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for flag in ("plan", "root", "manifest", "output"):
        parser.add_argument("--" + flag, required=True, type=Path)
    parser.add_argument("--job-ids", nargs="+", metavar="ID",
                        help="원본 계획에서 선택할 job id. 각 품질의 baseline/candidate를 모두 지정해.")
    args = parser.parse_args()
    root, output = args.root.resolve(), args.output.resolve()
    if output.exists():
        parser.error("--output already exists; choose a new directory (no overwrite)")
    inputs = Inputs()
    summary = {"schema": 1, "suite": "sphere-dome-motion-file-comparison", "createdAt": datetime.now(timezone.utc).isoformat(),
               "status": "INCOMPLETE", "checks": [], "runs": [], "pairs": [], "selectedQualities": [], "limitations": LIMITS,
               "ignoredTimingFields": ["completeMs", "submitMs", "completionWaitMs", "times"],
               "provenance": {"planPath": str(args.plan.resolve()), "rootPath": str(root), "manifestPath": str(args.manifest.resolve()),
                              "sourceVerification": "15 served paths against explicit manifest before/after", "runtimeRunnerSourceVerified": False}}
    checks, raws, images = summary["checks"], {}, []
    def prepare():
        require(root.is_dir(), "--root is not an existing run-plan output directory")
        manifest = inputs.read_json(args.manifest.resolve())
        by_path = manifest_index(manifest)
        tools = tool_hashes(inputs)
        selected = read_plan(inputs, args.plan.resolve(), manifest, args.job_ids)
        inputs.note(Path(__file__).resolve())
        summary["provenance"].update(toolSources=tools, revisions={s: manifest[s] for s in ("baseline", "candidate")},
            verifiedSourcePaths=["public/" + n for n in SOURCE_NAMES],
            manifestPathsNotServedHashed=sorted(set(by_path) - {"public/" + n for n in SOURCE_NAMES}))
        return selected, manifest, by_path, tools
    prepared = checked(checks, "planManifestAndLocalTools", prepare)
    if prepared:
        selected, manifest, by_path, tools = prepared
        plan_sha = inputs.files[str(args.plan.resolve())]["sha256"]
        summary["selectedQualities"] = [quality for quality in ("high", "medium")
                                        if any(job["args"][1] == quality for _, job in selected)]
        summary["provenance"]["planSelection"] = {
            "mode": "job-ids" if args.job_ids is not None else "legacy-four-jobs",
            "requestedJobIds": args.job_ids, "originalPlanSha256": plan_sha,
            "selectedJobs": [{"index": index, "id": job["id"]} for index, job in selected],
        }
        for index, job in selected:
            result = checked(checks, "runAudit:" + job["id"], lambda: audit_run(inputs, root, index, job, manifest, by_path, tools, plan_sha))
            if result:
                report, raw = result
                summary["runs"].append(report)
                raws[report["id"]] = raw
        summary["pairs"], images = make_pairs(summary["runs"], raws, summary["selectedQualities"])
    checked(checks, "closedInputHashesUnchanged", inputs.recheck)
    summary["status"] = status(checks + summary["runs"] + summary["pairs"])
    if status(checks) != "PASS":
        for pair in summary["pairs"]:
            pair["eligible"] = False
            pair.pop("operationCounts", None)
            pair["status"] = status(checks + [pair])
            pair["checks"].append({"name": "globalInputIntegrity", "status": status(checks)})
        for image in images:
            image["eligible"] = False
            image["pairStatus"] = summary["status"]
    summary["provenance"]["files"] = list(inputs.files.values())
    image_output = {"schema": 1, "status": summary["status"], "pixelEvaluation": "NOT_PERFORMED",
                    "selectedQualities": summary["selectedQualities"],
                    "expectedPairsPerQuality": 15, "comparisons": images, "limitations": LIMITS}
    output.mkdir(parents=True, exist_ok=False)
    for name, value in (("summary.json", summary), ("image-pairs.json", image_output)):
        with (output / name).open("x", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
    with (output / "summary.md").open("x", encoding="utf-8") as handle:
        handle.write(markdown(summary))
    print(json.dumps({"status": summary["status"], "output": str(output), "eligiblePairs": sum(p["eligible"] for p in summary["pairs"]),
                      "pixelEvaluation": "NOT_PERFORMED"}, ensure_ascii=False))
    return {"PASS": 0, "FAIL": 1, "INCOMPLETE": 2}[summary["status"]]


if __name__ == "__main__":
    sys.exit(main())
