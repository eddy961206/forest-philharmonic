# 성능과 동작을 같은 조건에서 비교하기

이 문서는 `tools/bench` 실행 방법과 결과를 읽는 기준이야. **공연장만 따로 그린 결과, 전체 장면 결과, 조작 검증을 구분해서 봐.** 실행기는 앱에 import되지 않고, 앱의 런타임 의존성도 추가하지 않아. 원시 JSON을 남기고 결과를 서로 비교하는 도구야. 특정 PC나 휴대폰의 성능을 미리 보장하는 수치는 아니야.

## 1. 고정한 기준 main과 변경 코드를 따로 띄워

이 보고서의 최종 재현 기준은 main `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`이야. 측정 중에는 두 checkout의 코드와 서버를 그대로 유지해. 아래 명령은 변경 브랜치의 저장소 루트에서 실행하는 예시야.

```bash
git fetch origin main
baseline_ref=a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6
candidate_ref=$(git rev-parse HEAD)
git worktree add --detach ../forest-reference "$baseline_ref"
```

나중에 추가된 최신 main을 조사하려면 그때의 `origin/main` SHA를 별도로 고정해 새 결과 묶음을 만들어. 그 새 비교를 a41 보고서의 재현 결과로 합치지 마. PR head를 가져오는 과정과 OS별 전체 명령은 [실제 PC 재현 안내](reproduce-on-pc.md)에 있어.

각각 다른 터미널에서 서버를 실행해.

```bash
# 기준 main
PORT=8082 HOST=127.0.0.1 QUIET=1 node ../forest-reference/server.js
```

```bash
# 변경 브랜치
PORT=8080 HOST=127.0.0.1 QUIET=1 node server.js
```

`REVISION`은 실행한 사람이 넣는 설명값이야. 서버의 커밋을 자동 인증하는 값으로 취급하면 안 돼. 실행기는 실제로 응답받은 주요 JS 파일의 SHA-256도 `sourceHashes`에 남겨. 변경 사항이 아직 커밋되지 않았다면 그 사실을 실행 라벨과 기록에 함께 남겨. 기존 측정 파일의 기준 커밋을 새 main으로 바꿔 적거나 서로 다른 시점의 main 결과를 한 묶음으로 합치지 마.

## 2. 브라우저 도구는 개발 환경에 따로 설치해

앱 서버와 Node 회귀 테스트는 기존처럼 외부 npm 패키지 없이 실행돼. 아래 도구를 쓸 때만 Playwright와 Chromium이 필요해. 앱 서버의 Node 18 최소 조건과 브라우저·프로토콜 도구의 요구사항은 달라. 전체 재현 절차는 [PC 안내의 Node 조건](reproduce-on-pc.md)을 따라 Node 22 이상을 사용해. 아래는 기록된 패키지 버전을 저장소 밖에 설치하는 예시야.

```bash
npm install --prefix ../forest-bench-runtime --save-exact playwright@1.64.1
node ../forest-bench-runtime/node_modules/playwright/cli.js install chromium
export PLAYWRIGHT_MODULE="$PWD/../forest-bench-runtime/node_modules/playwright"
```

설치된 Chrome/Chromium을 쓰려면 `CHROME_EXECUTABLE`에 그 실행 파일 경로를 지정해. 생략하면 해당 Playwright가 관리하는 Chromium을 써. 서로 비교할 두 실행에는 **같은 Playwright와 브라우저 바이너리**를 사용해. 컨테이너 전용 Chromium이 추가 플래그를 요구하면 `CHROME_ARGS`에 JSON 문자열 배열로 전달할 수 있어.

SwiftShader 소프트웨어 렌더링을 요청하려면 `SOFTWARE_RENDERER=1`을 사용해. 이 설정은 ANGLE/SwiftShader 플래그를 전달하고, 실제 선택된 renderer 문자열도 결과에 기록해. 플래그를 줬다는 사실만으로 소프트웨어 렌더러가 실제 사용됐다고 단정하지 말고 JSON의 `meta.renderer`를 확인해. 하드웨어 렌더러와 소프트웨어 렌더러의 시간 수치를 섞어 비교하지 마.

