# 실제 PC에서 변경 전후를 직접 비교하기

> **과거 기준의 재현 안내야.** 아래 환경·명령·기준선은 ec5/a41 시점의 기록으로 보존했어. 현재 비교는 **e741811 → 6c78172**로 고정했으므로 새 검증에는 [최신 성능·검증 보고서](performance-e741.md), [e741 렌더 재현 안내](performance-reproduce-e741.md), [e741 재생·기능·방·로딩 안내](performance-runtime-e741.md)를 사용해. 이 문서의 옛 기준선이나 도구 버전을 최신 결과와 섞지 않아.

이 안내는 **같은 PC에서 기준 main과 PR #1을 따로 실행하고, 원시 결과를 저장해서 판단하는 순서**야. 코드를 main에 병합하거나 기존 작업 폴더의 브랜치를 바꾸지 않아. 앱 서버는 외부 npm 패키지 없이 실행하고, 측정용 Playwright·이미지 도구만 저장소 밖에 설치해.

처음에는 두 버전의 짧은 실행이 정상적으로 끝나는지 확인해. 그다음 같은 조건의 A/B/B/A 반복, 이미지 확인, 실제 조작과 음악 재생, 장시간 사용 순서로 진행하면 돼. 결과는 [PC 검증 기록 서식](pc-validation-template.md)에 남겨.

| 자세한 근거 | 내용 |
| --- | --- |
| [최신 e741 성능 보고서](performance-e741.md) | 현재 고정 비교의 변경·결과·제한. 아래 a41 절차의 결과와 구분해 |
| [측정 방법](bench-method.md) | 각 도구의 CLI, 카메라·seed·시계·표본·시간·이미지 지표 정의 |
| [런타임 검증](runtime-validation.md) | 로딩 캐시, Worker PCM, 오디오 예약, 방 UI와 프로토콜 |
| [검증 과정 기록](validation-log.md) | 기준선 변경, 계측 보정, 실패·제외한 실행, 재측정 과정 |
| [셰이더 실험](shader-experiments.md) | 채택하지 않은 후보와 출력 차이·성능 악화 근거 |

## 1. 도구와 환경을 먼저 기록해

기존 결과를 수집한 환경은 아래와 같아. **물리 GPU가 없는 환경의 SwiftShader 측정**이었고, 실제 PC·휴대폰의 60/30FPS를 확인한 결과는 아니야.

| 항목 | 기존 수집 환경 |
| --- | --- |
| 기존 실험의 기준 main | `ec5ef65fab027353b51f751ffb59aa65b863af0a` |
| 최종 비교의 기준 main | `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6` — ec5 결과와 별도 실행·집계 |
| Node / Python | `24.19.0` / `3.12.14` |
| Playwright | `1.64.1` |
| 컨테이너용 Chromium 패키지 | `@sparticuz/chromium 153.0.0` |
| 실제 브라우저 버전 | Chromium `153.0.8010.0` |
| 렌더러 | ANGLE/SwiftShader, 소프트웨어 렌더링 |
| 폰트 | `@fontsource/gowun-batang 5.3.0`, `@fontsource/ibm-plex-sans-kr 5.3.0` |
| 이미지 계산 | Pillow `12.3.0`, NumPy `2.3.5` |

앱 서버의 최소 요구사항은 Node 18이지만, **Playwright 1.64.1은 Node 20 이상**, 프로토콜 도구의 내장 WebSocket은 Node 22 이상이 필요해. 아래 전체 절차에는 **Node 22 이상, 가능하면 24.19.0**을 써. 버전을 바꾸었다면 실제 사용 버전을 기록하면 돼.

일반 PC에는 `@sparticuz/chromium`이 필요 없어. Playwright가 설치한 Chromium이나 PC에 설치된 Chrome을 사용할 수 있어. 기존 수집 환경과 같은 Chromium이 없더라도 **자기 PC의 A와 B에는 같은 브라우저 바이너리·버전**을 써. 다른 OS·GPU·브라우저에서 얻은 시간은 새 환경의 결과로 남겨. 기존 SwiftShader의 ms와 직접 섞어서 개선율을 내지 마.

## 2. main과 PR을 별도 폴더로 받아

아래는 계정 홈 아래 새 `forest-perf` 폴더를 쓰는 예시야. 이미 같은 이름이 있다면 새 이름으로 바꾸고 이후 명령의 경로도 함께 맞춰. Git, Node와 npm을 먼저 설치해 둬.

PR의 공개 브랜치는 `perf/261021-venue-rendering`이야. **최종 비교용 main은 `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`으로 고정해.** `origin/main`이 나중에 움직여도 자동으로 새 기준선을 선택하지 않아. candidate는 **실행할 때 fetch한 PR head SHA**를 기록해.

이전 실험에는 `ec5ef65fab027353b51f751ffb59aa65b863af0a`를 사용했어. 그 뒤 main에 이동·geometry·무대 발 위치·곡별 인원 변경이 들어왔으므로 두 기준선의 수치를 한 묶음으로 합치면 안 돼. 최종 비교와 이전 결과의 정확한 재현을 구분해.

### Windows PowerShell

```powershell
$ErrorActionPreference = "Stop"
$benchRoot = Join-Path $env:USERPROFILE "forest-perf"
New-Item -ItemType Directory -Force -Path $benchRoot | Out-Null
Set-Location $benchRoot
git clone https://github.com/eddy961206/forest-philharmonic.git source
if ($LASTEXITCODE -ne 0) { throw "clone 실패" }

$sourceRoot = Join-Path $benchRoot "source"
$baselineRoot = Join-Path $benchRoot "reference"
$candidateRoot = Join-Path $benchRoot "candidate"
git -C $sourceRoot fetch origin main perf/261021-venue-rendering
if ($LASTEXITCODE -ne 0) { throw "fetch 실패" }
$baselineRef = "a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6"
$candidateRef = (git -C $sourceRoot rev-parse origin/perf/261021-venue-rendering).Trim()
git -C $sourceRoot worktree add --detach $baselineRoot $baselineRef
if ($LASTEXITCODE -ne 0) { throw "reference worktree 생성 실패" }
git -C $sourceRoot worktree add --detach $candidateRoot $candidateRef
if ($LASTEXITCODE -ne 0) { throw "candidate worktree 생성 실패" }
git -C $baselineRoot rev-parse HEAD
git -C $candidateRoot rev-parse HEAD
git -C $candidateRoot status --short
Set-Location $candidateRoot
```

### macOS / Linux의 Bash 또는 Zsh

```bash
bench_root="$HOME/forest-perf"
mkdir -p "$bench_root"
cd "$bench_root"
git clone https://github.com/eddy961206/forest-philharmonic.git source

source_root="$bench_root/source"
baseline_root="$bench_root/reference"
candidate_root="$bench_root/candidate"
git -C "$source_root" fetch origin main perf/261021-venue-rendering
baseline_ref=a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6
candidate_ref=$(git -C "$source_root" rev-parse origin/perf/261021-venue-rendering)
git -C "$source_root" worktree add --detach "$baseline_root" "$baseline_ref"
git -C "$source_root" worktree add --detach "$candidate_root" "$candidate_ref"
git -C "$baseline_root" rev-parse HEAD
git -C "$candidate_root" rev-parse HEAD
git -C "$candidate_root" status --short
cd "$candidate_root"
```

