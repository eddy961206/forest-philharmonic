# main 1f — mobile high 012–015 독립 수치 검토

**닫힌 Hall/Sphere A/B 두 쌍만 검토했어. 기록된 조건과 소스·산술 검사는 일치하지만 성능은 혼합적이야.** Hall은 8행 중 6행, Sphere는 12행 중 6행에서 평균 완료시간이 증가했어. 실제 스마트폰 FPS나 실시간 3D 세계 성능 개선을 입증한 결과로 쓰면 안 돼.

검토 시점: 2026-10-21T13:41:37.031095+00:00. JSON·텍스트 로그 읽기, 산술, SHA-256 대조만 수행했어. 브라우저/GPU 실행, 이미지 열기·디코딩·SSIM, 원본 변경은 없었어. medium/low 결과는 포함하지 않았어.

## 1. 대상·종료·버전

| Job | 대상 | 종료 | UTC 실행 구간 |
| --- | --- | --- | --- |
| 012 | hall / baseline | wrapper PASS·raw PASS·exit 0 | 2026-10-21T13:19:28.682221+00:00 → 2026-10-21T13:21:26.362779+00:00 |
| 013 | hall / candidate | wrapper PASS·raw PASS·exit 0 | 2026-10-21T13:21:26.363520+00:00 → 2026-10-21T13:23:29.124219+00:00 |
| 014 | sphere / baseline | wrapper PASS·raw PASS·exit 0 | 2026-10-21T13:23:29.125059+00:00 → 2026-10-21T13:26:15.618082+00:00 |
| 015 | sphere / candidate | wrapper PASS·raw PASS·exit 0 | 2026-10-21T13:26:15.618688+00:00 → 2026-10-21T13:29:07.660862+00:00 |

- baseline: `1f8e5f16f1eee03140e13ba1ee66832841559604`; candidate: `dea7997c6278f10ff467815ab96b370362549b0c`.
- 순서는 Hall baseline→candidate, Sphere baseline→candidate이고 variant별 독립 실행은 한 번이야. 시나리오마다 warmup 4회 뒤 측정 8회야. 총 20개 비교행·320개 측정 sample을 검토했어.
- wrapper의 job 정의가 plan 012–015와 같고 plan SHA·collector SHA·종료 로그 SHA가 맞았어. 각 raw의 응답 소스 12개가 manifest와 일치했어. baseline quality.js는 manifest에 없는 파일이고 raw에도 의도된 404가 기록돼 있어. 나머지 응답 hash와 실행 전후 source catalog는 모두 일치했어.

| 고정 자료 | SHA-256 |
| --- | --- |
| render-plan.json | `6259727537dbd446e56ef3e5fa23b41c847fecd3c17a2a0cc28aa79ff40d8dc1` |
| source-manifest.json | `d28ee8fae2fd8ff836d82855e7b84b749c905cdeb5740d8ed72e562c6730c84d` |
| full-frame.mjs | `2bf556b443cd64df6b4d743ec45e11dc382e6a9014083054472ddb39919d37c9` |
| full-frame-fixture.js | `262b5f126c6214d1875010056da4327117af2c764dab8d04854dc4b709871d98` |
| browser.mjs | `90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9` |

## 2. 비교 조건과 증거 한계

| 항목 | 전후 관측값 / 확인 범위 |
| --- | --- |
| 환경 | Linux x64, Chromium 153.0.8010.0, Playwright 1.64.1, headless, ANGLE SwiftShader, local font. Pixel 7 UA 에뮬레이션이며 물리 기기 검증이 아님 |
| 화면 | viewport 390×844; 브라우저 DPR 2; **renderer pixelRatio 1.5**; high; renderScale 1. metadata 전후 같음 |
| 경량 경로 | **Hall/Sphere 모두 LITE=true**. 기존 mobile Lite 경로의 high 설정 비교야 |
| 관객 | Hall 200명 / 1,885석(eligible 1,879, recital 6), Sphere **2,500명** / 13,851석(eligible 13,845, recital 6). 전후 같음 |
| 재현 정책 | crowdFill 0.8, crowdSeed/randomSeed 417, uuidSeed 874; 동일 fixture hash. 점유 좌석 목록/해시는 raw에 없어 개별 점유까지 독립 확인하지 못했어 |
| 카메라·공연 | 20행의 setup camera 위치/target/FOV 64, 음악 시점, world, 중계·효과 flags 전후 같음. sample별 실제 pose는 raw에 없고 공통 fixture/순서가 보조 근거야 |
| 음악 fixture | beethoven-ode-to-joy; 보통 25s, 중계 5s; step마다 1/60s 진행. 실제 엔진 생성 후 note scheduler를 끈 synthetic 공연 시계라 음질/실제 재생 검증이 아님 |
| sample 상태 | 320개 모두 완료·high·scale 1·visible·awake·glError 0·contextLost false. page/console error 및 failed request 목록은 비어 있음 |
| shader 준비 | Sphere 24개 시나리오 기록 모두 warmup VERIFIED; 필요한 main-camera draw와 program ready/link 확인. KHR_parallel_shader_compile 미지원 경고는 네 실행 모두 남아 있음 |
| 시각 품질 | PNG를 열지 않았고 SSIM도 계산하지 않았어. 준비상태/동일 조건 기록은 시각적 동등성 통과를 뜻하지 않아 |

