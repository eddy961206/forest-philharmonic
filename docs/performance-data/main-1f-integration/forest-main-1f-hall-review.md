# 최신 main 1f8e5f1 — Hall/common 병합 검토

## 범위와 판정

이 문서는 최신 main과 공개 체크포인트를 정적으로 대조하고, root가 허가한 Hall 소유 4파일의 실제 통합 및 CPU 전용 Node 회귀 검사를 기록한다. 브라우저/GPU는 실행하지 않았다. main.js/ui.js는 root 소유이며 아래 내용은 통합 권고다. 이 에이전트는 stage/commit하지 않았다.

- 이전 main: 6a59c33ced4fbbe237b38eb5a4c63e38636bf07f
- 최신 main: 1f8e5f16f1eee03140e13ba1ee66832841559604
- 우리 공개 체크포인트: 71f4841d026496608749451580789ca62f0f7042
- 기존 측정용 제품: 06c8ac5e6956b3b337102b342fbd4e422b43baf9

루트의 merge --no-commit 도중 seats.js/screen.js 충돌을 해결했다. audience.js 자동병합의 중복 용접도 제거했고 hall.js는 자동병합 결과를 유지했다. 제품 4파일 문법검사, 기존 회귀 22 case, headless caption 추가 1 case가 통과했다. 새 성능 숫자는 측정하지 않았다.

## 1. 로비 가시성의 출처와 배치 선택

문 AABB를 이용한 interiorCull과 audience.group/seatGroup 가시성 토글은 이미 이전 main에 존재한다. 최신 main의 새 변화는 Hall screenInView 프러스텀 검사다. 우리 체크포인트도 screenInView를 별도로 추가해 같은 기능이 겹친다. 로비 컬링 전체를 이번 신규 성과로 주장하면 안 된다.

병합은 interiorCull 한 벌, screenInView 한 벌을 유지해야 한다. 우리 hall.prepareRender 및 scene.onBeforeRender도 필요하다. 부모 seatGroup.visible=false는 fine/coarse 자식 선택과 별개이며 자식 선택 과정이 부모를 다시 켜면 안 된다. 현재 seats.prepareRender는 자식 표현만 전환하므로 충돌하지 않는다.

근거: 이전 main main.js:1925 interiorCull, 최신 main main.js:1980 screenInView/1993 interiorCull, 우리 main.js:135 scene.onBeforeRender/2007 screenInView/2020 interiorCull. 문 프러스텀 교차는 완전한 portal/occlusion 해법이 아니다. 관객 전체 bound 문제까지 해결했다고 주장하지 않는다.

## 2. seats.js — 실제 통합

upstream은 non-indexed 병합 결과를 mergeVertices(...,1e-4)로 용접하고 renderOrder=1을 추가했다. 우리는 정확한 속성 동일성으로 indexGeometry를 적용하고 spatial fine/coarse 배치, 공유 instanceMatrix, global ID picking 가속을 이미 사용한다.

실제 반영:

- exact indexGeometry를 유지하고 mergeVertices import를 제거했다. positions/normals/UVs의 양자화를 새로 넣지 않는다.
- makeBatch에서 모든 fine/coarse fabric/frame/accent에 renderOrder=1을 적용했다.
- upstream aisle ends의 renderOrder=1을 유지했다.
- 기존 bounding sphere, 배치 이름, 카메라별 prepareRender, picking remap을 보존했다.
- geometry/material/triangle 구성, 좌석의 위치·색, 특수 무대석 목록을 바꾸지 않았다.

기존 fine/coarse 선택은 같은 카메라에서 모든 fine 배치가 이미 제출될 때만 coarse로 합친다. 벽 뒤 fragment 비용을 줄이려는 upstream 순서는 두 표현 모두 동일하게 적용한다. renderOrder의 실제 GPU 절약량은 미측정이고, GPU마다 모든 가려진 fragment 연산이 완전히 사라진다고 보장하지 않는다. upstream tolerance 용접과 exact indexing 간 vertex 수/비용 차이는 새 baseline 비교 대상이다.

## 3. audience.js — 자동병합 의미 수정

자동병합은 우리 indexed primitive 유지 경로 뒤에 upstream mergeVertices(...,1e-4)를 추가했다. indexed 입력에 다시 tolerance 용접을 수행하는 중복 경로가 된다.

기존 primitive index/필요한 identity index 유지와 mergeGeometries 경로를 보존하고 추가 tolerance 용접 및 import만 제거했다. upstream im.renderOrder=1은 유지했다. 기존 관객 shader animation/LOD와 frustumCulled=false를 유지했으며 full-house 관객을 위한 새 공간 분할은 도입하지 않았다.

