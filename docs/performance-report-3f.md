# 이전 세션 복구 결과 — 기준 main 3f1655b 전용

**이 보고서는 광장 추가 이전 `main@3f1655b0c035a630adbcfbf19582dd9363386f34`과 당시 통합 후보의 측정이야. 최신 main·광장 통합본의 측정으로 읽으면 안 돼.** 끊긴 세션이 남긴 원본을 변경하지 않고 다시 집계했어. 새 브라우저 실행 없이 기존 결과 파일을 검증·복구한 작업이야.

복구한 42개 렌더 실행은 21쌍 모두 계획·소스·장면 조건 검사에 통과했어. 홀 high의 무대 근접 시점은 평균 동기 완료 시간 2,480.8 → 1,709.8ms, 약 31.1% 줄었고, 스피어 high의 중계는 1,974.1 → 1,707.4ms, 약 13.5% 줄었어. 반대로 스피어 medium의 3D 세계 전환은 1,694.2 → 1,773.7ms로 약 4.7% 길어졌어. 모든 장면이 빨라졌다는 결과는 아니야.

이 수치는 Chromium/SwiftShader의 동기 완료 시간이야. 실제 PC·스마트폰의 평균 FPS나 GPU 프레임 시간이 아니야. 자동 품질에서 해상도가 달라진 결과도 아래에서 따로 구분했어.

## 1. 버전·무결성·원본 위치

| 구분 | 고정된 근거 |
| --- | --- |
| 기준선 | `3f1655b0c035a630adbcfbf19582dd9363386f34` |
| 원래 후보 라벨 | `3f-integrated-candidate`; 측정 당시 미커밋 통합 worktree였어. 원시 JSON의 라벨을 새 SHA로 바꾸지 않았어. |
| 복구한 후보 커밋 | `2a627fa56f45055ce9b51811f2a2bce2d152bb40` |
| 후보 복구 검증 | 당시 source-manifest의 제품·테스트 53개 파일이 복구 커밋과 모두 같은 SHA-256이야. 기준선 53개 경로의 존재 여부·내용과 frozen 도구 15개도 모두 일치해. |
| 렌더 실행 기록 시각 | 2026-10-21 16:26:01 ~ 17:39:05 KST, 원본 실행 상태 기록 기준이야. |
| 원본 실행 수 | 42개 결과 JSON / 전후 21쌍 / 고정 품질 61개 비교 행 / auto 2개 비교 행 |
| 단위 테스트 | 당시 9개 테스트 파일을 case가 드러나는 TAP 방식으로 별도 실행했고 총 69개 case가 통과했어. 처음의 파일 단위 9개 PASS 로그도 삭제하지 않았어. |

근거 파일은 [초기 source-manifest](performance-data/historical-3f/source-manifest.json), [복구 커밋과의 일치 검사](performance-data/historical-3f/recovery/candidate-recovery-check.json), [원본 전체 233파일 목록](performance-data/historical-3f/original-inventory.json), [보존본 SHA-256 manifest](performance-data/historical-3f/manifest.json), [strict 집계 JSON](performance-data/historical-3f/analysis/summary.json), [전체 고정 품질 CSV](performance-data/historical-3f/analysis/summary.csv)야.

Git에는 원본 비이미지 107개와 대표 이미지 6쌍만 복사했어. 전체 126개 PNG의 해시는 원본 목록에 있고, 저장하지 않은 이미지 114개는 별도 전체 증거 압축본에서 같은 `qa-3f/render/` 경로로 찾아야 해. 이미지 지표는 보존 여부와 관계없이 전체 63쌍을 다시 계산했어.

## 2. 측정 환경과 비교 계약

| 항목 | 조건·해석 |
| --- | --- |
| 브라우저 | Chromium `153.0.8010.0`, Playwright `1.64.1`, Linux x64, headless |
| 렌더러 | ANGLE Vulkan / SwiftShader Device (Subzero), 물리 GPU 실측이 아니야. |
| 데스크톱 설정 | viewport 640×360, DPR 1 |
| 모바일 설정 | viewport 390×844, DPR 2, Android UA·터치 에뮬레이션. 실제 휴대폰·태블릿이 아니야. |
| 화면 품질 | 수동 high·medium·low는 각 프리셋으로 새 context에서 시작했고 모든 측정 표본의 renderScale은 1이야. 실제 내부 pixel ratio는 원시 meta에 별도로 기록돼. |
| 난수 | 관객 seed 417, 절차적 난수 seed 417, UUID seed 874 |
| 장면 | `beethoven-ode-to-joy`, 관객 fill 0.8, 연주자 전원을 무대에 고정한 스트레스 fixture |
| 음악 시각 | 보통 25초, 중계 5초에서 시작해 표본마다 1/60초씩 진행해. 실제 음표 예약은 꺼져 있어. |
| 카메라·시야각 | 시나리오별 위치·방향 고정, FOV 64도. rotate만 정해진 프레임 순서로 움직여. |
| 상태 | `asleep=false`, `visibility=visible`을 표본마다 확인해. 독주회 전용 6석을 일반 관객 배치 대상에서 제외했어. |
| 폰트 | 전후 모두 같은 로컬 폰트 경로를 사용했어. |
| 동기 측정 | 각 장면 준비 4프레임 + 측정 6프레임. 전체 `frame()` 실행 후 1×1 `readPixels` 완료를 기다린 벽시계 시간이야. |
| rAF 측정 | readback 없이 네이티브 rAF callback 시작 사이 간격 100개. auto는 120개야. |
| 계측 범위 | 연주자·관객·그림자·돔·중계·후처리를 포함한 전체 시각 프레임. UI는 캡처에서 숨겨. |

