#!/usr/bin/env python3
"""Prepare GitHub Git-data request bodies without changing Git or calling an API.

Run this only after the candidate repository and its evidence are final. The
output is outside the repository and qa-3f, so it cannot enter its own payload
or the preserved measurement originals. This script is intentionally stdlib-only.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone


BASELINE = "3f1655b0c035a630adbcfbf19582dd9363386f34"
CHUNK_SIZE = 1024 * 1024
REGULAR_MODES = {"100644", "100755"}
CREDENTIAL_NAMES = {
    ".env", ".npmrc", ".pypirc", ".netrc", "_netrc",
    "credentials", "credentials.json", "credentials.yaml", "credentials.yml",
    "secrets.json", "secrets.yaml", "secrets.yml",
    "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
    "service-account.json", "service_account.json",
}
CREDENTIAL_SUFFIXES = {".pem", ".p12", ".pfx", ".key", ".keystore"}


class PayloadError(Exception):
    """A source or output condition makes publication unsafe or ambiguous."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise PayloadError(message)


def inside(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def git(repo: Path, *args: str) -> bytes:
    # These commands only read the requested checkout. An inherited alternate
    # index/worktree must not silently select some other publication source.
    env = os.environ.copy()
    for name in (
        "GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE",
        "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    ):
        env.pop(name, None)
    env["GIT_OPTIONAL_LOCKS"] = "0"
    env["GIT_TERMINAL_PROMPT"] = "0"
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), *args], env=env, check=False,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise PayloadError(f"읽기 전용 git {args[0]}를 실행할 수 없어: {type(exc).__name__}") from exc
    require(result.returncode == 0, f"읽기 전용 git {args[0]} 실패: exit {result.returncode}")
    return result.stdout


def relative_name(raw: bytes) -> str:
    try:
        name = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise PayloadError("UTF-8로 표현할 수 없는 Git 경로가 있어.") from exc
    parts = name.split("/")
    require(bool(name) and not PurePosixPath(name).is_absolute(), "빈 경로나 절대 Git 경로를 거부해.")
    require(all(part not in {"", ".", ".."} for part in parts), f"상대 경로 탈출·정규화가 필요한 경로를 거부해: {name!r}")
    require("\\" not in name and not re.match(r"^[A-Za-z]:", name), f"플랫폼마다 해석이 달라지는 경로를 거부해: {name!r}")
    require(all(part.casefold() != ".git" for part in parts), f"Git 메타데이터는 게시하지 않아: {name!r}")
    require("\x00" not in name, "NUL이 있는 경로를 거부해.")
    return name


def nul_names(raw: bytes) -> set[str]:
    require(not raw or raw.endswith(b"\0"), "Git 경로 목록이 NUL로 끝나지 않아.")
    return {relative_name(part) for part in raw.split(b"\0") if part}


def credential_name(name: str) -> bool:
    parts = [part.casefold() for part in name.split("/")]
    leaf = parts[-1]
    return (
        leaf in CREDENTIAL_NAMES
        or leaf.startswith(".env.")
        or Path(leaf).suffix in CREDENTIAL_SUFFIXES
        or any(part in {".ssh", ".aws", ".azure", ".gnupg"} for part in parts)
    )


def check_untracked_name(name: str, tracked: set[str]) -> None:
    if name in tracked:
        return  # A tracked .gitignore remains a normal publication candidate.
    require(not any(part.startswith(".") for part in name.split("/")),
            f"숨긴 untracked 파일은 payload에 넣지 않아: {name!r}")
    require(not credential_name(name), f"자격 증명 파일명은 payload에 넣지 않아: {name!r}")


def source_path(repo: Path, name: str) -> Path | None:
    """Reject symlinks in every component, even when their target is missing."""
    current = repo
    parts = name.split("/")
    for index, part in enumerate(parts):
        current /= part
        try:
            info = current.lstat()
        except (FileNotFoundError, NotADirectoryError):
            return None
        require(not stat.S_ISLNK(info.st_mode), f"심볼릭 링크 경로를 거부해: {name!r}")
        if index < len(parts) - 1:
            if not stat.S_ISDIR(info.st_mode):
                return None
        else:
            require(stat.S_ISREG(info.st_mode), f"일반 파일이 아닌 게시 대상을 거부해: {name!r}")
    require(inside(current.resolve(strict=True), repo), f"저장소 밖 경로를 거부해: {name!r}")
    return current


