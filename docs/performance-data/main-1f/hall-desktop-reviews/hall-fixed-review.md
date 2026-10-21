# Hall high 첫 A/B 독립 검토

main `1f8e5f1` → 제품 `dea7997`, desktop high의 첫 반복 a 한 쌍을 검토했어. 기록된 비교 조건은 유효하지만 **SwiftShader의 sync 완료 시간이며 실제 PC FPS가 아니야.** 새 브라우저·GPU 실행 없이 완료 원본을 읽고 통계·해시·PNG를 확인했어.

## 증거와 고정 조건

- 전송 manifest에 있는 **52개 파일의 크기·SHA-256이 모두 일치**해. Hall 두 실행의 로그 해시·계획·exit 0/PASS·제품 revision도 맞아. 원본과 제품을 수정하지 않았어.
- 제품 manifest 49경로 × A/B는 고정 Git 객체와 일치해. 실제 HTTP 전후 해시는 12경로이고, CSS/index/geometry/instance-batches 등 나머지 37경로는 이 raw의 HTTP 확인 범위 밖이야.
- Chromium 153.0.8010.0, Playwright 1.64.1, Linux x64, Headless SwiftShader, local fonts. 640×360, DPR 1, 실제 high/scale 1, Lite=false가 같아.
- 관객 1,531명, 좌석 1,885개 중 관객 대상 1,879개, 특별 무대석 6개. fill 0.8/seed 417, 곡·합성 시계·카메라/FOV·장면 순서·도구 해시가 같아.
- 장면당 warmup 4회와 sync 8표본. A/B 총 128표본이 visible/awake/high/scale1/GL error0/context 유지/readPixels 완료 조건을 만족해.
- 양쪽 page/console error·실패 요청은 없고 ReadPixels stall 경고가 각각 4개야. 무계측 앱 성능과는 다르게 해석해.
- 전체 부분 집계는 28 jobs 중 유효 2/14쌍인 INCOMPLETE야. 이 문서는 Hall 한 쌍만 다루고, 진행 중인 나머지 실행을 완료로 세지 않아.

## 실제 8개 장면 수치

A→B이며 시간 변화율이 음수이면 개선이야. p95/p99는 n=8의 최대 표본 한 개야. FPS·1% Low·GPU ms는 미측정이야.

| 장면 | sync 평균 ms | 변화 | p95 ms | p95 변화 | 평균 calls | 평균 triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| front | 2212.41 → 1802.96 | -18.51% | 2335.80 → 2065.90 | -11.55% | 1714.50 → 1711.50 | 11699248.00 → 7413240.00 |
| wide | 6962.20 → 7019.99 | +0.83% | 7268.80 → 7464.30 | +2.69% | 1822.38 → 1822.38 | 11858282.25 → 11858282.25 |
| foyer | 12566.16 → 12827.98 | +2.08% | 13236.70 → 14154.50 | +6.93% | 1849.12 → 1849.12 | 11853193.75 → 11853193.75 |
| rotate | 3847.79 → 3805.25 | -1.11% | 5114.80 → 5200.40 | +1.67% | 703.12 → 743.50 | 11466992.88 → 9452091.88 |
| broadcast | 5658.14 → 5512.70 | -2.57% | 6991.00 → 6822.10 | -2.42% | 2120.12 → 1886.50 | 17458367.25 → 14488124.50 |
| broadcast-hidden | 215.79 → 214.73 | -0.49% | 232.70 → 226.20 | -2.79% | 600.00 → 600.00 | 382877.00 → 382877.00 |
| broadcast-return | 5752.21 → 5357.10 | -6.87% | 7195.60 → 6692.50 | -6.99% | 2126.75 → 1893.62 | 17460112.50 → 14501123.50 |
| effects-show | 5044.68 → 4823.94 | -4.38% | 8432.10 → 7798.10 | -7.52% | 1757.75 → 1774.75 | 11705850.00 → 9261786.00 |

front는 평균 −18.51%, triangles −36.63%로 줄고 캡처도 동일해. 중계 복귀는 평균 −6.87%, effects-show는 −4.38%야. wide는 +0.83%, foyer는 +2.08% 느려졌고 두 장면의 calls/triangles는 동일해. 작은 시간 차이는 역순 반복과 실제 GPU에서 재현성을 확인해야 해.

