# 렌더 계획 전후 비교

상태: **INCOMPLETE** · 계획 28개 실행 · 유효 4/14쌍

생성 시각: 2026-10-21T13:19:49.927Z

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
| hall / medium / desktop / a / front | 8 | 2139.72 → 1680.81 | -21.45 | 2313.60 → 1820.20 | 2313.60 → 1820.20 | 1714.5 → 1711.5 | 11699248 → 7413240 |
| hall / medium / desktop / a / wide | 8 | 7040.32 → 7100.65 | 0.86 | 7722.00 → 7436.70 | 7722.00 → 7436.70 | 1822.4 → 1822.4 | 11858282 → 11858282 |
| hall / medium / desktop / a / foyer | 8 | 12663.45 → 13283.07 | 4.89 | 12979.10 → 14020.60 | 12979.10 → 14020.60 | 1849.1 → 1849.1 | 11853194 → 11853194 |
| hall / medium / desktop / a / rotate | 8 | 3847.20 → 3622.34 | -5.84 | 5106.40 → 4835.20 | 5106.40 → 4835.20 | 703.1 → 743.5 | 11466993 → 9452092 |
| hall / medium / desktop / a / broadcast | 8 | 5196.97 → 4819.24 | -7.27 | 6839.50 → 6421.60 | 6839.50 → 6421.60 | 2025.8 → 1854.9 | 16018790 → 13181424 |
| hall / medium / desktop / a / broadcast-hidden | 8 | 163.03 → 173.34 | 6.33 | 168.50 → 194.60 | 168.50 → 194.60 | 600.0 → 600.0 | 382877 → 382877 |
| hall / medium / desktop / a / broadcast-return | 8 | 5198.58 → 4941.51 | -4.94 | 6930.20 → 6540.50 | 6930.20 → 6540.50 | 2032.1 → 1861.5 | 16020473 → 13190009 |
| hall / medium / desktop / a / effects-show | 8 | 4880.16 → 4712.56 | -3.43 | 8006.80 → 8404.50 | 8006.80 → 8404.50 | 1757.8 → 1774.8 | 11705850 → 9261786 |
| sphere / medium / desktop / a / front | 8 | 965.35 → 873.26 | -9.54 | 1124.70 → 992.40 | 1124.70 → 992.40 | 1711.6 → 1711.6 | 2267778 → 2267778 |
| sphere / medium / desktop / a / wide | 8 | 2910.89 → 2697.21 | -7.34 | 3150.60 → 2836.60 | 3150.60 → 2836.60 | 1785.1 → 1785.1 | 3698975 → 3698975 |
| sphere / medium / desktop / a / rotate | 8 | 1363.34 → 1305.13 | -4.27 | 1630.90 → 1490.20 | 1630.90 → 1490.20 | 670.8 → 670.8 | 2858650 → 2858650 |
| sphere / medium / desktop / a / dome | 8 | 668.56 → 662.86 | -0.85 | 859.50 → 739.50 | 859.50 → 739.50 | 653.0 → 653.0 | 2557834 → 2557834 |
| sphere / medium / desktop / a / forest | 8 | 1686.97 → 1553.41 | -7.92 | 1933.50 → 1926.30 | 1933.50 → 1926.30 | 1760.3 → 1760.3 | 3271414 → 3268120 |
| sphere / medium / desktop / a / peaks | 8 | 1576.84 → 1589.81 | 0.82 | 1805.20 → 1954.00 | 1805.20 → 1954.00 | 1759.8 → 1759.8 | 3271270 → 3267976 |
| sphere / medium / desktop / a / ocean | 8 | 1642.61 → 1657.14 | 0.88 | 2119.80 → 2024.10 | 2119.80 → 2024.10 | 1763.5 → 1763.5 | 3272350 → 3269056 |
| sphere / medium / desktop / a / clouds | 8 | 1664.74 → 1641.44 | -1.40 | 2020.60 → 1993.30 | 2020.60 → 1993.30 | 1762.8 → 1762.8 | 3272134 → 3268840 |
| sphere / medium / desktop / a / crossfade | 8 | 1709.10 → 1668.09 | -2.40 | 1976.90 → 1938.50 | 1976.90 → 1938.50 | 1761.8 → 1761.8 | 3320518 → 3317224 |
| sphere / medium / desktop / a / reveal | 8 | 1662.49 → 1779.86 | 7.06 | 1955.00 → 2092.20 | 1955.00 → 2092.20 | 1764.0 → 1764.0 | 3321166 → 3317872 |
| sphere / medium / desktop / a / broadcast | 8 | 1830.58 → 1737.69 | -5.07 | 2565.00 → 2429.50 | 2565.00 → 2429.50 | 2035.4 → 1826.5 | 4354654 → 4259152 |
| sphere / medium / desktop / a / effects-show | 8 | 1975.39 → 1971.49 | -0.20 | 4845.20 → 4829.10 | 4845.20 → 4829.10 | 1778.8 → 1778.8 | 3273434 → 3273434 |
| hall / low / desktop / a / front | 8 | 198.55 → 152.08 | -23.41 | 219.50 → 182.80 | 219.50 → 182.80 | 392.1 → 393.1 | 587557 → 477013 |
| hall / low / desktop / a / wide | 8 | 267.50 → 277.49 | 3.73 | 299.60 → 308.10 | 299.60 → 308.10 | 444.6 → 444.6 | 746437 → 746437 |
| hall / low / desktop / a / foyer | 8 | 415.84 → 446.40 | 7.35 | 447.80 → 501.50 | 447.80 → 501.50 | 453.4 → 453.4 | 740950 → 740950 |
| hall / low / desktop / a / rotate | 8 | 239.11 → 246.64 | 3.15 | 307.60 → 318.80 | 307.60 → 318.80 | 97.4 → 133.1 | 542279 → 490636 |
| hall / low / desktop / a / broadcast | 8 | 244.83 → 241.45 | -1.38 | 253.00 → 259.10 | 253.00 → 259.10 | 419.9 → 430.0 | 589457 → 519761 |
| hall / low / desktop / a / broadcast-hidden | 8 | 77.85 → 88.16 | 13.25 | 80.80 → 97.50 | 80.80 → 97.50 | 34.0 → 34.0 | 146103 → 146103 |
| hall / low / desktop / a / broadcast-return | 8 | 259.79 → 239.99 | -7.62 | 266.10 → 258.40 | 266.10 → 258.40 | 420.0 → 430.0 | 589394 → 519698 |
| hall / low / desktop / a / effects-show | 8 | 430.52 → 483.54 | 12.31 | 1449.00 → 1866.90 | 1449.00 → 1866.90 | 430.0 → 440.0 | 593777 → 524081 |
| sphere / low / desktop / a / front | 8 | 142.76 → 136.65 | -4.28 | 158.00 → 165.70 | 158.00 → 165.70 | 368.9 → 368.9 | 377911 → 377911 |
| sphere / low / desktop / a / wide | 8 | 572.90 → 568.37 | -0.79 | 625.60 → 631.10 | 625.60 → 631.10 | 440.6 → 440.6 | 968855 → 968855 |
| sphere / low / desktop / a / rotate | 8 | 374.72 → 378.96 | 1.13 | 447.30 → 484.70 | 447.30 → 484.70 | 76.3 → 76.3 | 691596 → 691596 |
| sphere / low / desktop / a / dome | 8 | 156.89 → 174.15 | 11.00 | 180.00 → 188.50 | 180.00 → 188.50 | 52.0 → 52.0 | 562616 → 562616 |
| sphere / low / desktop / a / forest | 8 | 239.83 → 248.11 | 3.46 | 293.70 → 282.00 | 293.70 → 282.00 | 412.0 → 412.0 | 821659 → 821659 |
| sphere / low / desktop / a / peaks | 8 | 226.68 → 244.91 | 8.05 | 242.10 → 267.60 | 242.10 → 267.60 | 412.0 → 412.0 | 821673 → 821673 |
| sphere / low / desktop / a / ocean | 8 | 229.62 → 236.58 | 3.03 | 253.30 → 266.90 | 253.30 → 266.90 | 412.0 → 412.0 | 821568 → 821568 |
| sphere / low / desktop / a / clouds | 8 | 230.63 → 254.64 | 10.41 | 266.50 → 332.50 | 266.50 → 332.50 | 412.0 → 412.0 | 821589 → 821589 |
| sphere / low / desktop / a / crossfade | 8 | 291.49 → 290.15 | -0.46 | 320.70 → 311.40 | 320.70 → 311.40 | 413.0 → 413.0 | 833837 → 833837 |
| sphere / low / desktop / a / reveal | 8 | 272.14 → 273.36 | 0.45 | 282.30 → 287.30 | 282.30 → 287.30 | 413.0 → 413.0 | 833774 → 833774 |
| sphere / low / desktop / a / broadcast | 8 | 225.15 → 233.72 | 3.81 | 240.20 → 250.50 | 240.20 → 250.50 | 412.0 → 412.0 | 821652 → 821652 |
| sphere / low / desktop / a / effects-show | 8 | 417.39 → 440.63 | 5.57 | 1593.10 → 1673.10 | 1593.10 → 1673.10 | 429.0 → 429.0 | 826043 → 826043 |

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
| hall / medium / desktop / a / front / synchronous-completion | 17191.33 → 13475.23 | 20.14 → 1.90 | 22.07 → 21.90 | 391.01 → 391.01 | 98 → 97 | 1159 → 1143 |
| hall / medium / desktop / a / wide / synchronous-completion | 56370.42 → 56850.38 | 1.73 → 3.28 | 23.74 → 24.59 | 391.01 → 391.01 | 98 → 97 | 1202 → 1189 |
| hall / medium / desktop / a / foyer / synchronous-completion | 101338.26 → 106296.54 | 2.79 → 2.19 | 24.41 → 24.44 | 391.01 → 391.01 | 98 → 97 | 1211 → 1198 |
| hall / medium / desktop / a / rotate / synchronous-completion | 30800.67 → 29006.82 | 1.61 → 1.76 | 24.70 → 24.78 | 391.01 → 391.01 | 98 → 97 | 1233 → 1220 |
| hall / medium / desktop / a / broadcast / synchronous-completion | 41612.98 → 38583.45 | 1.76 → 1.93 | 25.06 → 25.50 | 391.01 → 391.01 | 99 → 98 | 1249 → 1236 |
| hall / medium / desktop / a / broadcast-hidden / synchronous-completion | 1316.57 → 1399.96 | 1.01 → 0.98 | 25.52 → 25.86 | 391.01 → 391.01 | 99 → 98 | 1249 → 1236 |
| hall / medium / desktop / a / broadcast-return / synchronous-completion | 41616.16 → 39567.54 | 1.77 → 1.74 | 25.35 → 26.03 | 391.01 → 391.01 | 99 → 98 | 1251 → 1238 |
| hall / medium / desktop / a / effects-show / synchronous-completion | 39085.95 → 37750.95 | 1.69 → 1.87 | 25.26 → 28.03 | 391.01 → 391.01 | 99 → 98 | 1269 → 1256 |
| sphere / medium / desktop / a / front / synchronous-completion | 7742.44 → 7022.33 | 1.39 → 7.19 | 62.42 → 58.54 | 414.85 → 440.60 | 69 → 68 | 1150 → 1137 |
| sphere / medium / desktop / a / wide / synchronous-completion | 23391.37 → 21605.50 | 1.71 → 11.09 | 58.49 → 58.68 | 414.85 → 440.60 | 69 → 68 | 1188 → 1175 |
| sphere / medium / desktop / a / rotate / synchronous-completion | 10934.60 → 10473.23 | 1.36 → 1.33 | 59.50 → 58.98 | 414.85 → 440.60 | 69 → 68 | 1188 → 1175 |
| sphere / medium / desktop / a / dome / synchronous-completion | 5368.40 → 5321.88 | 1.18 → 1.34 | 59.79 → 59.12 | 414.85 → 440.60 | 69 → 68 | 1188 → 1175 |
| sphere / medium / desktop / a / forest / synchronous-completion | 13526.48 → 12448.72 | 1.33 → 1.51 | 59.62 → 59.54 | 414.85 → 440.60 | 69 → 68 | 1193 → 1180 |
| sphere / medium / desktop / a / peaks / synchronous-completion | 12635.13 → 12737.62 | 1.45 → 1.36 | 59.49 → 59.46 | 414.85 → 440.60 | 69 → 68 | 1197 → 1184 |
| sphere / medium / desktop / a / ocean / synchronous-completion | 13165.23 → 13275.96 | 1.19 → 1.51 | 60.31 → 60.06 | 414.85 → 440.60 | 69 → 68 | 1197 → 1184 |
| sphere / medium / desktop / a / clouds / synchronous-completion | 13335.10 → 13148.77 | 1.29 → 1.13 | 60.03 → 60.41 | 414.85 → 440.60 | 69 → 68 | 1199 → 1186 |
| sphere / medium / desktop / a / crossfade / synchronous-completion | 13691.42 → 13364.26 | 1.33 → 1.34 | 60.38 → 60.10 | 414.85 → 440.60 | 70 → 69 | 1202 → 1189 |
| sphere / medium / desktop / a / reveal / synchronous-completion | 13317.84 → 14262.72 | 2.30 → 2.15 | 60.74 → 60.42 | 414.85 → 440.60 | 70 → 69 | 1203 → 1190 |
| sphere / medium / desktop / a / broadcast / synchronous-completion | 14665.40 → 13923.34 | 1.48 → 1.40 | 60.34 → 60.54 | 414.85 → 440.60 | 71 → 70 | 1206 → 1193 |
| sphere / medium / desktop / a / effects-show / synchronous-completion | 15834.61 → 15804.12 | 1.49 → 1.30 | 68.27 → 68.32 | 414.85 → 440.60 | 71 → 70 | 1224 → 1211 |
| hall / low / desktop / a / front / synchronous-completion | 1601.80 → 1229.39 | 1.35 → 1.55 | 22.47 → 21.90 | 149.73 → 141.14 | 77 → 76 | 401 → 385 |
| hall / low / desktop / a / wide / synchronous-completion | 2151.83 → 2232.32 | 1.11 → 1.22 | 21.93 → 33.77 | 149.73 → 141.14 | 77 → 76 | 445 → 432 |
| hall / low / desktop / a / foyer / synchronous-completion | 3338.77 → 3582.74 | 1.11 → 1.15 | 26.76 → 38.53 | 149.73 → 141.14 | 77 → 76 | 453 → 440 |
| hall / low / desktop / a / rotate / synchronous-completion | 1924.83 → 1987.74 | 0.98 → 1.11 | 18.23 → 18.28 | 149.73 → 141.14 | 77 → 76 | 477 → 464 |
| hall / low / desktop / a / broadcast / synchronous-completion | 1995.80 → 1964.47 | 1.88 → 1.08 | 15.75 → 17.50 | 149.73 → 141.14 | 77 → 77 | 488 → 478 |
| hall / low / desktop / a / broadcast-hidden / synchronous-completion | 635.24 → 718.70 | 0.96 → 1.24 | 15.60 → 18.03 | 149.73 → 141.14 | 77 → 77 | 488 → 478 |
| hall / low / desktop / a / broadcast-return / synchronous-completion | 2090.38 → 1937.86 | 1.04 → 1.15 | 16.10 → 17.40 | 149.73 → 141.14 | 77 → 77 | 490 → 480 |
| hall / low / desktop / a / effects-show / synchronous-completion | 3457.01 → 3881.27 | 1.38 → 1.17 | 17.99 → 18.84 | 149.73 → 141.14 | 77 → 77 | 508 → 498 |
| sphere / low / desktop / a / front / synchronous-completion | 1154.18 → 1104.93 | 1.16 → 0.99 | 46.76 → 55.27 | 168.80 → 149.73 | 47 → 46 | 375 → 362 |
| sphere / low / desktop / a / wide / synchronous-completion | 4595.02 → 4563.67 | 1.24 → 1.37 | 52.90 → 38.81 | 168.80 → 149.73 | 47 → 46 | 409 → 396 |
| sphere / low / desktop / a / rotate / synchronous-completion | 3010.67 → 3043.71 | 1.18 → 1.07 | 56.31 → 42.20 | 168.80 → 149.73 | 47 → 46 | 411 → 398 |
| sphere / low / desktop / a / dome / synchronous-completion | 1265.77 → 1404.22 | 0.99 → 1.11 | 58.25 → 44.08 | 168.80 → 149.73 | 47 → 46 | 411 → 398 |
| sphere / low / desktop / a / forest / synchronous-completion | 1943.11 → 1997.85 | 1.22 → 1.77 | 32.20 → 47.95 | 168.80 → 149.73 | 47 → 46 | 416 → 403 |
| sphere / low / desktop / a / peaks / synchronous-completion | 1826.69 → 1991.99 | 1.97 → 1.00 | 36.05 → 32.28 | 168.80 → 149.73 | 47 → 46 | 420 → 407 |
| sphere / low / desktop / a / ocean / synchronous-completion | 1847.36 → 1905.59 | 1.03 → 1.10 | 39.61 → 32.76 | 168.80 → 149.73 | 47 → 46 | 420 → 407 |
| sphere / low / desktop / a / clouds / synchronous-completion | 1880.28 → 2052.14 | 0.93 → 1.09 | 32.57 → 32.97 | 168.80 → 149.73 | 47 → 46 | 422 → 409 |
| sphere / low / desktop / a / crossfade / synchronous-completion | 2344.20 → 2332.46 | 1.11 → 0.97 | 32.63 → 33.07 | 168.80 → 149.73 | 47 → 46 | 425 → 412 |
| sphere / low / desktop / a / reveal / synchronous-completion | 2188.95 → 2207.64 | 0.88 → 0.98 | 32.98 → 33.18 | 168.80 → 149.73 | 47 → 46 | 426 → 413 |
| sphere / low / desktop / a / broadcast / synchronous-completion | 1815.56 → 1881.38 | 0.94 → 0.94 | 33.20 → 34.85 | 168.80 → 149.73 | 47 → 47 | 429 → 416 |
| sphere / low / desktop / a / effects-show / synchronous-completion | 3351.59 → 3540.99 | 1.09 → 1.45 | 36.37 → 34.89 | 168.80 → 149.73 | 47 → 47 | 447 → 434 |

