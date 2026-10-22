# e741 기준: 실제 PC의 재생·기능·방·로딩 검증 재현

이 문서는 **실행 절차와 해석 방법**이야. 아래 명령을 작성했다고 실행에 성공한 것은 아니고, 통과 결과나 PC 성능 수치를 포함하지 않아. 문서 작성 때는 도구의 코드와 브라우저를 열지 않는 `--help`만 확인했어. 실제 PC·Windows·스피커 청음은 별도 실행이 필요해.

먼저 [같은 PC의 렌더 A/B 재현 안내](performance-reproduce-e741.md)의 준비 절차로 `forest-perf-e741` 아래에 제품 서버 두 개와 Playwright를 준비해. 같은 제품 worktree와 포트를 그대로 사용하되, **이번 런타임 수집 도구는 다른 커밋**이야.

## 1. 제품과 도구 버전을 구분해

| 역할 | 고정 커밋 | 폴더·주소 |
|---|---|---|
| 기준 제품 A | `e741811d1d7a040afcdd3a8230465980c64f82fc` | `reference`, `http://127.0.0.1:8381` |
| 후보 제품 B | `6c7817218814f00631089eb2c6f150d68190980f` | `candidate`, `http://127.0.0.1:8382` |
| 이 문서의 런타임 수집 도구 | `7b07e15` | 별도 `collector-runtime` worktree |
| 앞선 고정 렌더 수집 도구 | `6c7817218814f00631089eb2c6f150d68190980f` | 기존 `collector` 유지 |

`7b07e15`는 재접속·빈 방 유지·최신 관객 설정에 맞춘 검증 도구를 포함해. 도구가 최신 계약을 읽더라도 제품 A/B를 HEAD로 바꾸지 않아. 추가 도구 수정이 공개되면 새 고정 커밋과 도구 SHA를 기록하고, 기존 실패 결과를 남긴 새 실행 폴더에서 다시 검사해.

`main-1f`, `historical-*`, `recovery-20261022` 자료는 이전 제품 버전의 역사 기록이야. e741→6c 결과의 기준선으로 섞지 않아. `REVISION` 문자열만으로 제품 출처가 확인되지는 않으므로 worktree HEAD·청결 상태, 실제 응답 source SHA와 collector SHA도 함께 보존해.

### 런타임 도구 worktree 추가

아래는 앞선 안내를 마친 상태에서 실행해. Node 22 이상이 필요해. 재현 환경은 Node 24, Playwright `1.62.1`을 썼고, 사용자 PC의 실제 브라우저 버전은 결과에 별도로 남겨야 해.

PowerShell:

```powershell
$ErrorActionPreference = "Stop"
$benchRoot = Join-Path $env:USERPROFILE "forest-perf-e741"
git -C (Join-Path $benchRoot "source") fetch origin main perf/261021-venue-rendering
if ($LASTEXITCODE -ne 0) { throw "fetch 실패" }
git -C (Join-Path $benchRoot "source") worktree add --detach (Join-Path $benchRoot "collector-runtime") 7b07e15
if ($LASTEXITCODE -ne 0) { throw "runtime collector 준비 실패" }
node --version
py -3 --version
```

Bash:

```bash
set -e
bench_root="$HOME/forest-perf-e741"
git -C "$bench_root/source" fetch origin main perf/261021-venue-rendering
git -C "$bench_root/source" worktree add --detach "$bench_root/collector-runtime" 7b07e15
node --version
python3 --version
```

제품 서버는 별도 터미널 두 개에서 실행해. 앞선 안내대로 켜져 있다면 추가로 실행하지 않아. Bash는 `reference`에서 `HOST=127.0.0.1 PORT=8381 node server.js`, `candidate`에서 `HOST=127.0.0.1 PORT=8382 node server.js`야. PowerShell은 해당 폴더에서 `$env:HOST="127.0.0.1"`, `$env:PORT="8381"` 또는 `"8382"`를 설정한 뒤 `node server.js`를 실행해.

