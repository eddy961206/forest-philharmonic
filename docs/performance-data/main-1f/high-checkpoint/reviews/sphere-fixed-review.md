# 최신 main 1f Sphere 고정 렌더 독립 검토

작성: 2026-10-21T11:31:48.186802+00:00

최신 main1f vs 후보dea7997의 Sphere high desktop 첫 AB 쌍만 검토했어. 6a/06·a41/3f·이후 프리셋/모바일/반복과 섞지 않았어.

## 결론

두 실행은 PASS로 끝났고, 12장면 모두 실제 돔 draw·프로그램 준비 검사가 통과했어. 스냅샷에서 큰 시각 요소 누락은 찾지 못했지만, 첫 AB 쌍의 시간 변화는 혼재해. 이 결과만으로 Sphere 전체 속도가 개선됐다고 말할 수 없어.

- 기준선: `1f8e5f16f1eee03140e13ba1ee66832841559604`
- 후보: `dea7997c6278f10ff467815ab96b370362549b0c`
- 640×360, DPR1, 수동 high, scale1, full 모드. SwiftShader·Chromium153.0.8010.0·Playwright1.64.1·Linux headless야.
- 실제 PC/휴대폰 FPS나 순수 GPU 시간은 미측정이야.
- 브라우저/GPU를 새로 실행하지 않고 원본 읽기와 SHA256 계산, 원본 이미지 보기만 했어.

## 자료와 조건 대조

- baseline: `/workspace/scratch/296fafc0af7f/verification/main-1f/fixed/render/baseline-a-full-sphere-high-desktop-sync.json` — SHA256 `b8574202ef5efc21b6b9bd2d3e40bed07627d05882c4397a1f039ba54a979b92`
- candidate: `/workspace/scratch/296fafc0af7f/verification/main-1f/fixed/render/candidate-a-full-sphere-high-desktop-sync.json` — SHA256 `e5ff550de5772b8984b2bb2f003787de5107febd4fc927ec120584ddd4523e7b`

원시 JSON2개·실행 로그4개·PNG24개, 총30개는 staging/transfer manifest/보존본의 bytes·SHA256가 모두 같아. 실행마다 HTTP 수집소스12개는 시작과 끝이 같고 pinned git 및 소스 manifest와 일치해. 기준선의 quality.js404는 해당 파일이 없어서 예상한 결과야. sphereplan.js는 git/manifest만 대조했어.

수집기3개 해시도 두 실행·현재 보존본·collector manifest가 같아. 양쪽 viewport·DPR·renderer·프리셋·scale·관객12863명/좌석13851개·대상좌석13845개·특별좌석6개·음악·시나리오 camera/target/FOV64·seed·정책은 일치했어. occupancy hash와 실제 drawingBuffer 크기는 별도 필드로 기록되지 않았어.

## 동기 완료시간 비교

각 장면 warmup4회, 측정8회, baseline→candidate 한 쌍이야. 단위ms. `frame()` 뒤 readPixels 완료까지 포함해. Δ는(candidate/baseline−1)×100으로 양수면 이 표본에서 느려졌다는 뜻이야. p95/p99는 n8의 nearest-rank라 둘 다 최대값이야.

