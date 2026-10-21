# 측정·제외·재검증 기록

이 문서는 최종 수치가 어떤 기준과 시행착오를 거쳤는지 설명하는 기록이야. 성공한 결과뿐 아니라 제외한 실행, QA 도구의 수정, 아직 완료 결과가 없는 범위도 남겨. 성능 수치는 [성능 보고서](performance-report.md), 실제 PC 실행 절차는 [PC 재현 문서](reproduce-on-pc.md), 조건과 필드 정의는 [벤치마크 방법](bench-method.md)을 함께 봐.

**최종 결과를 갱신할 담당자는 아래 미완료 상태와 게시 확인 칸을 실제 결과로 채워야 해.** 실행 계획이나 도구가 준비됐다는 사실을 실행 통과로 표시하지 마.

**기준 변경:** 문서 작성 중 main이 세 커밋 진전해서 새 기준은 `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`가 됐어. 아래 2~12절의 측정·실패·완료 기록은 별도 표시가 없으면 **이전 `ec5ef65` 기준의 이력**이야. `a41` 통합 검토와 재측정은 15절에 따로 기록하며, 이전 수치와 PASS를 새 기준의 성과로 옮겨 쓰지 않아.

## 1. 기준 커밋과 비교 범위를 고정했어

확장 검증의 첫 기준은 main `ec5ef65fab027353b51f751ffb59aa65b863af0a`였어. 기준 checkout과 후보 checkout을 별도 서버에서 띄우고, 기준 파일을 수정하지 않았어. 이 단계의 파일 출처와 실행 환경은 각 결과의 manifest·source hash로 추적해.

그 뒤 main에 이동·geometry, Sphere 숲·바닷속 셰이더, 곡별 연주자 roster 변경이 들어왔어. 새 기준 `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`에서는 같은 곡·카메라 이름이어도 실제 장면과 부하가 달라질 수 있어. 이전 기준·이전 후보를 보존하고 최신 main과 통합 후보를 별도 비교군으로 다시 검증해.

| 단계 | 기준 | 사용 범위 |
| --- | --- | --- |
| 초기 정적 검토 | `16553d28f0b71218613a1e37df2373d69c6ea7d0` | 초기 구조·정적 공연장 이력이며 최신 개선율에 합산하지 않아 |
| 확장 검증의 이전 단계 | `ec5ef65fab027353b51f751ffb59aa65b863af0a` | 아래 기존 측정·실패·이미지·재측정의 출처야 |
| 새 통합·재검증 단계 | `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6` | 별도 raw 결과와 검증 commit/source hash가 있어야 최신 성과로 인용해 |

초기 작업에는 `16553d28f0b71218613a1e37df2373d69c6ea7d0` 기준의 정적 공연장·구조 측정도 있었어. 그 수치를 이번 최신 main 대비 새 개선 성과로 합산하지 않아. 일부 원본 파일이 같더라도, 이미 main에 반영된 변경이나 이후 후보 코드의 차이를 확인하지 않고 예전 개선율을 재사용하지 않는다는 기준이야.

기준 commit, 후보 commit, 실제 응답 파일의 SHA는 다른 정보야. 수집기의 `REVISION` 설명값만으로 서버가 그 commit을 응답했다고 증명하지 않아. 반대로 작업 중 source hash가 있다는 이유로 아직 게시하지 않은 GitHub commit이 다운로드 가능하다고 적지도 않아.

## 2. 정적 `wide`와 전체 공연 `wide`를 구분했어

이전 정적 공연장 수집기에서 Hall `wide`는 위치 `[0, 6, 40.4]`, 시선 `[0, 6, 30]`이었어. **실제 좌표는 로비 방향이야.** 이 이름을 홀 전체 전경이라고 해석해서 객석 전체 성능을 설명하면 안 돼.

전체 공연 fixture의 Hall `wide`는 위치 `[0, 22, 30]`, 시선 `[0, 4, -4]`이고, 로비 좌표는 별도 `foyer`로 남겼어. 정적 venue 도구는 공연장 root만 그리며 관객·연주자·공연 애니메이션·중계·후처리를 포함하는 전체 frame 도구와 범위가 달라. 두 도구의 calls·triangles·시간을 같은 표본처럼 합치지 않아.

## 3. 순서가 다른 h2 탐색 실행을 제외했어

Hall high h2의 기준 시퀀스는 `wide,mid,broadcast,rotate,effects`, 장면당 6표본이었어. 처음 후보 탐색 실행에는 앞에 `front`가 추가됐어. 카메라와 곡 시각만 같아도 오케스트라의 상태를 가진 애니메이션은 앞선 업데이트를 누적하므로 같은 포즈라는 보장이 깨졌어.

이 실행은 `exploratory-after-h2-hall-high-desktop.json`과 대응 PNG 이름으로 분리했고 정량 비교에서 제외했어. 최종 h2 후보는 기준과 같은 전체 순서·표본 수로 다시 실행했어. 이전 JSON의 순서는 `Object.keys(scenarios)`의 삽입 순서로 확인할 수 있어. 중간에 앞선 장면을 삭제하고 공통 이름만 남겨서 같은 시퀀스로 취급하지 않아.

## 4. 효과 시나리오를 세 종류로 구분했어

| 시나리오 | 실제 내용 | 결정 |
| --- | --- | --- |
| 기존 `effects` | `triggerFinaleFx()`의 wall-clock `setTimeout`과 고정 애니메이션 dt가 섞였어. 렌더 속도에 따라 파티클 상태가 달라질 수 있어 | 동일 효과 부하의 성능·픽셀 근거에서 제외했어 |
| `effects-peak` | 같은 seed로 색종이 2묶음과 불꽃 3묶음을 즉시 생성하고 10회 × 1/60초 진행해 | 고정 색종이·불꽃과 조명 리그 진입 장면으로 사용해. 이미 켜진 빔의 부하라고 설명하지 않아 |
| `effects-show` | 색종이·불꽃을 만들기 전에 lasers/wash만 480회 × 1/60초, 시각 12초부터 20초 직전까지 진행해. 그 뒤 같은 burst와 10회 settling을 사용해 | 활성 빔을 포함하는 별도 장면이야. `effects-peak` 원본 결과를 이 장면으로 바꿔 부르지 않아 |

`effects-peak`의 짧은 준비 동안에는 laser rig가 `drop > 0.985`에 도달하지 않았어. 이 사실을 확인한 뒤 기존 결과를 고쳐 쓰는 대신 `effects-show`를 새로 추가했어. 두 효과 장면은 단독 실행하거나 시퀀스 마지막에만 둬. 파티클이 남으므로 뒤에 다른 장면을 붙이거나 두 효과 장면을 같은 시퀀스에 넣지 않아.

효과를 오래 측정하면 파티클이 소멸해. 따라서 6표본/준비 4회 관찰을 100·300프레임의 지속 peak 부하라고 바꿔 설명하지 않아. 해당 장면의 최종 결과 파일이 없는 동안은 실행 예정으로 남겨.

