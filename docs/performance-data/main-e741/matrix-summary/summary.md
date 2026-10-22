# 렌더 계획 전후 비교

상태: **PASS** · 계획 20개 실행 · 유효 10/10쌍

생성 시각: 2026-10-22T00:46:57.517Z

## 해석과 측정 범위

- 전체 frame() + readPixels 완료 시간(ms). GPU 완료 대기·QA 오버헤드가 포함되며 실제 앱 FPS나 순수 GPU 시간이 아니야. sync에는 FPS 필드를 만들지 않아.
- 통제된 native rAF callback 시작 간격. observedRafFps=1000/평균 간격. 1% Low는 n>=100일 때만 느린 상위 ceil(n*.01)개 간격 평균의 역수야.
- 실제 음표 스케줄러가 꺼져 있고 음악 시각·카메라·관객 시드가 제어돼. 실제 오디오/입력 부하나 실기기 FPS를 증명하지 않아.
- auto는 프리셋·scale이 변할 수 있는 별도 관찰. 같은 화질 성능 개선율에 포함하지 않아.
- CDP TaskDuration/ScriptDuration 등은 해당 장면 수집 창의 누적 카운터 차이(ms). TaskDuration은 동기 대기를 포함할 수 있어 CPU 점유율로 해석하지 않아. cadence는 N개 간격 수집에 N+1회 step을 실행해.
- sample.times의 호출 경과 시간 평균. renderSubmit/worlds/broadcast 등은 서로 중첩될 수 있어 합계가 CPU 프레임 시간이 아니야. 미호출 프레임은 0, 어느 한 실행에 단계 자체가 없으면 변화율은 null이야.
- performance.memory 표본과 CDP JSHeapUsedSize를 별도로 기록해. 서로 다른 JS heap 관찰값이며 GPU 메모리/오디오 버퍼 전체 사용량이 아니야. texture/geometry는 개수야.
- GPU 타이머 extension 지원 여부만으로 GPU 프레임 시간을 측정했다고 간주하지 않아. GPU 시간/VRAM 사용량은 null(미측정)이야.
- manifest의 제공된 파일 SHA와 실제 served source 전후 SHA를 대조해. manifest에만 있고 served 해시가 없는 파일은 jobs.sourceCoverage.notServedHashed에 남겨. candidateParent는 후보 작업의 부모 커밋 표기이며 served 해시가 실제 측정 코드의 근거야.
- 동일 입력/프리셋/실제 scale/viewport/fixture 검증은 시각적 동등성의 필요조건이야. screenshot 육안/이미지 비교는 이 도구가 하지 않아.
- 반복 a/b를 개별 행으로 보존해. 같은 실행의 장면/프레임을 독립 반복처럼 세거나 모든 행의 개선율을 평균하지 않아. 작은 n의 p95/p99는 최대 한 프레임에 좌우될 수 있어.
- 실패·진행 중·누락·조건 불일치 쌍은 제외 목록에 남겨. 악화된 유효 행은 숨기지 않아. 하나라도 제외되면 exit 1이며 완료된 유효 쌍의 부분 결과는 남겨.
- 미측정 값, 100표본 미만 1% Low, 0분모 변화율은 null/미측정으로 표시해. mobile은 브라우저 viewport/UA/touch 에뮬레이션이야.

## 동일 품질: 동기 완료 시간

모든 화살표는 기준 → 후보야. 양수 시간 변화율은 악화, 음수는 개선이야. 반복 결과를 합치지 않았어.

