# 렌더 계획 전후 비교

상태: **PASS** · 계획 4개 실행 · 유효 2/2쌍

생성 시각: 2026-10-22T04:32:34.043Z

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
| hall / medium / desktop / special / foyer | 4 | 11858.63 → 11992.40 | 1.13 | 11905.90 → 12344.40 | 11905.90 → 12344.40 | 1835.0 → 1835.0 | 11714991 → 11714991 |
| hall / medium / desktop / special / rotate | 4 | 3318.47 → 2934.05 | -11.58 | 3823.50 → 3487.40 | 3823.50 → 3487.40 | 1109.0 → 1148.8 | 11445566 → 9037922 |
| hall / medium / desktop / special / effects-show | 4 | 5439.07 → 4970.63 | -8.61 | 8244.40 → 7713.30 | 8244.40 → 7713.30 | 1741.0 → 1758.0 | 11567928 → 9123864 |
| sphere / medium / desktop / special / dome | 4 | 601.67 → 579.20 | -3.74 | 610.80 → 600.80 | 610.80 → 600.80 | 646.0 → 646.0 | 2310154 → 2310154 |
| sphere / medium / desktop / special / peaks | 4 | 1496.50 → 1533.95 | 2.50 | 1715.30 → 1769.40 | 1715.30 → 1769.40 | 1739.5 → 1739.5 | 3042060 → 3038766 |
| sphere / medium / desktop / special / ocean | 4 | 1539.18 → 1637.55 | 6.39 | 1843.90 → 1878.80 | 1843.90 → 1878.80 | 1740.5 → 1740.5 | 3042348 → 3039054 |
| sphere / medium / desktop / special / clouds | 4 | 1653.67 → 1688.03 | 2.08 | 1945.90 → 1936.20 | 1945.90 → 1936.20 | 1736.5 → 1736.5 | 3041196 → 3037902 |
| sphere / medium / desktop / special / reveal | 4 | 1595.65 → 1603.70 | 0.50 | 1876.60 → 1800.20 | 1876.60 → 1800.20 | 1740.0 → 1740.0 | 3090876 → 3087582 |
| sphere / medium / desktop / special / rotate | 4 | 1010.00 → 1027.30 | 1.71 | 1129.60 → 1147.40 | 1129.60 → 1147.40 | 849.3 → 849.3 | 2783738 → 2783738 |
| sphere / medium / desktop / special / effects-show | 4 | 2266.47 → 2288.15 | 0.96 | 4655.30 → 4874.80 | 4655.30 → 4874.80 | 1755.5 → 1755.5 | 3043360 → 3043360 |

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
| hall / medium / desktop / special / foyer / synchronous-completion | 47489.45 → 48026.54 | 9.51 → 9.74 | 22.32 → 22.69 | 414.85 → 391.01 | 98 → 97 | 1203 → 1190 |
| hall / medium / desktop / special / rotate / synchronous-completion | 13295.02 → 11755.37 | 0.97 → 0.77 | 23.17 → 23.76 | 414.85 → 391.01 | 98 → 97 | 1204 → 1191 |
| hall / medium / desktop / special / effects-show / synchronous-completion | 21802.25 → 19921.28 | 1.13 → 5.36 | 28.36 → 31.40 | 414.85 → 391.01 | 98 → 97 | 1222 → 1209 |
| sphere / medium / desktop / special / dome / synchronous-completion | 2415.98 → 2324.45 | 0.91 → 0.63 | 56.08 → 55.96 | 440.60 → 414.85 | 69 → 68 | 637 → 624 |
| sphere / medium / desktop / special / peaks / synchronous-completion | 5999.30 → 6146.26 | 0.86 → 0.93 | 57.68 → 78.89 | 440.60 → 414.85 | 69 → 68 | 1163 → 1150 |
| sphere / medium / desktop / special / ocean / synchronous-completion | 6180.30 → 6581.26 | 9.37 → 11.55 | 55.96 → 55.44 | 440.60 → 414.85 | 69 → 68 | 1164 → 1151 |
| sphere / medium / desktop / special / clouds / synchronous-completion | 6625.83 → 6760.70 | 0.86 → 0.66 | 56.30 → 56.37 | 440.60 → 414.85 | 69 → 68 | 1166 → 1153 |
| sphere / medium / desktop / special / reveal / synchronous-completion | 6392.42 → 6429.08 | 0.88 → 0.64 | 56.36 → 56.37 | 440.60 → 414.85 | 69 → 68 | 1166 → 1153 |
| sphere / medium / desktop / special / rotate / synchronous-completion | 4065.29 → 4133.84 | 1.13 → 0.61 | 56.50 → 56.50 | 440.60 → 414.85 | 69 → 68 | 1176 → 1163 |
| sphere / medium / desktop / special / effects-show / synchronous-completion | 9092.47 → 9177.37 | 1.22 → 0.70 | 60.44 → 67.00 | 440.60 → 414.85 | 69 → 68 | 1194 → 1181 |

## 제외·미완료 목록

| 쌍/입력 | 상태 | 이유 |
|---|---|---|
| — | 없음 | 계획된 모든 쌍이 검증됐어. |

## 재현과 원본 추적

사용한 계획·manifest·원시 파일·실행 로그 SHA-256과 파일 경로는 summary.json의 provenance/inputs/jobs에 있어. 제외된 실패 원본도 수정하지 않았어.

- 계획 SHA-256: ec2a0a6898d6aaf06882f3064cfcaebbaaa0077506ea98a134f0ae9db94e090f
- manifest SHA-256: 504b7dccaa999e723a740d2171e9a347bb663cd985f1debb0f56d7704ac898a9
- 집계기 SHA-256: 9305ce824c4c7f3ff2af6d1bff5e50e70acbcc279bf6561b32e60a3f1eeb15e2