## 5. 중계 첫 활성화와 준비 후 관찰을 분리했어

Low 중계는 원래 `every=90` 주기를 사용해. 원본 fixture의 준비 4회로는 기준 버전의 첫 중계 렌더가 아직 실행되지 않을 수 있어. 후보의 첫 frame 강제 갱신은 준비 구간에 중계 render target과 shader를 이미 사용해. 따라서 같은 `warmup=4`라도 두 버전의 첫 중계 준비 상태가 같다고 볼 수 없어.

이 조건의 전체 frame와 외부 rAF 100표본은 **초기 활성화 동작과 첫 준비 비용을 포함하는 관찰**로 읽어. 특히 100표본의 1% Low는 가장 느린 한 간격이라, 기준의 늦은 첫 중계 비용과 후보의 준비 후 비용을 섞을 수 있어. 이 수치만으로 준비가 끝난 지속 중계의 동일 화질 성능 개선을 주장하지 않아.

저장된 low PNG에서 기준은 검은 중계 면에 자막만 있고 후보는 실제 중계 영상이 보이는 경우도 확인했어. 그 차이는 최신 frame을 빨리 보여 주는 동작 개선의 증거로 구분해. 화면 내용이 다른 첫 활성화 캡처를 동일 출력의 steady 성능 비교로 취급하지 않아.

이를 분리하기 위해 portable 도구의 **`WARMUP=94 MODE=cadence SAMPLES=100` + `broadcast` 단독** 실행을 두 공연장 × desktop/mobile × before/after, 총 8개 작업으로 추가 계획했어. 완료된 JSON에서 양쪽 모두 중계 주기를 실제로 지났는지와 오류·품질·scale을 확인한 뒤 별도 표로 보고해야 해. 이 준비 횟수도 모든 실기기에서 안정 상태를 보장하는 보편 상수는 아니야. 다른 초기화·주기가 있으면 확인을 늘려야 해.

## 6. 실제 Worker QA의 browser context를 수정했어

최초 Worker 하네스는 단일 프로세스 Chromium에서 암시적인 `browser.newPage()` context를 닫으면서 브라우저까지 종료되는 문제가 있었어. 다음 CSP fallback case를 실행하지 못한 도구 문제였어. 실제 Worker 합성의 실패라고 분류하지 않았어.

하네스를 하나의 명시적인 `BrowserContext` 안에서 두 페이지를 유지하도록 고쳤어. 실제 Chromium의 정상 module Worker에서 4응답·종료, CSP 차단 경로에서 0응답·종료를 확인했고, 두 경로 모두 원래 동기 합성의 4종 스테레오 PCM 해시와 같았어. 완료 결과는 [Worker 검증 JSON](performance-data/runtime/browser-worker.json)에 있어. 이 과정은 실제 스피커 청취나 오디오 장치 지연 검증이 아니야.

최초 browser 종료의 상세 stderr를 최종 구조화 JSON으로 복원하지 않았어. 실패를 덮어쓰거나 Worker 성공 결과에 포함하지 않았고, 도구 수정 이유와 재실행 결과를 나눠 적었어.

## 7. 재개 150ms 고정 대기 실패는 QA 조건을 고쳤어

초기 Hall mobile 기능 검증은 seek 후 재개 버튼을 누르고 150ms만 기다린 다음, 가청 위치가 50ms 이상 전진했는지 확인하다 실패했어. 원래 제품은 `play()`에서 120ms 앞을 예약하고 `perf.time`에서 output/base latency도 빼. 그러므로 고정 150ms 대기는 이 assertion의 충분한 조건이 아니었어.

QA는 `AudioContext`가 running이고 재생 중이며 `perf.time > seekTime + 0.05`가 될 때까지 20ms 간격으로 최대 2초 기다리도록 고쳤어. 시작 위치·예약 기준 시각·audioNow·outputLatency도 남겨. **이 실패를 해결하기 위해 제품의 120ms lead, audio clock, scheduler, 음표 길이를 바꾸지 않았어.** 박수 준비 Worker 변경은 별도의 제품 변경이야.

최초 실패 원본은 작업 자료의 `functional-hall-mobile-resume-150ms.json`으로 보존했어. 실패 문구는 `Resume advances the audio clock`이야. 수정된 도구가 있다는 사실만으로 기능 검증이 통과한 것으로 기록하지 않아. 작성 시점에 확인한 기능 요약은 최초 FAIL 기록이었고, 재실행 결과와 두 공연장 × 두 기기 전부의 통과 여부는 아래 최종 확인 항목에 남겨.

소스 근거는 [기능 검증기](../tools/bench/functional.mjs), [Performance 시계](../public/js/audio/performance.js), [오디오 지연 계산](../public/js/audio/engine.js)이야.

## 8. 이미지 집계와 겹친 짧은 CPU 구간을 기록했어

GPU 행렬이 실행 중일 때 저장된 이미지의 NumPy/SSIM·비교 모음 계산이 두 차례 짧게 겹쳤어. 이를 발견한 뒤 추가 이미지 연산을 멈추고, 이미 만들어진 PNG의 육안 확인과 가벼운 문서 작업만 했어.

| 파일에서 확인한 이벤트 | UTC |
| --- | --- |
| 첫 17개 metrics 파일 저장 | 04:15:50.401928 ~ 04:15:54.284860 |
| 첫 보고서 생성 | 04:15:54.760912 |
| 추가 15개 metrics 파일 저장 | 04:16:18.947650 ~ 04:16:21.997429 |
| 두 번째 비교 모음·집계 완료 | 04:16:23.472351 |

날짜는 모두 2026-10-21이야. 이것은 파일 이벤트 시각이며 실제 분석 프로세스의 정확한 시작·종료 로그는 없어. 시작은 첫 metrics 저장보다 앞서므로 이 구간을 프로세스 경계로 단정하지 않아. 이후 실행기는 이미지 라이브러리 import 전 시작과 process 종료를 기록하도록 준비했어.

Sphere low desktop의 일부 시간 악화가 관찰돼, 조용한 구간에서 `dome` 단독 24표본을 A/B/B/A 순서로 재측정했어. `baseline-repeat`, `after-repeat`, `after-repeat2`, `baseline-repeat2` 네 파일의 최종 저장과 오류 0을 확인했어. 원래 시퀀스와 단독 재측정은 상태 조건이 달라 별도 비교군이야. 최초 시간을 지우거나 유리한 한 번을 골라 대체하지 않아. 최종 해석과 수치는 성능 보고서에서 확인해.

CPU 경합의 가능성이 있다고 해서 그 영향의 크기나 악화의 원인이 증명된 건 아니야. 반대로 오차일 것이라고 가정해서 악화를 숨기지도 않아. 이미 저장된 before/after PNG의 픽셀 비교는 이 시간 해석과 별개로 유효해.