| 환경변수 | 의미와 기본값 |
| --- | --- |
| `BASE_URL` | 앱 주소. 기본 `http://127.0.0.1:8080/` |
| `REVISION` | 측정한 코드의 커밋 또는 명확한 작업 상태 설명. 기본 `unspecified` |
| `PLAYWRIGHT_MODULE` | `playwright` 패키지 이름 또는 경로 |
| `CHROME_EXECUTABLE` | 선택할 Chrome 실행 파일. 생략하면 Playwright 기본값 |
| `CHROME_ARGS` | 추가 실행 인자 JSON 배열. 기본 `[]` |
| `SOFTWARE_RENDERER` | `1`이면 SwiftShader를 요청해 |
| `OUTPUT_DIR` | 결과 경로. 기본 현재 디렉터리의 `bench-results` |
| `WIDTH`, `HEIGHT`, `DPR` | 각 도구의 기본 화면 조건을 명시적으로 바꿔 |
| `SAMPLES`, `WARMUP` | 각 장면의 측정 표본 수와 준비 프레임 수 |
| `MODE` | 전체 장면 도구만 사용. `sync` 또는 `cadence`, 기본 `sync` |
| `SCREENSHOTS` | `1`이면 성능 표본을 다 받은 뒤 canvas PNG도 저장해 |
| `TIMEOUT_MS` | 브라우저 준비·조작 대기와 전체 장면 도구의 장면별 cadence 표본 수집 제한. 기본 `180000`ms |
| `HEADLESS` | 기본 headless. `0`이면 브라우저 창을 띄워 |
| `FONT_MODE`, `FONT_ROOT` | 아래 폰트 조건을 선택해 |
| `LABEL` | 기능 검증 결과의 라벨. 기본 `functional` |

### 폰트도 같은 조건을 사용해

기본 `FONT_MODE=system`은 Google Fonts CSS 요청을 빈 CSS로 응답해서 외부 네트워크 의존성을 없애고 시스템 대체 폰트를 써. `FONT_MODE=network`는 실제 외부 요청을 유지해. 외부 폰트 연결 실패를 제품의 WebGL 오류와 혼동하지 말고 `diagnostics`의 요청 주소를 같이 봐.

기존 로컬 폰트 fixture를 재현하려면 별도 개발 환경에 두 폰트 패키지를 설치하고 `FONT_ROOT`를 `@fontsource` 디렉터리로 지정해.

```bash
npm install --prefix ../forest-bench-runtime --save-exact playwright@1.64.1 @fontsource/gowun-batang@5.3.0 @fontsource/ibm-plex-sans-kr@5.3.0
export FONT_MODE=local
export FONT_ROOT="$PWD/../forest-bench-runtime/node_modules/@fontsource"
```

숨긴 UI만 사용하는 공연장 정적 렌더와 달리, 전체 장면의 중계 자막에는 폰트가 영향을 줘. before/after의 폰트 모드와 실제 폰트 파일을 맞춰. 시스템 폰트 결과를 기존 로컬 폰트 결과와 픽셀 단위로 비교해서 렌더 회귀라고 결론 내리지 마.

## 3. 공연장만 따로 비교해

```bash
BASE_URL=http://127.0.0.1:8082 REVISION="$baseline_ref" \
SOFTWARE_RENDERER=1 node tools/bench/venue.mjs before hall high

BASE_URL=http://127.0.0.1:8080 REVISION="$candidate_ref" \
SOFTWARE_RENDERER=1 node tools/bench/venue.mjs after hall high
```

`hall` 대신 `sphere`, `high` 대신 `medium` 또는 `low`를 넣을 수 있어. 기본 조건은 **960×540, DPR 1, 장면당 준비 1회 뒤 5개 표본**이야. `front`, `mid`, `wide` 세 카메라를 순서대로 사용해.