**평균 동기 완료 ms를 역수로 바꿔 FPS라고 쓰지 않았어.** 6표본의 p95·p99는 가장 긴 표본 하나와 같으므로, 장기 꼬리 지연이나 안정적인 1% Low의 근거가 아니야. rAF 평균 FPS는 `1000 / 평균 간격`, 1% Low는 느린 상위 `ceil(n×0.01)`개 간격 평균의 역수야. 100표본의 1% Low는 가장 긴 한 간격에 크게 좌우돼.

CPU 메인 스레드 사용률·순수 GPU 프레임 시간·GPU 메모리 bytes·발열·배터리 소모·실제 출력 오디오 글리치는 이 렌더 자료에서 미측정이야. `gpuTimer: true`는 확장 존재 여부만 뜻해. 원시 자료의 JS 제출 시간·CDP 누적 스냅샷을 CPU 점유율로 바꾸지 않았어. texture·geometry는 개수이며, JS heap은 장면 마지막 스냅샷이야. peak 메모리나 장기 누수 검사로 해석하면 안 돼.

high→medium/low로 실행 중 바꾸면 후보의 cube target이 실제로 resize되는 반면 기준선은 이전 크기를 유지해. 그때의 비용·선명도 변화는 다음 고정 품질 표에 넣지 않았어. 처음부터 low로 시작한 경로는 기존처럼 Lite이고, 스피어 3D 세계는 원래의 경량 표현으로 치환돼.

## 3. A — 같은 수동 품질의 시각 프레임 비교

변화율은 `(후 / 전 - 1) × 100`이야. 음수면 이번 표본에서 완료 시간이 짧아졌어. 각 표의 원시 JSON에는 p50·p95·p99, 모든 개별 표본, 카메라, geometry·texture 개수와 함수별 제출 시간이 있어.

### 숲속 홀 · high · 데스크톱 viewport

원본 [전](performance-data/historical-3f/render/baseline-full-hall-high-desktop-sync.json) / [후](performance-data/historical-3f/render/after-full-hall-high-desktop-sync.json); 각 장면 n=6.

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 2,480.8 → 1,709.8 | 2,571.4 → 1,876.3 | -31.1% | 1,713.3 → 1,710.3 | 11,699,198 → 7,413,190 | 391.0 → 368.1 |
| 객석 전체 | 7,089.8 → 6,911.0 | 7,271.5 → 7,125.9 | -2.5% | 1,814.7 → 1,814.7 | 11,858,529 → 11,858,529 | 391.0 → 368.1 |
| 중앙 객석 | 4,576.5 → 4,155.8 | 4,726.4 → 4,335.4 | -9.2% | 1,722.7 → 1,739.7 | 11,701,036 → 9,256,972 | 391.0 → 368.1 |
| 이동·급회전 | 3,696.8 → 3,440.9 | 4,399.3 → 4,445.1 | -6.9% | 700.0 → 741.8 | 11,460,051 → 9,376,970 | 391.0 → 368.1 |
| 무대 중계 | 5,696.5 → 5,054.5 | 6,895.7 → 6,172.2 | -11.3% | 2,580.3 → 2,342.7 | 17,588,419 → 14,144,315 | 391.0 → 368.1 |
| 폭죽·색종이·활성 빔 | 5,369.6 → 5,059.2 | 8,160.9 → 8,064.6 | -5.8% | 1,736.0 → 1,753.0 | 11,704,448 → 9,260,384 | 391.0 → 368.1 |

### 숲속 홀 · medium · 데스크톱 viewport

원본 [전](performance-data/historical-3f/render/baseline-full-hall-medium-desktop-sync.json) / [후](performance-data/historical-3f/render/after-full-hall-medium-desktop-sync.json); 각 장면 n=6.

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 2,434.5 → 1,731.4 | 2,514.0 → 1,805.5 | -28.9% | 1,713.3 → 1,710.3 | 11,699,198 → 7,413,190 | 391.0 → 391.0 |
| 객석 전체 | 7,242.2 → 6,972.5 | 7,549.3 → 7,247.0 | -3.7% | 1,814.7 → 1,814.7 | 11,858,529 → 11,858,529 | 391.0 → 391.0 |
| 무대 중계 | 5,974.7 → 4,933.5 | 8,412.2 → 6,699.1 | -17.4% | 1,981.3 → 1,831.2 | 15,540,138 → 12,745,288 | 391.0 → 391.0 |

### 스피어 · high · 데스크톱 viewport