## 9. 수집 도중 추가한 관찰 필드를 숨기지 않아

[보존한 수집기 원본](performance-data/provenance/README.md)은 `ec5` 단계에서 보존한 버전이야. `a41` 실행기로 바꿔 덮어쓰지 않아. 초기 실행부터 모든 바이트가 같았다는 증거도 아니고, 다음 차이를 함께 남겨.

| 변화 또는 누락 | 해석 |
| --- | --- |
| 초기 Hall/Sphere high 기준 표본에 `quality`, `renderScale` 없음 | 수동 high 요청과 시작 `meta`의 high/scale 1은 있지만 프레임별 기록은 없어. 없는 값을 원시 표본에 채워 넣지 않아 |
| 기존 JSON에 `scenarioOrder`, `warmupFrames`, fixture hash와 브라우저 패키지 세부 정보가 충분히 없음 | 순서는 객체 삽입 순서, 준비 4회는 원본 실행기·환경 기록으로 확인해. 기록되지 않은 조건을 자동 검증한 것처럼 표시하지 않아 |
| `fx` wrapper를 모듈 초기 위치에서 boot 후 `setup()`으로 이동 | 이전에는 `fx`가 null이라 별도 phase 기록이 없었어. 실제 fx.update는 main frame에서 실행돼 전체 frame 시간이 빠진 것은 아니야 |
| `effects-peak`, `effects-show` 추가 | 새 이름·새 fixture의 결과로 보존해. 과거 timer `effects`를 새 시나리오의 결과로 바꾸지 않아 |
| Portable 도구에서 명확한 `completeMs`, `completionWaitMs`, `cadenceMs`, 환경·소스 hash 추가 | 기존 raw JSON은 수정하지 않아. 새 형식과 기존 형식을 비교할 때 범위·기록 차이를 확인해 |

## 10. 동기 완료 ms와 외부 rAF 관찰을 구분해

동기 모드는 실제 frame 제출 뒤 `readPixels(1×1)` 완료까지 기다려. JS·드라이버·렌더 완료 대기가 들어 있는 software WebGL 벽시계 시간이야. **그 역수를 실제 PC FPS로 부르지 않아.** 원본 보존본에 `throughputFps`가 남아 있어도 그 필드를 최종 실기기 성능 주장에 사용하지 않아.

Native cadence 모드는 외부 네이티브 rAF callback 시작 사이의 실제 간격을 관찰해. 관찰 FPS는 `1000 / 평균 간격`으로 계산하고, 1% Low는 느린 상위 `ceil(n × .01)`개 간격 평균의 역수로 정의해. 100표본 미만이면 1% Low는 계산하지 않아. 프레임별 순간 FPS의 산술평균과 다른 값이야.

이 경우에도 수동 프리셋의 시각 애니메이션은 frame마다 1/60초, 음악 시각도 1/60초씩 진행하는 fixture야. 앱 내부 `__fp.stats.fps`를 이 실행기의 비교 지표로 사용하지 않아. 실제 audio scheduler는 끄고 `perf.time`을 제어하므로 음표 예약 정확성·스피커 출력·입력 지연을 이 결과로 증명하지 않아. 물리 GPU와 실제 휴대폰에서 따로 검증해야 해.

Phase timer도 겹쳐 있어. `broadcast` 내부의 `renderSubmit` 같은 inclusive 구간을 더해서 CPU 합계로 만들지 않아. Three의 geometry/texture 개수나 JS heap 관찰값도 GPU 메모리 byte 측정은 아니야. `gpuTimer:true`는 확장 존재 여부이며 timer query 측정 완료를 뜻하지 않아.

## 11. 셰이더 후보 3개를 44개 case로 검토하고 채택하지 않았어

**44개의 후보를 만들었다는 뜻은 아니야.** FOREST 종료 조건, PEAKS 하늘 계산 지연, roof reveal endpoint의 세 후보를 총 44개 case로 비교했어. 첫 FOREST smoke 실패도 별도로 보존했어.

출력이 바뀌거나, 동일 출력이어도 시간 이득이 작고 불안정하거나 느려져 세 후보 모두 제품에 넣지 않았어. 전체 요약은 44개 중 36개 동일, 8개 불일치야. 그중 한 case의 개별 JSON은 `comparing` 중간 상태로 남아서 요약에 있는 실패를 세부 픽셀 값으로 복원하지 않았어. 이 제한도 숨기지 않아.

근거와 결정은 [셰이더 실험 기록](shader-experiments.md), [원본·실행기·44개 case](performance-data/shader-experiments/README.md)에 있어. 이 실험의 시간 감소를 실제 PR의 전체 공연 성과에 합산하지 않아.

이 결과는 `ec5`의 셰이더를 대상으로 한 이력이야. 이후 `a41`에서 바뀐 숲·바닷속 셰이더에 대한 새 실험으로 취급하지 않아.

## 12. 이전 ec5 단계의 완료·대기 상태

이 표는 기준 전환 때 확인한 이전 단계의 상태야. 이후 완료 파일이 생기면 해당 단계의 기록으로 갱신하되, `a41` 통과로 바꾸지는 마. 대기 상태도 도구 존재만으로 PASS로 바꾸지 않아.

| 범위 | 확인한 상태 | 근거 또는 남은 확인 |
| --- | --- | --- |
| Node 회귀 테스트 | 완료 기록 59/59 | [회귀 결과](performance-data/runtime/unit-tests.json). 이 문서 작성 중 재실행하지 않았어 |
| 실제 Worker 정상/CSP fallback PCM | 완료 기록 | [Worker 결과](performance-data/runtime/browser-worker.json) |
| 로컬 프로토콜 멀티플레이 | 15개 시나리오 완료 기록 | [프로토콜 결과](performance-data/runtime/multiplayer.json). 실제 두 탭 UI 검증과 달라 |
| 데스크톱 대표 이미지 | 32쌍 계산, 25쌍 RGB 동일; 대표와 모든 차이 장면 15쌍 육안 확인 | 작업 자료 `qa-v2/visual-review`. 후속 모바일·효과 결과를 자동으로 포함한 숫자는 아니야 |
| Sphere low desktop 단독 재측정 | A/B/B/A, 각 24표본 파일 완료·오류 0 확인 | 기존 넓은 시퀀스와 구분해서 최종 보고서에 해석해야 해 |
| 외부 rAF 초기 활성화 관찰 | 두 공연장 × desktop/mobile low 4쌍의 최종 저장 확인 | [이전 profile 보존본](performance-data/historical-ec5/README.md). 초기 활성화를 동일 화질 지속 성능으로 바꾸어 해석하지 않아 |
| auto 탐색 | mobile 2쌍·JSON 4개의 최종 저장은 있지만 자동 품질 개선 근거에서 제외 | 강제 1/60초 dt cap이 baseline 자동 하향을 막았어. 16절의 계측 수정 기록을 봐 |
| 활성 빔 effects-show | Hall high desktop의 before/after 완료, Sphere는 baseline만 완료 | Sphere after 파일이 없는 상태를 쌍 비교 완료로 표시하지 않았어 |
| 중계 준비 후 관찰 | `WARMUP=94`, cadence100, 단독 broadcast 8작업 추가 계획 | 계획은 완료 증거가 아니야. 최종 JSON 확인 대기 |
| 기능 UI 4케이스 | 최초 Hall mobile 재개 assertion 실패 기록, QA 대기 조건 수정 | 수정 후 재실행 및 4케이스 완료 확인 대기 |
| 실제 cold/warm cache·부팅 longtasks·전송량 | 실행기 준비; 이 기록의 확인 범위에는 완료 데이터 없음 | [런타임 검증](runtime-validation.md)의 결과가 생기면 갱신해 |
| 60초 이상 실제 오디오 스케줄러 | 실행기 준비; 이 기록의 확인 범위에는 완료 데이터 없음 | fixture 시계의 전체 frame와 별도로 확인해 |
| 실제 두 탭 방·채팅·host handoff UI | 실행기 준비; 이 기록의 확인 범위에는 완료 데이터 없음 | Node 프로토콜 검증의 15 PASS를 대신 쓰지 않아 |
| 물리 GPU·실제 휴대폰·가청 출력·GPU timer·GPU 메모리 | 미검증 | SwiftShader와 터치 에뮬레이션 결과를 실기기 결과로 바꾸지 않아 |

