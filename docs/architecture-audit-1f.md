# 최신 main 1f 기준 구조 감사와 최적화의 범위

**이 문서는 최신 main과 통합 제품의 실제 차분을 설명하는 정적 감사야. 작성 시점에 새 1f 기준 성능·시각 재측정은 아직 완료되지 않았어.** 이전 6a→06 측정 결과를 이 통합본의 개선 수치로 사용하지 않아. [architecture-audit-6a.md](architecture-audit-6a.md)는 당시 기준선과 판단을 기록한 역사 자료로 보존해.

## 1. 고정 소스와 읽는 방법

| 구분 | 고정 식별자 |
|---|---|
| 최신 main 기준선 | `1f8e5f16f1eee03140e13ba1ee66832841559604` |
| 공개 통합 제품 | `dea7997c6278f10ff467815ab96b370362549b0c` |
| 정적 검토에 사용한 로컬 통합 커밋 | `34ccb1c0ef8735acfcd021fab2857b568bb72722` |
| 두 통합 커밋의 동일 Git tree | `28f0ad8a9dee48a7325e0b4fdcc96657d68f7803` |

로컬 통합 커밋과 공개 커밋은 같은 tree를 가진다는 것을 git rev-parse로 확인했어. 아래 GitHub 소스 링크는 공개 커밋에 고정했어. [전체 제품 차분][diff]에서 서버·음악·샘플 변경 여부도 확인할 수 있어.

이 감사는 세 가지를 구분해. **우리 차분**은 1f에 없는 코드 변경, **upstream 기능**은 최신 main에 이미 있는 동작, **미검증 효과**는 코드상 줄일 수 있는 작업이지만 새 기준선과의 실행 수치가 아직 없는 부분이야. 코드가 달라졌다는 사실만으로 FPS·GPU·메모리 개선을 확정하지 않아.

## 2. 실제 호출 경로

| 단계 | 호출·데이터 흐름 | 소유 범위와 의미 |
|---|---|---|
| 광장과 공연장 분기 | boot.js가 URL·sessionStorage의 표를 읽고 plaza.js 또는 main.js를 동적으로 import | boot/plaza/plazaWorld/tickets는 1f와 byte 동일해. 표 없는 venue URL은 광장으로 돌아가며, room 초대와 lobby 직접 입장은 별도 경로야. |
| 광장·발권·이동 | plaza의 별도 Renderer/loop → 매표소·identity/issueTicket → 건물 gate → 문서 navigation | 최신 광장 기능을 보존했어. 공연장 frame 수치로 광장 성능을 평가하지 않아. |
| 공연장 구성 | main → venue/sphereplan → buildHall 또는 buildSphere → orchestra/StageManager/recital → audience/screen/Director | 선택한 건물만 생성하지만 두 builder는 main의 정적 import graph에 있어. 미선택 공연장 코드를 새로 lazy import한 변경은 없어. |
| 초기 준비 | AudioEngine.init → music/index.json → 박수 준비와 loadSamples 병행 → 첫 곡 load → recital/돔/재질·텍스처 예열 → ui.ready | 박수 준비 병행은 우리 변경이고 world/texture 예열은 upstream 동작이야. |
| 시각 프레임 | perf.time·updateVisual → orchestra/무대/효과 → Director·listener → Hall 컬링/관객·좌석 LOD/돔 세계 → Lite 행렬·그림자 → 중계 → 본 화면 | 음악 기준 시각과 렌더 프레임의 역할을 분리해. 각 render camera는 Hall 좌석 배치를 따로 선택해. |
| 오디오 예약 | 기존 timer Worker → 메인 스레드 engine._tick → Performance._schedule → Web Audio 절대 시각 예약 | 박수 합성 Worker와 별개야. 음표 예약 알고리즘은 바꾸지 않았어. |
| 함께 보기·복귀 | RoomClient ↔ /ws ↔ server/rooms → main의 곡·방장·pose·chat 처리. 광장 복귀는 방/표 정리와 fade 후 navigation | 프로토콜·서버는 1f와 같고, 최신 main의 중복 입장 방지 및 복귀 fade도 유지해. |