이 도구는 원래 `qa/render-benchmark.mjs`의 범위를 유지해. `hall.group` 이외의 scene 자식을 숨기고, 관객·반딧불을 끄고, 앱의 main rAF를 실행하지 않아. `renderer.render(scene, camera)`를 직접 호출하므로 전체 공연 애니메이션·중계·후처리 비용이 포함되지 않아. 높은 품질의 그림자는 매번 다시 그려. 카메라별 `scene.onBeforeRender` 훅은 실제 렌더러가 평소처럼 호출해.

**이 범위의 `wide` 이름은 전체 장면 도구의 `wide`와 같은 카메라를 뜻하지 않아.** 클래식 홀 정적 도구의 `wide`는 위치 `[0, 6, 40.4]`, 시선 `[0, 6, 30]`이야. 좌표를 결과 JSON에도 그대로 기록해. 실제 전체 공연의 개선을 설명하려면 다음 도구의 결과를 함께 봐.

## 4. 전체 장면의 같은 시퀀스를 비교해

```bash
BASE_URL=http://127.0.0.1:8082 REVISION="$baseline_ref" \
SOFTWARE_RENDERER=1 SCREENSHOTS=1 \
node tools/bench/full-frame.mjs before hall high desktop wide,mid,broadcast,rotate

BASE_URL=http://127.0.0.1:8080 REVISION="$candidate_ref" \
SOFTWARE_RENDERER=1 SCREENSHOTS=1 \
node tools/bench/full-frame.mjs after hall high desktop wide,mid,broadcast,rotate
```

기본 desktop 조건은 **640×360, DPR 1**, mobile은 **390×844, DPR 2**야. 기본은 각 장면 **준비 4회 뒤 12개 표본**이야. mobile은 Chromium의 화면·터치·UA 에뮬레이션이므로 실제 휴대폰 GPU나 발열 환경을 재현한다고 해석하면 안 돼.

**before/after는 시나리오 순서, 준비 프레임 수, 측정 표본 수까지 똑같아야 해.** 오케스트라의 상태를 가진 애니메이션은 앞선 장면의 업데이트를 누적해. 카메라와 음악 시각만 같아도 앞에 `front`를 추가했거나 표본 수가 다르면 같은 포즈라고 보장할 수 없어. `scenarioOrder`에 실행 순서를 남기고, 비교 도구도 순서가 다르면 중단해. 기존 JSON은 `Object.keys(scenarios)`의 삽입 순서로 순서를 복원할 수 있어. 기존 결과에서 조건이 어긋난 탐색 실행은 정량 비교에서 제외해.

| 장면 | 제어하는 조건 |
| --- | --- |
| `front` | 무대 가까운 위치 `[0, 1.75, 5]`에서 앞을 봐 |
| `mid` | 홀 중앙 또는 Sphere 중간 객석에서 봐 |
| `wide` | 홀 `[0, 22, 30]`, Sphere `[0, 44, 62]`에서 넓게 봐 |
| `foyer` | 클래식 홀 로비 좌표 `[0, 6, 40.4]`를 사용해. Sphere의 실제 입구 동선 대표값은 아니야 |
| `rotate` | 같은 기준 카메라에 프레임 번호에 따른 이동·회전을 더해 |
| `broadcast` | 음악 시각 5초, 중계를 켠 상태를 측정해 |
| `dome` | Sphere의 AURORA 장면을 올려다봐 |
| `forest`, `peaks` | Sphere의 해당 3D 세계. 경량 빌드는 앱의 원래 2D 대체 장면을 사용해 |
| `crossfade`, `reveal` | Sphere의 세계 간 전환 또는 지붕 열림 전환 중간 상태를 사용해 |
| `effects-peak` | 같은 seed로 색종이 두 묶음과 불꽃 세 묶음을 즉시 겹쳐 띄워. 조명 리그가 입장하는 구간이며 활성 빔 부하를 대표하지 않아 |
| `effects-show` | 조명 리그와 워시를 먼저 준비해서 빔이 켜진 상태에서 같은 색종이·불꽃을 겹쳐 띄워 |