## 13. 최종 게시·외부 변경 확인

아래는 최종 담당자가 실제 API/GitHub 상태와 저장된 결과를 확인한 뒤 채울 칸이야. 새 승인 요청을 뜻하지 않고, 이번 작업에서 실제 수행한 외부 변경의 기록이야.

- [ ] 최종 baseline main SHA와 게시할 후보 commit SHA를 적고, 공개적으로 내려받을 수 있는지 확인했어.
- [ ] 후보 branch와 PR URL·번호를 적고, base branch가 main인지 확인했어.
- [ ] 원격 commit의 tree와 검증한 로컬 제품 코드의 tree가 같은지 확인했어.
- [ ] 새 결과 파일이 실제로 완료됐는지, 오류·미실행·제외 상태가 보고서와 맞는지 확인했어.
- [ ] 초기 활성화와 준비 후 중계, 원래 시퀀스와 재측정, 탐색 실행을 구분했어.
- [ ] 수집기·계획이 바뀌었다면 새 단계의 별도 스냅샷과 SHA manifest를 남겼고, 기존 ec5 원본 6개를 덮어쓰지 않았어.
- [ ] 실제로 만든/수정한 PR, branch, commit과 사용한 API 경로의 성공 여부를 기록했어.
- [ ] main에 merge하지 않았고, 작업 요청에 없는 배포도 하지 않았는지 확인했어.

| 최종 확인 항목 | 확인값 |
| --- | --- |
| 최종 baseline SHA | 전환 목표 `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`; 게시 직전 원격 상태 확인 대기 |
| 게시 후보 SHA / tree SHA | 게시 직전 확인 대기 |
| branch / PR URL | 게시 직전 확인 대기 |
| 최종 결과 스냅샷 / 누락 범위 | 결과 집계 후 갱신 |
| 외부 변경 결과 | API 실행 후 갱신 |

## 14. 원본 수집기와 실제 PC 도구

[원본 보존 폴더](performance-data/provenance/README.md)에 `full-frame.mjs`, `run-matrix.mjs`, 세 계획 JSON, `browser-support.mjs`를 바이트 그대로 복사하고 SHA-256 manifest를 남겼어. 당시 환경의 절대 설치 경로와 컨테이너 옵션도 원본 안에 유지돼. 감사·출처 추적용이며 PC 실행 지침이 아니야.

이 원본 6개와 기존 checksum은 `ec5` 이력으로 고정해. 파일 안의 조건이나 manifest의 `baselineRevision`을 `a41`로 바꿔 과거 측정을 새 기준에 붙이지 않아. 새 단계에는 별도 source·결과·보존 시각이 필요해.

[이전 ec5 결과 보존본](performance-data/historical-ec5/README.md)에는 완료 profile 37개, 제외한 탐색 미완료 스냅샷 1개, 기존 집계와 이미지 검토·대표 모음 2개를 원문 그대로 남겼어. 완료·오류·짝 없는 실행과 장면별 제외 사유는 그 manifest에 있고, 새 수치 계산이나 최신 a41 성과로의 재라벨은 하지 않았어.

실제 PC에서는 `PLAYWRIGHT_MODULE`, `CHROME_EXECUTABLE`, `BASE_URL` 등을 받는 `tools/bench`와 [PC 기록표](pc-validation-template.md)를 사용해. 시작 프리셋을 저장한 뒤 새로고침한 상태, 화면·DPR·카메라·기기 조건까지 맞춰. 초기 low/mobile에서 고정된 LITE 경로를 나중에 high 버튼만 눌러 desktop high와 같다고 취급하지 않아.

## 15. 새 a41 통합·재검증 기록

새 기준은 `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`야. 기준 checkout은 별도로 보존하고, 이전에 제공한 `ec5` 최적화 제품 tree도 분리해 뒀어. 자동 3-way 통합의 conflict 0은 동작 보존의 증거가 아니므로 아래 검토와 결과를 별도로 채워.

