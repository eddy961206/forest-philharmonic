# 렌더 계획 전후 비교

상태: **PASS** · 계획 8개 실행 · 유효 4/4쌍

생성 시각: 2026-10-22T00:32:16.880Z

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
| hall / high / desktop / a / front | 4 | 2303.95 → 1723.10 | -25.21 | 2398.90 → 1874.10 | 2398.90 → 1874.10 | 1714.0 → 1711.0 | 11561430 → 7275422 |
| hall / high / desktop / a / wide | 4 | 6614.02 → 6658.80 | 0.68 | 6736.50 → 6918.70 | 6736.50 → 6918.70 | 1813.5 → 1813.5 | 11720233 → 11720233 |
| hall / high / desktop / a / broadcast-hidden | 4 | 219.90 → 235.10 | 6.91 | 229.90 → 265.20 | 229.90 → 265.20 | 600.0 → 600.0 | 382877 → 382877 |
| hall / high / desktop / a / broadcast-return | 4 | 5618.33 → 5400.65 | -3.87 | 7031.40 → 6756.40 | 7031.40 → 6756.40 | 2106.5 → 1873.0 | 17252525 → 14287611 |
| sphere / high / desktop / a / front | 4 | 878.10 → 834.87 | -4.92 | 906.10 → 875.80 | 906.10 → 875.80 | 1712.0 → 1712.0 | 2255840 → 2255840 |
| sphere / high / desktop / a / wide | 4 | 2759.67 → 2883.10 | 4.47 | 2869.00 → 2948.40 | 2869.00 → 2948.40 | 1775.0 → 1775.0 | 3503396 → 3503396 |
| sphere / high / desktop / a / forest | 4 | 1920.95 → 1943.45 | 1.17 | 1990.40 → 1979.40 | 1990.40 → 1979.40 | 1742.0 → 1742.0 | 3045660 → 3039072 |
| sphere / high / desktop / a / crossfade | 4 | 2111.32 → 2095.30 | -0.76 | 2151.40 → 2166.40 | 2151.40 → 2166.40 | 1739.0 → 1739.0 | 3093468 → 3086880 |
| sphere / high / desktop / a / broadcast | 4 | 1689.85 → 1646.80 | -2.55 | 2043.20 → 1905.60 | 2043.20 → 1905.60 | 2588.5 → 2310.0 | 4262401 → 4135065 |
| hall / high / desktop / b / front | 4 | 2333.85 → 1860.05 | -20.30 | 2488.70 → 2067.10 | 2488.70 → 2067.10 | 1714.0 → 1711.0 | 11561430 → 7275422 |
| hall / high / desktop / b / wide | 4 | 6810.05 → 6495.50 | -4.62 | 7092.70 → 6648.50 | 7092.70 → 6648.50 | 1813.5 → 1813.5 | 11720233 → 11720233 |
| hall / high / desktop / b / broadcast-hidden | 4 | 227.00 → 229.68 | 1.18 | 233.50 → 243.90 | 233.50 → 243.90 | 600.0 → 600.0 | 382877 → 382877 |
| hall / high / desktop / b / broadcast-return | 4 | 5877.27 → 5247.90 | -10.71 | 7360.00 → 6562.20 | 7360.00 → 6562.20 | 2106.5 → 1873.0 | 17252525 → 14287611 |
| sphere / high / desktop / b / front | 4 | 906.58 → 947.70 | 4.54 | 926.70 → 1025.40 | 926.70 → 1025.40 | 1712.0 → 1712.0 | 2255840 → 2255840 |
| sphere / high / desktop / b / wide | 4 | 2763.65 → 2909.97 | 5.29 | 2799.60 → 3179.00 | 2799.60 → 3179.00 | 1775.0 → 1775.0 | 3503396 → 3503396 |
| sphere / high / desktop / b / forest | 4 | 1843.75 → 1935.77 | 4.99 | 1858.30 → 1993.20 | 1858.30 → 1993.20 | 1742.0 → 1742.0 | 3045660 → 3039072 |
| sphere / high / desktop / b / crossfade | 4 | 2044.33 → 2028.63 | -0.77 | 2170.00 → 2086.60 | 2170.00 → 2086.60 | 1739.0 → 1739.0 | 3093468 → 3086880 |
| sphere / high / desktop / b / broadcast | 4 | 1629.45 → 1564.52 | -3.98 | 1934.10 → 1851.80 | 1934.10 → 1851.80 | 2588.5 → 2310.0 | 4262401 → 4135065 |

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
| hall / high / desktop / a / front / synchronous-completion | 9226.83 → 6900.76 | 0.71 → 0.81 | 47.32 → 34.36 | 391.01 → 368.12 | 98 → 97 | 1157 → 1141 |
| hall / high / desktop / a / wide / synchronous-completion | 26515.12 → 26691.49 | 1.14 → 8.65 | 22.77 → 23.33 | 391.01 → 368.12 | 98 → 97 | 1200 → 1187 |
| hall / high / desktop / a / broadcast-hidden / synchronous-completion | 886.51 → 946.85 | 0.48 → 0.64 | 22.72 → 23.93 | 391.01 → 368.12 | 98 → 97 | 1204 → 1191 |
| hall / high / desktop / a / broadcast-return / synchronous-completion | 22490.57 → 21622.47 | 0.68 → 0.76 | 23.17 → 24.50 | 391.01 → 368.12 | 99 → 98 | 1220 → 1207 |
| sphere / high / desktop / a / front / synchronous-completion | 3519.97 → 3356.57 | 0.90 → 5.32 | 76.46 → 55.31 | 414.85 → 414.85 | 69 → 68 | 1148 → 1135 |
| sphere / high / desktop / a / wide / synchronous-completion | 11051.71 → 11550.56 | 0.66 → 0.81 | 63.34 → 56.34 | 414.85 → 414.85 | 69 → 68 | 1180 → 1167 |
| sphere / high / desktop / a / forest / synchronous-completion | 7706.92 → 7781.91 | 0.90 → 0.60 | 55.27 → 55.14 | 414.85 → 414.85 | 69 → 68 | 1181 → 1168 |
| sphere / high / desktop / a / crossfade / synchronous-completion | 8457.26 → 8411.56 | 1.22 → 0.73 | 56.29 → 56.12 | 414.85 → 414.85 | 70 → 69 | 1183 → 1170 |
| sphere / high / desktop / a / broadcast / synchronous-completion | 6781.33 → 6597.87 | 0.75 → 0.69 | 56.51 → 56.15 | 414.85 → 414.85 | 71 → 70 | 1183 → 1170 |
| hall / high / desktop / b / front / synchronous-completion | 9349.51 → 7451.06 | 1.18 → 1.01 | 25.20 → 47.01 | 391.01 → 368.12 | 98 → 97 | 1157 → 1141 |
| hall / high / desktop / b / wide / synchronous-completion | 27302.49 → 26039.92 | 1.89 → 0.94 | 23.67 → 23.44 | 391.01 → 368.12 | 98 → 97 | 1200 → 1187 |
| hall / high / desktop / b / broadcast-hidden / synchronous-completion | 914.55 → 926.72 | 0.53 → 0.55 | 23.25 → 23.25 | 391.01 → 368.12 | 98 → 97 | 1204 → 1191 |
| hall / high / desktop / b / broadcast-return / synchronous-completion | 23529.26 → 21015.57 | 1.14 → 0.77 | 23.24 → 23.97 | 391.01 → 368.12 | 99 → 98 | 1220 → 1207 |
| sphere / high / desktop / b / front / synchronous-completion | 3633.64 → 3825.21 | 0.82 → 10.09 | 75.84 → 55.46 | 414.85 → 414.85 | 69 → 68 | 1148 → 1135 |
| sphere / high / desktop / b / wide / synchronous-completion | 11069.85 → 11670.12 | 0.92 → 18.02 | 55.53 → 56.23 | 414.85 → 414.85 | 69 → 68 | 1180 → 1167 |
| sphere / high / desktop / b / forest / synchronous-completion | 7385.17 → 7752.27 | 0.68 → 0.63 | 55.73 → 54.99 | 414.85 → 414.85 | 69 → 68 | 1181 → 1168 |
| sphere / high / desktop / b / crossfade / synchronous-completion | 8190.11 → 8125.25 | 0.72 → 0.75 | 55.23 → 55.96 | 414.85 → 414.85 | 70 → 69 | 1183 → 1170 |
| sphere / high / desktop / b / broadcast / synchronous-completion | 6533.06 → 6274.60 | 0.65 → 0.60 | 55.69 → 55.57 | 414.85 → 414.85 | 71 → 70 | 1183 → 1170 |

## 제외·미완료 목록

| 쌍/입력 | 상태 | 이유 |
|---|---|---|
| — | 없음 | 계획된 모든 쌍이 검증됐어. |

## 재현과 원본 추적

사용한 계획·manifest·원시 파일·실행 로그 SHA-256과 파일 경로는 summary.json의 provenance/inputs/jobs에 있어. 제외된 실패 원본도 수정하지 않았어.

- 계획 SHA-256: 428e5748c25e290995aa614045736fa2e912e94518a37fc3fe54ece6e6861c1a
- manifest SHA-256: 504b7dccaa999e723a740d2171e9a347bb663cd985f1debb0f56d7704ac898a9
- 집계기 SHA-256: 9305ce824c4c7f3ff2af6d1bff5e50e70acbcc279bf6561b32e60a3f1eeb15e2
