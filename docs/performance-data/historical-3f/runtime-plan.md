# 3f 런타임 검증 실행 계획

이 파일은 **실행 준비 기록**이야. 준비 과정에서는 브라우저·WebGL·오디오·HTTP·WebSocket 검사를 실행하지 않았어. a41에서 끝낸 로딩·오디오·방 UI 결과를 3f 결과로 옮겨 적지 않아.

## 기준과 고정한 입력

| 구분 | 저장소 / 주소 | 식별 방법 |
| --- | --- | --- |
| 기준본 | `forest-baseline-3f`, `http://127.0.0.1:8084` | `3f1655b0c035a630adbcfbf19582dd9363386f34`의 정확한 Git blob과 로컬 파일 비교 |
| 통합 후보 | `forest-integration-3f`, `http://127.0.0.1:8085` | `source-manifest.json`의 후보 파일 SHA-256. 부모 commit을 통합 완료 commit으로 쓰지 않아 |
| 수집기 | `qa-3f/bench-source/` | 15개 파일의 SHA-256. 변경된 `full-frame-fixture.js`를 제외한 14개는 고정한 a41 도구와 바이트가 같아 |
| 실행기 | `run-portable.mjs`, 방 UI는 `run-multiprocess.mjs` | 논리적인 `tools/bench/*.mjs` 인자를 위 사본 경로로 바꿔서 실행해 |
| 근거 | `runtime-plan-provenance.json` | 제품 파일 53개, 도구·실행기·계획 hash, 고유 출력 25개, 로딩 main 변환 예상 hash |

제품과 도구는 새 검증을 위해 고치지 않았어. 로컬 소스 hash 확인은 실제 HTTP 응답 확인과 달라. 수집이 끝난 뒤 로딩 raw의 `mainFixture.originalSha256` / `servedSha256`와 기능·프로토콜의 source 기록을 이 계획에 다시 대조해야 해. cold 로딩 직전에 별도 요청으로 샘플을 미리 가져오거나 Playwright route를 추가하면 안 돼.

계획은 현재 컨테이너의 Playwright 1.64.1, Chromium 153.0.8010.0 / `@sparticuz/chromium` 153.0.0, 로컬 5.3.0 폰트 패키지, SwiftShader 조건을 이어가. `chromeArgs`는 실행기에 직접 준 인자이고 Playwright 기본 인자를 모두 담지는 않아. 실제 PC의 하드웨어 GPU나 실물 휴대폰 조건으로 해석하지 마. 일반 PC 재현은 저장소의 `docs/reproduce-on-pc.md`와 `tools/bench/`를 사용해야 해.

## 21개 실행과 결과 범위

| 독립 계획 | 실행 수 | 통합 계획 index | 범위 |
| --- | ---: | --- | --- |
| `loading-plan.json` | 8 | 0–7 | 두 공연장 × desktop/high, mobile/low × 기준/후보. 각 실행에서 cold와 warm 한 번씩 |
| `audio-plan.json` | 6 | 8–13 | Hall desktop과 Sphere mobile 기준/후보 4개, 후보 Hall mobile과 Sphere desktop 2개. 실제 음원 재생 65초 |
| `rooms-plan.json` | 2 | 14–15 | 후보 Hall `cross`, Sphere `core`. 하나의 BrowserContext 안의 실제 두 탭 |
| `functional-plan.json` | 4 | 16–19 | 후보 두 공연장 × desktop/mobile. 실제 입장·이동·시점·앉기·시작·재개·설정·중계 조작 |
| `protocol-plan.json` | 1 | 20 | 3f 후보 서버와 실제 RoomClient의 기존 localhost 프로토콜·정적 응답 검사 15개 |

`runtime-plan.json`은 이 다섯 계획을 같은 순서로 이어 붙인 거야. 독립 계획과 통합 계획을 모두 실행하면 같은 일을 중복하고 출력도 덮어써. 둘 중 한 실행 방식만 골라 줘.