어느 명령이든 실패하면 그 지점부터 확인해. worktree 생성 뒤 `status --short`가 비어 있어야 커밋 그대로의 비교야. 두 worktree는 detached 상태라 main 브랜치를 이동시키지 않아. 기존 개발 폴더를 사용하려면 `sourceRoot`만 그 저장소의 절대 경로로 바꾸고, 두 worktree의 새 경로를 골라.

공개 브랜치 대신 PR ref로 받으려면 fetch 단계에서 `git fetch origin pull/1/head:refs/remotes/origin/review-pr-1`을 쓰고, candidate SHA를 `git rev-parse refs/remotes/origin/review-pr-1`로 구해. 두 방법 중 하나를 선택하면 돼. 측정 도중 다시 fetch해서 candidate를 바꾸지 마.

### 이전 ec5 실험을 재현할 때

`reference`를 덮어쓰지 말고 `reference-ec5`라는 별도 worktree를 추가해. 예를 들어 source 저장소에서 `git worktree add --detach ../reference-ec5 ec5ef65fab027353b51f751ffb59aa65b863af0a`를 실행하면 돼. 절대 경로를 사용해도 돼. 서버 포트도 8083처럼 나누고 `BASE_URL`·`REVISION`·결과 폴더 이름에 ec5를 명시해.

원래 실험 자체를 재현하려면 baseline뿐 아니라 당시 candidate 코드·도구·fixture hash·브라우저·실행 인자·표본 수도 그 원시 파일의 조건에 맞춰야 해. 최신 PR과 ec5를 비교한 새 결과를 이전 측정과 같다고 부르면 안 돼. 이전 raw와 provenance의 위치는 [검증 과정 기록](validation-log.md)에 연결돼 있어.

## 3. 측정 도구를 저장소 밖에 설치해

이후 도구 실행은 **candidate 폴더**에서 해. baseline에는 새 도구가 없으므로, 같은 candidate의 실행기를 두 서버에 적용해야 해. 설치 폴더의 `package.json`·`package-lock.json`도 결과와 함께 보관하면 패키지 버전을 다시 확인할 수 있어.

`npm install playwright`처럼 버전을 생략하면 설치 시점의 패키지를 받으므로 기존 도구 버전을 정확히 재현하는 명령이 아니야. 아래는 사용한 패키지 버전을 고정해. 다만 `CHROME_EXECUTABLE`로 지정한 일반 Chrome의 자동 업데이트까지 고정하지는 못하므로 브라우저 실제 버전도 매번 확인해.

### Windows PowerShell

```powershell
$toolRoot = Join-Path $benchRoot "tools-runtime"
npm install --prefix $toolRoot --save-exact playwright@1.64.1 @fontsource/gowun-batang@5.3.0 @fontsource/ibm-plex-sans-kr@5.3.0
if ($LASTEXITCODE -ne 0) { throw "도구 설치 실패" }
node (Join-Path $toolRoot "node_modules/playwright/cli.js") install chromium
if ($LASTEXITCODE -ne 0) { throw "Chromium 설치 실패" }
node --version
npm --version
npm ls --prefix $toolRoot --depth=0

# 이미지 수치까지 비교할 때만 필요해. py가 없으면 설치한 Python 실행 파일을 써.
py -3 -m venv (Join-Path $benchRoot "image-runtime")
$imagePython = Join-Path $benchRoot "image-runtime/Scripts/python.exe"
& $imagePython -m pip install Pillow==12.3.0 numpy==2.3.5
& $imagePython --version
& $imagePython -m pip freeze
```

### macOS / Linux

```bash
tool_root="$bench_root/tools-runtime"
npm install --prefix "$tool_root" --save-exact playwright@1.64.1 @fontsource/gowun-batang@5.3.0 @fontsource/ibm-plex-sans-kr@5.3.0
node "$tool_root/node_modules/playwright/cli.js" install chromium
node --version
npm --version
npm ls --prefix "$tool_root" --depth=0

# 이미지 수치까지 비교할 때만 필요해.
python3 -m venv "$bench_root/image-runtime"
image_python="$bench_root/image-runtime/bin/python"
"$image_python" -m pip install Pillow==12.3.0 numpy==2.3.5
"$image_python" --version
"$image_python" -m pip freeze
```

Python은 기존 수집 때 3.12.14를 사용했어. 다른 지원 버전을 쓰면 그 버전을 적어. Linux에서 Chromium 실행에 필요한 시스템 라이브러리가 없다는 오류가 나면 Playwright 설치 출력에 표시된 해당 OS 의존성을 준비해. 이 작업을 앱의 production 의존성에 추가할 필요는 없어.

## 4. 서버 두 개를 정확한 경로에서 실행해

터미널 두 개를 새로 열어 각각 다음 중 하나를 실행해. 아래 경로는 2절에서 만든 위치를 그대로 써. 서버가 계속 실행되는 터미널은 그대로 두고, 측정은 세 번째 터미널에서 해.

### Windows PowerShell

```powershell
# 터미널 A: 기준 main
Set-Location (Join-Path $env:USERPROFILE "forest-perf/reference")
$env:HOST = "127.0.0.1"
$env:PORT = "8082"
$env:QUIET = "1"
node (Join-Path (Get-Location).Path "server.js")
```

```powershell
# 터미널 B: PR
Set-Location (Join-Path $env:USERPROFILE "forest-perf/candidate")
$env:HOST = "127.0.0.1"
$env:PORT = "8080"
$env:QUIET = "1"
node (Join-Path (Get-Location).Path "server.js")
```

### macOS / Linux

```bash
# 터미널 A: 기준 main
cd "$HOME/forest-perf/reference"
HOST=127.0.0.1 PORT=8082 QUIET=1 node "$PWD/server.js"
```

```bash
# 터미널 B: PR
cd "$HOME/forest-perf/candidate"
HOST=127.0.0.1 PORT=8080 QUIET=1 node "$PWD/server.js"
```

`server.js`는 **자기 파일 옆의 `public`**을 서비스해. cwd와 실행 파일 경로를 위처럼 명시하면 엉뚱한 checkout을 켜는 일을 피할 수 있어. 주소는 A=`http://127.0.0.1:8082/`, B=`http://127.0.0.1:8080/`야. 포트가 이미 사용 중이면 기존 프로세스를 확인하거나 양쪽 명령과 `BASE_URL`을 함께 다른 포트로 바꿔.

측정 터미널에서 실제 응답도 확인해. 아래 비교는 `/js/main.js`의 응답 바이트가 각 worktree 파일과 같은지 검사해.