전체 장면 도구는 기존 `qa-v2/full-frame.mjs`의 최신 fixture를 옮긴 거야. `main.js` 응답 뒤에 계측 코드를 붙이고, 실제 앱 파일이나 기준 checkout은 바꾸지 않아. 연주자·관객·공연장·선택한 돔/효과·그림자·선택한 중계·후처리의 실제 `frame()`을 실행해. 다음 제어 조건은 실제 앱 사용과 구분해야 해.

- 곡은 `beethoven-ode-to-joy`, 기준 시각은 25초야. `broadcast`만 5초에서 시작해.
- `snapOnstage`로 연주자 전원을 무대에 배치하고 `snapConductor`로 지휘자 입장을 완료해. a41의 정상 공연이 선택하는 곡별 roster와 다른, 전원 배치 부하 fixture야. 실제 공연의 인원·입퇴장 동작은 기능 검증에서 별도로 확인해.
- 관객은 seed 417과 fill 0.8로 다시 만들어. Three UUID 생성용 난수는 별도 seed 874로 분리해서 객체 할당 수의 변화가 군중·효과 난수를 바꾸지 않게 해.
- 실제 오디오 엔진은 만들지만, 음표 스케줄러를 끄고 `perf.time`을 제어하는 시각 시계를 써. **오디오 정확성·연주 중 입력 지연·실제 스피커 출력을 검증하는 측정이 아니야.**
- UI는 숨겨. 실제 입장·버튼·터치·listener 동작은 아래 기능 검증으로 확인해.

효과가 겹치는 장면은 별도 라벨과 프로세스로 단독 실행하는 걸 권장해.

```bash
BASE_URL=http://127.0.0.1:8080 REVISION="$candidate_ref" \
SOFTWARE_RENDERER=1 SCREENSHOTS=1 \
node tools/bench/full-frame.mjs after-peak hall high desktop effects-peak

# 활성 빔까지 포함하는 별도 장면이야. 양쪽 모두 같은 표본 수로 실행해.
BASE_URL=http://127.0.0.1:8080 REVISION="$candidate_ref" \
SOFTWARE_RENDERER=1 SCREENSHOTS=1 SAMPLES=6 \
node tools/bench/full-frame.mjs after-show hall high desktop effects-show
```

`front,wide,broadcast,effects-peak`처럼 시퀀스의 **마지막**에 두는 것도 허용해. `effects-show`도 같은 규칙을 사용해. 앞선 장면에서 색종이·불꽃을 생성하지 않고, before/after의 전체 장면 순서·준비 횟수·표본 수를 맞춰야 해. 남은 파티클이 다음 장면의 부하를 바꾸므로 두 효과 장면 뒤에 다른 장면을 놓거나 두 효과 장면을 한 시퀀스에 넣으면 실행기가 거부해. 단독 실행과 시퀀스 끝의 실행을 서로 같은 조건이라고 비교하지 마.

`effects-peak`는 지연된 `setTimeout`에 기대지 않고 동일한 파티클을 즉시 띄워. 10회의 1/60초 업데이트 뒤 준비·측정 단계를 시작해. 겹친 효과의 정해진 관찰 구간이며 모든 가능한 효과 조합의 절대 최악값을 증명하지는 않아. 오래 측정하면 파티클이 소멸하므로 표본 수를 바꾸고 같은 peak 부하라고 부르지 마. 기존 `effects` 실행은 타이머 때문에 활성 파티클 수가 일정하지 않을 수 있으니 이 결과를 대체하는 근거로 쓰지 마.

`effects-show`는 파티클을 만들기 **전에** `lasers.update`와 `wash.update`만 480회, 회당 1/60초씩 진행해. 이 준비 구간의 조명 시각은 12초부터 20초 직전까지야. 그 뒤 `effects-peak`와 같은 즉시 burst와 10회의 전체 효과 업데이트를 수행해. 빔을 켜기 위해 기다리는 동안 색종이·불꽃이 먼저 소멸하는 일을 피하고, 원래 `effects-peak`의 측정 내용도 바꾸지 않아. 두 장면의 수치는 서로 다른 부하로 구분해서 봐.

### 중계 첫 갱신과 준비 후 관찰을 나눠 봐