## 2. 원본 계획을 PC 경로로 변환해

최종 [e741 증거 폴더](performance-data/main-e741/)에서 `runtime-core-plan.json`, `runtime-app-plan.json`, `cadence-plan.json`을 찾아 저장소 밖 `forest-perf-e741/evidence-runtime`에 복사해. 작성 중 원본은 `/workspace/scratch/25707ad85ea4/verification/`에 있었고, 이 경로는 PC에서 사용할 주소가 아니야. 원본 계획은 그대로 보존하고 변환본을 새 폴더에 만들어.

계획의 `env`가 shell 환경변수를 덮어써. 따라서 shell에서 `SOFTWARE_RENDERER=0`만 설정해도 원본 계획의 SwiftShader 설정은 해제되지 않아. 아래 변환기는 **각 job의 env**에서 클라우드 경로와 소프트웨어 렌더러 요청을 바꿔. 실제 하드웨어 GPU 사용 여부는 raw의 renderer 문자열과 브라우저 GPU 정보를 확인해야 해.

다음을 `forest-perf-e741/prepare-runtime-plan.py`로 저장해. 제품·도구 폴더의 커밋과 변경 여부를 확인하고, 원본 계획·도구 해시를 기록하면서 PC용 계획을 만들어. 실제 브라우저나 서버를 시작하는 코드는 아니야.

```python
from pathlib import Path
import argparse, hashlib, json, subprocess

p = argparse.ArgumentParser()
p.add_argument('--root', type=Path, required=True)
p.add_argument('--input', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--chrome', type=Path)
a = p.parse_args()
root, source, output = a.root.resolve(), a.input.resolve(), a.output.resolve()
refs = {
    'reference': 'e741811d1d7a040afcdd3a8230465980c64f82fc',
    'candidate': '6c7817218814f00631089eb2c6f150d68190980f',
    'collector-runtime': '7b07e15',
}
def git(tree, *args):
    return subprocess.check_output(['git', '-C', str(tree), *args], text=True).strip()
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
heads = {}
for tree, ref in refs.items():
    folder = root / tree
    expected = git(root / 'source', 'rev-parse', ref + '^{commit}')
    heads[tree] = git(folder, 'rev-parse', 'HEAD')
    assert heads[tree] == expected, (tree, 'wrong commit')
    assert not git(folder, 'status', '--porcelain'), (tree, 'worktree is not clean')
playwright = root / 'tools-runtime/node_modules/playwright'
assert (playwright / 'package.json').is_file(), 'Playwright installation is missing'
assert json.loads((playwright / 'package.json').read_text())['version'] == '1.62.1'
if a.chrome:
    assert a.chrome.is_file(), 'Chrome/Edge executable not found'
collector = root / 'collector-runtime/tools/bench'
tool_hashes = {p.name: sha(p) for p in sorted(collector.iterdir())
               if p.is_file() and p.suffix in {'.js', '.mjs', '.py'}}
plans, inputs = {}, {}
for name in ['runtime-core-plan.json', 'runtime-app-plan.json', 'cadence-plan.json']:
    original = source / name
    jobs = json.loads(original.read_text(encoding='utf-8-sig'))
    inputs[name] = {'file': str(original), 'sha256': sha(original), 'jobs': len(jobs)}
    for job in jobs:
        env = job['env']
        revision = env['REVISION']
        assert revision in [refs['reference'], refs['candidate']], job['id']
        side = 'reference' if revision == refs['reference'] else 'candidate'
        assert job['script'].startswith('tools/bench/') and '..' not in Path(job['script']).parts
        assert (root / 'collector-runtime' / job['script']).is_file(), job['script']
        for key in ['FONT_ROOT', 'CHROME_EXECUTABLE', 'OUTPUT_DIR', 'REPO_DIR']:
            env.pop(key, None)
        env.update({
            'PLAYWRIGHT_MODULE': str(playwright), 'SOFTWARE_RENDERER': '0',
            'CHROME_ARGS': '[]', 'HEADLESS': '0', 'FONT_MODE': 'system',
            'BASE_URL': 'http://127.0.0.1:' + ('8381' if side == 'reference' else '8382'),
        })
        if a.chrome:
            env['CHROME_EXECUTABLE'] = str(a.chrome.resolve())
        if job['script'].endswith('/multiplayer.mjs'):
            # The collector starts a separate server and imports RoomClient.
            # Read product code from the pinned product, not the tool worktree.
            env['REPO_DIR'] = str(root / side)
        if job['script'].endswith('/functional.mjs'):
            env['SCOPE'] = 'full'
    plans[name] = jobs
output.mkdir(parents=True, exist_ok=False)
for name, jobs in plans.items():
    (output / name).write_text(json.dumps(jobs, indent=2) + '\n', encoding='utf-8')
record = {'heads': heads, 'inputs': inputs, 'collectorSha256': tool_hashes,
          'environment': {'headed': True, 'fontMode': 'system', 'softwareRequested': False},
          'plans': {name: sha(output / name) for name in plans}}
(output / 'local-runtime-manifest.json').write_text(
    json.dumps(record, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'output': str(output), 'heads': heads, 'plans': inputs}, indent=2))
```

