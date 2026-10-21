# 새 main 1f 기능 검사의 오디오 재개 trace 독립 검토

**Hall·Sphere desktop의 2초 오디오 진행 검사는 실제로 실패했어. 뒤이어 나온 오래된 화질 기대값 오류만으로 전체 FAIL을 설명하거나 지우면 안 돼. 이 자료는 원인이 제품인지, headless 오디오 환경인지, 그래픽스/readPixels 상호작용인지까지 확정하지 못해.**

이 문서는 종료된 job 4–7의 원본과 해시로 일치하는 복사본을 읽은 분석이야. 새 브라우저·오디오 실험은 실행하지 않았고 제품·수집기·원시 결과도 수정하지 않았어. 새 desktop 재검사, baseline 1f의 같은 조건 실행, native rAF 30초 검사와 실물 출력 청취는 이 보고서에 포함하지 않았어.

## 상태와 수치

제품은 네 건 모두 **dea7997c6278f10ff467815ab96b370362549b0c**야. Linux x64 / headless Chromium 153.0.8010.0 / Playwright 1.64.1 / FONT_MODE=local이며 softwareRequested=true, --use-angle=swiftshader가 기록돼. 실제 GL renderer 문자열은 이 수집기에 없어.

| job·조합 | 전체 결과 | 재개 조건 | Node 진단 경과(ms) | 재개 후 표본 구간(ms) | AudioContext.currentTime(s) | 관찰 onTick 수 | sample rate(Hz) |
|---|---|---|---:|---:|---|---|---:|
| 4 · hall-desktop | FAIL | failed | 2052.248 | 2013.600 | 85.184000000 → 85.184000000 | 2 → 83 | 48000 |
| 5 · hall-mobile | PASS | passed | 308.191 | 246.600 | 22.805333333 → 23.040000000 | 3 → 13 | 24000 |
| 6 · sphere-desktop | FAIL | failed | 2047.761 | 2009.900 | 39.253333333 → 39.253333333 | 2 → 83 | 48000 |
| 7 · sphere-mobile | PASS | passed | 343.963 | 267.200 | 19.669333333 → 19.930666667 | 4 → 15 | 24000 |

Node 진단 경과는 클릭·검사·실패 상태 수집 등을 포함한 수집기 경과 시간이야. 원래 진행 조건의 제한은 네 건 모두 2000ms야. “재개 후 표본 구간”은 after-resume-click 표본부터 final 표본까지 performance.now 차이로 독립 계산했어. FPS나 음성 출력 latency 지표가 아니야.

### 데스크톱에서 확인한 관찰

- 두 실행 모두 전체 trace 23개 중 재개 후 22개 표본에서 AudioContext.state=running, document.visibilityState=visible이 유지돼. statechange/visibilitychange 기록은 없어.
- Hall은 **2013.600ms** 동안 currentTime=85.184, getOutputTimestamp().contextTime=85.1258916667, performanceTime=86976.6000000015가 고정됐어. 음악 시각도 21.7946650656, 예약 event index도 504로 같아. onTick은 2→83, 즉 **81회** 진행했어.
- Sphere는 **2009.900ms** 동안 currentTime=39.2533333333, output contextTime=39.175348, performanceTime=40992.8999999985가 고정됐어. 음악 시각은 21.7946654552, 예약 index는 283으로 같고 onTick도 **81회** 진행했어.
- 수집기의 100ms 표본 간 최대 간격은 Hall 101.000ms, Sphere 100.800ms였어. JS observer와 tick callback 진행은 확인되지만, 이것이 오디오 그래프나 물리 출력의 진행을 증명하지는 않아.
- **같은 audioNow가 이미 show-started → paused → before-resume snapshot에도 나타나.** show-started부터 final 표본까지 Hall 2286.800ms, Sphere 2330.300ms야. 따라서 resume가 정지를 처음 일으켰다고 특정할 수 없어.
- 후속 명시적 frame에서는 audioNow가 증가해. Hall의 quality-medium frame은 87.2746666667, Sphere의 world-transition은 40.7466666667을 기록해. 하지만 그 사이 재일시정지·화질·곡 전환 등의 조작이 있고, 같은 재개 조건을 다시 통과한 게 아니야. 회복 원인이나 제품 해결 증거로 쓰지 않아.