| 공연장 / 품질 / 기기 / 반복 / 장면 | n | 평균 ms | 변화 % | p95 ms | p99 ms | Draw Calls | Triangles |
|---|---:|---:|---:|---:|---:|---:|---:|
| hall / medium / desktop / matrix / front | 4 | 2281.92 → 1703.15 | -25.36 | 2374.60 → 1857.50 | 2374.60 → 1857.50 | 1714.0 → 1711.0 | 11561430 → 7275422 |
| hall / medium / desktop / matrix / wide | 4 | 6540.28 → 6493.17 | -0.72 | 6603.90 → 6622.20 | 6603.90 → 6622.20 | 1813.5 → 1813.5 | 11720233 → 11720233 |
| hall / medium / desktop / matrix / broadcast-hidden | 4 | 163.88 → 159.13 | -2.90 | 166.30 → 166.20 | 166.30 → 166.20 | 600.0 → 600.0 | 382877 → 382877 |
| hall / medium / desktop / matrix / broadcast-return | 4 | 5817.63 → 4931.80 | -15.23 | 8125.80 → 6282.90 | 8125.80 → 6282.90 | 2106.3 → 1872.8 | 17252522 → 14287608 |
| sphere / medium / desktop / matrix / front | 4 | 776.20 → 785.22 | 1.16 | 813.20 → 809.50 | 813.20 → 809.50 | 1712.0 → 1712.0 | 2255840 → 2255840 |
| sphere / medium / desktop / matrix / wide | 4 | 2560.80 → 2593.93 | 1.29 | 2646.30 → 2708.40 | 2646.30 → 2708.40 | 1775.0 → 1775.0 | 3503396 → 3503396 |
| sphere / medium / desktop / matrix / forest | 4 | 1482.95 → 1572.05 | 6.01 | 1704.80 → 1779.60 | 1704.80 → 1779.60 | 1740.5 → 1740.5 | 3042348 → 3039054 |
| sphere / medium / desktop / matrix / crossfade | 4 | 1564.18 → 1569.50 | 0.34 | 1827.80 → 1805.00 | 1827.80 → 1805.00 | 1737.5 → 1737.5 | 3090156 → 3086862 |
| sphere / medium / desktop / matrix / broadcast | 4 | 1991.98 → 1637.05 | -17.82 | 3602.60 → 1938.10 | 3602.60 → 1938.10 | 2588.3 → 2309.8 | 4268809 → 4141473 |
| hall / low / desktop / matrix / front | 4 | 195.70 → 158.38 | -19.07 | 226.90 → 168.60 | 226.90 → 168.60 | 391.0 → 392.0 | 587128 → 476584 |
| hall / low / desktop / matrix / wide | 4 | 269.43 → 282.65 | 4.91 | 272.30 → 296.20 | 272.30 → 296.20 | 435.0 → 435.0 | 745865 → 745865 |
| hall / low / desktop / matrix / broadcast-hidden | 4 | 92.95 → 89.65 | -3.55 | 114.80 → 92.90 | 114.80 → 92.90 | 34.0 → 34.0 | 146103 → 146103 |
| hall / low / desktop / matrix / broadcast-return | 4 | 254.80 → 256.20 | 0.55 | 263.80 → 285.60 | 263.80 → 285.60 | 403.0 → 413.0 | 588954 → 519258 |
| sphere / low / desktop / matrix / front | 4 | 132.88 → 123.70 | -6.90 | 141.20 → 144.60 | 141.20 → 144.60 | 368.0 → 368.0 | 378982 → 378982 |
| sphere / low / desktop / matrix / wide | 4 | 530.08 → 534.27 | 0.79 | 553.60 → 567.20 | 553.60 → 567.20 | 432.0 → 432.0 | 967350 → 967350 |
| sphere / low / desktop / matrix / forest | 4 | 246.18 → 220.50 | -10.43 | 263.60 → 232.10 | 263.60 → 232.10 | 395.0 → 395.0 | 823810 → 823810 |
| sphere / low / desktop / matrix / crossfade | 4 | 279.85 → 281.72 | 0.67 | 297.80 → 293.90 | 297.80 → 293.90 | 396.0 → 396.0 | 836114 → 836114 |
| sphere / low / desktop / matrix / broadcast | 4 | 229.87 → 230.30 | 0.18 | 238.90 → 244.20 | 238.90 → 244.20 | 395.0 → 395.0 | 823852 → 823852 |
| hall / high / mobile / matrix / front | 4 | 451.50 → 424.02 | -6.09 | 469.00 → 433.30 | 469.00 → 433.30 | 537.0 → 540.0 | 686724 → 591336 |
| hall / high / mobile / matrix / wide | 4 | 728.00 → 729.30 | 0.18 | 765.90 → 767.40 | 765.90 → 767.40 | 662.0 → 698.0 | 873513 → 864345 |
| hall / high / mobile / matrix / broadcast-hidden | 4 | 222.95 → 212.80 | -4.55 | 230.30 → 220.40 | 230.30 → 220.40 | 261.0 → 261.0 | 273751 → 273751 |
| hall / high / mobile / matrix / broadcast-return | 4 | 698.47 → 666.50 | -4.58 | 817.40 → 763.40 | 817.40 → 763.40 | 798.5 → 726.5 | 1074100 → 935307 |
| sphere / high / mobile / matrix / front | 4 | 398.12 → 424.93 | 6.73 | 405.80 → 453.60 | 405.80 → 453.60 | 516.0 → 516.0 | 475362 → 475362 |
| sphere / high / mobile / matrix / wide | 4 | 903.95 → 986.60 | 9.14 | 930.00 → 1045.30 | 930.00 → 1045.30 | 628.0 → 628.0 | 826182 → 826182 |
| sphere / high / mobile / matrix / forest | 4 | 568.18 → 562.27 | -1.04 | 594.90 → 585.90 | 594.90 → 585.90 | 611.0 → 611.0 | 764534 → 764534 |
| sphere / high / mobile / matrix / crossfade | 4 | 610.70 → 620.45 | 1.60 | 647.30 → 645.30 | 647.30 → 645.30 | 612.0 → 612.0 | 776838 → 776838 |
| sphere / high / mobile / matrix / broadcast | 4 | 722.97 → 589.90 | -18.41 | 858.70 → 638.40 | 858.70 → 638.40 | 906.0 → 798.0 | 1067694 → 1004441 |
| hall / medium / mobile / matrix / front | 4 | 399.50 → 380.55 | -4.74 | 417.90 → 424.70 | 417.90 → 424.70 | 537.0 → 540.0 | 686724 → 591336 |
| hall / medium / mobile / matrix / wide | 4 | 659.57 → 725.15 | 9.94 | 694.60 → 764.20 | 694.60 → 764.20 | 662.0 → 698.0 | 873513 → 864345 |
| hall / medium / mobile / matrix / broadcast-hidden | 4 | 166.90 → 168.65 | 1.05 | 168.80 → 169.60 | 168.80 → 169.60 | 261.0 → 261.0 | 273751 → 273751 |
| hall / medium / mobile / matrix / broadcast-return | 4 | 800.27 → 602.28 | -24.74 | 1481.90 → 704.60 | 1481.90 → 704.60 | 798.5 → 726.5 | 1074100 → 935307 |
| sphere / medium / mobile / matrix / front | 4 | 348.00 → 331.25 | -4.81 | 366.00 → 337.00 | 366.00 → 337.00 | 516.0 → 516.0 | 475362 → 475362 |
| sphere / medium / mobile / matrix / wide | 4 | 850.92 → 782.38 | -8.06 | 870.40 → 841.80 | 870.40 → 841.80 | 628.0 → 628.0 | 826182 → 826182 |
| sphere / medium / mobile / matrix / forest | 4 | 491.00 → 515.25 | 4.94 | 514.70 → 522.60 | 514.70 → 522.60 | 611.0 → 611.0 | 764534 → 764534 |
| sphere / medium / mobile / matrix / crossfade | 4 | 550.70 → 557.53 | 1.24 | 589.60 → 566.20 | 589.60 → 566.20 | 612.0 → 612.0 | 776838 → 776838 |
| sphere / medium / mobile / matrix / broadcast | 4 | 833.65 → 526.68 | -36.82 | 1874.50 → 602.30 | 1874.50 → 602.30 | 906.0 → 798.0 | 1067708 → 1004455 |
| hall / low / mobile / matrix / front | 4 | 198.25 → 262.63 | 32.47 | 207.40 → 485.70 | 207.40 → 485.70 | 310.0 → 313.0 | 559076 → 463688 |
| hall / low / mobile / matrix / wide | 4 | 313.77 → 341.42 | 8.81 | 315.50 → 406.70 | 315.50 → 406.70 | 435.0 → 471.0 | 745865 → 736697 |
| hall / low / mobile / matrix / broadcast-hidden | 4 | 100.47 → 102.38 | 1.89 | 105.40 → 107.90 | 105.40 → 107.90 | 34.0 → 34.0 | 146103 → 146103 |
| hall / low / mobile / matrix / broadcast-return | 4 | 288.20 → 271.10 | -5.93 | 299.10 → 284.40 | 299.10 → 284.40 | 392.0 → 407.0 | 587998 → 521326 |
| sphere / low / mobile / matrix / front | 4 | 168.82 → 153.03 | -9.36 | 182.10 → 162.70 | 182.10 → 162.70 | 286.0 → 286.0 | 348842 → 348842 |
| sphere / low / mobile / matrix / wide | 4 | 493.00 → 488.57 | -0.90 | 505.20 → 536.30 | 505.20 → 536.30 | 398.0 → 398.0 | 699662 → 699662 |
| sphere / low / mobile / matrix / forest | 4 | 218.10 → 215.87 | -1.02 | 224.30 → 228.40 | 224.30 → 228.40 | 381.0 → 381.0 | 638014 → 638014 |
| sphere / low / mobile / matrix / crossfade | 4 | 261.40 → 271.12 | 3.72 | 266.10 → 308.80 | 266.10 → 308.80 | 382.0 → 382.0 | 650318 → 650318 |
| sphere / low / mobile / matrix / broadcast | 4 | 204.32 → 234.70 | 14.87 | 224.00 → 280.20 | 224.00 → 280.20 | 381.0 → 381.0 | 638056 → 638056 |

