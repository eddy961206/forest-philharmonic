# 광장 통합본: 실제 PC에서 성능·화질·음악을 전후 비교하는 절차

이 문서는 **`main@6a59c33`을 고정한 비교를 자기 PC에서 다시 실행하는 안내**야. 실행 결과를 대신하는 PASS 보고서가 아니야. 실제 PC·스마트폰에서 확인하지 않은 FPS, 발열, 음질은 여기서 검증됐다고 취급하지 않아.

먼저 물리 GPU에서 짧은 전후 실행을 확인하고, 같은 조건의 A/B/B/A 반복, 이미지 비교, 실제 공연 재생, 장시간 사용 순서로 진행하면 돼. 기존 [portable 도구 설명](bench-method.md), [PC 기록 서식](pc-validation-template.md)도 함께 사용할 수 있어. [이전 PC 안내](reproduce-on-pc.md)의 a41 기준선·8082/8080 포트 대신 **이 문서의 6a 기준선·18080/18081 포트**를 사용해. 이전 문서가 연결한 파일 중 현재 checkout에 없는 파일이 있다면 공개 증거 묶음의 실제 경로를 확인하고, 없는 보고서를 실행 근거로 인용하지 마.

### 이 문서와 실제 검증 결과의 경계

| 항목 | 이 문서가 뜻하는 범위 |
| --- | --- |
| 설치·worktree·브라우저 명령 | 자기 PC에서 실행할 절차야. Windows·macOS·Linux 실물 PC에서 모두 실행됐다는 뜻이 아니야. |
| 코드·명령의 정적 검사 | 브라우저를 열지 않은 구문 검사와 작은 통계 검사를 뜻해. PowerShell 실행, 그래픽 드라이버, 실제 오디오 출력 검증을 대신하지 않아. |
| 28-job·steady48·auto8 계획 | 작업 수와 조건을 정한 계획이야. 각 job의 완료·실패·중단은 해당 원본 JSON과 로그로 판단해. 진행 중인 수집을 전체 완료로 읽지 않아. |
| 과거 a41·3f와 새 6a 결과 | 실제로 저장된 당시 결과만 해당 버전의 증거야. 새 도구의 성공으로 과거 실패를 지우거나, 옛 성능 개선율을 새 main에 적용하지 않아. |
| 실물 GPU·스마트폰·장시간 청취 | 아래 기록 서식은 미실행 상태에서 시작해. 실제로 실행한 기기·공연장·시나리오에만 결과를 채워. |

## 1. 코드와 결과의 버전을 먼저 고정해

| 구분 | 이번 비교의 식별자와 의미 |
| --- | --- |
| 기준선 A | `6a59c33ced4fbbe237b38eb5a4c63e38636bf07f`. 광장 추가 뒤 main의 고정된 커밋이야. |
| 개발 중 후보의 부모 커밋 | `42dffe58828fcbc9180ad69aeb0b65da71b43605` |
| 28-job 계획의 후보 라벨 | `42dffe5-plus-screen-visibility`. **Git 커밋 이름이 아니고**, 위 커밋에 중계 가시성 관련 `public/js/main.js` 변경을 적용한 작업 트리야. |
| 그 작업 트리의 main.js SHA-256 | `a0d096e176f391537439c30aa4edd89fcace95fc542803a7dc1ea8a7790efaed` |
| 이후 공개한 후보 checkpoint B | `06c8ac5e6956b3b337102b342fbd4e422b43baf9`. 위 제품 변경과 측정 도구를 원격에 보존한 커밋이야. 아래 PC 명령은 이 SHA를 고정해. |
| 과거 결과 | ec5/a41/3f는 각각 다른 기준선이야. 특히 [복구한 3f 보고서](performance-report-3f.md)는 광장 통합본 결과가 아니야. |

`42dffe5`만 checkout하면 측정 시작 당시의 미커밋 후보와 같지 않아. 이후 공개한 `06c8ac5`의 main.js는 위 해시와 같아. 원래 28-job 측정을 정확히 재현하려면 나머지 제공 소스와 도구도 각 raw의 해시에 맞춰야 해. 현재 PR head로 바꾸어 새로 실행했다면 **그 SHA에 대한 새 PC 측정**으로 남겨. 최종 보고서의 후속 커밋 번호를 과거 raw JSON의 `revision`에 덮어쓰지 않아.

측정 중 main이나 PR이 갱신돼도 실행 중인 worktree를 pull하거나 바꾸지 마. 새 main을 비교하려면 새 기준 SHA·후보 SHA·결과 폴더를 만들고 다시 측정해. 기준선이 바뀌면 이전 개선율을 그대로 가져올 수 없어.

아래는 `06c8ac5`의 렌더 측정에 사용하는 도구 해시야. 문서 감사 시점의 `b3717c87caf077044a81c18890471933f4cbcb41`도 이 네 파일과 `public/js` 내용은 같아. 후속 도구를 사용한 실행은 그 checkout SHA와 파일 해시를 따로 보관해. 뒤의 `LIVE_WINDOW_MS` 확장은 이 checkpoint들의 `audio-resume.mjs`에 없으므로 9절의 별도 collector 준비 절차를 사용해.

| 파일 | 작성 시점 SHA-256 |
| --- | --- |
| `tools/bench/full-frame.mjs` | `f0b8973f462846a33413a4e55657d737554899e78b17988e28219545b37a5411` |
| `tools/bench/full-frame-fixture.js` | `ba197fc2117d8af462146b3c833c9e0b8c0a4fa8c19fa3cdf3037bb32c2d325d` |
| `tools/bench/browser.mjs` | `90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9` |
| `tools/bench/run-plan.py` | `a66055a67ef35d37a705c783852df9c7827d3869b92de206652e3409d5c64bed` |

## 2. PC 준비와 두 worktree 생성

앱 서버는 Node만으로 실행돼. 측정용 Playwright, 폰트, 이미지 계산 패키지는 저장소 밖에 설치해. 전체 절차는 Git, Node 22 이상, npm, Python 3를 사용해. 프로토콜 검사에 Node의 내장 `WebSocket`이 필요해서 서버 최소 요구 버전인 Node 18보다 높은 버전을 쓰는 거야. Node·npm·Python 실제 버전을 결과에 적어. 기존 수집 환경은 Node 24.19.0과 Python 3.12.14였지만 다른 PC의 A/B 양쪽에 동일한 지원 버전을 사용한 새 측정도 가능해.

아래 `forest-perf-6a`는 새 실험 폴더 예시야. 이미 사용 중이면 새 이름을 정하고 전체 경로를 같이 바꿔. 기존 개발 폴더를 지우거나 main을 checkout할 필요는 없어.

### Windows PowerShell

Windows Node·Python과 Windows 브라우저로 실행하는 예시야. WSL의 Linux 실행은 다른 OS·그래픽 경로를 사용한 별도 환경으로 기록해.

```powershell
$ErrorActionPreference = "Stop"
$benchRoot = Join-Path $env:USERPROFILE "forest-perf-6a"
New-Item -ItemType Directory -Path $benchRoot | Out-Null
Set-Location $benchRoot
git clone https://github.com/eddy961206/forest-philharmonic.git source
if ($LASTEXITCODE -ne 0) { throw "clone 실패" }
$sourceRoot = Join-Path $benchRoot "source"
$baselineRoot = Join-Path $benchRoot "reference"
$candidateRoot = Join-Path $benchRoot "candidate"
git -C $sourceRoot fetch origin main perf/261021-venue-rendering
if ($LASTEXITCODE -ne 0) { throw "fetch 실패" }
$baselineRef = "6a59c33ced4fbbe237b38eb5a4c63e38636bf07f"
$candidateRef = "06c8ac5e6956b3b337102b342fbd4e422b43baf9"
git -C $sourceRoot worktree add --detach $baselineRoot $baselineRef
if ($LASTEXITCODE -ne 0) { throw "기준선 worktree 생성 실패" }
git -C $sourceRoot worktree add --detach $candidateRoot $candidateRef
if ($LASTEXITCODE -ne 0) { throw "후보 worktree 생성 실패" }
git -C $baselineRoot rev-parse HEAD
git -C $candidateRoot rev-parse HEAD
git -C $baselineRoot status --short
git -C $candidateRoot status --short
Set-Location $candidateRoot
```

### macOS / Linux: Bash

```bash
set -e
bench_root="$HOME/forest-perf-6a"
mkdir "$bench_root"
cd "$bench_root"
git clone https://github.com/eddy961206/forest-philharmonic.git source
source_root="$bench_root/source"
baseline_root="$bench_root/reference"
candidate_root="$bench_root/candidate"
git -C "$source_root" fetch origin main perf/261021-venue-rendering
baseline_ref=6a59c33ced4fbbe237b38eb5a4c63e38636bf07f
candidate_ref=06c8ac5e6956b3b337102b342fbd4e422b43baf9
git -C "$source_root" worktree add --detach "$baseline_root" "$baseline_ref"
git -C "$source_root" worktree add --detach "$candidate_root" "$candidate_ref"
git -C "$baseline_root" rev-parse HEAD
git -C "$candidate_root" rev-parse HEAD
git -C "$baseline_root" status --short
git -C "$candidate_root" status --short
cd "$candidate_root"
```

`status --short`는 양쪽 모두 비어 있어야 커밋 그대로의 비교야. 변경이 필요한 실험은 별도 worktree에서 하고 전체 diff와 변경 파일 해시를 함께 보관해. 이 checkpoint 이후의 PR head를 시험하려면 `git rev-parse origin/perf/261021-venue-rendering`의 전체 SHA를 candidateRef에 사용하고 새 결과 폴더에 기록해. PR ref를 사용하려면 fetch 대상만 `pull/1/head:refs/remotes/origin/review-pr-1`로 바꾸고 해당 ref의 SHA를 고정하면 돼.

### 측정 도구 설치

현재 환경에서 확인한 버전은 Playwright `1.64.1`, 두 Fontsource 패키지 `5.3.0`이야. 아래 명령으로 버전을 고정하고, 생성된 runtime의 `package.json`과 `package-lock.json`을 보관해. 이 패키지 설치는 앱 서버에 필요한 작업이 아니야.

