# 렌더 계획 전후 비교

상태: **PASS** · 계획 12개 실행 · 유효 6/6쌍

생성 시각: 2026-10-22T01:26:52.957Z

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

## 동일 품질: rAF cadence 관찰

| 공연장 / 품질 / 기기 / 반복 / 장면 | n | 관찰 FPS | 1% Low FPS | 평균 간격 ms | p95 ms |
|---|---:|---:|---:|---:|---:|
| hall / low / desktop / cadence / front | 100 | 7.58 → 8.52 | 2.74 → 2.87 | 131.91 → 117.41 | 206.90 → 181.70 |
| hall / low / desktop / cadence / wide | 100 | 4.92 → 5.08 | 1.83 → 2.76 | 203.25 → 196.93 | 313.90 → 285.20 |
| sphere / low / desktop / cadence / front | 100 | 9.89 → 9.92 | 4.06 → 4.50 | 101.14 → 100.81 | 148.20 → 149.60 |
| sphere / low / desktop / cadence / wide | 100 | 2.37 → 2.44 | 0.87 → 0.90 | 421.88 → 409.44 | 626.70 → 594.10 |
| hall / low / mobile / cadence / front | 100 | 6.76 → 7.58 | 2.48 → 2.81 | 147.98 → 131.97 | 365.90 → 202.70 |
| hall / low / mobile / cadence / wide | 100 | 4.23 → 4.36 | 1.52 → 1.68 | 236.16 → 229.28 | 592.10 → 332.90 |
| sphere / low / mobile / cadence / front | 100 | 7.76 → 7.28 | 2.54 → 2.72 | 128.89 → 137.37 | 204.30 → 238.90 |
| sphere / low / mobile / cadence / wide | 100 | 2.58 → 2.55 | 0.95 → 0.99 | 387.27 → 392.84 | 932.00 → 658.80 |

## 적응형 품질 관찰

| 공연장 / 품질 / 기기 / 반복 / 장면 | 관찰 FPS | p95 ms | 실제 품질 표본 수 (기준 → 후보) | 실제 scale 표본 수 (기준 → 후보) |
|---|---:|---:|---|---|
| hall / auto / mobile / adaptive / front | 6.52 → 8.50 | 399.30 → 209.50 | {"low":100} → {"low":100} | {"1":73,"0.85":27} → {"1":36,"0.8":64} |
| sphere / auto / mobile / adaptive / front | 7.93 → 8.19 | 186.50 → 204.70 | {"low":100} → {"low":100} | {"1":71,"0.85":29} → {"1":54,"0.8":46} |

## 장면 수집 창의 CDP 시간과 JS 메모리

Task/Script는 장면 전체 누적 시간 차이야. 메모리는 각 수집 종료 시점 값이며 GC 차이가 포함될 수 있어. 단계별 호출 시간과 나머지 카운터는 summary.json에 모두 남겼어.

| 공연장 / 품질 / 기기 / 반복 / 장면 / 모드 | CDP Task ms | CDP Script ms | CDP Heap MiB | sample Heap MiB | Textures | Geometries |
|---|---:|---:|---:|---:|---:|---:|
| hall / low / desktop / cadence / front / raf-cadence | 12987.84 → 11593.04 | 12883.77 → 11479.59 | 16.54 → 31.20 | 159.26 → 124.93 | 77 → 76 | 435 → 419 |
| hall / low / desktop / cadence / wide / raf-cadence | 20112.86 → 19786.62 | 20033.57 → 19676.58 | 15.96 → 15.78 | 159.26 → 124.93 | 77 → 76 | 489 → 476 |
| sphere / low / desktop / cadence / front / raf-cadence | 10196.14 → 10078.24 | 10078.93 → 9965.84 | 42.58 → 39.57 | 179.29 → 159.26 | 47 → 46 | 415 → 402 |
| sphere / low / desktop / cadence / wide / raf-cadence | 42510.19 → 40865.25 | 42366.44 → 40736.60 | 32.20 → 32.06 | 179.29 → 159.26 | 47 → 46 | 454 → 441 |
| hall / low / mobile / cadence / front / raf-cadence | 14467.67 → 13107.10 | 14372.15 → 13038.93 | 14.95 → 23.81 | 141.14 → 141.14 | 77 → 76 | 360 → 344 |
| hall / low / mobile / cadence / wide / raf-cadence | 23387.22 → 23367.04 | 23312.12 → 23291.44 | 15.94 → 15.89 | 141.14 → 141.14 | 77 → 76 | 488 → 472 |
| sphere / low / mobile / cadence / front / raf-cadence | 12841.57 → 13661.39 | 12755.60 → 13591.24 | 40.87 → 36.45 | 179.29 → 159.26 | 47 → 46 | 332 → 319 |
| sphere / low / mobile / cadence / wide / raf-cadence | 38562.70 → 39575.17 | 38431.57 → 39485.47 | 32.67 → 32.69 | 179.29 → 159.26 | 47 → 46 | 435 → 422 |
| hall / auto / mobile / adaptive / front / raf-cadence | 14473.23 → 11440.61 | 14373.95 → 11359.31 | 24.37 → 26.16 | 168.80 → 141.14 | 77 → 76 | 374 → 358 |
| sphere / auto / mobile / adaptive / front / raf-cadence | 12593.10 → 12136.55 | 12511.94 → 12043.14 | 55.51 → 36.42 | 179.29 → 159.26 | 47 → 46 | 347 → 334 |

## 제외·미완료 목록

| 쌍/입력 | 상태 | 이유 |
|---|---|---|
| — | 없음 | 계획된 모든 쌍이 검증됐어. |

## 재현과 원본 추적

사용한 계획·manifest·원시 파일·실행 로그 SHA-256과 파일 경로는 summary.json의 provenance/inputs/jobs에 있어. 제외된 실패 원본도 수정하지 않았어.

- 계획 SHA-256: fca60f6c0519ee0d86d070a1637988bfee502ce54d47cf9a22c533922eeb3b92
- manifest SHA-256: 504b7dccaa999e723a740d2171e9a347bb663cd985f1debb0f56d7704ac898a9
- 집계기 SHA-256: 9305ce824c4c7f3ff2af6d1bff5e50e70acbcc279bf6561b32e60a3f1eeb15e2