근거: [boot][boot] · [plaza][plaza] · [tickets][tickets] · [main][main] · [venue][venue] · [performance][performance] · [RoomClient][room] · [server][server].

## 3. 최신 main에 이미 있어 성과 계산에서 제외할 것

| 이미 존재하는 경로 | 보존한 내용 | 성과를 해석할 때의 주의점 |
|---|---|---|
| Hall 로비 컬링 | 문 AABB가 시야에 없으면 관객·좌석 그룹을 숨기는 interiorCull | 6a에도 있었어. 새 portal renderer를 만든 것이 아니야. |
| Hall 중계 가시성 | screenInView와 숨김 시 update(...,0) | 1f에 이미 있어. 숨김 중 실제 촬영 생략 전체를 우리 추가 절약으로 세지 않아. |
| 좌석·관객 indexing | mergeVertices(...,1e-4)와 벽 뒤 renderOrder=1 | 1f도 이미 indexed geometry를 사용해. 우리 차분은 정확한 속성 보존 경로와 Hall 배치·버퍼·picking 구성이야. |
| 자막 캐시 | 동일한 표시 상태의 caption 재그리기 생략, 빈 Hall mesh 숨김, no-mipmap/LinearFilter, canvas 힌트 | 캐시의 존재 자체를 신규 성과로 세지 않아. 우리의 정확한 fade 키와 blank 업로드 복구는 별도야. |
| 숲 배경 공유 | Hall 창·로비 창·로비 그림의 NIGHT CanvasTexture 캐시 | upstream 변경이야. 이전 버전과 창별 랜덤 숲 무늬가 달라질 수 있어. |
| Sphere 좌석·관객 | 구역별 InstancedMesh, near/far 좌석 LOD, 관객 상세도 단계 | 약 1만 4천 석을 이번에 처음 instancing한 작업이 아니야. |
| 큐브맵 재사용 | visible face mask, 아래쪽 면 생략, 새로 필요한 면 갱신, 전환 중 두 world slot 교대 | temporal reuse와 face mask는 이전 main에도 있었어. 새 알고리즘 성과로 세지 않아. |
| 돔 shader/전환/예열 | uOne 기반 loop bound, scene() 한 번씩 호출하는 base+overlay 전환, compileAsync, world·texture warm | 최신 main의 컴파일 완화 정책을 유지했어. 드라이버별 실제 효과는 새 측정 대상이야. |
| 수동 품질과 자동 시작 | high PR 상한 1.5, medium PR×0.85, GPU명에 따른 auto 시작값, full build 자동 최소 medium | 해상도 감소와 시작 프리셋 선택은 upstream 정책이야. 우리 동일 품질 개선으로 세지 않아. |
| 음향·네트워크 기본 구조 | 샘플/재질 캐시, Lite 경로, timer Worker, server clock/방 권한/재접속 | 기존 구조를 보존했어. 새 서버 사양 또는 서버 처리량을 클라이언트 성과로 바꾸어 말하지 않아. |

근거: [기준선 main][base-main] · [기준선 seats][base-seats] · [기준선 audience][base-audience] · [기준선 screen][base-screen] · [기준선 Hall][base-hall] · [기준선 dome3d][base-dome3d] · [기준선 domeshow][base-domeshow].

## 4. 공통 렌더링에서 남아 있는 우리 차분

**중복 작업과 자원 수명을 줄이는 변경이 중심이야.** main은 shadowMap.autoUpdate를 끄고 시각 프레임마다 needsUpdate를 설정해 중계와 본 화면이 같은 프레임의 그림자 갱신을 공유하도록 했어. Lite 연주자 행렬도 두 카메라보다 먼저 syncLite로 반영해. 그림자 해상도나 연주 포즈를 줄이는 변경은 아니지만, 중계·본 화면·품질 전환이 겹칠 때의 실제 그림자 정확성은 재검증해야 해. [main][main]

