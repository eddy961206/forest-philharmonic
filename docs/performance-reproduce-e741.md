# e741 기준: 두 공연장을 같은 PC에서 직접 비교하는 재현 안내

이 안내는 고정한 두 제품 버전과 같은 측정 도구로 전후 차이를 재현하는 절차야. **명령 예시는 실행 성공 보고서가 아니야.** 실제로 닫힌 원본 결과와 최종 결과표는 별도로 읽어. 이 문서를 작성하면서 새 브라우저·GPU 측정이나 Windows 설치를 실행하지 않았어.

## 1. 이번 비교의 버전을 먼저 고정해

| 역할 | 전체 Git SHA | 권장 위치·포트 |
|---|---|---|
| 기준 제품 A | `e741811d1d7a040afcdd3a8230465980c64f82fc` | `reference`, 8381 |
| 후보 제품 B | `6c7817218814f00631089eb2c6f150d68190980f` | `candidate`, 8382 |
| 이 안내의 고정 수집 도구 | `6c7817218814f00631089eb2c6f150d68190980f` | 별도 `collector` worktree |

[기준 제품](https://github.com/eddy961206/forest-philharmonic/tree/e741811d1d7a040afcdd3a8230465980c64f82fc)과 [후보 제품](https://github.com/eddy961206/forest-philharmonic/tree/6c7817218814f00631089eb2c6f150d68190980f)을 각각 실행해. PR에 문서·도구 커밋이 더 붙어도 측정 제품은 위 SHA로 유지해. 브랜치의 최신 HEAD를 후보 제품으로 대신 쓰지 않아. 최신 main을 새 기준으로 삼으려면 새 manifest·계획·결과 폴더로 A/B를 모두 다시 기록해.

이전 [1f 재현 안내](performance-reproduce-1f.md), [복구한 1f→dea cadence](performance-data/recovery-20261022/README.md), a41/3f/6a 결과는 각각 당시 버전의 역사 자료야. 예전 수치와 이번 e741→6c 수치를 한 전후 쌍으로 합치지 않아.

`REVISION`은 실행자가 적는 라벨이므로 그 문자열만으로 버전을 증명하지 않아. 로컬 제품 파일 SHA, 실제 HTTP 응답 SHA, 도구·fixture SHA, 종료 wrapper와 로그 SHA를 함께 확인해야 해.

## 2. 원본 계획과 환경의 범위

원본 계획·manifest·환경 기록은 저장소의 [docs/performance-data/main-e741](performance-data/main-e741/)에 있어. 여기서 `high-plan.json`, `measurement-manifest.json`, `source-manifest.json`, `chromium.json`을 저장소 밖 `forest-perf-e741/evidence`로 복사해. 아래 §3의 준비와 복사 명령을 그대로 사용하면 돼. 별도 ZIP은 PNG 화면 이미지용이고, 계획이나 manifest를 ZIP에서 꺼내는 절차는 필요 없어. 작성 시 원본 실행 위치는 `/workspace/scratch/25707ad85ea4/verification/`였고, 네 PC에서 그 클라우드 절대 경로를 사용할 필요는 없어.

원본 high 계획은 다음 조건이야.

| 항목 | 원본 계획에 고정된 값 |
|---|---|
| OS·runtime 기록 | Linux x64, Node `v24.19.0`, Python `3.12.14` |
| 브라우저 준비 기록 | Chromium package `153.0.0`, Playwright `1.62.1`; 실제 browserVersion은 raw에서 확인 |
| 렌더러 요청 | ANGLE SwiftShader, headless; 물리 GPU 측정이 아님 |
| 폰트 | `FONT_MODE=system` |
| 화면 | desktop 640×360, device DPR 1; 실제 renderer pixelRatio는 raw에서 별도 확인 |
| 화질·시각 | 수동 high, 고정 카메라·곡 시각·관객 시드 |
| 장면당 표본 | warmup 2프레임, 측정 4프레임 |
| Hall 장면 | `front,wide,broadcast-hidden,broadcast-return` |
| Sphere 장면 | `front,wide,forest,crossfade,broadcast` |
| 실행 순서 | Hall A→B, Sphere A→B, Hall B→A, Sphere B→A |
| 브라우저 조작 제한 | `TIMEOUT_MS=60000` |
| job 전체 제한 | 각 `timeoutSeconds=360` |

네 장면 표본 4개는 짧은 진단이야. 이 표본 수에서 nearest-rank p95/p99는 최대값과 같고, 신뢰할 만한 1% Low FPS를 계산할 수 없어. 각 장면의 여러 프레임을 독립 반복 여러 번으로 세지 않아.

`FONT_MODE=system`은 Google Fonts CSS 요청에 빈 CSS를 돌려 주고 시스템 대체 폰트를 쓰는 조건이야. `local` Fontsource 모드나 실제 네트워크 폰트 모드와 같지 않아. A/B 양쪽은 같은 모드를 유지하고, 다른 OS에서 글꼴 픽셀이 달라지는 점은 화면 비교 때 구분해. 원본 CSS·앱 코드를 편집하는 설정은 아니야.

## 3. 제품 서버와 수집 도구를 분리해서 준비해

Git, Node, npm, Python 3가 필요해. 제품 `package.json`의 서버 요구는 Node 18 이상이지만, 일부 방 프로토콜 도구는 Node 내장 WebSocket을 쓰므로 검증용으로는 Node 22 이상을 사용해. 이번 환경과 버전을 맞추려면 위 runtime 기록을 참고하고 네 실제 버전도 저장해. 앱 서버에는 별도 프런트 빌드나 무거운 프레임워크 설치가 없어.

### Windows PowerShell

다음은 새 작업 폴더를 만드는 예시야. 기존 폴더가 있으면 새 이름을 골라. PowerShell과 Windows Chrome 실측은 이 문서 작성 시 실행하지 않았어.

```powershell
$ErrorActionPreference = "Stop"
$benchRoot = Join-Path $env:USERPROFILE "forest-perf-e741"
New-Item -ItemType Directory -Path $benchRoot | Out-Null
Set-Location $benchRoot
git -c core.autocrlf=false clone --branch perf/261021-venue-rendering https://github.com/eddy961206/forest-philharmonic.git source
if ($LASTEXITCODE -ne 0) { throw "clone 실패" }
git -C source fetch origin main perf/261021-venue-rendering
if ($LASTEXITCODE -ne 0) { throw "fetch 실패" }
# clone 첫 checkout부터 줄바꿈을 보존했고, 뒤의 worktree에도 같은 설정을 유지해.
git -C source config core.autocrlf false
if ($LASTEXITCODE -ne 0) { throw "Git 줄바꿈 설정 실패" }
$baselineRef = "e741811d1d7a040afcdd3a8230465980c64f82fc"
$candidateRef = "6c7817218814f00631089eb2c6f150d68190980f"
git -C source worktree add --detach (Join-Path $benchRoot "reference") $baselineRef
if ($LASTEXITCODE -ne 0) { throw "기준 worktree 실패" }
git -C source worktree add --detach (Join-Path $benchRoot "candidate") $candidateRef
if ($LASTEXITCODE -ne 0) { throw "후보 worktree 실패" }
git -C source worktree add --detach (Join-Path $benchRoot "collector") $candidateRef
if ($LASTEXITCODE -ne 0) { throw "수집기 worktree 실패" }
$runtimeRoot = Join-Path $benchRoot "tools-runtime"
npm install --prefix $runtimeRoot --save-exact playwright@1.62.1
if ($LASTEXITCODE -ne 0) { throw "Playwright 설치 실패" }
node (Join-Path $runtimeRoot "node_modules/playwright/cli.js") install chromium
if ($LASTEXITCODE -ne 0) { throw "Chromium 설치 실패" }
node --version
py -3 --version
```

### macOS / Linux Bash

```bash
set -e
bench_root="$HOME/forest-perf-e741"
mkdir "$bench_root"
cd "$bench_root"
git -c core.autocrlf=false clone --branch perf/261021-venue-rendering https://github.com/eddy961206/forest-philharmonic.git source
git -C source fetch origin main perf/261021-venue-rendering
git -C source config core.autocrlf false
baseline_ref=e741811d1d7a040afcdd3a8230465980c64f82fc
candidate_ref=6c7817218814f00631089eb2c6f150d68190980f
git -C source worktree add --detach "$bench_root/reference" "$baseline_ref"
git -C source worktree add --detach "$bench_root/candidate" "$candidate_ref"
git -C source worktree add --detach "$bench_root/collector" "$candidate_ref"
runtime_root="$bench_root/tools-runtime"
npm install --prefix "$runtime_root" --save-exact playwright@1.62.1
node "$runtime_root/node_modules/playwright/cli.js" install chromium
node --version
python3 --version
```

공통으로 세 worktree의 `git rev-parse HEAD`를 확인하고 `git status --short`가 비어 있는지 확인해. `source`는 공개된 증거 파일과 최신 계획 변환기를 가져오는 PR 브랜치이고 실제 측정 제품은 위 SHA로 분리한 `reference`와 `candidate`야. 의존성은 저장소 밖 `tools-runtime`에 설치했으므로 제품 파일을 변경하지 않아. 생성된 package-lock도 환경 기록과 함께 보존해. 시스템 Chrome/Edge 실행 파일을 지정할 경우 번들 Chromium 설치를 생략할 수 있지만, A/B는 같은 브라우저 바이너리를 사용해야 해.

### 저장소의 계획·manifest를 복사해

다음은 `evidence` 폴더를 처음 만들 때 한 번 실행해. 이미 원본 네 파일을 보존했다면 덮어쓰지 말고 그 폴더를 사용해. `source-manifest.json`은 공개 원본 집계용이고, 다음 §4에서는 로컬 계획의 출처를 기록하는 별도 manifest를 새로 만들어.

PowerShell:

```powershell
$evidenceFrom = Join-Path $benchRoot "source/docs/performance-data/main-e741"
$evidenceTo = Join-Path $benchRoot "evidence"
New-Item -ItemType Directory -Path $evidenceTo | Out-Null
foreach ($name in @("high-plan.json", "measurement-manifest.json", "source-manifest.json", "chromium.json")) {
    Copy-Item -LiteralPath (Join-Path $evidenceFrom $name) -Destination (Join-Path $evidenceTo $name)
}
```

Bash:

```bash
mkdir "$bench_root/evidence"
for name in high-plan.json measurement-manifest.json source-manifest.json chromium.json; do
  cp "$bench_root/source/docs/performance-data/main-e741/$name" "$bench_root/evidence/$name"
done
```

### 서버 A·B를 각각 별도 터미널에서 실행해

PowerShell 서버 A:

```powershell
Set-Location (Join-Path $env:USERPROFILE "forest-perf-e741/reference")
$env:HOST = "127.0.0.1"
$env:PORT = "8381"
node server.js
```

PowerShell 서버 B:

```powershell
Set-Location (Join-Path $env:USERPROFILE "forest-perf-e741/candidate")
$env:HOST = "127.0.0.1"
$env:PORT = "8382"
node server.js
```

Bash에서는 다음 두 블록을 각기 다른 터미널에서 실행해.

```bash
cd "$HOME/forest-perf-e741/reference"
HOST=127.0.0.1 PORT=8381 node server.js
```

```bash
cd "$HOME/forest-perf-e741/candidate"
HOST=127.0.0.1 PORT=8382 node server.js
```

서버 두 개를 켜 두되 렌더 측정 브라우저는 한 번에 하나만 실행해. 측정 중 worktree를 pull하거나 파일을 고치지 않아. 세 번째 터미널에서 실제 수집·집계 명령은 `collector` 기준으로 실행해. 다음 계획 변환기만 최신 `source/tools/bench`에서 읽어. 첫 화면은 광장이고 렌더 fixture는 `?venue=hall&lobby=` 또는 `?venue=sphere&lobby=`의 직접 진입 경로를 사용해. 광장 발권 경로를 이 렌더 suite로 검증했다고 표현하지 않아.

## 4. manifest를 집계기 형식으로 변환하고 PC 계획을 만들어

**`measurement-manifest.json`을 `collect-plan.mjs --manifest`에 그대로 넘기면 안 돼.** 원본은 `source.baseline`/`source.candidate`의 경로→SHA 객체이고, 집계기는 아래 형식을 요구해.

```json
{
  "baseline": "e741811d1d7a040afcdd3a8230465980c64f82fc",
  "candidate": "6c7817218814f00631089eb2c6f150d68190980f",
  "files": [
    {
      "path": "public/js/quality.js",
      "baselineSha256": null,
      "candidateSha256": "원본 candidate 객체의 실제 64자리 SHA-256"
    }
  ]
}
```

위 JSON은 구조 설명용이며 그대로 실행할 입력이 아니야. 양쪽 경로의 합집합을 쓰고, 특정 버전에 없는 파일은 `null`을 넣어야 해. 집계기는 `null`에 대해 실제 HTTP 404를 기대해. `candidateParent`는 후보 제품 SHA의 다른 이름이 아니므로 확인 없이 채우지 않아.

최신 PR 브랜치의 [`tools/bench/prepare-local-plan.py`](../tools/bench/prepare-local-plan.py)를 사용해. 변환기는 `source`에 있고, 실제 수집 도구는 고정한 `collector`에 있어. 변환기는 원본 manifest·환경 기록과 로컬 제품·고정 수집 도구의 해시를 확인한 뒤 새 폴더에만 계획과 `files[]` manifest를 만들어. 원본 계획·원시 결과·제품·수집기 파일을 바꾸거나 브라우저를 실행하지 않아. 변환기 자체의 SHA도 출력 manifest의 `preparerSha256`에 남겨.

`--plan`을 생략하면 `evidence/high-plan.json`을 사용해. `--plan`에 matrix 또는 special JSON의 경로를 주면 그 계획의 순서·장면·프리셋·기기 구분을 유지해. `--width`, `--height`, `--dpr`, `--warmup`을 생략하면 **각 job의 원본 값**을 유지하므로 혼합 계획의 mobile 390×844가 desktop 640×360으로 바뀌지 않아. sync의 `--samples` 기본값도 원본을 유지하고, `--mode cadence`로 바꿀 때는 생략 시 120표본을 사용해.

`--help`는 파일 변환이나 브라우저 실행 없이 인자를 보여 줘. 기존 출력 폴더는 덮어쓰지 않아.
PowerShell에서 실행하는 예시:

```powershell
$benchRoot = Join-Path $env:USERPROFILE "forest-perf-e741"
py -3 (Join-Path $benchRoot "source/tools/bench/prepare-local-plan.py") --root $benchRoot --output (Join-Path $benchRoot "pc-high-sync")
if ($LASTEXITCODE -ne 0) { throw "소스/계획 검증 실패" }
```

Bash 예시:

```bash
bench_root="$HOME/forest-perf-e741"
python3 "$bench_root/source/tools/bench/prepare-local-plan.py" --root "$bench_root" --output "$bench_root/pc-high-sync"
```

### matrix·special 계획도 같은 변환기를 사용해

high 계획의 생성·수집·집계를 먼저 확인한 다음 필요한 계획만 추가해. `matrix-plan.json`은 medium/low와 mobile high 조건을, `special-plan.json`은 이동·효과 장면을 담고 있어. 둘 다 저장소의 원본을 읽고 새 출력 폴더를 만들기 때문에 `evidence`의 high 계획을 바꿀 필요가 없어.

PowerShell:

```powershell
$preparer = Join-Path $benchRoot "source/tools/bench/prepare-local-plan.py"
$recorded = Join-Path $benchRoot "source/docs/performance-data/main-e741"
py -3 $preparer --root $benchRoot --plan (Join-Path $recorded "matrix-plan.json") --output (Join-Path $benchRoot "pc-matrix-sync")
if ($LASTEXITCODE -ne 0) { throw "matrix 계획 변환 실패" }
py -3 $preparer --root $benchRoot --plan (Join-Path $recorded "special-plan.json") --output (Join-Path $benchRoot "pc-special-sync")
if ($LASTEXITCODE -ne 0) { throw "special 계획 변환 실패" }
```

Bash:

```bash
preparer="$bench_root/source/tools/bench/prepare-local-plan.py"
recorded="$bench_root/source/docs/performance-data/main-e741"
python3 "$preparer" --root "$bench_root" --plan "$recorded/matrix-plan.json" --output "$bench_root/pc-matrix-sync"
python3 "$preparer" --root "$bench_root" --plan "$recorded/special-plan.json" --output "$bench_root/pc-special-sync"
```

§5·§6 명령의 `pc-high-sync`를 각각 `pc-matrix-sync` 또는 `pc-special-sync`로 바꿔 별도로 수집·집계해. 계획당 job 수는 high 8개, matrix 20개, special 4개야. 각 폴더의 변환 계획과 manifest를 짝지어 사용하고, 동시에 두 계획을 실행하지 않아.

시스템 Chrome/Edge를 사용할 때는 `--chrome`에 실제 존재하는 실행 파일 경로를 추가해. 위 생성기는 `CHROME_ARGS=[]`와 `SOFTWARE_RENDERER=0`을 **각 job.env에** 기록해. 터미널 환경변수만 바꿔도 원본 계획의 `job.env`가 다시 덮어쓰기 때문에 이 단계가 필요해.

PC에서는 원본의 `--use-angle=swiftshader`, `--use-gl=angle`, `--enable-unsafe-swiftshader`, 컨테이너용 `--no-sandbox` 등의 인자를 그대로 이식하지 않아. 소프트웨어 강제 옵션을 없앤 사실만으로 물리 GPU가 보장되지는 않아. raw의 `meta.renderer`를 확인하고 SwiftShader/llvmpipe 등의 이름이 나오면 소프트웨어 렌더로 분류해. 값이 null이면 GPU 종류 미확인으로 남겨. 원격 데스크톱·드라이버·브라우저 설정도 환경 기록에 포함해.

클라우드 원본을 같은 소프트웨어 환경에서 재실행하려면 원본 계획을 복사해 실행 파일·패키지·URL 경로만 그 환경에 맞게 지정하고, 원래 software 옵션과 headless·표본·폰트 설정을 유지해. 이 실행은 PC GPU 결과와 별도 폴더·별도 표로 보고해.

## 5. 짧게 시작하고, 종료된 job부터 이어가

PowerShell 수집 터미널:

```powershell
$benchRoot = Join-Path $env:USERPROFILE "forest-perf-e741"
Set-Location (Join-Path $benchRoot "collector")
py -3 tools/bench/run-plan.py (Join-Path $benchRoot "pc-high-sync/plan.json") --output (Join-Path $benchRoot "pc-high-sync/run") --end 2 --heartbeat-seconds 20
$LASTEXITCODE
```

Bash 수집 터미널:

```bash
bench_root="$HOME/forest-perf-e741"
cd "$bench_root/collector"
python3 tools/bench/run-plan.py "$bench_root/pc-high-sync/plan.json" --output "$bench_root/pc-high-sync/run" --end 2 --heartbeat-seconds 20
```

위 명령은 Hall 첫 A/B 두 job만 실행해. 두 wrapper와 raw가 정상적으로 닫혔는지 확인한 뒤 **같은 plan을 수정하지 않고** `--end 2` 대신 `--start 2 --continue-on-failure`로 나머지를 이어가. 마지막 8개를 한 번에 시작하려면 `--start/--end`를 생략해.

- `TIMEOUT_MS`는 준비·개별 조작과 cadence 장면 수집 대기 제한이야. sync 전체 실행을 제한하지 못하므로 runner의 wall timeout과 함께 사용해.
- CLI `--job-timeout-seconds`는 기본 상한이고 plan의 `timeoutSeconds`가 있으면 **plan 값이 우선**해. 이 안내의 sync job은 360초, cadence job은 600초야.
- 20초마다 heartbeat를 출력하고 `progress.json`과 실행 중 wrapper를 갱신해. 로그는 최종 output에 즉시 남아. 전체 batch 종료를 기다렸다가 `/tmp`에서 복사하는 외부 wrapper는 사용하지 않아.
- TIMEOUT의 job exitCode는 124, INTERRUPTED는 130이야. runner 전체 exit 1은 실패 포함, 130은 중단이야. `--continue-on-failure`는 실패를 남기고 다음 job으로 진행할 뿐 실패를 PASS로 바꾸지 않아.
- Linux/macOS에서는 전용 process group을 TERM/KILL로, Windows에서는 제한 시간 있는 `taskkill /T /F`로 정리해. `cleanupErrors`가 있으면 함께 보고해. Windows 실제 종료 동작은 이번 Linux 검사에서 검증하지 않았어.
- 이미 생성된 wrapper·로그가 있으면 덮어쓰기를 거부해. 중단된 index를 재시험할 때는 새 output 폴더를 쓰고 기존 실패 원본을 유지해. 같은 output에는 runner를 하나만 실행해.
- SIGKILL·호스트 종료·디스크 오류로 마지막 문서가 RUNNING이면 완료로 간주하지 않아. heartbeat가 있다는 사실도 GPU나 오디오가 정상 진행 중이라는 보장은 아니야.

## 6. 같은 plan과 별도 변환 manifest로 집계해

`collect-plan.mjs`는 브라우저를 실행하지 않고 파일만 읽어. 최종 결과가 닫힌 뒤 실행해. 원본 계획을 수정하면 wrapper의 plan SHA와 달라지므로 그대로 사용해야 해.

PowerShell:

```powershell
node tools/bench/collect-plan.mjs --plan (Join-Path $benchRoot "pc-high-sync/plan.json") --root (Join-Path $benchRoot "pc-high-sync/run") --manifest (Join-Path $benchRoot "pc-high-sync/source-manifest.json") --output (Join-Path $benchRoot "pc-high-sync/summary")
$LASTEXITCODE
```

Bash:

```bash
node tools/bench/collect-plan.mjs --plan "$bench_root/pc-high-sync/plan.json" --root "$bench_root/pc-high-sync/run" --manifest "$bench_root/pc-high-sync/source-manifest.json" --output "$bench_root/pc-high-sync/summary"
```

확인할 항목은 `summary.json`의 `status`, `completedPairs`, `excluded`, `jobs`, `rows`야. `summary.md`의 표만 읽고 실패·누락을 놓치지 않아. 집계 exit 0은 출처·조건 대조와 집계가 완료됐다는 뜻이며 모든 성능이 좋아졌거나 화질이 같다는 판정은 아니야.

현재 집계기는 candidate revision을 plan과, baseline revision을 plan 및 manifest.baseline과 대조해. 위 변환기는 이보다 앞서 양쪽 plan revision을 원본 manifest와 모두 대조해. 실제 제공 소스 검사는 browser helper가 요청하는 12경로이고, manifest의 나머지 경로까지 HTTP로 확인했다는 뜻은 아니야. `sourceCoverage.notServedHashed`를 함께 읽어. 따로 확인한 로컬 제품 전체 SHA와 HTTP 검증 범위를 구분해.

## 7. 완료시간과 FPS를 섞지 않고 비교해

| 종류 | 측정 방식 | 보고할 지표·제한 |
|---|---|---|
| 고정 품질 `MODE=sync` | 실제 앱 frame 호출 뒤 동기 `readPixels`로 완료 대기 | `completeMs` 평균·p50/p95/p99, 호출 수·삼각형. 계측·완료 대기가 포함되므로 역수를 FPS로 쓰지 않아. |
| 고정 품질 `MODE=cadence` | 통제된 fixture를 native rAF마다 호출하고 callback 시작 간격 수집 | 관찰 rAF FPS=`1000/mean(cadenceMs)`. 실제 음악·입력 부하를 모두 포함한 제품 FPS는 아니야. |
| `quality=auto` + cadence | 자동 프리셋·renderScale 변화를 허용 | 실제 품질·scale의 변화와 FPS를 함께 보고하고 동일 화질 개선율과 분리해. |
| GPU timer query | 선택적 `EXT_disjoint_timer_query_webgl2` 구간 | 드라이버 시간. 미지원·disjoint·invalid는 SKIP/null, software 값은 물리 GPU 시간으로 쓰지 않아. |

cadence를 실행하려면 위 생성기에 `--mode cadence --samples 600 --warmup 20 --output`의 새 폴더를 지정해. high 원본의 640×360 조건을 유지하면 cloud fixed 구도와 비교하기 쉽고, 네 PC의 체감 확인에는 `--width 1280 --height 720 --dpr 1` 등 실제 사용 조건을 별도 계획에 기록해. 두 해상도의 결과는 한 전후 쌍으로 비교하지 않아. 낮은 성능에서 600표본이 job 상한을 넘으면 실패를 보존하고 표본 수나 상한을 바꾼 **새 계획**으로 A/B를 함께 실행해.

1% Low는 표본 100개 이상에서만 가장 긴 `ceil(n×0.01)` 간격의 평균을 FPS로 환산해. 표본이 적으면 null로 두고 임의 값을 채우지 않아. CDP TaskDuration은 동기 대기·도구 구간을 포함할 수 있어 CPU 사용률이 아니고, texture/geometry 개수와 JS heap도 VRAM 바이트가 아니야.

같은 방식으로 medium/low나 mobile viewport를 추가할 수 있지만 양쪽 프리셋·DPR·해상도·장면·도구가 맞아야 해. mobile 인자는 이 컴퓨터의 Chromium에서 viewport·Android UA·touch를 에뮬레이션해. 실제 Android·iOS 성능이나 Safari 호환성을 입증하지 않아. Sphere low/mobile의 LITE 경로는 desktop high/medium의 실시간 3D 큐브 경로와 별개야.

## 8. 시각·음악·실제 입력은 별도로 확인해

고정 렌더 fixture는 UI를 숨기고 연주자 입장을 건너뛰며 음악 시계·관객 난수·카메라를 통제해. 실제 음표 스케줄러는 꺼져 있어. 다음 범위는 렌더 완료시간 PASS로 대신할 수 없어.

| 범위 | 확인 방법 |
|---|---|
| 동일 화면 품질 | 같은 라벨·프리셋·장면 PNG를 나란히 보고, `compare-images.py`로 MAE/RMSE/SSIM과 변경 픽셀을 계산해. 동물·악기·좌석·그림자·돔·중계 누락을 육안으로 확인해. |
| 실제 음악과 재개 | `audio-resume.mjs --help`의 `FRAME_MODE=native`, `READBACK=0`, `LIVE_WINDOW_MS` 조건을 사용하고 같은 곡·좌석에서 비교해. 실제 출력 청취와 음표 타이밍·AV 동기화는 별도로 기록해. |
| 돔 회전·전환 | `dome-motion.mjs`는 지정 각도·전환 시각의 진단이야. 4초 전환 전체를 자연스럽게 보는 검사나 실제 마우스 입력 검사와 구분해. |
| 광장·터치·방 | 광장→발권→입장→복귀, 좌석 앉기/일어나기, 터치 이동·탐색, 방 생성·입장·채팅·권한·공연장 변경을 각각 확인해. |
| 긴 감상·실물 기기 | 동일 조건 10~30분 관찰 시간을 사전에 정하고 frame/heap/오디오/발열을 남겨. 실제 iPhone/iPad Safari·Android Chrome·Windows Chrome/Edge 결과는 해당 기기에서 실행했을 때만 표시해. |

도구 도움말은 다음처럼 브라우저 실행 없이 읽을 수 있어.

```bash
node tools/bench/full-frame.mjs --help
node tools/bench/collect-plan.mjs --help
node tools/bench/audio-resume.mjs --help
node tools/bench/dome-motion.mjs --help
node tools/bench/gpu-timer.mjs --help
```

공개 PNG ZIP을 내려받아 해시를 검증하고 원본 화면을 다시 비교하는 전체 절차는 [PNG 다운로드·시각 비교 재현 안내](performance-screenshots-e741.md)에 있어. 계획·manifest는 이 저장소를 사용하고 PNG만 별도 ZIP에서 받아. 네 PC에서 새로 찍은 PNG는 같은 PC의 A/B끼리 비교하고, 클라우드 PNG와 다른 GPU·OS·폰트의 픽셀 차이를 제품 회귀로 합산하지 않아.

이미지 비교 예시는 아래와 같아. Pillow·NumPy는 제품과 분리한 Python 가상환경에 설치해. `--crop`은 문제 위치 분석에만 사용하고 전체 이미지 결과도 유지해.

```bash
python3 tools/bench/compare-images.py before.png after.png --output image-comparison.json
```

실물 휴대폰은 같은 네트워크에서 서버를 열 때 서버 HOST와 방화벽을 그 환경에 맞춰 지정하고 두 버전의 실제 URL·브라우저·기기 모델을 기록해. LAN 접속, 장시간 청감, 실제 Safari는 이 가이드 작성 과정에서 실행한 검사가 아니야.

## 9. 결과에 남길 기록

장면별 전후 표에는 제품 전체 SHA, 도구 SHA, plan/manifest SHA, 하드웨어·OS·드라이버·실제 renderer/browserVersion, CSS viewport·DPR·실제 pixelRatio, 프리셋·scale, 곡·시각·관객·카메라, 실행 순서·반복 수·표본 수, raw·로그·PNG 경로를 연결해. 고정 품질 성능, 적응형 품질, 이미지 변화, 오디오·기능 결과를 따로 판정해. 악화·FAIL·TIMEOUT·SKIP·미측정도 그대로 남겨.

이번 문서 검토는 파일 읽기와 작은 변환기 fixture 검사 범위야. 도구 코드·도움말·manifest schema를 확인하고 Python 구문과 Bash 예시의 구문을 검사했어. 변환기의 high 기본값·matrix의 기기별 크기 보존·제품/도구 해시 불일치 거부·기존 출력 보호를 별도로 확인했어. 원본 manifest의 도구 24개 SHA가 `6c78172`의 파일과 같고, 변환할 제품 경로 43개·기준에 없는 경로 5개·high 계획 8개의 양쪽 revision을 파일만 읽어 대조했어. PowerShell·설치·서버 기동·PC 계획 실행은 이 문서 검토에서 실행하지 않았어. 이 안내 자체에는 미실행 PC 측정의 성공이나 최종 main 상태를 기재하지 않았어.