```powershell
$toolRoot = Join-Path $benchRoot "tools-runtime"
npm install --prefix $toolRoot --save-exact playwright@1.64.1 @fontsource/gowun-batang@5.3.0 @fontsource/ibm-plex-sans-kr@5.3.0
if ($LASTEXITCODE -ne 0) { throw "도구 설치 실패" }
node (Join-Path $toolRoot "node_modules/playwright/cli.js") install chromium
if ($LASTEXITCODE -ne 0) { throw "브라우저 설치 실패" }
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

브라우저 시스템 라이브러리가 부족한 Linux에서는 설치 출력의 해당 배포판 안내를 따라 필요한 의존성을 준비해. 일반 PC에는 컨테이너용 `@sparticuz/chromium`이나 예전 `/tmp/chromium` 경로가 필요 없어. 패키지 버전을 바꿔야 한다면 실제 설치 버전과 이유를 기록하고 A/B 모두에 같은 버전을 사용해.

## 3. 서버와 하드웨어 브라우저 설정

### 서로 다른 터미널에서 서버 실행

서버 A와 B는 켜 둬도 되지만, **GPU를 사용하는 브라우저 측정은 항상 하나씩 실행해.** 다른 기준선·후보 탭을 동시에 렌더하지 않아.

```powershell
# 서버 A 터미널
Set-Location (Join-Path $env:USERPROFILE "forest-perf-6a/reference")
$env:HOST = "127.0.0.1"
$env:PORT = "18080"
node server.js
```

```powershell
# 서버 B 터미널
Set-Location (Join-Path $env:USERPROFILE "forest-perf-6a/candidate")
$env:HOST = "127.0.0.1"
$env:PORT = "18081"
node server.js
```

```bash
# 서버 A 터미널
cd "$HOME/forest-perf-6a/reference"
HOST=127.0.0.1 PORT=18080 node server.js
```

```bash
# 서버 B 터미널
cd "$HOME/forest-perf-6a/candidate"
HOST=127.0.0.1 PORT=18081 node server.js
```

측정은 세 번째 터미널의 candidate 폴더에서 해. **후보의 동일한 도구를 양쪽 서버에 적용**해야 해. 기준선 폴더에 도구를 복사하거나 소스를 추가할 필요는 없어. 정적 서버는 실행한 `server.js` 옆의 `public`을 서비스하므로 실행 경로도 확인해. [서버 코드](../server.js)

처음에는 양쪽 `/js/main.js`, `/music/index.json`, `/samples/manifest.json`이 정상 응답하는지 확인해. main.js 응답을 파일로 받아 worktree와 바이트 비교하면 포트가 뒤바뀐 실수를 잡을 수 있어.

```powershell
Invoke-WebRequest "http://127.0.0.1:18080/js/main.js" -OutFile "$benchRoot/reference-served.js"
Invoke-WebRequest "http://127.0.0.1:18081/js/main.js" -OutFile "$benchRoot/candidate-served.js"
if ((Get-FileHash "$baselineRoot/public/js/main.js").Hash -ne (Get-FileHash "$benchRoot/reference-served.js").Hash) { throw "기준선 응답 불일치" }
if ((Get-FileHash "$candidateRoot/public/js/main.js").Hash -ne (Get-FileHash "$benchRoot/candidate-served.js").Hash) { throw "후보 응답 불일치" }
```

```bash
curl --fail --silent --show-error http://127.0.0.1:18080/js/main.js -o "$bench_root/reference-served.js"
curl --fail --silent --show-error http://127.0.0.1:18081/js/main.js -o "$bench_root/candidate-served.js"
cmp "$baseline_root/public/js/main.js" "$bench_root/reference-served.js"
cmp "$candidate_root/public/js/main.js" "$bench_root/candidate-served.js"
```

이 확인은 서버와 OS 캐시를 데울 수 있어. 뒤의 loading 도구가 말하는 cold는 브라우저 HTTP 캐시 기준이고, OS·서버까지 처음 실행한 상태와는 달라.

### 공통 환경: 실제 GPU 경로 확인

```powershell
# 2절의 변수가 있는 측정 터미널에서 실행해.
Set-Location $candidateRoot
$env:PLAYWRIGHT_MODULE = Join-Path $toolRoot "node_modules/playwright"
$env:FONT_MODE = "local"
$env:FONT_ROOT = Join-Path $toolRoot "node_modules/@fontsource"
$env:HEADLESS = "0"
$env:SOFTWARE_RENDERER = "0"
$env:CHROME_ARGS = "[]"
$env:TIMEOUT_MS = "180000"
Remove-Item Env:CHROME_EXECUTABLE -ErrorAction SilentlyContinue
Remove-Item Env:WIDTH, Env:HEIGHT, Env:DPR -ErrorAction SilentlyContinue
Remove-Item Env:FRAME_MODE, Env:READBACK, Env:LIVE_WINDOW_MS, Env:FIXED_AUDIENCE_SEED, Env:QUALITY, Env:PRELUDE_FRAMES, Env:PRE_PAUSE_MS, Env:SEEK_SECONDS, Env:PIECE_ID -ErrorAction SilentlyContinue
```

```bash
cd "$candidate_root"
export PLAYWRIGHT_MODULE="$tool_root/node_modules/playwright"
export FONT_MODE=local FONT_ROOT="$tool_root/node_modules/@fontsource"
export HEADLESS=0 SOFTWARE_RENDERER=0 CHROME_ARGS='[]' TIMEOUT_MS=180000
unset CHROME_EXECUTABLE WIDTH HEIGHT DPR
unset FRAME_MODE READBACK LIVE_WINDOW_MS FIXED_AUDIENCE_SEED QUALITY PRELUDE_FRAMES PRE_PAUSE_MS SEEK_SECONDS PIECE_ID
```

`SOFTWARE_RENDERER=0`은 도구가 SwiftShader 실행 인자를 추가하지 않도록 해. **하드웨어 사용을 강제하거나 보장하는 설정은 아니야.** `CHROME_ARGS` 안에 소프트웨어 렌더 인자가 남아 있거나 OS가 소프트웨어 경로를 선택할 수 있으므로 실제 renderer를 확인해야 해. `--single-process`, `--in-process-gpu`, `--use-angle=swiftshader`, `--disable-gpu` 등 컨테이너용 설정을 PC 비교에 그대로 복사하지 마.

설치한 일반 Chrome을 쓰려면 `CHROME_EXECUTABLE`을 실제 파일 경로로 지정해. 예시는 Windows의 `C:\Program Files\Google\Chrome\Application\chrome.exe`, macOS의 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, Linux의 `/usr/bin/google-chrome`이야. Edge는 설치된 `msedge` 실행 파일을 지정해 별도 A/B 묶음으로 실행할 수 있어. 파일 존재 여부와 실제 버전을 확인해. Chrome 결과와 Edge 결과는 같은 쌍으로 비교하지 않아.

사용할 바이너리의 `chrome://version`과 `chrome://gpu`를 확인하고 버전·실행 경로·전체 명령줄·GPU 이름·드라이버·WebGL 상태를 저장해. 측정 JSON의 `environment`와 `meta.renderer`도 함께 확인해. renderer에 SwiftShader나 llvmpipe가 보이면 소프트웨어 렌더 측정으로 분류해. GPU 이름을 숨기는 환경은 확인 불가로 남겨. `environment.chromeArgs`는 사용자가 전달한 인자 목록이며 Playwright의 기본 인자를 포함한 전체 명령줄은 아니야. [브라우저 helper](../tools/bench/browser.mjs)

하드웨어 상태를 확인한 별도 브라우저 창은 닫고 측정 창만 전경에 둬. 창 최소화·다른 탭 전환·화면 잠금이 생긴 실행은 같은 전경 조건의 성능 수치에 합치지 않아. 현재 fixture는 숨김/수면 상태를 검출하면 실패하도록 되어 있어.

폰트 모드는 다음처럼 구분해.

| `FONT_MODE` | 사용 조건 |
| --- | --- |
| `local` | 위 버전의 폰트를 `FONT_ROOT`에서 제공해. 전후 이미지 비교와 외부 네트워크 변동을 줄이는 측정에 사용해. |
| `system` | 외부 Google Fonts CSS를 비우고 시스템 대체 글꼴을 사용해. 원래 폰트의 시각 품질 확인으로 계산하지 않아. |
| `network` | 실제 외부 폰트 로딩을 포함해. 인터넷·DNS·외부 캐시 조건도 기록해. local 결과와 전송량·로딩 시간을 같은 쌍으로 비교하지 않아. |

## 4. 무엇을 측정하는지 구분해

이번 렌더 도구는 실제 앱의 전체 시각 프레임을 사용하지만, 재현 가능한 장면을 만들기 위해 음악 시계와 무대 배치를 통제해. 실제 엔진은 준비하고 **음표 스케줄러는 끈 상태**야. 실제 음악의 정확성과 음질은 뒤의 별도 검증이 필요해. [수집기](../tools/bench/full-frame.mjs), [장면 fixture](../tools/bench/full-frame-fixture.js)