원본 [전](performance-data/historical-3f/render/baseline-full-sphere-high-desktop-sync.json) / [후](performance-data/historical-3f/render/after-full-sphere-high-desktop-sync.json); 각 장면 n=6.

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 971.6 → 920.5 | 1,067.7 → 973.9 | -5.3% | 1,711.0 → 1,711.0 | 2,267,848 → 2,267,848 | 440.6 → 414.8 |
| 객석 전체 | 2,960.0 → 2,858.9 | 3,055.6 → 2,957.3 | -3.4% | 1,779.3 → 1,779.3 | 3,699,488 → 3,699,488 | 440.6 → 414.8 |
| 일반 돔 AURORA | 922.0 → 848.1 | 997.9 → 882.7 | -8.0% | 653.0 → 653.0 | 2,557,834 → 2,557,834 | 440.6 → 414.8 |
| FOREST3D | 2,052.2 → 2,019.8 | 2,121.7 → 2,109.5 | -1.6% | 1,747.0 → 1,747.0 | 3,275,340 → 3,268,752 | 440.6 → 414.8 |
| PEAKS3D | 2,094.7 → 2,099.6 | 2,194.3 → 2,266.5 | +0.2% | 1,746.0 → 1,746.0 | 3,275,052 → 3,268,464 | 440.6 → 414.8 |
| FOREST → PEAKS 전환 | 2,135.2 → 2,121.2 | 2,214.4 → 2,369.5 | -0.7% | 1,744.7 → 1,744.7 | 3,274,668 → 3,268,080 | 440.6 → 414.8 |
| ARCH → FOREST 공개 연출 | 2,048.1 → 2,006.0 | 2,224.2 → 2,067.8 | -2.1% | 1,744.0 → 1,744.0 | 3,274,476 → 3,267,888 | 440.6 → 414.8 |
| 무대 중계 | 1,974.1 → 1,707.4 | 2,509.4 → 2,030.5 | -13.5% | 2,595.7 → 2,317.2 | 4,520,785 → 4,393,449 | 440.6 → 414.8 |
| 폭죽·색종이·활성 빔 | 2,227.1 → 2,065.9 | 4,599.5 → 4,572.3 | -7.2% | 1,761.3 → 1,761.3 | 3,273,280 → 3,273,280 | 440.6 → 414.8 |

### 스피어 · medium · 데스크톱 viewport

원본 [전](performance-data/historical-3f/render/baseline-full-sphere-medium-desktop-sync.json) / [후](performance-data/historical-3f/render/after-full-sphere-medium-desktop-sync.json); 각 장면 n=6.

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 958.3 → 921.2 | 992.0 → 933.7 | -3.9% | 1,711.0 → 1,711.0 | 2,267,848 → 2,267,848 | 414.8 → 440.6 |
| 객석 전체 | 2,966.2 → 2,897.3 | 3,116.5 → 3,090.8 | -2.3% | 1,779.3 → 1,779.3 | 3,699,488 → 3,699,488 | 414.8 → 440.6 |
| FOREST3D | 1,677.6 → 1,692.3 | 2,026.1 → 1,966.9 | +0.9% | 1,744.2 → 1,744.2 | 3,271,644 → 3,268,350 | 414.8 → 440.6 |
| FOREST → PEAKS 전환 | 1,694.2 → 1,773.7 | 2,042.8 → 2,161.5 | +4.7% | 1,745.5 → 1,745.5 | 3,272,028 → 3,268,734 | 414.8 → 440.6 |
| 무대 중계 | 1,799.7 → 1,646.2 | 2,430.4 → 2,050.3 | -8.5% | 2,310.7 → 2,125.0 | 4,103,109 → 4,018,218 | 414.8 → 440.6 |

### 숲속 홀 · high · 모바일 viewport 에뮬레이션

원본 [전](performance-data/historical-3f/render/baseline-full-hall-high-mobile-sync.json) / [후](performance-data/historical-3f/render/after-full-hall-high-mobile-sync.json); 각 장면 n=6.

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 1,084.2 → 1,024.6 | 1,136.1 → 1,116.2 | -5.5% | 537.0 → 540.0 | 687,172 → 591,784 | 141.1 → 132.6 |
| 객석 전체 | 1,695.3 → 1,776.4 | 1,817.4 → 1,951.8 | +4.8% | 662.0 → 698.0 | 874,003 → 864,835 | 141.1 → 132.6 |
| 무대 중계 | 1,587.3 → 1,620.0 | 1,781.6 → 1,828.3 | +2.1% | 798.8 → 726.8 | 1,075,106 → 936,312 | 141.1 → 132.6 |

### 숲속 홀 · medium · 모바일 viewport 에뮬레이션

원본 [전](performance-data/historical-3f/render/baseline-full-hall-medium-mobile-sync.json) / [후](performance-data/historical-3f/render/after-full-hall-medium-mobile-sync.json); 각 장면 n=6.

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 596.9 → 609.5 | 644.5 → 666.8 | +2.1% | 537.0 → 540.0 | 687,172 → 591,784 | 141.1 → 124.9 |
| 객석 전체 | 945.2 → 915.8 | 973.8 → 994.7 | -3.1% | 662.0 → 698.0 | 874,003 → 864,835 | 141.1 → 124.9 |
| 무대 중계 | 888.8 → 977.1 | 1,167.3 → 1,353.3 | +9.9% | 738.8 → 695.8 | 955,377 → 840,624 | 141.1 → 124.9 |