PowerShell:

```powershell
py -3 (Join-Path $benchRoot "prepare-runtime-plan.py") --root $benchRoot --input (Join-Path $benchRoot "evidence-runtime") --output (Join-Path $benchRoot "runtime-pc-r1")
if ($LASTEXITCODE -ne 0) { throw "계획 변환 실패" }
```

Bash:

```bash
python3 "$bench_root/prepare-runtime-plan.py" --root "$bench_root" --input "$bench_root/evidence-runtime" --output "$bench_root/runtime-pc-r1"
```

기본값은 앞선 안내에서 설치한 Playwright Chromium이야. 시스템 Chrome/Edge를 쓰려면 변환 명령에 `--chrome "실제 실행 파일의 절대 경로"`를 추가하고 양쪽에서 같은 바이너리를 사용해. `FONT_MODE=system`은 외부 Google Fonts CSS 대신 빈 CSS와 시스템 글꼴을 쓰는 조건이야. 시스템 글꼴은 OS에 따라 달라질 수 있어.

## 3. 한 번에 한 계획만 실행해

측정 중 다른 GPU 검증·게임·브라우저 벤치마크를 동시에 실행하지 않아. headed 브라우저를 최소화하거나 다른 탭으로 바꾸면 native 관찰의 visibility 조건이 달라질 수 있어. `run-plan.py`가 각 job을 순서대로 실행하고 raw, stdout/stderr, 종료 기록과 heartbeat를 직접 저장해.

먼저 도움말로 CLI를 확인할 수 있어. 이 명령들은 브라우저를 열지 않아.

```bash
python3 "$bench_root/collector-runtime/tools/bench/run-plan.py" --help
node "$bench_root/collector-runtime/tools/bench/audio-resume.mjs" --help
node "$bench_root/collector-runtime/tools/bench/loading.mjs" --help
node "$bench_root/collector-runtime/tools/bench/functional.mjs" --help
```

### Bash 실행 예시

```bash
python3 "$bench_root/collector-runtime/tools/bench/run-plan.py" "$bench_root/runtime-pc-r1/runtime-core-plan.json" --output "$bench_root/runtime-pc-r1/core" --heartbeat-seconds 20 --continue-on-failure
```

위 명령이 종료되고 로그를 확인한 뒤 다음 명령을 실행해.

```bash
python3 "$bench_root/collector-runtime/tools/bench/run-plan.py" "$bench_root/runtime-pc-r1/runtime-app-plan.json" --output "$bench_root/runtime-pc-r1/app" --heartbeat-seconds 20 --continue-on-failure
```

렌더 cadence 검증은 별도 결과 폴더로 실행해.