| 모드·지표 | 해석 |
| --- | --- |
| `MODE=sync`, `completeMs` | `frame()` 시작부터 1×1 `readPixels` 완료까지 걸린 벽시계 시간. JS·드라이버·GPU 대기 등이 들어가. **FPS로 역산하지 않아.** |
| `submitMs` | JS에서 프레임 제출 호출을 실행한 구간. 드라이버 대기도 포함될 수 있어 순수 CPU 계산량이 아니야. |
| `completionWaitMs` | 제출 뒤 readPixels 완료까지 대기한 구간. 순수 GPU frame time이 아니야. |
| `MODE=cadence`, `cadenceMs` | 동기 readback 없이 외부 네이티브 rAF callback 시작 사이 간격. 통제한 시각 장면의 관측 FPS를 계산할 수 있어. |
| 정상 앱의 rAF 관찰 | 실제 공연과 오디오를 실행한 상태에서 별도 수집해. 고정 fixture와 관객·시점·진행 조건이 얼마나 같은지 기록해야 해. |
| `calls`, `triangles` | 그림자·중계·돔·후처리 등을 포함한 전체 렌더 제출 카운트. 프레임마다 누적 범위를 맞춰. |
| `geometries`, `textures` | Three 리소스 **개수**야. GPU 메모리 byte 수가 아니야. |
| `heap` | 브라우저가 제공하는 JS heap 관찰값. 오디오 네이티브 버퍼·GPU 메모리·peak RSS를 뜻하지 않아. |
| `cdpDurationDeltaMs` | 각 장면의 수집 전후 `TaskDuration`·`ScriptDuration`·`LayoutDuration`·`RecalcStyleDuration` 차이. QA 비용과 동기 대기를 포함할 수 있어서 CPU 사용률로 부르지 않아. |
| `cdpMetricsBefore` / `cdpMetricsSnapshot` | CDP 누적 스냅샷 원본. 마지막 값을 한 프레임 비용으로 읽지 않아. |
| `gpuTimer: true` | 타이머 확장의 존재 여부만 뜻해. 이 도구가 timer query로 GPU ms를 측정한 것은 아니므로 **GPU 시간은 미측정**이야. |

`phaseMeanMs`의 메서드 시간은 중첩돼. 예를 들어 중계 내부에서 발생한 `renderer.render` 시간이 두 항목에 들어갈 수 있으므로 합산하지 않아. CDP CPU task 비교도 수집 표본 수·모드·장면이 같을 때만 보조 자료로 사용해.

### 동일 화질 비교의 고정 조건

다음은 양쪽에서 같아야 해. 도구가 자동 검사하는 항목 외에 OS 전원·열 상태와 디스플레이 조건은 직접 기록해야 해.

- 같은 물리 기기, OS, 브라우저 바이너리·버전, GPU·드라이버, 모니터 주사율·배율, 창 크기.
- 같은 수동 프리셋으로 새 BrowserContext에서 시작. 요청 DPR뿐 아니라 실제 `meta.pixelRatio`, 각 표본의 `quality`와 `renderScale=1`도 확인.
- 같은 collector·fixture·helper 파일과 실행 옵션. 같은 `scenarioOrder`, `SAMPLES`, `WARMUP`, 폰트·스크린샷 설정.
- 같은 카메라 위치·방향·FOV 64도, 같은 음악 시각·곡, 관객 fill 0.8와 seed 417, random seed 417 및 UUID seed 874.
- 같은 효과 준비 상태와 무대 배치. 이전 장면의 애니메이션 상태가 이어지므로 장면 순서도 조건의 일부야.

기본 desktop은 640×360 DPR 1이고 mobile은 390×844 DPR 2야. 640×360 결과로 평소 1920×1080 성능을 판단하지 마. 실제 사용 해상도는 새 결과 폴더에 별도 A/B로 실행해. mobile은 PC에서 UA·viewport·touch를 바꾼 에뮬레이션이고 실제 휴대폰이 아니야.

low/Lite로 처음 부팅한 뒤 화면에서 high로 바꾼 상태는 처음부터 high로 부팅한 상태와 다를 수 있어. 스피어 Lite 경로의 3D 세계 대체 장면도 desktop full과 같은 시각 품질로 계산하지 않아. `fixture.lite`, `scenario.world`, 실제 프리셋과 스크린샷을 함께 확인해.

## 5. 짧은 확인, 28-job 재현, 충분한 rAF 반복

### 먼저 한 쌍만 실행해

전체 행렬 전에 baseline/candidate가 같은 브라우저에서 끝까지 실행되는지 확인해. 아래는 고정 high·desktop·front·sync이며 결과를 별도 폴더에 저장해.

```powershell
$env:OUTPUT_DIR = Join-Path $benchRoot "results/quick"
$env:MODE = "sync"
$env:SAMPLES = "8"
$env:WARMUP = "4"
$env:SCREENSHOTS = "1"
$env:BASE_URL = "http://127.0.0.1:18080/"
$env:REVISION = $baselineRef
node tools/bench/full-frame.mjs baseline-quick hall high desktop front
if ($LASTEXITCODE -ne 0) { throw "기준선 quick 실패: JSON과 로그 확인" }
$env:BASE_URL = "http://127.0.0.1:18081/"
$env:REVISION = $candidateRef
node tools/bench/full-frame.mjs candidate-quick hall high desktop front
if ($LASTEXITCODE -ne 0) { throw "후보 quick 실패: JSON과 로그 확인" }
```

```bash
export OUTPUT_DIR="$bench_root/results/quick" MODE=sync SAMPLES=8 WARMUP=4 SCREENSHOTS=1
BASE_URL=http://127.0.0.1:18080/ REVISION="$baseline_ref" node tools/bench/full-frame.mjs baseline-quick hall high desktop front
BASE_URL=http://127.0.0.1:18081/ REVISION="$candidate_ref" node tools/bench/full-frame.mjs candidate-quick hall high desktop front
```

동일 결과 이름은 덮어쓸 수 있으므로 재시도는 새 라벨·폴더를 사용해. 실패 JSON을 지우고 성공한 결과만 남기지 않아. 준비 이후 sync 표본 전체에는 실행기 수준의 총 시간 제한이 없어서 느린 소프트웨어 렌더에서는 오래 걸릴 수 있어. cadence의 `TIMEOUT_MS`는 **장면별 표본 수집** 제한이며 전체 실행·모든 준비 프레임의 제한은 아니야.

### 현재 28-job 계획의 범위

원래 계획은 `verification/render-plan.json`에서 만들었어. 그 경로는 작업 세션 경로이므로, 공개 증거 묶음에 포함된 계획 원본을 기준으로 확인해. **28개는 계획된 프로세스 실행 수이고, 이 문서가 28개 완료나 PASS를 주장하는 것은 아니야.** 완료 여부와 사용 소스는 각 raw JSON과 실행 로그로 확인해.

| 항목 | 값 |
| --- | --- |
| 기본 조합 | hall/sphere × high/medium/low × desktop/mobile × A/B = 24개 |
| 역순 추가 | desktop high에서 hall/sphere 각각 B2 → A2 = 4개 |
| 모드 | 전부 `MODE=sync`, 장면별 `WARMUP=4`, `SAMPLES=8`, 스크린샷 저장 |
| Hall 순서 | `front,wide,foyer,rotate,broadcast,broadcast-hidden,broadcast-return,effects-show` |
| Sphere 순서 | `front,wide,dome,forest,peaks,ocean,clouds,crossfade,reveal,broadcast,effects-show` |

`foyer`는 홀 로비에서 객석 방향을 보는 고정 시점이고, `broadcast-hidden`은 중계가 시야 밖에 있는 시점, `broadcast-return`은 중계가 다시 보이는 시점이야. Sphere의 `dome`은 일반 셰이더 장면, `forest/peaks/ocean/clouds`는 요청한 세계, `crossfade/reveal`은 전환 중간 장면이야. `effects-show`는 활성 조명·레이저를 준비한 뒤 폭죽·색종이를 발생시켜. 남은 효과가 다음 장면에 영향을 주므로 마지막에 둬.

**8표본에서는 nearest-rank p95와 p99가 모두 최댓값 한 개야.** 장기 꼬리 지연·1% Low·60/30FPS를 판단하는 표본 수가 아니야. desktop high 이외에는 이 계획 자체에 두 번째 반복도 없어. PC 판정에는 아래 반복과 실제 공연 관찰을 추가해.

### PC용 계획 파일 만들기

아래 Python 코드를 `<benchRoot>/make-pc-plan.py`로 저장해. 저장소 제품 코드는 바꾸지 않아. `short28`은 원래 조합·순서·표본 수를 따르고 크기·DPR을 명시해. `steady48`은 모든 고정 품질 조합을 **A1 → B1 → B2 → A2** 순서로, `auto8`은 자동 품질의 별도 예비 관찰을 만들어. 둘 다 아래에서 명시한 새 표본 조건이라 원래 28-job 원본과 동일하다고 부르지 않아.

```python
import argparse
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--candidate', required=True)
p.add_argument('--baseline', default='6a59c33ced4fbbe237b38eb5a4c63e38636bf07f')
p.add_argument('--kind', choices=['short28', 'steady48', 'auto8'], default='short28')
p.add_argument('--output', type=Path, required=True)
p.add_argument('--samples', type=int)
args = p.parse_args()
if args.samples is not None and args.samples < 1:
    p.error('--samples는 1 이상이어야 해')
scenes = {
    'hall': 'front,wide,foyer,rotate,broadcast,broadcast-hidden,broadcast-return,effects-show',
    'sphere': 'front,wide,dome,forest,peaks,ocean,clouds,crossfade,reveal,broadcast,effects-show',
}
jobs = []

def add(side, repeat, venue, quality, device):
    label = f'{side}-{repeat}'
    cadence = args.kind != 'short28'
    n = args.samples or (8 if args.kind == 'short28' else 3600 if args.kind == 'auto8' else 600)
    width, height, dpr = (640, 360, 1) if device == 'desktop' else (390, 844, 2)
    jobs.append({
        'id': f'{label}-{venue}-{quality}-{device}',
        'script': 'tools/bench/full-frame.mjs',
        'args': [label, venue, quality, device, 'wide,front' if quality == 'auto' else scenes[venue]],
        'directory': 'render',
        'env': {
            'BASE_URL': f'http://127.0.0.1:{18080 if side == "baseline" else 18081}/',
            'REVISION': args.baseline if side == 'baseline' else args.candidate,
            'MODE': 'cadence' if cadence else 'sync',
            'SAMPLES': n, 'WARMUP': 30 if quality == 'auto' else 94 if cadence else 4,
            'SCREENSHOTS': 1, 'WIDTH': width, 'HEIGHT': height, 'DPR': dpr,
            'TIMEOUT_MS': 600000 if cadence else 180000,
        },
    })

for device in ['desktop', 'mobile']:
    for quality in (['auto'] if args.kind == 'auto8' else ['high', 'medium', 'low']):
        for venue in ['hall', 'sphere']:
            order = [('baseline', 'a'), ('candidate', 'a')]
            if args.kind == 'steady48':
                order += [('candidate', 'b'), ('baseline', 'b')]
            for side, repeat in order:
                add(side, repeat, venue, quality, device)
if args.kind == 'short28':
    for venue in ['hall', 'sphere']:
        for side in ['candidate', 'baseline']:
            add(side, 'b', venue, 'high', 'desktop')
with args.output.open('x', encoding='utf-8') as f:
    json.dump(jobs, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(f'{len(jobs)} jobs: {args.output}')
```