Low 중계의 원래 `every=90` 주기에서는 준비 4회 뒤에도 기준 버전의 첫 중계 렌더가 아직 오지 않을 수 있어. 후보의 첫 frame 강제 갱신은 같은 준비 구간에 shader와 render target을 이미 사용해. 이 조건의 짧은 전체 frame·rAF 관찰은 **초기 활성화 동작과 첫 준비 비용을 포함해**. 특히 100표본의 1% Low는 가장 느린 한 간격이라 서로 다른 준비 상태를 섞을 수 있어. 이를 준비가 끝난 지속 중계의 동일 화질 개선율로 인용하지 마.

최신 중계 영상이 바로 표시되는 기능 개선과, 양쪽 모두 첫 중계를 지난 뒤의 간격 관찰은 별도 실행으로 남겨. 후자는 예를 들어 다음 조건을 before/after, 두 공연장과 두 기기에 똑같이 적용해.

```bash
BASE_URL=http://127.0.0.1:8082 REVISION="$baseline_ref" \
MODE=cadence WARMUP=94 SAMPLES=100 \
node tools/bench/full-frame.mjs before-warm hall low desktop broadcast

BASE_URL=http://127.0.0.1:8080 REVISION="$candidate_ref" \
MODE=cadence WARMUP=94 SAMPLES=100 \
node tools/bench/full-frame.mjs after-warm hall low desktop broadcast
```

`sphere`와 `mobile`도 각각 별도로 실행해. 양쪽 모두 실제 중계 주기를 지났는지, 화면 내용·프리셋·scale과 오류를 확인한 뒤 비교해. 94회는 이 90-frame 경로를 지나기 위한 조건이며 모든 기기의 안정 상태를 보장하는 상수는 아니야. 최초 활성화 관찰과 준비 후 관찰을 합쳐 한 평균으로 만들지 마.

### 시간 필드를 정확히 읽어

| 필드 | 뜻 |
| --- | --- |
| `completeMs` | JS `frame()` 또는 직접 렌더 호출부터 `readPixels` 완료까지의 벽시계 시간. JS·드라이버·렌더링·완료 대기가 포함돼 |
| `submitMs` | 렌더 호출을 제출하는 JS 구간. 드라이버가 기다리면 그 대기도 포함되므로 순수 JS 연산량과 같지 않아 |
| `completionWaitMs` | 제출 이후 동기 readback이 끝날 때까지 기다린 구간 |
| `cadenceMs` | `MODE=cadence`에서 네이티브 rAF callback 시작과 다음 시작 사이의 실제 간격 |
| `calls`, `triangles` | 그 표본의 전체 렌더 제출 카운트. 정적 공연장 범위와 전체 frame 범위의 포함 대상은 서로 달라 |
| `phaseMeanMs` | 계측한 JS 메서드별 평균 경과 시간. `broadcast` 안의 `renderSubmit`처럼 서로 겹치는 구간이 있어서 합산하면 안 돼 |
| `geometries`, `textures`, `heap` | Three 리소스 개수와 브라우저가 제공할 때의 JS heap 관찰값. GPU 메모리 byte 수가 아니야 |
| `cdpMetricsSnapshot` | 해당 시점의 누적 CDP 지표. 한 프레임의 증가량으로 해석하지 마 |

`MODE=cadence`를 사용하면 readback 없이 외부 rAF 간격을 관찰할 수 있어.

```bash
BASE_URL=http://127.0.0.1:8080 MODE=cadence SAMPLES=120 \
node tools/bench/full-frame.mjs after-cadence hall high desktop mid
```

각 장면의 cadence 표본 수집은 Node 쪽에서 `TIMEOUT_MS`로 제한해. 기본은 180,000ms이고 준비 프레임이 끝난 뒤부터 해당 장면의 모든 표본을 받을 때까지 적용해. 창이 비활성화되거나 rAF가 멈춰도 이 제한을 넘으면 `status: FAIL`과 장면 이름이 있는 오류를 먼저 JSON에 저장한 뒤 브라우저를 닫아. 앞서 완료한 장면은 남지만, 시간 초과한 장면의 부분 표본은 성공 결과로 저장하지 않아. 창을 활성 상태로 유지하고, 긴 측정이라면 양쪽에 같은 제한을 충분히 크게 지정해. **이 제한은 실행 전체나 준비 프레임·sync 표본 수집을 감싸는 전체 실행 제한이 아니야.**