```bash
python3 "$bench_root/collector-runtime/tools/bench/run-plan.py" "$bench_root/runtime-pc-r1/cadence-plan.json" --output "$bench_root/runtime-pc-r1/cadence" --heartbeat-seconds 20 --continue-on-failure
```

### PowerShell 실행 예시

```powershell
$runner = Join-Path $benchRoot "collector-runtime/tools/bench/run-plan.py"
$local = Join-Path $benchRoot "runtime-pc-r1"
py -3 $runner (Join-Path $local "runtime-core-plan.json") --output (Join-Path $local "core") --heartbeat-seconds 20 --continue-on-failure
$LASTEXITCODE
```

종료 후 같은 명령의 `runtime-core-plan.json`/`core`를 각각 `runtime-app-plan.json`/`app`, 이어서 `cadence-plan.json`/`cadence`로 바꿔 실행해. 종료 코드 1도 기록해야 할 검증 결과야. 정상으로 바꿔 적지 않아.

원본 계획의 job 번호는 0부터 시작해. 예를 들어 app의 첫 Hall desktop A/B 두 job만 실행하려면 `--start 0 --end 2`를 추가해. `--end`는 제외 경계야. 같은 결과 폴더에서 다음 미실행 job부터 `--start 2`로 이어 갈 수 있어. 이미 기록된 job은 덮어쓰기를 거부해. 실패한 job을 재실행할 때는 새 output 폴더를 사용해.

## 4. 각 계획이 실제로 확인하는 범위

| 계획·도구 | 원본 조건과 확인 범위 | 결과를 해석할 때의 한계 |
|---|---|---|
| core: `audio-worker.mjs` | 후보의 실제 module Worker와 OfflineAudioContext, 정상 worker·CSP 차단 fallback, full/Lite PCM 채널 해시 비교 | 실제 악기 연주·스피커 출력·오디오 장치 timing 검사는 아님 |
| core: `multiplayer.mjs` | `REPO_DIR`의 실제 server·RoomClient, 로컬 임시 방, 생성·입장·seed·snapshot·채팅·방장 권한·재접속·빈 방 계약 | Node WebSocket 프로토콜 검사. 실제 UI나 부하 검사가 아니고, 120초 방 만료는 관찰하지 않음 |
| core: `loading.mjs` | Hall/Sphere desktop A/B, 각 fresh context의 cold→warm HTTP 캐시, 기본 high, sample decode·PCM·관객·로딩 준비 상태·응답 전송량 | main rAF를 잡아 둔 controlled startup. cold는 브라우저 HTTP 캐시 기준이고 Node/OS 캐시는 warm일 수 있음 |
| app 0–7: `audio-resume.mjs` | Hall/Sphere × desktop/mobile A/B. `FRAME_MODE=native`, `READBACK=0`, `QUALITY=low`, `FIXED_AUDIENCE_SEED=417`, `LIVE_WINDOW_MS=30000`, `PRELUDE_FRAMES=2` | 실제 재생과 원래 main rAF의 30초 관찰. 출력 장치 음질·물리 FPS·장시간 안정성의 증명은 아님 |
| app 8–11: `functional.mjs` | 후보의 Hall/Sphere × desktop/mobile, 입장·이동·시선·좌석·재생·pause/seek/resume·listener·곡·품질·관객·중계 UI | main rAF를 잡고 명시적 프레임을 완료하는 기능 검사. 이동 성능/FPS 측정이 아님 |
| app 12–13: `rooms.mjs` | 후보 두 페이지의 실제 private 방 UI. Hall `cross`는 공연장 selector·잘못된 공연장 초대·자동 복귀 포함. Sphere `core`는 방 생성·재생 동기화·채팅·방장 이양 | low·volume 0·관객 그림/효과/중계 off. 방장 stage 입장을 fixture로 완료하며 음악 음질을 평가하지 않음 |
| app 14–15: `dome-motion.mjs` | Sphere A/B medium, 28 step 회전, reveal/crossfade의 0·25·50·75·100% checkpoint | 직접 진행한 제어 시각. 연속 4초 감상이나 실제 입력 FPS가 아님 |
| cadence 0–7: `full-frame.mjs` | Hall/Sphere × desktop/mobile A/B, low, `front,wide`, `MODE=cadence`, `SAMPLES=100`, `WARMUP=6` | 원래 오디오 scheduler를 끈 고정 악보·카메라·관객 fixture의 rAF 간격. 실제 음악과 동시 실행한 위 30초 관찰과 구분 |
| cadence 8–11 | 두 공연장 mobile A/B, auto, `front`, 같은 cadence 도구 | 적응형 품질 결과. 수동 low의 동일 품질 개선 수치에 합치지 않음 |