## 4. hall.js — NIGHT 텍스처 공유

upstream NIGHT 캐시는 홀 창, 로비 창, 로비 그림에 같은 CanvasTexture를 사용한다. 확인한 세 소비자는 map으로 사용하며 해당 호출부에서 개별 repeat/offset 변경이나 이 공유 텍스처의 개별 dispose는 보이지 않는다. hall.js 자동병합을 그대로 유지했다. 기존 indexed clean 및 seatData.prepareRender 반환과 새 캐시가 함께 남는다.

근거: hall.js nightForestTexture 및 홀 창 map, foyer.js:154 로비 창 map, foyer.js:396 그림 map. 이는 upstream 변경이다. 이전에는 매번 랜덤으로 그리던 숲 무늬를 공유하므로 이전 main과 모든 창 픽셀이 같다고 주장할 수 없다. 최신 main baseline과 비교해야 한다.

## 5. screen.js — caption 회귀 경로와 통합

### 정적으로 확인한 upstream 위험

최신 main drawCaption은 blank 전환에서 cap.visible=false, canvas clear 후 capTex.needsUpdate 없이 return한다. Hall에서는 cap mesh가 숨지만 Sphere에서는 headless로 mesh를 group에 넣지 않고 dome.setLive(screen.texture, screen.capTex)로 텍스처를 직접 샘플한다. 따라서 마지막 자막 텍스처가 남을 수 있는 경로가 있다.

근거: 최신 main screen.js:120–126 blank return, main.js:180–188 headless/setLive, domeshow.js texture2D(uCapTex,uv)/setLive. 실제 브라우저에서 잔상을 관찰한 것은 아니며 코드와 CPU texture version 검사로 확인했다.

### 실제 반영

- blank 전환 시 capTex.needsUpdate=true를 한 번 수행한다. 같은 blank 상태는 캐시해 반복 업로드하지 않는다.
- Hall cap.visible=!blank를 유지한다.
- 우리 lastCaptionDraw의 실제 alpha/slide 키와 fonts.loadingdone 무효화를 유지한다.
- upstream의 alpha 48단계/slide 정수 반올림은 채택하지 않는다. fade의 수치 정밀도를 유지하며, 정착한 자막과 빈 자막의 반복 작업은 제거한다.
- upstream willReadFrequently 힌트와 no-mipmap/LinearFilter는 유지했다.
- 초기/재활성화 forceRender, 렌더할 때만 카메라 행렬 갱신, try/finally의 RT/그룹 visibility 복원을 유지했다.

두 캐시를 병행하지 않는다. 정확한 alpha/slide를 유지하면 upstream 반올림 캐시보다 fade 중 갱신 수가 많을 수 있다. no-mipmap의 먼 거리/비스듬한 자막 품질과 canvas 힌트의 실제 성능은 새 브라우저 비교 대상이다. upstream 변경 자체를 우리 신규 성능 성과로 계산하지 않는다.

## 6. main.js — root 통합 권고

### 숨김 중 시간 진행과 렌더 생략 분리

upstream은 보이지 않을 때도 screen.update(dt,ctx,0)를 호출하여 state.t/shot/caption 시간을 진행한다. 우리 체크포인트는 호출 자체를 중단해 private 중계 카메라 시간이 멈추는 차이가 있었다. 이 차이는 과거 broadcast-return screenshot 해석에서 이미 분리한 조건이다.

권장 조합:

    const screenEnabled = settings.screen && concertStarted;
    const wantsScreen = screenEnabled && (IS_SPHERE ? hall.dome.liveActive : screenInView());
    if (screenEnabled) {
      if (wantsScreen && !screenActive) screen.invalidate();
      screen.update(dt, { perf, time: t, phase, nextPiece },
        wantsScreen ? QUALITY[quality].screenEvery : 0);
    }
    screenActive = wantsScreen;

orchestra.syncLite와 shadowMap.needsUpdate는 broadcast보다 앞, composer/main render는 뒤에 둔다. 숨김 중 shot 선택/RNG 진행도 살아나므로 이전 체크포인트의 중계 shot/caption과 달라질 수 있다. 실제 반환 화면의 동등성은 재검증해야 한다.

### 최신 preset과 AdaptiveQuality