이때 **외부 rAF 시계와 제어한 음악 시각이 따로 있어.** 수동 프리셋에서는 앱 내부 `lastNow`를 매번 1/60초 전으로 맞추고 애니메이션 dt 상한도 1/60초로 설정해서 포즈 조건을 유지해. 외부 `cadenceMs`는 실제 callback 간격이지만, 수동 fixture의 앱 내부 `__fp.stats.fps`는 실제 사용 FPS 비교 지표로 쓸 수 없어.

**자동 품질은 `MODE=cadence`에서 정상 앱의 애니메이션 dt 상한 0.05초를 사용하고, `lastNow`를 강제로 되감지 않아.** 각 버전의 frame은 실제 경과시간을 받아 원래 품질 정책을 실행해. baseline이 제한한 dt로 FPS를 계산하는 기존 동작과 PR이 제한 전 elapsed로 판단하는 변경도 그대로 비교 대상에 남아 있어. 하네스가 baseline의 정책을 다른 것으로 바꾸는 것은 아니야. 결과의 `fixturePolicy.animationDtCapSeconds`는 `0.05`, `automaticClock`에는 이 조건이 기록돼. 실제 프리셋·scale도 표본마다 확인해.

자동에서도 **음악 시각 `perf.time`은 step마다 1/60초씩 증가하는 fixture**이고 실제 음표 스케줄러는 꺼져 있어. 정상 앱의 실제 음악 진행·입력·출력 장치 부하를 함께 재현한 결과가 아니야. 자동 조절 결과를 수동 고정 품질의 동일 화질 개선율에 섞지 마.

이전 ec5 auto 탐색은 자동 모드에도 1/60초 dt 상한을 줬어. 그러면 baseline의 dt 기반 FPS 집계가 60 이상으로 보이면서 원래의 하강 동작을 막을 수 있어. **그 auto 결과는 원본을 보존하되 자동 품질 개선 근거에서 제외했어.** a41 auto는 위의 0.05초 조건으로 새로 실행한 결과만 사용해. 제외 과정은 [검증 기록](validation-log.md), 이전 파일은 [ec5 보존 자료](performance-data/historical-ec5/README.md)에 있어.

동기 완료 시간 `completeMs`는 FPS로 환산하지 않아. `MODE=cadence`로 기록한 실제 외부 rAF 간격에만 아래의 관찰 FPS 비교를 제공해. `gpuTimerAvailable` 또는 `gpuTimer`가 true여도 timer query로 GPU 시간을 측정했다는 뜻은 아니야. SwiftShader의 동기 완료 시간이나 소수 표본의 p95는 환경에 따른 관찰값이야. 작은 차이는 실행 순서를 바꿔 반복해 보고, 다른 GPU 작업·브라우저 검증·인코딩과 동시에 측정하지 마.

현재 앱의 `__fp.stats`는 한 프레임의 그림자·중계·돔·후처리 카운트까지 모아. 이전 버전의 마지막 main pass만 센 값과 단순 차이를 내면 안 돼. 이 도구는 비교할 양쪽 모두 `renderer.info.autoReset=false`와 명시적 프레임 reset을 사용해 범위를 맞춰.

## 5. 결과 JSON과 이미지 비교

```bash
node tools/bench/compare.mjs \
  bench-results/before-full-hall-high-desktop-sync.json \
  bench-results/after-full-hall-high-desktop-sync.json \
  > bench-results/hall-comparison.json
```

비교 도구는 실행 범위·시간 지표·공연장·품질·기기·시나리오 순서·표본 수와, 기록돼 있는 카메라·준비 횟수·화면/DPR·renderer·브라우저·폰트 모드·fixture를 확인해. 조건이 다르면 중단해. 기존 JSON끼리도 읽을 수 있지만 없는 메타데이터는 검증한 것처럼 채우지 않고 경고로 남겨. 이동형 도구의 새 JSON과 기존 도구의 JSON을 섞어 비교하는 것도 막아. 기존 파일의 `throughputFps` 같은 환산값은 사용하지 않아.