| 장면 | 평균 기준선→후보 ms | Δ평균 | p50 기준선→후보 ms | p95 기준선→후보 ms | Draw Calls 기준선→후보 | Triangles 기준선→후보 |
|---|---:|---:|---:|---:|---:|---:|
| front | 1050.52 → 910.23 | -13.36% | 1038.00 → 880.60 | 1216.10 → 1029.10 | 1711.62 → 1711.62 | 2.26778e+06 → 2.26778e+06 |
| wide | 2931.45 → 2841.76 | -3.06% | 2900.10 → 2793.80 | 3249.70 → 3014.80 | 1785.12 → 1785.12 | 3.69898e+06 → 3.69898e+06 |
| rotate | 1542.81 → 1506.34 | -2.36% | 1504.90 → 1620.20 | 1790.50 → 1700.30 | 670.75 → 670.75 | 2.85865e+06 → 2.85865e+06 |
| dome | 719.86 → 734.78 | +2.07% | 670.00 → 720.70 | 973.30 → 832.50 | 653 → 653 | 2.55783e+06 → 2.55783e+06 |
| forest | 1896.14 → 2063.80 | +8.84% | 1883.10 → 2018.50 | 2045.50 → 2254.80 | 1761.75 → 1761.75 | 3.27473e+06 → 3.26814e+06 |
| peaks | 2058.21 → 2105.27 | +2.29% | 2072.40 → 2055.10 | 2137.60 → 2409.90 | 1761.25 → 1761.25 | 3.27458e+06 → 3.26799e+06 |
| ocean | 2389.30 → 2411.35 | +0.92% | 2377.90 → 2407.10 | 2511.00 → 2491.30 | 1765 → 1765 | 3.27566e+06 → 3.26907e+06 |
| clouds | 2331.71 → 2272.16 | -2.55% | 2150.30 → 2251.90 | 2989.50 → 2355.60 | 1764.25 → 1764.25 | 3.27545e+06 → 3.26886e+06 |
| crossfade | 2172.19 → 2154.06 | -0.83% | 2134.20 → 2103.10 | 2352.60 → 2352.50 | 1763.25 → 1763.25 | 3.32383e+06 → 3.31724e+06 |
| reveal | 2027.11 → 2068.69 | +2.05% | 1991.00 → 2089.50 | 2123.00 → 2131.70 | 1765.5 → 1765.5 | 3.32448e+06 → 3.31789e+06 |
| broadcast | 1861.11 → 1995.89 | +7.24% | 1403.70 → 1550.50 | 2471.20 → 2936.10 | 2127.5 → 1849 | 4.71681e+06 → 4.58948e+06 |
| effects-show | 1865.54 → 1975.64 | +5.90% | 1494.70 → 1538.90 | 4379.80 → 4713.30 | 1778.75 → 1778.75 | 3.27343e+06 → 3.27343e+06 |

평균이 증가한 장면: dome, forest, peaks, ocean, reveal, broadcast, effects-show. p95가 증가한 장면: forest, peaks, reveal, broadcast, effects-show. 단일 쌍의 순서/시스템 변동과 변경 효과를 분리하지 못한 관찰로 남겼어.

일반 장면 calls는 모두 동일, broadcast mean calls는2127.5→1849(-13.09%)야. 3D/전환6장면 triangles는6588개 감소해 3개 큐브 면마다2208→12 triangles의 proxy 교체와 일치해. 이 작은 절감만으로 ray marching fragment 비용이나 전체 시간 개선을 주장하지 않아.

## 메모리와 CPU 해석

performance.memory coarse 값은435000000→462000000(+6.21%)이나 CDP JSHeapUsedSize는 장면별 약60.8~71.6MB로 방향이 섞여 있어. 범위/정밀도/GC 시점이 달라 peak, GPU메모리, 누수 또는 정확한 메모리 증가로 해석하지 않아.

| 장면 | CDP JSHeapUsedSize 사후 기준선→후보 bytes | textures 기준선→후보 | geometry 범위 기준선→후보 |
|---|---:|---:|---|
| front | 67004748 → 69653016 | [69] → [68] | 1148–1150 → 1135–1137 |
| wide | 61808456 → 60778076 | [69] → [68] | 1185–1188 → 1172–1175 |
| rotate | 61930020 → 61556032 | [69] → [68] | 1188–1188 → 1175–1175 |
| dome | 62247384 → 61888488 | [69] → [68] | 1188–1188 → 1175–1175 |
| forest | 62838464 → 62484956 | [69] → [68] | 1191–1193 → 1178–1180 |
| peaks | 62639572 → 62661200 | [69] → [68] | 1195–1197 → 1182–1184 |
| ocean | 62423664 → 62825592 | [69] → [68] | 1197–1197 → 1184–1184 |
| clouds | 62819608 → 62735284 | [69] → [68] | 1198–1199 → 1185–1186 |
| crossfade | 63247516 → 63136332 | [70] → [69] | 1201–1202 → 1188–1189 |
| reveal | 63602468 → 62757876 | [70] → [69] | 1203–1203 → 1190–1190 |
| broadcast | 63719004 → 63385856 | [71] → [70] | 1204–1206 → 1191–1193 |
| effects-show | 71619988 → 70831328 | [71] → [70] | 1223–1224 → 1210–1211 |