Windows에서는 다음처럼 생성하고 실행해.

```powershell
py -3 "$benchRoot/make-pc-plan.py" --candidate $candidateRef --kind short28 --output "$benchRoot/pc-short28.json"
if ($LASTEXITCODE -ne 0) { throw "계획 생성 실패" }
py -3 tools/bench/run-plan.py "$benchRoot/pc-short28.json" --output "$benchRoot/results/short28-r1"
```

macOS/Linux에서는 다음을 사용해.

```bash
python3 "$bench_root/make-pc-plan.py" --candidate "$candidate_ref" --kind short28 --output "$bench_root/pc-short28.json"
python3 tools/bench/run-plan.py "$bench_root/pc-short28.json" --output "$bench_root/results/short28-r1"
```

계획을 만든 뒤 JSON을 열어 포트·SHA·크기·표본 수를 확인해. 원본 계획은 실행 중 바꾸지 않아. 실제 사용 해상도에서 시험할 때는 별도 계획 파일을 만들고 desktop 항목의 `WIDTH/HEIGHT/DPR`을 모두 같은 값으로 변경해. `run-plan.py`의 job별 `env`가 바깥 환경변수보다 우선하므로 터미널에서 `WIDTH`만 바꿔도 계획에 명시한 해상도는 바뀌지 않아.

`steady48` 또는 `auto8`도 `--kind`와 계획·출력 파일 이름을 바꿔 같은 방식으로 생성해. 비교 순서 효과를 더 확인하려면 별도 묶음에서 순서를 다시 바꾸거나 각 조합을 추가 반복해. 표본 600개는 1% Low 계산에 느린 6개만 사용해. 드문 끊김을 보려면 `--samples 1800` 이상과 정상 앱 60초·장시간 관찰을 추가하되 A/B의 표본 수를 똑같이 맞춰.

`WARMUP=94`는 low 중계의 기존 90-frame 갱신 주기를 넘겨 관찰하기 위한 조건이야. 모든 셰이더·열 상태가 완전히 안정됐다는 보장은 없어. `WARMUP=4`인 초기 동작 관찰과 섞어 평균을 내지 않아. 처음 중계를 켤 때의 첫 그림 지연은 별도 실제 UI 시험으로 기록해. `WARMUP=0`은 현재 수집기에서 지원하지 않아.

### 중단·재개와 로그

[`run-plan.py`](../tools/bench/run-plan.py)는 한 번에 하나의 job을 실행하고 `logs/NNN-id.json`과 `.log`에 명령·계획 해시·collector 해시·시각·exit code를 보관해. 기본은 첫 실패에서 멈춰. 실패를 보존하면서 나머지도 조사하려면 `--continue-on-failure`를 사용해. 이때 마지막 exit code 1은 실패가 포함됐다는 뜻이야.

```bash
# 0부터 시작하는 index 10, 11만 실행하는 예시야. --end는 포함하지 않아.
python3 tools/bench/run-plan.py /absolute/path/pc-short28.json --output /absolute/path/results/short28-r1 --start 10 --end 12
```

기존 로그가 있는 index는 덮어쓰지 않고 실패해. 마지막 **완료한 index 다음**부터 재개하고, 중단된 index 재시도는 새 출력 폴더에 남겨. 기록의 `RUNNING`은 완료가 아니야. 실행기가 쓰는 `PASS`는 그 프로세스의 exit code 0을 뜻하며, 성능 개선·화질·오디오·실기기 전체 통과를 뜻하지 않아.

## 6. 숫자와 이미지를 함께 비교해

같은 조건의 A/B raw JSON을 [`compare.mjs`](../tools/bench/compare.mjs)에 전달해. 자동 품질과 고정 품질은 분리해.

```powershell
$runRoot = Join-Path $benchRoot "results/short28-r1"
$comparison = node tools/bench/compare.mjs "$runRoot/render/baseline-a-full-hall-high-desktop-sync.json" "$runRoot/render/candidate-a-full-hall-high-desktop-sync.json"
if ($LASTEXITCODE -ne 0) { throw "비교 조건 불일치 또는 측정 실패" }
[System.IO.File]::WriteAllText("$runRoot/hall-high-a-comparison.json", ($comparison -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
```

```bash
run_root="$bench_root/results/short28-r1"
node tools/bench/compare.mjs "$run_root/render/baseline-a-full-hall-high-desktop-sync.json" "$run_root/render/candidate-a-full-hall-high-desktop-sync.json" > "$run_root/hall-high-a-comparison.json"
```

PowerShell 예시는 UTF-8 BOM 없이 JSON을 저장해. Windows PowerShell 5.1의 `Out-File -Encoding utf8`은 BOM을 붙일 수 있어서 이 명령으로 대신했어. 다른 venue·quality·device도 파일 이름을 맞춰 반복해. B2/A2도 방향은 항상 before=A2, after=B2로 넣어. 조건 검사 실패를 옵션을 바꾸거나 raw를 편집해서 우회하지 마.

현재 비교기는 프리셋·모드·크기·표본 수·준비 횟수·순서·fixture·카메라·renderer·일부 환경 조건을 검사해. 추가된 `collectorSourceSha256`, `helperSourceSha256`, 실제 소스·실행 명령줄까지 모두 자동 검사한다고 가정하지 말고 raw에서 확인해. `sourceHashes`와 `sourceHashesAfter`는 수집 전후 실제 제공한 주요 JS의 내용이 같은지 확인하며, 달라지면 해당 수집기는 실패해. 두 버전의 제품 코드 해시가 서로 다른 것은 정상이고 **각각 의도한 checkout과 같아야 하는 것**이야.

cadence 비교의 평균 관측 FPS는 `1000 / 평균 cadenceMs`야. 1% Low는 `1000 / 느린 상위 ceil(n×0.01)개 간격의 평균`이고 n<100이면 계산하지 않아. p50/p95/p99는 nearest-rank 방식이야. 평균 FPS가 좋아도 1% Low나 p95가 나빠질 수 있으니 모두 남겨. [비교 계산 코드](../tools/bench/compare.mjs)

### 스크린샷

이미지 계산을 할 때만 별도 Python 환경을 준비해. 아래 버전은 기존 PC 안내의 고정 버전이야. 설치 버전을 바꾸면 실제 `pip freeze`도 저장해.

```powershell
py -3 -m venv "$benchRoot/image-runtime"
$imagePython = Join-Path $benchRoot "image-runtime/Scripts/python.exe"
& $imagePython -m pip install Pillow==12.3.0 numpy==2.3.5
& $imagePython tools/bench/compare-images.py "$runRoot/render/baseline-a-full-hall-high-desktop-sync-wide.png" "$runRoot/render/candidate-a-full-hall-high-desktop-sync-wide.png" --output "$runRoot/hall-wide-image.json"
```

```bash
python3 -m venv "$bench_root/image-runtime"
image_python="$bench_root/image-runtime/bin/python"
"$image_python" -m pip install Pillow==12.3.0 numpy==2.3.5
"$image_python" tools/bench/compare-images.py "$run_root/render/baseline-a-full-hall-high-desktop-sync-wide.png" "$run_root/render/candidate-a-full-hall-high-desktop-sync-wide.png" --output "$run_root/hall-wide-image.json"
```

도구는 자동 정렬이나 크기 조절을 하지 않고 MAE·RMSE·변경 픽셀 비율·7×7 uniform SSIM을 계산해. 양쪽 원본 PNG를 같은 배율로 나란히 보고, 필요한 곳은 동일 좌표의 `--crop x,y,width,height`로 확대 비교해. 작은 악기·관객·발코니의 누락은 전체 화면 SSIM에 잘 드러나지 않을 수 있어. 한 숫자만 화질 합격선으로 사용하지 않아. [이미지 비교 정의](../tools/bench/compare-images.py)

다음 부분은 육안 확인을 따로 남겨.

- Hall: 네 층 발코니와 좌석 모서리, 샹들리에·난간, 악기·동물 모델, 그림자, 객석과 로비 경계, 멀리서 보이는 관객.
- Sphere: 돔의 입체감, 큐브맵 경계·빈 면·이전 세계 잔상, 숲·산·바다·구름, 크로스페이드와 reveal 중간의 밝기·끊김.
- 공통: 활·손·지휘·박수 포즈, 무대 중계의 첫 화면과 재등장 화면, 폭죽·레이저의 밀도와 밝기.

포즈·파티클·빛의 변화가 자연스러운 시간 차이인지, 서로 다른 프레임 수·시나리오 순서 때문인지 먼저 확인해. cadence는 스크린샷 촬영 사이에도 실제 시간이 흐르므로 고정 픽셀 비교에는 동일 조건의 sync 캡처를 우선 사용해. 정지 PNG로 세계 전환의 시간적 끊김이나 오디오 동기화를 보장할 수는 없어.

## 7. 실제 공연에서 FPS·CPU 병목 확인

fixture 브라우저를 종료하고 일반 브라우저에서 A/B를 하나씩 열어. 공연장 직접 입장은 `http://127.0.0.1:18080/?venue=hall&lobby`와 후보의 18081을 사용하고, 광장부터 확인할 때는 `/`에서 시작해. Sphere는 `venue=sphere`야. 고정 품질은 같은 설정으로 새로 입장하고 같은 곡·좌석·시선·중계·효과 상태를 맞춰.

정상 앱의 솔로 관객 난수와 음악 진행은 full-frame fixture처럼 자동으로 고정되지 않아. 실제 관객 수·자리·곡·관찰 시작 시각을 기록하고, 이 관찰을 픽셀까지 동일한 장면의 정량 비교로 과장하지 않아. 정확한 고정 장면 비교는 앞의 fixture가 맡고, 이 단계는 실제 입력·오디오를 포함한 사용 중 안정성을 확인해.