초기 composer의 중복 생성은 제거하고, 재구성할 때 pass/composer를 dispose해. 일회용 RoomEnvironment와 PMREMGenerator도 환경맵을 만든 뒤 정리해. 이는 불필요한 생성·참조를 줄이는 변경이며 실제 VRAM 절감량이나 누수 없음의 증명은 아니야. renderer.info를 프레임 단위로 합산하는 설정은 계측 변경이고 자체 FPS 성과로 세지 않아. [main][main]

main과 UI string canvas는 pending rAF를 한 번만 유지하도록 해. hide/sleep 때 취소하고 resume 시 clock·품질 유예·중계 상태를 초기화하며, 중복 Wake Lock 요청도 막아. 백그라운드 경과 시간을 낮은 FPS 표본으로 넣지 않기 위한 처리야. 광장 자체 loop를 새로 작성한 것은 아니야. [main][main] · [ui][ui]

materials/orchestra/characters/instruments의 파일은 기준선과 같아. 절차적 재질·텍스처 캐시, 강체 병합, Lite 팔 instancing, 건반 instancing, 활·하프·지휘·표정 rig를 유지해. 다만 이들이 호출하는 mergeChildren/bakeColor는 indexed geometry를 펼치지 않게 바뀌었고, 움직일 자식은 부모 mesh를 제거하기 전에 world transform을 유지하며 attach해. 따라서 직접 수정하지 않은 모델도 공유 병합 경로의 영향을 받아. [materials][materials] · [orchestra][orchestra] · [characters][characters] · [instruments][instruments] · [merge][merge]

화면 밖 연주자의 음악 상태나 손·활 계산을 일괄 중단하는 새 정책은 없어. Performance.updateVisual에서 active 음표 배열을 매 프레임 filter/map으로 재생성하는 대신 순서를 유지한 채 압축하고, chair 목록은 load/seek 때 준비해. 음악 상태의 의미를 유지하면서 JS 할당을 줄이는 변경이며 실제 GC pause 감소량은 새 측정 전이야. [performance][performance]

## 5. 숲속 홀: 좌석·관객·로비·중계

### 같은 좌석을 더 작은 가시성 단위로 제출

1f의 좌석은 종류별 큰 InstancedMesh야. 통합본은 같은 좌석 geometry·재질·색·transform을 공간별 fine 배치로 나누고, 같은 종류의 모든 fine 부품이 이미 프러스텀에 들어오는 경우 coarse 표현을 사용해 draw 증가를 줄여. scene.onBeforeRender → hall.prepareRender는 실제 카메라별로 실행되므로 본 화면의 선택을 중계에 재사용하지 않아. [기준선 seats][base-seats] · [seats][seats] · [main][main]

fabric/frame/accent는 같은 instanceMatrix attribute를 공유해. 보이지 않는 picking proxy는 원래 전역 좌석 ID를 유지하며, 배치 bound로 후보를 줄인 뒤 원래 InstancedMesh.raycast를 호출하고 local ID를 복원해. Director의 이동·nearSeat 규칙이나 무대 특별 좌석 목록은 바꾸지 않았어. E로 앉는 nearSeat 검사와 클릭 raycast 검사는 서로 다른 기능이므로 혼동하면 안 돼. [instance-batches][instance-batches] · [Director][director]

좌석은 모든 관련 attribute가 정확히 같은 vertex만 indexGeometry로 공유해. Hall·관객·공유 병합 경로는 기존 primitive index를 보존해. 기준선에도 tolerance 용접이 있으므로 “모든 indexing 절약”이 우리 추가 성과는 아니야. 정확한 속성 보존은 normal/UV 경계와 미세 좌표를 임의로 양자화하지 않기 위한 선택이고, tolerance 방식보다 vertex 수가 많을 가능성도 새 비교에서 확인해야 해. 벽 뒤 renderOrder=1은 두 표현에 동일 적용했어. [geometry][geometry] · [hall][hall] · [audience][audience] · [seats][seats]

### 유지한 디테일과 남은 비용

4층·발코니·샹들리에·계단·로비 동선과 악기 형상은 유지해. foyer/hallplan/stage 파일은 1f와 같고, Hall의 NIGHT 캐시도 upstream 그대로야. 부모 seatGroup의 로비 가시성과 자식 fine/coarse 선택은 독립적으로 동작해. [hall][hall] · [foyer][foyer] · [hallplan][hallplan]