rotate는 평균 −1.11%지만 p95 +1.67%, calls 703.125→743.5로 +40.375(+5.74%)야. effects-show도 calls 1757.75→1774.75로 +17(+0.97%)이야. 부분 시야에서 작은 좌석 배치가 보이지 않는 인스턴스를 덜 제출하는 대신 draw를 늘릴 수 있다는 구조와 부합해. 개별 pass 측정이 없어서 변화 전체를 좌석만의 원인으로 확정하지 않아.

## CPU·메모리의 혼합 결과

| 장면 | CDP Task delta ms | CDP Script delta ms | sample heap MiB | CDP after heap MiB | textures/geometry 마지막 A→B |
| --- | ---: | ---: | ---: | ---: | --- |
| front | 17732.98 → 14487.55 | 2.70 → 23.91 | 391.01 → 368.12 | 21.61 → 22.62 | 98/1159 → 97/1143 |
| wide | 55733.50 → 56201.42 | 2.40 → 2.54 | 391.01 → 368.12 | 24.11 → 24.25 | 98/1202 → 97/1189 |
| foyer | 100558.03 → 102656.17 | 3.66 → 2.17 | 391.01 → 368.12 | 23.90 → 24.89 | 98/1211 → 97/1198 |
| rotate | 30814.16 → 30468.04 | 1.88 → 1.67 | 391.01 → 368.12 | 24.28 → 25.39 | 98/1233 → 97/1220 |
| broadcast | 45295.72 → 44131.07 | 1.71 → 1.98 | 391.01 → 368.12 | 24.46 → 25.65 | 99/1249 → 98/1236 |
| broadcast-hidden | 1738.35 → 1730.63 | 0.97 → 1.05 | 391.01 → 368.12 | 25.01 → 25.96 | 99/1249 → 98/1236 |
| broadcast-return | 46050.30 → 42883.62 | 3.99 → 1.61 | 391.01 → 368.12 | 24.99 → 26.82 | 99/1251 → 98/1238 |
| effects-show | 40401.36 → 38658.47 | 1.66 → 7.36 | 391.01 → 368.12 | 25.35 → 26.63 | 99/1269 → 98/1256 |

sample performance.memory는 모든 장면에서 391.006→368.118 MiB로 낮지만 CDP 종료 heap은 모두 높아. front 후보의 CDP heap은 수집 전 44.044→수집 후 22.621 MiB로 변해서 수집 시점/GC 영향도 있어. 두 API의 차이를 geometry·GPU 크기로 환산하거나 총 메모리 절감·누수로 확정하지 않아.

TaskDuration은 동기 드라이버 대기를 포함할 수 있어 CPU 점유율 감소를 뜻하지 않아. front ScriptDuration은 2.696→23.913 ms, ThreadTime은 173.406→194.010 ms로 늘었고 submit 평균도 18.2→18.5875 ms야. CPU 항목 모두가 개선됐다고 할 수 없어. 단계별 시간·6개 CDP delta·각 표본은 JSON에 보존했어.

## PNG 8쌍과 중계 차이

| 장면 | 파일 SHA 동일 | 다른 픽셀 | MAE | RMSE | 7×7 uniform SSIM |
| --- | --- | ---: | ---: | ---: | ---: |
| front | 예 | 0 (0.000000%) | 0.00000000 | 0.00000000 | 1.000000000 |
| wide | 예 | 0 (0.000000%) | 0.00000000 | 0.00000000 | 1.000000000 |
| foyer | 예 | 0 (0.000000%) | 0.00000000 | 0.00000000 | 1.000000000 |
| rotate | 예 | 0 (0.000000%) | 0.00000000 | 0.00000000 | 1.000000000 |
| broadcast | 아니오 | 140 (0.060764%) | 0.03571759 | 1.93786735 | 0.999167925 |
| broadcast-hidden | 예 | 0 (0.000000%) | 0.00000000 | 0.00000000 | 1.000000000 |
| broadcast-return | 아니오 | 141 (0.061198%) | 0.03602575 | 1.96844133 | 0.999169408 |
| effects-show | 예 | 0 (0.000000%) | 0.00000000 | 0.00000000 | 1.000000000 |

front/wide/foyer/rotate/broadcast-hidden/effects-show는 파일 SHA까지 같아. 각 원본을 육안 확인했으며 이 캡처에서 좌석·관객·무대·발코니·효과의 전후 누락은 관찰되지 않았어. 회전 전체 프레임이나 다른 해상도까지 검증한 것은 아니야.