`mode: "raf-cadence"`인 결과를 비교하면 각 시나리오에 두 지표가 추가돼.

| 비교 필드 | 계산과 의미 |
| --- | --- |
| `observedRafFps` | `1000 / 전체 rAF 간격(ms)의 평균`. 전후 평균 간격의 역수이고, **프레임별 FPS를 평균한 값은 아니야** |
| `onePercentLowRafFps` | 표본이 100개 이상일 때 `1000 / 느린 상위 ceil(n × 0.01)개 간격(ms)의 평균`. 100개 미만이면 이 필드 전체가 `null`이야 |

두 값은 `before`, `after`, `delta`(after − before, FPS 단위), `percent`로 비교해. `rafCadence`에는 전후 표본 수 `n`, 실제로 사용한 느린 표본 수, 원본 간격 필드와 정의를 남겨. 새 도구의 `samples[].cadenceMs`, 기존 native rAF 도구의 `samples[].ms`에서 다시 계산하고, 기존 요약에 들어 있는 FPS 값은 재사용하지 않아. **동기 완료 모드에는 이 FPS 필드들이 없고, 자동 품질 결과는 계속 동일 화질 비교에서 제외해.**

이것도 통제된 시각 애니메이션·음악 시각과 비활성 음표 스케줄러를 사용하는 fixture의 외부 callback 관찰값이야. 실제 음향 출력·입력 부하가 있는 공연 전체의 FPS나 실기기 체감 성능을 보장하지 않아. 특히 100개 표본의 1% Low는 가장 느린 한 간격으로 결정돼. 긴 반복 측정 없이 안정적인 꼬리 성능이라고 부르지 마.

표본을 더 받으려면 `SAMPLES`를 양쪽에 똑같이 지정해. raw `samples`를 보존하고 평균·p50·p95만으로 드문 긴 프레임을 감추지 마. 분위수는 nearest-rank 방식이야. 5개나 12개 표본의 p95/p99는 사실상 극값 근처라 안정적인 꼬리 지연 추정치라고 주장하면 안 돼.

여러 장면의 행 수는 독립 반복 실험 수와 달라. 같은 실행 안의 장면은 애니메이션 상태와 실행 환경을 공유하고, smoke·다른 장면 순서의 repeat·준비 94회 중계도 서로 다른 조건이야. 개선된 행의 비율을 독립 실험의 성공률로 쓰거나, 다른 시퀀스의 재관찰을 최초 결과 대신 넣지 마. 평균 callback FPS가 올라가도 1% Low가 내려갈 수 있으므로 둘과 p95를 함께 보여 줘. auto에서는 그 구간의 실제 프리셋·scale 변화도 함께 기록해.

스크린샷 비교에는 별도 개발용 Python 환경에 Pillow와 NumPy가 필요해.

```bash
python3 -m venv ../forest-image-runtime
../forest-image-runtime/bin/python -m pip install Pillow numpy
../forest-image-runtime/bin/python tools/bench/compare-images.py \
  bench-results/before-full-hall-high-desktop-sync-wide.png \
  bench-results/after-full-hall-high-desktop-sync-wide.png \
  --output bench-results/hall-wide-image.json
```

이미지 크기가 다르면 실패하고, 자동 정렬이나 크기 조절은 하지 않아. 필요한 경우에만 `--crop x,y,width,height`로 같은 영역을 잘라. 기본 변경 픽셀 비율은 RGB 중 한 채널이라도 1 이상 달라진 픽셀의 비율이야. `--threshold 2`처럼 지정하면 한 채널의 절대 차이가 2보다 큰 픽셀만 세고, 그 문턱값도 기록해.