문이 조금이라도 보이면 내부의 큰 부분을 다시 그릴 수 있어. 좌석 프러스텀 배치는 문 구멍의 실제 가림 영역을 계산하지 않아. 넓은 객석에서 전체 좌석·관객이 보이면 제출량 감소가 제한되고, 관객은 기존 큰 instance bound와 shader animation/LOD를 유지해. 관객을 새 공간 군집으로 나누거나 occlusion query/portal renderer를 도입한 것은 아니야. [main][main] · [audience][audience]

### 중계와 자막의 차분

숨김 중 update(...,0)로 shot/caption 시간은 계속 진행하고 실제 카메라 행렬 갱신과 촬영만 생략해. 이는 최신 main의 시간 진행을 보존한 것이며, 이전 06 후보의 숨김 중 private shot clock 정지와는 달라. 다시 보이는 첫 프레임은 invalidate로 즉시 갱신해 low cadence를 기다리지 않아. 렌더 전후 target·그룹 visibility와 Sphere hook도 try/finally로 복원해. [main][main] · [screen][screen]

자막은 alpha/slide를 반올림하지 않은 정확한 키로 캐시하고, 늦은 웹 폰트 로딩 때 다시 그려. upstream의 반올림 캐시보다 fade 중 갱신이 많을 수 있지만 안정된 자막·빈 자막은 계속 재전송하지 않아. 빈 자막에서는 capTex를 한 번 갱신해 Sphere가 직접 읽는 텍스처도 지워. Hall mesh만 숨기는 upstream 경로의 정적 잔상 위험을 보완한 부분이야. [기준선 screen][base-screen] · [screen][screen] · [domeshow][domeshow]

## 6. 스피어: 기존 재사용을 보존한 추가 변경

**세계의 ray-marching 내용과 step 수는 줄이지 않았어.** cube 내부 ray 프록시만 SphereGeometry에서 BoxGeometry로 바꾸어 geometry 제출을 줄이고, opaque 건축물의 depth 뒤에서 돔 base를 그리도록 순서를 바꿨어. Box와 sphere가 만드는 정규화 ray 관계는 CPU 검사 대상이지만 부동소수점·rasterization까지 모든 픽셀이 같다고 단정하지 않아. 무거운 픽셀별 march는 여전히 주요 남은 비용이야. [dome3d][dome3d] · [domeshow][domeshow]

품질 변경 때 기존 cube target 객체를 resize하고 면 캐시를 무효화해, 나중에 다시 보이는 면이 오래된 텍스처를 쓰지 않게 해. high/medium의 크기와 cadence는 같은 시작 preset 기준으로 유지해. full build에서 나중에 low를 선택했을 때의 384 target은 해상도 감소이므로 동일 품질 성능 개선에서 분리해야 해. 처음부터 low/Lite로 부팅한 painted 세계는 별도 경로야. [domeshow][domeshow]

cube draw의 target/face/mip/XR 상태를 finally로 복원하고, 예열 실패 때 임시 world/face 상태도 비워 실제 세계의 첫 시작 시간이 오염되지 않게 해. liveActive는 shader가 실제로 피드를 샘플하는 종료 조건과 맞추고, 화면 설정·입장 상태에서 중계를 쓰는 동안에만 보조 viewer의 면을 더해. 조명 갱신의 반복 Color/Vector 생성도 일부 재사용해. [dome3d][dome3d] · [domeshow][domeshow] · [sphere][sphere] · [main][main]

world renderer와 두 target 객체는 full build의 buildDome에서 생성돼. 명시적인 새로운 lazy world 생성/전체 dispose API를 도입한 것은 아니야. upstream warm은 첫 사용 비용 일부를 boot로 옮기고 compileAsync의 돔 가시성 복원은 ui.ready와 독립적이야. **UI가 준비됐다는 이유로 아직 숨겨진 돔을 빠른 렌더 결과로 측정하면 안 돼.** 실제 base/overlay draw와 world 예열 상태까지 확인해야 해. [main][main] · [dome3d][dome3d] · [돔 통합 검토](performance-data/main-1f-integration/forest-main-1f-sphere-review.md)