| 항목 | 새 기준의 상태 | 결과 위치 / 확인값 |
| --- | --- | --- |
| a41 기준 객체·별도 checkout | 준비됨 | 기준 SHA는 위 값이야. 측정 서버의 source hash는 실행 때 기록해 |
| 기존 최적화와 3-way 통합 | 텍스트 통합 뒤 제품 코드·회귀 테스트 체크포인트 게시 | `2c6cd365fcf10b62a5e475b8eeee6ef3c8ffb614`, tree `1d68ca1612f7025ed076037a9ae4c65d59fa1387`. 최종 자료 게시와 구분하며 22절에 근거를 남겼어 |
| Hall 이동·충돌·계단·입구 geometry 보존 | 통합본 정적 검토 완료, 동적 확인 대기 | `foyer.js`, `hallplan.js`, `director.js`는 a41과 차이가 없어. 새 기둥·가구·계단 난간 충돌과 갤러리 기둥 제외를 보존했어 |
| 좌석 coarse 선택·picking·공연장 render hook | 통합본 정적 검토 완료, 새 실행 결과 대기 | 원래 `seatList`·전역 ID를 유지하고, 현재 camera의 world matrix 갱신 뒤 배치를 선택해. 새 이동 경로는 배치 visibility에 의존하지 않아 |
| Sphere 새 숲·바닷속 셰이더 | a41 shader 원문 보존 정적 확인, 선정된 장면의 재측정 완료 | [소스 보존 검토](performance-data/provenance/a41-sphere-review.md). forest/peaks/crossfade 등의 이미지 결과를 21절에 연결했어. 선택하지 않은 모든 세계의 픽셀 검증을 뜻하지 않아 |
| 곡별 roster와 fixture | 새 기준 적합성 확인 대기 | 실제 곡별 구성 적용 이후 동일한 장면을 비교해야 해 |
| Node 회귀 테스트 | a41 통합 뒤 59개 PASS, DPR 수정 뒤 품질 8개 재실행 PASS | 현재 고유 검증 범위는 유지한 52개 + 교체한 품질 8개 = 60개야. 한 번의 전체 60개 실행은 아니며 18절에 원본과 조합 근거를 연결했어 |
| 전체 frame·준비 후 중계·native cadence | 42개 render 실행 완료, 21/21 run쌍 strict 비교 PASS | 수동 61행과 auto 2행을 분리했어. 19절의 집계 수정은 렌더 재실행이 아니며, PASS를 모든 장면의 속도·화질 개선으로 읽지 않아 |
| auto 시계 보정 뒤 관찰 | 보정 후 두 공연장 mobile 2쌍, 각 120표본 관찰 완료 | 보정 시점 실행 0회였다는 이력은 16절에 유지해. 최종 baseline scale 0.85와 후보 0.60이 달라 동일 품질 집계에 넣지 않아 |
| 이미지 품질 | 수동 61 PNG쌍 중 47쌍 바이트/RGB 동일, 14쌍 차이 전부 육안 확인 | auto 2쌍 별도. 21절에 공식 a41 결과를 연결했으며, 이전 32쌍/25동일은 재라벨하지 않았어 |
| 기능 UI 실제 입력 | 최초 mobile 두 공연장 PASS, Sphere desktop 재검사 PASS. Hall desktop 재개는 기준선·후보의 별도 조건에서도 FAIL | 후보 fake-output 실행의 후속 품질·관객·중계·auto 설정 검사는 완료했지만 전체 FAIL은 유지해. 17절의 진단 범위와 구분을 봐 |
| 오디오·방 UI | 별도 검증 결과 대기 | 기능 재개 검사와 장시간 오디오·두 탭 UI의 범위를 구분해 |
| 새 결과·collector provenance | 최초 집계 FAIL·수정·전체 재집계와 visibility 보완 원본 보존 | 19·20절. 기존 ec5 원본 6개와 a41 raw JSON은 그대로 보존해 |

새 단계의 결과가 생기면 각 표에 실행 여부·오류·제외 사유와 결과 파일을 기록해. 기준이 다른 단계의 시간·픽셀·통과 개수를 합쳐 하나의 개선율이나 통과율로 만들지 않아.

Hall 정적 검토에서는 a41의 `shellHeight`, `shellSides`, `backstageCurtain`과 계단 하부의 양면 재질도 확인했어. 후보 `hall.js`의 차이는 geometry의 index 보존과 `prepareRender` 반환이고, 렌더 훅은 vendored Three가 scene/camera matrix를 갱신한 뒤 render list를 만들기 전에 실행해. coarse 배치는 그 camera에서 모든 fine part가 제출되는 경우에만 선택하고, shadow를 만드는 좌석 본체는 없어. pick proxy는 동일한 행렬과 원래 seat index를 사용하므로 렌더 표현을 바꾸어도 이동·착석용 좌석 목록을 다시 만들지 않아. 이 검토 중 브라우저나 새 테스트를 실행하지 않았어.

이전 ec5 후보의 제품 코드는 [재구성 patch](performance-data/provenance/ec5-optimized.patch)로도 보존했어. ec5의 `public` 제품 변경을 재현하기 위한 자료이며, 최신 a41 후보나 현재 측정 도구 전체를 나타내는 patch는 아니야. SHA와 적용 기준은 [provenance 설명](performance-data/provenance/README.md)에 있어.

## 16. auto 계측의 dt cap을 수정하고 이전 결과를 제외했어

원래 full-frame 실행기는 auto에도 `window.__fpMaxDt=1/60`을 적용했어. 기준 앱은 clamped animation dt로 FPS를 계산하므로 이 조건에서는 FPS가 60 이상으로 계산돼 정상 자동 하향이 막혔어. 외부 rAF 간격을 실제 시계로 기록했더라도, 자동 품질 제어기의 입력 조건 자체가 달라진 문제야.

그래서 이전 ec5의 `baseline-auto-hall-auto-mobile`, `after-auto-hall-auto-mobile`, `baseline-auto-sphere-auto-mobile`, `after-auto-sphere-auto-mobile` **JSON 4개를 자동 품질 개선 근거에서도 제외했어.** raw 파일은 수정하거나 삭제하지 않았고, historical manifest의 전체 실행 제외 사유로 남겼어. 수동 프리셋의 동일 화질 자료와 이 auto 실패를 섞지 않아.

Portable 수집기는 auto만 정상 앱의 0.05초 animation dt cap과 실제 elapsed를 사용하도록 바꿨어. Manual의 1/60초 dt 조건은 유지했고, 음악 시각은 두 경우 모두 step마다 1/60초로 제어해. 실제 오디오 scheduler를 복원한 시험으로 바뀐 것은 아니야.

[보정 기록 원문](performance-data/provenance/auto-clock-correction.json)의 시각은 `2026-10-21T04:50:39.033537Z`야. 이때 a41에서 시작한 jobs 0~4는 전부 manual이었고 **auto 실행은 0회**였어. 따라서 이미 시작한 manual의 동작 조건은 달라지지 않았고, 새 auto는 보정 후 수집기만 사용해. 보정 전 portable 원문은 [full-frame-before-auto-clock.mjs](performance-data/provenance/full-frame-before-auto-clock.mjs)에 보존했어. 수정 전후 hash와 범위는 [provenance manifest](performance-data/provenance/manifest.json)에 있어.

## 17. a41 기능 UI의 실패와 재검사 진단을 분리했어

최초 결과는 작업 원본 `qa-a41/functional-results/functional-summary.json`에 있어. 실제 UI·키보드·터치 입력을 사용하지만 main rAF를 포획하고 필요한 frame을 명시적으로 렌더하는 기능 검사야. 정상 앱의 지속 FPS나 실제 휴대폰 성능을 측정한 결과는 아니야.

| 조건 | 최초 실행 | 현재 확인한 후속 상태 |
| --- | --- | --- |
| Hall desktop | 재개 후 시계 전진 조건에서 `Timeout 2000ms exceeded`로 FAIL | trace 재검사, a41 기준선 대조, 후보 multiprocess·fake-output도 재개 FAIL. fake-output의 후속 설정 검사는 완료했으며 원인은 미확정이야 |
| Hall mobile 에뮬레이션 | PASS | 최초 파일 그대로 보존했어. desktop 재검사와 같은 새 실행으로 합치지 않아 |
| Sphere desktop | `Current cube resized to 512` assertion에서 FAIL | 실제 render target을 확인하도록 QA를 수정한 뒤 재검사 PASS |
| Sphere mobile 에뮬레이션 | PASS | 이 부팅의 LITE 경로 결과야. desktop 3D cube resize 검사는 별도로 확인했어 |