### 스피어 · high · 모바일 viewport 에뮬레이션

원본 [전](performance-data/historical-3f/render/baseline-full-sphere-high-mobile-sync.json) / [후](performance-data/historical-3f/render/after-full-sphere-high-mobile-sync.json); 각 장면 n=6.

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 1,330.5 → 1,222.6 | 1,543.2 → 1,580.0 | -8.1% | 516.0 → 516.0 | 473,894 → 473,894 | 168.8 → 149.7 |
| 객석 전체 | 2,762.2 → 2,522.4 | 3,021.5 → 2,884.7 | -8.7% | 628.0 → 628.0 | 823,517 → 823,517 | 168.8 → 149.7 |
| 무대 중계 | 1,594.4 → 1,440.0 | 1,751.3 → 1,626.8 | -9.7% | 776.0 → 668.0 | 1,179,549 → 1,116,296 | 168.8 → 149.7 |
| 일반 돔 AURORA | 1,340.1 → 1,372.7 | 1,400.9 → 1,426.2 | +2.4% | 276.0 → 276.0 | 506,760 → 506,760 | 168.8 → 149.7 |

### 스피어 · medium · 모바일 viewport 에뮬레이션

원본 [전](performance-data/historical-3f/render/baseline-full-sphere-medium-mobile-sync.json) / [후](performance-data/historical-3f/render/after-full-sphere-medium-mobile-sync.json); 각 장면 n=6.

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 584.7 → 589.2 | 600.4 → 613.0 | +0.8% | 516.0 → 516.0 | 473,894 → 473,894 | 189.8 → 159.3 |
| 객석 전체 | 1,376.4 → 1,343.9 | 1,474.0 → 1,410.8 | -2.4% | 628.0 → 628.0 | 823,517 → 823,517 | 189.8 → 159.3 |
| 무대 중계 | 816.1 → 803.5 | 1,010.0 → 1,133.6 | -1.6% | 721.0 → 649.0 | 1,040,573 → 998,404 | 189.8 → 159.3 |
| 일반 돔 AURORA | 732.6 → 595.2 | 851.1 → 629.6 | -18.7% | 276.0 → 276.0 | 506,760 → 506,760 | 189.8 → 159.3 |

## 4. A — low의 rAF 간격 관찰

이 표의 FPS는 통제 fixture를 실행하는 네이티브 rAF callback의 관측 빈도야. 원래 앱의 오디오·입력·네트워크까지 함께 사용한 실기기 FPS와 같다고 볼 수 없어. 각 장면 준비 4프레임, rAF 간격 100개를 수집했어. 같은 실행 안의 front·wide·rotate를 독립적인 반복 실험으로 세지 않아.

### 숲속 홀 · low · 데스크톱 viewport

원본 [전](performance-data/historical-3f/render/baseline-full-hall-low-desktop-cadence.json) / [후](performance-data/historical-3f/render/after-full-hall-low-desktop-cadence.json).

| 장면 | 평균 rAF FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 7.48 → 8.47 | 2.63 → 3.09 | 209.1 → 188.5 | 428.4 → 429.4 | 588,186 → 477,642 | 149.7 → 124.9 |
| 객석 전체 | 4.97 → 4.60 | 1.78 → 1.61 | 296.7 → 522.9 | 492.4 → 492.4 | 747,152 → 747,152 | 149.7 → 124.9 |
| 이동·급회전 | 5.18 → 5.47 | 1.84 → 1.67 | 347.6 → 384.6 | 174.0 → 200.4 | 549,785 → 494,055 | 149.7 → 124.9 |

### 숲속 홀 · low · 모바일 viewport 에뮬레이션

원본 [전](performance-data/historical-3f/render/baseline-full-hall-low-mobile-cadence.json) / [후](performance-data/historical-3f/render/after-full-hall-low-mobile-cadence.json).

| 장면 | 평균 rAF FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 5.02 → 5.13 | 1.72 → 1.64 | 496.2 → 366.7 | 342.7 → 345.7 | 564,361 → 468,973 | 141.1 → 124.9 |
| 객석 전체 | 2.98 → 3.22 | 1.04 → 1.15 | 566.4 → 756.2 | 492.4 → 528.4 | 747,152 → 737,984 | 141.1 → 124.9 |
| 이동·급회전 | 3.44 → 3.39 | 1.00 → 0.77 | 613.7 → 612.0 | 105.8 → 123.0 | 508,464 → 437,656 | 141.1 → 124.9 |

### 스피어 · low · 데스크톱 viewport

원본 [전](performance-data/historical-3f/render/baseline-full-sphere-low-desktop-cadence.json) / [후](performance-data/historical-3f/render/after-full-sphere-low-desktop-cadence.json).