```powershell
# Windows: 2절의 변수가 있는 측정 터미널에서 실행해.
Invoke-WebRequest "http://127.0.0.1:8082/js/main.js" -OutFile (Join-Path $benchRoot "reference-served.js")
Invoke-WebRequest "http://127.0.0.1:8080/js/main.js" -OutFile (Join-Path $benchRoot "candidate-served.js")
if ((Get-FileHash "$baselineRoot/public/js/main.js").Hash -ne (Get-FileHash "$benchRoot/reference-served.js").Hash) { throw "8082 소스 불일치" }
if ((Get-FileHash "$candidateRoot/public/js/main.js").Hash -ne (Get-FileHash "$benchRoot/candidate-served.js").Hash) { throw "8080 소스 불일치" }
```

```bash
# macOS / Linux
curl --fail --silent --show-error http://127.0.0.1:8082/js/main.js -o "$bench_root/reference-served.js"
curl --fail --silent --show-error http://127.0.0.1:8080/js/main.js -o "$bench_root/candidate-served.js"
cmp "$baseline_root/public/js/main.js" "$bench_root/reference-served.js"
cmp "$candidate_root/public/js/main.js" "$bench_root/candidate-served.js"
```

브라우저로 양쪽 `/music/index.json`, `/samples/manifest.json`도 열리는지 확인해. 실제 렌더 도구의 `sourceHashes`에는 서버가 응답한 주요 JS의 SHA-256이 별도로 남아. `REVISION` 문자열만 맞다고 서버 코드까지 인증된 것은 아니야.

이 사전 확인은 서버의 파일·압축 캐시를 데울 수 있어. 뒤의 loading 도구가 말하는 cold는 **새 브라우저 HTTP 캐시** 기준이야. OS·서버까지 완전히 차가운 시작을 별도로 재려면 재시작 조건과 순서를 기록해.

## 5. 실제 GPU와 공통 입력 조건을 맞춰

측정 터미널에 아래 설정을 적용해. 처음 예시는 **960×540 CSS 픽셀, 요청 DPR 1, 고정 프리셋**이야. 기존 전체 장면 자료의 기본 640×360과 다를 수 있으므로, 새 PC의 A/B끼리 비교해. 평소 1920×1080으로 쓴다면 그 크기로 바꾼 별도 A/B 묶음도 측정해야 해.

### Windows PowerShell

```powershell
# 새 측정 터미널이라면 경로와 SHA부터 다시 구해.
$benchRoot = Join-Path $env:USERPROFILE "forest-perf"
$baselineRoot = Join-Path $benchRoot "reference"
$candidateRoot = Join-Path $benchRoot "candidate"
$toolRoot = Join-Path $benchRoot "tools-runtime"
$baselineRef = (git -C $baselineRoot rev-parse HEAD).Trim()
$candidateRef = (git -C $candidateRoot rev-parse HEAD).Trim()
Set-Location $candidateRoot

$env:PLAYWRIGHT_MODULE = Join-Path $toolRoot "node_modules/playwright"
$env:FONT_MODE = "local"
$env:FONT_ROOT = Join-Path $toolRoot "node_modules/@fontsource"
$env:HEADLESS = "0"
Remove-Item Env:SOFTWARE_RENDERER -ErrorAction SilentlyContinue
Remove-Item Env:CHROME_EXECUTABLE -ErrorAction SilentlyContinue
$env:CHROME_ARGS = "[]"
$env:WIDTH = "960"
$env:HEIGHT = "540"
$env:DPR = "1"
$env:SCREENSHOTS = "1"
$env:TIMEOUT_MS = "180000"
```

### macOS / Linux

```bash
bench_root="$HOME/forest-perf"
baseline_root="$bench_root/reference"
candidate_root="$bench_root/candidate"
tool_root="$bench_root/tools-runtime"
baseline_ref=$(git -C "$baseline_root" rev-parse HEAD)
candidate_ref=$(git -C "$candidate_root" rev-parse HEAD)
cd "$candidate_root"

export PLAYWRIGHT_MODULE="$tool_root/node_modules/playwright"
export FONT_MODE=local
export FONT_ROOT="$tool_root/node_modules/@fontsource"
export HEADLESS=0
unset SOFTWARE_RENDERER CHROME_EXECUTABLE
export CHROME_ARGS='[]'
export WIDTH=960 HEIGHT=540 DPR=1 SCREENSHOTS=1 TIMEOUT_MS=180000
```

이 설정은 Playwright 관리 Chromium을 창으로 띄워. 설치된 Chrome을 쓰려면 `CHROME_EXECUTABLE`에 실제 실행 파일을 지정하면 돼. Windows 예시는 `C:\Program Files\Google\Chrome\Application\chrome.exe`, macOS는 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, Linux는 설치 위치에 따라 `/usr/bin/google-chrome` 등이야. 지정한 파일이 존재하는지 확인하고 A/B 중간에 바꾸지 마.

### 하드웨어 가속을 직접 확인해

1. 사용할 브라우저에서 `chrome://version`을 열고 버전·실행 경로·명령줄을 기록해. Playwright 관리 Chromium의 경로는 측정 터미널에서 `node -p "require(process.env.PLAYWRIGHT_MODULE).chromium.executablePath()"`로 확인할 수 있어.
2. 같은 바이너리의 `chrome://gpu`에서 Graphics Feature Status의 WebGL/WebGL2와 renderer/driver 정보를 저장해. 하드웨어 가속 사용 상태와 실제 GPU 이름을 확인해. 평소 Chrome과 다른 바이너리를 검사했다면 그 사실을 적어.
3. 실행 JSON의 `meta.renderer`, `environment.browserVersion`, `environment.headless`, `environment.chromeArgs`, `environment.softwareRequested`도 확인해. 실제 실행의 renderer에 SwiftShader·llvmpipe 같은 소프트웨어 경로가 나오면 하드웨어 GPU 측정으로 분류하면 안 돼. renderer 정보가 없으면 확인 불가로 남겨.
4. 수동 GPU 확인 창과 불필요한 GPU 작업을 닫고 한 실행씩 측정해. 노트북은 AC 전원 여부, OS 전원 모드, 선택된 내장/외장 GPU, 디스플레이 주사율·배율을 고정해.

`HEADLESS=0`만으로 하드웨어 GPU 사용이 보장되지는 않아. 기본 headless 실행도 실GPU 측정이라고 자동으로 취급하면 안 돼. 기존 컨테이너 측정에 쓰인 `SOFTWARE_RENDERER=1`과 single-process 등 특수 `CHROME_ARGS`를 일반 PC의 하드웨어 측정에 그대로 복사하지 마. 직접 추가한 인자는 원시 JSON과 [검증 과정 기록](validation-log.md)에 남아 있어. `environment.chromeArgs`에는 Playwright가 기본으로 붙이는 전체 인자가 들어 있지 않아. 예를 들어 사용한 Playwright의 headless 모드는 `--mute-audio`도 추가해. 전체 명령줄은 해당 실행의 `chrome://version`이나 CDP `Browser.getBrowserCommandLine`으로 따로 확인해야 해. [최소 오디오 진단](runtime-validation.md)의 `actualCommandLine`은 그 진단 실행에서 실제로 읽은 값이야.