정상 앱에서 60초 rAF 간격을 기록하려면 Console에 아래 코드를 한 번 실행해. 앱 루프나 오디오 시계를 바꾸지 않아. 녹화·DevTools CPU 프로파일링은 동시에 켜지 말고 A/B에서 같은 계측 조건을 사용해.

```js
(() => {
  if (window.__bench) throw new Error('fixture 페이지가 아닌 정상 앱에서 실행해');
  if (!window.__fp?.perf.playing) throw new Error('실제 공연을 먼저 재생해');
  const rows = [], states = [], visibility = [];
  const state = () => {
    const f = window.__fp;
    return { at: performance.now(), piece: f.perf.piece?.id, time: f.perf.time,
      playing: f.perf.playing, audioNow: f.engine.ctx.currentTime, audioState: f.engine.ctx.state,
      qualitySetting: f.settings.quality, appliedQuality: f.stats?.quality ?? null,
      renderScale: f.stats?.renderScale ?? null, pixelRatio: f.renderer.getPixelRatio(),
      camera: f.camera.position.toArray(), quaternion: f.camera.quaternion.toArray(),
      audience: f.audience?.count ?? null, heap: performance.memory?.usedJSHeapSize ?? null };
  };
  const onVisibility = () => visibility.push({ at: performance.now(), state: document.visibilityState });
  onVisibility();
  document.addEventListener('visibilitychange', onVisibility);
  states.push(state());
  let first, previous, lastState = performance.now();
  function sample(now) {
    if (first === undefined) first = now;
    if (previous !== undefined) rows.push(now - previous);
    previous = now;
    if (now - lastState >= 1000) { states.push(state()); lastState = now; }
    if (now - first < 60000) { requestAnimationFrame(sample); return; }
    document.removeEventListener('visibilitychange', onVisibility);
    states.push(state());
    const sorted = [...rows].sort((a, b) => a - b);
    const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
    const count = rows.length >= 100 ? Math.ceil(rows.length * .01) : null;
    const q = p => sorted[Math.ceil(sorted.length * p) - 1];
    window.__pcLiveResult = { kind: 'normal-app-native-raf-observation',
      userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
      durationMs: now - first, sampleCount: rows.length,
      observedRafFps: 1000 / mean(rows),
      onePercentLowRafFps: count ? 1000 / mean(sorted.slice(-count)) : null,
      slowestSampleCount: count, p50Ms: q(.5), p95Ms: q(.95), p99Ms: q(.99),
      over33ms: rows.filter(x => x > 33.333).length, over50ms: rows.filter(x => x > 50).length,
      visibility, states, samplesMs: rows };
    console.log(window.__pcLiveResult);
  }
  requestAnimationFrame(sample);
})();
```

완료한 뒤 `copy(JSON.stringify(window.__pcLiveResult, null, 2))`로 복사해서 A/B별 JSON 파일로 저장해. 탭을 숨기면 rAF가 멈출 수 있어 실제 완료까지 60초보다 더 걸릴 수 있고 visibility 이벤트도 남아. 숨긴 구간을 포함한 파일을 정상 전경 60초 결과로 쓰지 않아. 이 값 역시 rAF callback 간격이며 디스플레이에 실제 표시된 프레임 수나 GPU timer 결과와 같지는 않아.

60FPS의 프레임 예산은 약 16.7ms, 30FPS는 약 33.3ms야. 평균뿐 아니라 1% Low·p95/p99·33/50ms 초과 프레임·사용 중 긴 정지를 함께 봐. 모니터가 120/144Hz라면 관측 callback 빈도의 상한도 달라지므로 같은 주사율에서 비교해. 특정 장면에서 목표를 못 맞췄다면 실제 수치와 조건을 그대로 남겨.

별도의 실행에서 Chrome/Edge DevTools Performance로 같은 곡·시점의 20~30초를 기록해. CPU·network throttling, 스크린샷·메모리 옵션을 양쪽 동일하게 맞추고 trace 원본을 저장해. 연주 중 전경 유지 → 빠른 이동/회전 → 중계 켜기 → Sphere 세계 전환처럼 동작 시각도 기록해. Main의 긴 task, 스크립트·레이아웃·GC·렌더 제출, frame 간격을 비교하되 profiler 비용이 들어간 결과를 앞의 무프로파일 실행과 한 평균으로 합치지 않아.

추가 CPU slowdown 실험은 별도 폴더에 배율을 기록해. CPU 배율 제한이나 mobile viewport가 실제 저사양 PC·휴대폰의 GPU·메모리·발열·오디오 장치를 재현하는 것은 아니야. GPU 시간과 GPU 메모리 bytes를 직접 얻지 못하면 미측정으로 적어.

## 8. 자동 품질은 별도 결과로 평가해

`auto8`은 `MODE=cadence`, `quality=auto`로 무거운 `wide`에서 가벼운 `front`로 이동해 하강·회복을 관찰하는 예비 계획이야. 기본 3,600 callback 표본을 장면마다 기록하므로 물리 GPU에서도 시간이 걸려. 실제 경과시간과 품질 정책 상태를 확인하고, 회복이 일어나지 않았다고 바로 버그로 판정하지 않아. 회복 여유·보호 시간·실패한 회복 시도의 재시도 억제 조건이 영향을 줄 수 있어. [자동 품질 정책](../public/js/quality.js)

이 모드에서는 실제 경과시간으로 기존 품질 정책을 실행하지만 음악 시계는 여전히 fixture이고 음표 스케줄러는 꺼져 있어. 다음을 각각 기록해.

- 프리셋·`renderScale`·실제 pixel ratio가 바뀐 시점과 유지 시간.
- 변경 전후의 평균 rAF FPS·1% Low·p95/p99, 화면 선명도와 효과 변화.
- 부하가 줄어든 뒤 품질이 회복됐는지, 반복해서 오르내렸는지.
- 갑작스러운 입장·세계 전환·탭 복귀 직후 일시 정지에 과민하게 반응했는지.

`compare.mjs`는 auto를 동일 화질 비교에서 거부해. 해상도를 낮춰 얻은 FPS를 high→high 성능 개선율에 포함하지 않아. 자동 결과는 **안정성·화질 변화·회복 동작**을 함께 보여 주는 별도 표로 작성해. 정상 앱의 실제 음악·배터리 환경에서도 같은 절차를 다시 확인해.

## 9. 로딩·기능·오디오·방 검증

렌더 벤치마크가 끝난 뒤 실행해. 다음은 **실행 가능한 검사 목록**이며, 명령이 적혀 있다는 이유로 통과한 것은 아니야. 실행 날짜·SHA·결과 파일·exit code를 각각 남겨.

먼저 candidate 폴더에서 Node 회귀 테스트를 실행해. 브라우저는 시작하지 않아.

```bash
npm test
```

브라우저 검사는 `BASE_URL`, `REVISION`, `OUTPUT_DIR`을 지정하고 실행해. 예를 들어 후보 runtime용으로 설정한 뒤 아래 개별 명령을 순서대로 사용해. PowerShell은 `$env:BASE_URL = "..."`, Bash는 `export BASE_URL=...` 형식이야. 반복할 때는 새 출력 폴더와 LABEL을 정해.

```powershell
$env:BASE_URL = "http://127.0.0.1:18081/"
$env:REVISION = $candidateRef
$env:OUTPUT_DIR = Join-Path $benchRoot "results/runtime-candidate-r1"
$env:LABEL = "pc-candidate-r1"
```

```bash
export BASE_URL=http://127.0.0.1:18081/ REVISION="$candidate_ref"
export OUTPUT_DIR="$bench_root/results/runtime-candidate-r1" LABEL=pc-candidate-r1
```

| 도구·명령 | 실제 범위와 해석 |
| --- | --- |
| `node tools/bench/loading.mjs pc-candidate hall desktop` | 실제 cold/warm HTTP 캐시·준비 완료·전송량·long task. main rAF를 잡은 통제된 초기화 관찰이며 정상 첫 인터랙티브 프레임 시간과 달라. |
| `node tools/bench/functional.mjs hall desktop` | 실제 UI 이동·회전·앉기/일어나기·공연 시작/일시정지/seek/재개·설정·세계 전환. main rAF와 일부 위치·무대·전환 준비는 fixture야. |
| `node tools/bench/plaza.mjs hall desktop` | 광장 → 매표 → 표 발급 → 실제 입구 이동·입장 → 광장 복귀. 기본 `NAVIGATION=ui`는 실제 입력을 사용해. `placement` 결과는 이동 성공으로 계산하지 않아. |
| `node tools/bench/rituals.mjs hall desktop` | 로비·독주회·인터미션·예약/수면/깨우기. 명시적 위치·시간 준비가 있고 자연적인 15분 만료 검사는 별도야. |
| `node tools/bench/audio-resume.mjs pc-candidate hall desktop` | 실제 오디오 그래프에서 readPixels 전후, pause 전, seek/resume 후 2초, 다음 프레임 뒤의 시계·tick·음표 요청을 분리해. |
| `node tools/bench/audio-stability.mjs pc-candidate hall desktop 65` | 실제 스케줄러·샘플·네이티브 시계와 source start를 관찰해. 시각 업데이트 5Hz, 반복 WebGL 렌더를 멈춘 조건이므로 지속 GPU 부하 중 음질 통과가 아니야. |
| `node tools/bench/audio-worker.mjs pc-candidate` | 실제 module Worker와 CSP 차단 fallback의 PCM 비교. 실제 스피커·전체 앱 부하 검사는 아니야. 후보의 새 Worker 경로를 위한 검사야. |
| `node tools/bench/rooms.mjs pc-candidate hall cross` | localhost의 비공개 방 생성·초대·참여·채팅·권한·공연장 선택/redirect·동기화 UI. 소리·관객·효과를 줄인 기능 조건이야. |
| `node tools/bench/multiplayer.mjs pc-candidate` | 별도 localhost 서버와 실제 RoomClient를 사용하는 프로토콜 검사. 브라우저 렌더·실제 스피커 간 동기화 검사가 아니야. 기본은 도구가 있는 candidate checkout을 검사해. |

