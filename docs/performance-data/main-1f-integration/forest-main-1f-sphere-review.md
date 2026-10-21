# main 1f8e5f1과 Sphere 최적화 통합 검토

2026-10-21, `/root/sphere_review`. 이 문서는 고정 revision 소스 대조와 CPU 단위 검사 결과야. 이번 검토에서 브라우저, GPU, 실제 기기, 새 스크린샷 검사는 실행하지 않았어. 진행 중인 06 GPU 측정에는 관여하지 않았어.

## 결론과 수정 범위

자동 병합된 `dome3d.js`와 `domeshow.js`는 새 main의 shader 컴파일 완화·2-pass 전환·예열과 기존 최적화의 Box 프록시·큐브 해상도 변경·렌더 상태 복원을 함께 유지해. 추가 제품 수정은 `dome3d.js`의 `warm()`에 `try/finally`를 넣은 것뿐이야. `domeshow.js`는 자동 병합 결과를 추가로 편집하지 않았어.

예열 렌더가 실패하면 기존 코드는 `slot.world = FOREST3D`를 남겼어. boot는 예열 오류를 무시하고 계속하므로, 첫 실제 FOREST3D가 시작될 때 슬롯이 이미 그 세계라고 판단하여 `start=0`을 이어받을 수 있어. 임시 세계와 면 캐시를 `finally`에서 비우면 첫 실제 세계는 실제 시작 시각을 사용해. 모의 renderer 오류로 수정 전 실패를 재현했고 수정 후 첫 FOREST3D의 flight time이 0인 것을 확인했어. warm API는 기존처럼 boot에서 호출하는 계약을 유지하며 공연 중 임의 반복 호출까지 새 기능으로 확대하지 않았어.

새 `tests/dome-integration.test.mjs`에 4개 검사를 추가했어. 기존 공유 테스트 파일은 수정하지 않았고 commit/stage도 하지 않았어.

## 비교한 revision

| 구분 | revision |
|---|---|
| 이전 기준선 6a | `6a59c33ced4fbbe237b38eb5a4c63e38636bf07f` |
| 측정 중인 최적화 06 | `06c8ac5e6956b3b337102b342fbd4e422b43baf9` |
| 공개 checkpoint 71 | `71f4841d026496608749451580789ca62f0f7042` |
| 새 upstream 1f, PR #4 | `1f8e5f16f1eee03140e13ba1ee66832841559604` |

각 revision의 main, sphere, dome3d, domeshow 파일 SHA-256와 Git blob ID, 자동 병합 직후 사본, 수정 결과와 검사 로그 해시는 같은 이름의 JSON에 들어 있어. 6a/06의 수집 자료와 새 1f 비교 자료를 합산하면 안 돼.

## 실제 upstream 변경과 보존한 동작

| 영역 | 1f 변경 | 통합 판단 |
|---|---|---|
| world 셰이더 | `uOne=1`을 loop bound에 넣어 드라이버의 큰 반복문 전개를 피하려는 변경 | 모든 변경을 유지했어. 런타임 비용·Windows 컴파일 개선은 이번에 측정하지 않았어. |
| world 프록시 | 1f는 여전히 SphereGeometry | 기존 BoxGeometry를 유지했어. 요청된 면당 triangle은 2,208에서 12로 줄고 정규화된 ray 방향은 기존 CPU 검사가 확인해. 세계의 ray-marching 내용과 step 수는 줄이지 않았어. |
| cube 갱신 | mask, -Y 생략, 새 면 즉시 갱신, crossfade에서 두 세계 교대 | 기존 정책을 유지했어. 원래 있던 최적화를 새 성과로 중복 계산하지 않아. |
| 예열 | slot 0의 +X 한 면을 실제로 렌더 | 동일 draw 경로를 통해 기존 renderer 상태 복원을 적용하고, 예열 실패 때 임시 slot 상태까지 정리했어. |
| resize | 1f의 setQuality는 cadence만 변경 | 기존 high 640/1, medium 512/2, low 384/2 프로필과 `setSize`를 유지했어. target 객체·texture 참조·세계 start를 유지하고 면 캐시만 무효화해. |
| 돔 전환 | shader 안의 scene() 두 번 호출을 base+overlay 두 패스로 변경 | upstream 방식 그대로 유지했어. overlay는 geometry와 대부분의 uniform 객체를 base와 공유해. |
| render order | 1f base -1, transparent overlay -1 | 기존 최적화의 base 10과 upstream overlay -1을 함께 유지했어. 불투명 건축물의 depth 뒤에 base, 나머지 투명 레일·효과 앞에 overlay가 그려지는 순서야. |
| IMAG | shader는 live > .001일 때 샘플링 | 기존 `liveActive > .001` 및 첫 요청 즉시 활성 상태를 유지했어. main의 settings.screen/concertStarted 조건도 유지하도록 root에 전달했어. |