## 동일 품질: rAF cadence 관찰

| 공연장 / 품질 / 기기 / 반복 / 장면 | n | 관찰 FPS | 1% Low FPS | 평균 간격 ms | p95 ms |
|---|---:|---:|---:|---:|---:|

이 계획에서 완료·검증된 cadence 쌍이 없어.

## 적응형 품질 관찰

| 공연장 / 품질 / 기기 / 반복 / 장면 | 관찰 FPS | p95 ms | 실제 품질 표본 수 (기준 → 후보) | 실제 scale 표본 수 (기준 → 후보) |
|---|---:|---:|---|---|

이 계획에서 완료·검증된 auto 쌍이 없어.

## 장면 수집 창의 CDP 시간과 JS 메모리

Task/Script는 장면 전체 누적 시간 차이야. 메모리는 각 수집 종료 시점 값이며 GC 차이가 포함될 수 있어. 단계별 호출 시간과 나머지 카운터는 summary.json에 모두 남겼어.

| 공연장 / 품질 / 기기 / 반복 / 장면 / 모드 | CDP Task ms | CDP Script ms | CDP Heap MiB | sample Heap MiB | Textures | Geometries |
|---|---:|---:|---:|---:|---:|---:|
| hall / medium / desktop / matrix / front / synchronous-completion | 9138.88 → 6824.81 | 0.89 → 0.84 | 39.68 → 25.64 | 391.01 → 368.12 | 98 → 97 | 1157 → 1141 |
| hall / medium / desktop / matrix / wide / synchronous-completion | 26186.54 → 26044.91 | 8.68 → 11.71 | 23.18 → 23.45 | 391.01 → 368.12 | 98 → 97 | 1200 → 1187 |
| hall / medium / desktop / matrix / broadcast-hidden / synchronous-completion | 662.96 → 642.38 | 0.52 → 0.64 | 23.91 → 23.97 | 391.01 → 368.12 | 98 → 97 | 1204 → 1191 |
| hall / medium / desktop / matrix / broadcast-return / synchronous-completion | 23288.63 → 19745.94 | 0.96 → 0.71 | 24.34 → 24.33 | 391.01 → 368.12 | 99 → 98 | 1220 → 1207 |
| sphere / medium / desktop / matrix / front / synchronous-completion | 3113.17 → 3147.52 | 0.66 → 0.80 | 69.02 → 74.88 | 414.85 → 414.85 | 69 → 68 | 1148 → 1135 |
| sphere / medium / desktop / matrix / wide / synchronous-completion | 10284.93 → 10407.56 | 0.97 → 22.89 | 55.98 → 55.78 | 414.85 → 414.85 | 69 → 68 | 1180 → 1167 |
| sphere / medium / desktop / matrix / forest / synchronous-completion | 5948.73 → 6298.11 | 9.27 → 0.59 | 55.87 → 55.49 | 414.85 → 414.85 | 69 → 68 | 1181 → 1168 |
| sphere / medium / desktop / matrix / crossfade / synchronous-completion | 6264.07 → 6288.49 | 0.56 → 0.79 | 55.98 → 55.69 | 414.85 → 414.85 | 70 → 69 | 1183 → 1170 |
| sphere / medium / desktop / matrix / broadcast / synchronous-completion | 7979.67 → 6578.48 | 0.70 → 1.23 | 56.37 → 56.37 | 414.85 → 414.85 | 71 → 70 | 1183 → 1170 |
| hall / low / desktop / matrix / front / synchronous-completion | 792.45 → 639.76 | 0.65 → 0.47 | 18.10 → 19.04 | 149.73 → 141.14 | 77 → 76 | 398 → 382 |
| hall / low / desktop / matrix / wide / synchronous-completion | 1083.47 → 1136.90 | 0.55 → 0.53 | 27.68 → 28.54 | 149.73 → 141.14 | 77 → 76 | 442 → 429 |
| hall / low / desktop / matrix / broadcast-hidden / synchronous-completion | 379.17 → 364.79 | 0.70 → 0.73 | 17.52 → 30.27 | 149.73 → 141.14 | 77 → 76 | 446 → 433 |
| hall / low / desktop / matrix / broadcast-return / synchronous-completion | 1025.45 → 1030.59 | 0.54 → 0.49 | 20.43 → 31.20 | 149.73 → 141.14 | 77 → 77 | 456 → 450 |
| sphere / low / desktop / matrix / front / synchronous-completion | 538.43 → 505.35 | 0.45 → 0.59 | 52.31 → 35.90 | 179.29 → 159.26 | 47 → 46 | 373 → 360 |
| sphere / low / desktop / matrix / wide / synchronous-completion | 2126.10 → 2142.95 | 0.61 → 0.69 | 56.32 → 39.86 | 179.29 → 159.26 | 47 → 46 | 404 → 391 |
| sphere / low / desktop / matrix / forest / synchronous-completion | 990.66 → 887.50 | 0.61 → 0.44 | 58.75 → 42.15 | 179.29 → 159.26 | 47 → 46 | 405 → 392 |
| sphere / low / desktop / matrix / crossfade / synchronous-completion | 1141.17 → 1132.32 | 5.79 → 0.56 | 32.73 → 44.32 | 179.29 → 159.26 | 47 → 46 | 407 → 394 |
| sphere / low / desktop / matrix / broadcast / synchronous-completion | 926.41 → 927.31 | 0.50 → 0.55 | 34.93 → 44.98 | 179.29 → 159.26 | 47 → 47 | 407 → 394 |
| hall / high / mobile / matrix / front / synchronous-completion | 1818.46 → 1703.67 | 0.81 → 0.75 | 16.99 → 17.13 | 149.73 → 141.14 | 92 → 91 | 371 → 355 |
| hall / high / mobile / matrix / wide / synchronous-completion | 2918.42 → 2923.89 | 0.71 → 0.73 | 27.21 → 27.31 | 149.73 → 141.14 | 92 → 91 | 443 → 427 |
| hall / high / mobile / matrix / broadcast-hidden / synchronous-completion | 897.60 → 856.50 | 0.55 → 0.50 | 16.31 → 29.35 | 149.73 → 141.14 | 92 → 91 | 447 → 431 |
| hall / high / mobile / matrix / broadcast-return / synchronous-completion | 2804.64 → 2672.90 | 2.07 → 1.01 | 20.36 → 33.37 | 149.73 → 141.14 | 93 → 92 | 464 → 451 |
| sphere / high / mobile / matrix / front / synchronous-completion | 1599.34 → 1708.28 | 0.63 → 0.57 | 39.15 → 37.24 | 202.18 → 159.26 | 62 → 61 | 346 → 333 |
| sphere / high / mobile / matrix / wide / synchronous-completion | 3624.72 → 3953.21 | 1.25 → 0.97 | 43.90 → 42.04 | 202.18 → 159.26 | 62 → 61 | 392 → 379 |
| sphere / high / mobile / matrix / forest / synchronous-completion | 2279.81 → 2255.33 | 0.57 → 0.51 | 46.95 → 44.96 | 202.18 → 159.26 | 62 → 61 | 393 → 380 |
| sphere / high / mobile / matrix / crossfade / synchronous-completion | 2447.96 → 2487.28 | 0.52 → 0.55 | 49.43 → 47.40 | 202.18 → 159.26 | 62 → 61 | 395 → 382 |
| sphere / high / mobile / matrix / broadcast / synchronous-completion | 2920.31 → 2397.39 | 0.58 → 0.59 | 33.12 → 33.25 | 202.18 → 159.26 | 63 → 62 | 395 → 382 |
| hall / medium / mobile / matrix / front / synchronous-completion | 1604.07 → 1529.91 | 0.69 → 0.79 | 17.94 → 19.47 | 159.26 → 141.14 | 92 → 91 | 371 → 355 |
| hall / medium / mobile / matrix / wide / synchronous-completion | 2645.04 → 2907.14 | 0.85 → 0.74 | 28.28 → 29.83 | 159.26 → 141.14 | 92 → 91 | 443 → 427 |
| hall / medium / mobile / matrix / broadcast-hidden / synchronous-completion | 673.10 → 679.97 | 0.48 → 0.55 | 17.34 → 31.88 | 159.26 → 141.14 | 92 → 91 | 447 → 431 |
| hall / medium / mobile / matrix / broadcast-return / synchronous-completion | 3207.16 → 2416.07 | 0.56 → 0.72 | 21.22 → 35.76 | 159.26 → 141.14 | 93 → 92 | 464 → 451 |
| sphere / medium / mobile / matrix / front / synchronous-completion | 1398.57 → 1333.61 | 0.60 → 0.59 | 50.12 → 36.18 | 189.78 → 159.26 | 62 → 61 | 346 → 333 |
| sphere / medium / mobile / matrix / wide / synchronous-completion | 3410.03 → 3137.55 | 0.78 → 0.85 | 55.13 → 40.90 | 189.78 → 159.26 | 62 → 61 | 392 → 379 |
| sphere / medium / mobile / matrix / forest / synchronous-completion | 1970.83 → 2068.91 | 0.56 → 0.60 | 58.31 → 43.70 | 189.78 → 159.26 | 62 → 61 | 393 → 380 |
| sphere / medium / mobile / matrix / crossfade / synchronous-completion | 2209.08 → 2235.95 | 0.65 → 0.56 | 60.82 → 46.25 | 189.78 → 159.26 | 62 → 61 | 395 → 382 |
| sphere / medium / mobile / matrix / broadcast / synchronous-completion | 3356.05 → 2113.40 | 4.24 → 0.58 | 33.58 → 49.40 | 189.78 → 159.26 | 63 → 62 | 395 → 382 |
| hall / low / mobile / matrix / front / synchronous-completion | 800.05 → 1059.62 | 0.63 → 0.93 | 25.12 → 18.69 | 141.14 → 124.93 | 77 → 76 | 323 → 307 |
| hall / low / mobile / matrix / wide / synchronous-completion | 1260.95 → 1371.81 | 0.64 → 0.61 | 20.44 → 28.53 | 141.14 → 124.93 | 77 → 76 | 442 → 426 |
| hall / low / mobile / matrix / broadcast-hidden / synchronous-completion | 407.18 → 414.71 | 0.51 → 0.49 | 22.31 → 30.27 | 141.14 → 124.93 | 77 → 76 | 446 → 430 |
| hall / low / mobile / matrix / broadcast-return / synchronous-completion | 1157.47 → 1091.42 | 0.53 → 0.66 | 25.19 → 30.13 | 141.14 → 124.93 | 77 → 77 | 456 → 450 |
| sphere / low / mobile / matrix / front / synchronous-completion | 681.68 → 618.42 | 0.60 → 0.46 | 48.63 → 57.83 | 189.78 → 159.26 | 47 → 46 | 297 → 284 |
| sphere / low / mobile / matrix / wide / synchronous-completion | 1978.03 → 1960.21 | 0.63 → 0.58 | 53.10 → 38.77 | 189.78 → 159.26 | 47 → 46 | 391 → 378 |
| sphere / low / mobile / matrix / forest / synchronous-completion | 877.64 → 869.08 | 0.66 → 0.60 | 55.53 → 41.09 | 189.78 → 159.26 | 47 → 46 | 392 → 379 |
| sphere / low / mobile / matrix / crossfade / synchronous-completion | 1051.35 → 1090.03 | 0.56 → 0.62 | 57.71 → 43.22 | 189.78 → 159.26 | 47 → 46 | 394 → 381 |
| sphere / low / mobile / matrix / broadcast / synchronous-completion | 822.79 → 945.64 | 0.48 → 0.75 | 59.93 → 44.29 | 189.78 → 159.26 | 47 → 47 | 394 → 381 |

## 제외·미완료 목록

| 쌍/입력 | 상태 | 이유 |
|---|---|---|
| — | 없음 | 계획된 모든 쌍이 검증됐어. |

## 재현과 원본 추적

사용한 계획·manifest·원시 파일·실행 로그 SHA-256과 파일 경로는 summary.json의 provenance/inputs/jobs에 있어. 제외된 실패 원본도 수정하지 않았어.

- 계획 SHA-256: e9ed652ec45046ad1bc22ec7690cb66bcc0210c33fc34cf9fd23b8015aab13c9
- manifest SHA-256: 504b7dccaa999e723a740d2171e9a347bb663cd985f1debb0f56d7704ac898a9
- 집계기 SHA-256: 9305ce824c4c7f3ff2af6d1bff5e50e70acbcc279bf6561b32e60a3f1eeb15e2