원본 native 화면은 desktop 640×360, mobile 390×844, DPR 1이야. functional은 desktop 960×540, mobile 390×844, DPR 1이고 rooms는 960×640이야. 정확한 해상도·표본·인자는 복사한 계획의 `env`와 raw를 기준으로 확인해. `SAMPLES`와 `WARMUP`은 해당 옵션을 읽는 도구에만 영향을 줘. 예를 들어 native live window의 길이는 `LIVE_WINDOW_MS`가 결정해.

`audio-resume`은 제품의 원래 악기 샘플·오디오 그래프·음량을 사용하고, 실제 시작·pause·seek·resume UI를 조작해. 재개 판정은 2초 안에 `AudioContext.state === running`, 재생 상태, seek 지점 이후 시각 진행을 함께 확인해. 관찰 편의를 위해 음표를 대신 예약하거나 AudioContext를 강제로 재시작하지 않아. 음표 요청은 실제 악보와 대조하지만, 이것만으로 물리 출력에서 글리치가 없었다고 말할 수는 없어.

`FRAME_MODE=controlled`를 따로 조사하려면 변환 계획의 사본에서 해당 audio-resume job의 `FRAME_MODE=controlled`, `READBACK=1`, `LIVE_WINDOW_MS=0`으로 바꾸고 새 output을 사용해. native와 controlled는 다른 조건이므로 합쳐 평균을 내지 않아. `FIXED_AUDIENCE_SEED`는 QA용 main 응답의 관객 난수 표현 하나를 바꾸며, 원본/변환 해시를 남겨. 이 응답의 전송량은 제품 원본 로딩 전송량으로 쓰지 않아.

모든 방 검사는 loopback 서버와 테스트용 방에만 메시지를 보내. 실제 서비스 주소나 기존 사용자의 방 코드를 넣지 않아. `multiplayer`는 OS가 배정한 별도 loopback 포트에 임시 서버를 시작하고, `rooms`는 위 A/B 중 지정한 로컬 서버에서만 private 방을 만들어. 테스트 종료 때 생성한 연결을 닫아.

## 5. 실패·timeout·부분 범위를 읽는 방법

| 기록 | 확인할 것 |
|---|---|
| `progress.json` | job별 최근 상태, 기록 경로·SHA, 마지막 heartbeat. `RUNNING`은 성공이 아님 |
| `logs/000-이름.json` | 실행한 command·job env·collector SHA·시작/종료·wall timeout·exitCode |
| 같은 이름의 `.log` | stdout/stderr와 단계별 경과. 최초 오류 위치를 확인 |
| `raw/*.json` / `render/*.json` | `status` 또는 `passed`, `failure`/`error`/`failures`, diagnostics, 세부 checks와 미실행 항목 |
| `functional`의 `scope`·`unchecked` | `transport`만 검사했다면 이후 프로그램·품질·관객·중계·모바일 배치는 미검사. `full`과 동일하게 표기하지 않음 |
| `audio-resume`의 `liveWindow` | 완료 여부, raw frame 시작 시각, 음악·visibility·품질 변화에 따른 제외 사유와 실제 관측 구간 |