최초 desktop 두 실패는 `qa-a41/functional-results/original-failures/`에 보존돼 있어. Hall 원본의 SHA-256은 `c0dcec903052d4fbf23978ff88e4a5ec5d04f9d226e89795edafb1fe8790b669`, Sphere 원본은 `8d3f967998e46b60bcf7368664048fcbd0e14112c68242fd90202adbbea49274`야. 문서 작성 때 최초 출력 파일과 보존본의 바이트 동일성을 확인했어. 실패 JSON을 PASS로 고치거나 재검사 파일로 덮어쓰지 않아.

### Sphere의 cube image 크기 assertion을 고쳤어

최초 Sphere desktop 원본의 `quality-medium` frame에는 이미 world render pass 4개가 모두 `[512, 512]`로 기록돼 있고 GL 오류가 없어. 같은 snapshot의 `texture.image` face 6개는 `[640, 640]`이라 이전 QA assertion이 실패했어.

Vendored Three의 `WebGLCubeRenderTarget`은 face image 배열에 초기 크기를 두고, render target의 `setSize()`와 GPU 할당은 target의 width/height를 사용해. 따라서 배열 원소의 초기 metadata 크기를 현재 GPU target 크기로 취급한 검사가 잘못됐어. [기능 검사기](../tools/bench/functional.mjs)는 resize 뒤 실제 world draw가 발생하는지, 그 완료 frame에 사용된 target들이 medium 512·low 384·high 640인지 확인하도록 바뀌었어.

재검사 원본은 `qa-a41/functional-recheck/recheck-sphere-sphere-desktop.json`이고 SHA-256은 `32b5de60d1974df6830a90e89ce8952a5a0761d645adc6f44843c4cd5beafb17`이야. 결과는 PASS이며, 품질을 바꿀 때마다 world pass 4개가 순서대로 `512×512 → 384×384 → 640×640`을 사용했어. 기록된 GL 오류·context loss·page error는 없어. 같은 재검사에서 재개 조건도 약 305.7ms에 충족했고, audio clock이 약 32.853초에서 33.173초로 전진했어. 최초 실패 원인은 QA의 관측 대상을 잘못 고른 것으로 구분하고 원본은 유지해.

### Hall은 오디오 시계 정지의 원인을 계속 대조해

Hall의 추가 진단은 `qa-a41/functional-recheck/recheck-hall-hall-desktop.json`이야. SHA-256은 `eb0f5dcf6513161bb84bd78cb67506ca10fec1638dd77a4e8ad1f2b7d2821ba1`이고 결과는 다시 `Timeout 2000ms exceeded`로 FAIL이야.

QA는 기존 2초 조건을 유지하면서 100ms 간격의 상태 관찰, audio state·visibility 이벤트, 읽기 전용 engine tick observer를 추가했어. 대기 중에 audio clock이나 재생 위치를 바꾸거나 frame을 추가 실행하지 않았어. 저장된 trace에는 약 2.047초 동안 23개 관찰 sample이 있고, 최종 engine tick 수는 82회야. 탭은 `visible`, AudioContext 상태는 `running`이었지만 `currentTime`은 **60.181333333333335초에 고정**됐고 `getOutputTimestamp()`도 전진하지 않았어. 재생 버튼 상태는 playing으로 바뀌었으나 음악 위치는 약 21.795초에 머물렀어.

이 관찰로 JS tick callback이 계속 실행됐다는 사실은 확인했어. 앞선 7절의 150ms 고정 대기 문제와 달리, 이번에는 2초 조건 안에서도 audio clock이 진행하지 않았으므로 같은 이유로 해소됐다고 기록하지 않아. 후속 대조 결과도 아래처럼 별도로 남기며, 이 진단 상태를 전체 오디오 검증 PASS로 표현하지 않아.

### 기준선과 프로세스·출력 경로를 바꾼 대조에서도 재개가 실패했어

다음은 모두 실제 재개 버튼을 누르고 원래 2초 시각 전진 조건을 적용한 별도 실행이야. 표의 대기 길이는 `resumeTrace.samples` 마지막 관찰의 `elapsedMs`이며, Playwright 호출 바깥에서 잰 `nodeElapsedMs`와 구분해. 원본 작업 경로는 아래에 남겼고 각 실행의 FAIL을 유지했어.

| 실행 | 결과 | 대기 관찰·engine tick | 고정된 `audioNow` | 작업 원본 |
| --- | --- | --- | --- | --- |
| a41 기준선 Hall desktop | FAIL | 약 2,049.9ms·83회 | `71.46666666666667`초 | `qa-a41/transport-control/baseline-transport-hall-desktop.json` |
| 후보 Hall desktop, multiprocess | FAIL | 약 2,058.1ms·82회 | `61.632`초 | `qa-a41/multiprocess-functional/candidate-multiprocess-hall-desktop.json` |
| 후보 Hall desktop, native fake-output | 재개 FAIL, 후속 검사 완료 | 약 2,051.5ms·82회 | `59.690666666666665`초 | `qa-a41/fake-output-functional/candidate-fake-output-hall-desktop.json` |

세 실행 모두 trace에서 AudioContext는 `running`, 문서는 `visible`이었고, output timestamp도 대기 중 고정됐어. 기준선에서도 같은 조건이 실패했으므로 후보만의 새로운 회귀라고 단정할 근거는 없어. 멈춘 시각도 서로 달라서 정확히 60초 경계가 원인이라고 설명하지 않아.

Multiprocess 실행은 기존 Chromium 인자에서 `--single-process`, `--in-process-gpu`, disable-features의 `AudioServiceOutOfProcess`를 제거한 진단이야. 이 조건에서도 실패했으므로 `--single-process` 하나가 원인이라고 확정할 수 없어. 나머지 브라우저 인자는 그대로라 일반 PC 전체 조건을 재현했다고 보지도 않아.

Native fake-output은 `--disable-audio-output`으로 Chromium 출력 경로를 바꿨어. JavaScript의 `currentTime`을 가짜 시계로 바꾸지는 않았지만, 실제 스피커 출력 조건과는 달라. 이 실행에도 재개 실패가 남아서 출력 경로 변경으로 문제를 해결했다고 기록하지 않아. **현재 원인은 미확정이야.** 브라우저·실행 환경과 기존 앱 오디오 그래프의 상호작용 중 무엇인지 추가 근거가 필요해.

### 재개 실패 뒤의 개별 UI 검사와 시계 재진행을 구분했어

