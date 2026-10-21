# 렌더 계획 전후 비교

상태: **INCOMPLETE** · 계획 28개 실행 · 유효 2/14쌍

생성 시각: 2026-10-21T12:50:27.367Z

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
| hall / high / desktop / a / front | 8 | 2212.41 → 1802.96 | -18.51 | 2335.80 → 2065.90 | 2335.80 → 2065.90 | 1714.5 → 1711.5 | 11699248 → 7413240 |
| hall / high / desktop / a / wide | 8 | 6962.20 → 7019.99 | 0.83 | 7268.80 → 7464.30 | 7268.80 → 7464.30 | 1822.4 → 1822.4 | 11858282 → 11858282 |
| hall / high / desktop / a / foyer | 8 | 12566.16 → 12827.98 | 2.08 | 13236.70 → 14154.50 | 13236.70 → 14154.50 | 1849.1 → 1849.1 | 11853194 → 11853194 |
| hall / high / desktop / a / rotate | 8 | 3847.79 → 3805.25 | -1.11 | 5114.80 → 5200.40 | 5114.80 → 5200.40 | 703.1 → 743.5 | 11466993 → 9452092 |
| hall / high / desktop / a / broadcast | 8 | 5658.14 → 5512.70 | -2.57 | 6991.00 → 6822.10 | 6991.00 → 6822.10 | 2120.1 → 1886.5 | 17458367 → 14488125 |
| hall / high / desktop / a / broadcast-hidden | 8 | 215.79 → 214.73 | -0.49 | 232.70 → 226.20 | 232.70 → 226.20 | 600.0 → 600.0 | 382877 → 382877 |
| hall / high / desktop / a / broadcast-return | 8 | 5752.21 → 5357.10 | -6.87 | 7195.60 → 6692.50 | 7195.60 → 6692.50 | 2126.8 → 1893.6 | 17460113 → 14501124 |
| hall / high / desktop / a / effects-show | 8 | 5044.68 → 4823.94 | -4.38 | 8432.10 → 7798.10 | 8432.10 → 7798.10 | 1757.8 → 1774.8 | 11705850 → 9261786 |
| sphere / high / desktop / a / front | 8 | 1050.52 → 910.23 | -13.36 | 1216.10 → 1029.10 | 1216.10 → 1029.10 | 1711.6 → 1711.6 | 2267778 → 2267778 |
| sphere / high / desktop / a / wide | 8 | 2931.45 → 2841.76 | -3.06 | 3249.70 → 3014.80 | 3249.70 → 3014.80 | 1785.1 → 1785.1 | 3698975 → 3698975 |
| sphere / high / desktop / a / rotate | 8 | 1542.81 → 1506.34 | -2.36 | 1790.50 → 1700.30 | 1790.50 → 1700.30 | 670.8 → 670.8 | 2858650 → 2858650 |
| sphere / high / desktop / a / dome | 8 | 719.86 → 734.78 | 2.07 | 973.30 → 832.50 | 973.30 → 832.50 | 653.0 → 653.0 | 2557834 → 2557834 |
| sphere / high / desktop / a / forest | 8 | 1896.14 → 2063.80 | 8.84 | 2045.50 → 2254.80 | 2045.50 → 2254.80 | 1761.8 → 1761.8 | 3274726 → 3268138 |
| sphere / high / desktop / a / peaks | 8 | 2058.21 → 2105.27 | 2.29 | 2137.60 → 2409.90 | 2137.60 → 2409.90 | 1761.3 → 1761.3 | 3274582 → 3267994 |
| sphere / high / desktop / a / ocean | 8 | 2389.30 → 2411.35 | 0.92 | 2511.00 → 2491.30 | 2511.00 → 2491.30 | 1765.0 → 1765.0 | 3275662 → 3269074 |
| sphere / high / desktop / a / clouds | 8 | 2331.71 → 2272.16 | -2.55 | 2989.50 → 2355.60 | 2989.50 → 2355.60 | 1764.3 → 1764.3 | 3275446 → 3268858 |
| sphere / high / desktop / a / crossfade | 8 | 2172.19 → 2154.06 | -0.83 | 2352.60 → 2352.50 | 2352.60 → 2352.50 | 1763.3 → 1763.3 | 3323830 → 3317242 |
| sphere / high / desktop / a / reveal | 8 | 2027.11 → 2068.69 | 2.05 | 2123.00 → 2131.70 | 2123.00 → 2131.70 | 1765.5 → 1765.5 | 3324478 → 3317890 |
| sphere / high / desktop / a / broadcast | 8 | 1861.11 → 1995.89 | 7.24 | 2471.20 → 2936.10 | 2471.20 → 2936.10 | 2127.5 → 1849.0 | 4716814 → 4589478 |
| sphere / high / desktop / a / effects-show | 8 | 1865.54 → 1975.64 | 5.90 | 4379.80 → 4713.30 | 4379.80 → 4713.30 | 1778.8 → 1778.8 | 3273434 → 3273434 |

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
| hall / high / desktop / a / front / synchronous-completion | 17732.98 → 14487.55 | 2.70 → 23.91 | 21.61 → 22.62 | 391.01 → 368.12 | 98 → 97 | 1159 → 1143 |
| hall / high / desktop / a / wide / synchronous-completion | 55733.50 → 56201.42 | 2.40 → 2.54 | 24.11 → 24.25 | 391.01 → 368.12 | 98 → 97 | 1202 → 1189 |
| hall / high / desktop / a / foyer / synchronous-completion | 100558.03 → 102656.17 | 3.66 → 2.17 | 23.90 → 24.89 | 391.01 → 368.12 | 98 → 97 | 1211 → 1198 |
| hall / high / desktop / a / rotate / synchronous-completion | 30814.16 → 30468.04 | 1.88 → 1.67 | 24.28 → 25.39 | 391.01 → 368.12 | 98 → 97 | 1233 → 1220 |
| hall / high / desktop / a / broadcast / synchronous-completion | 45295.72 → 44131.07 | 1.71 → 1.98 | 24.46 → 25.65 | 391.01 → 368.12 | 99 → 98 | 1249 → 1236 |
| hall / high / desktop / a / broadcast-hidden / synchronous-completion | 1738.35 → 1730.63 | 0.97 → 1.05 | 25.01 → 25.96 | 391.01 → 368.12 | 99 → 98 | 1249 → 1236 |
| hall / high / desktop / a / broadcast-return / synchronous-completion | 46050.30 → 42883.62 | 3.99 → 1.61 | 24.99 → 26.82 | 391.01 → 368.12 | 99 → 98 | 1251 → 1238 |
| hall / high / desktop / a / effects-show / synchronous-completion | 40401.36 → 38658.47 | 1.66 → 7.36 | 25.35 → 26.63 | 391.01 → 368.12 | 99 → 98 | 1269 → 1256 |
| sphere / high / desktop / a / front / synchronous-completion | 8421.42 → 7296.56 | 1.40 → 1.42 | 63.90 → 66.43 | 414.85 → 440.60 | 69 → 68 | 1150 → 1137 |
| sphere / high / desktop / a / wide / synchronous-completion | 23501.83 → 22760.70 | 11.42 → 1.84 | 58.95 → 57.96 | 414.85 → 440.60 | 69 → 68 | 1188 → 1175 |
| sphere / high / desktop / a / rotate / synchronous-completion | 12363.28 → 12092.91 | 1.19 → 1.18 | 59.06 → 58.70 | 414.85 → 440.60 | 69 → 68 | 1188 → 1175 |
| sphere / high / desktop / a / dome / synchronous-completion | 5774.92 → 5894.49 | 1.20 → 1.19 | 59.36 → 59.02 | 414.85 → 440.60 | 69 → 68 | 1188 → 1175 |
| sphere / high / desktop / a / forest / synchronous-completion | 15189.11 → 16534.97 | 1.60 → 1.33 | 59.93 → 59.59 | 414.85 → 440.60 | 69 → 68 | 1193 → 1180 |
| sphere / high / desktop / a / peaks / synchronous-completion | 16490.25 → 16866.71 | 1.81 → 1.61 | 59.74 → 59.76 | 414.85 → 440.60 | 69 → 68 | 1197 → 1184 |
| sphere / high / desktop / a / ocean / synchronous-completion | 19144.55 → 19318.47 | 1.39 → 1.58 | 59.53 → 59.92 | 414.85 → 440.60 | 69 → 68 | 1197 → 1184 |
| sphere / high / desktop / a / clouds / synchronous-completion | 18679.39 → 18203.99 | 1.33 → 1.39 | 59.91 → 59.83 | 414.85 → 440.60 | 69 → 68 | 1199 → 1186 |
| sphere / high / desktop / a / crossfade / synchronous-completion | 17399.73 → 17254.57 | 1.21 → 1.33 | 60.32 → 60.21 | 414.85 → 440.60 | 70 → 69 | 1202 → 1189 |
| sphere / high / desktop / a / reveal / synchronous-completion | 16242.35 → 16610.90 | 1.88 → 1.24 | 60.66 → 59.85 | 414.85 → 440.60 | 70 → 69 | 1203 → 1190 |
| sphere / high / desktop / a / broadcast / synchronous-completion | 14910.83 → 15992.78 | 1.31 → 2.39 | 60.77 → 60.45 | 414.85 → 440.60 | 71 → 70 | 1206 → 1193 |
| sphere / high / desktop / a / effects-show / synchronous-completion | 14957.67 → 15844.83 | 1.17 → 1.46 | 68.30 → 67.55 | 414.85 → 440.60 | 71 → 70 | 1224 → 1211 |

## 제외·미완료 목록

| 쌍/입력 | 상태 | 이유 |
|---|---|---|
| -a/hall/medium/desktop/sync | PENDING | baseline-a-hall-medium-desktop: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-hall-medium-desktop: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/sphere/medium/desktop/sync | PENDING | baseline-a-sphere-medium-desktop: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-sphere-medium-desktop: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/hall/low/desktop/sync | PENDING | baseline-a-hall-low-desktop: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-hall-low-desktop: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/sphere/low/desktop/sync | PENDING | baseline-a-sphere-low-desktop: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-sphere-low-desktop: PENDING — 계획된 실행 로그가 아직 없어. |
| -a/hall/high/mobile/sync | PENDING | baseline-a-hall-high-mobile: PENDING — 계획된 실행 로그가 아직 없어.; candidate-a-hall-high-mobile: PENDING — 계획된 실행 로그가 아직 없어. |
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