## 3. 지표 읽는 방법

- 시간은 **controlled frame() + 동기 readPixels 완료시간(ms)**이야. 실제 native FPS나 순수 GPU 시간으로 바꾸지 않았어. GPU timer 지원 bool과 GPU 시간 측정은 별개야.
- B→C는 baseline→candidate, Δ%는 `(candidate/baseline−1)×100`이야. 시간·calls·triangles·heap에서 양수는 증가야. 모든 mean/p95/calls/triangles를 sample에서 재계산해 raw 요약 및 로그와 대조했어.
- p95는 이 8개 표본에서 최대 표본과 같았어. 1회 실행의 작은 표본이라 꼬리 지연 안정성이나 확정된 제품 회귀로 일반화하지 않아. 악화 관측값은 그대로 남겨.
- ThreadTime은 각 시나리오 **8표본 수집 구간**의 before/after 차이(ms)야. renderer 메인 스레드 CPU 시간이며 QA 비용 포함이야. 프레임당 수치·전체 client CPU·TaskDuration과 혼동하지 않아. 공식 정의는 같은 디렉터리의 `cdp-metrics-source-review.md`를 참고해.
- heap은 sample의 JS heap 관측값이고 MB=1,000,000 bytes야. 실행별로 일정한 큰 단위 값이라 GC/버킷 영향을 분리하지 못해. 지속 메모리 절감·GPU 메모리·RSS로 해석하지 않아.

## 4. 숲속 홀 전체 비교행

| 시나리오 | 실제 world | mean ms B→C | Δ% | p95 ms B→C | Δ% | 구간 ThreadTime ms B→C | Δ% |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| front | 해당 없음 | 838.487 → 809.450 | -3.46% | 900.900 → 942.500 | +4.62% | 85.451 → 88.631 | +3.72% |
| wide | 해당 없음 | 1181.838 → 1274.625 | +7.85% | 1248.300 → 1390.500 | +11.39% | 92.179 → 111.342 | +20.79% |
| foyer | 해당 없음 | 987.050 → 1222.675 | +23.87% | 1046.000 → 1423.200 | +36.06% | 76.758 → 89.454 | +16.54% |
| rotate | 해당 없음 | 900.275 → 929.537 | +3.25% | 1363.800 → 1376.800 | +0.95% | 66.439 → 67.830 | +2.09% |
| broadcast | 해당 없음 | 1140.000 → 1138.713 | -0.11% | 1296.300 → 1254.900 | -3.19% | 92.946 → 105.171 | +13.15% |
| broadcast-hidden | 해당 없음 | 462.287 → 470.588 | +1.80% | 481.300 → 500.500 | +3.99% | 50.410 → 56.613 | +12.31% |
| broadcast-return | 해당 없음 | 1143.463 → 1178.388 | +3.05% | 1324.500 → 1319.300 | -0.39% | 83.237 → 104.526 | +25.58% |
| effects-show | 해당 없음 | 1401.687 → 1409.050 | +0.53% | 3268.600 → 3225.400 | -1.32% | 112.553 → 127.514 | +13.29% |