재개 직후 음악 시각이 약 22초에서 21.7947초로 보이는 것은 수집기 주석에도 명시된 120ms 사전 예약과 출력 latency 보정이 포함된 값이야. 여기서 문제로 보존하는 것은 그 초기 차이 자체가 아니라, 원래 2초 조건 내에서 음악 시각과 AudioContext 시계가 진행하지 않은 관찰이야.

### 두 번째 실패는 별도 항목이야

| 조합 | 첫 실패 | 두 번째 실패 | 소스 확인 |
|---|---|---|---|
| Hall desktop | transport-resume: Timeout 2000ms | medium DPR 0.85 !== 1 | 수집기 4583ac3의 예전 기대식은 ×0.85가 없어. 제품 dea의 medium 식은 ×0.85이며 실제값과 일치해. |
| Sphere desktop | transport-resume: Timeout 2000ms | auto preset medium !== high | 수집기 983c1a0는 auto 복귀를 수동 초기값 high와 같다고 기대해. 제품의 소프트웨어 렌더러 분류 경로는 medium을 시작값으로 쓰고 raw frame도 medium을 기록해. |

Hall desktop은 collector **4583ac3b0118412c2c86eaa52b252a03df9605f3ad039f9df38a70da6ac31921**, 나머지 세 실행은 **983c1a0e9489ef56d2115fe79a626039d32f09be771aef9a573875928d7f2807**을 썼어. 두 정확한 snapshot의 바이트를 확인했어. 후자의 수동 DPR 기대식은 이미 수정됐지만 auto 기대식은 예전 방식이야. 두 버전의 결과를 동일 수집기 실행이라고 적지 않아.

CONTINUE_ON_TRANSPORT_FAIL=1은 첫 실패를 원본 failures에 남긴 뒤 실제 일시정지 버튼으로 멈추고 후속 컨트롤을 진단하는 옵션이야. 전체 결과는 FAIL로 남아 있고, trace나 제한 시간을 바꾸지 않았어. 후속 collector 재검사가 통과하더라도 이 원본 실패는 따로 보존해야 해.

## Mobile PASS의 범위

Hall mobile과 Sphere mobile은 짧은 재개 조건을 각각 약 308ms, 344ms Node 진단 경과 내에 통과했어. 실제 audioNow·output timestamp·음악 시각과 예약 index도 전진했어. 원본 full suite 상태는 두 건 모두 PASS야.

다만 desktop은 초기 high / 48000Hz / 관객 Hall 1106·Sphere 12935, mobile은 초기 low / 24000Hz / 관객 Hall 200·Sphere 2500이야. viewport와 DPR도 다르고 도구 버전도 위처럼 달라. 이 차이 때문에 mobile 성공을 desktop 실패 원인의 대조 실험으로 볼 수 없어. 실물 스마트폰 검사도 아니야. 원본의 unchecked 배열이 비어 있어도 청취·장시간·다중 브라우저 검증까지 끝났다는 뜻은 아니야.

## 진단 방식과 경계

앱의 main rAF를 잡아 둔 상태에서 요청한 frame을 명시적으로 렌더하고 readPixels로 완료를 기다리는 기능 검사야. 좌석 옆 배치, 카메라 tween 완료, 연주자 roster/지휘자 입장 완료를 위한 fixture도 사용해. **상시 native rAF와 실제 음악이 함께 도는 성능 검사가 아니야.**