최신 main은 high PR cap을 2→1.5로 바꾸고 medium을 이전 PR×0.85로 낮췄다. 최신 main baseline/candidate 비교는 이 preset 값을 양쪽 같은 기준으로 유지하고 실제 pixel ratio까지 기록해야 한다.

| DPR | high | medium | low |
|---|---:|---:|---:|
| 1 | 1 | 0.85 | 1 |
| 2 | 1.5 | 1.0625 | 1.25 |

이 DPR 감소는 upstream 변화이며 우리의 같은 화질 성능 개선으로 계산하지 않는다. 기존 6a→06 결과를 1f→새 통합본 결과로 재사용하지 않는다.

우리 settings.quality 유효성 검사와 AdaptiveQuality를 단일 자동제어기로 유지한다. 실제 프레임 시간, 히스테리시스, 회복, scale bound와 manual 전환 reset/hold를 보존한다. upstream lowStreak/goodStreak/AUTO_TOP/raiseBlocked를 동시에 작동시키지 않는다. controller.pixelRatios에 최신 preset 정의가 들어가야 한다.

upstream autoStart/weakGPU는 초기 선택에 합칠 수 있다. 문자열 heuristic은 GPU 성능 실측이 아니며 iGPU와 SwiftShader를 같은 물리 성능으로 해석하지 않는다. 임시 WebGL context 생성/해제는 로딩 조건에 포함된다. 기존 renderer context 재사용은 root의 별도 판단 사항이다.

Lite build는 초기 고정이며 우리 maxQuality=LITE?medium:high 회복은 모델을 다시 고품질로 만드는 기능이 아니다. 안전한 Lite 구조와 회복 가능한 해상도·효과를 구분해야 한다. 최신 medium PR이 low보다 낮을 수 있으므로 pixel ratio transition과 수동 preset scale=1 검사를 새 설정으로 확인해야 한다.

### warmup과 UI

upstream warmTextures의 texture Set 중복 제거/RT 제외, dome compileAsync/warm, joining guard, ticketEnter disabled, UI.enter 중복 방지, 광장 복귀 audio fade를 유지할 것을 권한다. dome compile/warm은 Sphere 담당과 조정해야 한다.

우리 UI의 sleep/wake 시 string canvas RAF 중복 방지와 upstream 진입 guard는 독립적이므로 둘 다 유지 가능하다. 오류 후 tcEnter 재활성화는 기존 lobbyError/lobbyBusy(false)/ticket retry 경로를 보존해야 한다. cold 로딩에서는 warmTextures가 앞당긴 CPU/upload 시간도 초기 로딩 수치에 포함해야 한다.

## 7. 실제 실행한 검사

4파일 node --check는 모두 exit 0이다. 기존 테스트는 파일별 Node 직접 실행으로 실제 case 결과를 확인했다.

| 실행 | 실제 case | PASS | FAIL |
|---|---:|---:|---:|
| node --experimental-loader ./tests/helpers/three-loader.mjs tests/screen.test.mjs | 11 | 11 | 0 |
| node --experimental-loader ./tests/helpers/three-loader.mjs tests/seats.test.mjs | 4 | 4 | 0 |
| node --experimental-loader ./tests/helpers/three-loader.mjs tests/geometry.test.mjs | 3 | 3 | 0 |
| node --experimental-loader ./tests/helpers/three-loader.mjs tests/instance-batches.test.mjs | 4 | 4 | 0 |
| /tmp/forest-main-1f-headless-caption.test.mjs | 1 | 1 | 0 |
| 합계 | 23 | 23 | 0 |

screen 검사는 zero cadence, 즉시 초기/재활성화 렌더, render hook 오류 복원, skip 중 shot 시간 진행, 자막/폰트/fade/cache를 포함한다. seats 검사는 fine/coarse 표현의 행렬·색·재질·기하 공유, broadcast/main 카메라 교대, 추가 삼각형 제출 없음, 원래 raycast와 global ID/거리 동등성을 포함한다. geometry와 picking 검사는 속성/UV/normal 보존, parent transform/scale 및 near/far/edge/miss 조건을 포함한다.

추가 headless 검사는 기존 screen fixture를 읽어 CPU renderer/canvas stub으로 작성했다. 제목이 표시된 뒤 blank 상태에서 texture version 정확히 +1, 이후 600 update의 추가 업로드 없음이 통과했다. GPU 텍스처의 실제 시각 비교는 아니다. 재현 파일과 출력은 /tmp/forest-main-1f-headless-caption.test.mjs, /tmp/forest-main-1f-headless-caption.log다.