화면은 loading/audio/functional에서 desktop 960×540 DPR1, mobile 390×844 DPR2야. rooms는 이전 두 탭 검사와 같은 desktop 960×640 DPR1이야. viewport/DPR, `HEADLESS=1`, `SCREENSHOTS=0`, 기본 `TIMEOUT_MS=180000`을 계획에 직접 적어서 다른 렌더 작업의 환경변수가 섞이지 않게 했어. 제품이 적용한 실제 pixelRatio는 raw에서 따로 확인해야 해. 기능 재개 검사의 **2초 제한은 그대로**야.

### 로딩

관객 seed 417은 local proxy가 `main.js`의 solo crowd 한 줄에만 적용해. 두 3f 파일 모두 그 anchor가 정확히 한 번 나오는 것을 정적으로 확인했고 예상 original/served SHA를 provenance에 남겼어. 전역 RNG나 Three UUID는 고치지 않아. 원래 MP3/vendor/music/일반 JS는 gzip과 HTTP 캐시를 유지하며, 수정한 main은 identity·QA ETag·no-cache 응답이야. 그 main 바이트를 원래 앱의 전송 바이트로 세면 안 돼.

각 raw의 cold/warm 관객 수·정렬된 점유 좌석 hash가 같아야 하고, 8개가 끝나면 기준/후보 네 쌍도 `compare-loading.mjs`로 검증해야 해. 준비 시간·longtask·heap은 각 조건 한 번의 관측이야. IR 등 다른 native random 값은 남아 있고 main rAF도 보류하므로 실제 전체 화면 FPS나 안정적인 인과 효과로 설명하지 않아.

### 오디오

a41에서 실행한 여섯 범위를 그대로 유지해. 기준/후보 쌍은 Hall desktop과 Sphere mobile 두 쌍뿐이야. 실제 입장·앉기·공연 시작을 사용하고 해당 곡의 단원 입장을 snap으로 완료해. native AudioContext 시계와 25ms 원래 스케줄러를 그대로 두며 `updateVisual`은 5Hz, main rAF는 보류해. 실제 음표 요청·source 시작·lead·분석기 신호·일시정지를 확인해.

65초 검사는 원래 첫 곡 종료 전 구간이야. 끝까지 전체 곡이나 새 앙코르·인터미션을 통과했다는 뜻이 아니야. 관객 seed가 고정되지 않은 원래 audio fixture를 유지하므로 CPU·heap·부팅 속도의 전후 성능 비교로 쓰지 않아. source count 또는 score-prefix hash도 실제 raw가 나온 다음에 비교하고, a41의 1,671/2,160 수치를 예상 정답으로 강제하지 않아.

### 방 UI와 프로토콜

rooms는 a41과 같이 `--single-process`, `--in-process-gpu`, disable-features의 `AudioServiceOutOfProcess` 항목만 뺀 별도 실행기를 써. 나머지 packaged Chromium 인자와 소프트웨어 렌더러는 유지해. private localhost 방, host/guest 조작 권한, 실제 채팅 UI, 시작/정지 상태 전파와 host 이양을 확인하고 Hall `cross`는 공연장 선택·잘못된 공연장 초대 링크의 자동 이동도 확인해. 실제 외부 방이나 사용자는 접촉하지 않아.

프로토콜 도구는 사본의 상대 위치로 저장소를 추측하지 않도록 `REPO_DIR=.../forest-integration-3f`를 명시해. 이 도구는 별도 임시 프로세스를 `127.0.0.1`의 OS 지정 포트로 열어. 기존 8084/8085 방을 쓰지 않아. 기존 15개 범위가 새 투표·리사이틀·수면 기능 전부를 포함하는 것은 아니고, 그 검사는 별도 `rituals.mjs` 계획과 분리해.

### 기능 검사에서 실패 보존