Fake-output 실행에는 `CONTINUE_ON_TRANSPORT_FAIL=1`을 사용했어. 원래 2초 재개 실패와 trace·failure state를 보존하고, 실제 UI로 다시 일시정지한 뒤 나머지 검사를 진행해. 원본의 `checks.playback.resumed=false`, `transportContinuation.subsequentChecksCompleted=true`, 최종 `status=FAIL`이 이 범위를 나타내.

후속 검사에서 수동 품질 `medium → low → high`, 관객 off/on, 중계 off/on, auto 설정 복귀를 확인했어. 품질 변경은 각 preset·scale 1·그림자 상태를 확인했고, 중계를 켰을 때 실제 broadcast pass가 다시 나타났어. 여기서 auto PASS는 설정·reset 경로만 확인한 뜻이야. 부하에 따른 자동 하향·회복의 성능 관측으로 쓰지 않아. 기록된 page error와 context loss는 없지만 재개 실패를 상쇄하지는 않아.

같은 실행의 다시 일시정지한 snapshot에서는 `audioNow=59.690666666666665`였고, 이어진 frame snapshot들은 `61.781333333333336`부터 마지막 `74.304`초까지 전진했어. 따라서 이 실행이 영구적으로 멈춘 상태였다고 단정할 수는 없어. 어느 조작이나 처리 때문에 다시 진행했는지는 이 기록만으로 분리할 수 없으므로, pause 또는 품질 변경이 원인을 해결했다고도 쓰지 않아.

### 제품이 없는 최소 그래프의 65초 시계 검사는 두 조건 모두 통과했어

앱 모듈·악보·WebGL 없이 작은 oscillator 그래프를 사용하는 [audio-clock 도구](../tools/bench/audio-clock.mjs)는 원래 프로세스 조건과 multiprocess 조건에서 각각 PASS였어. 두 실행 모두 652개 sample, 실제 오디오 시각 `65.024`초 전진, `running`·단조로운 시계·0이 아닌 신호를 기록했고 1초 이상 시계 정지는 없었어.

- 원래 조건: `qa-a41/audio-clock/audio-clock-current-clock-current.json`
- Multiprocess 조건: `qa-a41/audio-clock/audio-clock-multi-clock-multiprocess.json`