최초 node --test 다중 파일 호출은 4 test-file PASS만 출력했다. 위 22개 기존 case는 각 파일을 직접 실행한 별도 결과이며 첫 file-level 집계와 합산하지 않는다. 첫 conflict marker 단순 문자열 검사에서는 hall.js의 주석 = 구분선을 잘못 감지했다. 줄 시작 conflict marker 검사로 고친 뒤 4파일 marker 0과 문법 통과를 확인했다.

## 8. 다음 실제 브라우저 검증

- 최신 main과 통합본의 같은 actual DPR/fixture/crowd/camera로 Hall front/wide/foyer/회전 및 장시간 비교.
- broadcast visible→hidden→return의 private camera 시간 진행과 즉시 refresh, Hall/Sphere title 종료·intermission·폰트 늦은 로딩.
- fine/coarse 카메라 전환 시 좌석 누락/중복, 주 카메라와 broadcast의 선택 독립성.
- 좌석 클릭(ray picking)과 E(nearSeat)를 구분한 실제 UI 확인.
- 모바일 touch overlay 기존 CSS fix와 새 upstream UI 배치 확인.
- 티켓 Enter 연타/실패 후 재시도, 수면·깨우기 반복, 광장 복귀 fade/navigation.
- cold 로딩 비용 및 새 quality auto 시작·회복·manual 전환.

브라우저/GPU 실행 및 새 수치는 이 작업에서 없다. 진행 중 원시 render/GPU/runtime 결과를 수정하지 않았다. 기존 제품06 증거는 보존하고 최신 main 통합 증거와 분리해야 한다. index/caption 최적화 일부가 upstream에도 도입됐으므로 최신 main 대비 추가 효과가 이전 6a 대비보다 작을 수 있다. full-house 관객, 돔 fragment, mobile Lite 제약, scheduler stall, 실제 iOS/Android/PC GPU 검증을 이 CPU 검사로 해결했다고 주장하지 않는다.

## 소스 근거

아래 표는 검토에 사용한 immutable commit의 직접 소스 링크다.

| 파일 | 이전 main | 최신 main | 우리 체크포인트 |
|---|---|---|---|
| public/js/main.js | [6a59c33](https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/main.js) | [1f8e5f1](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/main.js) | [71f4841](https://github.com/eddy961206/forest-philharmonic/blob/71f4841d026496608749451580789ca62f0f7042/public/js/main.js) |
| public/js/scene/hall.js | [6a59c33](https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/scene/hall.js) | [1f8e5f1](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/hall.js) | [71f4841](https://github.com/eddy961206/forest-philharmonic/blob/71f4841d026496608749451580789ca62f0f7042/public/js/scene/hall.js) |
| public/js/scene/seats.js | [6a59c33](https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/scene/seats.js) | [1f8e5f1](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/seats.js) | [71f4841](https://github.com/eddy961206/forest-philharmonic/blob/71f4841d026496608749451580789ca62f0f7042/public/js/scene/seats.js) |
| public/js/scene/audience.js | [6a59c33](https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/scene/audience.js) | [1f8e5f1](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/audience.js) | [71f4841](https://github.com/eddy961206/forest-philharmonic/blob/71f4841d026496608749451580789ca62f0f7042/public/js/scene/audience.js) |
| public/js/scene/screen.js | [6a59c33](https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/scene/screen.js) | [1f8e5f1](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/screen.js) | [71f4841](https://github.com/eddy961206/forest-philharmonic/blob/71f4841d026496608749451580789ca62f0f7042/public/js/scene/screen.js) |
| public/js/ui.js | [6a59c33](https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/ui.js) | [1f8e5f1](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/ui.js) | [71f4841](https://github.com/eddy961206/forest-philharmonic/blob/71f4841d026496608749451580789ca62f0f7042/public/js/ui.js) |

## 통합 저장 당시 4파일 SHA256

| 파일 | SHA256 |
|---|---|
| public/js/scene/seats.js | 1f744213faa10a81d74610e5076326d473a613f9f35d40a6b4ef52012824c0ae |
| public/js/scene/screen.js | c336b5dc4ba9cc52c9c42d288a2f6d4f171cf3348380350d7a9ae6f66a014ade |
| public/js/scene/hall.js | 685c40234f8297120fdf030d4a9a13c51ce87f6c28ec04f46db4be31a520fccc |
| public/js/scene/audience.js | cd71b73692330b1a4b69665b5339de94af70faa393373c99bd58d0a884d3ce85 |

검토 생성 UTC: 2026-10-21T10:35:42.240564+00:00