### 요청 DPR과 실제 pixel ratio를 구분해

`DPR`은 브라우저 에뮬레이션의 요청값이고 앱은 품질별 상한과 scale을 적용해. 동일 품질 비교에서는 **`meta.pixelRatio`와 표본의 `quality`·`renderScale`도 같아야 해.** compare 도구가 이를 확인해. local 폰트 설치·폰트 모드도 양쪽에 동일하게 적용해.

`mobile`은 이 PC에서 viewport·UA·touch를 바꾸는 에뮬레이션이야. 실제 휴대폰의 GPU·CPU·메모리·발열·오디오 장치가 되지는 않아. 모바일 조건을 쓸 때는 `WIDTH=390`, `HEIGHT=844`, `DPR=2`로 따로 설정하고 결과 폴더를 나눠.

앱의 `LITE` 여부는 **처음 부팅할 때의 품질과 UA**로 고정돼. low로 부팅한 뒤 UI만 high로 바꾼 상태와 fresh desktop high는 같은 장면 구성이 아니야. 모바일 high도 desktop full high와 비교하면 안 돼. 자동 도구는 새 context의 localStorage에 초기 프리셋을 지정해. 수동 시험도 초기 프리셋을 맞춘 뒤 새로고침해서 시작해.

## 6. A/B/B/A 순서로 실행해

A는 고정 main, B는 PR이야. 같은 조건에서 **A1 → B1 → B2 → A2**로 실행하면 먼저 실행한 쪽만 캐시·온도 조건이 달랐는지 살펴볼 수 있어. 이 순서만으로 열 상태나 OS 잡음이 사라지지는 않아. 각 실행 전 같은 휴식 시간을 정했다면 네 번 모두 지키고 기록해.

`HEADLESS=0`으로 띄운 자동 측정도 `sync`·`cadence` 모두 앱 탭과 창을 전경에 유지해. 측정 중 창을 최소화·숨김 처리하거나 다른 탭으로 전환하지 마. 숨긴 실행은 비교에서 제외하고 같은 조건으로 다시 실행해. visibility 기록이 없는 기존 raw의 `PASS`를 모든 표본이 visible이었다는 증거로 해석하지 않아.

처음에는 `sync`, 준비 4회·표본 12개로 짧게 확인해. 모든 실행이 끝나면 새 결과 폴더에서 `cadence`, 준비 30회·표본 300개로 rAF 간격을 관찰해. **두 모드는 다른 지표라 서로의 ms를 직접 비교하지 않아.**

### Windows PowerShell

```powershell
$venue = "hall"
$quality = "high"
$device = "desktop"
$scenes = "front,mid,wide,rotate,broadcast"
$env:MODE = "sync"
$env:WARMUP = "4"
$env:SAMPLES = "12"
$env:OUTPUT_DIR = Join-Path $benchRoot "results/hall-high-desktop-sync-r1"

function Invoke-ForestRun([string]$runLabel) {
    if ($runLabel.StartsWith("A")) {
        $env:BASE_URL = "http://127.0.0.1:8082/"
        $env:REVISION = $baselineRef
    } else {
        $env:BASE_URL = "http://127.0.0.1:8080/"
        $env:REVISION = $candidateRef
    }
    node tools/bench/full-frame.mjs $runLabel $venue $quality $device $scenes
    if ($LASTEXITCODE -ne 0) { throw "$runLabel 실패: 원시 JSON과 오류부터 확인해" }
}

foreach ($runLabel in @("A1", "B1", "B2", "A2")) { Invoke-ForestRun $runLabel }

# 위 묶음을 확인한 뒤 별도 실행해. 중계는 아래의 별도 준비 조건을 써.
$scenes = "front,mid,wide,rotate"
$env:MODE = "cadence"
$env:WARMUP = "30"
$env:SAMPLES = "300"
$env:OUTPUT_DIR = Join-Path $benchRoot "results/hall-high-desktop-cadence-r1"
foreach ($runLabel in @("A1", "B1", "B2", "A2")) { Invoke-ForestRun $runLabel }
```

### macOS / Linux

```bash
venue=hall
quality=high
device=desktop
scenes=front,mid,wide,rotate,broadcast
export MODE=sync WARMUP=4 SAMPLES=12
export OUTPUT_DIR="$bench_root/results/hall-high-desktop-sync-r1"

run_forest() {
  case "$1" in
    A*) export BASE_URL=http://127.0.0.1:8082/ REVISION="$baseline_ref" ;;
    B*) export BASE_URL=http://127.0.0.1:8080/ REVISION="$candidate_ref" ;;
  esac
  node tools/bench/full-frame.mjs "$1" "$venue" "$quality" "$device" "$scenes"
}

for run_label in A1 B1 B2 A2; do run_forest "$run_label" || break; done

# 위 묶음을 확인한 뒤 별도 실행해.
scenes=front,mid,wide,rotate
export MODE=cadence WARMUP=30 SAMPLES=300
export OUTPUT_DIR="$bench_root/results/hall-high-desktop-cadence-r1"
for run_label in A1 B1 B2 A2; do run_forest "$run_label" || break; done
```

복사한 블록 전체를 무조건 한꺼번에 실행할 필요는 없어. 첫 sync 묶음에서 오류·렌더러·이미지 조건을 확인한 뒤 cadence 묶음으로 넘어가. 반복할 때는 `r2`처럼 새 `OUTPUT_DIR`을 써. 도구는 같은 파일 이름을 다시 쓰므로 기존 결과 폴더 재사용을 피해야 해.

### 두 공연장과 실제 사용 조건을 확장해

변수와 결과 폴더를 바꾸고 위 A/B/B/A 반복 부분을 다시 실행하면 돼. 이 표는 PC에서 확인할 묶음의 예시이며, 저장된 보고서와 완전히 같은 실행을 원하면 해당 원시 JSON의 조건을 그대로 사용해.

| 목적 | 공연장·프리셋·기기 | 장면과 실행 조건 |
| --- | --- | --- |
| 홀의 대표 시점 | `hall`, `high`와 `low`, `desktop` | `front,mid,wide,rotate`를 각각 sync와 cadence로 |
| Sphere의 대표 시점 | `sphere`, `high`와 `low`, `desktop` | `front,mid,wide,dome,forest,peaks,crossfade,reveal`를 같은 순서로 |
| 준비를 마친 중계의 갱신 | 각 공연장·기기, 고정 프리셋 | **`broadcast` 단독**, cadence·준비 94·표본 100 |
| 모바일 화면·터치 조건 | 각 공연장, `low` 또는 `medium`, `mobile` | 390×844, 요청 DPR 2. desktop 결과와 별도 묶음으로 |
| 효과가 겹치는 짧은 구간 | 각 공연장, 고정 프리셋 | **`effects-peak` 단독**, sync·준비 4·표본 6 |
| 활성 빔까지 겹치는 구간 | 각 공연장, 고정 프리셋 | **`effects-show` 단독**, sync·준비 4·표본 6 |
| 평소 해상도의 사용감 | 사용하는 공연장·프리셋 | WIDTH/HEIGHT/DPR을 평소 조건으로 바꾼 새 묶음과 아래 실제 앱 시험 |