`hall`을 `sphere`로, 지원하는 도구의 `desktop`을 `mobile`로 바꿔 각각 검사해. 두 버전 모두 가능한 runtime 검사는 기준선 `BASE_URL=http://127.0.0.1:18080/`, 기준 SHA, 다른 라벨·출력 폴더로 다시 실행해. 새 Worker 전용 도구와 `multiplayer.mjs`의 후보 파일 요구사항은 기준선에 같은 API가 있는지 먼저 확인해. `REPO_DIR`만 바꾼다고 없는 신규 모듈 검사가 자동으로 생략되는 것은 아니야.

현재 audio-stability는 광장 통합 이후 `appURL()`의 직접 로비 경로를 사용하도록 수정됐어. 이 문서 작성 단계에서는 그 수정의 구문 검사를 확인했을 뿐, **수정 후 실제 브라우저 실행 PASS를 이 문서에서 주장하지 않아.** 최신 기본 프로그램과 도구의 기대 곡이 다르다면 실패를 남기고 fixture를 검토해야 해. 장시간 시험을 위해 65를 1800으로 바꾸는 방식은 지원하지 않아.

loading의 cold는 새 BrowserContext의 첫 탐색이고 warm은 같은 context에서 같은 URL로 다시 이동한 결과야. 관객 전용 seed를 고정하는 local proxy를 사용하며 바뀐 main 응답은 `controlledMainFixture` 전송량으로 따로 기록해. 브라우저 캐시·원본 서버/OS 캐시·외부 폰트 캐시는 구분해. 전후는 `compare-loading.mjs before.json after.json`으로 관객 점유 hash와 조건을 확인하고, cold끼리·warm끼리 여러 번 비교해. 한 번의 준비시간으로 안정적인 개선율을 확정하지 않아. [로딩 도구](../tools/bench/loading.mjs)

### 오디오 실패를 진단하는 순서

`audio-resume.mjs`는 기본 `FRAME_MODE=controlled`에서 실제 재개 2초 조건을 보존해. Pause 전부터 오디오 시계가 멈췄는지 확인하고, 필요하면 `READBACK=0`, `PRELUDE_FRAMES=0`, `FRAME_MODE=native`를 각각 **별도 실험**으로 사용해. 다음 프레임에서 시계가 회복해도 원래 FAIL은 남아. 단순히 timeout을 늘리거나 제품에서 매 프레임 `resume()`을 호출해 검사를 통과시키지 않아. [재개 진단 도구](../tools/bench/audio-resume.mjs)

과거 Hall 재개 FAIL은 [a41 원본 보존 자료](historical-a41/README.md)에 남겨. 기준선·후보에서 모두 발생한 실패와 최소 oscillator 검사의 성공을 함께 보되, 그것만으로 제품 원인이나 환경 원인을 확정하지 않아. 새 6a 진단 결과도 새 폴더에 저장하고, 원본 실패의 상태나 `revision`을 수정하지 않아.

### 기존 native 음악 관찰용 collector: 공개한 6bb 버전

후속 collector에는 `LIVE_WINDOW_MS` 옵션이 추가됐어. **이 옵션은 위에서 고정한 `06c8ac5`나 감사 시점 `b3717c8`의 도구에는 없는 추가 기능**이야. 이 첫 native collector는 공개 커밋 `09492033251fd1986f7ce8c755b39923e539407a`에 보존돼 있고, `audio-resume.mjs`의 SHA-256은 `6bbf491704265dbe5c8e133974c7cd947a242ca1ff40ac4dc517a0c36d010d11`야. 아래 명령은 이 공개 커밋을 **전체 SHA로 고정한 별도 worktree**를 만들어. 로컬에서만 사용했던 다른 커밋 ID를 PC 재현의 checkout 대상으로 쓰지 않아. 다음 절의 고정 관객 옵션은 이 6bb 버전에 없는 별도 변경이야.

제품 서버는 계속 reference의 6a와 candidate의 06c8ac5를 서비스해. 후속 도구는 별도 폴더에서 실행하므로 baseline/candidate에 복사할 필요가 없어. helper를 포함한 같은 collector checkout을 A/B 모두에 사용해. 아직 이 파일이 공개되지 않았거나 이후 내용이 바뀐 경우 아래 해시 검사에서 중단돼. 그때는 최종 보고서/증거 묶음에 기록된 정확한 collector 버전을 사용하고 변경된 도구로 실행한 결과를 별도 측정으로 구분해.

```powershell
git -C $sourceRoot fetch origin perf/261021-venue-rendering
if ($LASTEXITCODE -ne 0) { throw "도구 버전 fetch 실패" }
$runtimeToolsRef = "09492033251fd1986f7ce8c755b39923e539407a"
$runtimeToolsRoot = Join-Path $benchRoot "runtime-collector"
git -C $sourceRoot worktree add --detach $runtimeToolsRoot $runtimeToolsRef
if ($LASTEXITCODE -ne 0) { throw "도구 worktree 생성 실패" }
if ((Get-FileHash "$runtimeToolsRoot/tools/bench/audio-resume.mjs").Hash.ToLowerInvariant() -ne "6bbf491704265dbe5c8e133974c7cd947a242ca1ff40ac4dc517a0c36d010d11") { throw "audio-resume 해시 불일치: 기록된 후속 collector 커밋을 확인해" }
if ((Get-FileHash "$runtimeToolsRoot/tools/bench/browser.mjs").Hash.ToLowerInvariant() -ne "90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9") { throw "browser helper 해시 불일치" }
Set-Location $runtimeToolsRoot
git rev-parse HEAD
git status --short
node tools/bench/audio-resume.mjs --help
if ($LASTEXITCODE -ne 0) { throw "도구 help 실패" }
```

```bash
git -C "$source_root" fetch origin perf/261021-venue-rendering
runtime_tools_ref=09492033251fd1986f7ce8c755b39923e539407a
runtime_tools_root="$bench_root/runtime-collector"
git -C "$source_root" worktree add --detach "$runtime_tools_root" "$runtime_tools_ref"
cd "$runtime_tools_root"
node --input-type=module -e 'import fs from "node:fs"; import crypto from "node:crypto"; import assert from "node:assert/strict"; const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); assert.equal(hash("tools/bench/audio-resume.mjs"), "6bbf491704265dbe5c8e133974c7cd947a242ca1ff40ac4dc517a0c36d010d11"); assert.equal(hash("tools/bench/browser.mjs"), "90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9");'
git rev-parse HEAD
git status --short
node tools/bench/audio-resume.mjs --help
```

출력한 전체 collector SHA와 두 파일 해시를 결과와 함께 보관해. `status --short`가 비어 있지 않다면 해당 diff도 함께 남겨. 이 별도 폴더에서 `npm test`를 실행하면 도구 checkout의 제품을 검사하게 되므로, 제품 회귀 테스트는 원래 candidate 폴더에서 실행해. `multiplayer.mjs`도 서버를 직접 띄우는 도구라 이 폴더에서 실행할 때는 `REPO_DIR`을 검사하려는 제품 worktree로 명시해야 해. 일반 브라우저 도구는 `BASE_URL`의 서버를 검사해.

`FRAME_MODE=native READBACK=0 LIVE_WINDOW_MS=30000`을 지정하면 기존 재개·다음 프레임 진단이 끝난 뒤 **실제 음악과 원래 main rAF를 함께 30초간 관찰**해. 기본값 0은 비활성이고 최대 60,000ms야. 이 구간에는 추가 렌더·readPixels·음악 선택·재예약·AudioContext 재시작이 없어. 아래 A/B를 직렬로 실행하고 반복할 때는 새 출력 폴더·라벨을 사용해.

```powershell
# 위에서 준비한 runtime-collector 폴더와 공통 브라우저 환경을 사용해.
$env:FRAME_MODE = "native"
$env:READBACK = "0"
$env:LIVE_WINDOW_MS = "30000"
$env:OUTPUT_DIR = Join-Path $benchRoot "results/audio-native-r1"
$env:BASE_URL = "http://127.0.0.1:18080/"
$env:REVISION = $baselineRef
node tools/bench/audio-resume.mjs baseline-native-r1 hall desktop
$baselineAudioExit = $LASTEXITCODE
$env:BASE_URL = "http://127.0.0.1:18081/"
$env:REVISION = $candidateRef
node tools/bench/audio-resume.mjs candidate-native-r1 hall desktop
$candidateAudioExit = $LASTEXITCODE
# 실패여도 위 도구가 남긴 진단 원본은 보존해. 다음 실험 전 옵션을 되돌려.
Remove-Item Env:FRAME_MODE, Env:READBACK, Env:LIVE_WINDOW_MS -ErrorAction SilentlyContinue
Set-Location $candidateRoot
"baseline exit=$baselineAudioExit, candidate exit=$candidateAudioExit"
```

```bash
# 각 명령의 환경은 해당 실행에만 적용돼. 실패 뒤에도 두 번째 진단을 남겨.
baseline_audio_exit=0
FRAME_MODE=native READBACK=0 LIVE_WINDOW_MS=30000 BASE_URL=http://127.0.0.1:18080/ REVISION="$baseline_ref" OUTPUT_DIR="$bench_root/results/audio-native-r1" node tools/bench/audio-resume.mjs baseline-native-r1 hall desktop || baseline_audio_exit=$?
candidate_audio_exit=0
FRAME_MODE=native READBACK=0 LIVE_WINDOW_MS=30000 BASE_URL=http://127.0.0.1:18081/ REVISION="$candidate_ref" OUTPUT_DIR="$bench_root/results/audio-native-r1" node tools/bench/audio-resume.mjs candidate-native-r1 hall desktop || candidate_audio_exit=$?
cd "$candidate_root"
printf 'baseline exit=%s, candidate exit=%s\n' "$baseline_audio_exit" "$candidate_audio_exit"
```