**지연 생성과 수명은 정확히 구분해야 해.** 1f의 `buildDome()`은 full/non-Lite에서 `makeWorldRenderer()`를 즉시 호출하며 두 cube target 객체를 만들어. 명시적 lazy world 생성이나 새로운 dispose API는 1f/06 어디에도 없어. 실제 GPU 저장소·프로그램 준비는 Three가 처음 사용할 때 이뤄지고 새 warm이 그 첫 사용의 일부를 boot로 옮겨. 공연장/광장 이동은 location navigation으로 문서를 바꾸는 구조라 이번 통합에서 별도 객체 수명 체계나 무관한 dispose API를 추가하지 않았어. 품질 변경 시 target 재사용과 내부 resize dispose는 보존했지만 이것만으로 GPU 누수 없음이나 장시간 메모리 안정성을 증명하지는 않아.

## 동일 화질 비교에서 달라지는 정의

1f의 `main.js:51–56`은 high pixel ratio 상한을 2에서 1.5로 바꾸고, medium에 0.85를 곱해. 이는 upstream의 화질 프로필 변경이야. 우리 최적화 실적으로 계산하면 안 돼.

- DPR 1의 medium은 이론상 pixel 수가 이전의 `0.85² = 72.25%`야.
- DPR 2의 high는 이론상 이전의 `(1.5/2)² = 56.25%`야.
- 위 숫자는 소스 식의 산술 결과이며 FPS, 실제 GPU 작업량 또는 실측 전송량이 아니야.

새 성과표는 **1f 원본 대 최종 통합본**으로 양쪽을 맞춰야 해. 같은 preset 이름뿐 아니라 실제 drawingBuffer 크기, DPR, renderScale, Lite/full 부팅 경로, cube 크기/cadence, shadow/MSAA/post, IMAG, 카메라와 곡·세계 시각을 기록해야 해.

2-pass 변경도 upstream의 화면 변화를 포함해. 기존에는 세계를 shader 안에서 섞은 뒤 밝기, IMAG, tone mapping, 색변환을 적용했어. 새 코드는 세계별 결과를 변환한 뒤 overlay blend해. direct/no-composer 경로는 비선형 tone mapping 때문에 일반적으로 이전과 픽셀 동등하지 않아. composer의 offscreen Linear/NoToneMapping 경로에서는 일반 crossfade가 더 가까울 수 있지만, reveal seam은 밝기와 IMAG 적용 순서도 달라져. 새 기준선과 같은 상태로 직접 캡처해야 해. 이 변화가 우리 통합에서 새로 발생한 것처럼 설명하면 안 돼.

또한 boot-low/Lite의 painted 세계와 full build에서 나중에 low를 선택해 384 cube를 쓰는 경로는 구분해. 후자는 기존 생성된 세계의 품질 변경 동작이고 전자는 시작부터 다른 경량 경로야.

## 실제 실행한 검사

저장소 루트에서 아래 명령을 실행했어. renderer는 Three의 실제 geometry/targets/uniform을 사용하는 모의 객체이고 WebGL context는 만들지 않아.

```bash
node --experimental-loader ./tests/helpers/three-loader.mjs tests/dome-integration.test.mjs
node --experimental-loader ./tests/helpers/three-loader.mjs tests/dome.test.mjs
node --check public/js/scene/dome3d.js
node --check public/js/scene/domeshow.js
node --check tests/dome-integration.test.mjs
```

| 검사 | 결과 | 실제 확인한 범위 |
|---|---|---|
| 새 통합 검사, 수정 전 | 3 PASS / 1 FAIL | 예열 실패 후 임시 world가 남는 오류 재현 |
| 새 통합 검사, 최종 소스 | 4 PASS / 0 FAIL | 1면 Box 예열, 실패 후 render state/slot/flight 복원, 2-pass crossfade 중 품질 resize/공유 uniforms/세계 수명, Lite fallback |
| 기존 dome 검사 | 7 PASS / 0 FAIL | face mask·교대 갱신·실패 복원·resize·ray 방향·live fade |
| 세 파일 문법 검사 | 모두 PASS | JavaScript 구문 |