| 장면 | 평균 rAF FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 8.26 → 8.33 | 2.77 → 3.11 | 284.9 → 283.0 | 404.8 → 404.8 | 378,589 → 378,589 | 168.8 → 149.7 |
| 객석 전체 | 2.22 → 2.21 | 0.88 → 0.81 | 686.8 → 663.9 | 490.4 → 490.4 | 969,550 → 969,550 | 168.8 → 149.7 |
| 이동·급회전 | 3.63 → 3.89 | 1.99 → 1.30 | 466.7 → 458.0 | 137.0 → 137.0 | 687,951 → 687,966 | 168.8 → 149.7 |
| 일반 돔 AURORA | 5.70 → 5.85 | 2.22 → 1.91 | 272.3 → 426.8 | 52.0 → 52.0 | 562,616 → 562,616 | 168.8 → 149.7 |

### 스피어 · low · 모바일 viewport 에뮬레이션

원본 [전](performance-data/historical-3f/render/baseline-full-sphere-low-mobile-cadence.json) / [후](performance-data/historical-3f/render/after-full-sphere-low-mobile-cadence.json).

| 장면 | 평균 rAF FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 무대 가까이 | 4.66 → 4.78 | 1.60 → 1.91 | 494.6 → 314.0 | 317.2 → 317.2 | 352,268 → 352,268 | 179.3 → 141.1 |
| 객석 전체 | 1.75 → 1.87 | 0.68 → 1.15 | 883.3 → 790.3 | 455.4 → 455.4 | 697,758 → 697,758 | 179.3 → 141.1 |
| 이동·급회전 | 2.54 → 2.21 | 0.84 → 0.70 | 719.9 → 810.0 | 84.0 → 84.0 | 573,346 → 573,359 | 179.3 → 141.1 |
| 일반 돔 AURORA | 3.80 → 3.55 | 1.23 → 1.27 | 702.3 → 412.1 | 46.0 → 46.0 | 380,240 → 380,240 | 179.3 → 141.1 |

### low 중계: 준비 시간을 늘린 별도 실행

low 중계는 원래 프레임 주기가 길어서 처음 켜진 순간과 갱신이 안정된 뒤를 구분했어. 아래는 별도 `steady` 실행이며 준비 100프레임 뒤 rAF 간격 100개를 수집한 결과야. 앞 표와 합쳐 하나의 개선율을 만들지 않았어.

| 공연장·기기 | 평균 rAF FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | Draw calls 전 → 후 | Triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [숲속 홀 · desktop](performance-data/historical-3f/render/baseline-steady-full-hall-low-desktop-cadence.json) | 4.37 → 5.13 | 1.44 → 1.94 | 508.6 → 285.8 | 462.5 → 472.9 | 596,034 → 526,172 |
| [숲속 홀 · mobile](performance-data/historical-3f/render/baseline-steady-full-hall-low-mobile-cadence.json) | 2.83 → 3.50 | 0.81 → 1.32 | 819.5 → 692.1 | 451.5 → 466.9 | 595,078 → 528,240 |
| [스피어 · desktop](performance-data/historical-3f/render/baseline-steady-full-sphere-low-desktop-cadence.json) | 4.84 → 4.93 | 1.92 → 1.78 | 490.0 → 319.2 | 454.2 → 454.2 | 829,185 → 829,185 |
| [스피어 · mobile](performance-data/historical-3f/render/baseline-steady-full-sphere-low-mobile-cadence.json) | 3.64 → 4.03 | 1.31 → 1.44 | 647.2 → 375.9 | 440.2 → 440.2 | 643,677 → 643,677 |

## 5. 반복·악화·검사 범위의 한계

후보→기준 순서로 실행한 high 재관찰은 아래와 같아. 처음의 긴 장면 시퀀스와 준비 상태가 같지 않으므로, 각 재관찰 내부의 전후 쌍끼리 비교했어. 이전 결과를 이 결과로 덮어쓰지 않았어.

| 공연장·장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 |
| --- | ---: | ---: | ---: |
| [숲속 홀 · 무대 가까이](performance-data/historical-3f/render/baseline-repeat-full-hall-high-desktop-sync.json) | 2,496.5 → 1,804.2 | 2,633.4 → 2,080.8 | -27.7% |
| [스피어 · 무대 가까이](performance-data/historical-3f/render/baseline-repeat-full-sphere-high-desktop-sync.json) | 1,022.2 → 1,011.0 | 1,262.6 → 1,102.6 | -1.1% |
| [스피어 · 객석 전체](performance-data/historical-3f/render/baseline-repeat-full-sphere-high-desktop-sync.json) | 3,159.2 → 2,974.8 | 3,367.2 → 3,097.5 | -5.8% |
| [스피어 · 일반 돔 AURORA](performance-data/historical-3f/render/baseline-repeat-full-sphere-high-desktop-sync.json) | 1,017.5 → 935.8 | 1,071.3 → 1,017.1 | -8.0% |
| [스피어 · FOREST3D](performance-data/historical-3f/render/baseline-repeat-full-sphere-high-desktop-sync.json) | 2,033.4 → 2,066.5 | 2,125.7 → 2,152.4 | +1.6% |

홀 근접 시점은 최초 high -31.1%, 역순 재관찰 -27.7%로 같은 방향이었어. 스피어 FOREST3D는 최초 -1.6%였지만 재관찰 +1.6%여서 이 경로가 확실히 빨라졌다고 말할 근거는 약해.