| 시나리오 | 평균 calls B→C | Δ% | 평균 triangles B→C | Δ% |
| --- | ---: | ---: | ---: | ---: |
| front | 537.875 → 540.875 | +0.56% | 687,152.750 → 591,764.750 | -13.88% |
| wide | 671.625 → 707.625 | +5.36% | 874,085.250 → 864,917.250 | -1.05% |
| foyer | 650.375 → 650.375 | +0.00% | 546,843.750 → 546,843.750 | +0.00% |
| rotate | 299.250 → 319.625 | +6.81% | 624,897.750 → 549,794.250 | -12.02% |
| broadcast | 815.750 → 743.875 | -8.81% | 1,074,246.250 → 935,453.500 | -12.92% |
| broadcast-hidden | 261.000 → 261.000 | +0.00% | 273,751.000 → 273,751.000 | +0.00% |
| broadcast-return | 816.000 → 744.000 | -8.82% | 1,072,244.500 → 933,451.500 | -12.94% |
| effects-show | 644.000 → 659.000 | +2.33% | 720,429.000 → 653,757.000 | -9.25% |

JS heap은 모든 행에서 **157.000 → 139.000 MB (-11.46%)**로 관측됐어. geometry/texture 개수 범위는 요약 JSON에 보존했고 GPU 메모리 bytes는 미측정이야.

**악화와 개선을 함께 보면:** mean은 front·broadcast 2행만 낮아지고 6행은 높아졌어. p95는 5행 증가했고 구간 ThreadTime은 8행 모두 증가했어. foyer는 calls/triangles가 같은데 mean +23.87%, p95 +36.06%야. wide는 mean +7.85%, calls +5.36%, ThreadTime +20.79%야. 방송 draw call은 약 8.8%, triangles는 약 12.9% 낮아졌지만 broadcast mean은 −0.11%에 그쳤고 broadcast-return mean은 +3.05%였어. draw 감소를 전체 실행시간 개선으로 대신 표현할 수 없어.

## 5. 스피어 전체 비교행

| 시나리오 | 실제 world | mean ms B→C | Δ% | p95 ms B→C | Δ% | 구간 ThreadTime ms B→C | Δ% |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| front | ARCH | 754.087 → 712.613 | -5.50% | 794.300 → 738.000 | -7.09% | 80.664 → 74.673 | -7.43% |
| wide | ARCH | 1768.025 → 1615.675 | -8.62% | 2147.100 → 1701.400 | -20.76% | 160.260 → 122.575 | -23.51% |
| rotate | ARCH | 1227.212 → 1177.987 | -4.01% | 1457.400 → 1400.800 | -3.88% | 66.306 → 64.668 | -2.47% |
| dome | AURORA | 692.462 → 722.212 | +4.30% | 751.200 → 830.200 | +10.52% | 60.597 → 68.033 | +12.27% |
| forest | FOREST | 878.262 → 910.400 | +3.66% | 907.000 → 1085.300 | +19.66% | 86.465 → 79.180 | -8.43% |
| peaks | AURORA | 900.212 → 1108.438 | +23.13% | 929.500 → 1643.400 | +76.80% | 76.005 → 115.503 | +51.97% |
| ocean | OCEAN | 913.638 → 1163.025 | +27.30% | 969.600 → 1375.300 | +41.84% | 85.792 → 83.483 | -2.69% |
| clouds | SUNSET | 909.088 → 946.212 | +4.08% | 1041.700 → 1110.600 | +6.61% | 94.121 → 77.687 | -17.46% |
| crossfade | AURORA | 1116.325 → 1107.100 | -0.83% | 1288.900 → 1232.000 | -4.41% | 86.242 → 94.537 | +9.62% |
| reveal | FOREST | 1105.975 → 1042.812 | -5.71% | 1284.200 → 1128.800 | -12.10% | 78.636 → 74.505 | -5.25% |
| broadcast | ARCH | 1006.000 → 969.200 | -3.66% | 1172.000 → 1090.200 | -6.98% | 100.182 → 91.711 | -8.46% |
| effects-show | ARCH | 1338.100 → 1467.400 | +9.66% | 3555.500 → 3761.500 | +5.79% | 139.957 → 160.038 | +14.35% |