효과 장면은 파티클이 소멸하므로 300프레임 평균을 같은 peak 부하라고 부르면 안 돼. 두 효과 장면은 서로 다른 프로세스에서 실행해. 일반 장면 목록 끝에 하나를 넣는 방법도 있지만 그 경우 양쪽의 앞선 장면 순서까지 같아야 해.

관객 fill 0.8·seed 417, 일반 난수 seed 417, UUID seed 874, 곡 `beethoven-ode-to-joy`, 기준 음악 시각 25초와 중계 5초는 fixture가 정해. **시나리오 순서·warmup·표본 수까지 동일하게 유지해.** 상태가 누적되는 연주자 포즈 때문에 카메라만 같아서는 충분하지 않아.

### 중계의 첫 활성화와 준비 후 갱신을 나눠

low 중계는 90프레임마다 촬영해. baseline은 준비 4회 안에 첫 촬영을 하지 않을 수 있지만 PR은 처음 켜진 화면을 즉시 그려. 따라서 짧은 warmup 뒤 받은 표본에는 **첫 shader/render 준비 시점의 차이**가 섞여. 그 결과를 계속 재생 중인 중계의 순수한 갱신 비용 개선으로 해석하면 안 돼.

준비 후 갱신은 `broadcast` 단독으로 **`WARMUP=94`, `MODE=cadence`, `SAMPLES=100`**을 양쪽에 동일하게 지정해. 기존 A/B 함수의 장면·준비·표본 변수와 결과 폴더를 바꾼 뒤 네 번 실행하면 돼. 최소 한 번의 90프레임 갱신을 준비 구간에서 거친 조건이야. n=100은 여전히 짧으므로 새 폴더에서 A/B/B/A 묶음을 반복해.

중계의 음악 시각은 5초부터 step마다 증가해. Sphere에서는 11초 부근을 지나면 IMAG 사용 상태가 바뀔 수 있어. 준비 94회에 표본을 무조건 300개 이상 더해 놓고 같은 중계 구간이라고 해석하지 마. 여기서는 94/100 조건을 그대로 사용해.

**처음 켤 때의 비용·첫 그림 지연은 준비 없는 별도 시험**으로 남겨. 정상 앱에서 새로 입장하거나 중계를 껐다 켠 실제 UI 동작과 첫 화면을 DevTools trace·화면 기록으로 관찰해. portable full-frame의 `WARMUP`은 1 이상만 받으므로 `WARMUP=0` 명령은 지원하지 않아. functional 도구는 즉시 촬영 계약을 확인하지만 첫 활성화 지연의 시간 벤치를 대신하지 않아. 앞의 짧은 sync smoke에 포함한 broadcast 결과도 이 구분을 적용해.

### `sync`와 `cadence`의 정확한 범위

- `sync`의 `completeMs`는 실제 앱 `frame()`과 동기 `readPixels` 완료까지의 벽시계 시간이야. JS·드라이버·완료 대기가 섞여 있고 앱 FPS나 순수 GPU 시간이 아니야.
- `cadence`의 `cadenceMs`는 외부 네이티브 rAF callback 시작 사이의 실제 간격이야. GPU 완료를 강제로 기다리지 않아.
- **수동 프리셋의 sync/cadence는 시각 애니메이션·음악 시각을 step당 1/60초로 제어해.** 실제 오디오 스케줄러를 끄고 UI를 숨긴 fixture야. 특히 수동 fixture 안의 앱 `__fp.stats.fps`는 실제 사용 FPS 비교 지표가 아니야.
- 자동 품질은 `MODE=cadence`와 quality=`auto`로 탐색해. 이때는 `lastNow`를 강제로 되감지 않고 실제 경과시간을 전달하며, 애니메이션 dt 상한은 **정상 앱과 같은 0.05초**야. baseline의 dt 기반 정책과 PR의 raw elapsed 기반 정책은 각자의 원래 코드대로 실행돼. 결과의 `fixturePolicy.animationDtCapSeconds=0.05`와 `automaticClock`, 실제 프리셋·scale을 확인해.
- **자동 품질에서도 음악 시각은 step당 1/60초로 제어하고 음표 scheduler는 꺼져 있어.** 실제 오디오와 조작을 함께 쓰는 성능은 9~10절에서 정상 앱으로 따로 확인해. 자동 모드는 해상도·프리셋이 변하므로 동일 화질 개선율에는 포함하지 않아. compare 도구도 auto 비교를 거부해.

이전 ec5 auto 결과는 하네스가 자동 모드에도 1/60초 dt 상한을 줘서 baseline의 원래 품질 하강을 막을 수 있었어. 원본은 보존했지만 **자동 품질 개선 근거에서는 제외해**. 새 auto 비교에는 수정한 실행기의 0.05초 조건을 써야 해. 자세한 제외 기록은 [검증 과정 기록](validation-log.md)에 있어. 정책 함수에 인위적인 frame 간격을 직접 넣는 단위 검사는 이 브라우저 하네스 오류와 별도야.

## 7. 원시 JSON과 이미지로 비교해

실행 결과는 `${라벨}-full-${공연장}-${품질}-${기기}-${모드}.json`에 남아. `status: PASS`, 오류 없음, 실제 renderer와 입력 조건부터 확인해. `PASS`는 실행기 검사를 통과했다는 뜻이지 목표 FPS나 화질이 자동 합격했다는 뜻은 아니야.

논리적인 기준선은 언제나 A야. 역순으로 실행한 B2/A2도 **비교 인자는 A2, B2 순서**로 넣어야 변화율 방향이 같아. 아래는 6절의 홀 high desktop cadence 결과를 고르는 예시야. 다른 묶음은 결과 폴더와 파일 이름을 함께 바꿔.

### Windows PowerShell

```powershell
$compareDir = Join-Path $benchRoot "results/hall-high-desktop-cadence-r1"
$suffix = "full-hall-high-desktop-cadence.json"
function Save-ForestComparison([string]$a, [string]$b, [string]$name) {
    $jsonLines = node tools/bench/compare.mjs (Join-Path $compareDir "$a-$suffix") (Join-Path $compareDir "$b-$suffix")
    if ($LASTEXITCODE -ne 0) { throw "조건이 다른 실행은 비교하지 않아" }
    # Windows PowerShell에서도 BOM 없는 UTF-8 JSON으로 남겨.
    [IO.File]::WriteAllText((Join-Path $compareDir "$name.json"), ($jsonLines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
}
Save-ForestComparison A1 B1 compare-A1-B1
Save-ForestComparison A2 B2 compare-A2-B2

$imagePython = Join-Path $benchRoot "image-runtime/Scripts/python.exe"
& $imagePython tools/bench/compare-images.py `
    (Join-Path $compareDir "A1-full-hall-high-desktop-cadence-wide.png") `
    (Join-Path $compareDir "B1-full-hall-high-desktop-cadence-wide.png") `
    --output (Join-Path $compareDir "image-A1-B1-wide.json")