최초 행렬에서 평균 시간이 늘어난 조건을 빠짐없이 적으면 다음과 같아. 짧은 표본·소프트웨어 렌더러 변동도 섞이므로 이 목록만으로 원인을 특정하지 않아.

- hall / high / mobile / wide: +4.8%
- hall / high / mobile / broadcast: +2.1%
- hall / low / desktop / wide: +8.0%
- hall / low / mobile / rotate: +1.5%
- hall / medium / mobile / front: +2.1%
- hall / medium / mobile / broadcast: +9.9%
- sphere / high / desktop / peaks: +0.2%
- sphere / high / mobile / dome: +2.4%
- sphere / low / desktop / wide: +0.3%
- sphere / low / mobile / rotate: +15.0%
- sphere / low / mobile / dome: +6.9%
- sphere / medium / desktop / forest: +0.9%
- sphere / medium / desktop / crossfade: +4.7%
- sphere / medium / mobile / front: +0.8%

계획의 첫 smoke는 홀 low / front 6표본, 177.2 → 147.5ms였어. 준비·도구 확인 자료로 보존하고 위 주 비교와 합산하지 않았어. strict 집계에는 제외된 전후 쌍이 없었어. 이것이 모든 기능 검사가 실행·성공했다는 뜻은 아니야.

**이 3f 계획에는 foyer가 없어.** 로비를 향한 시야, 광장 구매·티켓 입장, 실제 장시간 관람, iOS Safari·Android Chrome 실기기·Edge 검증은 이 묶음으로 증명할 수 없어.

## 6. B — 자동 품질 별도 관찰

두 실행은 각각 rAF 간격 120개이며 내부 해상도가 변했어. 전후 마지막 프리셋은 low지만 최종 renderScale은 기준 0.85, 후보 0.60이야. 아래 FPS 차이를 동일 선명도의 최적화 성과로 계산하면 안 돼. 시작 준비와 품질 전환 비용이 포함돼 있고, 발열 뒤 회복이나 물리 GPU에서의 장기 안정성을 관측한 자료도 아니야.

| 공연장 · 모바일 에뮬레이션 | 평균 rAF FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | p99 간격 ms 전 → 후 | 최종 scale 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [숲속 홀](performance-data/historical-3f/render/baseline-auto-full-hall-auto-mobile-cadence.json) | 5.00 → 5.86 | 1.52 → 1.99 | 303.8 → 368.2 | 565.1 → 476.1 | 0.85 → 0.60 |
| [스피어](performance-data/historical-3f/render/baseline-auto-full-sphere-auto-mobile-cadence.json) | 4.18 → 5.55 | 1.66 → 1.64 | 507.6 → 394.5 | 601.6 → 610.0 | 0.85 → 0.60 |

홀의 평균 FPS는 높아졌지만 p95는 303.8 → 368.2ms로 나빠졌어. 스피어의 평균 FPS와 p95는 좋아졌지만 1% Low는 1.6573 → 1.6388, p99는 601.6 → 610.0ms로 나빠졌어. 평균 향상으로 꼬리 지연 악화를 덮지 않았어.

## 7. 시각적 품질 비교

같은 프리셋·카메라·FOV·곡 시각·관객 상태·해상도·장면 순서의 전체 캡처 63쌍을 원본 `compare-images.py`로 다시 비교했어. 61개 수동 품질 쌍 중 47개는 PNG bytes와 RGB가 모두 같았고, 14개는 차이가 있었어. 이 61쌍에는 smoke·repeat·steady가 포함돼 있으므로 독립적인 61개 실험의 성공률로 표현하지 않아.

수동 품질 전체에서 최소 SSIM은 0.997345476, 최대 RGB MAE는 0.099224537/255였어. 크기가 작다는 지표만으로 품질 PASS를 선언하지 않아. 대표 6쌍을 실제로 나란히 확인했을 때 무대·동물·관객·난간·돔의 구조나 숲의 공간감이 사라지는 차이는 보이지 않았어. 이 중 FOREST와 crossfade 두 쌍은 돔 내부에 미세한 픽셀 차이가 있었고, 나머지 네 쌍은 bytes가 같았어.

셰이더가 같아도 프록시 geometry의 보간·반올림과 render order가 바뀔 수 있어. 이번 집계에서는 변경을 하나씩 분리해 차이의 단독 원인을 입증하지 않았고, 모든 차이를 자연적 애니메이션 변화로 간주하지 않았어.

### Git에 보존한 대표 6쌍