submitMs는 제출 경로 벽시계, CDP duration은 수집기·동기 대기를 포함한 구간이야. 순수 CPU 활용률이 아니며 phaseMeanMs에는 중첩 호출이 있어 합산하지 않아.

## 돔 준비 상태 증거

- 초기 visible은 대기 조건이고 수집기에서 강제로 켜지 않았어.
- warmup 네 프레임에만 onAfterRender를 관측하고 기존 콜백을 보존/복원했어. 프로그램 상태 조회는 측정 구간 밖이야.
- base/overlay는 같은 프로그램을 사용해. baseline id42/candidate id63은 각 브라우저 내 식별자야.
- crossfade와 reveal은 양쪽 모두 base·overlay 각각 mainCameraDraws4, ready/link true였어. 일반 장면 overlay는 NOT_USED_IN_WARMUP이야.
- broadcast base total draws는 baseline6/candidate7, mainCameraDraws는 모두4야. 후보의 화면 재진입 즉시 갱신 정책과 일치해. 실제 측정8프레임에서는 양쪽 모두 매 두 번째인4프레임에서 중계 호출이 있었어.
- KHR_parallel_shader_compile는 모두 false라 해당 확장 지원 경로의 비동기 드라이버 컴파일은 검증하지 못했어.
- onAfterRender는 draw 제출 증거야. 모든 픽셀이 depth test를 통과하거나 화면에 보였다는 증거와 구분했어.

모든192개 측정 표본은 high/scale1, visible, awake, glError0, contextLostfalse였어. pageErrors/consoleErrors/failedRequests는 두 실행 모두 비어 있었고, KHR 확장 미지원과 readPixels GPU stall 경고는 원본에 보존돼.

## 원본 이미지 비교

12쌍24장을 모두 tools.view_image의 original로 열었어. front, wide, dome, reveal, effects-show 5쌍은 파일 바이트가 동일해. 나머지7쌍은 해시가 달라서 동등하다고 단정하지 않아. SSIM/MAE나 차영상은 이번 리뷰에서 계산하지 않았어.

| 장면 | PNG 바이트 동일 | 육안 관찰 |
|---|---|---|
| front | 예 | 동물 연주자, 지휘자, 피아노·현악기·관악기와 무대 윤곽, 건축 돔의 빛 기둥을 확인했어. |
| wide | 예 | 전경 관객의 동물 머리·귀와 뒤로 이어지는 객석, 무대, 건축 돔을 확인했어. 주요 좌석·관객 누락은 보이지 않았어. |
| rotate | 아니오 | 객석과 굽은 발코니, 난간 조명, 구역 표지를 확인했어. 바이트 차이는 있지만 육안으로 큰 형상 누락은 찾지 못했어. |
| dome | 예 | 보라·청록 오로라의 세부 띠와 별이 화면 전체를 채워. 비어 있는 돔을 측정한 상태는 아니야. |
| forest | 아니오 | 나무 기둥, 지면의 빛과 깊이, 아래쪽 객석·무대를 확인했어. 큰 큐브 면 경계나 검은 누락은 찾지 못했어. |
| peaks | 아니오 | 설산 윤곽, 하늘의 녹색 띠와 별, 아래쪽 객석·무대를 확인했어. 주요 세계 요소 누락은 찾지 못했어. |
| ocean | 아니오 | 청록 바닷속 공간, 수직 해초와 굴곡진 바닥, 객석·무대가 유지돼 보여. |
| clouds | 아니오 | 밝은 구름/산 지형과 햇빛, 따뜻해진 객석 조명이 양쪽에 보여. 큰 형상·색조 변화는 찾지 못했어. |
| crossfade | 아니오 | 나무와 설산/녹색 하늘이 함께 보이는 중간 전환 상태를 확인했어. 두 세계가 완전히 사라지거나 검게 비지는 않았어. |
| reveal | 예 | 이 시점·카메라에서는 두 이미지 모두 건축 돔 위주로 보여. overlay draw와 별개로 숲 공개 과정 전체를 육안 검증한 증거는 아니야. |
| broadcast | 아니오 | 돔 위 IMAG에 지휘자·뒤쪽 관객·자막이 있고, 실제 무대와 객석도 아래에 보여. 한 장으로 중계 프레임 신선도나 연속 동기화를 판정할 수 없어. |
| effects-show | 예 | 무대 위 빛줄기와 여러 색 폭죽, 무대 양옆 입자, 객석·건축 돔을 확인했어. 큰 효과 누락은 없어 보여. |