def fingerprint(info: os.stat_result) -> tuple[int, ...]:
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def read_source(repo: Path, name: str, *, collect: bool = False) -> tuple[dict, bytes | None]:
    path = source_path(repo, name)
    require(path is not None, f"스캔 중 파일이 사라졌어: {name!r}")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise PayloadError(f"게시 대상 파일을 안전하게 열 수 없어: {name!r}") from exc
    with os.fdopen(fd, "rb") as handle:
        initial = os.fstat(handle.fileno())
        require(stat.S_ISREG(initial.st_mode), f"일반 파일이 아니야: {name!r}")
        blob = hashlib.sha1(b"blob " + str(initial.st_size).encode("ascii") + b"\0")
        digest = hashlib.sha256()
        count = 0
        chunks = [] if collect else None
        while chunk := handle.read(CHUNK_SIZE):
            blob.update(chunk)
            digest.update(chunk)
            count += len(chunk)
            if chunks is not None:
                chunks.append(chunk)
        final = os.fstat(handle.fileno())
    checked = source_path(repo, name)
    require(checked is not None, f"스캔 중 파일이 사라졌어: {name!r}")
    require(count == initial.st_size and fingerprint(initial) == fingerprint(final)
            and fingerprint(initial) == fingerprint(checked.lstat()),
            f"읽는 동안 파일이 바뀌었어. 최종 파일을 고정한 뒤 다시 실행해: {name!r}")
    return {
        "bytes": count, "gitBlobSha": blob.hexdigest(), "sha256": digest.hexdigest(),
        "fingerprint": fingerprint(initial),
    }, b"".join(chunks) if chunks is not None else None


def file_digest(path: Path) -> dict:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while chunk := handle.read(CHUNK_SIZE):
            digest.update(chunk)
            size += len(chunk)
    return {"sha256": digest.hexdigest(), "bytes": size}


def write_json(root: Path, name: str, value: object) -> dict:
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")
    return {"file": name, **file_digest(target)}


def utf8_text(data: bytes) -> str | None:
    try:
        text = data.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return None
    # Preserve BOMs, CRLFs and all original bytes; do not use utf-8-sig or
    # newline translation. Control-containing UTF-8 data uses a binary blob.
    if any(ord(char) < 32 and char not in "\t\n\r" for char in text) or "\x7f" in text:
        return None
    require(text.encode("utf-8") == data, "UTF-8 왕복 변환이 원본 바이트와 달라.")
    return text


def baseline_entries(repo: Path) -> tuple[str, dict]:
    commit = git(repo, "rev-parse", "--verify", f"{BASELINE}^{{commit}}").decode("ascii").strip()
    require(commit == BASELINE, "요청한 3f 기준 커밋을 찾지 못했어.")
    tree = git(repo, "rev-parse", "--verify", f"{BASELINE}^{{tree}}").decode("ascii").strip()
    require(bool(re.fullmatch(r"[0-9a-f]{40}", tree)), "기준 Git tree SHA 형식이 잘못됐어.")
    raw = git(repo, "ls-tree", "-rz", "-r", "--full-tree", BASELINE)
    require(not raw or raw.endswith(b"\0"), "기준 tree 목록이 NUL로 끝나지 않아.")
    entries = {}
    for row in raw.split(b"\0"):
        if not row:
            continue
        header, path_bytes = row.split(b"\t", 1)
        mode, kind, sha = header.decode("ascii").split(" ")
        name = relative_name(path_bytes)
        require(name not in entries, f"기준 tree 경로가 중복됐어: {name!r}")
        require(kind == "blob" and mode in REGULAR_MODES,
                f"기준 tree의 symlink/submodule/비정규 항목은 지원하지 않아: {name!r}")
        require(bool(re.fullmatch(r"[0-9a-f]{40}", sha)), f"기준 blob SHA 형식이 잘못됐어: {name!r}")
        entries[name] = {"mode": mode, "sha": sha}
    return tree, entries