| 장면 | 전 / 후 원본 | RGB MAE | SSIM | 변경 픽셀 % |
| --- | --- | ---: | ---: | ---: |
| hall-high / front | [전](performance-data/historical-3f/render/baseline-full-hall-high-desktop-sync-front.png) / [후](performance-data/historical-3f/render/after-full-hall-high-desktop-sync-front.png) | 0.000000 | 1.000000000 | 0.000 |
| hall-high / wide | [전](performance-data/historical-3f/render/baseline-full-hall-high-desktop-sync-wide.png) / [후](performance-data/historical-3f/render/after-full-hall-high-desktop-sync-wide.png) | 0.000000 | 1.000000000 | 0.000 |
| sphere-high / dome | [전](performance-data/historical-3f/render/baseline-full-sphere-high-desktop-sync-dome.png) / [후](performance-data/historical-3f/render/after-full-sphere-high-desktop-sync-dome.png) | 0.000000 | 1.000000000 | 0.000 |
| sphere-high / forest | [전](performance-data/historical-3f/render/baseline-full-sphere-high-desktop-sync-forest.png) / [후](performance-data/historical-3f/render/after-full-sphere-high-desktop-sync-forest.png) | 0.062700 | 0.997345476 | 2.551 |
| sphere-high / crossfade | [전](performance-data/historical-3f/render/baseline-full-sphere-high-desktop-sync-crossfade.png) / [후](performance-data/historical-3f/render/after-full-sphere-high-desktop-sync-crossfade.png) | 0.060799 | 0.999294949 | 8.233 |
| sphere-high / broadcast | [전](performance-data/historical-3f/render/baseline-full-sphere-high-desktop-sync-broadcast.png) / [후](performance-data/historical-3f/render/after-full-sphere-high-desktop-sync-broadcast.png) | 0.000000 | 1.000000000 | 0.000 |

### 수동 품질에서 RGB가 달랐던 모든 쌍

다른 47쌍은 RGB MAE 0 / SSIM 1이야. 상세 원본 파일명·해시·SSIM 정의는 [전체 이미지 집계](performance-data/historical-3f/analysis/visual-metrics/summary.json)에 있어.

| 원본 이미지 라벨 | RGB MAE | SSIM | 변경 픽셀 % |
| --- | ---: | ---: | ---: |
| [baseline-full-hall-high-mobile-sync-broadcast](performance-data/historical-3f/analysis/visual-metrics/comparison-full-hall-high-mobile-sync-broadcast.json) | 0.005766 | 0.999770579 | 0.065 |
| [baseline-full-hall-medium-mobile-sync-broadcast](performance-data/historical-3f/analysis/visual-metrics/comparison-full-hall-medium-mobile-sync-broadcast.json) | 0.005327 | 0.999807392 | 0.078 |
| [baseline-full-sphere-high-desktop-sync-crossfade](performance-data/historical-3f/analysis/visual-metrics/comparison-full-sphere-high-desktop-sync-crossfade.json) | 0.060799 | 0.999294949 | 8.233 |
| [baseline-full-sphere-high-desktop-sync-forest](performance-data/historical-3f/analysis/visual-metrics/comparison-full-sphere-high-desktop-sync-forest.json) | 0.062700 | 0.997345476 | 2.551 |
| [baseline-full-sphere-high-desktop-sync-peaks](performance-data/historical-3f/analysis/visual-metrics/comparison-full-sphere-high-desktop-sync-peaks.json) | 0.082850 | 0.999455271 | 10.406 |
| [baseline-full-sphere-high-mobile-sync-broadcast](performance-data/historical-3f/analysis/visual-metrics/comparison-full-sphere-high-mobile-sync-broadcast.json) | 0.017732 | 0.999138754 | 0.201 |
| [baseline-full-sphere-medium-desktop-sync-crossfade](performance-data/historical-3f/analysis/visual-metrics/comparison-full-sphere-medium-desktop-sync-crossfade.json) | 0.099225 | 0.998396640 | 12.101 |
| [baseline-full-sphere-medium-desktop-sync-forest](performance-data/historical-3f/analysis/visual-metrics/comparison-full-sphere-medium-desktop-sync-forest.json) | 0.049661 | 0.997714450 | 4.250 |
| [baseline-full-sphere-medium-mobile-sync-broadcast](performance-data/historical-3f/analysis/visual-metrics/comparison-full-sphere-medium-mobile-sync-broadcast.json) | 0.017930 | 0.999105894 | 0.221 |
| [baseline-repeat-full-sphere-high-desktop-sync-forest](performance-data/historical-3f/analysis/visual-metrics/comparison-repeat-full-sphere-high-desktop-sync-forest.json) | 0.062700 | 0.997345476 | 2.551 |
| [baseline-steady-full-hall-low-desktop-cadence-broadcast](performance-data/historical-3f/analysis/visual-metrics/comparison-steady-full-hall-low-desktop-cadence-broadcast.json) | 0.001124 | 0.999975903 | 0.015 |
| [baseline-steady-full-hall-low-mobile-cadence-broadcast](performance-data/historical-3f/analysis/visual-metrics/comparison-steady-full-hall-low-mobile-cadence-broadcast.json) | 0.003592 | 0.999891889 | 0.074 |
| [baseline-steady-full-sphere-low-desktop-cadence-broadcast](performance-data/historical-3f/analysis/visual-metrics/comparison-steady-full-sphere-low-desktop-cadence-broadcast.json) | 0.003419 | 0.999845336 | 0.046 |
| [baseline-steady-full-sphere-low-mobile-cadence-broadcast](performance-data/historical-3f/analysis/visual-metrics/comparison-steady-full-sphere-low-mobile-cadence-broadcast.json) | 0.012655 | 0.999432503 | 0.201 |

auto 두 쌍은 위 수동 비교와 따로 봐야 해. 홀 SSIM 0.869159, 스피어 0.954332이고, 내부 해상도 차이가 있는 영상이야. 후보의 계단·세부 선명도 변화까지 포함하므로 동일 품질 보존의 근거로 쓰지 않았어.