```

### macOS / Linux

```bash
compare_dir="$bench_root/results/hall-high-desktop-cadence-r1"
suffix=full-hall-high-desktop-cadence.json
node tools/bench/compare.mjs "$compare_dir/A1-$suffix" "$compare_dir/B1-$suffix" > "$compare_dir/compare-A1-B1.json"
node tools/bench/compare.mjs "$compare_dir/A2-$suffix" "$compare_dir/B2-$suffix" > "$compare_dir/compare-A2-B2.json"

image_python="$bench_root/image-runtime/bin/python"
"$image_python" tools/bench/compare-images.py \
  "$compare_dir/A1-full-hall-high-desktop-cadence-wide.png" \
  "$compare_dir/B1-full-hall-high-desktop-cadence-wide.png" \
  --output "$compare_dir/image-A1-B1-wide.json"
```

모드나 장면을 바꿨다면 파일 이름도 맞춰. 이미지 도구는 두 이미지의 크기가 다르면 중단해. 프레임 수·시각·폰트가 다른 이미지를 자동으로 정렬해서 비슷하게 만드는 기능은 없어. MAE/RMSE·uniform 7×7 SSIM의 정의는 [측정 방법](bench-method.md#5-결과-json과-이미지-비교)에 있어.

좌석 실루엣·등받이·난간·악기·관객 얼굴, 무대 중계의 자막·첫 화면, Sphere의 나뭇가지·산등성이·세계 전환도 직접 확대해서 봐. 필요한 경우 `--crop x,y,width,height`로 같은 관심 영역을 추가 비교해. 전 화면 SSIM이 높아도 작은 대상이 사라진 문제는 남을 수 있어. 개선된 첫 중계 화면처럼 의도한 변화는 차이의 이유와 해당 이미지를 함께 기록해.

### 숫자를 판단하는 순서

1. **조건이 맞는지:** 비교기가 거부하면 원시 값을 바꾸거나 불리한 표본을 삭제해서 통과시키지 마. 버전·fixture·카메라·표본 수·순서·폰트·실제 pixel ratio부터 맞춰 다시 실행해.
2. **양방향 반복이 일관적인지:** `percent`는 `(B-A)/A×100`이야. 시간의 음수는 짧아졌다는 뜻이야. A1/B1만 개선되고 A2/B2는 반대라면 열 상태·실행 순서·작은 표본 잡음을 먼저 의심해. A1/A2와 B1/B2의 자체 변동폭도 같이 봐.
3. **느린 구간이 남는지:** 평균·p50·p95와 원시 `samples`를 함께 봐. nearest-rank p95는 n=12에서 가장 긴 표본이고 n=5에서도 사실상 최대값이야. 작은 표본의 p95/p99를 안정적인 최악 성능이라고 부르지 마.
4. **드문 끊김을 충분히 관찰했는지:** **n<100이면 1% Low는 미측정으로 기록해.** n=100이어도 가장 긴 한 간격에 좌우돼. n=300도 장시간 사용을 대신하지 않아.
5. **품질을 유지했는지:** 자동 품질의 scale/프리셋 변경으로 빨라진 결과는 동일 품질의 개선과 구분해. draw call·triangle 감소만으로 시간 감소나 화질 보존을 확정하지 마.

cadence 비교 JSON의 `scenarios.장면.observedRafFps`는 **1000 / 평균 외부 rAF 간격(ms)**이야. `onePercentLowRafFps`는 n≥100일 때 **1000 / 느린 상위 `ceil(n×0.01)`개 간격의 평균(ms)**으로 계산해. n<100이면 해당 필드 전체가 `null`이고, n과 계산에 쓴 느린 표본 수는 `rafCadence`에 있어. 프레임별 순간 FPS를 산술평균한 값이 아니야. 두 FPS 필드의 양수 변화는 callback 빈도가 높아졌다는 뜻이지만, 제어한 시각 시계·음악 scheduler off 조건은 그대로야. **sync 비교에는 이 FPS 필드가 없어.**

## 8. 로딩·오디오·방·입력도 별도로 검증해

그래픽 벤치와 **동시에 실행하지 마.** 여기서는 도구별 기본 viewport를 쓰기 위해 `WIDTH`, `HEIGHT`, `DPR` override를 먼저 지워. 새 결과 폴더를 쓰고, loading·audio-stability의 A/B를 비교할 때는 아래 `BASE_URL`·`REVISION`을 해당 서버에 맞게 바꿔.

```powershell
# Windows: PR 검증의 시작 설정
Remove-Item Env:WIDTH, Env:HEIGHT, Env:DPR -ErrorAction SilentlyContinue
$env:BASE_URL = "http://127.0.0.1:8080/"
$env:REVISION = $candidateRef
$env:OUTPUT_DIR = Join-Path $benchRoot "results/runtime-candidate-r1"
$env:LABEL = "pc-candidate"
```

```bash
# macOS / Linux: PR 검증의 시작 설정
unset WIDTH HEIGHT DPR
export BASE_URL=http://127.0.0.1:8080/ REVISION="$candidate_ref"
export OUTPUT_DIR="$bench_root/results/runtime-candidate-r1"
export LABEL=pc-candidate
```

아래 `node` 명령은 두 OS에서 같아. 한 명령이 끝난 뒤 다음 것을 실행해.

```sh
npm test
node tools/bench/functional.mjs
node tools/bench/audio-worker.mjs pc-candidate
node tools/bench/multiplayer.mjs pc-candidate
node tools/bench/rooms.mjs pc-candidate hall cross
node tools/bench/rooms.mjs pc-candidate sphere core

