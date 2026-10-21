# 로딩·오디오·같이 보기 검증

이 문서는 `tools/bench`의 런타임 검증 방법이야. 그래픽 비교 방법은 [bench-method.md](bench-method.md)에 따로 정리했어. **로딩 대기시간, 주 스레드의 긴 작업, 음표 예약, 실제 조작을 각각 다른 근거로 확인해.** 소프트웨어 렌더러의 시간이나 휴대폰 화면 에뮬레이션을 실기기 성능으로 해석하면 안 돼.

검증 도구는 앱에 import되지 않아. 앱 서버와 Node 단위 검사에 새로운 npm 의존성을 추가하지 않았어. 브라우저 도구를 쓸 때만 Playwright와 브라우저를 개발 환경에 따로 준비하면 돼.

**이 문서의 a41 측정 묶음은 main `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`을 기준으로 해.** 이전 수집은 `ec5ef65fab027353b51f751ffb59aa65b863af0a`와 연결된 결과야. 원시 자료의 당시 기준선·실행 시각을 바꾸지 않고, [a41 소스 연결 근거](performance-data/runtime/baseline-a41-proof.json)를 따로 추가했어. 이후 main `3f1655b0c035a630adbcfbf19582dd9363386f34`에 저녁 공연·로비·인터미션 동작이 추가됐으므로 그 통합 결과와 a41 관측을 분리해. 여기의 기존 통과나 수치를 새 코드에 그대로 소급 적용하지 않아.

## 저장한 검증 결과

[자료 목록과 provenance](performance-data/runtime/manifest.json)에 실제 실행 결과, 당시 기준 커밋, 원시 파일 SHA-256, 검토 시점의 코드 fingerprint를 모았어. 이전 수집본과 새 a41 통합 후 실행을 별도 파일로 보존했어. 결과 정리와 소스 연결 확인 중에는 새 브라우저나 CPU 시간 벤치를 실행하지 않았어. 긴 synthetic 채팅·room/member 로그와 피크 메모리로 오해할 수 있는 process snapshot은 제외했어.