## 7. 오디오: 바뀐 작업과 그대로인 음악 시계

### 박수 합성만 별도 Worker로 이동

새 crowd-loader/worker는 기존 crowd.js의 renderApplause와 seed/profile/PCM 형식을 사용해. 순차 요청과 transferable channel buffer로 합성 결과를 받고, AudioContext를 가진 메인 스레드에서 AudioBuffer로 복사해. 네 결과를 한꺼번에 대기시키지 않는 backpressure, 잘못된 응답·타임아웃·Worker/CSP 실패의 동기 fallback, context 교체 시 취소가 있어. main은 악기 샘플 로딩과 박수 준비를 병행하고 입장 준비 전에 둘 다 기다려. [crowd-loader][crowd-loader] · [crowd-worker][crowd-worker] · [crowd][crowd] · [engine][engine] · [main][main]

이 변경은 **음표 스케줄러를 Worker로 새로 옮긴 작업이 아니야.** 박수 합성의 메인 스레드 점유를 옮기려는 것이고 합성 CPU 총량이 사라지거나 모든 브라우저의 로딩이 빨라진다고 보장하지 않아. AudioBuffer 복사 비용이 남고 fallback은 기존 동기 비용을 치를 수 있어. 샘플 자체를 낮은 품질로 재인코딩하지 않았어.

### listener의 불변값만 생략

setListener는 위치·방향을 정확한 값으로 비교해 같은 AudioParam 목표를 반복 예약하지 않아. 방향만 바뀌면 위치/거리 필터는 건드리지 않고, 고정 청취자라도 로비 음원이 생성·이동하면 _spatialDirty로 거리·공기 흡수 계산을 다시 수행해. 미세 이동을 threshold로 잘라내는 방식이 아니며 기존 smoothing 상수·거리식·잔향·악기 gain·필터 연결을 유지해. context 재초기화 시 pose도 무효화해. [engine][engine]

### 스케줄러와 샘플 품질 정책은 변경 없음

기존 25ms timer Worker의 메시지는 메인 스레드에서 _schedule을 실행하게 해. 전경 lookahead 0.4초·배경 3초, AudioContext 시각/출력 지연 보정, section lag·humanization, play/pause/seek 및 note/envelope 처리 경로는 같아. Performance의 변경은 시각용 active 배열 정리야. rAF를 줄여도 이미 예약한 오디오는 별도 시계로 재생되지만, 메인 스레드가 예약 여유보다 오래 막히면 새 음표 예약이 늦어질 위험은 남아 있어. [engine][engine] · [performance][performance]

기존 Lite는 AudioContext sampleRate 요청값, 샘플 선택 간격, 긴 decay 절약, panning 비용을 다르게 둬. 이번 변경에서 새로 강화하지 않았고 full과 Lite가 완전히 같은 음질이라고 주장하지 않아. 악기 샘플·음악 JSON asset은 기준선과 같고 임의 음표 생략/voice cap을 추가하지 않았어. 청감·실기기 출력 지연·장시간 glitch는 CPU 단위 검사만으로 검증할 수 없어. [engine][engine]

## 8. 자동 품질과 시각 비교의 해석

AdaptiveQuality는 clamp 전 실제 frame interval의 평균과 p90을 관찰하고 지속적인 부하/여유, 초기·전환 유예, 회복 및 회복 실패 잠금을 사용해. stage의 입퇴장·hush 동안 표본을 유예하고 수동 선택은 scale을 초기화해. full build 자동 최소 medium은 upstream과 맞췄고, Lite는 low에서 시작해 medium까지 일부 효과·해상도를 회복할 수 있어. 처음 결정한 모델/오디오 Lite 경로를 full로 재생성하는 기능은 아니야. [quality][quality] · [main][main]

