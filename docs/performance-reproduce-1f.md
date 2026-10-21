# main 1f 기준: 실제 PC에서 성능·화질·음악을 비교하는 재현 절차

이 문서는 **동일한 PC에서 고정된 기준선 A와 후보 B를 직접 비교하는 실행 안내**야. 결과표를 대신하는 PASS 보고서가 아니야. 광장·로비 개선이 합쳐진 main `1f8e5f1`을 기준으로 하며, [6a 안내](performance-reproduce-6a.md)와 과거 a41/3f/6a 결과는 당시 버전의 별도 자료로 보존해.

처음에는 짧은 Hall/Sphere 한 쌍으로 실행 환경을 확인하고, 같은 품질의 반복 측정, 이미지 비교, 실제 음악과 입력, 장시간 사용 순서로 진행해. 결과를 판단할 때는 **A. 같은 품질의 성능 변화**와 **B. 자동 품질이 실제 해상도·효과를 바꾸며 얻는 안정성**을 분리해. high에서 low로 내린 효과를 A에 포함하지 않아. 구조와 남은 병목은 [1f 구조 감사](architecture-audit-1f.md)를 참고해.

이 안내의 CLI는 저장소 코드와 도움말로 확인했어. 문서에 포함한 Python은 AST, Bash는 bash -n, Console JavaScript는 node --check로 구문을 확인했어. PowerShell은 실행하거나 PowerShell parser로 검증하지 않았어. 문서를 작성하면서 브라우저 벤치마크나 설치·서버·계획 실행을 하지 않았고, Windows·macOS·Linux 실물 PC, iPhone/iPad, Android의 실행 성공을 보장하는 문서가 아니야. **실제로 실행한 환경과 항목에만 결과를 채워.**

## 1. 제품 두 버전과 수집 도구를 각각 고정해

| 역할 | 전체 Git SHA | 실행 위치 |
| --- | --- | --- |
| 기준선 A | `1f8e5f16f1eee03140e13ba1ee66832841559604` | `reference` worktree, 서버 `18083` |
| 후보 B | `dea7997c6278f10ff467815ab96b370362549b0c` | `candidate` worktree, 서버 `18084` |
| 이 안내의 수집 도구 | `cc0f9da70083b35818b0bca70487e0609d4609c4` | `collector` worktree, 양쪽 서버에 같은 도구 적용 |
| 계획·소스 명세 | 위 도구 커밋의 `docs/performance-data/main-1f/` | 원본 계획 4개, `source-manifest.json`, `collector-manifest.json` |