- **MAE/RMSE**는 0~255 RGB 값 단위야. 선형 광량으로 바꾸지 않고, 투명도가 있으면 양쪽 모두 검정 배경에 합성해.
- **uniform 7 SSIM**은 RGB 채널별 7×7 균일 창, `K1=.01`, `K2=.03`, `data_range=255`, 표본 공분산 보정 `49/48`을 써. 가장자리 3픽셀을 제외한 valid 창과 RGB 채널의 값을 평균해. Gaussian SSIM이나 다른 창 크기의 값과 그대로 비교하지 마.
- 음악 시각·카메라·노출·DPR·프리셋·폰트·시나리오 순서·업데이트 횟수를 맞춘 뒤 두 이미지를 직접 봐. 작은 대상의 누락은 전체 화면 SSIM에 약하게 반영될 수 있어. SSIM 한 숫자를 품질 합격선으로 삼지 마.

이미지 한 쌍은 같은 조건의 두 캡처를 비교했다는 뜻이야. 한 실행에서 여러 장면을 저장했거나 smoke·repeat를 포함한 이미지 쌍 수를 독립적인 성능 실험 횟수나 품질 합격 횟수로 부르지 않아. auto처럼 실제 scale이 다른 캡처는 동일 화질 픽셀 검증과 따로 해석해.

## 6. 실제 입력과 회귀 테스트도 확인해

```bash
# Node 회귀 테스트: 브라우저나 별도 Three 패키지를 설치하지 않아도 돼.
npm test

# 실제 UI 입력 검증: 네 케이스를 한 번에 하나씩 실행해.
BASE_URL=http://127.0.0.1:8080 node tools/bench/functional.mjs

# 한 케이스만 선택할 수도 있어.
BASE_URL=http://127.0.0.1:8080 node tools/bench/functional.mjs sphere mobile
```

기존 보고서의 **서로 다른 60개 회귀 범위**는 59개 실제 실행 뒤 quality의 옛 7개를 새 8개 재실행으로 교체한 `52 + 8`이야. 60개를 한 번에 실행했다거나 `59 + 8`개의 서로 다른 검사를 통과했다는 뜻은 아니야. [원래 실행과 교체 근거](runtime-validation.md)를 그대로 두고, 여기서 `npm test`를 새로 실행하면 그 실행의 TAP·시각·테스트 소스 hash를 별도 기록해.

기능 검증은 혼자 보기 입장, 키보드/터치 이동과 드래그, 앉기/일어나기, 공연 시작·일시정지·재개·seek, listener 연동, 돔과 중계, 품질·관객·중계 설정, WebGL/page 오류를 확인해. 기본 desktop 화면은 960×540이고, 이전 QA의 1280×720은 `WIDTH=1280 HEIGHT=720`으로 재현할 수 있어. 결과는 `${LABEL}-${venue}-${device}.json`과 `${LABEL}-summary.json`에 남겨.

이 테스트도 main rAF를 포획하고 명시적으로 실제 프레임을 렌더해. 좌석 옆 위치 설정, 앉기 tween 완료, 무대/지휘자 입장 완료, 돔 fade 진행은 기록된 fixture야. 버튼·키보드·CDP 터치 입력은 실제 경로를 사용하지만, 입장부터 퇴장까지 모든 시간을 자연스럽게 흘려보낸 실기기 장시간 테스트라고 해석하면 안 돼. 성능 측정과 기능 검증은 동시에 실행하지 마.

오디오 worker·fallback, 실제 cold/warm 로딩, 오디오 안정성, 멀티플레이와 방 서버 검증은 [런타임 검증 방법](runtime-validation.md)을 참고해. 특히 cold-load 측정 직전에는 `sourceHashes`를 호출하거나 Playwright request route로 캐시 동작을 바꾸면 안 돼. 해당 도구의 로딩 proxy 조건을 그대로 사용해.

도구나 fixture를 수정한 뒤 재실행했다면 원래 실패·미완료 JSON과 당시 실행기를 보존하고 새 결과를 별도로 연결해. 최종 소스 manifest의 hash를 이전 raw가 사용한 도구 hash로 소급해서 적지 마. 원시 측정의 기준선·코드·조건과, 나중에 집계하거나 보고서를 만든 도구 버전도 구분해.