node tools/bench/loading.mjs pc-candidate hall desktop
node tools/bench/loading.mjs pc-candidate sphere desktop
node tools/bench/loading.mjs pc-candidate hall mobile
node tools/bench/loading.mjs pc-candidate sphere mobile
node tools/bench/audio-stability.mjs pc-candidate hall desktop 65
node tools/bench/audio-stability.mjs pc-candidate sphere desktop 65
```

| 도구 | 무엇을 확인하는지 | 해석 범위 |
| --- | --- | --- |
| `npm test` | geometry·좌석·돔·자막·listener·박수·음표·자동 품질 회귀 | PR의 계약을 검증해. 변경 전 코드에 새 동작의 테스트를 적용해 통과를 요구하지 않아 |
| `functional.mjs` | 두 공연장×desktop/mobile의 실제 버튼·키보드·CDP touch·앉기·재생·설정 | main rAF를 잡고 명시적으로 렌더하는 PR 기능 검사야. 정상 앱의 자연스러운 전체 동선 시간/FPS는 아니야 |
| `audio-worker.mjs` | 실제 module Worker, CSP 차단 fallback, 원본 4종 PCM과 채널별 해시 일치 | PR의 새 Worker 경로 검사야. baseline에 Worker 기능이 있다고 가정하지 않아 |
| `multiplayer.mjs` | 새 localhost 서버의 방·권한·동기화·채팅·handoff·정적 파일 | 별도 서버를 자동 시작·종료해. Node 22+가 필요하고 Worker 파일 검사 때문에 PR checkout에서 실행해 |
| `rooms.mjs` | 실제 두 탭의 비공개 방 생성/입장·초대 공연장 이동·권한·채팅·방장 넘기기 | 새 localhost 테스트 방만 써. volume 0과 제한한 렌더를 사용하므로 음질/FPS 증거는 아니야 |
| `loading.mjs` | 새 context cold와 같은 context warm, 준비 버튼·longtask·다운로드·캐시 | 실제 샘플·악보·박수 준비를 하되 반복 장면 렌더는 멈춘 통제된 부팅이야 |
| `audio-stability.mjs` | 실제 입장·착석·공연 시작, 65초 AudioContext와 음표 예약·신호·pause 정리 | 시각 갱신 5Hz, 반복 WebGL 렌더 없음. 낮은 시각 갱신 빈도와 GPU 정체를 구분해 |

loading과 audio-stability는 같은 candidate 도구로 A 서버에서도 실행할 수 있어. A는 `BASE_URL=http://127.0.0.1:8082/`, `REVISION=기준 SHA`, 라벨 `pc-reference`, `OUTPUT_DIR`을 `results/runtime-reference-r1`의 절대 경로로 바꿔 위 해당 명령을 반복해. 두 버전의 준비시간은 cold끼리·warm끼리 비교해. 오디오 종료시각은 조금 다를 수 있으므로 note 개수의 차이를 성능 개선으로 계산하지 마.

loading은 관객 전용 seed 417을 사용하고, 실제 관객 수와 정렬한 점유 좌석 hash가 cold/warm에서 같아야 통과해. 전후도 파일 비교기로 확인해. 아래 Hall desktop 예시를 나머지 공연장·기기에 각각 적용하고, `passed=true`일 때만 시간 관측을 나란히 읽어. 각 cold/warm은 한 번의 관측이라 작은 차이를 확정적인 개선율로 해석하지 않아.

```powershell
node tools/bench/compare-loading.mjs `
    (Join-Path $benchRoot "results/runtime-reference-r1/loading-pc-reference-hall-desktop.json") `
    (Join-Path $benchRoot "results/runtime-candidate-r1/loading-pc-candidate-hall-desktop.json") `
    (Join-Path $benchRoot "results/runtime-candidate-r1/loading-comparison-hall-desktop.json")
if ($LASTEXITCODE -ne 0) { throw "로딩 조건이 달라: 원시 결과와 비교 실패 항목을 확인해" }
```

```bash
node tools/bench/compare-loading.mjs \
  "$bench_root/results/runtime-reference-r1/loading-pc-reference-hall-desktop.json" \
  "$bench_root/results/runtime-candidate-r1/loading-pc-candidate-hall-desktop.json" \
  "$bench_root/results/runtime-candidate-r1/loading-comparison-hall-desktop.json"