| 화면 차이의 원인 | 구분해야 할 해석 |
|---|---|
| high PR 상한 1.5·medium×0.85 | 1f의 기본 품질 정책. 이전 6a 화면과 해상도가 다를 수 있고 우리 성과에서 제외해. 새 비교는 actual drawingBuffer/DPR/scale까지 같아야 해. |
| auto의 scale·preset·회복 | 적응형 품질 결과로 별도 평가해. 수동 high/medium 고정 비교와 섞지 않아. |
| boot-low/Lite와 full에서 나중에 low | 같은 low 이름이어도 모델·오디오·세계 경로가 다르므로 서로 고정 품질 비교 대상으로 삼지 않아. |
| NIGHT 공유·새 광장·2-pass 돔 전환 | upstream 변화야. 특히 세계별 tone mapping 후 overlay blending은 예전 shader 안의 mix와 일반적으로 픽셀 동일하지 않아. |
| 정확한 caption fade·빈 Sphere 자막 복구 | 의도된 정밀도/정확성 차이. 자연스러운 fade 시각과 진짜 잔상·손실을 구분해. |
| Box ray의 미세 픽셀 차이·배치 순서 | 곧바로 품질 저하 또는 동등성으로 판정하지 않아. 위치별 오차·최대 오차와 실제 화면을 함께 확인해야 해. |
| 관객·카메라·곡 시각 차이 | 최적화 효과가 아니라 fixture 불일치일 수 있어. 좌석 점유/pose/보조 카메라/연출 시각을 함께 기록해야 해. |

근거: [기준선 main][base-main] · [quality][quality] · [screen][screen] · [dome3d][dome3d] · [domeshow][domeshow]. 새 DPR 정책이나 숨겨진 돔을 이용해 FPS 개선처럼 보이게 하지 않아.

공연장의 #joyZone만 z-index 9로 둬 모바일 탐색바 입력을 가리지 않게 한 CSS 차분도 남아 있어. 광장 전용 조이스틱 ID에는 적용하지 않아. 이는 입력 회귀 수정이며 렌더 성능 성과는 아니야. 이전 버전의 모바일 실행 증거는 보존하되 새 main UI 배치에서도 다시 확인해야 해. [style][style]

## 9. 로딩·캐시·서버·네트워크의 한계

샘플 로딩은 manifest를 읽고 6개의 비동기 작업으로 fetch/decode/compact를 수행한 뒤 엔진 Map에 보관하는 기존 경로야. 이 로딩 함수는 변경하지 않았고, 곡 load 역시 music/id.json fetch와 이벤트 정렬을 수행해. 새 곡 선별 sample preload, 영속 decode cache, music JSON LRU, AudioWorklet scheduler를 추가하지 않았어. 기존 샘플 메모리·decode 비용은 여전히 초기 진입과 장시간 사용의 검토 대상이야. [engine][engine] · [performance][performance]

server.js/server/rooms.js/server/ws.js와 RoomClient는 1f와 byte 동일해. 서버는 text gzip 메모리 캐시, ETag 재검증, MP3/vendor cache header, /api/rooms와 /ws를 제공해. RoomClient는 서버 시계 offset·재접속·방장 권한·상태/명령/pose/chat을 처리하고 main이 재생 상태와 화면을 연결해. 이 계층은 유지했으며 backend 최적화를 클라이언트 FPS 개선으로 세지 않아. cold/warm HTTP 전송·JSON parse·decode·GPU 업로드 시간은 나눠 측정해야 해. [server][server] · [rooms][rooms] · [websocket][websocket] · [room][room] · [main][main]

최신 joining/UI.enter/티켓 버튼 guard는 그대로 보존했고, 우리 UI sleep/wake rAF 정리와 독립적으로 작동해. 새 브라우저 검증에서는 발권·입장 연타·실패 후 재시도, 공연장 변경/방장 이양, 다중 탭 채팅/동기화, 광장 복귀를 실제 UI로 확인해야 해. 프로토콜 단위 통과나 프로그램 함수 호출만으로 이 전체 사용자 흐름을 통과했다고 표현하지 않아. [main][main] · [ui][ui] · [tickets][tickets]

## 10. 검증 상태와 남은 위험