[기준선 소스](https://github.com/eddy961206/forest-philharmonic/tree/1f8e5f16f1eee03140e13ba1ee66832841559604), [후보 제품](https://github.com/eddy961206/forest-philharmonic/tree/dea7997c6278f10ff467815ab96b370362549b0c), [고정 수집 도구와 계획](https://github.com/eddy961206/forest-philharmonic/tree/cc0f9da70083b35818b0bca70487e0609d4609c4/docs/performance-data/main-1f)을 서로 구분해. 도구 체크아웃에서 서버까지 실행하면 제품 B가 아닌 그 체크아웃의 제품을 검사할 수 있어. 아래는 제품 서버와 도구를 별도 worktree에 둬서 이를 피하는 절차야.

`REVISION`은 연산자가 적는 라벨이야. 라벨만 맞는 것으로는 충분하지 않아. 실제 HTTP 응답 해시, 제품 파일 명세, collector·fixture·helper 해시를 함께 확인해. 기준선과 후보의 제품 해시가 서로 다른 것은 정상이고, **각각 의도한 커밋과 일치해야 해.** 도구 파일은 양쪽에 동일해야 해.

측정 도중 main이나 PR이 갱신돼도 이 worktree를 pull하거나 수정하지 않아. 새 제품이나 도구를 시험하려면 새 SHA·계획·결과 폴더를 만들어. 후속 도구 버전을 쓰면 위 도구 SHA와 명세도 함께 갱신해서 새 실행으로 남기고, 과거 raw의 `revision`이나 해시를 덮어쓰지 않아.

## 2. 설치와 worktree 준비

Git, Node 22 이상, npm, Python 3를 준비해. 앱 서버 자체는 저장소의 Node 서버로 실행하고 별도 프런트엔드 빌드가 필요하지 않아. 이 안내가 Node 22 이상을 사용하는 이유는 프로토콜 검사에서 Node의 내장 `WebSocket`을 쓰기 때문이야. 서버의 최소 Node 버전과 검증 도구의 요구 조건은 같지 않아. [프로토콜 수집기](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/multiplayer.mjs)

아래 `forest-perf-1f`는 새 실험 폴더 예시야. 이미 있다면 새 이름을 정해. 원래 개발 폴더를 지우거나 main에 커밋할 필요는 없어.

### Windows PowerShell

Windows Node·Python과 Windows Chrome/Edge로 실행하는 예시야. WSL은 다른 OS·그래픽 경로이므로 별도 환경으로 기록해. 아래 PowerShell 구문은 **이 작업에서 실제 Windows에서 실행하지 않았어.** 네이티브 프로그램의 오류를 놓치지 않도록 `$LASTEXITCODE`를 확인해.

```powershell
$ErrorActionPreference = "Stop"
$benchRoot = Join-Path $env:USERPROFILE "forest-perf-1f"
New-Item -ItemType Directory -Path $benchRoot | Out-Null
Set-Location $benchRoot
git clone https://github.com/eddy961206/forest-philharmonic.git source
if ($LASTEXITCODE -ne 0) { throw "clone 실패" }

$sourceRoot = Join-Path $benchRoot "source"
$baselineRoot = Join-Path $benchRoot "reference"
$candidateRoot = Join-Path $benchRoot "candidate"
$collectorRoot = Join-Path $benchRoot "collector"
$baselineRef = "1f8e5f16f1eee03140e13ba1ee66832841559604"
$candidateRef = "dea7997c6278f10ff467815ab96b370362549b0c"
$collectorRef = "cc0f9da70083b35818b0bca70487e0609d4609c4"

git -C $sourceRoot fetch origin main perf/261021-venue-rendering
if ($LASTEXITCODE -ne 0) { throw "fetch 실패" }
git -C $sourceRoot worktree add --detach $baselineRoot $baselineRef
if ($LASTEXITCODE -ne 0) { throw "기준선 worktree 생성 실패" }
git -C $sourceRoot worktree add --detach $candidateRoot $candidateRef
if ($LASTEXITCODE -ne 0) { throw "후보 worktree 생성 실패" }
git -C $sourceRoot worktree add --detach $collectorRoot $collectorRef
if ($LASTEXITCODE -ne 0) { throw "도구 worktree 생성 실패" }
git -C $baselineRoot rev-parse HEAD
git -C $candidateRoot rev-parse HEAD
git -C $collectorRoot rev-parse HEAD
git -C $baselineRoot status --short
git -C $candidateRoot status --short
git -C $collectorRoot status --short
Set-Location $collectorRoot
```

### macOS / Linux: Bash

```bash
set -e
bench_root="$HOME/forest-perf-1f"
mkdir "$bench_root"
cd "$bench_root"
git clone https://github.com/eddy961206/forest-philharmonic.git source

source_root="$bench_root/source"
baseline_root="$bench_root/reference"
candidate_root="$bench_root/candidate"
collector_root="$bench_root/collector"
baseline_ref=1f8e5f16f1eee03140e13ba1ee66832841559604
candidate_ref=dea7997c6278f10ff467815ab96b370362549b0c
collector_ref=cc0f9da70083b35818b0bca70487e0609d4609c4

git -C "$source_root" fetch origin main perf/261021-venue-rendering
git -C "$source_root" worktree add --detach "$baseline_root" "$baseline_ref"
git -C "$source_root" worktree add --detach "$candidate_root" "$candidate_ref"
git -C "$source_root" worktree add --detach "$collector_root" "$collector_ref"
git -C "$baseline_root" rev-parse HEAD
git -C "$candidate_root" rev-parse HEAD
git -C "$collector_root" rev-parse HEAD
git -C "$baseline_root" status --short
git -C "$candidate_root" status --short
git -C "$collector_root" status --short
cd "$collector_root"
```

세 `status --short` 출력은 모두 비어 있어야 해. 수정한 제품을 비교할 때는 별도 worktree와 전체 diff를 남겨. 브랜치가 나중에 삭제돼 fetch가 실패하면 공개 SHA를 fetch할 수 있는지 먼저 확인하고, 다른 커밋을 몰래 대신 사용하지 않아.

### 저장소 밖에 측정용 의존성 설치

이 안내는 기존 검증에서 사용한 Playwright `1.64.1`, Fontsource 두 패키지 `5.3.0`을 고정해. 최신 버전이라는 뜻은 아니야. 앱 서버에는 이 패키지들이 필요하지 않아. 생성된 `tools-runtime/package.json`과 `package-lock.json`을 보존해.

```powershell
$toolRoot = Join-Path $benchRoot "tools-runtime"
npm install --prefix $toolRoot --save-exact playwright@1.64.1 @fontsource/gowun-batang@5.3.0 @fontsource/ibm-plex-sans-kr@5.3.0
if ($LASTEXITCODE -ne 0) { throw "도구 설치 실패" }
node (Join-Path $toolRoot "node_modules/playwright/cli.js") install chromium
if ($LASTEXITCODE -ne 0) { throw "Chromium 설치 실패" }
node --version
npm --version
py -3 --version
npm ls --prefix $toolRoot --depth=0
```

```bash
tool_root="$bench_root/tools-runtime"
npm install --prefix "$tool_root" --save-exact playwright@1.64.1 @fontsource/gowun-batang@5.3.0 @fontsource/ibm-plex-sans-kr@5.3.0
node "$tool_root/node_modules/playwright/cli.js" install chromium
node --version
npm --version
python3 --version
npm ls --prefix "$tool_root" --depth=0
```

일반 Chrome/Edge 실행 파일을 지정한다면 Playwright 번들 Chromium 설치는 생략할 수 있어. Linux에서 시스템 라이브러리가 부족하면 설치 출력에 나온 해당 배포판 안내를 따라 준비해. 패키지나 브라우저 버전을 바꿨다면 실제 버전·이유를 적고 A/B 양쪽을 함께 바꿔.

## 3. 서버 두 개와 동일한 하드웨어 브라우저 준비

### 제품 서버는 별도 터미널에서 실행해

```powershell
# 서버 A 터미널
Set-Location (Join-Path $env:USERPROFILE "forest-perf-1f/reference")
$env:HOST = "127.0.0.1"
$env:PORT = "18083"
node server.js
```

```powershell
# 서버 B 터미널
Set-Location (Join-Path $env:USERPROFILE "forest-perf-1f/candidate")
$env:HOST = "127.0.0.1"
$env:PORT = "18084"
node server.js
```

```bash
# 서버 A 터미널
cd "$HOME/forest-perf-1f/reference"
HOST=127.0.0.1 PORT=18083 node server.js
```

```bash
# 서버 B 터미널
cd "$HOME/forest-perf-1f/candidate"
HOST=127.0.0.1 PORT=18084 node server.js
```

세 번째 측정 터미널은 항상 `collector`에서 실행해. 두 서버를 켜 두는 것은 괜찮지만 GPU 측정 브라우저는 한 번에 하나만 실행해. 별도 A/B 탭이나 다른 GPU 벤치마크를 동시에 돌리지 않아.

### 실제 HTTP 소스와 포트 확인

아래는 main.js, CSS, index 응답을 로컬 제품과 바이트 비교하는 예시야. CSS는 모바일 터치 영역의 겹침에도 영향을 주므로 JS만 확인하지 않아. 이 다운로드는 측정 결과가 아니라 소스 확인 자료야.

```powershell
$servedRoot = Join-Path $benchRoot "served-source"
New-Item -ItemType Directory -Path $servedRoot | Out-Null
$servers = @(
  @{ Name = "baseline"; Url = "http://127.0.0.1:18083"; Root = $baselineRoot },
  @{ Name = "candidate"; Url = "http://127.0.0.1:18084"; Root = $candidateRoot }
)
foreach ($server in $servers) {
  foreach ($asset in @("js/main.js", "css/style.css", "index.html")) {
    $saved = Join-Path $servedRoot ($server.Name + "-" + $asset.Replace("/", "_"))
    Invoke-WebRequest ($server.Url + "/" + $asset) -OutFile $saved
    $local = Join-Path $server.Root ("public/" + $asset)
    if ((Get-FileHash $saved).Hash -ne (Get-FileHash $local).Hash) {
      throw ("제공 소스 불일치: " + $server.Name + " " + $asset)
    }
  }
}
```

```bash
mkdir "$bench_root/served-source"
for side in baseline candidate; do
  if [ "$side" = baseline ]; then
    server_url=http://127.0.0.1:18083
    product_root="$baseline_root"
  else
    server_url=http://127.0.0.1:18084
    product_root="$candidate_root"
  fi
  for asset in js/main.js css/style.css index.html; do
    saved="$bench_root/served-source/$side-$(basename "$asset")"
    curl --fail --silent --show-error "$server_url/$asset" -o "$saved"
    cmp "$product_root/public/$asset" "$saved"
  done
done
```

확인 작업이 서버·OS 캐시를 데울 수 있어. 뒤의 loading 도구에서 cold는 **새 브라우저 HTTP 캐시**를 뜻하며, 서버·디스크·OS까지 최초 실행한 상태를 뜻하지 않아.

### 측정 터미널의 공통 환경

```powershell
Set-Location $collectorRoot
$env:PLAYWRIGHT_MODULE = Join-Path $toolRoot "node_modules/playwright"
$env:FONT_MODE = "local"
$env:FONT_ROOT = Join-Path $toolRoot "node_modules/@fontsource"
$env:HEADLESS = "0"
$env:CHROME_ARGS = "[]"
$env:TIMEOUT_MS = "240000"
Remove-Item Env:SOFTWARE_RENDERER, Env:CHROME_EXECUTABLE -ErrorAction SilentlyContinue
Remove-Item Env:WIDTH, Env:HEIGHT, Env:DPR, Env:MODE, Env:SAMPLES, Env:WARMUP -ErrorAction SilentlyContinue
Remove-Item Env:FRAME_MODE, Env:READBACK, Env:LIVE_WINDOW_MS, Env:FIXED_AUDIENCE_SEED, Env:QUALITY, Env:PRELUDE_FRAMES, Env:PRE_PAUSE_MS, Env:SEEK_SECONDS, Env:PIECE_ID -ErrorAction SilentlyContinue
Remove-Item Env:SCOPE, Env:SCENARIO, Env:NAVIGATION, Env:CONTINUE_ON_TRANSPORT_FAIL, Env:EXPECTED_AUTO_PRESET -ErrorAction SilentlyContinue
```

```bash
cd "$collector_root"
export PLAYWRIGHT_MODULE="$tool_root/node_modules/playwright"
export FONT_MODE=local FONT_ROOT="$tool_root/node_modules/@fontsource"
export HEADLESS=0 CHROME_ARGS='[]' TIMEOUT_MS=240000
unset SOFTWARE_RENDERER CHROME_EXECUTABLE WIDTH HEIGHT DPR MODE SAMPLES WARMUP
unset FRAME_MODE READBACK LIVE_WINDOW_MS FIXED_AUDIENCE_SEED QUALITY PRELUDE_FRAMES PRE_PAUSE_MS SEEK_SECONDS PIECE_ID
unset SCOPE SCENARIO NAVIGATION CONTINUE_ON_TRANSPORT_FAIL EXPECTED_AUTO_PRESET
```

`SOFTWARE_RENDERER`를 설정하지 않으면 수집기가 SwiftShader 옵션을 추가하지 않아. **이것만으로 물리 GPU 사용이 보장되지는 않아.** `--use-angle=swiftshader`, `--disable-gpu`, `--single-process` 같은 컨테이너용 옵션을 PC 명령에 복사하지 않아. OS·원격 데스크톱·브라우저가 소프트웨어 경로를 택할 수 있으니 실제 renderer를 확인해.

현재 helper는 Playwright의 `chromium.launch`를 사용하며 `BROWSER_CHANNEL`이나 `channel` 환경변수를 지원하지 않아. 설치한 Chrome/Edge를 쓰려면 `CHROME_EXECUTABLE`에 실제 실행 파일을 지정해. A/B 모두 같은 파일을 사용해. [브라우저 helper](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/browser.mjs)

| 브라우저 예시 | `CHROME_EXECUTABLE` 경로 예시 |
| --- | --- |
| Windows Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` |
| Windows Edge | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` |
| macOS Chrome | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| macOS Edge | `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge` |
| Linux Chrome | `/usr/bin/google-chrome`. 설치 위치를 직접 확인해. |

PowerShell은 `$env:CHROME_EXECUTABLE = "실제 경로"`, Bash는 `export CHROME_EXECUTABLE="실제 경로"`로 지정해. 존재 여부와 실제 브라우저 버전을 확인해. Chrome과 Edge는 각각 별도 A/B 묶음으로 기록해. 이 helper로 Firefox·Safari·실제 휴대폰을 자동화했다고 표현하지 않아.

사용할 브라우저의 `chrome://version` 또는 `edge://version`, `chrome://gpu` 또는 `edge://gpu`에서 버전·실행 파일·전체 명령줄·GPU·드라이버·WebGL 상태를 보관해. raw의 `environment`·`meta.renderer`도 대조해. SwiftShader/llvmpipe는 소프트웨어 렌더러로 표시하고, GPU 이름이나 하드웨어 사용을 확인할 수 없으면 확인 불가로 남겨. `environment.chromeArgs`는 사용자가 전달한 옵션이며 Playwright 기본 인자를 포함한 전체 명령줄은 아니야.

확인용 창은 닫고 측정 창만 전경에 둬. 창 최소화, 화면 잠금, 다른 탭 전환이 생긴 실행을 전경 성능 결과에 섞지 않아. 주사율·화면 배율·창 크기·AC/배터리·전원 모드·브라우저 확대를 양쪽 동일하게 맞춰.

폰트 `local`은 고정 Fontsource 파일로 외부 폰트 변동을 줄여. `system`은 Google Fonts CSS를 비우고 대체 글꼴을 쓰므로 원래 글꼴의 시각 품질 확인으로 계산하지 않아. `network`는 실제 외부 폰트를 가져오며 인터넷·DNS·외부 캐시 조건까지 기록해야 해. 서로 다른 폰트 모드의 로딩·전송량·PNG를 같은 조건으로 비교하지 않아.

## 4. 계측 범위와 새 돔 준비 검사

[full-frame](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/full-frame.mjs)은 앱의 실제 `frame()`을 사용해. 재현성을 위해 관객·카메라·무대 배치·음악 시각을 통제하며, 실제 AudioContext는 생성하지만 **음표 스케줄러는 끄고 합성 음악 시계를 사용해.** 음악의 정확성·음질은 별도 실재생 검사로 확인해야 해. [장면 fixture](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/full-frame-fixture.js)

| 수집 항목 | 뜻과 한계 |
| --- | --- |
| `MODE=sync`의 `completeMs` | `frame()`부터 1×1 `readPixels` 완료까지의 벽시계 시간. JS·드라이버·GPU 대기가 함께 들어가. **앱 FPS로 역산하지 않아.** |
| `submitMs` / `completionWaitMs` | 제출 호출과 이후 완료 대기를 나눈 값. 각각 순수 CPU·순수 GPU 시간은 아니야. |
| `MODE=cadence`의 `cadenceMs` | 강제 readback 없는 네이티브 rAF callback 시작 간격. 관찰 rAF FPS를 계산할 수 있지만 디스플레이에 실제 표시된 프레임 수와 같지는 않아. |
| `calls` / `triangles` | 그림자·중계·돔·후처리를 포함한 수집 프레임의 렌더 제출 통계. 누적 범위를 맞춰 비교해. |
| `geometries` / `textures` | Three 리소스의 개수. GPU 메모리 바이트가 아니야. |
| `performance.memory` / CDP `JSHeapUsedSize` | 서로 다른 API 관찰값. 합산하거나 차이의 원인을 숫자만으로 단정하지 않아. VRAM·프로세스 RSS·오디오 네이티브 메모리와도 달라. |
| `cdpDurationDeltaMs` | 장면 수집 전후 Task/Script/Layout/RecalcStyle 누적 시간의 차이. QA와 동기 대기 비용도 들어갈 수 있어 CPU 사용률이나 순수 프레임 CPU 비용으로 읽지 않아. |
| `phaseMeanMs` | 계측한 메서드 호출 경과 시간. 중계·렌더 제출 등이 중첩되므로 더해서 전체 CPU 시간으로 쓰지 않아. |
| full-frame의 `gpuTimer` | 확장 존재 여부. 실제 query를 하지 않으므로 여기의 GPU 시간은 미측정이야. 실제 query는 9절의 별도 도구를 사용해. |

고정 조건은 곡 `beethoven-ode-to-joy`, 음악 시각 25초(중계는 5초), step마다 1/60초 진행, 관객 fill 0.8·seed 417, Math.random seed 417, 별도 UUID seed 874야. 같은 장면 순서·카메라/FOV·프리셋·표본 수·warmup·도구 해시를 맞춰. `fixture.lite`, 실제 pixel ratio, 모든 표본의 품질과 `renderScale`도 확인해. 수동 비교에서 요청 프리셋만 같은 것으로는 충분하지 않아.

기본 desktop은 **640×360, DPR 1**, mobile은 **390×844, DPR 2**야. 이 mobile은 같은 PC의 Chromium에서 UA·viewport·touch를 에뮬레이션한 조건이야. 실제 휴대폰 GPU·메모리·발열·Safari를 재현하지 않아. 640×360 성능을 1920×1080 성능으로 옮겨 해석하지 않아. 실제 사용 해상도는 별도 계획으로 A/B 모두 같게 바꿔.

low/Lite로 부팅한 후 UI에서 high로 바꾼 상태와 처음부터 high로 부팅한 상태는 다를 수 있어. Sphere Lite의 세계 대체 장면과 full 3D 세계도 같은 화질로 묶지 않아.

### UI 준비, 돔 가시성, 실제 셰이더 제출을 나눠 확인해

새 main은 UI-ready와 비동기 돔 준비가 분리돼 있어. 고정 도구의 full-frame은 다음을 기록해.

1. `initialReadiness.status=READY`와 `uiReady`, Sphere의 `dome.visible`을 확인하고 fixture를 시작해. 돔을 강제로 visible로 바꾸지 않아.
2. 각 장면의 **기존 warmup**에서 base와 필요한 overlay가 실제 메인 카메라 렌더에 제출되는지 관찰해.
3. `scenarios[name].domeReadiness`에 `status`, `roles`의 `draws/mainCameraDraws/visible/required`와 프로그램 `status/id/ready/linked/diagnosticsRunnable`, 경로·mix·reveal·world·parallelShaderCompile을 남겨.
4. warmup hook을 복원하고 프로그램 확인을 마친 뒤 측정 표본을 수집해. 준비 검사 시간을 측정 프레임 시간에 섞지 않아. Sphere가 `UNVERIFIED`이면 해당 실행을 FAIL로 보존해. Hall은 `NOT_APPLICABLE`이야.

`READY`만으로 실제 픽셀·화질이 검증된 것은 아니야. 역할별 draw/program 증거와 PNG를 함께 봐. 이 안내의 `collect-plan`은 로그·소스·표본 조건을 검사하지만 새 readiness 필드를 모두 별도로 재검증하는 도구는 아니므로 원시 `domeReadiness`도 확인해.

loading/functional은 **읽기 전용 `mesh.visible===true` 관찰**을 추가했어. loading의 기존 버튼 준비 시간과 네트워크 스냅샷은 유지하고, 돔 관찰의 전후 상태·추가 대기를 별도로 남겨. 이 관찰은 compile 성공·메인 카메라 draw·첫 픽셀 완료를 증명하지 않아. GPU timer 도구도 돔 visible을 기다리지만 full-frame의 역할별 warmup draw/program 보고서를 저장하는 검사는 아니야. 각 도구의 PASS 범위를 서로 확대하지 않아.

## 5. 먼저 짧은 한 쌍을 실행해

다음은 Hall high desktop front의 sync 확인이야. 예열 4회·측정 8회라 실행 여부와 장면을 확인하는 용도야. 장기 FPS 판정에 쓰지 않아.

```powershell
$env:OUTPUT_DIR = Join-Path $benchRoot "results/quick-r1"
$env:MODE = "sync"
$env:SAMPLES = "8"
$env:WARMUP = "4"
$env:SCREENSHOTS = "1"
$env:BASE_URL = "http://127.0.0.1:18083/"
$env:REVISION = $baselineRef
node tools/bench/full-frame.mjs baseline-quick hall high desktop front
if ($LASTEXITCODE -ne 0) { throw "기준선 quick 실패: 원본 보존 후 확인" }
$env:BASE_URL = "http://127.0.0.1:18084/"
$env:REVISION = $candidateRef
node tools/bench/full-frame.mjs candidate-quick hall high desktop front
if ($LASTEXITCODE -ne 0) { throw "후보 quick 실패: 원본 보존 후 확인" }
```

```bash
export OUTPUT_DIR="$bench_root/results/quick-r1" MODE=sync SAMPLES=8 WARMUP=4 SCREENSHOTS=1
BASE_URL=http://127.0.0.1:18083/ REVISION="$baseline_ref" node tools/bench/full-frame.mjs baseline-quick hall high desktop front
BASE_URL=http://127.0.0.1:18084/ REVISION="$candidate_ref" node tools/bench/full-frame.mjs candidate-quick hall high desktop front
```

이후 같은 명령의 `hall ... front`를 `sphere high desktop forest`로 바꿔 두 공연장 모두 확인해. Sphere의 `initialReadiness`와 `domeReadiness`, PNG에 실제 돔·숲이 보이는지 점검해. 같은 파일 이름은 덮어쓰는 수집기도 있으므로 재시도는 `quick-r2`처럼 새 출력 폴더를 사용해. 실패 JSON·PNG·로그를 남겨.

`TIMEOUT_MS`는 브라우저 준비·조작과 각 cadence 장면의 수집 제한이야. full-frame의 모든 준비 프레임과 sync 수집 전체를 감싸는 총 제한은 아니야. 매우 느린 환경에서 오래 걸리면 완료하지 못한 조건과 중단 지점을 기록하고, 미완료 파일을 성능 통계에 넣지 않아.

## 6. 공개된 네 계획을 PC에서 재현해

[계획 설명과 원본](https://github.com/eddy961206/forest-philharmonic/tree/cc0f9da70083b35818b0bca70487e0609d4609c4/docs/performance-data/main-1f)은 다음 범위야. **28·12·33·4는 계획한 프로세스 수이며 PASS 수나 전후 비교쌍 수가 아니야.**

| 계획 | 범위 | 표본·해석 |
| --- | --- | --- |
| `render-plan.json`, 28 jobs | Hall/Sphere × high/medium/low × desktop/mobile × A/B 24회, desktop high의 역순 B2/A2 4회 | sync, 장면당 SAMPLES 8·WARMUP 4. 동일 품질 완료 시간과 PNG |
| `cadence-plan.json`, 12 jobs | low의 두 공연장·두 viewport A/B 8회, mobile auto A/B 4회 | low 120표본·warmup 12, auto 160표본·warmup 4. 후자는 적응형 관찰 |
| `runtime-plan.json`, 33 jobs | 광장 4, 후보 전체 기능 4, 기준선 모바일 transport 2, 로딩 8, 실제 렌더+음표 30초 4, 별도 65초 음표 6, 방/프로토콜 3, 의식/수면 2 | 기능·로딩·오디오의 서로 다른 검사. 모두가 대칭 A/B 성능 측정은 아니야. |
| `gpu-plan.json`, 4 jobs | Hall high desktop front, Sphere high desktop forest 각각 A/B | 실제 timer query, SAMPLES 4·WARMUP 4. 지원·유효성 확인이 필요해. |

Hall render 순서는 `front,wide,foyer,rotate,broadcast,broadcast-hidden,broadcast-return,effects-show`야. Sphere는 `front,wide,rotate,dome,forest,peaks,ocean,clouds,crossfade,reveal,broadcast,effects-show`야. Sphere의 일반 셰이더·세계·전환과 양쪽 이동/회전 fixture를 각각 구분해. `effects-show`는 조명·레이저를 준비한 뒤 폭죽·색종이를 발생시키므로 마지막에 둬. 이전 장면의 진행 상태가 이어질 수 있어 순서도 동일 조건의 일부야.

**8표본의 nearest-rank p95/p99는 최댓값 한 개이며, 1% Low나 60/30FPS 지속 여부를 판단하기에 부족해.** 120표본의 1% Low도 느린 2개 간격에 의존해. auto 160표본은 실제 경과 시간이 기기마다 달라 정책의 유지 시간·히스테리시스·회복까지 관찰했다는 뜻이 아니야.

### PC 경로에 맞춘 계획 사본 만들기

아래 Python을 저장소 밖 `<benchRoot>/prepare-pc-plan.py`로 저장해. 제품·도구 SHA와 명세를 검증하고 원본을 `published`에 보존하면서 PC용 사본을 만들어. `multiplayer.mjs`의 `REPO_DIR`는 반드시 **candidate 제품 worktree**를 가리키게 해. 그렇지 않으면 기본값인 collector 체크아웃의 서버를 검사할 수 있어.

```python
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

BASE = '1f8e5f16f1eee03140e13ba1ee66832841559604'
CANDIDATE = 'dea7997c6278f10ff467815ab96b370362549b0c'
TOOLS = 'cc0f9da70083b35818b0bca70487e0609d4609c4'
p = argparse.ArgumentParser()
p.add_argument('--collector', type=Path, required=True)
p.add_argument('--baseline-dir', type=Path, required=True)
p.add_argument('--candidate-dir', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
args = p.parse_args()
collector = args.collector.resolve()
baseline = args.baseline_dir.resolve()
candidate = args.candidate_dir.resolve()
out = args.output.resolve()
digest = lambda data: hashlib.sha256(data).hexdigest()

def git(root, *parts):
    return subprocess.check_output(['git', '-C', str(root), *parts], text=True).strip()

for root, expected in [(collector, TOOLS), (baseline, BASE), (candidate, CANDIDATE)]:
    if git(root, 'rev-parse', 'HEAD') != expected:
        raise SystemExit(f'HEAD 불일치: {root}')
    if git(root, 'status', '--porcelain'):
        raise SystemExit(f'깨끗한 worktree가 아니야: {root}')

published = collector / 'docs/performance-data/main-1f'
manifest_bytes = (published / 'source-manifest.json').read_bytes()
manifest = json.loads(manifest_bytes)
if manifest['baseline'] != BASE or manifest['candidate'] != CANDIDATE:
    raise SystemExit('제품 manifest의 기준 SHA가 달라')
for entry in manifest['files']:
    for side, root in [('baseline', baseline), ('candidate', candidate)]:
        target = root / entry['path']
        expected = entry[side + 'Sha256']
        actual = digest(target.read_bytes()) if target.exists() else None
        if actual != expected:
            raise SystemExit(f'제품 해시 불일치: {side} {entry["path"]}')

tool_bytes = (published / 'collector-manifest.json').read_bytes()
for entry in json.loads(tool_bytes)['files']:
    if digest((collector / entry['path']).read_bytes()) != entry['sha256']:
        raise SystemExit(f'도구 해시 불일치: {entry["path"]}')

out.mkdir(parents=True, exist_ok=False)
(out / 'published').mkdir()
(out / 'source-manifest.json').write_bytes(manifest_bytes)
(out / 'collector-manifest.json').write_bytes(tool_bytes)
records = []
labels = set()
for name, expected_count in [('render', 28), ('cadence', 12), ('runtime', 33), ('gpu', 4)]:
    file = name + '-plan.json'
    original = (published / file).read_bytes()
    jobs = json.loads(original)
    if len(jobs) != expected_count:
        raise SystemExit(f'계획 개수 불일치: {name}')
    (out / 'published' / file).write_bytes(original)
    for job in jobs:
        env = job.setdefault('env', {})
        revision = env.get('REVISION')
        if revision not in [BASE, CANDIDATE]:
            raise SystemExit(f'알 수 없는 제품: {job["id"]}')
        env['BASE_URL'] = 'http://127.0.0.1:' + ('18083/' if revision == BASE else '18084/')
        if job['script'] == 'tools/bench/multiplayer.mjs':
            env['REPO_DIR'] = str(candidate)
        if job['script'] in ['tools/bench/plaza.mjs', 'tools/bench/functional.mjs',
                             'tools/bench/rituals.mjs']:
            env['LABEL'] = 'pc1f-' + job['id']
            if env['LABEL'] in labels:
                raise SystemExit('CLI 호출 간 LABEL 중복')
            labels.add(env['LABEL'])
    adapted = (json.dumps(jobs, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    (out / file).write_bytes(adapted)
    records.append({'file': file, 'jobs': len(jobs),
                    'publishedSha256': digest(original), 'pcSha256': digest(adapted)})
provenance = {
    'baseline': BASE, 'candidate': CANDIDATE, 'collector': TOOLS,
    'paths': {'baseline': str(baseline), 'candidate': str(candidate),
              'collector': str(collector)},
    'changes': ['local server URLs', 'candidate REPO_DIR for protocol',
                'unique per-invocation LABEL for plaza/functional/rituals'],
    'sourceManifestSha256': digest(manifest_bytes),
    'collectorManifestSha256': digest(tool_bytes), 'plans': records,
}
(out / 'pc-adaptation.json').write_text(
    json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(provenance, ensure_ascii=False, indent=2))
```

```powershell
$planRoot = Join-Path $benchRoot "plans-pc-r1"
py -3 "$benchRoot/prepare-pc-plan.py" --collector $collectorRoot --baseline-dir $baselineRoot --candidate-dir $candidateRoot --output $planRoot
if ($LASTEXITCODE -ne 0) { throw "계획 준비 실패" }
py -3 tools/bench/run-plan.py "$planRoot/render-plan.json" --output "$benchRoot/results/render-r1"
if ($LASTEXITCODE -ne 0) { throw "render 실패/중단: logs와 raw 확인" }
# 아래 묶음들은 위 결과를 확인한 뒤 하나씩 실행해.
py -3 tools/bench/run-plan.py "$planRoot/cadence-plan.json" --output "$benchRoot/results/cadence-r1"
if ($LASTEXITCODE -ne 0) { throw "cadence 실패/중단" }
py -3 tools/bench/run-plan.py "$planRoot/runtime-plan.json" --output "$benchRoot/results/runtime-r1"
if ($LASTEXITCODE -ne 0) { throw "runtime 실패/중단" }
py -3 tools/bench/run-plan.py "$planRoot/gpu-plan.json" --output "$benchRoot/results/gpu-r1"
if ($LASTEXITCODE -ne 0) { throw "gpu 프로세스 실패: SKIP 여부도 raw에서 확인" }
```

```bash
plan_root="$bench_root/plans-pc-r1"
python3 "$bench_root/prepare-pc-plan.py" --collector "$collector_root" --baseline-dir "$baseline_root" --candidate-dir "$candidate_root" --output "$plan_root"
python3 tools/bench/run-plan.py "$plan_root/render-plan.json" --output "$bench_root/results/render-r1"
python3 tools/bench/run-plan.py "$plan_root/cadence-plan.json" --output "$bench_root/results/cadence-r1"
python3 tools/bench/run-plan.py "$plan_root/runtime-plan.json" --output "$bench_root/results/runtime-r1"
python3 tools/bench/run-plan.py "$plan_root/gpu-plan.json" --output "$bench_root/results/gpu-r1"
```

실행은 위에서부터 순차적으로 하고 각 묶음의 오류를 먼저 확인해. 실패를 보존하면서 나머지도 조사하려면 `--continue-on-failure`를 사용해. 이 옵션이 FAIL을 PASS로 바꾸지는 않아.

`run-plan.py`는 `logs/NNN-id.json`과 `.log`에 계획 해시·실행 collector 해시·명령·시각·exit code를 기록해. index는 0부터 시작하고 `--end`는 포함하지 않아. 예를 들어 `--start 10 --end 12`는 10·11번만 실행해. 이미 기록된 로그는 덮어쓰지 않으므로 미실행 index부터 재개하고, 중단·실패한 index의 재시도는 새 출력 폴더에 남겨. `RUNNING`은 완료가 아니야. 파일의 존재와 프로세스 exit 0만으로 모든 세부 검사의 PASS를 판단하지 않아. 특히 GPU 도구는 SKIP도 exit 0이야. [실행기](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/run-plan.py)

job의 `env`가 터미널 환경변수보다 우선해. 터미널 `SAMPLES`를 바꿔도 계획에 적힌 표본 수는 바뀌지 않아. 크기·DPR·표본 수·warmup 변경은 **계획 사본의 각 job**에 명시하고 새 이름으로 저장해. desktop과 mobile이 섞인 계획에 전역 `WIDTH/HEIGHT`를 지정하면 두 조건을 모두 바꿀 수 있어.

## 7. 자기 PC의 실제 해상도에서 A/B/B/A를 반복해

기본 계획은 소표본 통제 비교야. 실제 사용 해상도에서 프레임 안정성을 판단하려면 더 긴 cadence 실험을 추가해. 아래 코드를 `<benchRoot>/make-cadence-abba.py`로 저장하면 한 공연장·프리셋·viewport 조건에 대해 A1 → B1 → B2 → A2 계획을 만들 수 있어. 동일 코드·장면이지만 **공개 28-job과 다른 새 실험**이야.

```python
import argparse
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--venue', choices=['hall', 'sphere'], required=True)
p.add_argument('--quality', choices=['high', 'medium', 'low', 'auto'], required=True)
p.add_argument('--device', choices=['desktop', 'mobile'], required=True)
p.add_argument('--scenes', default='front,wide')
p.add_argument('--samples', type=int, default=1800)
p.add_argument('--warmup', type=int, default=94)
p.add_argument('--width', type=int, required=True)
p.add_argument('--height', type=int, required=True)
p.add_argument('--dpr', type=float, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
if min(a.samples, a.warmup, a.width, a.height, a.dpr) <= 0:
    p.error('표본·warmup·해상도·DPR은 양수여야 해')
refs = {'baseline': '1f8e5f16f1eee03140e13ba1ee66832841559604',
        'candidate': 'dea7997c6278f10ff467815ab96b370362549b0c'}
jobs = []
for side, repeat in [('baseline', 'a'), ('candidate', 'a'),
                     ('candidate', 'b'), ('baseline', 'b')]:
    label = f'{side}-pc-{repeat}'
    jobs.append({
        'id': f'{label}-{a.venue}-{a.quality}-{a.device}',
        'script': 'tools/bench/full-frame.mjs',
        'args': [label, a.venue, a.quality, a.device, a.scenes],
        'directory': 'render',
        'env': {'BASE_URL': 'http://127.0.0.1:' + ('18083/' if side == 'baseline' else '18084/'),
                'REVISION': refs[side], 'MODE': 'cadence',
                'SAMPLES': a.samples, 'WARMUP': a.warmup, 'SCREENSHOTS': 1,
                'WIDTH': a.width, 'HEIGHT': a.height, 'DPR': a.dpr,
                'TIMEOUT_MS': 600000},
    })
with a.output.open('x', encoding='utf-8') as f:
    json.dump(jobs, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(a.output)
```

```powershell
py -3 "$benchRoot/make-cadence-abba.py" --venue hall --quality high --device desktop --width 1920 --height 1080 --dpr 1 --scenes "front,wide" --output "$planRoot/hall-high-1080-r1.json"
if ($LASTEXITCODE -ne 0) { throw "ABBA 계획 생성 실패" }
py -3 tools/bench/run-plan.py "$planRoot/hall-high-1080-r1.json" --output "$benchRoot/results/hall-high-1080-r1"
if ($LASTEXITCODE -ne 0) { throw "ABBA 실행 실패" }
```

```bash
python3 "$bench_root/make-cadence-abba.py" --venue hall --quality high --device desktop --width 1920 --height 1080 --dpr 1 --scenes "front,wide" --output "$plan_root/hall-high-1080-r1.json"
python3 tools/bench/run-plan.py "$plan_root/hall-high-1080-r1.json" --output "$bench_root/results/hall-high-1080-r1"
```

Sphere는 `--venue sphere --scenes front,wide,dome,forest,crossfade`처럼 바꾸고 별도 계획·출력 폴더에 저장해. 다른 프리셋·실제 화면 크기·mobile viewport도 조건별로 새 계획을 만들어. 처음에는 주요 장면부터 확인하고, 실제로 병목이 남은 세계·중계·효과를 추가해.

1800은 시간 초가 아니라 callback 간격 표본 수야. 같은 표본 수라도 기기마다 실제 소요 시간이 달라. 1% Low는 이 경우 느린 18개 간격의 평균에 의존해. warmup 94는 기존 low 중계의 90-frame 주기를 넘겨 관찰할 수 있도록 정한 추가 조건이며 모든 셰이더·열 상태가 완전히 안정됐다는 뜻은 아니야. warmup 4의 초기 상태 관찰과 섞어 평균을 내지 않아.

여유가 있으면 같은 조건을 최소 3개의 독립 묶음으로 반복하고 순서도 바꿔. 매번 새 BrowserContext에서 시작하며, 동일한 냉각·전원 조건을 맞춰. 개별 run과 A/B 차이를 모두 남기고 프레임 수천 개를 서로 독립인 실험 수천 회처럼 취급하지 않아. 평균 FPS만 좋아지고 1% Low·p95가 악화되는 경우도 그대로 기록해.

auto는 같은 생성기로 실행할 수 있지만 다음 제한을 따로 적용해.

- `MODE=cadence`에서만 관찰하고 매 표본의 실제 프리셋·`renderScale`·pixel ratio와 PNG를 함께 봐.
- fixture는 `phase='playing'`을 유지해. 후보는 공연 중 프리셋 변경·품질 회복을 제한하므로 **이 fixture로 곡 사이 회복 정책까지 통과했다고 주장할 수 없어.**
- 실제 앱에서 부하가 큰 장면을 충분히 유지한 뒤 곡 사이·인터미션으로 이동하고, 다시 여유 있는 장면에서 품질이 회복되는지 따로 확인해. 다운/업 횟수·시각·히스테리시스·target 재할당 끊김을 기록해.
- 해상도나 효과가 달라진 auto 결과는 같은 품질의 high/medium 성과표에 섞지 않아.

[품질 정책](https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/quality.js)과 [실제 앱의 적용 조건](https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/main.js)을 함께 참고해.

## 8. 소스·조건을 먼저 검증하고 집계해

`collect-plan.mjs`는 full-frame 계획만 읽는 파일 집계 도구야. 브라우저를 실행하거나 원시 파일을 수정하지 않아. render와 cadence는 각각 집계해. runtime/GPU 계획을 이 도구에 넣지 않아.

```powershell
node tools/bench/collect-plan.mjs --plan "$planRoot/render-plan.json" --root "$benchRoot/results/render-r1" --manifest "$planRoot/source-manifest.json" --output "$benchRoot/results/render-r1-analysis"
if ($LASTEXITCODE -ne 0) { Write-Warning "제외/미완료/조건 불일치가 있어. summary의 excluded를 확인해." }
node tools/bench/collect-plan.mjs --plan "$planRoot/cadence-plan.json" --root "$benchRoot/results/cadence-r1" --manifest "$planRoot/source-manifest.json" --output "$benchRoot/results/cadence-r1-analysis"
if ($LASTEXITCODE -ne 0) { Write-Warning "cadence 집계의 excluded를 확인해." }
```

```bash
node tools/bench/collect-plan.mjs --plan "$plan_root/render-plan.json" --root "$bench_root/results/render-r1" --manifest "$plan_root/source-manifest.json" --output "$bench_root/results/render-r1-analysis" || render_summary_exit=$?
node tools/bench/collect-plan.mjs --plan "$plan_root/cadence-plan.json" --root "$bench_root/results/cadence-r1" --manifest "$plan_root/source-manifest.json" --output "$bench_root/results/cadence-r1-analysis" || cadence_summary_exit=$?
```

새 ABBA 계획도 `--plan`과 `--root`를 해당 파일·결과 폴더로 바꾸고 같은 제품 manifest를 명시해서 집계해. 집계는 `summary.json`과 `summary.md`에 유효 비교, 적응형 관찰, 제외 사유와 입력 파일 해시를 남겨. **일부 비교가 유효한 summary가 생겼다고 전체 계획이 완료된 것은 아니야.** 실패·RUNNING·누락·로그 해시 불일치·조건 불일치는 제외 목록에 있어야 해. 모든 조건이 유효할 때만 exit 0이야. [집계 코드](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/collect-plan.mjs)

엄격 집계는 계획/로그/원시 표본, 제공 소스의 전후 안정성, manifest, 도구·fixture·helper, viewport/프리셋/실제 scale/카메라/장면 등을 대조해. 제품 manifest에 있는 모든 파일을 브라우저 수집기가 자동으로 HTTP 재검증하는 것은 아니야. `sourceCoverage`와 실제 `sourceHashes` 목록을 확인하고, CSS·index·미수집 모듈은 3절의 제공 소스 검사 등 별도 증거로 보완해. 원시 데이터를 바꿔 조건 검사를 통과시키지 않아.

짧은 개별 쌍은 `node tools/bench/compare.mjs before.json after.json`으로도 볼 수 있어. 다만 이 비교기를 실행했다고 계획·로그·전체 source manifest까지 엄격 집계한 것으로 간주하지 않아. PowerShell에서 stdout JSON을 저장할 때 Windows PowerShell 5.1의 `Out-File -Encoding utf8`은 BOM을 붙일 수 있어. JSON을 파일로 직접 쓰는 `collect-plan`을 우선 사용하거나 `[System.IO.File]::WriteAllText`와 BOM 없는 UTF-8을 사용해.

통계의 정의는 다음과 같아.

- 평균 관찰 rAF FPS: `1000 / mean(cadenceMs)`. sync에는 계산하지 않아.
- 1% Low: `1000 / mean(느린 상위 ceil(n×0.01)개 cadenceMs)`. n<100이면 미측정으로 남겨.
- p50/p95/p99: nearest-rank. 소표본이면 같은 최댓값으로 겹칠 수 있어.
- 변화량: 후보−기준선, 변화율: `(후보/기준선−1)×100`. ms/calls/메모리는 낮을수록, FPS는 높을수록 개선이므로 부호의 의미가 달라.
- 서로 다른 장면의 개선율을 무작정 평균내지 않아. 각 run·장면과 반복 간 범위를 남겨.

### PNG와 시각 품질

고정 sync 캡처를 먼저 비교해. 같은 메인 카메라여도 중계 보조 카메라의 진행 상태나 갱신 cadence가 다르면 화면 속 중계가 다를 수 있어. 전체 픽셀 차이를 곧바로 품질 저하나 향상으로 판정하지 말고, 같은 곡 시각·카메라·노출·세계·mix/reveal·관객·프리셋과 마지막 중계 갱신을 대조해.

이미지 수치가 필요할 때만 별도 Python 환경을 준비해.

```powershell
py -3 -m venv "$benchRoot/image-runtime"
if ($LASTEXITCODE -ne 0) { throw "이미지 환경 생성 실패" }
$imagePython = Join-Path $benchRoot "image-runtime/Scripts/python.exe"
& $imagePython -m pip install Pillow==12.3.0 numpy==2.3.5
if ($LASTEXITCODE -ne 0) { throw "이미지 패키지 설치 실패" }
$renderRoot = Join-Path $benchRoot "results/render-r1/render"
& $imagePython tools/bench/compare-images.py "$renderRoot/baseline-a-full-hall-high-desktop-sync-wide.png" "$renderRoot/candidate-a-full-hall-high-desktop-sync-wide.png" --output "$benchRoot/results/hall-high-wide-image-r1.json"
if ($LASTEXITCODE -ne 0) { throw "이미지 비교 실패" }
```

```bash
python3 -m venv "$bench_root/image-runtime"
image_python="$bench_root/image-runtime/bin/python"
"$image_python" -m pip install Pillow==12.3.0 numpy==2.3.5
render_root="$bench_root/results/render-r1/render"
"$image_python" tools/bench/compare-images.py "$render_root/baseline-a-full-hall-high-desktop-sync-wide.png" "$render_root/candidate-a-full-hall-high-desktop-sync-wide.png" --output "$bench_root/results/hall-high-wide-image-r1.json"
```

[이미지 비교기](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/compare-images.py)는 자동 정렬·리사이즈 없이 MAE·RMSE·변경 픽셀 비율·7×7 uniform SSIM을 계산해. 같은 좌표의 `--crop x,y,width,height`도 사용할 수 있어. 전체 화면 SSIM 하나로 작은 악기·관객·난간의 누락을 판정하지 않아. 원본 두 PNG와 crop을 같은 배율로 나란히 확인해.

| 공연장/효과 | 육안으로 남길 항목 |
| --- | --- |
| Hall | 4개 층의 발코니·좌석 모서리·난간·샹들리에, 가까운 악기와 동물 디테일, 그림자, 원거리 관객, 로비에서 객석을 볼 때의 경계 |
| Sphere | 돔의 입체감, 숲/산/바다/구름, 큐브맵 면 경계·빈 면·이전 세계 잔상, crossfade/reveal 중간의 밝기·공간감 |
| 공통 | 활·손·지휘·박수 포즈, 중계 첫 표시·시야 밖→복귀, 레이저·폭죽·색종이의 밀도·밝기, 화면 글꼴과 UI 터치 영역 |

PNG가 같아도 전환의 시간적 끊김, 빠르게 회전할 때의 popping, 음표 동기화까지 검증된 것은 아니야. cadence와 정상 앱의 영상/직접 관찰을 추가하고 녹화 부하는 별도 실행으로 기록해.

## 9. 선택 사항: 실제 GPU timer query와 메모리 해석

full-frame의 확장 존재 플래그만으로 GPU ms를 보고하지 않아. [gpu-timer.mjs](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/gpu-timer.mjs)는 기존 고정 fixture를 재사용하고 실제 `EXT_disjoint_timer_query_webgl2`를 실행하는 별도 수집기야.

```powershell
$env:OUTPUT_DIR = Join-Path $benchRoot "results/gpu-quick-r1"
$env:SAMPLES = "8"
$env:WARMUP = "4"
$env:BASE_URL = "http://127.0.0.1:18083/"
$env:REVISION = $baselineRef
node tools/bench/gpu-timer.mjs baseline-gpu-quick hall high desktop front
if ($LASTEXITCODE -ne 0) { throw "기준선 GPU 수집 FAIL" }
$env:BASE_URL = "http://127.0.0.1:18084/"
$env:REVISION = $candidateRef
node tools/bench/gpu-timer.mjs candidate-gpu-quick hall high desktop front
if ($LASTEXITCODE -ne 0) { throw "후보 GPU 수집 FAIL" }
```

```bash
export OUTPUT_DIR="$bench_root/results/gpu-quick-r1" SAMPLES=8 WARMUP=4
BASE_URL=http://127.0.0.1:18083/ REVISION="$baseline_ref" node tools/bench/gpu-timer.mjs baseline-gpu-quick hall high desktop front
BASE_URL=http://127.0.0.1:18084/ REVISION="$candidate_ref" node tools/bench/gpu-timer.mjs candidate-gpu-quick hall high desktop front
```

Sphere는 `sphere high desktop forest`로 같은 쌍을 실행해. 각 파일의 최상위 `status`, `samples[].query`, `cleanup`을 읽어. **PASS와 SKIP가 모두 exit 0**이므로 실행기 PASS만으로 GPU 시간 측정 성공을 보고하면 안 돼.

| 확인 | 필요한 증거 |
| --- | --- |
| 지원 | 확장·WebGL2 query API·counter bits·probe GL error·context 상태 |
| 각 표본의 유효성 | `query.status=VALID`, `available=true`, `disjoint=false`, 양수 elapsed 값, GL error 0 |
| 전체 묶음 | 요청한 표본 수 완료, rejected 없음, 최상위 PASS, source 전후 동일 |
| 정리 | query created=deleted, outstanding/active 없음. query 누수가 있으면 FAIL |
| A/B 동등성 | `conditionsFingerprintSha256`, fixture·카메라·preset·scale·viewport·표본 수·브라우저·도구가 동일하고 각 제품 source가 manifest와 일치 |
| 물리 GPU 여부 | 실제 renderer와 OS/브라우저 GPU 증거. `driver-hardware-not-independently-verified`라는 값만으로 물리 GPU를 확정하지 않아. |

query는 앱 `frame()` 앞뒤의 GL 명령 구간을 감싸고 `readPixels`는 query 밖에서 실행해. 따라서 `driverElapsedMs`와 `completeMs`는 서로 다른 지표야. 드라이버 스케줄링이나 명령 공급 간격도 query 구간에 영향을 줄 수 있으므로 순수 shader 시간이나 앱 FPS로 해석하지 않아. query polling에는 Node deadline과 짧은 비동기 대기가 있고, 브라우저 안에서 busy-wait를 하지 않아.

미지원·disjoint·결과 미완료/무효는 SKIP와 사유를 남기며 숫자를 0으로 채우지 않아. 이 도구는 무효 표본을 조용히 삭제해 좋은 값만 평균내지 않아. 4/8표본은 작은 통제 관찰이고 지속 GPU 부하·발열·p99 검증을 대신하지 않아. SwiftShader의 `driverElapsedMs`는 **소프트웨어 드라이버의 명령 구간 시간**이야. 물리 GPU ms나 실제 스마트폰 수치로 부르지 않아.

이 도구의 `memory.mainSceneGeometryArrayBufferBytes`는 측정 뒤 메인 scene을 순회해 geometry의 attribute/index/morph backing ArrayBuffer를 Set으로 중복 제거해 합한 값이야. interleaved attribute를 포함하고, view가 원본 버퍼 일부만 참조해도 전체 `buffer.byteLength`를 세어. 이는 **JS 측 저장 구조의 부분 추정**이며, committed RAM·GPU 메모리·VRAM·전체 JS heap이 아니야. 별도 큐브맵/세계 scene, scene에 붙지 않은 캐시, object 소유 instanceMatrix/instanceColor, 텍스처·렌더 타깃, 오디오 버퍼, 드라이버 복사본 등은 제외돼.

`performance.memory`와 CDP heap이 크게 달라도 그 차이를 그대로 geometry·GPU·누수의 크기로 보지 않아. 각 API 값을 원래 이름으로 따로 보고하고, 리소스 개수와 geometry ArrayBuffer 추정도 별도 열에 둬. GPU/오디오의 바이트 단위 실측이 없으면 미측정이라고 적어.

## 10. 기능·광장·방·로딩·오디오를 검사해

기능 검사는 실제 UI 조작과 준비 fixture가 섞여 있어. 검사 이름이 PASS라는 이유로 자연스러운 모든 사용 흐름이 끝까지 실행됐다고 표현하지 않아. 개별 raw의 `checks`, 실패 단계, 실제 입력 이벤트, fixture 설명, 콘솔·네트워크 오류, 스크린샷을 읽어.

| 도구 | 실제 확인 범위 | 분리해서 기록할 준비·한계 |
| --- | --- | --- |
| `plaza.mjs hall\|sphere desktop\|mobile` | 첫 페이지 광장, 실제 키/조이스틱·캔버스 드래그/탭, 매표소·발권·표·입구·공연장 렌더·복귀, 무표 진입 차단 등 | `NAVIGATION=ui`가 기본. `placement`는 위치 fixture여서 실제 걸어서 이동한 증거가 아니야. native 앱 루프를 유지해. |
| `functional.mjs venue device` | 입장, 이동/시선, 좌석, 재생·seek/resume, 품질·중계·돔·모바일 layout 등 코드에 적힌 checks | 메인 rAF 제어·위치·무대/진행 fixture 사용. trusted 입력이 있는 단계와 직접 상태 준비를 구분해. |
| `rooms.mjs label venue cross\|core` | 두 탭 UI의 방 생성/입장·채팅·방장 권한·공연/공연장 동작 | 초기 위치/무대 준비, 작은 부하·음량 설정을 사용해. 물리 두 기기의 시계·오디오 동기화나 FPS 측정이 아니야. |
| `multiplayer.mjs label` | 실제 Node 서버와 WebSocket/RoomClient 프로토콜·권한·동기화 | 브라우저 UI나 렌더링은 실행하지 않아. `REPO_DIR`를 후보 제품으로 고정해. |
| `rituals.mjs venue device` | 로비/독주회/인터미션/수면의 지정 시나리오 | 위치·시간 진행 fixture를 사용해. 자연스럽게 15분 기다린 수면이나 전체 실제 감상과 같지 않아. |
| `loading.mjs label venue device` | 고정 관객의 cold/warm 버튼 준비·자산 전송·샘플/PCM·heap 등 | 반복 WebGL을 멈춘 제어된 startup. 기본 high desktop/low mobile. 첫 interactive frame과 다른 지표야. |
| `audio-resume.mjs label venue device` | 실제 AudioContext·음표 스케줄, pause/seek/resume, 선택한 live window | controlled/native를 구분하고 실제 카메라·좌석·곡 시각·관객 조건을 대조해. |
| `audio-stability.mjs label venue device 65` | 65초 실제 음표 예약과 낮은 빈도 시각 업데이트 | 반복 WebGL을 멈춘 조건. GPU가 계속 막히는 실제 공연의 스트레스 검사나 청감 결과가 아니야. |

현재 runtime 33계획에서 전체 functional 4회는 후보이고, 기준선 모바일 2회는 `SCOPE=transport`야. 후보 전용 최적화 기대 검사까지 기준선에 억지로 적용하지 않도록 범위를 나눈 거야. 이는 동일한 전체 기능 suite를 A/B에 모두 통과시켰다는 뜻이 아니야. `CONTINUE_ON_TRANSPORT_FAIL=1`로 seek/resume 실패 뒤의 품질·돔을 계속 조사해도 해당 실패는 유지돼. 실패 이전까지만 실행된 항목과 뒤에서 실제로 완료된 항목을 구별해.

### functional의 자동 품질 기대값은 별도 검증 옵션이야

`EXPECTED_AUTO_PRESET=low|medium|high`는 **full functional의 자동 설정 복귀 검사에서 기대값을 더 엄격하게 지정하는 옵션**이야. 제품의 프리셋을 강제로 바꾸거나 성능 측정의 조건을 변경하지 않아. `SCOPE=transport`는 이 뒤쪽 검사를 실행하지 않아.

옵션을 생략했을 때의 기대값은 mobile viewport `low`, `SOFTWARE_RENDERER=1`을 명시한 desktop `medium`이야. 일반 desktop은 `medium/high` 범위와 자동 설정 복귀 후 scale 1을 검사해. **일반 desktop의 GPU 분류나 정확한 초기 프리셋을 독립적으로 검증한 것은 아니야.** 실제 renderer가 소프트웨어인지, helper에 소프트웨어 실행을 요청했는지도 서로 구분해.

기기의 초기 품질 정책을 독립적으로 확인한 경우에만 정확한 기대값을 추가해. 예를 들어 해당 PC에서 `high`가 맞다는 근거가 있다면 PowerShell은 `$env:EXPECTED_AUTO_PRESET = "high"`, Bash는 `export EXPECTED_AUTO_PRESET=high`를 지정하고 functional을 실행할 수 있어. 다음 기기·조건에서는 변수를 제거하거나 그 조건에 맞는 검증 근거를 새로 정해. 관측 결과에 맞춰 기대값을 바꿔 실패를 통과로 만들지 않아.

원시 `checks.automatic`에는 `initialPreset`·`expectedPreset`·`expectationSource`·`scale`을 기록해. `desktop-range-only`는 정확한 GPU 분류 미검증, `explicit-EXPECTED_AUTO_PRESET`은 명시한 기대값 검사라는 뜻이야. 이 검사는 설정/초기화 경로만 확인하며 동적 해상도의 안정성·히스테리시스·품질 회복은 7절과 정상 앱 관찰에서 따로 확인해. [functional의 옵션과 assertion](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/functional.mjs)

### 광장 호출마다 LABEL을 새로 정해

도구는 venue/device별 raw 외에 LABEL 기반 summary도 만들 수 있어. **같은 LABEL을 다른 CLI 호출에 재사용하지 않아.** 아래는 후보 Hall desktop의 독립 실행 예시야. Sphere/mobile은 LABEL과 출력 폴더도 함께 바꿔. 기존 파일을 지워 재사용하지 않아.

```powershell
$env:BASE_URL = "http://127.0.0.1:18084/"
$env:REVISION = $candidateRef
$env:OUTPUT_DIR = Join-Path $benchRoot "results/plaza-hall-desktop-r2"
$env:LABEL = "pc1f-plaza-hall-desktop-r2"
$env:NAVIGATION = "ui"
$env:SCREENSHOTS = "1"
node tools/bench/plaza.mjs hall desktop
if ($LASTEXITCODE -ne 0) { throw "광장 UI 검사 실패: raw와 failure PNG 보존" }
```

```bash
BASE_URL=http://127.0.0.1:18084/ REVISION="$candidate_ref" OUTPUT_DIR="$bench_root/results/plaza-hall-desktop-r2" LABEL=pc1f-plaza-hall-desktop-r2 NAVIGATION=ui SCREENSHOTS=1 node tools/bench/plaza.mjs hall desktop
```

광장 수집기는 매표소 뒤 배경의 inert 처리·Escape 취소/재진입·표 UI·이동 후 보관된 표·광장 복귀 후 표 제거도 확인하며 관련 JS/CSS/index 응답을 전후 대조해. 자동 UI 이동이 실패하면 제품 오류인지 투영·드래그·조작 fixture 오류인지 먼저 나눠. 위치를 직접 바꾸어 성공한 결과를 실제 이동 PASS로 덮지 않아. [광장 도구](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/plaza.mjs)

functional 모바일 seek가 실패하면 `mobileSeekDiagnostics`의 실제 hit target, trusted touch 대상, `perf.seek` 호출과 조작 전후 시각을 봐. 직접 `perf.seek()`를 호출해 놓고 슬라이더 UI가 통과했다고 적지 않아. CSS가 정확히 제공됐는지도 3절의 바이트 검사로 확인해.

### 로딩 시간과 전송량 비교

runtime 출력의 loading 파일 두 개를 다음처럼 비교할 수 있어. 아래 파일명은 공개 계획의 label을 따른 예시야. 실제 생성 파일명이 다르면 디렉터리에서 확인해.

```powershell
node tools/bench/compare-loading.mjs "$benchRoot/results/runtime-r1/loading/loading-baseline-hall-desktop.json" "$benchRoot/results/runtime-r1/loading/loading-candidate-hall-desktop.json" "$benchRoot/results/loading-hall-desktop-r1-comparison.json"
if ($LASTEXITCODE -ne 0) { Write-Warning "로딩 비교 조건 또는 결과 불일치" }
```

```bash
node tools/bench/compare-loading.mjs "$bench_root/results/runtime-r1/loading/loading-baseline-hall-desktop.json" "$bench_root/results/runtime-r1/loading/loading-candidate-hall-desktop.json" "$bench_root/results/loading-hall-desktop-r1-comparison.json" || loading_comparison_exit=$?
```

[로딩 비교기](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/compare-loading.mjs)는 cold/warm 및 A/B의 관객 seed·수·정렬 점유 좌석 fingerprint, 프리셋·뷰포트·폰트·브라우저, 샘플 수·PCM byte·곡 등 조건을 대조해. 한 cold/warm 쌍은 각 조건 한 번의 관찰이므로 반복 실험으로 확립된 개선율로 표현하지 않아.

이 수집기는 관객 난수만 고정하려고 QA main 응답을 바꿔 제공해. `controlledMainFixture`는 원본 main.js 전송량과 다른 범주야. HTTP warm cache는 실제로 사용하지만, global procedural randomness와 잔향 impulse response까지 바이트 동일하게 고정하지 않아. `readyMs`는 버튼 준비 MutationObserver 시간이지 최초 실제 프레임 완료 시간이 아니야. 새 Sphere visible 관찰의 추가 대기·상태는 기존 준비시간과 별도로 읽어. 원래 main의 네트워크 비용이나 정상 사용자 전체 첫 진입을 조사하려면 별도 정상 앱 Network/Performance 기록을 남겨. [로딩 도구](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/loading.mjs)

### 실제 음표와 렌더를 같이 실행하는 확인

runtime의 native audio 4회는 두 공연장 desktop A/B, 수동 low, 고정 관객 seed 417, `READBACK=0`, `PRELUDE_FRAMES=0`, `LIVE_WINDOW_MS=30000`을 사용해. 소프트웨어 렌더러의 고부하를 고정하려는 설정과 물리 PC의 high 재생은 별도 실험이야. low에서 얻은 안정성을 high 동일 품질 성과로 옮기지 않아.

다시 실행할 때의 후보 Hall 예시는 다음과 같아. 기준선도 같은 옵션을 사용하고 URL·REVISION·label만 A로 바꿔 별도 파일에 기록해.

```powershell
$env:BASE_URL = "http://127.0.0.1:18084/"
$env:REVISION = $candidateRef
$env:OUTPUT_DIR = Join-Path $benchRoot "results/audio-native-hall-r2"
$env:FRAME_MODE = "native"
$env:READBACK = "0"
$env:QUALITY = "low"
$env:LIVE_WINDOW_MS = "30000"
$env:PRELUDE_FRAMES = "0"
$env:FIXED_AUDIENCE_SEED = "417"
node tools/bench/audio-resume.mjs candidate-native-r2 hall desktop
if ($LASTEXITCODE -ne 0) { throw "실재생 검사 FAIL: 완료한 단계와 실패를 분리해" }
```

```bash
BASE_URL=http://127.0.0.1:18084/ REVISION="$candidate_ref" OUTPUT_DIR="$bench_root/results/audio-native-hall-r2" FRAME_MODE=native READBACK=0 QUALITY=low LIVE_WINDOW_MS=30000 PRELUDE_FRAMES=0 FIXED_AUDIENCE_SEED=417 node tools/bench/audio-resume.mjs candidate-native-r2 hall desktop
```

관객 seed가 같아도 실제 클릭으로 선택된 좌석, 카메라 pose, 연주 시각, procedural 음향이 모두 같다는 뜻은 아니야. `fixture`·좌석 hash·`report.camera`·음악 시계·실제 품질과 source를 비교해. 조건이 다르면 해당 파일은 기능/안정성 관찰로 남기고 엄격한 동일 장면 성능 개선율 계산에서 제외해.

예약한 음표 수·순서·늦게 예약한 요청·AudioContext 상태·pause/seek/resume의 시계 진행은 코드 수준의 증거야. 이것만으로 실제 DAC 출력 glitch나 청감·A/V 동기화 ms를 알 수는 없어. Playwright 기본 음소거·출력 장치 조건도 확인하고, 실제 듣기는 다음 절의 일반 브라우저에서 해. `audio-stability`나 Worker 생성 결과만으로 지속 WebGL 부하에서 음악이 절대 끊기지 않는다고 주장하지 않아. [실재생 수집기](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/audio-resume.mjs), [65초 예약 검사](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/audio-stability.mjs)

## 11. 정상 앱에서 FPS·음악·입력을 확인해

fixture 브라우저를 종료하고 일반 브라우저에서 한 버전씩 열어. 광장부터는 `http://127.0.0.1:18083/`, 공연장 로비 직접 진입은 `http://127.0.0.1:18083/?venue=hall&lobby`야. 후보는 18084, Sphere는 `venue=sphere`를 사용해. `?lobby` 직접 진입은 광장 UI 흐름을 검사하지 않아.

같은 곡·품질·좌석·시선·관객·중계·효과·돔 세계·연주 시작 시각을 맞추고 실제 값도 기록해. 정상 솔로 관객 난수와 음악 진행은 고정 fixture처럼 자동 통제되지 않으므로, 이 단계는 실제 사용 안정성 관찰이야. 정확히 같은 장면의 성능 비교와 역할을 나눠.

일반 Chrome/Edge의 Console에서 다음 코드를 실행하면 앱의 루프나 음악 시계를 바꾸지 않고 60초 rAF 간격을 관찰할 수 있어. profiling·화면 녹화는 다른 실행으로 분리해. Console을 열어 생긴 viewport 변화도 A/B에서 같게 맞춰.

```javascript
(() => {
  if (window.__bench) throw new Error('fixture가 아닌 정상 앱에서 실행해');
  if (!window.__fp?.perf.playing) throw new Error('실제 공연을 먼저 재생해');
  if (window.__pcRafCollecting) throw new Error('이미 수집 중이야');
  window.__pcRafCollecting = true;
  const samples = [], states = [], visibility = [];
  const state = () => {
    const f = window.__fp;
    return {
      at: performance.now(), piece: f.perf.piece?.id, time: f.perf.time,
      playing: f.perf.playing, audioNow: f.engine.ctx.currentTime,
      audioState: f.engine.ctx.state, requestedQuality: f.settings.quality,
      appliedQuality: f.stats?.quality ?? null, renderScale: f.stats?.renderScale ?? null,
      rendererPixelRatio: f.renderer.getPixelRatio(),
      camera: f.camera.position.toArray(), quaternion: f.camera.quaternion.toArray(),
      audience: f.audience?.count ?? null,
      performanceMemoryUsedJSHeapSize: performance.memory?.usedJSHeapSize ?? null
    };
  };
  const visibilityChanged = () => visibility.push({
    at: performance.now(), state: document.visibilityState
  });
  visibilityChanged();
  document.addEventListener('visibilitychange', visibilityChanged);
  states.push(state());
  let first, previous, lastState = performance.now();
  function sample(now) {
    if (first === undefined) first = now;
    if (previous !== undefined) samples.push(now - previous);
    previous = now;
    if (now - lastState >= 1000) { states.push(state()); lastState = now; }
    if (now - first < 60000) { requestAnimationFrame(sample); return; }
    document.removeEventListener('visibilitychange', visibilityChanged);
    states.push(state());
    const sorted = [...samples].sort((a, b) => a - b);
    const mean = a => a.reduce((sum, x) => sum + x, 0) / a.length;
    const tailCount = samples.length >= 100 ? Math.ceil(samples.length * .01) : null;
    const q = p => sorted[Math.ceil(sorted.length * p) - 1];
    window.__pcLiveResult = {
      kind: 'normal-app-native-raf-observation',
      recordedAt: new Date().toISOString(), userAgent: navigator.userAgent,
      viewport: [innerWidth, innerHeight], devicePixelRatio,
      durationMs: now - first, sampleCount: samples.length,
      observedRafFps: 1000 / mean(samples),
      onePercentLowRafFps: tailCount ? 1000 / mean(sorted.slice(-tailCount)) : null,
      slowestSampleCount: tailCount, p50Ms: q(.5), p95Ms: q(.95), p99Ms: q(.99),
      over33ms: samples.filter(x => x > 33.333).length,
      over50ms: samples.filter(x => x > 50).length,
      visibility, states, samplesMs: samples
    };
    window.__pcRafCollecting = false;
    console.log(window.__pcLiveResult);
  }
  requestAnimationFrame(sample);
})();
```

완료 뒤 Chrome/Edge Console의 `copy(JSON.stringify(window.__pcLiveResult, null, 2))`로 복사해 A/B별 파일에 저장해. `copy`는 이 Console의 helper이며 일반 JS 표준 API가 아니야. unsupported 항목의 null을 임의로 채우지 않아.

숨긴 탭은 callback이 멈출 수 있어서 벽시계상 60초보다 오래 걸릴 수 있어. `visibility`에 숨김이 기록된 실행을 정상 전경 60초 결과에 합치지 않아. 이 FPS도 관찰 callback 빈도이며 실제 화면 presentation counter가 아니야. 같은 주사율에서 비교하고 평균과 함께 1% Low·p95/p99·33/50ms 초과 간격·사용 중 정지를 남겨. 60FPS의 예산 약 16.7ms, 30FPS 약 33.3ms를 지속적으로 충족하지 못한다면 실제 조건과 수치를 그대로 적어.

별도 실행에서 DevTools Performance로 20~30초를 기록해. CPU/network throttling, screenshots, memory 옵션을 A/B 동일하게 맞추고 trace 원본을 저장해. 빠른 이동/회전, 객석 전체, 중계 켜기, Sphere 세계 전환, 효과 활성 시각도 기록해. Main의 긴 task·스크립트·GC·레이아웃·렌더 제출과 frame 간격을 비교하되 profiler가 켜진 실행을 계측을 최소화한 실행과 합쳐 평균내지 않아.

CPU slowdown은 별도 실험이야. 배율 제한이나 mobile viewport는 실제 저사양 GPU·모바일 발열·메모리·오디오 장치를 재현하지 않아. 브라우저·OS가 제공하지 않는 GPU 시간·전력·온도는 미측정으로 남겨.

음악은 같은 헤드폰/스피커·볼륨·OS sample rate·유선/무선 연결·OS/브라우저 공간 음향 조건에서 들어. 곡 시작/끝, 여러 악기가 겹치는 구간, pause/앞뒤 seek/resume, 자리 이동, 중계·폭죽·돔 전환 순간의 클릭·끊김·늦은 첫 음·잔향 단절·음상 이동과 활/지휘 박자를 기록해. 청감에서 못 들은 끊김을 시스템 underrun 0회라는 계측값으로 바꾸지 않아.

가능하면 같은 구간을 loopback/외부 녹음으로 남기되 녹음·캡처 부하와 장치 지연을 적고 무녹화 성능 실행과 분리해. 블루투스 지연, 오디오 그래프 타이밍, 실제 화면/소리 동기화는 다른 항목이야. 소리·화면 이벤트를 함께 측정하지 않았다면 정밀한 A/V 동기화 ms를 만들지 않아.

## 12. 장시간 감상과 실제 모바일 기기

### 30분 안정성·메모리·열

각 공연장에서 같은 프로그램·좌석·초기 품질로 30분 실제 음악과 렌더를 함께 실행해. 시작 직후, 5·15·30분에 정상 앱 60초 rAF 관찰·실제 품질/scale·메모리 종류·기기 상태를 남겨. 중계·좌석·세계·프로그램을 여러 번 바꾸고 같은 상태로 돌아온 결과도 확인해.

| 조건 | A/B에서 기록하고 맞출 내용 |
| --- | --- |
| 기기 | CPU/GPU/RAM, OS·브라우저·드라이버 정확한 버전, 내장/외장 GPU |
| 전원 | AC/배터리, 충전, OS 전원 모드·저전력 모드 |
| 화면 | 해상도·OS 배율·브라우저 확대·주사율·밝기·외부 모니터·창 크기 |
| 시작 상태 | 실내 온도, 읽을 수 있는 기기 온도, 배터리 잔량, 직전 부하와 휴식 시간 |
| 다른 부하 | 백업/업데이트·녹화·원격 접속·다른 GPU 앱 |
| 오디오 | 출력 장치·연결 방식·볼륨·sample rate·공간 음향 효과 |

A는 AC, B는 배터리이거나 A만 차가운 기기이면 같은 조건 비교가 아니야. 읽을 수 없는 온도를 추정하지 말고 동일 실내에서 동일 휴식 시간을 두었다고 적어. 센서/OS 도구의 실제 값을 사용하고, 팬 소리나 체감 열을 와트·섭씨로 바꾸지 않아. 충전 중 잔량 변화나 짧은 1% 배터리 변화는 정밀 소비전력 측정이 아니야.

메모리 증가만으로 즉시 누수라고 단정하지 않아. 동일 상태 복귀·여러 반복·휴식 후 회복을 보고, 강제 GC 실행과 미실행을 구분해. JS heap이 안정됐다고 GPU/오디오 네이티브 메모리까지 확인한 것은 아니야. context loss·재로딩·장시간 중 음 끊김/정지·브라우저 오류도 남겨. 한 공연장만 완료했다면 다른 공연장까지 장시간 PASS로 적지 않아.

### 실제 Android Chrome·iOS Safari·태블릿

실기기 자동화는 현재 helper의 범위 밖이야. PC 서버의 HOST를 `0.0.0.0`으로 바꾸고 같은 Wi-Fi에서 `http://<PC-LAN-IP>:18083/`와 `:18084/`에 접속해 수동 검사할 수 있어. 방화벽·네트워크 조건을 기록해. localhost와 달리 secure context가 필요한 API의 지원 조건이 달라질 수 있으므로 Wake Lock 등 HTTPS 조건이 필요한 확인은 신뢰할 수 있는 HTTPS 개발 주소에서 별도 실행해.

모델명·OS 정확한 버전·브라우저·화면 방향/주사율·배터리/저전력·열 상태·오디오 출력을 남겨. Playwright WebKit이나 데스크톱 Safari 결과를 실제 iPhone Safari로 대신하지 않아. Android UA만 바꾼 PC도 실물 Android와 따로 적어.

| 수동 시험 | 양쪽 공연장에서 확인할 항목 | 최초 상태 |
| --- | --- | --- |
| 광장·발권 | 새 방문/기존 identity, 매표소, 공연장/솔로/방 선택, 발권·표·입구, 복귀·재입장 | 미실행 |
| 이동·시선 | 이동 중 다른 손으로 회전, 스틱·캔버스 드래그, 손가락 해제, 화면 가장자리, 세로/가로 전환 | 미실행 |
| 좌석·층·로비 | 가까운 좌석 앉기/일어나기, 층 이동, 로비 출입, 객석/관객의 가시성 | 미실행 |
| 재생·음상 | 시작·pause·앞뒤 seek·resume·다음 곡, 입력에 따른 오디오 활성화, 자리별 방향/잔향·악기 균형 | 미실행 |
| 애니메이션 | 활·손가락·지휘·박수와 실제 소리의 관계 | 미실행 |
| 돔·중계·효과 | 일반 셰이더/3D 세계/전환/reveal, 중계 최초 표시·숨김 후 복귀, 폭죽·레이저·블룸 | 미실행 |
| 실제 두 기기의 방 | 비공개 방 생성·입장·채팅·방장/참여자 권한·재생/seek 동기화·공연장 변경·퇴장/재입장 | 미실행 |
| 의식·수면 | 차/소식/독주회·인터미션·2부·예약 취소, 실제 수면·깨우기, 빠른 반복 입력·루프 중복 | 미실행 |
| 모바일 interruption | 잠금/다른 앱/전화 후 복귀, 이어폰 연결/해제, 네트워크 잠깐 끊기, orientation | 미실행 |
| 지속 사용 | 양쪽 각각 30분, 5/15/30분 상태·온도/배터리·메모리·context/audio 오류 | 미실행 |

실제로 확인한 셀에만 날짜·PASS/FAIL·증거를 채워. Android 원격 디버깅·Safari Web Inspector·화면 녹화를 연결했다면 그 여부와 옵션을 적어. 연결한 실행과 연결하지 않은 실행을 구분해. 데스크톱 Chrome·Edge, 실제 Android Chrome, 실제 iOS Safari는 각각 환경별 A/B로 판단해.

## 13. 결과를 남기는 서식과 판정

아래 표는 빈 기록 서식이야. 이 문서가 어떤 FPS·개선율·실기기 PASS를 측정했다고 뜻하지 않아.

| 같은 품질: venue/preset/device/scene/run | 평균 rAF FPS A→B | 1% Low A→B | p50/p95/p99 ms A→B | sync mean/p95 ms A→B | Calls/Triangles A→B | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| Hall high, 조건 기입 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미실행 |
| Hall medium/low, 조건별 별도 행 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미실행 |
| Sphere high, 세계/전환별 별도 행 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미실행 |
| Sphere medium/low, 조건별 별도 행 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미실행 |

sync만 실행한 행의 FPS는 미측정이야. 메모리와 로딩은 혼동을 막기 위해 별도 표에 적어.

| 항목 | A | B | 조건·해석 |
| --- | --- | --- | --- |
| performance.memory / CDP heap | 미측정 | 미측정 | 서로 다른 API 열로 유지 |
| Geometry ArrayBuffer 추정 / Three resource 개수 | 미측정 | 미측정 | GPU 메모리 아님 |
| 실제 유효 timer query ms / driver 종류 | 미측정 | 미측정 | 소프트웨어/물리 GPU 구분 |
| GPU/VRAM 바이트 | 미측정 | 미측정 | 직접 얻은 경우만 기입 |
| cold/warm 준비시간·전송량 | 미측정 | 미측정 | browser cache·QA main·외부 폰트 조건 |
| 실제 청감·출력 glitch·A/V 동기화 | 미실행 | 미실행 | 예약 통계와 실제 출력 측정 분리 |

auto는 FPS와 실제 프리셋·scale·선명도·변경 시각·회복/히스테리시스 관찰을 함께 적은 별도 표로 남겨. 화질은 동일/차이 있음/판단 보류와 그 근거를 성능과 분리해. 악화된 행, 큰 반복 편차, UI 실패, 시각 차이, 미지원 API도 숨기지 않아.

공유할 증거 묶음에는 다음을 포함해.

- 제품 A/B 전체 SHA, collector SHA, 깨끗한 worktree 여부와 필요한 전체 diff, 실제 제공 소스 해시.
- 원본 및 PC 사본 plan, source/collector manifest, 계획 변경 이유, 실행 명령·환경변수·도구 버전.
- 실제 OS·CPU·GPU·RAM·브라우저·드라이버·화면·전원/열·오디오 조건. 물리 기기인지 viewport 에뮬레이션인지.
- 개별 run 로그와 raw JSON·원본 PNG. 성공/실패/중단/제외/SKIP 모두 보존하고 원본 파일의 크기·SHA-256을 기록.
- 집계 JSON/MD, 이미지 수치·육안 메모, 실제 앱 rAF JSON, 별도 DevTools trace, 청취·장시간·실기기 수동 기록.
- 실제 UI 조작 / 위치·시계 fixture / 프로토콜 검사 / 실기기 미실행을 나눈 범위표.

`PASS`는 해당 검사 범위 완료, `FAIL`은 실제 실패와 실행된 단계, `SKIP`은 지원·계측 유효성 부족, `NOT_RUN`은 미실행으로 구별해. 수집기의 기대값 오류로 실패했다면 제품 오류와 별도로 원인을 기록하고, 도구 수정의 SHA·diff를 남긴 후 새 폴더에서 재실행해. 원래 FAIL을 삭제하거나 뒤의 성공으로 덮어쓰지 않아. 1f 통합의 CPU 테스트 case 수와 브라우저 job 수를 합쳐 하나의 통과 개수로 만들지 않아.

공개 evidence 폴더에 계획만 있거나 일부 결과만 있으면 그것이 당시 완료 범위야. 최종 결과 파일이 없는데 문서의 명령만으로 실행 완료를 추정하지 않아. 자기 PC의 물리 GPU 결과와 기존 SwiftShader 시간을 섞어 개선율을 만들지 말고, 이 PC의 같은 조건에서 개선된 항목·악화된 항목·시각/오디오 변화·미실행 기기를 함께 판단해.