```

loading은 HTTP 캐시를 유지하는 로컬 proxy를 사용해. **여기에 Playwright request route를 추가하거나 cold 측정 전에 같은 context로 샘플을 미리 받아 두면 안 돼.** 캐시 적중이 없는 warm을 정상 결과로 고치지 말고 실제 요청 기록을 확인해. 관객 RNG를 격리하려고 main의 한 줄만 치환한 응답은 identity·별도 QA ETag로 제공하고 `controlledMainFixture`로 분류해. 이 전송량은 원래 gzip main의 크기가 아니야. 다른 JS·MP3·vendor·악보는 원래 응답·캐시 정책을 전달해. 원문/제공 main SHA, 관객 seed/점유 좌석, 샘플 수·PCM bytes, 도구 hash까지 비교기에 남겨. 자세한 필드와 제한은 [런타임 검증](runtime-validation.md)에 있어.

## 9. 정상 앱에서 60/30FPS 목표를 판단해

여기서는 fixture 도구를 종료하고 정상 브라우저로 A와 B를 직접 열어. 혼자 보기로 입장해서 같은 곡·좌석·시선·창 크기·초기 프리셋으로 공연을 시작해. 걸어가기, 시선 회전, 중계, Sphere 세계 전환, 효과가 겹치는 순간도 각각 확인해. `camera.position`만 한 번 바꾸면 다음 Director 갱신이 덮어쓰므로 정확한 좌표 비교에는 위의 fixture를 써.

수동 앱의 관객 난수와 공연 진행은 자동으로 고정되지 않아. 관객 수·곡·시각·좌석을 기록하고, 이 관찰을 제어한 장면의 픽셀 동일성 검사로 취급하지 마. baseline의 기존 FPS 표시와 PR의 수정한 FPS 표시는 집계 방식이 다를 수 있어. 두 HUD 숫자만 나란히 놓고 개선율을 내지 않아.

정상 재생 중 실제 rAF callback 간격을 60초 남기고 싶으면 Chrome DevTools Console에 아래 코드를 한 번 실행해. 앱 frame 함수·음악 시계는 바꾸지 않아. 기록 중에는 탭을 전경에 두고 DevTools의 별도 프로파일링을 켜지 마.

```js
(() => {
  const rows = [];
  const visibility = [{ at: performance.now(), state: document.visibilityState }];
  const snapshot = () => ({
    musicTime: window.__fp?.perf.time,
    piece: window.__fp?.perf.piece?.id,
    audioState: window.__fp?.engine.ctx?.state,
    qualitySetting: window.__fp?.settings.quality,
    appliedQuality: window.__fp?.stats?.quality,
    renderScale: window.__fp?.stats?.renderScale,
    pixelRatio: window.__fp?.renderer.getPixelRatio(),
  });
  const initial = snapshot();
  const onVisibility = () => visibility.push({ at: performance.now(), state: document.visibilityState });
  document.addEventListener('visibilitychange', onVisibility);
  let first, previous;
  function sample() {
    const now = performance.now();
    if (first === undefined) first = now;
    if (previous !== undefined) rows.push(now - previous);
    previous = now;
    if (now - first < 60000) { requestAnimationFrame(sample); return; }
    document.removeEventListener('visibilitychange', onVisibility);
    const sorted = [...rows].sort((a, b) => a - b);
    const p = q => sorted[Math.ceil(sorted.length * q) - 1];
    window.__pcLiveResult = {
      kind: 'normal-app-live-raf', userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      initial, end: snapshot(), visibility,
      durationMs: now - first, intervals: rows.length,
      callbackHz: rows.length * 1000 / (now - first),
      p50Ms: p(.5), p95Ms: p(.95), p99Ms: p(.99), samplesMs: rows,
    };
    console.log(window.__pcLiveResult);
  }
  requestAnimationFrame(sample);
})();
```

완료 뒤 Console에서 `copy(JSON.stringify(window.__pcLiveResult, null, 2))`를 실행하면 JSON을 클립보드로 복사할 수 있어. A/B 각각 파일로 저장하고 당시 곡과 좌석·품질·전원 조건을 기록해. 이 값도 **rAF callback 빈도**이지 디스플레이에 실제 표시된 모든 프레임이나 GPU timer 측정은 아니야. DevTools가 열린 상태의 계측 비용도 들어가므로 전후에 같은 방식으로 수행해. 숨김·최소화가 기록됐으면 전경 목표 판정과 분리해.

| 목표 | 판단할 내용 |
| --- | --- |
| 60FPS를 원하는 PC 조건 | 프레임 예산은 약 16.7ms야. 정상 공연·회전·중계·세계 전환에서도 rAF 간격과 긴 프레임을 관찰해. 평균만 좋고 33/50ms 이상으로 자주 밀리는지 확인해 |
| 30FPS를 원하는 저사양 조건 | 프레임 예산은 약 33.3ms야. 같은 설정에서 조작과 음악이 유지되는지 보고, 자동 품질이라면 실제 scale/프리셋 변화와 보이는 차이를 함께 기록해 |
| 고주사율 화면 | callback 빈도에는 모니터 주사율과 브라우저 스케줄링도 영향을 줘. 60Hz·120Hz 실행을 같은 조건이라고 합치지 마 |
| 품질 유지 | 동일 프리셋 비교와 자동 품질 조절을 별도 판정해. 텍스트 가독성·객체 누락·돔 전환·중계 갱신에 문제가 없는지 직접 확인해 |

p95가 예산에 어느 정도 근접해야 하는지, 긴 프레임을 몇 번까지 허용할지는 시험 전에 기록 서식에 정해 둬. 주사율 경계의 작은 지터까지 보편적인 실패 기준으로 단정하지 말고 같은 기기의 반복 결과와 실제 끊김을 함께 판단해. 여기서 실행하지 않은 GPU·실제 Android/iPhone·iOS Safari의 결과는 미측정으로 남겨.

## 10. DevTools 프로파일과 15~30분 착석 시험

### 프로파일은 별도 한 번씩 떠

성능 수치 수집과 분리해서 A/B에서 같은 장면을 한 번씩 녹화해. Chrome DevTools Performance 패널에서 CPU·network throttling을 끈 상태로 20~30초 정도의 재생·회전·중계 전환을 담고 trace를 저장해. 어떤 동작을 언제 했는지도 메모해.

Main thread의 long task, JS와 GC, rendering/paint, Worker 작업, 예약 시각 주변 정체를 살펴봐. 같은 이름의 함수 시간이 줄었는지보다 전체 긴 프레임과 작업 이동을 함께 봐. 서로 겹치는 계측 구간의 시간을 합산하지 마. Memory heap snapshot이나 allocation profiling은 다시 별도 실행해. 그것을 켠 채 받은 프레임 시간을 원래 벤치와 섞으면 안 돼.

CPU 4× slowdown 시험을 추가하고 싶다면 조건을 표시한 별도 결과로 남겨. **CPU 4×는 실제 저사양 PC나 모바일 기기를 재현하지 않아.** GPU·메모리 대역폭·열 제어·오디오 장치까지 같은 비율로 느려지는 것이 아니야. 화면 에뮬레이션·CPU 제한·실제 폰을 각각 구분해.

### 실제 소리와 지속 사용을 확인해

65초 audio-stability 도구는 61~68초 범위만 받아. 15~30분 검증은 그 인자만 늘리지 말고 **정상 앱을 실제 렌더·오디오와 함께 사용**해서 수행해.

1. 기기를 같은 실내 조건에 두고 전원 모드·AC/배터리·잔량·디스플레이·브라우저 버전·오디오 출력 장치를 기록해. 다른 부하 작업과 자동 업데이트를 피하고, A/B 시작 전 식히는 시간도 맞춰.
2. 같은 공연장·초기 품질·좌석에서 프로그램을 15~30분 재생해. 시작·5분·15분·30분 시점의 rAF/체감 끊김·메모리 관찰값·CPU/GPU 온도 또는 확인 불가를 적어. 도구별 메모리 값이 JS heap인지 프로세스 메모리인지 구분해.
3. 헤드폰이나 실제 스피커로 음 누락·딱딱거림·지연·좌우 방향·잔향을 들어 봐. 자리와 시선을 바꾼 뒤의 공간 음향, pause/resume/seek, 곡 전환과 박수도 확인해. analyser 신호나 PCM 해시만으로 출력 장치 underrun까지 통과했다고 쓰지 마.
4. 정해진 시점에 다른 탭으로 갔다 돌아오는 시험을 별도로 해. 숨긴 시간·문서 visibility·음악 지속 여부·복귀 첫 화면·중계·quality 회복을 기록해. 전경 FPS 구간과 숨김 구간을 합산하지 마. OS가 탭을 suspend한 조건도 남겨.
5. 장시간 뒤 같은 좌석·시점에서 화면이 처음보다 느려졌는지, WebGL context lost나 console/page 오류가 생겼는지 확인해. 열이 오른 상태의 A와 차가운 상태의 B를 직접 비교하지 말고, 순서를 바꾼 실행도 남겨.

실제 휴대폰을 추가로 검증할 때는 기기 자체의 브라우저로 접속하고 모델·SoC·OS·브라우저·배터리·전원·온도를 기록해. 이 문서의 `127.0.0.1` 서버는 PC 안에서만 접속할 수 있어. 개인 테스트 네트워크에서 모바일 접속을 별도로 허용한다면 서버 bind와 접속 주소를 해당 네트워크 조건에 맞춰 바꾸고, 연결 방식도 결과에 남겨. 로컬 모바일 화면 에뮬레이션 결과를 그 실기기 결과로 대체하면 안 돼.

## 11. 결과를 남길 때

[PC 검증 기록 서식](pc-validation-template.md)을 결과 폴더에 복사해 채워. raw JSON·PNG·비교 JSON·환경/도구 버전·정확한 두 SHA·명령·trace와 수동 관찰을 함께 보관해. 원시 파일은 다시 숫자를 채우거나 실패 표본을 지우지 말고, 제외 여부와 이유를 별도 기록해.

완료되지 않은 파일, 잘못된 renderer, 다른 순서·표본 수·폰트, 브라우저 종료나 context lost, cold/warm 캐시 오류, 예상한 CSP 차단과 예상하지 못한 오류를 구분해. 수정한 harness로 다시 실행했다면 이전 실행과 새 실행의 도구 SHA·조건을 연결해. 현재 작업에서 이런 문제를 어떻게 다뤘는지는 [검증 과정 기록](validation-log.md), [런타임 근거 목록](performance-data/runtime/manifest.json), [기각한 셰이더 실험 자료](performance-data/shader-experiments/README.md)에서 확인할 수 있어.

판정은 **같은 품질의 전후 변화**, **자동 품질을 포함한 사용감**, **기능·오디오 안정성**, **미측정 조건**으로 나눠 적어. 개선된 장면과 느려진 장면을 둘 다 남기면 다른 PC에서도 결과를 비교하고 판단할 수 있어.
