# Sphere 셰이더 후보를 적용하지 않은 이유

2026-10-21에 main `ec5ef65fab027353b51f751ffb59aa65b863af0a`를 기준으로 세 후보를 분리해서 비교했어. **세 후보 모두 앱에는 적용하지 않았어.** 원본보다 출력이 달라지거나, 같은 출력이어도 일관된 이득을 확인하지 못했기 때문이야. 이 실험 수치를 공연장 전체의 개선율로 사용하지 않아.

**이 문서는 ec5 기준선에만 해당하는 과거 실험 기록이야.** 이후 main은 `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`으로 진전했고 FOREST/KELP 셰이더 등도 바뀌었어. 아래 44개 case의 픽셀 동일성·시간·기각 판단은 당시 소스에 대한 결과야. 최신 main이나 이를 통합한 PR의 성능·화질을 검증한 결과로 옮겨 해석하지 않아. 원본 자료의 기준선과 측정값도 새 SHA로 바꾸지 않았어.

[원본 결과와 재현 자료](performance-data/shader-experiments/README.md)에 전체 44개 case, 최초 실패 smoke, shader 후보와 실행기를 함께 넣었어. [원본 요약 JSON](performance-data/shader-experiments/raw/full/summary.json)에서 아래 시간 수치를 확인할 수 있어.

## 비교 조건

- Chromium 153, `@sparticuz/chromium` 153.0.0, Playwright 1.64.1, Three.js r186, ANGLE/SwiftShader를 썼어. 실제 저사양 PC나 모바일 GPU의 FPS 측정은 아니야.
- main 앱을 시작하지 않고 원본 `makeWorldRenderer`와 `buildDome` factory만 불렀어. 후보마다 fragment shader 한 부분만 바꾸고 geometry, 카메라, render target, uniform을 맞췄어. 큐브 프록시도 원본 SphereGeometry의 면당 2,208 triangles를 유지했어.
- 큐브는 640×640 RGBA16F, 선형 필터, mipmap·depth buffer 없음이야. 시간 `[0, 23.5, 137]`과 level `[0, 0.25, 1]`의 9개 조합, OCEAN/CLOUDS 대조군 2개를 각 후보에 썼어.
- 픽셀은 `RGBA/FLOAT`로 읽고 모든 성분을 비트 단위로 비교했어. production의 5면에 `-Y`까지 추가한 6면을 검증했어. 시간 측정은 production처럼 `-Y`를 제외한 5면이야.
- reveal은 960×540, DPR 1에서 high/lite 각각 공간 혼합 8개 지점과 일반 dissolve 3개 지점을 확인했어.
- 각 측정은 warmup 1회 뒤 3회 중앙값이야. `performance.now()`로 draw 제출부터 동기식 1×1 `readPixels` 완료까지 쟀으므로 **CPU 제출과 GPU 완료 대기를 포함한 시간**이야. 순수 GPU timer가 아니야. case마다 원본/후보 실행 순서를 번갈았지만 반복 횟수가 적어서 작은 차이를 유의미한 개선으로 볼 수는 없어.

## 결과

아래 합계는 9개 주 실험의 중앙값을 더한 비교 요약이야. 한 프레임의 시간이나 실제 장면 노출 비율로 가중한 성능 수치가 아니야. 변화율은 `1 - 후보 / 원본`이고, 양수가 시간 감소야.

| 후보 | 출력 검증 | 9개 중앙값 합: 원본 → 후보 | 시간 감소율 범위 | 결정 |
| --- | --- | --- | --- | --- |
| FOREST `forest_cell_entry` | 주 실험 9개와 대조군 2개, 6면 모두 비트 동일 | 6,759.1 → 6,681.8ms, **1.14% 감소** | **-19.63% ~ +22.08%**, 5/9개 감소 | 이득이 작고 불안정해서 제외 |
| PEAKS `peaks_deferred_sky` | 주 실험 9개와 대조군 2개, 6면 모두 비트 동일 | 7,687.6 → 7,683.7ms, **0.05% 감소** | **-15.22% ~ +5.72%**, 5/9개 감소 | 큰 계산을 실제로 생략하지 못해서 제외 |
| Roof reveal `reveal_endpoints` | 공간 혼합 후반에 RGB 차이 발생 | 동일 출력으로 시간까지 잰 14개 case에서도 **3.27~4.45배 느림** | 모든 측정 case에서 악화 | 출력과 성능 모두 통과하지 못해 제외 |

FOREST 대조군의 시간 변화는 OCEAN **-12.08%**, CLOUDS **+0.23%**였고, PEAKS 대조군은 OCEAN **+5.18%**, CLOUDS **+0.31%**였어. 주 실험의 작은 평균 이득보다 실행 변동과 공유 셰이더 변경의 영향이 커서 개선을 주장하기 어려워.

### FOREST: 안전한 종료 조건도 비용 대비 이득이 부족했어

