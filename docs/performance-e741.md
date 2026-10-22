# 홀·스피어 클라이언트 최적화 — e741 기준 최종 검증

**판정: 홀의 가까운 시점과 일부 중계 비용 감소는 확인했지만, 스피어 전체의 성능 개선과 실물 PC·모바일의 60/30FPS 달성은 입증하지 못했어.** 스피어 high의 넓은 시점과 숲 장면은 두 실행 순서에서 모두 느려졌어. 이 결과를 숨기거나 소프트웨어 렌더러의 잡음이라고 단정하지 않고, 개선과 회귀 가능성을 함께 검토하는 PR로 제출해.

대상은 [PR #1](https://github.com/eddy961206/forest-philharmonic/pull/1), 브랜치는 perf/261021-venue-rendering이야. main 직접 커밋·PR 머지·자동 머지는 하지 않았어. 이전 세션의 미게시 작업과 증거를 복구한 뒤 최신 main을 통합하고 다시 측정했어. **아래 숫자는 e741 → 6c 비교야. 이전 1f/dea·6a·3f·a41의 수치를 최신 결과에 섞지 않았어.**

## 1. 버전·환경·측정의 의미

| 항목 | 실제 조건 |
|---|---|
| 기준 제품 | e741811d1d7a040afcdd3a8230465980c64f82fc |
| 후보 제품 | 6c7817218814f00631089eb2c6f150d68190980f |
| 렌더 수집기 | 6c78172에 포함된 full-frame.mjs / full-frame-fixture.js / browser.mjs |
| 런타임 수집기 | 7b07e15의 최신 오디오·관객·재접속 계약에 맞춘 도구 |
| OS·CPU 노출 | Linux x64 클라우드, 논리 CPU 9개 노출 |
| 브라우저 | Chromium 153.0.8010.0, Playwright 1.62.1, headless |
| 렌더러 | ANGLE Vulkan SwiftShader Device (Subzero), 소프트웨어 렌더러 |
| 고정 렌더 해상도 | PC viewport 640×360, 모바일 viewport 390×844, 요청 DPR 1 |
| 글꼴 | system-font fixture; 외부 Google Fonts CSS는 빈 응답, 일부 한글 대체 글리프 존재 |
| 고정 장면 | 동일 카메라·FOV·프리셋·실제 scale·곡·시드, 음악 시각 25초(중계 5초) |
| 관객 | seed 417, 계획 비율 80%; Hall 전체 1,503명, Sphere 전체 11,076명, 표시 LOD는 기존 경로 |
| 고정 렌더 표본 | 장면당 준비 2프레임·측정 4프레임; high desktop만 두 실행 순서 |
| GPU 시간·VRAM | 미측정. 확장 지원 여부를 시간 측정으로 간주하지 않음 |

제품 6c는 측정 중 고정했고 이후 커밋은 문서·검증 도구·증거만 바꿨어. manifest의 43개 경로와 실제 HTTP 응답을 해시한 12개 제품 파일의 범위를 구분했어. 모든 제품 파일을 실제 응답으로 해시했다고 주장하지 않아. [환경·도구 manifest](performance-data/main-e741/measurement-manifest.json), [소스 manifest](performance-data/main-e741/source-manifest.json)와 각 raw의 sourceHashes/sourceHashesAfter가 근거야.

세 종류의 시간을 구분해.

- **동기 완료시간:** 실제 frame() 호출 뒤 readPixels로 완료를 기다린 ms. 렌더 제출·소프트웨어 GPU 완료 대기·측정 오버헤드를 포함해. 역수를 FPS로 쓰지 않아. n=4의 p95/p99는 최대 표본 하나라 장시간 안정성의 근거가 아니야.
- **통제된 rAF 간격:** 고정 fixture를 native requestAnimationFrame마다 실행한 시작 간격. 100표본의 1% Low는 가장 긴 간격 하나의 역수야. 실제 음표 스케줄러는 꺼져 있어 실제 공연 전체의 FPS와 구분해.
- **실제 재생 관찰:** 원래 앱 rAF·오디오 시계·악보·샘플을 유지한 30초 창. 카메라와 설정은 맞췄지만 창의 음악 시작 시각이 완전히 같지 않아 엄격한 동일 시점 FPS 개선율에 포함하지 않아.

모바일 결과는 PC Chromium의 viewport·UA·touch·기존 Lite 경로 시험이야. 스마트폰·태블릿의 CPU/GPU/발열을 모사한 결과가 아니야. 모바일 high도 full 3D 세계로 바꾼 것이 아니며 기존 Lite 대체 장면을 유지해.

## 2. 실제 병목과 변경

| 영역 | 확인한 비용·문제 | 적용한 변경과 유지한 조건 |
|---|---|---|
| Hall 좌석 | 가까운 카메라에서도 큰 좌석 배치가 화면 밖 좌석을 함께 제출 | 공간별 fine 배치와 넓은 시점의 coarse 배치를 실제 렌더 카메라마다 선택. 동일 좌석 형상·재질·색·전역 ID·picking 유지 |
| 중계 + 본 화면 | 한 애니메이션 프레임에서 그림자와 Lite 연주자 행렬을 중복 준비 | 동일 caster/light 상태의 그림자 한 번, Lite 행렬 한 번을 공유. 카메라별 가시성은 각각 계산 |
| 중계 재진입 | 화면이 다시 보이는 첫 시점에 이전 촬영 주기까지 검거나 오래된 영상 유지 가능 | 활성화 시 즉시 촬영 무효화, 숨겨져도 shot 시간 진행, 자막·폰트·빈 텍스처 갱신 및 렌더 상태 복원 |
| Sphere ray proxy | 3D 세계를 그릴 때 cube face마다 구 proxy 2,208 triangles 제출 | 방향만 제공하는 box 12 triangles로 대체. ray marching step·세계 내용·큐브 해상도를 고정 비교에서 낮추지 않음 |
| Sphere 돔 순서 | 불투명 물체에 가려지는 돔 fragment를 먼저 처리할 가능성 | opaque 뒤의 돔 렌더 순서로 변경. 실제 early-Z 절약량은 미측정이며 시간 개선 성과로 세지 않음 |
| geometry·instance 데이터 | 반복 부품의 중복 배열·변환과 병합 시 index 손실 | geometry 공유·index 보존·동일 instanceMatrix 재사용. 관객 geometry는 최신 main의 정점 압축으로 복원 |
| 프레임·자원 수명 | 반복 composer 생성·pass/PMREM 자원 정리, 숨김 복귀 때 중복 rAF 위험 | 초기 중복 composer 제거, dispose 경로 보완, rAF 체인 하나 유지 |
| 연주·공간 음향 | 시각화 배열 재할당·정지 listener의 동일 값 갱신 | 시각화 배열 재사용, 정확한 위치·방향 캐시. 음원 이동과 stereo desk 변경은 반영 |
| 박수 초기 준비 | 기존 PCM 합성이 메인 스레드를 점유 | 같은 합성 함수와 full/Lite 설정을 Worker에서 실행, ArrayBuffer 전달, 실패 시 기존 동기 경로 |
| 자동 품질 | clamp된 애니메이션 dt에 의존, 일시적 하락과 지속 부하의 구분 부족 | 실제 프레임 간격·3초 창·p90·지속 조건·유예·단계별 해상도 변경·회복 시도. 고정 프리셋 성과와 별도 평가 |

Sphere의 **보이는 cube face 선택·두 세계 교대 갱신·가려진 중계 생략은 최신 main에 이미 있던 기능**이야. 이번 성과로 세지 않아. Apple GPU 수치 안정화, 객석·통로 최소 밝기, 관객 비율·예약 분리, 오디오 desk/EQ, 두 층 박수, 재접속 identity, 광장·발권·휴식 관련 upstream 기능도 보존했어.

관객의 mergeVertices 제거는 초기 생성 시간을 줄이지만 full geometry 배열이 180,368 → 210,872B, Lite가 29,328 → 38,328B로 늘어나는 것을 확인해 되돌렸어. 이 바이트는 실제 배열 크기이지 GPU VRAM 실측이 아니야. Sphere forest의 단순 ground-distance ray cutoff는 마지막 DDA cell의 물체를 놓칠 수 있어 채택하지 않았어. 미세한 다른 ray cutoff도 성능 이득과 픽셀 보존 증거 없이 추가하지 않았어. [통합 판단](render-integration-e741.md), [셰이더 검토](performance-data/latest-e741-shader-review.md), [고정 후보 위험 검토](performance-data/latest-e741-review-notes.md)를 참고해.

음악 JSON·악기 샘플의 품질·음표 수·예약 규칙·잔향·악기 밸런스를 낮추지 않았어. 샘플 파일이나 서버 전송 경로 자체의 광범위한 최적화를 했다고 주장하지 않아. 서버 사양 변경도 없었어.

## 3. A — 동일 품질 고정 렌더 결과

아래 평균은 동기 완료 ms야. 시간 변화가 음수면 감소, 양수면 증가야. high desktop은 A→B와 B→A를 별도 표시하며 두 실행의 여러 프레임을 독립 반복으로 늘려 세지 않았어. 상세 p50/p95/p99·메모리·단계별 시간·draw calls는 [high 전체 표](performance-data/main-e741/high-summary/summary.md)와 [전 화질·기기 표](performance-data/main-e741/matrix-summary/summary.md)에 있어.

| 공연장·장면 | 평균 ms A→B | 변화 | 평균 ms B→A 반복(기준→후보) | 변화 |
|---|---:|---:|---:|---:|
| hall · front | 2,303.95 → 1,723.10 | -25.21% | 2,333.85 → 1,860.05 | -20.30% |
| hall · wide | 6,614.02 → 6,658.80 | +0.68% | 6,810.05 → 6,495.50 | -4.62% |
| hall · broadcast-hidden | 219.90 → 235.10 | +6.91% | 227.00 → 229.68 | +1.18% |
| hall · broadcast-return | 5,618.33 → 5,400.65 | -3.87% | 5,877.27 → 5,247.90 | -10.71% |
| sphere · front | 878.10 → 834.87 | -4.92% | 906.58 → 947.70 | +4.54% |
| sphere · wide | 2,759.67 → 2,883.10 | +4.47% | 2,763.65 → 2,909.97 | +5.29% |
| sphere · forest | 1,920.95 → 1,943.45 | +1.17% | 1,843.75 → 1,935.77 | +4.99% |
| sphere · crossfade | 2,111.32 → 2,095.30 | -0.76% | 2,044.33 → 2,028.62 | -0.77% |
| sphere · broadcast | 1,689.85 → 1,646.80 | -2.55% | 1,629.45 → 1,564.52 | -3.98% |

Hall high front의 triangles는 11,561,430 → 7,275,422(37.1% 감소), draw calls는 1,714 → 1,711이야. 같은 프리셋에서 화면 밖 좌석 제출을 줄인 결과이며 두 반복의 캡처는 동일해. Hall high 중계 복귀는 draw calls 2,106.5 → 1,873(11.1% 감소), Sphere high 중계는 2,588.5 → 2,310(10.8% 감소)였어. calls는 프레임 평균이라 소수가 가능해.

Sphere forest/crossfade의 전체 triangles 감소는 6,588개, 약 0.22%야. proxy가 크게 간단해져도 전체 프레임의 지배 비용을 없앤 것은 아니야. Sphere wide·forest 시간 악화는 두 순서에서 모두 관찰됐고 원인을 한 변경으로 분리하지 못했어. 실물 GPU에서도 같은 회귀가 생긴다고 확정하지 않으며, early-Z 이득도 입증된 것으로 세지 않아.

### 프리셋·모바일 조건별 가까운 시점과 넓은 시점

| 공연장·프리셋·viewport | front 평균 ms | 변화 | wide 평균 ms | 변화 |
|---|---:|---:|---:|---:|
| hall · medium · desktop | 2,281.92 → 1,703.15 | -25.36% | 6,540.28 → 6,493.17 | -0.72% |
| sphere · medium · desktop | 776.20 → 785.22 | +1.16% | 2,560.80 → 2,593.93 | +1.29% |
| hall · low · desktop | 195.70 → 158.38 | -19.07% | 269.43 → 282.65 | +4.91% |
| sphere · low · desktop | 132.88 → 123.70 | -6.90% | 530.08 → 534.27 | +0.79% |
| hall · high · mobile | 451.50 → 424.02 | -6.09% | 728.00 → 729.30 | +0.18% |
| sphere · high · mobile | 398.12 → 424.93 | +6.73% | 903.95 → 986.60 | +9.14% |
| hall · medium · mobile | 399.50 → 380.55 | -4.74% | 659.57 → 725.15 | +9.94% |
| sphere · medium · mobile | 348.00 → 331.25 | -4.81% | 850.92 → 782.38 | -8.06% |
| hall · low · mobile | 198.25 → 262.62 | +32.47% | 313.77 → 341.42 | +8.81% |
| sphere · low · mobile | 168.82 → 153.03 | -9.36% | 493.00 → 488.57 | -0.90% |

Hall low mobile front의 후보 네 표본 중 485.7ms가 한 번 들어가 평균이 32.47% 증가했어. 나머지는 177.3~195.3ms였지만 큰 표본을 삭제하거나 원인을 추정해서 제외하지 않았어. 짧은 n=4와 100표본 cadence의 의미는 다르게 읽어야 해.

**low Hall 중계 복귀와 Sphere 중계의 PC·모바일 총 네 쌍은 같은 프리셋이지만 실제 영상 내용이 달라.** 기준 캡처의 중계 영역은 검고 후보는 즉시 영상을 보여 줘. 원래 표의 숫자는 보존하되 이 네 쌍은 엄격한 동일 영상 성능 이득에 포함하지 않아. 일시적 첫 갱신 상태이며 기준 버전에서 중계가 항상 고장 난다는 뜻은 아니야.

### 통제된 rAF 프레임 간격

고정 low, 준비 6프레임 뒤 100개 간격이야. 모든 화살표는 기준 → 후보이며 두 viewport 모두 같은 SwiftShader 머신에서 측정했어.

| 공연장·viewport·시점 | 관찰 rAF FPS | 1% Low FPS | p95 ms | Draw Calls | CDP heap MiB |
|---|---:|---:|---:|---:|---:|
| hall · desktop · front | 7.58 → 8.52 | 2.74 → 2.87 | 206.90 → 181.70 | 429.53 → 430.53 | 16.54 → 31.20 |
| hall · desktop · wide | 4.92 → 5.08 | 1.83 → 2.76 | 313.90 → 285.20 | 492.46 → 492.46 | 15.96 → 15.78 |
| sphere · desktop · front | 9.89 → 9.92 | 4.06 → 4.50 | 148.20 → 149.60 | 405.89 → 405.89 | 42.58 → 39.57 |
| sphere · desktop · wide | 2.37 → 2.44 | 0.87 → 0.90 | 626.70 → 594.10 | 489.46 → 489.46 | 32.20 → 32.06 |
| hall · mobile · front | 6.76 → 7.58 | 2.48 → 2.81 | 365.90 → 202.70 | 343.70 → 346.70 | 14.95 → 23.81 |
| hall · mobile · wide | 4.23 → 4.36 | 1.52 → 1.68 | 592.10 → 332.90 | 492.46 → 528.46 | 15.94 → 15.89 |
| sphere · mobile · front | 7.76 → 7.28 | 2.54 → 2.72 | 204.30 → 238.90 | 318.08 → 318.08 | 40.87 → 36.45 |
| sphere · mobile · wide | 2.58 → 2.55 | 0.95 → 0.99 | 932.00 → 658.80 | 455.46 → 455.46 | 32.67 → 32.69 |

Hall front의 관찰 FPS는 PC 약 12.35%, 모바일 에뮬레이션 약 12.13% 증가했어. Sphere 모바일 front는 평균 FPS와 p95가 악화됐고, wide는 평균 FPS가 악화됐지만 p95는 줄었어. 모든 결과를 함께 남겼어. 100표본 한 번씩이고 1% Low는 가장 긴 간격 하나여서 지속 성능·회귀의 반복 재현성을 확정하지 않아. 메모리는 GC를 강제하지 않은 수집 종료 snapshot이고 전체 앱 메모리나 VRAM이 아니야.

## 4. B — 적응형 품질

고정 프리셋 결과와 별도인 모바일 auto 100표본 관찰이야. 양쪽 모두 실제 프리셋은 low였지만 해상도 변화 시점과 크기가 달랐어.

| 공연장·시점 | 관찰 rAF FPS | 1% Low FPS | p95 ms | 최종 scale 기준 → 후보 | scale별 표본 수 기준 → 후보 |
|---|---:|---:|---:|---:|---|
| hall · front | 6.52 → 8.50 | 2.33 → 2.65 | 399.30 → 209.50 | 0.85 → 0.8 | {"1": 73, "0.85": 27} → {"1": 36, "0.8": 64} |
| sphere · front | 7.93 → 8.19 | 2.85 → 2.84 | 186.50 → 204.70 | 0.85 → 0.8 | {"1": 71, "0.85": 29} → {"1": 54, "0.8": 46} |

Sphere auto의 평균 관찰 FPS는 조금 늘었지만 p95는 증가했어. 어느 조건도 이 환경에서 안정적인 30/60FPS를 입증하지 못했어. 실제 부하 회복·온도 하강 이후의 품질 복귀는 이 짧은 실행에서 측정하지 않았어.

자동 해상도가 달라진 결과는 선명도와 픽셀 작업량도 달라져. 고정 high/medium/low의 성능 개선율에 합치지 않아. 자동 품질 실행은 상태·간격을 수집했고 전환 중 PNG 정량 비교는 수행하지 않았어. 수동 프리셋의 시각 비교를 자동 품질 전체의 화질 검증으로 대신하지 않아. 현재 정책은 회복 시도에 실패하면 수동 선택 등 reset까지 추가 상승을 잠가 반복 진동을 피하므로, 성능 회복 시 언제나 최고 품질로 복원한다는 정책은 아니야. 배터리·온도를 직접 읽거나 실제 발열을 검증한 것도 아니야. 모바일이라는 이유로 적용되는 기존 Lite 경로는 이번에 제거하지 않았어.

## 5. 추가 장면·돔 전환

medium 돔 진단은 전후 각각 회전 28표본 + reveal 20표본 + crossfade 20표본으로 총 68표본씩 검사했어. 실제 pixelRatio 0.85, renderScale 1, cube 512를 유지했고, 이번 카메라에서 요구된 cube face 0·1·2·4·5의 coverage가 양쪽 모두 249/249였어. 요청 수는 rotation 42, reveal 33, crossfade 33으로 같아. 보이는 면 선택과 시간 분산을 이번의 신규 절감이라고 세지 않아. renderer/target/camera 상태와 계측 hook의 복원도 검사했어.

전환 끝에서 FOREST3D/PEAKS3D, mix 0, overlay off가 확인됐어. 원본 30 PNG의 15쌍 비교에서는 3쌍이 바이트·픽셀 동일했고, 최저 SSIM은 crossfade 50%의 0.997233045, 최대 MAE는 0.129064/255였어. 최악 쌍을 포함한 4쌍 원본에서 큰 물체 누락은 보이지 않았어. 고정 시점의 진단이므로 실제 시간으로 이어지는 4초 전환 전체의 안정성을 보증하지 않아. [돔 비교 원본·호환 감사](performance-data/main-e741/dome-motion-summary/)를 함께 확인해.

추가로 medium desktop에서 Hall 로비·회전·효과와 Sphere 일반 돔·산·바다·구름·reveal·회전·효과를 측정했어. 각 장면 준비 2프레임·측정 4프레임, A→B 한 쌍이며 아래도 **동기 완료 ms**야.

| 공연장·장면 | 평균 ms 기준 → 후보 | 시간 변화 | p95 ms 기준 → 후보 | Draw Calls 기준 → 후보 |
|---|---:|---:|---:|---:|
| Hall 로비 | 11,858.63 → 11,992.40 | +1.13% | 11,905.90 → 12,344.40 | 1,835 → 1,835 |
| Hall 회전 | 3,318.47 → 2,934.05 | -11.58% | 3,823.50 → 3,487.40 | 1,109 → 1,148.8 |
| Hall 효과 | 5,439.07 → 4,970.63 | -8.61% | 8,244.40 → 7,713.30 | 1,741 → 1,758 |
| Sphere 일반 돔 | 601.67 → 579.20 | -3.74% | 610.80 → 600.80 | 646 → 646 |
| Sphere 산 | 1,496.50 → 1,533.95 | +2.50% | 1,715.30 → 1,769.40 | 1,739.5 → 1,739.5 |
| Sphere 바다 | 1,539.18 → 1,637.55 | +6.39% | 1,843.90 → 1,878.80 | 1,740.5 → 1,740.5 |
| Sphere 구름 | 1,653.67 → 1,688.03 | +2.08% | 1,945.90 → 1,936.20 | 1,736.5 → 1,736.5 |
| Sphere reveal | 1,595.65 → 1,603.70 | +0.50% | 1,876.60 → 1,800.20 | 1,740 → 1,740 |
| Sphere 회전 | 1,010.00 → 1,027.30 | +1.71% | 1,129.60 → 1,147.40 | 849.3 → 849.3 |
| Sphere 효과 | 2,266.47 → 2,288.15 | +0.96% | 4,655.30 → 4,874.80 | 1,755.5 → 1,755.5 |

Hall 회전·효과의 calls는 증가했지만 triangles와 동기 완료시간은 줄었어. 로비와 Sphere의 여러 3D 세계는 시간을 줄이지 못했어. 한 번의 짧은 비교로 통계적 유의성이나 실제 하드웨어의 결과를 확정하지 않아. [추가 장면 전체 지표](performance-data/main-e741/special-summary/summary.md)에 메모리·텍스처·기하·단계별 수치도 있어.

[추가 시각 비교](performance-data/main-e741/special-visual-summary.md)의 20 PNG/10쌍 중 7쌍은 바이트 동일했어. 차이가 있는 peaks/ocean/clouds 중 최저 SSIM은 0.999476471, 최대 MAE는 0.116503/255야. 로비·양쪽 효과·세 3D 세계, 총 6쌍 원본을 직접 확인했고 큰 구조·효과 소실은 발견하지 못했어. 미세 차이의 원인을 한 변경으로 분리하지 않았어. **추가 장면은 medium desktop 한 쌍만 실행했으며 모든 장면×프리셋×기기의 전체 조합을 실행한 것은 아니야.**

## 6. 시각적 품질

[시각 비교 보고서](performance-data/main-e741/visual-summary.md)와 [63쌍 원본 경로·해시·지표](performance-data/main-e741/visual-summary.json)를 남겼어. 126 PNG 중 전후 46쌍은 파일 바이트·픽셀 모두 동일하고 17쌍은 차이가 있어. 8쌍의 원본 16장은 육안 확인했어. 전체를 육안 확인했다고 세지 않아.

| 장면 | 비교 결과 |
|---|---|
| Hall high front·wide | byte-identical. 무대·악기·연주자·좌석·샹들리에·발코니·조명 유지 |
| Sphere high forest | SSIM 0.999725958, MAE 0.017556/255. 숲의 깊이·무대·객석 유지 |
| Sphere high crossfade | SSIM 0.999519751, MAE 0.053508/255. 숲과 산·오로라 전환 유지 |
| low 중계 네 쌍 | 기준의 검은 영상과 후보의 즉시 갱신 영상이 달라 별도 기능 응답 차이로 분류 |
| 위 네 쌍을 뺀 59쌍 | 최저 SSIM 0.999473708, 최대 MAE 0.072073/255 |

crop·resize·자동 정렬 없이 전체 8-bit RGB를 비교했어. SSIM은 채널별 7×7 창의 평균이며, 한 수치로 모든 장면의 화질을 보증하지 않아. 작은 차이의 원인을 모두 자연스러운 애니메이션으로 돌리지 않았어. 자막 shot 일부는 wall clock 영향을 받으며, 한글 대체 글리프가 양쪽 모두에 있어 실제 폰트 표시 검증은 제한돼.

최신 원본 PNG **180장**은 `forest-philharmonic-e741-screenshots.zip`(34,842,644B)으로 제공해. high/matrix 126장, 돔 30장, 후보 UI 4장, 추가 장면 20장이며 서로 다른 검사 집합이야. [다운로드·SHA 확인·실제 파일명으로 픽셀 재비교](performance-screenshots-e741.md)와 [ZIP 해시 기록](performance-data/main-e741/screenshot-archives.json)을 남겼어. 이전 1f/dea 세션의 280장은 지표·해시를 복구했지만 마감 때 옛 scratch 원본 경로에 더 이상 접근할 수 없어 ZIP에 포함하지 못했어. 이 제한은 최신 180장의 보존과 구분해.

## 7. 실제 재생·기능·멀티플레이

| 검사 | 실제 결과 | 범위·제한 |
|---|---|---|
| 제품 Node 회귀 | 11개 파일·79개 실제 case PASS | 실제 WebGL 컨텍스트 없는 기하·상태·스케줄·정책 검사 |
| 최신 도구 계약 | 음표 감사 7개 + PCM 계약 4개 PASS | 의도적 오류가 FAIL로 남는지 포함; 제품 79개와 별도 |
| PC 계획 변환 | 14개 fixture PASS, Python 구문·Bash 18블록 검사 PASS | 실제 원본 계획을 입력으로 사용, 제품/도구 파일과 Git 상태는 fixture; Windows·설치 실행 성공의 증거는 아님 |
| native 실제 재생 | 전후 × 두 공연장 × PC/mobile = 8/8 PASS | low, 30초 관찰, 2초 내 재개; 실제 음질·출력 underrun은 미측정 |
| UI 기능 | 후보 두 공연장 × PC/mobile = 4/4 PASS | 이동·회전·앉기/일어나기·시작/일시정지/탐색/재개·설정·중계, 제어 프레임 |
| 로컬 방 UI | Hall cross / Sphere core 2/2 PASS | 두 탭 연결·동기화·채팅·권한·공연장 이동; volume 0, effects/crowd/screen off |
| 서버·RoomClient 프로토콜 | 16/16 case PASS | 재접속 ID·방장 권한 보존, 범위 요청·캐시·격리 등; 120초 유예 만료 대기는 미실행 |
| 돔 회전·전환 | 기준/후보 medium 2/2 PASS | 고정 360° 28단계와 reveal/crossfade 5시점×4pass; 실시간 연속 전환 FPS는 아님 |
| 박수 Worker·차단 fallback | 4/4 PASS | 32 buffer·64 channel 해시 일치 |

기능 검사 네 조건에서 failures·unchecked·page/console error·context loss가 모두 비어 있었어. 이전 controlled 오디오 정지는 이번 조건에서 재현되지 않았고, 재개 2초 조건은 약 286~327ms에 관측됐어. 이전 실패 자료를 이번 통과로 덮어쓰지는 않았어.

탐색·재개와 이어지는 30초 관찰 과정에서 음표 인자·호출 계보·유지음 누락/추가를 검사했지만 **늦은 음표 요청은 남아 있어.** Hall은 재개 때 유지음 9/9개, Sphere는 해당 탐색 위치의 예상 0개/관측 0개였고 live 창 안의 유지음 요청은 모두 0개였어. 후보 Sphere mobile에서는 live 6개 playNote 요청의 when이 요청 시점 currentTime보다 과거였고 최악 lead는 −327.1ms였어. 엔진은 실제 시작 시각을 currentTime + 0.005초 이상으로 보정하므로 장치 출력이 정확히 327.1ms 지연됐다는 측정은 아니야. 기준선에도 같은 종류의 지연이 있었지만 실행 시작 시각 차이와 단발 관측 때문에 인과 개선율을 계산하지 않아. 스피커에서 출력된 음을 녹음·청음한 결과도 아니야.

| native 진단 | main rAF Hz 기준 → 후보 | 1% Low Hz | p95 ms |
|---|---:|---:|---:|
| Hall PC | 5.058 → 5.890 | 0.918 → 1.923 | 374.2 → 329.0 |
| Sphere PC | 4.846 → 4.756 | 0.388 → 1.270 | 388.9 → 407.2 |
| Hall mobile 에뮬레이션 | 5.340 → 6.153 | 1.329 → 2.409 | 351.1 → 309.6 |
| Sphere mobile 에뮬레이션 | 4.030 → 4.078 | 0.450 → 1.166 | 446.6 → 487.3 |

위 표는 실제 앱 실행 중의 진단 관측이지만 음악 창 시작 시각이 전후 완전히 같지 않아 동일 시점 성능 성과에 넣지 않아. main rAF 시작 간격과 실제 디스플레이 표시 FPS도 구분해. 작은 표본의 1% Low와 Sphere p95 악화까지 그대로 보존했어.

음표 호출의 종류를 신규 스케줄과 탐색·재개 시 유지음 복원으로 나눴어. 신규음은 악보 index·호출 수·순서·원래 길이와 해당 인자를 비교하고, 유지음은 남은 길이·skip·velocity·startCtx도 비교했어. 신규 scheduler의 humanization velocity와 when은 기록했지만 독립적인 기대값과 일치한다고 판정한 항목은 아니야. observer가 제품 요청을 바꾸지 않는 검사와 잘못된 음표를 넣으면 실패하는 검사도 포함했어. [도구 계약 보정·음표 감사](performance-data/main-e741/tool-compat/)와 [상세 런타임 판정](performance-data/main-e741/runtime-validation-summary.md)에 원본 연결을 남겼어.

박수 Worker 네 조건(full/Lite × 정상 worker/CSP 차단 fallback)은 동일 합성 결과의 close/wash 8 layer 해시를 확인했어. full PCM은 15,552,000B, Lite는 10,368,000B로 기존 설정과 같아. Worker는 계산 위치를 바꾼 것이므로 전체 CPU 작업·PCM 메모리 절감이라고 부르지 않아. fallback은 메인 스레드를 다시 점유할 수 있어.

처음 core 검사에서 재접속 ID와 박수 PCM 바이트의 옛 기대값으로 실패했어. 최신 main은 ID를 보존하고 두 층 박수를 사용해. 제품을 옛 기대값에 맞추지 않고 독립적인 최신 계약 검사로 도구를 수정했으며, [첫 FAIL](performance-data/main-e741/runtime-core-first/)과 [재실행](performance-data/main-e741/runtime-core-v2/)을 둘 다 보존했어. 통과시키기 위해 재개 2초 조건을 완화하지 않았어.

## 8. 초기 로딩·전송량·메모리

| 공연장·cache | 준비 ms 기준 → 후보 | long task 합계 ms | JS heap snapshot MB |
|---|---:|---:|---:|
| Hall cold | 13,536.3 → 11,602.7 | 2,853 → 2,099 | 410 → 462 |
| Hall warm | 10,837.3 → 11,037.5 | 1,918 → 1,288 | 410 → 462 |
| Sphere cold | 8,116.3 → 7,687.7 | 2,325 → 2,100 | 410 → 410 |
| Sphere warm | 7,212.5 → 6,825.5 | 1,502 → 1,170 | 410 → 410 |

두 공연장 모두 high 악기 샘플 389개, 디코드 PCM 296,771,776B, cold 샘플 응답 인코드 크기 10,666,245B가 전후 같아. warm에는 양쪽 모두 389/389 cache hit, 샘플 응답 인코드 크기 0B였어. 이 값은 CDP 응답 크기이며 네트워크 패킷 전체가 아니야. Sphere cold의 최장 long task는 1,395 → 1,674ms로 증가했어. [로딩·메모리 상세](performance-data/main-e741/runtime-validation-summary.md)에 감소와 증가를 모두 남겼어.

각 버전·공연장당 새 브라우저 HTTP cache의 cold 1회와 같은 context의 warm 1회야. Node/OS cache는 이미 따뜻할 수 있고, main rAF를 멈춘 통제된 준비 측정이야. 일반 사용자 첫 입장의 완전한 체감 시간이나 반복 통계로 해석하지 않아. 관객·샘플·프리셋·브라우저 등의 비교 조건 111개를 두 공연장 각각 검사했어. main fixture 응답 바이트는 원본 자산 전송량과 분리했어.

메모리 전체가 줄었다는 결론은 내리지 않아. 고정 high Hall의 performance.memory bucket은 391.01 → 368.12MiB였지만 CDP heap의 전후 대소는 실행 순서에 따라 달랐으며 GC 시점 등의 영향도 배제할 수 없고, 로딩 Hall heap snapshot은 증가했어. 텍스처 객체 한 개 감소도 VRAM 절감 바이트로 환산하지 않아. 누수와 수시간 감상 중 메모리 증가율은 미측정이야.

## 9. 재현 절차와 증거 위치

1. [PC 렌더 A/B 안내](performance-reproduce-e741.md)의 Windows PowerShell 또는 Bash 순서로 기준·후보·수집기를 고정한 별도 worktree를 만들어.
2. 기준은 localhost:8381, 후보는 localhost:8382에서 실행해. 원본 plan의 클라우드 절대 경로·SwiftShader 옵션을 PC 변환기로 바꿔. shell 변수만 바꾸면 plan env가 덮어쓸 수 있어.
3. 같은 브라우저 바이너리·해상도·DPR·프리셋·카메라·관객 시드로 A/B/B/A를 실행해. 물리 renderer 문자열을 raw에서 확인해. 더 긴 판단에는 같은 조건의 600표본과 반복 실행을 새 계획으로 남겨.
4. [재생·기능·방·로딩 안내](performance-runtime-e741.md)에서 별도 runtime collector 7b를 사용해. 서버 제품과 도구 커밋을 혼동하지 않아.
5. run-plan.py는 20초 heartbeat, job별 상한, 종료 상태·로그·해시를 남겨. 중단 뒤 완료 결과를 덮어쓰지 않고 start/end로 이어가. TIMEOUT·FAIL을 남기고 조건을 바꾼 재실행은 새 폴더로 분리해.
6. collect-plan.mjs로 입력·제품·수집기 해시와 조건을 검사하고, [원본 PNG 안내](performance-screenshots-e741.md)의 verify-evidence.py·compare-images.py로 다운로드한 ZIP과 같은 PNG쌍을 비교해. 원본 경로·해시는 각 manifest에 있어. 현재 브랜치의 계획 변환기를 사용하면 high뿐 아니라 matrix·special도 PC 환경에 맞게 변환할 수 있어.

| 자료 | 위치 |
|---|---|
| 최신 전체 증거 색인 | [main-e741](performance-data/main-e741/) |
| high 두 방향 반복 | [계획](performance-data/main-e741/high-plan.json), [원본](performance-data/main-e741/high/), [집계](performance-data/main-e741/high-summary/) |
| 나머지 프리셋·viewport | [계획](performance-data/main-e741/matrix-plan.json), [원본](performance-data/main-e741/matrix/), [집계](performance-data/main-e741/matrix-summary/) |
| 재생·UI·방·돔 | [계획](performance-data/main-e741/runtime-app-plan.json), [원본](performance-data/main-e741/runtime-app/) |
| 프레임 간격·자동 품질 | [계획](performance-data/main-e741/cadence-plan.json), [원본](performance-data/main-e741/cadence/), [집계](performance-data/main-e741/cadence-summary/) |
| 추가 로비·회전·세계·효과 | [계획](performance-data/main-e741/special-plan.json), [원본](performance-data/main-e741/special/), [집계](performance-data/main-e741/special-summary/) |
| 원본 이미지·무결성 확인 | [PNG 180장 다운로드·재비교 안내](performance-screenshots-e741.md), [ZIP 크기·SHA](performance-data/main-e741/screenshot-archives.json) |
| 이전 세션 복구 자료 | [recovery-20261022](performance-data/recovery-20261022/), [main-1f](performance-data/main-1f/) — 최신 비교와 별개 |

브라우저 작업은 직렬 실행했고, CPU 이미지 비교도 성능 수집 사이에 실행했어. 파일 읽기·문서 작성·GitHub 체크포인트 업로드는 겹칠 수 있으므로 전용 물리 벤치마크 머신을 독점한 실험이라고 주장하지 않아. 로컬 크롬 연결이 사용된 사실을 설명한 뒤에는 그 연결을 더 조작하지 않고 클라우드 Playwright로 검증했어. 과거 Pro가 10시간 응답하지 않은 플랫폼상의 정확한 원인은 알 수 없어. 이번 실행은 무제한 대기와 묶음 종료 후 한 번 저장하는 방식을 피하도록 상한·heartbeat·원본 즉시 저장·중간 커밋을 사용했어.

## 10. 남은 제한과 회귀 위험

- **실물 저사양 PC·스마트폰·태블릿, iOS Safari·Android Chrome·Edge, 물리 GPU 시간·VRAM, 60/30FPS 달성은 미검증**이야. 클라우드 숫자를 그 기기들의 성능으로 환산하지 않아.
- **장시간 감상·연속 전환·발열·배터리·메모리 누수·출력 청감·실제 오디오 글리치·장시간 AV 동기화는 미측정**이야. 30초 재생과 결정적 캡처가 이를 대신하지 않아.
- Sphere high wide·forest의 반복 악화 원인을 분리하지 못했어. 실제 GPU에서 추가 비교할 때 우선 볼 항목이야. 표의 개선만 근거로 자동 머지할 상태라고 결론 내리지 않아.
- 좌석 fine/coarse가 별도 bounds·전역 ID·공유 행렬을 유지해야 해. 좌석이 움직이거나 카메라별 layer가 추가되면 culling·picking·그림자 공유 가정을 다시 검토해야 해. coarse 데이터의 메모리 비용이 없어지는 것은 아니야.
- listener 캐시는 새 음원 위치·공간 상태 변경 시 무효화가 필요해. Worker 실패 fallback은 기존 동기 합성 비용을 다시 지불해.
- 자동 품질의 회복 잠금·기존 UA 기반 Lite·짧은 표본의 통계 한계를 명시했어. 기능 축소를 새 최적화 성과로 세지 않아.

검증된 결과와 미검증 범위를 함께 남기는 것이 이 PR의 제출 기준이야. 두 공연장 전체에서 사용자 목표가 달성됐다는 최종 성공 판정은 실제 하드웨어의 동일 조건 반복 결과가 있어야 가능해.