SSIM은 8-bit RGB, alpha를 검정에 합성, 7×7 균일 창, K1=.01, K2=.03, data range=255, 표본 공분산 49/48, 가장자리 3px 제외, RGB 채널 평균이야. 자동 정렬·리사이즈·선형광 변환은 하지 않았어.

## 8. 기능·음향·로딩 검사와 분리한 범위

| 항목 | 이 3f 묶음에 실제 남아 있는 근거 |
| --- | --- |
| 렌더 행렬 | 42개 raw와 종료 상태 42개, 전부 exit 0 / PASS. 엄격한 전후 조건 비교도 완료했어. |
| 단위 테스트 | [case별 TAP 결과](performance-data/historical-3f/node-tests/case-tap/results.json)와 로그에서 9개 파일 69개 case 통과를 확인했어. |
| 소스 통합 검토 | [runtime integration review](performance-data/historical-3f/runtime-integration-review.md)와 source review JSON. 정지한 listener에서 새 로비 음원이 생길 때 캐시가 갱신되지 않던 문제를 수정한 이력이야. |
| 공연 의식 도구 | `rituals.mjs`의 문법·도움말 로그가 있어. 실제 브라우저의 공연 의식 PASS가 아니야. |
| 기능·음향·로딩·방 검증 | 실행 계획과 frozen 도구는 있지만 이 qa-3f 디렉터리에 대응하는 실제 실행 결과는 없어. 계획을 실행 완료로 바꾸지 않았어. |
| 과거 a41의 pause→seek→resume 실패 | 다른 기준 버전의 실패 이력이야. 이 3f 렌더 PASS나 단위 테스트 PASS로 해결됐다고 주장하지 않아. |

렌더 fixture는 실제 AudioEngine을 만들지만 음표 스케줄러를 끄고 합성 연주 시계를 사용해. 이 자료로 실제 음질·음표 정확성·박수 PCM·장시간 오디오 글리치를 검증했다고 말할 수 없어. 소스가 동일하다는 사실과 실제 출력 청취 검사는 서로 다른 근거야.

## 9. 원본 그대로 다시 집계하는 방법

브라우저를 재실행할 필요 없이 Git에 포함된 42 JSON을 검증할 수 있어. 저장소 root에서 다음을 실행해. `--output-root`는 원본 밖의 새 폴더로 지정해.

```bash
node docs/performance-data/historical-3f/collect-summary.mjs   --qa-root docs/performance-data/historical-3f   --tools-root docs/performance-data/historical-3f/bench-source   --output-root /tmp/forest-historical-3f-reanalysis
```

예상 요약은 `status=PASS`, `expectedPairs=21`, `completedPairs=21`, `rows=61`, `adaptive=2`, `excluded=[]`이야. comparator와 browser helper 해시, 원시 입력 해시, served 제품 7파일 해시를 대조해. 결과를 읽는 동안 원본이 바뀌지 않았는지도 다시 확인해.

대표 이미지 한 쌍은 Pillow·NumPy가 설치된 Python으로 다음처럼 비교해. 전체 63쌍을 재집계하려면 전체 증거 압축본의 qa-3f를 먼저 풀어야 해. Git에는 6쌍만 있어.

```bash
python3 docs/performance-data/historical-3f/bench-source/compare-images.py   docs/performance-data/historical-3f/render/baseline-full-sphere-high-desktop-sync-forest.png   docs/performance-data/historical-3f/render/after-full-sphere-high-desktop-sync-forest.png   --output /tmp/forest-historical-3f-forest-image.json

python3 docs/performance-data/historical-3f/recovery/compare-3f-images.py   --qa-root /path/to/unpacked/qa-3f   --output-root /tmp/forest-historical-3f-all-images
```

실제 PC에서 새로 렌더하려면 기준 `3f1655b`와 복구 후보 `2a627fa`를 서로 다른 worktree·포트에서 실행하고 frozen `bench-source/full-frame.mjs`를 양쪽에 똑같이 사용해. 원래 [render-plan](performance-data/historical-3f/render-plan.json)의 품질·기기·장면 순서·준비 수·표본 수를 유지하되 절대 경로와 포트만 현재 환경으로 바꿔야 해. 최신 제품을 검증하려면 그 최신 기준 SHA와 후보 SHA를 별도로 고정하고 결과 디렉터리를 새로 만들어야 해.

원본의 `--single-process`, `--disable-web-security`, SwiftShader 등 컨테이너 전용 브라우저 인자를 실제 PC의 기본 검사에 무조건 복사하면 안 돼. 실제 GPU가 선택됐는지 확인하고, 전후 두 실행 안에서는 브라우저 버전·인자·화면·전원 조건을 같게 유지해. 자세한 Windows/macOS/Linux 실행 절차는 [PC 재현 안내](reproduce-on-pc.md)를 함께 봐 줘.

원본 3f 전체 행렬을 복구한 기록과 최신 main 통합본의 재검증 결과는 끝까지 별도 자료로 유지해야 해. 이 보고서의 수치·버전 라벨·실패 범위를 최신 실행 결과로 덮어쓰면 안 돼.