`node --test`로 시작한 첫 시도는 이 환경의 child test runner에서 개별 case 없이 파일 수준 generic FAIL만 반환했어. 이 시도를 성공으로 세지 않았고, 파일을 직접 실행해 실제 case별 결과를 확보했어. 사전 실패 로그 뒤 Lite 테스트 제목을 더 정확히 고치고 복구 세계를 FOREST3D로 바꿨으므로 사전 로그와 최종 테스트 파일이 byte 동일하다고 주장하지 않아.

로그:

- `/tmp/forest-main-1f-sphere-before.log`
- `/tmp/forest-main-1f-sphere-integration-tests.log`
- `/tmp/forest-main-1f-sphere-existing-tests.log`

## main 통합과 벤치마크 준비 조건

main은 root 담당으로 이 agent가 수정하지 않았어. 다음 사항을 전달했어.

1. `compileAsync`의 숨김/복원, boot의 `warm()`와 `warmTextures()`를 유지해. `drawWorlds()`는 카메라 이동 뒤, IMAG/main 렌더 전에 있어야 해.
2. 1f Auto는 full build에서 medium→low preset 강등을 피하고 pixel scale로 대응하도록 바뀌었어. 기존 AdaptiveQuality의 실제 frame interval, 히스테리시스, 회복을 유지하며 full build 최저 medium 정책을 합쳐야 해. low/Lite 부팅 경로는 따로 유지해. root가 이 옵션을 구현하기로 했어.
3. **UI 준비가 곧 돔 준비는 아니야.** `compileAsync` Promise를 boot가 await하지 않고 `ui.ready()`는 enterBtn을 켜. 현재 full-frame의 `__bench && !enterBtn.disabled`만으로는 dome.mesh.visible=false인 상태를 통과할 수 있어.

collector의 준비 wait에 다음 조건을 추가하는 것을 권장했어. 제품의 visible을 강제로 true로 바꾸면 안 돼.

```js
!!window.__bench &&
!document.getElementById('enterBtn').disabled &&
(!window.__fp.hall.dome || window.__fp.hall.dome.mesh.visible === true)
```

같은 시나리오와 같은 WARMUP 횟수 뒤 visible을 다시 검사하고 측정 step에서 hidden이면 FAIL로 저장해야 해. 더 엄격한 근거가 필요하면 fixture의 `onAfterRender` wrapper로 원본 callback을 보존하면서 base와 visible overlay의 실제 draw 횟수를 기록해. 최종 warmup 뒤의 currentProgram id, isReady, diagnostics, GL LINK_STATUS도 측정 구간 밖에서 기록할 수 있어. 프로그램 개수만으로 실제 돔 draw나 링크 성공을 판단하면 안 돼.

vendored Three의 compileAsync는 먼저 compile()을 호출한 뒤 `KHR_parallel_shader_compile` 지원 시 완료 상태를 기다려. 따라서 모든 브라우저에서 완전 비동기·무정지라는 결론을 낼 수 없어. boot 시 default framebuffer의 tone-mapped/sRGB 프로그램과 첫 high/medium composer의 Linear/NoToneMapping 프로그램도 달라질 수 있어. Promise 완료만으로 실제 모든 패스가 예열됐다고 간주하지 말고 실제 시나리오 warmup을 유지해야 해. collector는 root가 수정하며 이 agent는 편집하지 않았어.

## 아직 필요한 검증

새 1f 기준선과 통합본에서 high/medium의 front, dome, forest/ocean, crossfade/reveal, broadcast를 고정 조건으로 재측정해야 해. 특히 다음은 새 shader·두 패스에 대한 실제 실행 근거가 필요해.

- cold/warm 진입의 shader 준비 시간, UI 준비와 dome visible 시각, KHR_parallel_shader_compile 유무, 첫 world/overlay 링크·draw.
- crossfade 중 high→medium→high resize, 빠른 시점 회전으로 새 큐브 면 등장, IMAG on/off. 검은 면, seam, 비행 시각 reset이 없는지 확인.
- 좌석·발코니의 가림, 투명 레일·빔과 overlay 순서, roof-lift 밝은 경계, IMAG 자막, low direct 경로와 high/medium composer 양쪽의 캡처.
- Windows Chrome/Edge의 compile/runtime 비용, Android Chrome/iOS Safari의 uniform loop·overlay 링크와 target 호환성. 이번 agent는 이 환경들을 실행하지 않았어.
- 여러 세계 전환, 반복 품질 변경과 광장 왕복의 target/program/메모리 추세. CPU 단위 PASS를 발열·음질·실기기 30/60FPS 성과로 해석하면 안 돼.

이번에 기록한 제품/도구 결과의 정확한 SHA-256와 전체 판단 구조는 `/tmp/forest-main-1f-sphere-review.json`에 있어.