| 시나리오 | 평균 calls B→C | Δ% | 평균 triangles B→C | Δ% |
| --- | ---: | ---: | ---: | ---: |
| front | 516.500 → 516.500 | +0.00% | 473,895.000 → 473,895.000 | +0.00% |
| wide | 635.625 → 635.625 | +0.00% | 823,583.250 → 823,583.250 | +0.00% |
| rotate | 294.625 → 294.625 | +0.00% | 735,660.250 → 735,660.250 | +0.00% |
| dome | 276.000 → 276.000 | +0.00% | 506,760.000 → 506,760.000 | +0.00% |
| forest | 628.000 → 628.000 | +0.00% | 762,671.000 → 762,671.000 | +0.00% |
| peaks | 628.000 → 628.000 | +0.00% | 762,685.000 → 762,685.000 | +0.00% |
| ocean | 628.000 → 628.000 | +0.00% | 762,580.000 → 762,580.000 | +0.00% |
| clouds | 628.000 → 628.000 | +0.00% | 762,601.000 → 762,601.000 | +0.00% |
| crossfade | 629.000 → 629.000 | +0.00% | 774,849.000 → 774,849.000 | +0.00% |
| reveal | 629.000 → 629.000 | +0.00% | 774,786.000 → 774,786.000 | +0.00% |
| broadcast | 794.500 → 686.500 | -13.59% | 1,179,567.000 → 1,116,314.000 | -5.36% |
| effects-show | 645.000 → 645.000 | +0.00% | 767,055.000 → 767,055.000 | +0.00% |

JS heap은 모든 행에서 **199.000 → 157.000 MB (-21.11%)**로 관측됐어. geometry/texture 개수 범위는 요약 JSON에 보존했고 GPU 메모리 bytes는 미측정이야.

**악화와 개선을 함께 보면:** mean은 6행 감소·6행 증가야. dome·forest·peaks·ocean·clouds·effects-show가 악화됐어. 실제 AURORA인 peaks는 mean +23.13%, p95 +76.80%, ThreadTime +51.97%; 실제 OCEAN은 mean +27.30%, p95 +41.84%야. wide는 mean −8.62%, p95 −20.76%였어. broadcast는 calls −13.59%, triangles −5.36%, mean −3.66%였고 그 외 11행의 calls/triangles는 전후 같았어. ThreadTime은 8행 감소·4행 증가했고 crossfade는 mean이 낮아져도 ThreadTime은 +9.62%였어.

## 6. Sphere 이름과 실제 world를 구분하기

| 시나리오 이름 | 실제 기록된 world | 이 결과의 범위 |
| --- | --- | --- |
| front / wide / rotate / broadcast / effects-show | ARCH | 기본 Lite 돔 |
| dome | AURORA | Lite 셰이더 돔 |
| forest | FOREST | FOREST_3D 실시간 큐브맵 검증으로 취급하지 않음 |
| peaks | AURORA | PEAKS_3D 이름으로 보고하지 않음 |
| ocean | OCEAN | 기록된 Lite world |
| clouds | SUNSET | CLOUDS_3D 이름으로 보고하지 않음 |
| crossfade | AURORA | warmup mix 0.5022197530864201, reveal 0; two-pass |
| reveal | FOREST | warmup mix 0.5022197530864201, reveal 1; two-pass |

전후 모든 Sphere 행의 기록 경로는 two-pass이고 LITE=true야. crossfade/reveal의 base·overlay는 각각 warmup main-camera draw 4회와 ready/link가 확인됐어. CPU 계측 worlds는 baseline 모든 행 0ms, candidate crossfade만 0.012500000186264515ms이고 나머지는 0ms야. 이 작은 항목의 값만으로 실시간 3D 실행 여부를 추론하지 않아. 실제 LITE/world 기록에 따라 이 묶음을 큐브맵 면 갱신·실시간 3D 세계·3D→3D 전환 최적화의 증거로 사용하지 않아. 준비상태만으로 픽셀 내용이 같다고도 결론 내리지 않아.

## 7. 출처 파일과 SHA-256

읽은 원본/계획/도구의 전체 경로를 남겼어. raw 전체나 모든 sample을 이 검토에 다시 복사하지 않았어. 소스 응답 catalog는 원본 JSON에서 전후 대조했고 검토 종료 시 입력 파일 해시가 그대로인지 다시 확인했어.