재개 대기 중에는 수동 frame을 추가하지 않고 실제 AudioContext 시계를 바꾸지 않아. 100ms wall-clock 표본, state/visibility listener와 읽기용 engine.onTick observer만 추가해. 원본 deadline은 2초로 유지해. desktop 경고에는 GPU stall due to ReadPixels가 있지만, 이 경고만으로 audio freeze 원인을 확정할 수 없어.

오디오 late-note 수·음표 순서 hash·실제 출력 파형·글리치·음질·공간감·A/V 동기화는 이 trace에 없어. 예약 index가 같은 것도 정확한 유실 음표 수를 뜻하지 않아. baseline/candidate를 같은 preset·sample rate·곡·관객·카메라·readback 정책으로 재비교하고, native rAF 및 실제 출력 검사를 별도 증거로 평가해야 해.

새 dome-visible observer는 Sphere 두 실행에서 before/after 모두 true를 관찰했고 Hall은 NOT_APPLICABLE이야. 이는 UI-ready 뒤 mesh.visible을 읽은 사실만 증명해. 컴파일 성공·첫 픽셀 준비·프레임 시간 개선을 증명하지 않아.

## 제품 소스 대조

baseline **1f8e5f16f1eee03140e13ba1ee66832841559604**와 제품 dea의 engine.js / performance.js 전체 바이트는 같지 않아. 확인한 diff에서 engine은 listener/거리 캐시·박수 준비, performance는 시각 chair 배열 갱신이 바뀌었어. play/pause/seek/음표 예약 부분의 diff는 없었어. 이는 정적 변경 범위 관찰이며 주변 변경이나 환경의 영향까지 배제하는 런타임 증명은 아니야.

## 원본 보존과 검토 재현

완료 wrapper·stdout·raw·summary와 desktop failure PNG 2개, 총 runtime 파일 18개를 원래 /tmp 경로와 비교해 바이트 일치를 확인했어. failure PNG는 terminal assertion 뒤의 캡처이며 audio freeze 순간을 직접 보여 주는 자료로 사용하지 않았어. 원시 상태·로그·summary는 각각 PASS 또는 FAIL 그대로야.

수집된 제품 소스 12개는 네 실행 모두 제품 커밋과 같아. 이 수집기에는 종료 뒤 source snapshot이 없으므로 전후 불변이나 전체 의존 파일까지 검증했다고 적지 않아. JSON 보고서에 파일별 SHA·경로·통계 계산값·첫/마지막 표본·각 실행 설정과 정확한 도구 snapshot 경로를 남겼어.

| raw 결과 | SHA-256 |
|---|---|
| [main1f-functional-hall-desktop-hall-desktop.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/functional/main1f-functional-hall-desktop-hall-desktop.json) | a620d6875a3f44ed45d317e4339dbdfb5a277dad28baeb7199b399d0cb52c44b |
| [main1f-functional-hall-mobile-hall-mobile.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/functional/main1f-functional-hall-mobile-hall-mobile.json) | d7babf76540427796b3c0af1c4602028a1d2c7615921d1f287187270a9ab6244 |
| [main1f-functional-sphere-desktop-sphere-desktop.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/functional/main1f-functional-sphere-desktop-sphere-desktop.json) | 24c3360b0284daf46e79b1754be1b3ce241e69ac5e7b9f3239f520fb923db7b9 |
| [main1f-functional-sphere-mobile-sphere-mobile.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/functional/main1f-functional-sphere-mobile-sphere-mobile.json) | 0955d54167892141b8994271b9ba00e846160198d5708fd7da5fc69259ac04ee |

재현 분석은 완료 metadata 확인 → 로그 SHA·원본/복사본 대조 → after-resume-click부터 final까지 변화량 계산 → show-started/paused/before-resume 비교 → 정확한 수집기 snapshot의 원래 assertion 확인 → 제품 12개 source hash 및 audio diff 확인 → 소비한 파일 재해시 순서야. 이 검토는 새 실행이나 재검사 결과를 추가하지 않았어.