def build(repo: Path, output: Path, script: Path) -> dict:
    qa_root = script.parent.resolve()
    require(repo.is_dir(), "저장소 디렉터리가 없어.")
    require(not inside(output, repo) and not inside(repo, output), "출력 경로와 저장소 경로가 겹치면 안 돼.")
    require(not inside(output, qa_root) and not inside(qa_root, output), "출력은 qa-3f 원본 자료 밖에 둬야 해.")
    require(not output.is_symlink(), "출력 디렉터리의 심볼릭 링크를 거부해.")
    if output.exists():
        require(output.is_dir() and not any(output.iterdir()), "기존 비어 있지 않은 출력은 덮어쓰지 않아.")
    actual_root = Path(os.fsdecode(git(repo, "rev-parse", "--show-toplevel").rstrip(b"\n"))).resolve()
    require(actual_root == repo, "--repo는 Git 저장소 최상위 경로여야 해.")
    require(not git(repo, "ls-files", "--unmerged", "-z"), "해결되지 않은 Git merge 항목이 있어. 최종 소스를 고정한 뒤 준비해.")
    tree_sha, baseline = baseline_entries(repo)
    local_names = nul_names(git(repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard"))
    tracked = nul_names(git(repo, "ls-files", "-z", "--cached"))
    changes = []
    snapshot = {}
    present = set()
    scanned_bytes = unchanged_count = unchanged_bytes = missing_local = 0
    for name in sorted(local_names, key=lambda item: item.encode("utf-8")):
        check_untracked_name(name, tracked)
        if source_path(repo, name) is None:
            missing_local += 1
            continue
        info, _ = read_source(repo, name)
        snapshot[name] = info
        present.add(name)
        scanned_bytes += info["bytes"]
        old = baseline.get(name)
        if old and info["gitBlobSha"] == old["sha"]:
            unchanged_count += 1
            unchanged_bytes += info["bytes"]
            continue
        require(not credential_name(name), f"자격 증명 파일명의 변경은 게시하지 않아: {name!r}")
        changes.append({
            "path": name, "change": "modify" if old else "add",
            "mode": old["mode"] if old else "100644",
            "baselineGitBlobSha": old["sha"] if old else None,
            **{key: info[key] for key in ("bytes", "gitBlobSha", "sha256")},
        })
    for name in baseline.keys() - present:
        changes.append({
            "path": name, "change": "delete", "mode": baseline[name]["mode"],
            "baselineGitBlobSha": baseline[name]["sha"],
            "gitBlobSha": None, "sha256": None, "bytes": None,
        })
    changes.sort(key=lambda item: item["path"].encode("utf-8"))

    # Only derived request bodies and manifests go into this temporary output.
    # Publish the directory atomically after all source checks have succeeded.
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".qa-publish-", dir=output.parent))
    try:
        entries = []
        binary_requests = {}
        text_count = binary_count = 0
        for change in changes:
            entry = {"path": change["path"], "mode": change["mode"], "type": "blob"}
            if change["change"] == "delete":
                entry["sha"] = None
                change["representation"] = "delete"
            else:
                info, data = read_source(repo, change["path"], collect=True)
                require(info == snapshot[change["path"]], f"payload 작성 전에 파일이 바뀌었어: {change['path']!r}")
                text = utf8_text(data)
                if text is not None:
                    entry["content"] = text
                    change["representation"] = "inline-utf8"
                    text_count += 1
                else:
                    sha = change["gitBlobSha"]
                    request_name = f"blobs/{sha}.json"
                    if sha not in binary_requests:
                        record = write_json(temporary, request_name, {
                            "content": base64.b64encode(data).decode("ascii"), "encoding": "base64",
                        })
                        binary_requests[sha] = {
                            "expectedGitBlobSha": sha, "sourceBytes": change["bytes"],
                            "sourceSha256": change["sha256"], "pathCount": 0, **record,
                        }
                    else:
                        require(binary_requests[sha]["sourceSha256"] == change["sha256"],
                                "같은 Git SHA에 다른 SHA-256이 있어. 게시를 중단해.")
                    binary_requests[sha]["pathCount"] += 1
                    entry["sha"] = sha
                    change["representation"] = "base64-blob-request"
                    change["blobRequest"] = request_name
                    binary_count += 1
            entries.append(entry)

        # Detect writes/additions/deletions during preparation. No git status,
        # update-index, add, hash-object -w, commit, ref or network call is used.
        require(local_names == nul_names(git(repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard")),
                "payload 작성 중 Git 파일 목록이 바뀌었어.")
        require(tracked == nul_names(git(repo, "ls-files", "-z", "--cached")), "payload 작성 중 tracked 목록이 바뀌었어.")
        for name, info in snapshot.items():
            current = source_path(repo, name)
            require(current is not None and fingerprint(current.lstat()) == info["fingerprint"],
                    f"payload 작성 중 파일이 바뀌었어: {name!r}")
        for name in local_names - present:
            require(source_path(repo, name) is None, f"payload 작성 중 파일이 생겼어: {name!r}")

        tree_request = write_json(temporary, "tree-request.json", {"base_tree": tree_sha, "tree": entries})
        counts = {
            "baselineFileCount": len(baseline), "enumeratedLocalPathCount": len(local_names),
            "presentFileCount": len(present), "missingIndexedPathCount": missing_local,
            "scannedSourceBytes": scanned_bytes,
            "unchangedFileCount": unchanged_count, "unchangedSourceBytes": unchanged_bytes,
            "changedEntryCount": len(changes),
            "addedFileCount": sum(item["change"] == "add" for item in changes),
            "modifiedFileCount": sum(item["change"] == "modify" for item in changes),
            "deletedFileCount": sum(item["change"] == "delete" for item in changes),
            "changedSourceBytes": sum(item["bytes"] or 0 for item in changes),
            "inlineTextFileCount": text_count, "binaryFileCount": binary_count,
            "binaryRequestFileCount": len(binary_requests),
            "treeRequestBytes": tree_request["bytes"],
            "binaryRequestBytes": sum(item["bytes"] for item in binary_requests.values()),
        }
        manifest = {
            "schema": 1, "status": "PREPARED_NOT_UPLOADED",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "baselineCommit": BASELINE, "baseTree": tree_sha,
            "generator": {"file": script.name, **file_digest(script)},
            "source": {
                "scope": "repository working files selected by git ls-files --cached --others --exclude-standard",
                "unchangedFiles": "Inherited from base_tree; absent from the request and per-file manifest.",
                "originalEvidence": "No sibling qa-3f originals or publication body are copied. Repository evidence files are ordinary repository candidates.",
                "modePolicy": "Preserve baseline modes; new regular files use 100644 regardless of working-file executable bits.",
                "credentialPolicy": "Reject hidden untracked paths and known credential file names; tracked .gitignore is allowed. This is a path policy, not a general content-secret scanner.",
                "pathPolicy": "Reject symlinks, non-regular files, unsupported baseline modes, non-UTF-8 names, and path escapes.",
            },
            "counts": counts, "treeRequest": tree_request,
            "binaryRequests": sorted(binary_requests.values(), key=lambda item: item["file"]),
            "changes": changes,
            "uploadContract": [
                "Create each binary blob using its JSON request and verify the returned SHA equals expectedGitBlobSha before submitting tree-request.json.",
                "Inline text must be passed as JSON content without newline/BOM normalization; the expected Git blob SHA is recorded for every changed file.",
                "The tree request uses the exact 3f root tree and contains changed paths only; deletion entries use sha:null.",
                "No commit-parent, branch/ref, pull-request, or API action is performed or requested by this script.",
            ],
        }
        manifest_record = write_json(temporary, "sha-manifest.json", manifest)
        # Recheck the destination: os.replace cannot overwrite a nonempty dir.
        require(not output.is_symlink(), "출력 경로가 심볼릭 링크로 바뀌었어.")
        if output.exists():
            require(output.is_dir() and not any(output.iterdir()), "출력 디렉터리가 이미 사용 중이야.")
        os.replace(temporary, output)
        return {
            **counts, "manifestBytes": manifest_record["bytes"],
            "payloadFileCount": len(binary_requests) + 2,
            "payloadBytes": tree_request["bytes"] + counts["binaryRequestBytes"] + manifest_record["bytes"],
        }
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def main() -> int:
    script = Path(__file__).resolve()
    workspace = script.parent.parent
    parser = argparse.ArgumentParser(description="3f 기준 게시용 JSON만 준비해. 실행해도 Git index/commit/ref와 네트워크는 바꾸지 않아.")
    parser.add_argument("--repo", "--repo-root", type=Path, default=workspace / "forest-integration-3f", help="최종 저장소 최상위 경로")
    parser.add_argument("--output", type=Path, default=workspace / "qa-publish-3f", help="저장소·qa-3f 밖의 없거나 비어 있는 출력 폴더")
    args = parser.parse_args()
    try:
        # Resolve existing parents to enforce the output overlap checks, while
        # separately rejecting an explicit symlink at the output leaf.
        require(not args.output.expanduser().is_symlink(), "출력 디렉터리의 심볼릭 링크를 거부해.")
        repo = args.repo.expanduser().resolve(strict=True)
        output = args.output.expanduser().resolve(strict=False)
        counts = build(repo, output, script)
    except (PayloadError, OSError, ValueError) as exc:
        print(f"payload 준비 실패: {exc}", file=sys.stderr)
        return 1
    # Never print source contents, base64 bodies, or the full manifest.
    print(json.dumps(counts, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