이미지별 원본 경로·bytes·SHA256·실제로 연 경로와640×360 크기는 동명의 JSON visual.pairs에 모두 기록했어. 정지 화면으로 움직임 부드러움, IMAG 갱신 지연, 전환 전체, 고해상도 세부 품질까지 통과 처리하지 않았어.

## 사용한 방식과 재현 범위

원본 batch는 render-plan의 index2/3으로 실행됐고 정확한 command/env/시각/로그 해시는 JSON runLogs에 있어. `tools/bench/full-frame.mjs`의 실제 frame을 사용하고 routing fixture를 주입해 같은 품질의 같은 장면을 따로 열어 측정했어. 수집기는 돔 가시성을 기다린 다음 기존 warmup에서만 draw/program을 확인해. 검토자는 Python 표준 라이브러리로 bytes/SHA256·JSON 조건·nearest-rank를 재계산하고 `git show`로 pinned 소스를 대조했어. 이미지는 변환하지 않고 원본을 열었어.

| 수집 소스 | SHA256 |
|---|---|
| tools/bench/full-frame.mjs | `2bf556b443cd64df6b4d743ec45e11dc382e6a9014083054472ddb39919d37c9` |
| tools/bench/full-frame-fixture.js | `262b5f126c6214d1875010056da4327117af2c764dab8d04854dc4b709871d98` |
| tools/bench/browser.mjs | `90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9` |

## 한계

- SwiftShader 소프트웨어 렌더러·headless Linux 환경이며 실물 PC GPU, 스마트폰, iOS Safari, Android/Edge 검증이 아니야.
- 이 완료시간의 역수를 FPS/1% Low로 표기하지 않아. native rAF cadence와 pure GPU time은 별도야.
- gpuTimer=true는 확장 존재를 뜻하고 이 collector는 GPU timer 값을 수집하지 않아.
- 최초 로딩 시간·전송량·물리 GPU메모리·배터리·발열·장시간 누수는 이 자료의 측정 대상이 아니야.
- 음표 스케줄러를 끄고 합성 음악 시계를 썼으므로 실제 음색/오디오 glitch/동기화 보존을 입증하지 않아.
- camera·FOV·crowd seed/count·piece·scenario state·quality는 같지만 occupancy hash와 cube face별 시간/호출 counter는 기록되지 않았어.
- frame dt는 performance.now에서1/60 근방으로 구성돼 완전한 bit-exact animation dt 기록은 아니야. 이미지 차이를 proxy 부동소수점, 미세 dt, 캡션 또는 다른 요소 때문으로 단정하지 않아.
- 한 쌍 n8의 AB는 순서·시스템 변동을 통계적으로 제거하지 않아. medium/low/mobile/BA 반복을 완료한 것처럼 표현하지 않아.
- 1f upstream의2pass 돔·DPR 정책은 양쪽에 존재해. 이를 후보 고유 성능 개선으로 세지 않아.
- 640×360 정지화면이야. 작은 화질차이, 시간축·전환 전체·IMAG 신선도·고해상도 세부 품질은 미검증이야.

검토 파일을 제외한 제품·수집기·원본 결과·로그·PNG는 수정하지 않았어.