broadcast와 broadcast-return은 각각 140/141픽셀만 다르고 모든 차이가 **x=272..333, y=117..124**에 있어. 중계 화면 하단의 자막 영역과 겹치는 작은 사각형이며 바깥은 픽셀 동일해. 최대 채널 차이는 210/207이므로 작은 비율이어도 단순한 1단계 색 차이라고 단정하지 않아. 두 원본에서 전체 구도·좌석·무대의 큰 품질 저하는 관찰되지 않았지만 **두 PNG를 동일하다고 표시하지 않아.**

양쪽 visible/return의 sample calls는 홀수/짝수 단계에서 번갈아 커지고 마지막 표본에도 중계 update 경과 시간이 있어. high의 2-frame cadence 코드와 함께 마지막 측정 프레임에서 중계를 갱신한 것으로 추론할 수 있지만, raw에는 보조 카메라 pose·실제 pass ID·font readiness가 없어. `times.broadcast`는 메서드 경과 시간이며 직접 패스 카운터가 아니야.

최신 main과 후보 모두 hidden에서 every=0으로 중계 시간은 진행해. 과거 6a의 hidden clock 정지 원인을 이번 결과에 적용하면 안 돼. 후보의 정확한 자막 cache·폰트 loadingdone 무효화·즉시 갱신이 코드상 차이지만, 어느 것이 이 픽셀 차이를 만들었는지는 미확정이야. 기준선 stale feed/폰트나 후보 정확성을 확정하는 증거로 쓰지 않아.

## 정적 설명과 미검증 범위

앞쪽 시점의 triangles 감소는 좌석 공간 배치 컬링, 중계의 calls 감소는 프레임당 그림자 한 번 갱신과 카메라별 좌석 배치 선택에 부합해. 코드 근거에 따른 원인 후보이며 단독 변인 실험은 아니야. wide/foyer의 비용이 줄지 않은 결과도 그대로 남겼어.

한 쌍의 통제된 소프트웨어 렌더 결과야. 실제 60/30FPS, 물리 GPU·스마트폰, 자동 품질/회복, 장시간 열·메모리, 실제 음표·청감·좌석 UI·멀티플레이, 초기 로딩은 이 검토에서 미측정이야.

파일 기반 이미지 비교의 exec_command 기록은 chunk_id d5c0fa, exit 0, 경과 시간 2.294485258초야. 정확한 UTC 시작·종료는 기록하지 않았어. 순서와 파일 시각으로 보수적으로 확인할 수 있는 범위는 **2026-10-21 12:51:33.200617~13:01:38.633506 UTC**이고, Hall 첫 결과 메시지 직전 호출이야. 검토 대상 first high 실행은 이보다 앞서 완료됐지만, 당시 다른 fixed-render 작업이 진행 중이어서 그 작업에 대한 배경 CPU 부하 가능성은 남아. 프레임별 겹침은 확인할 수 없고 결과를 본 뒤 유리한 행만 제외하지 않아. 이후에는 저장된 이미지 수치만 재사용했으며 새 브라우저/GPU나 추가 SSIM을 실행하지 않았어.

## 근거

- [독립 재계산·해시·조건·제한 JSON](hall-fixed-review.json)
- [전송 manifest](../fixed/transfer-render-plan-0-4.json)
- [기준선 raw](../fixed/render/baseline-a-full-hall-high-desktop-sync.json) / [후보 raw](../fixed/render/candidate-a-full-hall-high-desktop-sync.json)
- [기존 부분 집계](../analysis-first-high/summary.json). Hall 8행이 독립 재계산과 일치해.
- [candidate public/js/scene/seats.js](https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/seats.js): Spatial fine batches, per-camera coarse fallback; partial views can add draws while culling unseen instances.
- [candidate public/js/main.js](https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/main.js): One shadow refresh per app frame; hidden screen every=0; musician sync before both cameras.
- [baseline public/js/main.js](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/main.js): Latest main also advances hidden-screen clock; the old 6a freeze explanation does not apply.
- [candidate public/js/scene/screen.js](https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/screen.js): Exact caption cache, font loadingdone invalidation and visible refresh differ, but raw does not isolate a pixel-difference cause.
- [baseline public/js/scene/screen.js](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/screen.js): Quantized caption cache; wall-clock caption age and font readiness are not recorded independently.
- [collector tools/bench/full-frame-fixture.js](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/full-frame-fixture.js): Controlled camera/time/seed and disabled note scheduler; sync frame+readPixels.
- [collector tools/bench/compare-images.py](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/compare-images.py): Read-only 8-bit RGB comparison; no resizing/alignment; uniform 7x7 SSIM.

파일/조건/재계산 체크 936개 중 실패 0개야. 이 수는 브라우저 기능 테스트 개수와 합산하지 않아.