프레임 시작 시각만 매 프레임 저장하고, 실제 pose·품질·pixel ratio·음악/오디오 시계·heap은 시작·끝과 1초 간격으로 기록해. `liveWindow.cadence`는 평균 관측 rAF FPS와 p50/p95/p99·1% Low를 담고, 간격이 100개 미만이면 1% Low는 미측정이야. 시작/끝의 부분 구간과 전체 관찰 시간당 callback 수도 따로 기록하므로 마지막 프레임에서 긴 정지가 있었는지 함께 봐. `live-window` phase의 late note·score mismatch·worker tick 최대 간격도 준비 구간과 분리해.

곡·transport 기준 시각·숨김·수면·프리셋/scale/pixel ratio가 달라지면 `liveWindow.sameConditionComparison`에 제외 사유가 남아. 제외 사유가 없더라도 A/B의 시작 음악 시각·pose·관찰 시간·실제 제품과 도구·기기 조건을 따로 맞춰야 해. 원래 2초 재개 FAIL은 이 관찰에서 회복해도 유지하고, 이 옵션의 결과를 물리 출력 음질이나 오디오 글리치 부재와 동등하게 주장하지 않아. 문서의 이 설명은 후속 도구 사용법이며 실제 실행 PASS 보고가 아니야.

### 후속 선택 옵션: 관객 배치와 실제 좌석까지 맞추기

`FIXED_AUDIENCE_SEED=417`을 지원하는 후속 `audio-resume.mjs`의 SHA-256은 `089678a0b0afcc9be77ae11d7bc160fffce2239e29afc64b78f7fdf6e8a154d7`야. 재사용하는 `loading-proxy.mjs` 해시는 `e8f311048df6104ca3fd7104753519c128e000e9dc93fe2a5b7f1a5641ef9f7b`야. 위 6bb 버전의 명령과 원본 결과는 그대로 보존하고, 이 옵션을 사용한 결과에는 새 collector 해시·전체 커밋 SHA·출력 폴더를 남겨.

기존 전역 `Math.random=417`만으로는 버전별 Three 객체·UUID 생성 횟수 차이 때문에 solo 관객 배치까지 같다고 보장할 수 없어. 이 선택 옵션은 [`fixedAudienceMain()`](../tools/bench/loading-proxy.mjs)을 재사용해서 실제 main 응답의 `const rand = room ? seeded(room.seed) : Math.random;` 한 곳만 별도 `seeded(417)`로 바꿔. anchor가 없거나 두 개 이상이면 실패해. 디스크의 제품 파일·방의 seed·음악 시계·오디오 스케줄러·frame/readPixels 정책은 바꾸지 않아. 옵션을 생략하면 기존 solo 난수 경로와 `z+0.5` 접근을 유지해.

옵션을 켠 경우에는 선택한 실제 빈 좌석의 `z+0.2`로 접근하고 E/touch로 앉은 뒤 `actualSeat.index === selectedSeat.index`를 검사해. 다르면 FAIL을 남겨. 원본/변환 main SHA, seed, 관객 수, `director.occupied`와 `audience.occupied` 각각의 숫자 오름차순 좌석 배열 SHA, 선택한 좌석·실제로 앉은 좌석·카메라 정보를 JSON에 남겨. 좌석 hash는 UTF-8 `JSON.stringify(sortedIndices)`의 SHA-256이야. A/B의 관객 수·hash·실제 좌석·pose도 비교해야 하며 seed 값만 같다는 이유로 조건이 일치했다고 판단하지 않아.

후속 도구 커밋이 공개된 뒤 다음처럼 별도 worktree를 만들고 파일 해시를 확인해. fetch한 브랜치를 한 번 전체 SHA로 고정하므로 이후 브랜치 변경이 실행 중인 도구에 적용되지 않아. 최종 보고서가 명시한 후속 collector 전체 SHA가 있으면 `fixedToolsRef`에 그 값을 직접 지정해도 돼. 이 경로에서도 제품 서버 A/B는 계속 6a/06c8ac5야.

```powershell
git -C $sourceRoot fetch origin perf/261021-venue-rendering
if ($LASTEXITCODE -ne 0) { throw "후속 도구 fetch 실패" }
$fixedToolsRef = (git -C $sourceRoot rev-parse FETCH_HEAD).Trim()
$fixedToolsRoot = Join-Path $benchRoot "fixed-audience-collector"
git -C $sourceRoot worktree add --detach $fixedToolsRoot $fixedToolsRef
if ($LASTEXITCODE -ne 0) { throw "후속 도구 worktree 생성 실패" }
Set-Location $fixedToolsRoot
if ((Get-FileHash "tools/bench/audio-resume.mjs").Hash.ToLowerInvariant() -ne "089678a0b0afcc9be77ae11d7bc160fffce2239e29afc64b78f7fdf6e8a154d7") { throw "후속 audio-resume 해시 불일치" }
if ((Get-FileHash "tools/bench/loading-proxy.mjs").Hash.ToLowerInvariant() -ne "e8f311048df6104ca3fd7104753519c128e000e9dc93fe2a5b7f1a5641ef9f7b") { throw "관객 변환 함수 파일 해시 불일치" }
if ((Get-FileHash "tools/bench/browser.mjs").Hash.ToLowerInvariant() -ne "90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9") { throw "browser helper 해시 불일치" }
git rev-parse HEAD
git status --short
$env:FIXED_AUDIENCE_SEED = "417"
$env:FRAME_MODE = "native"
$env:READBACK = "0"
$env:LIVE_WINDOW_MS = "30000"
$env:QUALITY = "low"
$env:OUTPUT_DIR = Join-Path $benchRoot "results/audio-native-fixed-r1"
$env:BASE_URL = "http://127.0.0.1:18080/"
$env:REVISION = $baselineRef
node tools/bench/audio-resume.mjs baseline-native-fixed-r1 hall desktop
$baselineFixedExit = $LASTEXITCODE
$env:BASE_URL = "http://127.0.0.1:18081/"
$env:REVISION = $candidateRef
node tools/bench/audio-resume.mjs candidate-native-fixed-r1 hall desktop
$candidateFixedExit = $LASTEXITCODE
Remove-Item Env:FIXED_AUDIENCE_SEED, Env:FRAME_MODE, Env:READBACK, Env:LIVE_WINDOW_MS, Env:QUALITY -ErrorAction SilentlyContinue
Set-Location $candidateRoot
"baseline exit=$baselineFixedExit, candidate exit=$candidateFixedExit"
```

```bash
git -C "$source_root" fetch origin perf/261021-venue-rendering
fixed_tools_ref=$(git -C "$source_root" rev-parse FETCH_HEAD)
fixed_tools_root="$bench_root/fixed-audience-collector"
git -C "$source_root" worktree add --detach "$fixed_tools_root" "$fixed_tools_ref"
cd "$fixed_tools_root"
node --input-type=module -e 'import fs from "node:fs"; import crypto from "node:crypto"; import assert from "node:assert/strict"; const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); assert.equal(hash("tools/bench/audio-resume.mjs"), "089678a0b0afcc9be77ae11d7bc160fffce2239e29afc64b78f7fdf6e8a154d7"); assert.equal(hash("tools/bench/loading-proxy.mjs"), "e8f311048df6104ca3fd7104753519c128e000e9dc93fe2a5b7f1a5641ef9f7b"); assert.equal(hash("tools/bench/browser.mjs"), "90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9");'
git rev-parse HEAD
git status --short
baseline_fixed_exit=0
FIXED_AUDIENCE_SEED=417 FRAME_MODE=native READBACK=0 LIVE_WINDOW_MS=30000 QUALITY=low BASE_URL=http://127.0.0.1:18080/ REVISION="$baseline_ref" OUTPUT_DIR="$bench_root/results/audio-native-fixed-r1" node tools/bench/audio-resume.mjs baseline-native-fixed-r1 hall desktop || baseline_fixed_exit=$?
candidate_fixed_exit=0
FIXED_AUDIENCE_SEED=417 FRAME_MODE=native READBACK=0 LIVE_WINDOW_MS=30000 QUALITY=low BASE_URL=http://127.0.0.1:18081/ REVISION="$candidate_ref" OUTPUT_DIR="$bench_root/results/audio-native-fixed-r1" node tools/bench/audio-resume.mjs candidate-native-fixed-r1 hall desktop || candidate_fixed_exit=$?
cd "$candidate_root"
printf 'baseline exit=%s, candidate exit=%s\n' "$baseline_fixed_exit" "$candidate_fixed_exit"
```

예시는 A/B 모두 처음부터 같은 수동 `low`로 입장하는 별도 조건이야. 이전 high 결과와 섞거나, low로 내린 효과를 동일 품질 최적화 성과에 포함하지 않아. `hall`을 `sphere`로 바꾸어 다른 라벨·출력 폴더로 반복하고, 같은 프리셋이어도 실제 Lite 상태·pixel ratio·시작 음악 시각을 확인해. 이 설명은 재현 절차이며 새 옵션의 실제 브라우저 PASS 보고가 아니야.

이 옵션의 main 응답은 Playwright route로 제공하므로 원본 HTTP 캐시·전송량·cold loading 결과로 사용하지 않아. 모든 관객·좌석 hash가 맞더라도 잔향 impulse response와 모든 절차적 난수, 물리 출력 음질까지 같다고 보장하지 않아. 실제 30초 관찰의 시계·음표·late 요청·메타데이터와 사람의 청취 결과를 별도로 확인해.

앱 없이 네이티브 시계만 분리해 볼 때는 `node tools/bench/audio-clock.mjs pc-clock current 65`를 사용해. `AUDIO_MUTE=unmuted`, `AUDIO_OUTPUT=fake`, `multiprocess`는 각기 다른 출력·프로세스 조건이므로 원본 조건과 분리해. **최소 oscillator PASS는 실제 오케스트라 음질 보장이 아니야.** Playwright 기본 인자가 음소거를 포함하는 실행도 있으므로 실제 듣기 검증은 일반 브라우저와 실제 출력 장치에서 수행해.

실제 음악을 들을 때는 같은 헤드폰/스피커·OS 출력 sample rate·볼륨·브라우저/OS 공간 음향 설정·유선/무선 연결을 기록해. 블루투스의 별도 지연도 구분해. 저음·고음·여러 악기가 겹치는 구간, 곡 시작과 끝, pause/seek/resume, 자리 이동, 중계·폭죽·돔 전환 순간의 클릭·끊김·늦은 첫 음·잔향 단절·음상 이동·활/지휘와 박자의 관계를 확인해.