| 검사 | 실제 결과 | 근거 |
| --- | --- | --- |
| **DPR 수정 후 연결한 Node 회귀 범위** | **서로 다른 60개 통과 범위**: 이전 실행의 변경 없는 52개 + quality 재실행 8개. 전체 60개를 한 번에 새로 실행한 결과는 아니야 | [교체 기준·시각·소스 hash](performance-data/runtime/a41-quality-dpr-regression/combined-scope.json), [8개 실제 TAP](performance-data/runtime/a41-quality-dpr-regression/quality.tap.log) |
| **a41 통합 후 Node 회귀 재실행** | **9개 파일, 59개 통과, 실패 0**. 개별 case TAP와 파일별 명령·시각·테스트 소스 hash 보존 | [새 실행 결과와 TAP 파일명](performance-data/runtime/a41-node-tests/results.json) |
| Node 회귀의 이전 원본 | **9개 파일, 59개 통과, 실패 0** | [파일별 결과](performance-data/runtime/unit-tests.json) |
| 배열·알고리즘·기준선 연결 | **23,517→0** 대상 배열, 600프레임과 9개 불연속 상태 일치, 기존 메서드 21개 동일 | [상태·소스 비교](performance-data/runtime/runtime-comparison.json) |
| 실제 browser Worker와 CSP fallback | 정상 4응답과 차단 0응답, 모두 Worker 종료, **두 경로의 4종 PCM이 원본과 같음** | [PCM 해시와 실제 Worker 기록](performance-data/runtime/browser-worker.json) |
| 별도 localhost 서버 | **15개 시나리오 통과**, 서버 오류 없음 | [portable 프로토콜 검사](performance-data/runtime/multiplayer.json) |
| a41 후보의 실제 두 탭 방 UI | **Hall cross·Sphere core 2건 통과**. 비공개 방·권한·재생 상태 전파·채팅·방장 넘기기 확인 | [완료한 방 UI 검사의 범위와 원본 식별](#완료한-a41-두-탭-방-ui-검사) |
| a41 고정 관객 로딩 | **8개 실행 완료, 전후 4쌍 각각 109개 조건 통과**. 각 실행은 cold/warm 한 번씩이고 시간 개선을 일률적으로 보장하지 않아 | [관측 표와 메모리 한계](performance-report.md#5-로딩과-메모리), [파일 비교 요약](performance-data/latest-a41/qa-a41/runtime-results/loading-fixed-summary.json) |
| a41 실제 65초 착석 오디오 | **6개 실행 통과**, 파일 전용 검증 153개 조건 통과 | [실제 재생 범위와 원시 기록](#완료한-a41-65초-오디오-검사) |
| 원본 박수 합성 | 44,100Hz·2채널·14,288,400 bytes. Node 동기 합성 294.013ms는 단일 관측 | [원본 PCM·합성 관측](performance-data/runtime/applause-node-baseline.json) |
| 자동 품질 정책 | 같은 인위적 입력의 전이 기록, scale 0.6 하한과 desktop high/mobile medium 복구 상한 확인 | [정책 재생 기록](performance-data/runtime/policy-trace.json) |
| ec5 → a41의 소스 동일성 | 기준 파일 **10개 전부 바이트 동일**, a41 측정 오디오 구현 5개·기존 프로토콜의 검사 소스 6개도 보존한 hash와 일치 | [별도 소스 연결 JSON](performance-data/runtime/baseline-a41-proof.json) |

위 **정책 재생 기록은 함수에 같은 인위적 frame 간격을 넣은 검사**야. 이전 ec5의 auto 브라우저 탐색과는 다르게 봐야 해. 그 브라우저 fixture는 자동 모드에도 1/60초 dt 상한을 설정해 baseline의 원래 dt 기반 하강을 막을 수 있었으므로, 해당 auto 실행을 자동 품질 개선 근거에서 제외했어. 정책 입력 trace 자체의 결과를 바꾸지는 않았어.

수정한 full-frame 도구의 auto는 정상 앱처럼 애니메이션 dt를 최대 **0.05초**로 제한하고 실제 경과시간을 각 버전의 frame에 전달해. 수동 프리셋만 1/60초 dt 조건을 유지해. **음악 시각은 auto에서도 step당 1/60초인 fixture**라 실제 오디오 예약을 검증하지는 않아. 이 문서의 65초 오디오 도구는 별도로 실제 AudioContext와 원래 scheduler를 사용해. 세 범위의 결과를 서로 대신 쓰지 마. [정확한 시계 조건](bench-method.md#시간-필드를-정확히-읽어)과 [제외 기록](validation-log.md)에 연결해 뒀어.

a41 통합 후 **2026-10-21 04:59:22~04:59:24 UTC, Node 24.19.0**에서 9개 테스트 파일을 각각 다시 실행했어. `--test-reporter=tap`의 개별 case 합계는 **59 pass / 0 fail**이고 모든 프로세스가 exit 0이야. [a41-node-tests/results.json](performance-data/runtime/a41-node-tests/results.json)과 같은 폴더의 TAP 로그 9개는 원시 출력의 바이트를 그대로 복사했어. 로그의 tests/pass/fail 수와 실행 JSON, 보존 시점의 테스트 소스 9개 SHA-256이 모두 일치하는지도 확인했어. 기존 `unit-tests.json`과 앞서 확인한 파일 단위 `reportedIntegrationSmoke` 기록은 원래 시점 그대로 유지했어.

그 뒤 비정수 DPR에서 품질을 내릴 때 반올림 때문에 해상도가 미세하게 오르는 경우를 수정했어. **05:21:32 UTC**에 quality 파일의 8개 case가 실제로 다시 통과했고 exit 0이야. [후속 실행 JSON](performance-data/runtime/a41-quality-dpr-regression/result.json)과 TAP를 별도 폴더에 바이트 그대로 보존했어. 기존 59개 중 quality의 옛 7개를 새 8개로 교체하면 **52 + 8 = 60개**야. 나머지 테스트 8개 파일의 hash가 이전 실행과 같고, 04:38 소스 snapshot의 candidate 36개 중 제품 변경은 `quality.js` 하나라는 것도 연결 자료에 기록했어. 기존 proof의 당시 hash를 새 값으로 덮어쓰지 않았어. 이 합산 범위를 한 번에 실행한 60개 결과라고 부르거나 실제 브라우저 오디오 출력·긴 재생 검사를 대신하면 안 돼.

**두 탭 방 UI는 a41 후보의 Hall cross·Sphere core 완료 결과를 확인했어.** 최초 cold/warm 로딩 4건은 관객 상태가 통제되지 않아 전후 시간의 인과 비교에서 제외했어. 후속 고정 관객 로딩은 **07:07~07:10 UTC에 8개 실행이 완료**됐고, 전후 4쌍의 관객 수·점유 좌석 hash·샘플·PCM·화면·폰트·브라우저·도구 조건이 같았어. 시간과 긴 작업의 악화도 [관측 표](performance-report.md#5-로딩과-메모리)에 그대로 남겼어. 실제 65초 착석 오디오는 기준 2조건·후보 4조건의 6개 실행이 완료됐어. 약 5Hz 시각 상태 갱신과 실제 오디오 예약의 범위이며, 반복 GPU 렌더 부하나 별도의 Hall seek/resume 실패까지 해결한 결과는 아니야. 각 검사의 조건을 아래에 따로 남겼어.

[통합 검토 근거](performance-data/runtime/integration-review.md)에는 main/quality/Worker 연결과 전체 프레임 fixture의 적용 범위를 적었어. 정적 검토에서 작업을 막을 결함은 찾지 못했지만, 미실행 브라우저 조건까지 검증했다고 주장하지 않아.

## 준비

[브라우저 설치와 공통 환경변수](bench-method.md#2-브라우저-도구는-개발-환경에-따로-설치해)를 먼저 설정해. Windows와 실제 GPU를 포함한 전체 준비는 [PC 재현 안내](reproduce-on-pc.md)에 있어. 서버는 Node 18 이상이지만 전체 검증 도구에는 Node 22 이상을 써. 기존 수집은 Node 24.19.0·Playwright 1.64.1·Chromium 153.0.8010.0이었어. 실행 예시는 저장소 루트 기준이야.

```bash
npm install --prefix ../forest-bench-runtime --save-exact playwright@1.64.1
node ../forest-bench-runtime/node_modules/playwright/cli.js install chromium
export PLAYWRIGHT_MODULE="$PWD/../forest-bench-runtime/node_modules/playwright"
export OUTPUT_DIR="$PWD/bench-results"
```

`CHROME_EXECUTABLE`로 이미 설치한 브라우저를 지정할 수도 있어. 컨테이너가 추가 인자를 요구하면 `CHROME_ARGS`에 JSON 문자열 배열을 전달해. `SOFTWARE_RENDERER=1`은 SwiftShader를 요청하는 옵션이야. 실제 renderer 문자열도 확인해야 해. `HEADLESS=0`이면 브라우저 창을 띄워.

브라우저 비교는 같은 바이너리·화면 크기·DPR·폰트 조건으로 **한 번에 하나씩** 실행해. 그래픽 벤치, 다른 브라우저 검사, CPU 부하 시험을 동시에 돌리면 로딩·긴 작업·오디오 예약 지연에 그 부하가 섞여.

아래 **8082는 PC에서 a41 기준 checkout을 띄우는 예시 포트**, 8080은 변경 코드야. 실제 작업 컨테이너에서는 ec5 서버 8082를 보존하고 **a41을 8083**에서 제공했어. 따라서 저장된 a41 결과의 주소가 8083인 것과 예시가 8082인 것은 구분해야 해. 포트 이름만 보지 말고 해당 checkout의 정확한 SHA와 실제 응답 파일을 확인해.

`REVISION`은 실행한 사람이 넣는 기록값이라 서버의 소스를 자동 인증하지 않아. 커밋되지 않은 변경이라면 그 상태도 함께 적어. `baseline_ref`는 `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`, `candidate_ref`는 실제 fetch해서 시험하는 PR SHA로 설정해.

```bash
# 별도 터미널 1: 고정한 기준 main
PORT=8082 HOST=127.0.0.1 QUIET=1 node ../forest-reference/server.js
```

```bash
# 별도 터미널 2: 변경 코드
PORT=8080 HOST=127.0.0.1 QUIET=1 node server.js
```

런타임 브라우저 도구는 `http://127.0.0.1:포트/` 또는 `http://localhost:포트/`만 받아. 방 검사에서는 새 테스트 방만 만들고 나갈 때 정리해. `multiplayer.mjs`는 기존 서버 대신 별도의 localhost 서버 프로세스를 직접 띄워.

## 1. 실제 cold/warm 로딩

```bash
BASE_URL=http://127.0.0.1:8082 REVISION="$baseline_ref" \
node tools/bench/loading.mjs baseline-fixed hall desktop

BASE_URL=http://127.0.0.1:8080 REVISION="$candidate_ref" \
node tools/bench/loading.mjs after-fixed hall desktop

node tools/bench/compare-loading.mjs \
  "$OUTPUT_DIR/loading-baseline-fixed-hall-desktop.json" \
  "$OUTPUT_DIR/loading-after-fixed-hall-desktop.json" \
  "$OUTPUT_DIR/loading-comparison-hall-desktop.json"
```

인자는 `라벨 공연장 기기` 순서야. 공연장은 `hall` 또는 `sphere`, 기기는 `desktop` 또는 `mobile`을 써. desktop은 기본 960×540, DPR 1, high이고 mobile은 390×844, DPR 2, low와 touch/모바일 UA를 적용해. `WIDTH`, `HEIGHT`, `DPR`로 바꾸면 전후에 같은 값을 적용해. 두 공연장과 두 기기의 네 조건을 각각 비교하면 돼.

한 실행은 새로운 브라우저 하나와 명시적 BrowserContext 하나를 만들어. 첫 navigation이 cold야. 준비가 끝난 뒤 같은 context에서 `about:blank`를 거쳐 동일 주소로 다시 들어간 결과가 warm이야. 중간에 캐시를 지우지 않고, warm에서 실제 MP3 캐시 적중이 관측되지 않으면 검증을 실패시켜.

**이 도구에는 Playwright 요청 라우트를 넣으면 안 돼.** 요청 가로채기를 켜면 Chromium의 HTTP 캐시가 비활성화돼 warm이라는 이름으로 다시 다운로드하는 결과를 만들 수 있어. `loading-proxy.mjs`는 임시 localhost 프록시로 폰트 링크와 아래의 관객 전용 main fixture를 다뤄. 그 외 JS·MP3·vendor·악보 응답의 gzip·ETag·cache header는 그대로 전달해. `launchBrowser`만 사용하고 공통 `configureFonts`의 요청 라우트는 호출하지 않아.

관객은 계속 켜 두고 **관객 생성에만 seed 417을 적용해.** 프록시가 `/js/main.js`의 `const rand = room ? seeded(room.seed) : Math.random;` 한 줄을 정확히 한 번 찾아 마지막 값을 `seeded(417)`로 바꿔. 찾지 못하거나 두 번 이상 있으면 실패해. 전역 `Math.random`, Three UUID, 실제 방의 seed는 바꾸지 않아. `loading.mjs`만 이 옵션을 켜므로 같은 프록시를 사용하는 오디오 안정성 도구에는 이 치환이 없어.

바뀐 main은 upstream에서 **identity**로 받고 identity로 제공하며, 변환한 바이트에서 만든 별도 **QA ETag와 `no-cache` 재검증**을 사용해. 원본과 변환본의 SHA-256·identity bytes를 각각 남겨. `controlledMainFixture` 분류의 전송량은 **QA main 응답의 크기**야. 원래 gzip main의 전송량으로 인용하면 안 돼. warm에서 브라우저에 304를 돌려줘도 프록시는 원문 확인을 위해 upstream identity 200을 받을 수 있어. 브라우저 캐시 기록과 `proxyTransactions`의 upstream bytes는 각각 읽어.

각 navigation이 끝나면 실제 관객 수와 `director.occupied`를 숫자 오름차순으로 정렬한 JSON의 SHA-256을 기록해. cold/warm의 수·점유 좌석 hash가 다르면 실행 자체가 실패해. **`compare-loading.mjs`도 `passed=true`인지 확인한 뒤 전후 수치를 읽어.** 비교기는 baseline/candidate의 seed·관객 수·점유 좌석·샘플·PCM·곡·viewport·실제 DPR·품질·폰트·브라우저 조건·도구 hash를 확인하고, 불일치나 누락된 시간·bytes 값은 실패시켜. 브라우저나 네트워크를 다시 실행하지 않는 파일 비교야.

폰트 모드는 다음과 같아.

| 설정 | 로딩 도구의 동작 |
| --- | --- |
| `FONT_MODE=system` | 기본값. HTML의 외부 폰트 링크를 로컬 빈 CSS로 바꿔 시스템 대체 폰트를 써 |
| `FONT_MODE=local` | `FONT_ROOT` 아래 설치한 Gowun Batang 400/700과 IBM Plex Sans KR 400/500/600을 프록시로 제공해 |
| `FONT_MODE=network` | 원본 외부 폰트 요청을 유지해. 외부 네트워크 변동도 결과에 포함돼 |

원래 폰트에 가까운 조건을 원하면 아래처럼 설치해. 각 실행의 `fontCssSha256`과 font mode도 결과에 남아.

```bash
npm install --prefix ../forest-bench-runtime --save-exact playwright@1.64.1 @fontsource/gowun-batang@5.3.0 @fontsource/ibm-plex-sans-kr@5.3.0
export FONT_MODE=local
export FONT_ROOT="$PWD/../forest-bench-runtime/node_modules/@fontsource"
```

### 로딩 수치를 읽는 기준

출력은 `loading-라벨-공연장-기기.json`이야. `runs.cold`와 `runs.warm`에 다음을 남겨.

| 항목 | 의미 |
| --- | --- |
| `readyMs` | navigation 이후 실제 ‘혼자 보기’ 버튼이 활성화될 때까지. MutationObserver로 기록해 |
| `observedReadyWallMs` | Playwright의 navigation 시작부터 준비 완료를 관찰할 때까지. 자동화 통신·polling도 포함돼 |
| `bootLongTasks` | 준비 전 주 스레드 50ms 이상 작업의 개수·합계·최대값·원시 목록 |
| `resources`, `resourceSummary` | Resource Timing의 transferSize·encodedBodySize·decodedBodySize와 원래 자원 목록 |
| `requests`, `summary` | CDP 요청·응답·캐시 적중·304·실수신 encoded response 크기 |
| `proxyTransactions` | 프록시가 실제 upstream에 전달한 요청·응답 상태·body bytes |
| `state` | 실제 renderer·AudioContext·샘플 수·샘플 PCM bytes·박수 PCM bytes·악보·관객 수 |
| `state.audienceFingerprint` | 실제 관객 수·점유 좌석 수·정렬한 점유 좌석 JSON의 SHA-256 |
| `mainFixture` | seed·정확한 치환 수·원본/제공 main의 SHA-256와 identity bytes·QA 캐시 정책 |
| `summary.controlledMainFixture`, `resourceSummary.controlledMainFixture` | 다른 앱 JS와 분리한 QA main 응답의 CDP/Resource Timing 전송량 |

실행 단위 `fixture`에는 수집기·프록시·공통 브라우저 helper의 SHA-256도 있어. 실행 계획과 Playwright 설치 버전은 환경 기록에 함께 보존해. 이 hash는 서버를 미리 요청하지 않고 로컬 도구 파일에서 읽어 cold navigation을 데우지 않아.

main의 장면 rAF는 첫 프레임부터 보관하고 실행하지 않아. 대신 실제 장면 생성, PMREM, AudioContext/잔향 생성, 해당 preset의 전체 샘플 다운로드·decode, 박수 준비, 악보 읽기는 그대로 실행해. 따라서 이 값은 **그래픽 반복 부하를 뺀 통제된 부팅**이야. 정상 앱을 계속 그릴 때의 첫 인터랙티브 화면 시간이나 앱 FPS로 이름을 바꾸면 안 돼.

다음 한계도 함께 남겨.

- cold는 브라우저 HTTP 캐시만 비어 있다는 뜻이야. upstream Node의 압축 캐시나 OS 파일 캐시까지 비운 결과는 아니야.
- `encodedDataLength`는 브라우저가 보고한 수신 응답 크기야. 정확한 요청 업로드 bytes나 네트워크 패킷 크기로 부르지 않아. Worker의 하위 요청은 페이지 CDP 기록에서 빠질 수 있어 별도 프록시 기록도 보관해.
- warm에서도 AudioBuffer decode와 장면 구성은 다시 해. MP3 다운로드가 없어졌다고 준비시간이 0이 되지는 않아.
- 로컬 폰트는 별도 분류야. 외부 Google Fonts의 응답 속도를 측정한 것이 아니야.
- 최초 a41 로딩 4건은 원래 관객 난수로 실행됐고, 실제 desktop의 전후·cold/warm 인원이 달랐어. mobile의 인원 상한이 같아도 점유 좌석은 검증하지 않았어. 그 원본은 보존하되 부팅 시간·longtask 차이를 변경 코드의 인과 개선율에서 제외해. [수집기 원문·수정과 제외 기록](performance-data/provenance/loading-audience-control-correction.json)으로 이전 결과와 후속 도구를 구분해.
- 관객 전용 seed는 UUID 등 다른 전역 난수 소비량과 격리돼 있어. 잔향 IR의 난수 샘플이나 다른 절차적 생성물까지 바이트 단위로 같게 만들지는 않아. 같은 AudioContext sample rate에서 IR 길이·생성 루프는 같다는 범위야. 각 cold/warm은 한 번의 관측이므로 조건을 맞춘 뒤에도 작은 차이를 확정적인 인과 개선율로 일반화하지 않아.
- `usedJSHeapSize`는 거친 snapshot이야. 피크 메모리·AudioBuffer의 native 메모리·GPU 메모리를 모두 합친 수치가 아니야.

## 2. 60초 이상 실제 오디오 예약 유지

```bash
BASE_URL=http://127.0.0.1:8082 REVISION="$baseline_ref" \
node tools/bench/audio-stability.mjs before hall desktop 65

BASE_URL=http://127.0.0.1:8080 REVISION="$candidate_ref" \
node tools/bench/audio-stability.mjs after hall desktop 65
```

인자는 `라벨 공연장 기기 초`야. 기본은 65초, 허용 범위는 61~68초야. 두 공연장의 첫 곡인 `beethoven-ode-to-joy`가 73.94초라 피날레 전까지 같은 곡의 예약을 관찰해. 출력은 `audio-stability-라벨-공연장-기기.json`이야.

실제 ‘혼자 보기’를 누르고, 이용 가능한 실제 좌석 근처에 방문자를 놓은 뒤 기존 Director 갱신과 실제 E키/앉기 버튼으로 앉아. 긴 단원 입장·교체 애니메이션만 stage snap으로 건너뛰고 실제 ‘공연 시작’을 눌러. 오디오 시계가 측정 구간 동안 60초 넘게 진행했는지 확인해.

a41은 곡마다 필요한 단원을 선택해. main rAF를 멈춘 상태에서 기존처럼 전원을 올려 놓으면, 필요 없는 단원의 퇴장이 진행되지 않아 시작을 기다리다 막힐 수 있어. 도구는 실제 `piece.tracks`와 `SECTIONS`에서 현재 곡의 roster를 구해 `stage.snapRoster`로 배치하고, 남은 입장·퇴장 계획이 없는지 확인해. `snapRoster`가 없는 ec5는 원래 `snapOnstage`를 사용해. 선택한 방식과 expected/actual 단원 키를 `checks.placement.stageFixture`에 남겨. 음표·음색·시계·실제 시작 버튼의 동작은 바꾸지 않아.

GPU 반복 부하를 피하려고 main rAF는 보관해 두고, `Performance.updateVisual`만 실제 `Performance.time`으로 5Hz 호출해. 25ms 오디오 Worker tick, 원래 scheduler, lookahead, 재생속도, 음표, 샘플, 공간 음향 그래프는 바꾸지 않아. `playNote`와 `AudioBufferSourceNode.start`는 원래 함수를 그대로 호출하면서 인자만 관찰해.

검증 기준은 다음과 같아.

- `schedIdx`까지 악보의 모든 이벤트가 원래 순서대로 한 번씩 `playNote`에 전달돼야 해. section·instrument·MIDI·duration·gain·layer를 원본 이벤트와 정확히 비교해.
- 각 note 호출이 voice를 만들고 실제 AudioBufferSource 시작 호출도 존재해야 해. 요청한 시작시각이 이미 지난 note가 있으면 실패해.
- AudioContext는 running 상태를 유지하고, 시계가 진행하고, analyser에서 0이 아닌 신호가 관측돼야 해.
- 마지막 실제 일시정지 버튼이 재생을 멈추고 추적 중인 voice를 정리해야 해.

원시 예약 lead, 실제 source start, scheduler tick 간격, 1초 간격 voice·RMS·오디오 시계·output timestamp, longtask, visibility 변경, context state도 저장해. 기록 종료는 1초 간격으로 관찰하므로 전후 마지막 시간이 조금 달라질 수 있어. 서로 다른 종료시각의 note 총수를 직접 개선율로 비교하지 마. 각 실행의 원본 악보와의 정확한 일치와 공통 시간 범위의 상태를 봐.

이 검사는 **시각 상태 갱신이 느려도 오디오 예약을 유지하는지** 확인해. 계속되는 WebGL 렌더 정체, 실제 음향 장치 underrun, 헤드폰 출력 음질까지 검증한 것은 아니야. 원래 scheduler는 주 스레드에서 호출되고 lookahead는 visible 0.4초, hidden 3초야. 주 스레드가 그보다 오래 막히는 경우는 별도 조건으로 측정해야 해. 문서가 실제로 hidden이 되지 않았다면 background 재생도 검증했다고 쓰지 않아.

### 완료한 a41 65초 오디오 검사

a41 기준 Hall desktop·Sphere mobile 2개와 후보의 두 공연장×desktop/mobile 4개, 총 **6개 실행이 통과**했어. 각 실행은 실제 입장·착석·시작 버튼을 사용했고 `beethoven-ode-to-joy`를 65초 넘게 관측했어. [6개 원본과 파일 검증 요약](performance-data/latest-a41/qa-a41/runtime-results/audio-stability-summary.json)에 원시 파일 SHA와 결과를 연결했어. 별도 파일 전용 집계가 raw note/voice/시계 배열을 다시 읽어 **153개 확인 조건을 통과**했으며, 이것은 새 브라우저 실행이나 제품 단위 테스트 153개를 뜻하지 않아. [집계기 원문](performance-data/provenance/aggregate-a41-runtime-audio.mjs)과 [파일 hash·시점 연결 기록](performance-data/provenance/a41-audio-stability-verification.json)도 보존했어.

| 실행 | 실제 오디오 진행 s | 음표 예약 / source start | 최소 예약 여유 ms | 실제 시각 갱신 Hz |
| --- | ---: | ---: | ---: | ---: |
| 기준 Hall desktop | 65.245 | 1,671 / 2,160 | 118.23 | 5.011 |
| 후보 Hall desktop | 65.237 | 1,671 / 2,160 | 117.24 | 5.013 |
| 기준 Sphere mobile | 65.237 | 1,671 / 2,160 | 114.31 | 5.013 |
| 후보 Sphere mobile | 65.216 | 1,671 / 2,160 | 120.04 | 5.014 |
| 후보 Hall mobile | 65.216 | 1,671 / 2,160 | 115.32 | 5.013 |
| 후보 Sphere desktop | 65.237 | 1,671 / 2,160 | 114.85 | 4.998 |

모든 실행에서 관측 종료의 `schedIdx`까지 **1,671개 음표가 원래 악보 순서·section·instrument·MIDI·duration·gain·layer와 정확히 일치**했고, 각 호출은 실제 voice를 만들었어. AudioBufferSource의 실제 `start()`는 각각 2,160회였어. 지속음·레이어 때문에 음표 하나가 여러 source를 쓸 수 있어 두 수를 같아야 한다고 요구하지 않아. Hall desktop과 Sphere mobile의 baseline/candidate 비교에서도 이 수와 샘플 수·PCM bytes가 같았어.

6개 모두 같은 score-prefix SHA-256 `14351705137ec5b799f77cee36acc1178da6c2cfc9890d4a8512be3107c97985`였어. 이 hash는 위의 악보 식별 필드이고 **원래 난수로 변화하는 velocity·정확한 예약 when·출력 파형까지 바이트 동일하다는 뜻은 아니야.** 곡 전체 73.94초의 모든 음표를 끝까지 관측한 결과도 아니야.

요청 시각이 이미 지난 음표는 **0개**, engine의 5ms 보정 범위 안에 들어간 요청도 **0개**였어. 실제 AudioContext는 65.216~65.245초 진행했고, 6개 모두 1초 간격 신호 관측 65/65개에서 0이 아닌 analyser 신호를 확인했어. 실제 일시정지 버튼 뒤에는 `playing=false`, 추적 voice 수 0이었어. 모든 기록은 foreground의 `running`·`visible` 상태였어.

기준선 비교가 있는 조건은 Hall desktop과 Sphere mobile이야. 후보의 Hall mobile·Sphere desktop도 각각 같은 악보의 예약 검사를 통과했지만 이 둘은 이번 묶음에 baseline 실행이 없으므로 전후 비교라고 부르지 않아. 검증된 각 조건의 longtask는 관측 재생 구간에서 0개였고, 오디오 tick 중앙값은 25ms였어. 이 결과는 반복 WebGL을 제외한 실제 스케줄러의 범위야.

**이 오디오 실행의 관객·빈자리 선택은 원래 난수 그대로야.** Hall desktop의 관객/좌석은 기준 1,101명/19번과 후보 827명/60번으로 달랐어. 따라서 이 묶음에서 CPU·heap·부팅·공간 음향 전후 개선율을 계산하지 않아. main rAF를 보관한 상태라 시각 상태를 약 5Hz로 드물게 갱신해도 음표 예약을 유지한다는 점은 확인하지만, 지속적인 WebGL/주 스레드 정체와 같은 조건은 아니야.

음표 sequence hash는 종료 때까지의 악보 prefix이고 시계나 humanization을 고정한 비교가 아니야. 이번 연속 재생과 별도의 **pause/seek/resume 2초 실패는 함께 보존**해. 두 탭 UI의 `playing` 상태 동기화나 최소 oscillator 시계 통과와도 범위를 나눠. [재개 실패 진단](#6-재개-실패와-브라우저-오디오-시계-분리-진단)을 이 검사로 해결됐다고 표시하지 않아.

## 3. 실제 Worker와 CSP fallback의 PCM

```bash
BASE_URL=http://127.0.0.1:8080 REVISION="$candidate_ref" \
node tools/bench/audio-worker.mjs after
```

출력은 `audio-worker-라벨.json`이야. 앱 장면 없이 실제 production 오디오 모듈을 읽고, 실제 module Worker가 반환한 PCM으로 OfflineAudioContext의 AudioBuffer를 만들어. 동일 브라우저의 원본 동기 합성 결과와 채널별 SHA-256을 비교해. 두 페이지를 하나의 명시적 BrowserContext에 유지해 단일 프로세스 Chromium에서도 중간 context 종료가 브라우저를 끝내지 않게 했어.

정상 경로에서는 Worker 생성 1회·응답 4회·오류 0회·종료 완료와 같은 Promise 재사용을 확인해. `worker-src 'none'` 페이지에서는 실제 CSP 차단을 통해 fallback을 확인해. 정상과 fallback 모두 원본 4종과 같은 길이, 44,100Hz, 2채널, PCM 해시여야 해. 총 출력 PCM은 **14,288,400 bytes**야. CSP 오류 console 메시지는 차단 사례에서 의도한 결과이고, 예상하지 못한 page error는 허용하지 않아.

Node에서도 다음 회귀를 확인해.

```bash
node tests/crowd-preparation.test.mjs
node tests/performance.test.mjs
node tests/audio-listener.test.mjs
```

중복 준비, 생성 실패, 실행 오류, message decode 오류, 잘못된 응답, timeout, 동기 `applause()` 호출, init 취소, 늦은 결과, 합성 실패를 검사해. 이전 AudioContext용 결과가 새 초기화를 덮어쓰지 않아야 해.

Worker는 한 profile을 전달하고 AudioBuffer 복사가 끝난 뒤 다음 profile을 요청해. 원본 합성과 음원은 유지하면서 주 스레드의 긴 합성 작업을 옮기는 변경이야. 동기 함수의 CPU 시간과 Worker의 시작·전달·복사까지 포함한 wall time은 같은 지표가 아니야. 총 CPU나 부팅시간, 피크 메모리가 반드시 감소한다고 주장하지 않아. 최종 PCM과 임시 L/R 합성 배열, 전달용 배열, AudioBuffer 복사는 여전히 필요해.

## 4. 멀티플레이 프로토콜과 실제 UI

```bash
# Node 22+의 global WebSocket 사용. 별도 서버를 자동으로 띄우고 정리해.
node tools/bench/multiplayer.mjs after

# 두 실제 탭: 새 비공개 테스트 방, 초대, 권한, 채팅, 방장 넘기기
BASE_URL=http://127.0.0.1:8080 node tools/bench/rooms.mjs after hall cross
BASE_URL=http://127.0.0.1:8080 node tools/bench/rooms.mjs after sphere core
```

프로토콜 도구는 15개 시나리오로 실제 `server.js`, `server/rooms.js`, `server/ws.js`, `RoomClient`를 확인해. 같은 seed, host snapshot/command, guest 위조 거부, late join/full, clock, pose 제한과 좌석 0, chat 정제·echo·빈도 제한, 방장 넘기기·이탈 승계, 자동 재연결, venue 거부, private 방과 방간 격리, 빈방 삭제를 포함해. Worker JS의 MIME·원본 바이트·gzip·ETag 304와 MP3 HEAD/cache/range도 확인해. `REPO_DIR`을 지정하면 다른 로컬 checkout의 실제 서버를 사용할 수 있어. 결과는 `multiplayer-라벨.json`에 남겨.

UI 도구의 `cross`는 공연장 선택 버튼, 다른 공연장의 초대 링크, 올바른 공연장으로 자동 이동한 뒤 입장하는 흐름까지 검사해. `core`는 그 추가 이동 없이 생성·입장·host/guest 컨트롤·시작/일시정지/재개·실제 채팅 form·방장 넘기기를 검사해. `SCREENSHOTS=1`이면 두 페이지의 마지막 화면도 남겨. 결과는 `rooms-라벨-공연장-모드.json`이야.

UI 도구는 기능에 집중하려고 low, 관객·이펙트·중계 off, volume 0을 사용해. main rAF를 보관하고 마지막 화면 확인 때만 수동 호출해. a41에서는 **host만** 현재 곡 roster로 미리 배치해 입장·퇴장 대기를 건너뛰어. guest는 실제 방 재생 동기화가 처리하도록 두고, 재생 뒤 두 탭의 실제 roster가 같은지 추가 확인해. `checks.stageFixture`와 `checks.playbackRosters`가 그 기록이야. 실제 전송한 메시지는 도구가 새로 만든 localhost 테스트 방에만 있어. 이 결과를 시각 품질·FPS·실제 음질의 증거로 사용하지 않아.

### 완료한 a41 두 탭 방 UI 검사

Chromium `153.0.8010.0`에서 a41 통합 후보의 두 검사가 모두 `passed=true`로 끝났고 page/console 오류는 없었어. 각 실행은 같은 BrowserContext의 실제 두 탭으로 새 localhost 비공개 테스트 방만 사용했어.

| 실행 | 완료한 범위 | 원시 파일의 기록 시각 |
| --- | --- | --- |
| Hall `cross` | 공연장 선택 UI, 다른 공연장의 초대 링크에서 올바른 Hall로 자동 이동·초대 보존·입장, 공통 방 검사 | 2026-10-21 06:45:35 UTC |
| Sphere `core` | Sphere 비공개 방 생성·초대 입장과 공통 방 검사 | 2026-10-21 06:46:42 UTC |

공통으로 host/guest의 시작·재생·다음 곡·seek 권한 차이, 시작/일시정지/재개의 상태 전파, 실제 채팅 form 전송과 두 탭 수신, 방장 넘기기 후 권한 교환, 새 방장의 일시정지 전파를 확인했어. 두 실행 모두 현재 곡 `beethoven-ode-to-joy`의 필요한 **31개 단원 키**가 host fixture·host 실제 무대·guest 실제 무대에서 같았어. 마지막 host/guest의 명시 frame도 각각 WebGL 오류 0이었어.

여기서 재개 통과는 **실제 버튼 뒤 두 탭의 `perf.playing`·곡·phase 상태가 동기화된 검사**야. `AudioContext.currentTime`이 2초 안에 진행하는 조건이나 긴 음표 예약·장치 출력은 이 도구가 검사하지 않아. 그래서 별도의 Hall 기능 검사에서 관측한 오디오 시계 실패를 방 UI 통과로 해소했다고 해석하면 안 돼. volume 0·low·관객/효과/중계 off·명시 frame fixture라는 범위도 유지해.

원시 파일은 `rooms-current-hall-cross.json`과 `rooms-current-sphere-core.json`이야. 각각의 SHA-256은 `c60c08e6667ada281cab1eff24f7abe9cd122de398f601f3cfa12ec987ed3fe6`, `5061773bb8190b91d6eff1fadf3a058a97a2ab14555271c88b12441c872926c5`야. 기존 Node의 15개 프로토콜 결과와 이번 실제 UI 결과를 각각 보존해.

## 5. 배열 감소와 음질 보존 근거의 기준선

배열 수의 최초 수집 코드는 PR head `6a640672f2211d7a7687078631d0d6a49a36026d`였어. 이후 당시 기준 main `ec5ef65fab027353b51f751ffb59aa65b863af0a`와 다시 대조했어. `git show REV:path`의 바이트 비교와 SHA-256으로 아래 네 파일이 두 커밋에서 같음을 확인했어.

| 파일 | 동일한 SHA-256 |
| --- | --- |
| `public/js/audio/performance.js` | `a8294cddf767fcf3dd1adfaecddfecced5adeb5019fb89c1bd50a526a55b78a3` |
| `public/js/audio/crowd.js` | `99fffcba861e4d9e2afdb6dd2e7157f4d4f2a6e4300ed6b7eb2f42fe0611530f` |
| `public/js/layout.js` | `7a2a053f55b37a667e39a63c982d47768bad1284afe0b5e70d00c41325945df6` |
| `public/music/bach-nun-seid-ihr.json` | `4b61f61003598348e6e06851935f8cbd26ebdf8ac5eed2c39e6c88b176a29552` |

추가로 Performance의 load/schedule/index/play/pause/seek/stop/activity/dominantSection 9개와 AudioEngine의 sample loading/compaction/nearest/timer/tick/onTick/playNote/sustain/stopAll/tuning/applause/stopApplause 12개 메서드를 import한 prototype 함수 소스로 비교했어. 수집 head, 당시 기준 main, a41 측정 후보에서 이 21개가 같았어. listener 캐시와 박수 준비 API를 포함한 engine 파일 전체가 같다는 의미는 아니야.

Node 24.19.0에서 원본 `bach-nun-seid-ihr` 17트랙·4,342음표, 33개 연주자 상태를 `t = frame / 60`으로 600프레임 갱신했어. 배열 계측과 상태 해시는 시간 계측에서 분리했어.

| `updateVisual` 안에서 생성된 배열 | 전 | 후 |
| --- | ---: | ---: |
| `active.filter` 결과 | 19,800 | 0 |
| velocity `map` 결과 | 3,117 | 0 |
| `Object.values(chairs)` 결과 | 600 | 0 |
| 위 세 API 합계 | **23,517** | **0** |

이 값은 해당 세 API에 한정돼. note-on 반환 배열과 새 음표 객체, seek/reset까지 전부 무할당이라는 뜻은 아니야. 600프레임의 모든 상태와 이벤트 해시는 전후 모두 `f289238a4b106e8ba2541633179faf8b62a6babe9db6134a5016e770b9cfe590`였고, 9개 forward/rewind/repeated-time 조건도 같았어. 별도 회귀는 40FPS·5FPS·시각 갱신 없음에서 오디오 예약 기록이 같음을 확인해.

원본 박수 네 profile의 Node 동기 합성은 한 번의 관측에서 합계 294.013ms였어. 이 값은 브라우저 부팅시간·실기기 속도·이번 PR의 FPS 개선율이 아니야. 원본 합성·악보·레이아웃의 바이트 동일성으로 당시 a41 main에도 같은 작업 정의가 적용됨을 확인했지만, 시간을 a41에서 새로 측정한 값으로 바꿔 쓰지는 않았어.

[runtime-comparison.json](performance-data/runtime/runtime-comparison.json)의 `revisionProof`에는 위 커밋·파일 해시와 21개 메서드별 해시가 있어. 실제 브라우저 시간·긴 작업·요청량은 각 실행 JSON의 원시 관측을 기준으로 봐.

### a41으로 기준선을 옮긴 뒤 확인한 범위

[baseline-a41-proof.json](performance-data/runtime/baseline-a41-proof.json)은 ec5와 a41에서 다음 **10개 파일의 `git show` 결과 바이트가 모두 같음**을 확인한 별도 자료야.

| 파일 묶음 | 개수 | 연결되는 근거 |
| --- | ---: | --- |
| `audio/engine.js`, `audio/performance.js`, `audio/crowd.js` | 3 | 기존 21개 메서드·원본 합성·시각 상태 알고리즘의 기준 구현 |
| `layout.js` | 1 | 의자와 section 배치 정의 |
| `bach-nun-seid-ihr.json`, `beethoven-ode-to-joy.json` | 2 | 배열 비교 fixture와 65초 재생의 원본 악보 |
| `server.js`, `server/rooms.js`, `server/ws.js` | 3 | 실제 검증한 방·WebSocket·정적 제공 경로 |
| `net/room.js` | 1 | 실제 RoomClient 프로토콜 |

a41 측정 candidate의 engine·performance·crowd·loader·worker 5개도 기존 검토 snapshot의 hash와 같았어. 기존 15개 프로토콜 검사에 저장된 server·RoomClient·Worker 모듈 6개 hash도 당시 파일과 일치했어. 따라서 기존 배열/상태/이벤트 비교, 21개 메서드 동일성, 정상 Worker·CSP fallback PCM, 프로토콜 결과를 **같은 구성요소의 이전 검증 근거**로 연결할 수 있어.

이 소스 확인 자체가 새로운 a41 브라우저 실행은 아니야. a41의 main·무대·geometry·곡별 roster 동작은 위의 불변 묶음 밖에 있어. 이후 실제로 수집한 로딩, 두 탭 UI, 65초 오디오, 전체 frame과 이미지는 각각의 새 실행 기록으로 별도 연결했어. 이전 294.013ms 합성 시간은 원래의 단일 Node 관측으로만 남겨. 3f처럼 main이 다시 바뀌면 이 연결 관계와 실제 통합 동작부터 다시 확인해야 해.

## 6. 재개 실패와 브라우저 오디오 시계 분리 진단

기능 검사에서 재생 버튼의 상태와 `perf.playing`이 바뀌어도 실제 AudioContext 시계가 진행하지 않는 사례를 관찰했어. Hall desktop 후보의 재검사에서는 약 **2.047초 동안 Worker tick 82회**, 100ms 관측의 최대 간격 103.5ms였지만 `audioNow=60.181333333333335`와 output timestamp가 모두 고정됐어. 상태는 `running`, 문서는 `visible`이었고 statechange·visibility 사건은 없었어. 기준 a41도 같은 pause/seek/resume 검사를 수행했을 때 **약 2.05초·83 tick 동안 `audioNow=71.46666666666667`이 고정**됐어. 원본 실패와 진단 과정은 [검증 기록](validation-log.md), 실행 도구의 보존 버전은 [provenance](performance-data/provenance/functional-resume-provenance.json)에 연결해 뒀어.

이 관측은 재개 대기 중 JavaScript 전체가 막힌 현상과는 다르게 보여. 반면 **Chromium 출력 경로 문제인지, 기존 앱 그래프와 환경의 상호작용인지는 아직 확정하지 않았어.** 후보만의 새로운 회귀라고 단정할 근거도 없고, 기준선이 71.47초에서 멈췄으므로 정확히 60초에 멈추는 규칙이 확인된 것도 아니야. timeout을 늘리거나 가짜 음악 시각으로 통과시키지 않았어.

최소 oscillator 그래프는 원래 프로세스 설정과 아래 multiprocess 설정 **둘 다 65초 검사에 통과**했어. 각 652개 관측에서 실제 오디오 시각이 65.024초 진행했고, 0이 아닌 신호와 timer를 확인했으며 1초 이상 plateau는 없었어. 반면 실제 Hall 후보는 multiprocess에서도 같은 2초 재개 조건에 실패했고 `audioNow=61.632`가 약 2.058초·82 tick 동안 고정됐어. 따라서 `--single-process` 하나가 원인이라거나 최소 그래프 통과로 제품 재생까지 검증했다고 설명할 수 없어. 각 진단을 [검증 과정 기록](validation-log.md)의 별도 실행으로 다뤄.

### 같은 실제 조작을 재개까지만 대조하기

```bash
SCOPE=transport LABEL=baseline-transport BASE_URL=http://127.0.0.1:8082 \
node tools/bench/functional.mjs hall desktop

SCOPE=transport LABEL=candidate-transport BASE_URL=http://127.0.0.1:8080 \
node tools/bench/functional.mjs hall desktop
```

`SCOPE=transport`는 같은 입장·이동·좌석·공연 시작·일시정지·seek·재개까지 수행해. 이후 프로그램·품질·중계 토글은 `unchecked`에 기록하고 건너뛰어. `scope=transport`의 PASS를 전체 기능 검사 PASS로 쓰면 안 돼. 기본 `SCOPE=full`은 기존 전체 검사야. 기준선에 없는 진단용 stats는 `null`로 기록하고, listener target cache가 없으면 원래 `setListener`를 그대로 호출한 입력 target을 관측해. 실제 AudioParam의 보간 중 값을 즉시 target으로 오해하지 않아.

재개는 실제 버튼 클릭 후 **2초 안에** `AudioContext.state === 'running'`, `perf.playing === true`, `perf.time > seek + 0.05`가 되는지 검사해. 120ms 예약 여유와 output/base latency를 빼는 원래 앱 계산을 유지해. `checks.resumeTrace`에는 클릭 전·후, 100ms 간격, 최종 상태를 남기고 실패 때는 `failureState`도 보존해.

재개 실패 때문에 설정·관객·중계 검사까지 미실행으로 남는 경우에는 다음 별도 진단을 쓸 수 있어.

```bash
CONTINUE_ON_TRANSPORT_FAIL=1 SCOPE=full LABEL=hall-controls-after-resume-failure \
BASE_URL=http://127.0.0.1:8080 node tools/bench/functional.mjs hall desktop
```

이 옵션은 재개 버튼과 상태 확인이 끝난 뒤 **기존 2초 시각 진행 조건만** 실패했을 때 계속해. 실패와 trace·당시 상태를 보존하고 실제 UI로 일시정지한 것을 확인한 뒤 후속 검사를 수행해. `checks.playback.resumed=false`, `failures`, `transportContinuation`으로 구분하며, 이후 검사까지 통과해도 **전체 status는 FAIL, 프로세스 exit code는 1**이야. 나중에 다른 실패가 나면 `terminalFailure`도 추가해. 기본값은 원래처럼 첫 실패에서 멈추고, 이 옵션은 `SCOPE=full`에서만 허용해. PC 기록에서도 재생 실패와 후속 조작의 개별 통과를 한 개의 전체 PASS로 합치면 안 돼.

### Native fake output에서 후속 조작을 계속한 결과

Hall desktop 후보에 기존 single-process 인자를 유지하고 `--disable-audio-output`을 추가한 별도 진단을 실행했어. Chromium의 native fake output을 요청하는 조건이고, 제품의 PCM·DSP·scheduler나 JavaScript 시계를 교체하지 않았어. `SCOPE=full`, `CONTINUE_ON_TRANSPORT_FAIL=1`로 검사했으며 **전체 결과는 FAIL**이야. 물리 출력 장치나 청취 음질을 검증한 조건은 아니야.

재개 구간의 **23개 관측·약 2.0515초·Worker tick 82회** 동안 `audioNow=59.690666666666665`와 output timestamp가 고정됐어. 모든 관측은 `running`·`visible`이었고 statechange·visibility 사건은 없었어. 기존 2초 조건은 실패한 채 남았고, 실제 일시정지 버튼을 누른 직후에도 같은 오디오 시각을 관측했어.

그 뒤의 UI 검사는 완료됐어. medium → low → high 요청과 실제 preset·scale·pixel ratio·shadow 상태가 맞았고, 관객 끄기/켜기, 중계 끄기/켜기, 다시 켠 첫 명시 frame의 broadcast 렌더를 확인했어. auto 선택은 초기 high로 돌아가는 **설정/reset 경로**만 확인했어. 자동 성능 적응을 검증한 결과가 아니야. 모든 명시 frame의 WebGL 오류와 context loss는 없었고 page/console 오류도 없었어. `subsequentChecksCompleted=true`이지만 `checks.playback.resumed=false`와 원래 실패 1개를 보존했어.

이후 상태 snapshot에서는 실제 AudioContext 시각이 다시 진행했어. 아래의 왼쪽 시각은 같은 페이지의 **`performance.now()`**이고, 오른쪽은 native `AudioContext.currentTime`이야. FPS나 프레임 렌더 시간으로 읽으면 안 돼.

| 관측 지점 | 페이지 경과시각 (ms) | 오디오 시각 (s) | 곡 재생 상태 | 추적 voice 수 |
| --- | ---: | ---: | --- | ---: |
| 공연 시작 frame 완료 | 74,331.6 | 59.690667 | 재생 중 | 72 |
| 재개 실패 trace 종료 | 76,596.7 | 59.690667 | 재생 중 | 3 |
| 실제 일시정지 클릭 뒤 | 76,634.2 | 59.690667 | 일시정지 | 0 |
| medium frame 완료 | 79,389.1 | 61.781333 | 일시정지 | 0 |
| low frame 완료 | 83,170.1 | 65.557333 | 일시정지 | 0 |
| high frame 완료 | 84,958.0 | 67.349333 | 일시정지 | 0 |
| 관객·중계 끈 frame 완료 | 86,230.0 | 68.608000 | 일시정지 | 0 |
| 관객·중계 다시 켠 frame 완료 | 90,049.6 | 72.426667 | 일시정지 | 0 |
| auto 설정 frame 완료 | 91,916.5 | 74.304000 | 일시정지 | 0 |

**시계가 다시 움직인 뒤에도 곡은 일시정지 상태였어.** 이후 `perf.time`은 모두 `21.794665065565823`에 머물렀어. 추적 voice 수 0은 앱의 Set이 비었다는 뜻이며 native source의 fade나 잔향까지 즉시 사라졌다고 판정한 값은 아니야. 이 결과로 AudioContext의 영구 정지를 주장할 수 없지만, 음악 재개 성공이나 음표 예약 정상화로 바꿔 말할 수도 없어.

정적 코드 검토에서도 [quality 설정 처리](../public/js/main.js)의 `onSetting('quality') → applyQuality()`에는 `AudioContext.resume()`이나 오디오 재초기화가 없어. 이 실행의 listener target은 공연 시작부터 auto frame까지 같았고, [listener 캐시](../public/js/audio/engine.js)는 동일 target이면 갱신을 생략해. 하지만 100ms trace는 재개 검사 종료 때 끝났고 이후 값은 각 명시 frame을 완료한 뒤 읽은 snapshot이야. 일시정지·설정 패널 조작·quality 변경·다음 main frame·시간 경과가 그 사이에 함께 있었으므로 **어떤 동작이 시계 진행의 계기였는지 분리할 수 없어.** `--disable-audio-output`이 실패를 해결했다는 근거도 없어. main rAF를 보관하고 필요할 때만 호출하는 기능 fixture의 관찰이므로, 일반 PC에서 정상 rAF를 계속 실행하는 앱의 재생 동작까지 같은 현상이라고 일반화하지 않아.

원시 실행 파일명은 `candidate-fake-output-hall-desktop.json`이고 SHA-256은 `9cd7629e1d4ae0e5b6daf4cbc9597070e48b910d9089d17714e083a49f31d950`이야. 실행 fixture의 SHA-256은 `9ef80276ad8fe0cf01fece041376420fb6375c2c0c663bf02583f32734864cff`로 [continuation 진단 소스 기록](performance-data/provenance/functional-resume-provenance.json)의 값과 같아. 이전 기본 출력·multiprocess 실패와 이번 후속 조작 결과를 서로 덮어쓰지 않고 별도 실행으로 유지해.

### 제품 코드가 없는 65초 진단

[audio-clock.mjs](../tools/bench/audio-clock.mjs)는 앱 서버나 모듈, 악보, WebGL을 사용하지 않아. 실제 버튼 클릭으로 48,000Hz·`latencyHint: 'playback'` AudioContext와 **220Hz, gain 0.001** oscillator를 시작해. 실제 65초 동안 시계·출력 timestamp·RMS를 100ms 간격으로 읽고, 주 스레드와 Worker의 실제 25ms timer도 따로 관측해. `Date.now`, `performance.now`, `currentTime`을 교체하거나 수동으로 진행하지 않아.

기존 Playwright·브라우저 환경변수를 그대로 둔 뒤, 한 번에 하나씩 실행해.

```bash
node tools/bench/audio-clock.mjs clock-current current 65
node tools/bench/audio-clock.mjs clock-multiprocess multiprocess 65

# 기본 출력 경로와 Chromium의 native fake-output 경로를 별도로 비교해.
AUDIO_OUTPUT=fake node tools/bench/audio-clock.mjs clock-fake-output current 65

# Playwright의 headless 기본 mute만 제외한 별도 진단이야.
AUDIO_MUTE=unmuted node tools/bench/audio-clock.mjs clock-unmuted current 65
```

PowerShell에서는 앞의 환경변수 접두어 대신 `$env:AUDIO_OUTPUT = 'fake'`를 설정하고 명령을 실행한 뒤 `Remove-Item Env:AUDIO_OUTPUT`으로 원래 조건을 복구해. mute도 같은 방식이야. 각 실행은 다른 label을 써서 실패·성공 결과를 모두 보존해.

| 선택 | 바꾸는 조건 |
| --- | --- |
| `current` | 제공한 Chromium 인자와 Playwright 기본값을 유지해 |
| `multiprocess` | `--single-process`, `--in-process-gpu`, disable-features의 `AudioServiceOutOfProcess`만 제거해. 나머지 특수 인자는 유지되므로 일반 PC 전체 설정과 동일하다는 뜻은 아니야 |
| `AUDIO_OUTPUT=fake` | `--disable-audio-output`으로 Chromium 자체의 fake output stream을 요청해. JavaScript 시계 대체는 아니지만 기본 출력 경로와 별도 결과야 |
| `AUDIO_MUTE=unmuted` | Playwright 기본 `--mute-audio`와 같은 사용자 인자를 제외해 |
| `AUDIO_SIGNAL=continuous` | 기본값. 작은 tone을 계속 처리해 |
| `AUDIO_SIGNAL=delayed` | 실제 AudioContext 시각으로 55초 뒤 tone이 시작되도록 예약해 |
| `AUDIO_SIGNAL=silent` | oscillator를 유지하되 gain을 0으로 둬 무음 경로를 관찰해 |
| `SAMPLE_RATE=24000` | 같은 최소 그래프를 앱의 기존 mobile sample rate로 생성해. 전체 mobile 앱과 동일한 그래프라는 뜻은 아니야 |

출력은 `audio-clock-라벨-모드.json`이야. `summary`에 실제 wall/audio 진행량, timer 수, 최대 관측 간격, 오디오 시각이 같았던 가장 긴 구간을 기록해. 판정은 요청 시간보다 1초 이상 모자라지 않은 시계 진행, 1초 이상 plateau 없음, 단조로운 running 시계, 두 timer와 예상 tone 관측을 요구해. 이 PASS는 **최소 그래프의 시계 검사**일 뿐 제품의 전체 음표 예약·실제 스피커 출력·음질 통과가 아니야. 실행 결과가 생기기 전에는 옵션 변경이 문제를 고쳤다고 쓰지 않아.

### 실행 인자와 Chromium 소스를 읽을 때

기존 benchmark JSON의 `environment.chromeArgs`는 공통 helper에 **추가로 전달한 인자**야. Playwright가 스스로 추가한 전체 인자가 아니야. 사용한 Playwright 1.64.1 설치본에서는 headless launch가 `--mute-audio`도 추가하는 것을 확인했어. 최소 진단의 `environment.actualCommandLine`은 CDP `Browser.getBrowserCommandLine`으로 실제 인자를 따로 읽고, 시작·종료의 process type도 기록해. 다른 실행의 인자 목록을 같은 것으로 추정하지 말고 바이너리·Playwright 버전·모드를 함께 확인해.

확인한 Chromium 주 소스에서 [RendererWebAudioDeviceImpl](https://chromium.googlesource.com/chromium/src/+/HEAD/content/renderer/media/renderer_webaudiodevice_impl.cc)은 30초 무음 전환을 설정해. [SilentSinkSuspender](https://chromium.googlesource.com/chromium/src/media/+/refs/heads/main/base/silent_sink_suspender.cc)는 그 뒤 fake worker로 렌더 호출을 계속하며, [FakeAudioWorker](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/base/fake_audio_worker.cc)도 실제 경과시간으로 다음 호출을 예약해. 따라서 이 소스만으로 무음 이후 `currentTime` 정지가 정상 동작이라고 설명할 수는 없어. [AudioManagerBase](https://chromium.googlesource.com/chromium/src/media/+/refs/heads/main/audio/audio_manager_base.cc)의 `--disable-audio-output` 처리는 native `AUDIO_FAKE` 출력으로 바꾸는 진단 근거야. 이 링크들은 조사 당시 main 소스이고, 실행한 Chromium 153 바이너리의 정확한 원인·수정 commit을 확인했다는 뜻은 아니야.