처음 만든 `forest_bounds`는 `tmax` 자체를 줄였어. 하지만 원본 DDA가 다음 셀로 이동한 **뒤** 그 셀의 출구를 검사해서, 제한 거리 안의 마지막 유효 셀까지 놓쳤어. 첫 smoke에서 6면 중 5면의 출력이 달라져 폐기했어. 실패한 원본 결과와 후보도 보존했어.

두 번째 `forest_cell_entry`는 원래 140 거리와 hit 판정을 그대로 두고, 다음 셀에 **들어가기 전** 별도의 기여 거리만 검사했어. 바닥보다 뒤나 수관 위에서만 만날 줄기의 검색을 생략하는 방식이야. 32회 반복 상한은 그대로이고 실제로 생략하는 횟수는 광선마다 달라. 대신 모든 방문 셀에 비교가 추가되고, 공유 `gridCyl`을 쓰는 OCEAN에도 검사가 하나 더 들어가.

v2는 모든 검증 픽셀을 보존했지만 시간 이득은 확실하지 않았어. 특히 같은 time=23.5의 세 level은 탐색 경로가 같아도 변화율이 +11.64%, +22.08%, -19.63%로 뒤집혔어. level은 이 FOREST 함수의 마지막 색 배율만 바꾸므로, 이 변동을 검색량 감소의 성과로 해석하지 않았어.

### PEAKS: 비싼 오로라 계산과 지형 명중 범위가 겹치지 않아

후보는 지형에 덮여 쓰이지 않을 `auroraSky`를 지형 미명중일 때만 계산하도록 옮겼어. 하지만 원본 코드를 보면 coarse terrain 높이의 상한은 `520 × (0.5 + 0.25 + 0.125 + 0.0625) - 60 = 427.5`이고 카메라 높이는 470이야. 위를 향하는 광선은 이 지형에 맞지 않아.

비싼 오로라 3겹은 `rd.y > 0.02`일 때만 계산돼. 따라서 실제 지형 명중 픽셀에서 생략되는 것은 저렴한 하늘 색 그라데이션뿐이고, 오로라의 FBM 옥타브 9회와 추가 noise 3회는 생략되지 않아. 72회 지형 탐색, 4회 정밀 보정과 법선 계산도 그대로야. 소스상 기대했던 큰 연산 절감이 성립하지 않아서 적용하지 않았어.

### Reveal: 분기를 늘린 비용이 더 컸어

공간 혼합값이 정확히 0 또는 1이면 기여하지 않는 장면을 생략하려던 후보야. 수학적으로는 자연스럽지만 `scene()` 호출 지점이 2개에서 6개로 늘었어. reveal이 꺼진 일반 dissolve나 mix=0 대조군도 크게 느려져, reveal 경계의 픽셀 분기만으로 설명되지 않아. 컴파일된 프로그램의 크기나 최적화 결과가 악화됐을 가능성이 있지만, 기계코드를 분석하지 않았으므로 원인으로 단정하지 않아.

세부 기록이 남은 불일치 7개 case에서는 518,400픽셀 중 3~67개가 달랐고, 최대 절대 오차는 0.000122~0.000488이었어. alpha는 같았어. 반올림 경계에서 생긴 변화와 맞는 크기지만, 비트 동일 조건은 통과하지 못했어. 두 경로는 동일한 baseline factory와 uniform을 사용하고 혼합 이후 처리도 같아. 일반 float render target에서는 Three.js가 화면용 tone mapping을 적용하지 않으므로, 서로 다른 tone mapping 순서로 섞은 실험도 아니야.

전체 `summary.json`은 44개 중 36개 동일, 8개 불일치를 기록했어. 다만 [reveal-lite-m1.json](performance-data/shader-experiments/raw/full/reveal-lite-m1.json) 한 파일은 중간 `comparing` 상태로 남았고, 요약과 실행 로그에만 `exact:false`가 있어. 이 case의 세부 픽셀 오차는 복원하거나 추정하지 않았어. 다른 7개 불일치와 14개 성능 악화만으로도 후보를 제외하기에 충분해.

## 재현 자료와 해석 범위

실험 자료에는 추출된 원본·후보 GLSL, 비교 harness, 직렬 browser runner, manifest·환경 정보, case별 raw JSON, 최초 실패 smoke를 함께 보존해. 실패 case를 지우거나 유리한 case만 골라 성과로 쓰지 않아. 셰이더 후보 실험과 실제 PR의 프록시 geometry·렌더 순서·인덱스·shadow 갱신 변경은 별개야. 실제 적용한 변경의 효과는 최신 기준선과 통합한 코드를 대상으로 별도의 동일 장면 전체 프레임 비교로 확인해야 해.

float readback 조건은 [Khronos EXT_color_buffer_float 명세](https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/)를 따랐어. GPU timer를 추가한다면 [EXT_disjoint_timer_query_webgl2](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)의 query 완료와 disjoint 조건도 확인해야 해. 이번 수치는 그 API로 잰 값이 아니야.