작성 시점의 최신 통합 [Node 검사 기록](performance-data/main-1f-integration/node-tests.json)은 **실제 75 case PASS / 0 FAIL**이야. 각 테스트 파일을 직접 실행한 로그에서 case를 합산했어. 에이전트가 중복 실행한 22개 검사나 임시 headless 검사 등을 더해 75보다 큰 통과 수로 부풀리지 않아. CPU 검사와 정적 검토의 상세 근거는 [통합 검증 묶음](performance-data/main-1f-integration/README.md)에 있어.

이 문서를 작성하며 추가 브라우저/GPU 실행이나 단위 검사 재실행은 하지 않았어. 기록된 PASS 범위는 배열/음표 시각 상태, listener invalidation, Worker 준비/fallback, 기하·picking, 좌석 카메라 교대, caption/렌더 상태, 돔 face/resize/예열 실패, 자동 품질 정책이야. WebGL의 실제 그림·드라이버 compile 비용·음질·터치 성공을 대신하지 않아.

| 새 1f 기준 항목 | 이 감사 작성 시점 |
|---|---|
| Hall/Sphere 같은 품질 FPS·1% low·p95·draw calls 전후 | 미측정 — 새 baseline/candidate 반복 비교 필요 |
| GPU timer·CPU task·JS/GPU 메모리·cold/warm 로딩 전후 | 미측정 — 직접 못 얻는 값은 미측정으로 남겨야 해 |
| 같은 camera/crowd/music/시각의 screenshot·이미지 차이 | 미검증 — 특히 caption/좌석/그림자/돔 overlay 필요 |
| 실제 오디오 glitch·동기화·청감·장시간 재생 | 미검증 — scheduler의 main-thread stall 위험이 남아 |
| 실물 저사양 PC·Android Chrome·iOS Safari·발열/배터리 | 미검증 — viewport/SwiftShader 결과로 대체하지 않아 |

우선 남은 위험은 전체 관객의 넓은 bound, 로비 문 너머의 overdraw, 3D 세계의 fragment 비용, overlay와 투명 빔의 순서, 빠른 회전/품질 변경 후 cube 면 갱신, compileAsync 동안 돔 readiness, 장시간 shader/target/sample 수명과 오디오 예약 지연이야. 구조적으로 중복 작업을 줄인 사실과 30/60FPS 달성 여부는 분리해서 보고해야 해.

## 소스 링크

각 절의 근거는 아래 고정 커밋의 실제 파일이야. 변경하지 않은 파일도 공유 merge/main 호출부의 영향을 받을 수 있어.

[diff]: https://github.com/eddy961206/forest-philharmonic/compare/1f8e5f16f1eee03140e13ba1ee66832841559604...dea7997c6278f10ff467815ab96b370362549b0c
[boot]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/boot.js
[plaza]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/plaza.js
[tickets]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/tickets.js
[main]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/main.js
[venue]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/venue.js
[ui]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/ui.js
[materials]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/materials.js
[orchestra]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/orchestra.js
[characters]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/characters.js
[instruments]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/instruments.js
[merge]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/merge.js
[hall]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/hall.js
[foyer]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/foyer.js
[hallplan]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/hallplan.js
[seats]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/seats.js
[geometry]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/geometry.js
[instance-batches]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/instance-batches.js
[Director]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/director.js
[audience]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/audience.js
[screen]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/screen.js
[sphere]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/sphere.js
[dome3d]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/dome3d.js
[domeshow]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/domeshow.js
[quality]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/quality.js
[engine]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/audio/engine.js
[performance]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/audio/performance.js
[crowd-loader]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/audio/crowd-loader.js
[crowd-worker]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/audio/crowd-worker.js
[crowd]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/audio/crowd.js
[room]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/net/room.js
[server]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/server.js
[rooms]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/server/rooms.js
[websocket]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/server/ws.js
[style]: https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/css/style.css
[base-main]: https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/main.js
[base-seats]: https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/seats.js
[base-audience]: https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/audience.js
[base-screen]: https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/screen.js
[base-hall]: https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/hall.js
[base-dome3d]: https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/dome3d.js
[base-domeshow]: https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/domeshow.js