| 출처 파일 전체 경로 | bytes | SHA-256 |
| --- | ---: | --- |
| `/workspace/scratch/296fafc0af7f/verification/main-1f/render-plan.json` | 15227 | `6259727537dbd446e56ef3e5fa23b41c847fecd3c17a2a0cc28aa79ff40d8dc1` |
| `/workspace/scratch/296fafc0af7f/verification/main-1f/source-manifest.json` | 11847 | `d28ee8fae2fd8ff836d82855e7b84b749c905cdeb5740d8ed72e562c6730c84d` |
| `/workspace/scratch/296fafc0af7f/forest-philharmonic/tools/bench/full-frame.mjs` | 13760 | `2bf556b443cd64df6b4d743ec45e11dc382e6a9014083054472ddb39919d37c9` |
| `/workspace/scratch/296fafc0af7f/forest-philharmonic/tools/bench/full-frame-fixture.js` | 12135 | `262b5f126c6214d1875010056da4327117af2c764dab8d04854dc4b709871d98` |
| `/workspace/scratch/296fafc0af7f/forest-philharmonic/tools/bench/browser.mjs` | 9075 | `90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9` |
| `/tmp/forest-qa-1etnu01q/logs/012-baseline-a-hall-high-mobile.json` | 1217 | `36a74b3ca5aba3caee8f6eb2d4280372d1ffafbdc3a7d99b97f55b022e31a8c1` |
| `/tmp/forest-qa-1etnu01q/logs/012-baseline-a-hall-high-mobile.log` | 2814 | `ed6371dd308faed4b1438ff3b517ed86d52d440486904c8cd250101b42bc1592` |
| `/tmp/forest-qa-1etnu01q/render/baseline-a-full-hall-high-mobile-sync.json` | 127315 | `5ceb86e197a6bc25c55c4e9423cca2cf207d4da6d06b6dd5053d1e6735ba77c3` |
| `/tmp/forest-qa-1etnu01q/logs/013-candidate-a-hall-high-mobile.json` | 1220 | `df1c188fbcba5a28d791223e907baa652751888a063ea62d5871b3b17711772d` |
| `/tmp/forest-qa-1etnu01q/logs/013-candidate-a-hall-high-mobile.log` | 2830 | `8b090f672044b41fe5fbf713477a771e957cad0a6fe9ccefcb64954941e9bc1e` |
| `/tmp/forest-qa-1etnu01q/render/candidate-a-full-hall-high-mobile-sync.json` | 127335 | `40e87139ac45553a43e9322381ce52f5b6d62d22f715c845d4644d0d8e5993fa` |
| `/tmp/forest-qa-1etnu01q/logs/014-baseline-a-sphere-high-mobile.json` | 1239 | `8708a328bac65cd0cdf14b5a53062af3cca3ad49e4544ad19210b78f7b8397bd` |
| `/tmp/forest-qa-1etnu01q/logs/014-baseline-a-sphere-high-mobile.log` | 3738 | `f19870a6bed9d898891e6cca8a2de462097f5c012c612cdb2f6d3b25da01ee5f` |
| `/tmp/forest-qa-1etnu01q/render/baseline-a-full-sphere-high-mobile-sync.json` | 208873 | `d4d19ff54518f8d48b10630a4c042952f4370086e21bb0a18a23e034a05e1393` |
| `/tmp/forest-qa-1etnu01q/logs/015-candidate-a-sphere-high-mobile.json` | 1242 | `df5afb0f71e7828235999452aef1104516807ce214f4dd8bd4c758b246123231` |
| `/tmp/forest-qa-1etnu01q/logs/015-candidate-a-sphere-high-mobile.log` | 3765 | `b2f682a6bd5a8f7f19cc67cedebe57afa09436100a625e7f067bc27340ac1b5d` |
| `/tmp/forest-qa-1etnu01q/render/candidate-a-full-sphere-high-mobile-sync.json` | 207496 | `28aa7bdc3b11a02e58a9a96c652e735da2dc880a34a7794a784dc62551a98654` |

## 8. 사용할 수 있는 결론과 미검증 범위

이 네 실행은 **동일하게 기록된 mobile high/Lite 조건의 controlled 완료시간·렌더링 통계 비교**로 사용할 수 있어. 중계 draw call 감소, Hall 일부 triangles 감소, 실행별 JS heap 관측값 감소를 구체적으로 보고하되 시간/CPU 악화행을 함께 제시해야 해. 전반적인 모바일 성능 개선으로 결론 내릴 근거는 부족해.

독립 반복·역순 재측정, 물리 Android/iOS GPU, 실제 native FPS/1% low, 시각적 동등성, 실제 오디오 동시 재생, 발열·배터리·장시간 안정성은 이 리뷰에서 검증하지 않았어. medium/low를 기다리거나 그 수치를 추정해 넣지 않았어. 제품 회귀인지 환경 부하/순서 효과인지 원인을 단정하지 않아.