네 조합은 `SCOPE=full`과 `CONTINUE_ON_TRANSPORT_FAIL=1`을 사용해. 재개 2초 검사가 실패하면 원래 trace·FAIL·exit 1을 유지하고 실제 일시정지를 누른 뒤 나머지 설정·중계 검사를 이어가. 과거 a41 Hall desktop의 재개 실패를 3f에서도 실패한다고 미리 단정하지 않아. 반대로 후속 UI 검사가 통과했다고 재개 실패를 PASS로 바꾸지도 않아.

각 기능 조합의 출력 폴더를 따로 둬서 네 `functional-3f-summary.json`이 서로 덮어쓰지 않아. 전체 큐는 한 job이 실패하면 멈춰. 원본을 읽은 다음 다음 index에서 재개하면 돼.

## 실행 명령 — root가 다른 측정이 끝난 뒤 직렬 실행

작업 위치는 `/workspace/scratch/51e64c30577e`야. 아래 명령은 서로 병렬 실행하지 마. 기준/후보 서버와 제품·도구의 hash가 계획을 만들 때와 같은지 확인하고, 이전 작업의 `qa-3f/STOP`이 남아 있으면 운영자가 그 상태를 먼저 판단해야 해. 큐는 STOP을 발견하면 현재 job을 마친 뒤 멈춰.

```bash
node qa-3f/run-runtime-plan.mjs qa-3f/loading-plan.json
node qa-3f/run-runtime-plan.mjs qa-3f/audio-plan.json
node qa-3f/run-runtime-plan.mjs qa-3f/rooms-plan.json
node qa-3f/run-runtime-plan.mjs qa-3f/functional-plan.json
node qa-3f/run-runtime-plan.mjs qa-3f/protocol-plan.json
```

또는 통합 계획 하나만 실행해:

```bash
node qa-3f/run-runtime-plan.mjs qa-3f/runtime-plan.json
```

예를 들어 통합 index 16에서 실패했으면 그 raw와 `runtime-status-0.json`을 보존한 뒤 다음 job을 이렇게 실행해. 숫자는 0부터 시작해.

```bash
node qa-3f/run-runtime-plan.mjs qa-3f/runtime-plan.json 17
```

재실행을 위해 실패한 job을 다시 선택하려면 **새 label/output 폴더와 새 계획 파일**을 만들어. 같은 raw를 덮어쓰면 첫 실패 근거를 잃어. `make-runtime-plan.py`는 다른 내용의 기존 계획을 덮어쓰지 않으며, 준비할 때 결과 파일이 이미 있으면 실패해. 수집이 시작된 뒤 계획을 재생성하지 마.

### 로딩 네 쌍의 파일 비교

이 명령들은 브라우저를 열지 않아. 각 입력 raw가 완료된 뒤에만 실행해.

```bash
node qa-3f/bench-source/compare-loading.mjs qa-3f/runtime-results/loading-baseline-3f-fixed-hall-desktop.json qa-3f/runtime-results/loading-after-3f-fixed-hall-desktop.json qa-3f/runtime-results/loading-comparison-hall-desktop.json
node qa-3f/bench-source/compare-loading.mjs qa-3f/runtime-results/loading-baseline-3f-fixed-hall-mobile.json qa-3f/runtime-results/loading-after-3f-fixed-hall-mobile.json qa-3f/runtime-results/loading-comparison-hall-mobile.json
node qa-3f/bench-source/compare-loading.mjs qa-3f/runtime-results/loading-baseline-3f-fixed-sphere-desktop.json qa-3f/runtime-results/loading-after-3f-fixed-sphere-desktop.json qa-3f/runtime-results/loading-comparison-sphere-desktop.json
node qa-3f/bench-source/compare-loading.mjs qa-3f/runtime-results/loading-baseline-3f-fixed-sphere-mobile.json qa-3f/runtime-results/loading-after-3f-fixed-sphere-mobile.json qa-3f/runtime-results/loading-comparison-sphere-mobile.json
```

계획 준비에서 통과한 것은 로컬 파일 hash·고유 경로·JSON 구성·새 실행기의 syntax 검사뿐이야. 실제 결과 표와 PASS/FAIL 판정은 root가 각 job을 직렬로 실행한 뒤에 채워야 해.