이 결과는 환경에서 최소 그래프의 시계가 65초 진행할 수 있음을 보여 줘. 실제 Hall의 여러 voice·공간 음향·pause/seek/resume 경로와 같은 검사는 아니며, 최소 그래프 PASS로 제품 재개 실패를 통과 처리하지 않아. 가청 출력·음질·실제 휴대폰 검증도 별도로 남아 있어. 진단 조건과 재현 명령은 [런타임 검증](runtime-validation.md#6-재개-실패와-브라우저-오디오-시계-분리-진단)에 정리했어.

## 18. 소수 DPR 하향 반올림을 고치고 품질 테스트만 다시 실행했어

자동 품질의 프리셋 하향을 정적으로 검토하다 소수 DPR 반례를 찾았어. DPR 1.35에서 `high`, scale 0.6의 유효 DPR는 0.81이야. medium의 상한 1.25에 맞춘 scale은 0.648인데, 이전 두 자리 반올림은 0.65로 올려서 유효 DPR가 0.8125로 조금 증가했어.

[quality.js](../public/js/quality.js)는 `reason === 'load'`인 프리셋 전환에만 scale 내림을 적용하도록 수정했어. 이 반례의 새 scale은 0.64, 유효 DPR는 0.8이야. 회복 전환의 기존 반올림 정책과 수동 preset 경로는 유지했어. 수정 전 바이트 원본은 [quality-before-dpr-floor.js](performance-data/provenance/quality-before-dpr-floor.js)에 보존했고 SHA-256은 `1fdee2938ba17e49f9816495d0363c69cf40fee42a6b38fecf3161942f5e9709`야.

[품질 테스트](../tests/quality.test.mjs)에 이 반례 한 개를 추가한 뒤, 루트 실행기가 **2026-10-21 05:21:32 UTC에 8개를 실제 재실행해 8 PASS·0 FAIL**을 기록했어. [실행 결과](performance-data/runtime/a41-quality-dpr-regression/result.json)와 [TAP 원본](performance-data/runtime/a41-quality-dpr-regression/quality.tap.log)에 실행 시각·exit code·제품과 테스트 source hash가 있어. 이것은 단위 검증이며 새 브라우저 auto 성능 측정은 아니야.

앞선 **04:59 UTC의 a41 59개 실행 원본과 TAP 9개는 그대로 보존**했어. 현재 연결한 고유 검증 범위는 그중 변경 없는 8개 테스트 파일의 52개와, 기존 품질 7개를 대체하는 새 품질 8개를 합친 **60개**야. **전체 60개를 한 번에 새로 실행했다는 뜻은 아니야.** [조합 근거](performance-data/runtime/a41-quality-dpr-regression/combined-scope.json)는 이전 59개 중 품질 7개를 교체한 계산, 두 실행의 시각, 테스트 hash, 비교한 제품 36개 중 quality.js만 달라진 사실을 남겨.

수정 시점까지 시작한 a41 렌더 표본은 수동 프리셋이었고 auto 실행은 0회였어. 자동 전환에만 해당하는 이번 변경으로 기존 수동 표본을 새로 실행한 것처럼 재라벨하지 않아. 이후 auto 실행은 수정된 제품 source hash를 따로 확인해야 해.

## 19. 42개 a41 렌더 결과를 모으는 집계 경로를 수정했어

최초 집계는 21쌍 중 2쌍만 완료됐고, 수동 19쌍에서 `Unexpected end of JSON input`이 났어. 원본 FAIL summary·CSV, 당시 수집기와 비교기·browser helper·계획은 [최초 실패 보존본](performance-data/latest-a41/qa-a41/collector-original-failure/README.md)에 남겼어. raw의 불일치나 렌더 실패라고 먼저 판단하지 않고 출력 전달 경로를 대조했어.

비교 도구는 결과 JSON을 stdout에 내보내는 CLI야. 이 환경의 중첩 `execFile(process.execPath, …)`는 단순 stdout 프로그램과 실제 비교기 모두 exit 0이면서 stdout/stderr 0바이트를 반환했어. 같은 비교기를 셸에서 직접 실행하면 정상 JSON 6,171바이트가 나왔어. 호스트 내부에서 왜 빈 출력을 돌려줬는지까지 원인을 확정하지 않았고, 파일 저장 계약을 오해한 문제로 설명하지도 않아.

QA 집계기만 바꿔 원래 비교 CLI를 Worker에서 실행하고 stdout/stderr 종료·exit·빈 출력·30초 제한을 확인하게 했어. 비교기 소스와 조건 검사는 유지했어. hall/high/desktop의 Worker 결과는 입력 파일 경로 표기 이외 모든 필드가 직접 CLI 결과와 같았고, 원시 JSON 42개와 보존본의 hash·bytes도 그대로였어. [수정·대조 기록](performance-data/latest-a41/qa-a41/collector-repair.json)에 수정 전후 수집기 hash와 범위가 있어.

재집계 결과는 [21/21 run쌍 strict PASS, 수동 61행, auto 2행, 제외 0](performance-data/latest-a41/qa-a41/summary.json)이야. **이미 완료된 42개 raw JSON을 다시 집계한 것이며 렌더·브라우저·제품을 다시 실행한 결과가 아니야.** 수동 행은 정규 sync 37, 별도 반복 sync 5, smoke sync 1, cadence 18(준비 후 중계 4 포함)이야. 61개 독립 반복 실험이나 61개 모두의 성능 개선을 뜻하지 않아. 시간 증가가 관측된 행도 원본과 보고서에 남겼어.

## 20. headed PC 측정이 숨긴 탭을 이득으로 읽지 않게 보완했어

정적 검토에서 후보 앱은 숨긴 탭의 frame을 일찍 반환하는데, 수집기가 이를 그대로 재면 calls 0과 짧은 시간을 개선으로 오해할 수 있는 경로를 찾았어. 실제 a41 raw에서 이 문제가 관측됐다는 뜻은 아니야. 당시 raw에 visibility 필드가 없으므로 모든 표본이 visible이었다고 소급 증명할 수도 없어.

42개 그래픽 수집을 마친 뒤 portable 도구만 보완했어. 각 step 시작에서 `document.hidden`이면 실패시키고, sample에 visibility를 기록하며, cadence callback의 예외를 Promise 실패로 전달해. 제품과 기존 raw는 바꾸지 않았어. [수정 이력](performance-data/provenance/visibility-guard.json)에 변경 시각 `2026-10-21T06:51:47.321578Z`, 변경 전 두 도구의 원문·SHA, 변경 후 hash와 syntax 검사 결과가 있어.

실제 수집에 사용한 [이전 fixture](performance-data/provenance/full-frame-fixture-before-visibility-guard.js)의 SHA-256은 `a4cc2b8149572e2535db99c2288b350149dd10f8bdf40888c77973fea089e5bb`야. [이전 runner](performance-data/provenance/full-frame-before-visibility-guard.mjs)도 보존했어. 이 수정 후 42개 전체 렌더를 다시 실행했다고 기록하지 않아. PC 재현에서는 창·탭을 전경에 두고 최소화·숨김·탭 전환이 생긴 실행을 제외하고 다시 측정해.

## 21. a41 정식 이미지 결과와 계산 구간을 분리했어

GPU/오디오 큐가 끝나고 유휴 상태가 된 뒤에만 이미지 계산을 실행했어. 원본 PNG는 수정하지 않고, [전 수치와 hash](performance-data/latest-a41/qa-a41/visual-review/summary.json), [수치 CSV](performance-data/latest-a41/qa-a41/visual-review/metrics.csv), [육안 판독](performance-data/latest-a41/qa-a41/visual-review/visual-findings.md)과 비교 그림을 남겼어.

수동 **61 PNG쌍 중 47쌍이 PNG 바이트/RGB 픽셀 동일**이었어. 차이가 있는 14쌍은 Sphere 돔 6쌍(forest 반복 촬영 포함)과 중계 8쌍이야. 차이가 있는 전부와 high desktop 대표 15쌍을 직접 봤고, 중복을 빼면 수동 26쌍을 판독했어. 얇은 줄기·설산 세부 픽셀과 중계 안의 손·팔·봉 주변 자세 차이를 남겼으며, 높은 SSIM을 자동 화질 합격선으로 쓰지 않았어. 보조 형상의 반올림·렌더 순서·전체 앱 상태 변화 중 하나를 단독 원인으로 확정하지 않아.

auto 2쌍은 최종 low라도 baseline scale 0.85, 후보 0.60으로 해상도가 달라. 별도로 판독하고 수동 동일 품질 결과에서 제외했어. 정지 프레임만 비교한 자료라 연속 프레임의 깜박임·실제 입력/오디오·실기기 FPS를 입증하지 않아. 이전 ec5 이미지 결과를 최신 a41 기준으로 합치거나 이름을 바꾸지 않았어.

| 이미지 계산 | UTC 시작 | UTC 종료 | 경과 |
| --- | --- | --- | ---: |
| 원본 63쌍 metric·대표/차이 그림 생성 | 2026-10-21 06:53:36.807665 | 2026-10-21 06:54:06.684783 | 29.877초 |
| 중계 확대 crop 8개 생성 | 2026-10-21 06:58:55.043419 | 2026-10-21 06:58:55.722932 | 0.680초 |

그 뒤에는 기존 이미지 열람과 JSON·문서·hash 확인만 했어. 07:03:31 UTC 최종 확인에서 raw PNG와 profile 168파일, 부모 summary의 SHA-256이 처음 분석할 때와 같았어. [프로세스 로그](performance-data/latest-a41/qa-a41/visual-review/analysis-process.jsonl)는 이미지 라이브러리 import 전부터 시작·종료를 기록해서 다른 측정과의 겹침 여부를 확인할 수 있게 했어.

## 22. 제품 코드 체크포인트와 최종 자료 게시를 구분해

사용자가 완성된 코드를 먼저 올리라고 한 요청에 따라 제품 코드·회귀 테스트 체크포인트를 PR branch `perf/261021-venue-rendering`에 게시했어. [게시 기록](performance-data/latest-a41/qa-a41/code-checkpoint.json)의 commit은 `2c6cd365fcf10b62a5e475b8eeee6ef3c8ffb614`, tree는 `1d68ca1612f7025ed076037a9ae4c65d59fa1387`이야. 부모는 기존 PR `6a640672f2211d7a7687078631d0d6a49a36026d`와 기준 main `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`이며, main ref는 바꾸지 않았어.

기록에 따르면 GitHub connector의 tree·commit 생성 뒤 expected SHA를 지정한 non-force ref 갱신을 했고, ref 재조회와 공개 원격 fetch로 확인했어. 로컬의 제품·테스트·package.json·gitignore가 게시한 HEAD와 같음을 대조했어. 그래픽 raw의 `a41-integrated-candidate`는 이 제품 코드에 연결되고, 최초 source snapshot 이후 quality.js DPR 수정은 별도 provenance로 남아 있어. [파일별 체크포인트 manifest](performance-data/latest-a41/qa-a41/code-checkpoint-manifest.json)도 보존해.

이 체크포인트는 최종 보고서·증거 자료 전체를 게시했다는 기록이 아니야. 후속 자료 커밋과 PR의 최종 상태, 최신 원격 main 및 merge 금지는 13절의 최종 담당자 확인에 남겨. 최초 commit 생성 도구 호출은 catalog가 바뀌어 준비 단계에서 거절됐다가 새 catalog로 성공한 이력이야. 권한 거절이나 실패한 push로 바꾸어 설명하지 않아.