`TIMEOUT_MS=60000`은 브라우저 준비/조작의 개별 제한이야. job 전체는 계획의 `timeoutSeconds`가 제한해. 원본은 종류별 60/240/300/360초를 사용하고, job 값이 runner의 `--job-timeout-seconds` 기본 600초보다 우선해. timeout은 wrapper에 `TIMEOUT`, exit 124로 남아. Ctrl+C/종료 신호는 `INTERRUPTED`, exit 130으로 남기며, 프로세스 시작 실패는 별도 오류야.

runner는 POSIX에서 자식 process group에 TERM→KILL을 보내고, Windows에서는 해당 PID 트리에 `taskkill /T /F`를 사용해. 종료 실패가 있으면 `cleanupErrors`도 읽어. heartbeat는 runner가 살아 있다는 신호이고 브라우저나 GPU가 정상 진행 중이라는 증거는 아니야. job이 강제 종료되면 raw가 없거나 `RUNNING` 상태일 수 있어. 성공 수치로 채우지 말고 wrapper와 log를 남겨.

`--continue-on-failure`는 다음 job을 계속 검사할 뿐 실패를 없애지 않아. functional의 `CONTINUE_ON_TRANSPORT_FAIL=1`도 원래 재개 실패를 보존하고 후속 UI를 더 관찰하는 설정이야. 후속 항목이 통과해도 해당 case는 최종 FAIL이야.

로딩 A/B는 파일 비교 도구로 동등 조건을 먼저 검사할 수 있어. Bash 예시는 다음과 같고, PowerShell도 같은 `node` 인자에 자신의 절대 경로를 넣으면 돼.

```bash
node "$bench_root/collector-runtime/tools/bench/compare-loading.mjs" "$bench_root/runtime-pc-r1/core/raw/loading-baseline-hall-desktop.json" "$bench_root/runtime-pc-r1/core/raw/loading-candidate-hall-desktop.json" "$bench_root/runtime-pc-r1/loading-comparison-hall.json"
```

Sphere는 위 세 파일명의 `hall`을 `sphere`로 바꿔. 도구는 관객 시드·수·점유 좌석 hash, 샘플·화면·폰트·브라우저 조건을 비교해. 쌍이 유효해도 cold/warm 각각 한 번의 관측은 안정적인 개선율 증명이 아니야. A/B/B/A 등 순서를 바꾼 독립 반복은 새 결과 폴더로 실행하고, 실패 반복도 함께 남겨.

## 6. PC에서 따로 판단할 항목

30초 native 관찰의 rAF FPS는 원래 main callback 시작 간격이야. 화면에 실제 표시된 FPS나 순수 GPU 시간과 같지 않아. 100개 미만의 유효 간격이면 1% Low가 `null`일 수 있고 이를 0 FPS로 바꾸지 않아. `readPixels` 완료 시간·controlled dome 진단 시간·기능 검사 경과 시간을 FPS로 환산하지 않아.

mobile은 데스크톱 Chromium의 viewport·touch·UA 에뮬레이션이야. 실제 Android/iOS, Safari, 모바일 발열·배터리·메모리 한계를 실측한 결과가 아니야. Windows Edge/Chrome도 해당 실행 파일로 직접 실행한 결과가 생긴 뒤에만 그 브라우저에서 검증했다고 적어.

물리 스피커·헤드폰으로 음색·공간감·잔향·음량 균형과 장시간 끊김을 판단하려면 자동 fixture와 별개로 A/B의 직접 입장 주소 `http://127.0.0.1:8381/?venue=hall&lobby=`와 `http://127.0.0.1:8382/?venue=hall&lobby=`를 같은 기기에서 차례로 열어. Sphere는 `venue=sphere`로 바꿔. 같은 곡·좌석·시각·화질·음량을 맞추고 사용한 오디오 장치·sample rate·관찰 시간·이상 시각을 기록해. 두 버전을 동시에 재생하면 비교 조건이 달라져. 이 수동 청음과 장시간 감상은 위 자동 계획의 통과 여부에서 추정하지 않아.