청취는 수동 관찰로 기록하고 측정하지 않은 underrun 수를 0이라고 쓰지 마. 가능하면 OS loopback이나 외부 녹음 장치로 동일 구간을 남기되, 녹음·화면 캡처의 부하와 지연을 기록하고 무녹화 성능 수집과 분리해. 메트로놈/소리·화면 이벤트를 함께 기록하지 않았다면 정확한 A/V 동기화 ms를 만들지 않아.

## 10. 전원·배터리·발열과 30분 실제 감상

다음 조건을 A/B에서 고정해. 다른 조건도 궁금하면 별도 실험으로 나눠.

| 항목 | 남길 내용 |
| --- | --- |
| 전원 | AC/배터리, OS 전원 모드, 배터리 절약/저전력 모드, 충전 중인지 |
| GPU | 내장/외장 선택, 드라이버, 하드웨어 가속, 외부 모니터 연결 상태 |
| 화면 | 밝기, 해상도, OS 배율, 브라우저 확대, 주사율, 전체화면 여부 |
| 시작 상태 | 배터리 잔량, 실내 온도, 사용 가능한 CPU/GPU/기기 온도, 직전 부하와 휴식 시간 |
| 다른 작업 | 화면 녹화·백업·업데이트·원격 접속·다른 GPU 앱의 유무 |
| 오디오 | 출력 장치·볼륨·유선/무선·OS 효과·sample rate |

성능 한계 확인용 AC 실행과 배터리 지속 시간 실행은 별도 표로 남겨. A는 AC, B는 배터리이거나 A는 차가운 기기, B는 뜨거운 기기면 같은 조건 비교가 아니야. 온도를 읽을 수 있으면 시작 온도를 비슷하게 맞추고, 읽을 수 없으면 같은 실내에서 같은 휴식 시간을 두었다고 적어. 확인할 수 없는 온도를 추정해 채우지 않아.

각 공연장에서 같은 프로그램·좌석·초기 품질로 30분 재생해. 시작 직후와 5·15·30분에 다음을 남겨.

- 정상 앱 rAF 60초 관찰, 실제 프리셋/scale/pixel ratio, JS heap 또는 프로세스 메모리의 정확한 종류.
- 기기 온도/배터리 잔량, 팬 변화, 실제 음 끊김·재생 정지·WebGL context loss·reload 여부.
- 관찰 시점의 곡·공연 시각·관객 수·중계·돔 세계·효과 상태. 서로 다른 장면끼리 열화율을 단순 비교하지 않아.

기기별 실제 센서나 OS 도구가 제공하는 온도·전력만 적어. 팬 소리나 체감 열을 와트·도 단위 측정값으로 바꾸지 않아. 배터리 잔량 1% 단위와 짧은 관찰로 얻은 값은 거칠고, 충전 중 잔량 변화는 소비전력 측정이 아니야. 온도·메모리가 오르더라도 곧바로 누수나 스로틀링으로 단정하지 말고 같은 장면 복귀·휴식 후 회복·여러 번 반복을 확인해.

메모리는 시작 한 장면의 스냅샷 외에 프로그램·좌석·세계·중계를 여러 번 바꾼 뒤 같은 상태로 돌아와 비교해. 강제 GC를 한 실행과 안 한 실행을 섞지 않아. 브라우저 heap이 안정돼도 GPU/오디오 네이티브 메모리가 측정된 것은 아니야.

장시간 A/B도 실행 순서를 바꿔 반복하고 시작 조건을 다시 맞춰. 실제로 한 공연장만 30분 봤다면 다른 공연장 장시간 시험까지 통과했다고 적지 않아.

## 11. 실제 iOS Safari·Android Chrome·태블릿 수동 QA

PC에서 두 서버의 HOST를 `0.0.0.0`으로 바꾸고 같은 Wi-Fi 기기에서 `http://<PC의-LAN-IP>:18080/`, `:18081/`에 접속해. PC 방화벽의 해당 로컬 개발 서버 접근을 허용해야 할 수 있어. 이 주소는 loopback이 아니므로 secure context가 필요한 API는 localhost와 지원 조건이 다를 수 있어. Wake Lock 등 HTTPS 조건까지 검증하려면 동일 코드·설정의 신뢰할 수 있는 HTTPS 개발 주소에서 별도 결과를 남겨. 모든 문제를 GPU 회귀로 분류하지 않아.

모델명·OS 정확한 버전·브라우저 버전·화면 주사율/배율·방향·배터리/저전력·열 상태·오디오 출력을 기록해. iOS의 Playwright WebKit이나 데스크톱 Safari 결과를 실제 iPhone Safari 결과로 대신하지 않아. Android UA만 바꾼 PC 결과도 실물 Android와 다르게 기록해.

아래 표는 **작성 시점에는 수동 실행 항목**이야. 실제 확인한 항목에만 날짜와 결과를 채워.

| 시험 | 양쪽 공연장에서 확인할 내용 | 결과/증거 |
| --- | --- | --- |
| 광장·발권 | 새 방문, 기존 동물 identity, 매표소 선택, 공연장·솔로/방 선택, 발권, 입구 도달, 표 검사, 광장 복귀 | 미실행 |
| 이동·시선 | 엄지스틱 이동 중 반대 손 회전, 캔버스 드래그, 손가락 떼기, 화면 밖으로 나갔다 돌아온 touch, 세로/가로 회전 | 미실행 |
| 좌석 | 접근·앉기·일어나기, 층별 이동, 로비로 나갔다 재입장, 사람과 좌석의 가시성 | 미실행 |
| 재생 | 실제 시작, pause, 앞/뒤 seek, resume, 다음 곡, 화면 터치에 따른 정상 오디오 활성화 | 미실행 |
| 동기화·음상 | 활·손가락·지휘·박수, 고정/이동 청취, 앞뒤·좌우 방향, 자리 이동 시 음상·잔향 | 미실행 |
| 돔 | 일반 셰이더·각 세계·크로스페이드·reveal, 경계·빈 면·깜박임·멀미를 유발하는 끊김 | 미실행 |
| 중계·효과 | 중계 첫 표시, 시야 밖→복귀, 켜기/끄기, 폭죽·레이저·블룸, 같은 preset의 선명도 | 미실행 |
| 방 | 실제 두 기기에서 비공개 방 생성·초대·입장, 채팅, 방장/참여자 권한, 공연·seek 동기화, 공연장 선택과 초대 redirect, 퇴장·재입장 | 미실행 |
| 인터미션·수면 | 차/소식/독주회·2부·예약 취소, 실제 수면·깨우기, 빠른 재터치, 반복 깨운 뒤 루프 중복 여부 | 미실행 |
| 앱 전환 | 전화/오디오 interruption, 잠금·복귀, 다른 앱 전환, 이어폰 연결/해제, orientation, 네트워크 잠깐 끊기 | 미실행 |
| 지속 사용 | 30분 실제 음악+렌더, 5/15/30분 상태, 배터리·열·메모리·context loss·오디오 문제 | 미실행 |

Android의 원격 디버깅이나 iOS Safari Web Inspector를 연결했다면 연결 여부와 계측 옵션을 적어. 원격 검사·화면 녹화가 있는 실행과 없는 실행은 구분해. 모바일 Safari·Android Chrome·데스크톱 Chrome·Edge는 각각 환경별 A/B로 비교해.

## 12. 결과를 넘길 때 남길 것

원시 결과를 보존하고 다음 표를 채워. 빈칸을 추정 수치로 채우지 말고 미측정/미실행/지원 안 됨을 적어. 수치가 악화된 행도 그대로 남겨.

| 같은 품질 A/B | 평균 rAF FPS | 1% Low | p50/p95/p99 ms | 평균 sync ms | Draw calls / triangles | JS heap / 리소스 개수 | 결과 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hall high, 장면·실행 번호 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미실행 |
| Hall medium/low, 각 장면 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미실행 |
| Sphere high, 장면·세계·전환 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미실행 |
| Sphere medium/low, 각 장면 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미실행 |

auto는 별도 표에 FPS와 실제 프리셋·scale·선명도·회복 여부를 함께 적고, 로딩은 cold/warm·준비시간·전송량을 별도 표에 적어. sync만 실행했다면 FPS 칸은 미측정이야. GPU ms·GPU bytes·온도·와트·실제 오디오 underrun도 직접 수집하지 않았으면 미측정으로 남겨.

공유할 묶음에는 다음을 넣어.

- A/B 전체 SHA, dirty 상태와 필요한 패치, 실제 제공 소스 해시, collector/fixture/helper/plan 해시.
- 실행 명령·환경변수와 도구 버전, OS·CPU·GPU·RAM·브라우저·드라이버·전원/화면·온도 조건.
- `run-plan`의 계획 원본, logs의 시작/종료/exit code, 성공·실패·중단 raw JSON, 원본 PNG.
- 비교 JSON·이미지 지표·육안 확인 메모, 실제 공연 rAF JSON, DevTools trace, 수동 QA·장시간 기록.
- 각 결과가 통제된 시각 fixture인지, 실제 오디오 재생인지, 모바일 에뮬레이션인지, 물리 기기인지 명시한 범위표.

전체 원본 증거 ZIP을 받았다면 제공 manifest의 경로·파일 수·크기·SHA-256을 확인해. Git에는 대표 이미지와 일부 자료만 있을 수 있어. 파일 하나가 열리거나 작은 ZIP이 존재한다는 이유로 원본 PNG·실패 로그까지 완전히 들어 있다고 판단하지 않아. 재집계 결과와 브라우저를 새로 실행한 결과도 구분해서 보관해.

최종 판단은 이 PC의 같은 조건에서 개선된 항목, 악화됐거나 판단을 보류한 항목, 화질 변화, 오디오·기능 문제, 아직 실행하지 못한 기기를 함께 적으면 돼. 물리 GPU의 수치와 기존 SwiftShader의 시간을 섞어 개선율을 만들지 않아.