## 제외·미완료 목록

| 쌍/입력 | 상태 | 이유 |
|---|---|---|
| -a/hall/high/desktop/sync | PENDING | baseline-a-hall-high-desktop: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-hall-high-desktop: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/sphere/high/desktop/sync | PENDING | baseline-a-sphere-high-desktop: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-sphere-high-desktop: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/hall/high/mobile/sync | PENDING | baseline-a-hall-high-mobile: RUNNING — 실행 중인 결과는 집계하지 않아.; candidate-a-hall-high-mobile: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/sphere/high/mobile/sync | PENDING | baseline-a-sphere-high-mobile: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-sphere-high-mobile: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/hall/medium/mobile/sync | PENDING | baseline-a-hall-medium-mobile: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-hall-medium-mobile: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/sphere/medium/mobile/sync | PENDING | baseline-a-sphere-medium-mobile: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-sphere-medium-mobile: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/hall/low/mobile/sync | PENDING | baseline-a-hall-low-mobile: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-hall-low-mobile: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/sphere/low/mobile/sync | PENDING | baseline-a-sphere-low-mobile: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-sphere-low-mobile: PENDING — 계획된 실행 로그가 아직 없어. |
| -b/hall/high/desktop/sync | PENDING | baseline-b-hall-high-desktop: PENDING — 계획된 실행 로그가 아직 없어.; candidate-b-hall-high-desktop: PENDING — 계획된 실행 로그가 아직 없어. |
| -b/sphere/high/desktop/sync | PENDING | baseline-b-sphere-high-desktop: PENDING — 계획된 실행 로그가 아직 없어.; candidate-b-sphere-high-desktop: PENDING — 계획된 실행 로그가 아직 없어. |

## 재현과 원본 추적

사용한 계획·manifest·원시 파일·실행 로그 SHA-256과 파일 경로는 summary.json의 provenance/inputs/jobs에 있어. 제외된 실패 원본도 수정하지 않았어.

- 계획 SHA-256: 6259727537dbd446e56ef3e5fa23b41c847fecd3c17a2a0cc28aa79ff40d8dc1
- manifest SHA-256: d28ee8fae2fd8ff836d82855e7b84b749c905cdeb5740d8ed72e562c6730c84d
- 집계기 SHA-256: 9305ce824c4c7f3ff2af6d1bff5e50e70acbcc279bf6561b32e60a3f1eeb15e2
