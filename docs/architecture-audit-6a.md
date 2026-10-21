# 광장 통합본의 실행 구조와 최적화 판단 — main 6a 기준

이 문서는 **광장이 포함된 기준선 `6a59c33`과 제품 후보 `06c8ac5`의 실제 호출 관계, 변경 원리, 남은 비용**을 기록해. 전체 검증 계획의 완료 보고서나 실물 기기의 FPS 보증은 아니야. 기존 [architecture-audit.md](architecture-audit.md)는 a41의 역사 자료로 보존하고, 그 버전의 측정 수치를 여기로 옮기지 않았어.

## 1. 고정 코드와 근거의 범위

| 구분 | 식별자 |
| --- | --- |
| 광장 추가 후 기준선 | `6a59c33ced4fbbe237b38eb5a4c63e38636bf07f` |
| 이 문서가 설명하는 제품 후보 | `06c8ac5e6956b3b337102b342fbd4e422b43baf9` |
| 기준선 `public/js/main.js` SHA-256 | `9627b954dfb30a226df87e4eda83d96577e686995622c35f275dd1d2c4ed5283` |
| 후보 `public/js/main.js` SHA-256 | `a0d096e176f391537439c30aa4edd89fcace95fc542803a7dc1ea8a7790efaed` |
| 초기 high 측정의 후보 라벨 | `42dffe5-plus-screen-visibility` — Git SHA가 아니라 당시 작업 트리 라벨이야. 제품 변경은 `06c8ac5`에 보존돼. |

소스 링크는 위 커밋에 고정했어. 이후 main이나 PR head가 바뀌면 같은 코드인지 다시 확인해야 해. [6a→06c diff][diff]와 [실제 PC 재현 절차](performance-reproduce-6a.md)를 함께 읽어 줘. 후속 집계기 `collect-plan.mjs`는 06c에 없어서 별도 도구 커밋 `0949203`에 고정했어. 문서/도구가 추가됐다고 과거 raw의 제품 revision을 바꾸지 않아.

근거도 나눠서 사용해. **소스 확인**은 호출·할당·갱신 조건, **구조적 효과**는 덜 제출하거나 계산하게 된 작업, **실행 관찰**은 특정 환경에서 저장한 표본이야. 구조만 보고 FPS를 만들거나, 이전 기준선의 개선율을 새 main에 옮기지 않아. 이 감사의 실행 수치는 완료된 첫 high desktop 두 쌍으로 제한했어.

## 2. 광장 → 발권 → 공연장 → 복귀

[boot.js][boot]는 URL과 세션의 `fp-ticket`을 읽어 광장과 공연장 중 하나를 동적으로 import해. 공연장 URL이 없으면 `plaza.js`, 방 초대 `?room=`가 있거나 해당 건물의 표 또는 `?lobby` 경로가 있으면 `main.js`를 불러와. 표 없는 `?venue=`는 광장으로 redirect돼. 예전처럼 bare `?venue=hall`만 열면 공연장 대신 광장/redirect를 측정할 수 있어.

| 단계 | 실제 호출·데이터 | 비용과 이번 판단 |
| --- | --- | --- |
| 첫 화면 | `plaza.js` → `buildPlaza()`·캐릭터·자체 Renderer·이동/카메라 loop | main과 오디오 엔진은 게이트 이동 뒤 시작해. 이 분리는 6a에 이미 있어. |
| 매표소 | `music/index.json`, `SETLISTS`, 공개 방은 `listRooms()` → `/api/rooms` | 안내와 방 목록을 읽어. 광장에서 악기 샘플 전체를 decode하지 않아. |
| 발권 | `identity()` → `issueTicket()` → 세션 표 저장 | 동물은 첫 생성 뒤 보존하고 이름을 바꿔. 이전 avatar select를 전제로 한 검사는 현재 UI와 달라. |
| 게이트 | 표가 해당 건물과 맞으면 `enterGate()` → `?venue=hall/sphere`로 새 페이지 이동 | 광장 진입과 공연장 준비 시간을 나눠 기록해야 해. |
| 공연장 입장 | `main.js`가 표/초대와 solo/create/join을 연결하고 준비 완료 뒤 UI를 열어 | `?lobby` 직접 입장 검사는 발권·게이트 검사를 대신하지 않아. |
| 복귀·교체 | `toPlaza`/`leaveRoom`은 방을 떠나고 표를 지운 뒤 URL 초기화. `goVenue()`는 다른 건물을 새 페이지로 구성 | 하나의 Renderer 안에서 공연장 전체를 갈아 끼우는 구조가 아니야. |

근거: [plaza][plaza] · [plazaWorld][plaza-world] · [tickets][tickets] · [venue][venue] · [main][main]. 광장 모델·발권·자체 frame loop는 이번 제품 diff에서 재작성하지 않았어. 광장 흐름은 새 회귀 검증 대상이며 공연장 렌더 수치에 광장 성능까지 포함됐다고 쓰지 않아.

## 3. main의 생성 순서와 두 시계

main은 재질 full/Lite 모드를 정한 다음 Renderer, 환경맵, 선택한 건물, 오케스트라, StageManager, 독주회 좌석, 관객, 중계, Director를 구성해. 실제 건물 생성은 하나지만 Hall/Sphere builder는 main의 정적 import graph에 있어. 선택하지 않은 공연장 모듈까지 모두 지연 다운로드하도록 바꾼 것은 아니야. Sphere의 walking plan override는 다른 모듈이 배치를 사용하기 전에 적용돼. [main][main] · [sphereplan][sphereplan]

`boot()`는 AudioEngine 초기화 뒤 `music/index.json`에서 공연장별 프로그램을 고르고, 악기 샘플 로딩과 박수 준비를 시작해. 둘이 끝나고 첫 곡 JSON을 읽은 뒤 독주회 좌석까지 잠깐 보여 shader compile을 시도하고 입장 UI를 열어. compile 실패 시 첫 사용에 컴파일하는 기존 fallback도 남아 있어. [main][main]

### 시각 프레임

후보의 frame 순서는 다음과 같아. 음악 상태는 `perf.time`, 물리·보간은 제한한 `dt`를 사용해.

1. `Performance.updateVisual()` → 연주자별 음표 상태 → `orchestra.update()`의 활·손·악기·지휘자·표정.
2. 무대 입퇴장, 로비/인터미션, 방 상태, Sphere 연출, 건물·관객·효과를 갱신.
3. `director.update()`로 카메라를 결정하고 `setListener()`·`setRoom()`으로 공간 음향을 갱신.
4. Hall 로비 가시성, 관객/좌석 LOD, Sphere `drawWorlds()`를 현재 카메라에 적용.
5. `orchestra.syncLite()` 후 이 프레임의 그림자 갱신을 요청.
6. 보이는 중계 피드를 필요한 주기에 촬영하고 본 화면을 composer 또는 직접 renderer로 그림.
7. 전체 렌더 통계와 실제 elapsed를 기록하고 자동 모드일 때만 품질 정책을 평가.

Hall의 `scene.onBeforeRender`는 **각 render camera마다** `prepareRender()`를 호출해 좌석 fine/coarse를 고르도록 연결했어. 방문자 카메라의 배치를 중계에 그대로 사용하는 방식이 아니야. [main][main] · [seats][seats]

### 오디오 시계

`Performance.time`은 AudioContext 시각·시작 위치·출력 지연에서 계산해. 음표는 rAF 횟수 대신 기존 Worker tick → 메인 스레드 `_schedule()` → Web Audio 절대 시각으로 예약해. **Worker가 있어도 메시지를 받는 메인 스레드가 막히면 예약이 지연될 수 있어.** 기존 tick 25ms, 전경 lookahead 0.4초·배경 3초, 음표 순서·humanization·출력 지연 보정은 변경하지 않았어. [engine][engine] · [performance][performance]

후보는 FPS/품질 평가에 clamp 전 실제 elapsed를 쓰고 애니메이션의 dt 제한은 유지해. 제한된 dt로 느린 렌더링을 빠르다고 판단하지 않도록 한 변경이야. 시각 시간을 고정하는 fixture와 자동 품질을 검사하는 fixture의 시계 조건도 구분해야 해. [main][main] · [quality][quality]

## 4. 공통 렌더링에서 줄인 작업

| 소스에서 확인한 비용·원인 | 채택한 변경 | 품질·검증 경계 |
| --- | --- | --- |
| 중계/본 화면에서 같은 동적 장면의 shadow map 중복 갱신 | `autoUpdate=false`, 시각 프레임당 한 번 `needsUpdate` | 그림자 맵 해상도를 낮춘 성과가 아니야. 두 카메라의 그림자 정확성은 검증 대상이야. |
| Lite 팔 행렬 동기화가 중계 뒤에 위치 | 두 카메라 렌더 전에 `syncLite()` | 연주 포즈 함수를 축약하지 않고 같은 프레임의 팔 행렬을 공유해. |
| 초기 composer 이중 구성과 재구성 자원 수명 | 중복 구성 제거, pass/composer dispose, 임시 RoomEnvironment/PMREM 생성기 dispose | 할당/수명 관리 변경이야. 물리 VRAM 절감량을 자동으로 뜻하지 않아. |
| 병합 전에 indexed geometry를 전부 펼침 | Hall·관객·merge는 index 보존. 좌석은 모든 attribute가 정확히 같은 vertex만 공유 | 표면·UV·normal 경계를 없애는 단순화가 아니야. index 절약 자체는 draw call 감소와 다른 효과야. |
| 시야 밖 중계를 계속 촬영하고 같은 자막도 다시 그림 | Hall screen bounds/로비 가시성으로 생략, 재노출 invalidate, 촬영 프레임의 카메라 계산, caption draw key 캐시 | 보이지 않는 동안 보조 카메라 샷 시간이 멈추는 동작 차이가 있어. 9절 참고. |
| sleep/wake·visibility의 중복 rAF와 오염된 품질 표본 | 단일 pending frame, hide/sleep 취소, resume clock/hold 초기화, UI string canvas chain 정리 | 백그라운드 작업 절약이야. 광장 루프 전체를 재작성한 것은 아니야. |

근거: [main][main] · [screen][screen] · [geometry][geometry] · [merge][merge] · [hall][hall] · [audience][audience] · [ui][ui]. `renderer.info.autoReset=false`와 프레임당 reset은 여러 패스의 통계를 포함하기 위한 계측 정리이며 자체 성능 개선으로 세지 않아.

### 이미 효율적이어서 유지한 재질·캐릭터·악기 경로

`materials.js`는 절차적 canvas 무늬와 seed, `once` 캐시, full/Lite 재질을 이미 사용해. 텍스처 크기나 PBR 표현을 이번에 일괄 낮추지 않았어. `characters.js`는 움직일 눈·입·팔 등을 남기고 강체를 병합하며 Lite 팔을 InstancedMesh로 공유해. `orchestra.js`는 음악 section/chair 상태를 읽어 rig·지휘·표정을 갱신하고, `instruments.js`는 건반 instancing과 하프·활 등의 연주 구조를 제공해. [materials][materials] · [characters][characters] · [orchestra][orchestra] · [instruments][instruments]

이 네 파일은 직접 변경하지 않았지만 공용 `mergeChildren()` 변경의 영향은 받아. index를 유지하고, 움직일 자식을 부모 mesh 제거 **전**에 attach해 world transform과 애니메이션 대상이 사라지지 않게 했어. 화면 밖 동물의 음악 상태를 일괄 중단하거나 활·손 업데이트 주기를 낮추는 새 정책은 넣지 않았어. [merge][merge]

## 5. 숲속 홀: 좌석 배치와 로비의 한계

기준선의 종류별 큰 InstancedMesh는 일부 좌석만 보여도 큰 bound 때문에 많은 좌석을 함께 제출할 수 있었어. 후보는 **같은 geometry·재질·transform·색**을 공간 배치로 나눠 frustum culling을 적용해. 넓은 시점에서 종류의 fine part가 모두 제출될 조건이면 coarse 배치로 합쳐 draw 증가를 줄여. 전체 객석이 보이는 경우까지 제출 삼각형이 크게 줄었다고 말하지 않아. [기준선 seats][seats-before] · [후보 seats][seats]

부품의 같은 instanceMatrix를 공유하고 picking은 원래 전역 ID를 유지해. 배치 bound로 후보를 줄인 다음 원래 `InstancedMesh.raycast()`를 호출하고 local ID를 복원하는 방식이야. 좌석 위치·순서나 Director 이동 규칙은 바꾸지 않았어. 관련 비교 검사는 [instance-batches 테스트][test-pick]와 [seats 테스트][test-seats]에 있어. [instance-batches][instance-batches] · [Director][director]

4층·발코니·샹들리에·계단·로비는 Hall/Foyer와 공유 병합 함수를 사용해. `foyer.js`·`hallplan.js`의 형태와 동선은 6a와 같아. 로비에서 문이 하나도 안 보이면 객석·관객을 숨기는 `interiorCull()` 역시 **6a에 이미 있었어.** 이번에는 좌석 배치·중계 가시성과 연결했으며 새 portal renderer를 만든 것이 아니야. [hall][hall] · [foyer][foyer] · [hallplan][hallplan] · [기준선 main][main-before]

**미해결:** 문이 조금이라도 보이면 내부의 큰 부분을 다시 그릴 수 있어. 좌석 frustum 배치가 문 구멍의 실제 가림 영역까지 잘라 주지는 않아. wide/foyer에서 개선 폭이 작은 이유를 이 구조와 함께 봐야 해. 관객도 기존 instancing/LOD가 있지만 넓은 시야의 전체 관객 vertex/fragment 비용은 남아 있어. 후속 portal/관객 변경에는 여러 층·문·역방향 시야·중계에서 누락이 없는지 검증이 필요해. [main][main] · [audience][audience]

## 6. 스피어: 기존 기능과 신규 변경을 구분

### 기존 6a의 최적화 — 신규 성과로 계산하지 않음

- section별 좌석 InstancedMesh와 근거리/원거리 geometry LOD가 이미 있어. 약 1만 4천 석을 개별 Mesh에서 처음 instancing한 작업이 아니야.
- `facesSeen()`/`faceMask()`는 방문자 시야와 중계 방향을 합쳐 보이는 cube 면을 고르고 있었어.
- `dome3d.js`는 바닥 아래 `-Y` 면을 생략하고, 다른 세계의 오래된 면은 필요할 때 갱신하며, 크로스페이드의 두 slot을 번갈아 그리는 temporal reuse를 이미 구현했어.
- Sphere walking plan·음향과 mobile Lite의 3D 세계 대체 표현도 기존 경로야.

근거: [기준선 sphere][sphere-before] · [기준선 domeshow][domeshow-before] · [기준선 dome3d][dome3d-before] · [sphereplan][sphereplan]. 교대 갱신이 전환 시작·새로 보이는 면·최종 합성까지 항상 한 세계와 같은 비용임을 보장하지는 않아.

### 06c에서 바꾼 것

| 변경 | 줄이려는 비용 | 유지 조건·경계 |
| --- | --- | --- |
| cube 내부 ray용 SphereGeometry를 BoxGeometry로 교체 | 프록시의 triangle/vertex 제출 | 같은 정규화 ray 방향을 만들려는 변화야. march step은 그대로고 부동소수점까지 픽셀 동일하다고 가정하지 않아. |
| 돔을 opaque 구조물 뒤에 렌더 | 가려진 돔 fragment의 중복 처리 | depth test의 조기 배제 기회를 줘. 순수 GPU 기여율은 별도 측정 대상이야. |
| 품질 변경 때 기존 cube target resize 및 face stale 처리 | 필요 이상의 target 유지, resize 뒤 오래된 면 | high=640·medium=512 유지. full 구조의 low=384는 해상도 절감이므로 동일 품질 성과로 세지 않아. |
| cube 렌더 상태의 try/finally 복원 | 예외 뒤 XR/target/face/mip 오염 | 안정성 변경이며 정상 FPS 개선 수치로 세지 않아. |
| liveActive 종료를 shader sampling 구간에 맞춤, 실제 사용 때만 중계 viewer 추가 | 보이지 않는 IMAG와 불필요한 cube 면 | fade-out 도중 필요한 피드는 유지하고 재노출 때 갱신을 요청해. |
| 좌석 생성 Vector3·조명 Color·beam 위치 재사용 | 임시 객체 할당 | 기존 좌석 LOD·광원 수를 낮춘 변화는 아니야. |

근거: [dome3d][dome3d] · [domeshow][domeshow] · [sphere][sphere] · [main][main]. low target이나 자동 scale 하향의 효과를 high→high와 합산하지 않아.

**미해결:** FOREST/PEAKS/OCEAN/CLOUDS에는 noise·march·지형/구름/수중 계산이 남아 있어. 이 GLSL을 전면 재작성하거나 step을 줄이지 않았어. 프록시 vertex 절약만으로 fragment 지배 장면이 크게 빨라진다고 할 수 없어. 첫 high에서 일부 3D 장면은 개선되지 않았고 reveal은 느려졌어. 기존 면 선택·crossfade 분산을 신규 성과라고 설명하면 이 한계를 가리게 돼. [dome3d][dome3d] · 9절

## 7. 오디오·악보·샘플·박수

`Performance.load()`는 `music/<id>.json`을 읽고 시간순 flat event list와 chair 상태를 만들어. `_schedule()`은 이벤트를 Web Audio에 예약하고 `updateVisual()`은 연주 동작을 따로 제공해. AudioEngine은 샘플 선택, envelope/필터, section 공간화, dry/reverb, compressor·limiter를 담당해. 이번에는 음표 수·강약·악기 balance·동시 발음 정책이나 원본 MP3를 바꾸지 않았어. [performance][performance] · [engine][engine]

샘플은 `samples/manifest.json` → 기존 6개 병렬 fetch/decode → 악기별 AudioBuffer Map 경로야. 6a의 Lite에는 이미 낮은 AudioContext sample rate, 일부 root sample 선택, tail 제한과 저렴한 panner가 있어. **새로 넣은 음질 절약은 아니지만 full과 Lite가 같은 음향 조건이라는 뜻도 아니야.** 같은 모드·context sample rate·실제 샘플 구성을 비교해야 해. 공연 중 필요한 음의 fetch/decode를 기다리게 하는 lazy loading은 도입하지 않았어. [engine][engine] · [sample manifest][sample-manifest]

채택한 CPU 변경은 다음과 같아.

- `setListener()`는 위치/방향/up이 정확히 같고 공간 데이터가 안 바뀌면 같은 AudioParam target을 다시 예약하지 않아. 아주 작은 이동도 반영하고, 회전만 있을 때 거리 필터는 재계산하지 않아. `addSpot()`/`moveSpot()`의 dirty 표시로 정지한 청자 앞의 로비 음원 변화도 갱신해.
- `updateVisual()`은 활성 음표 filter/map 배열을 매 프레임 새로 만들지 않고 기존 배열을 순서대로 압축하며 최고 velocity를 함께 구해. chair 목록은 load/seek 때 다시 만들어.
- `crowd.js`의 같은 박수 함수를 Worker에서 실행하고 PCM을 transfer해. profile별 요청/응답으로 결과가 동시에 쌓이지 않게 하고 메인 스레드에서 AudioBuffer로 복사해. 실패·차단·timeout 시 누락된 profile만 동기 합성하며 입장 준비는 promise를 기다려.

근거: [engine][engine] · [performance][performance] · [crowd][crowd] · [crowd-loader][crowd-loader] · [crowd-worker][crowd-worker]. 박수 변경은 합성 작업의 실행 스레드를 바꿔. 네트워크 전송량이나 최종 PCM 메모리가 자동으로 줄어드는 것은 아니야.

**남은 안정성 문제:** controlled audio-resume 진단에서 AudioContext 시계 정체가 관찰됐고 두 실행 모두 pause 전부터 정체가 시작된 것으로 분류됐어. readPixels와의 시간 상관만으로 GPU·브라우저·오디오 장치·scheduler 원인을 확정하지 않았어. 후보의 실제 E 착석 ID도 목표 좌석과 달라 같은 카메라 부하의 전후 쌍으로 쓸 수 없어. 이 차이는 raycast 회귀로 확인된 사례가 아니며 기존 최근접 자유석과 관객 난수 조건의 영향을 받는 collector 한계야. 원본 FAIL을 보존하고 후속 실행과 분리해야 해. 실제 출력 청취·녹음, underrun, 공간감/잔향/동기화의 장시간 검증은 이 감사가 대신하지 않아. 상세 진단은 검증 출력의 `runtime/audio-resume/`와 `picking-review.json`에 있어.

## 8. 적응형 품질·네트워크·서버

### 적응형 품질은 별도 항목

`AdaptiveQuality`는 실제 frame interval의 mean/p90 중 큰 값을 관찰해. 느린 구간이 반복돼야 낮추고 더 긴 안정 구간 뒤 회복을 시도해. 진입·shader rebuild·visibility·행진/hush에는 표본을 hold해. 연주 중에는 해상도를 우선 조절하고 preset 변경/회복은 곡 사이를 우선해. 회복 직후 실패하면 업그레이드 반복을 막고, preset별 DPR 차이는 scale로 보정해 하향인데 픽셀 작업이 갑자기 늘어나는 경우를 피하려 해. [quality][quality] · [main][main]

수동 high/medium에는 적용하지 않아. `LITE`는 여전히 입장 때 `isMobile || quality==='low'`로 고정되고 Lite 자동 회복의 상한은 medium이야. 고성능 모바일을 실측 분류해 full 캐릭터/3D 세계로 재구축하는 기능, 배터리·온도 센서 정책, 기기별 VRAM budget은 없어. 프레임 시간으로 부하를 관찰할 뿐 발열을 직접 측정하거나 보장하지 않아. [main][main] · [materials][materials] · [domeshow][domeshow]

### 방과 정적 로딩

`RoomClient`는 `/api/rooms`, `/ws`로 방 생성/입장, 서버 시계 offset, host state/cmd, pose·채팅·handoff·재접속을 처리해. main이 snapshot을 적용하고 로컬 재생 위치와 상태를 맞춰. 서버가 WebGL 영상이나 합성 음악을 대신 렌더해 보내는 구조는 아니야. 방문자의 브라우저가 각자 샘플과 장면을 실행해. [room][room] · [main][main] · [rooms server][rooms] · [WebSocket][ws]

`server.js`의 텍스트 gzip 캐시, ETag/304, MP3/vendor cache, HEAD/range와 방 메시지 제한은 기존 구현을 유지했어. 서버 CPU나 사양을 방문자 FPS 성과로 계산하지 않아. cold/warm 전송량·decode·첫 화면/공연 준비는 브라우저에서 따로 기록해야 해. [server][server] · [music index][music-index]

## 9. 완료된 첫 high 비교의 관찰

**기준선/후보 각 1회, 장면당 예열 4+측정 8프레임**의 초기 결과야. Linux x64, Chrome 153.0.8010.0, Playwright 1.64.1, SwiftShader, 640×360, DPR 1, 수동 high·실제 scale 1에서 원래 frame 뒤 readPixels로 완료를 기다렸어. **FPS·1% Low·순수 GPU 시간이나 실제 PC/휴대폰 결과가 아니야.** n=8의 nearest-rank p95/p99는 최댓값이므로 장기 tail 안정성을 입증하지 않아.

| 장면 | 평균 완료 시간 변화 | 함께 볼 결과 |
| --- | ---: | --- |
| Hall front | −29.55% | 제출 triangles −36.63%, 마지막 PNG 동일 |
| Hall wide / foyer | −1.47% / −1.67% | 작은 변화, foyer p95 +3.74%; 내부가 보이는 로비 비용은 남음 |
| Hall rotate | −10.01% | calls +5.74%; 배치 분할 비용과 제출량 절감을 구분 |
| Hall broadcast / hidden | −8.59% / −48.23% | calls −11.02% / 959.75→600, PNG 동일 |
| Sphere dome | −13.12% | PNG 동일; 한 번의 software 완료 시간 결과 |
| Sphere broadcast | −1.92% | calls −13.08%; call 감소와 전체 시간 감소 크기는 다름 |
| Sphere forest / peaks / clouds | +0.09% / +0.15% / +0.67% | 평균 시간 개선 없음 |
| Sphere reveal | +7.54% | p95 +13.55%, PNG 동일; 악화도 보존 |

기록된 소스·수집기·fixture·브라우저·주 카메라·프리셋·scale 조건은 첫 두 쌍에서 일치했어. 전체 계획이나 모든 기기의 통과를 뜻하지 않아. 근거는 검증 출력의 `current/analysis-progress/summary.json`과 `current/review-high-results.json`이야. **검증 출력 루트 기준 경로**이며 저장소에 자동 생성되는 파일을 뜻하지 않아. 후속 결과는 최종 보고서에서 같은 버전끼리 집계해야 해. [재현 절차](performance-reproduce-6a.md) · [수집기][full-frame] · [후속 집계기][collect-plan]

화질은 따로 평가해. 19장면 중 13쌍은 PNG 바이트가 같고 Hall broadcast-return 및 Sphere 일부 3D 장면은 달랐어. Hall return 차이는 상단 중계 영역 안에만 있고 양쪽 마지막 표본에 중계 렌더 비용이 관찰돼. 후보는 hidden 12프레임의 `screen.update()`를 생략하므로 내부 샷 시간이 약 0.2초 덜 진행될 수 있다는 **코드상 추론**이 있어. 보조 카메라 실측값이나 후보만 최신 피드라는 증거는 아니야. 같은 프리셋이라도 이 장면을 보조 카메라까지 고정된 시각 동일성 근거로 쓰지 않아. [screen][screen] · [main][main] · [fixture][fixture]

geometry/texture 개수와 JS heap은 VRAM byte가 아니야. `performance.memory`와 CDP heap의 차이를 그대로 기록하고, geometry ArrayBuffer 합계가 있더라도 전체 프로세스·오디오·텍스처·cube 세계 메모리로 확대하지 않아. timer 확장 존재만 확인한 결과는 GPU 미측정이야. 미완료 snapshot, source/log 해시 불일치, 실행 실패는 정상 비교에서 제외하고 원인을 확인해 별도 실행으로 남겨야 해.

## 10. 미해결 범위와 후속 확인

| 항목 | 현재 판단 | 필요한 근거 |
| --- | --- | --- |
| Sphere fragment·reveal | GLSL 비용이 대부분 남고 일부 초기 장면 악화 | 물리 GPU timer, 같은 면/세계 시각 반복, shader 변경의 화질 비교 |
| 전체 관객·foyer portal | 좌석 frustum 배치로 문 영역까지 해결하지 못함 | 층·문·중계·역방향 시야의 가시성/누락 확인 |
| Mobile Lite | 안전 구조 유지, full 구조 자동 선택 미구현 | 실제 iOS Safari·Android Chrome의 메모리·지속 FPS·열·품질 비교 |
| 오디오 clock/scheduler stall | 구조적 독립성이 실제 무중단 보증은 아님 | 같은 실제 좌석/관객, native rAF, readback 유무 분리, 출력 청취·녹음 |
| 로딩·장시간 메모리 | 박수 Worker가 전체 전송/PCM을 줄인 것은 아님 | cold/warm 반복, decode/준비 시각, 재진입과 장시간 추세 |
| 광장·UI·방 | 기존 코드 유지가 자동 통과를 뜻하지 않음 | 발권→게이트→표 확인→이동/앉기/복귀, 공연/탐색, 두 탭 방·권한·채팅 |
| 브라우저·하드웨어 | 초기 수치는 headless Chromium software 결과 | 실제 Chrome·Edge·Safari와 PC·휴대폰·태블릿을 구분한 결과 |

이 문서 작업은 소스와 확보한 근거를 정리한 것이고 새 브라우저 측정·제품 수정·PASS를 추가하지 않았어. 시각·음향을 줄인 결과와 동일 품질의 비용 절감을 계속 분리해야 다음 변경을 판단할 수 있어.

## 부록: 파일별 고정 소스와 SHA-256

아래 해시는 작업 트리 HEAD가 아니라 **Git 06c 파일 바이트**로 계산했어. `유지`는 6a와 해당 파일이 바이트 동일하다는 뜻이야. 공유 모듈의 영향까지 없다는 뜻은 아니야. 후속 집계기만 별도 T 커밋에 고정해 아래에 구분했어.

| 파일·고정 소스 링크 | 6a 대비 | 06c SHA-256 |
| --- | --- | --- |
| [public/js/boot.js][boot] | 유지 | `45148c4e173fe40768eefcc1f1b7bd36d62584a4811c14d402afa3cda7ef8ab4` |
| [public/js/plaza.js][plaza] | 유지 | `ce5b125c896fa55b101758d2721145308b598834f32b83563773903ac57cff1a` |
| [public/js/scene/plazaWorld.js][plaza-world] | 유지 | `4370b2531192c6d4645c52517cb2af2f2fa0bb72edc81176461940ab758944eb` |
| [public/js/tickets.js][tickets] | 유지 | `10249e5ec484c330b820b9922a140df9e1d5d6d71725bea218e24dec1bb7f961` |
| [public/js/scene/venue.js][venue] | 유지 | `6a983fe2fda125922cf3cf00c1bb7943f6efabc2c49c5eedfad70bd43802b150` |
| [public/js/main.js][main] | 수정 | `a0d096e176f391537439c30aa4edd89fcace95fc542803a7dc1ea8a7790efaed` |
| [public/js/quality.js][quality] | 신규 | `c3f9ec2793c5799a02662099039b9c171df20a0943bd1bde3ecbcdd1b812f959` |
| [public/js/ui.js][ui] | 수정 | `ff0d7dcfdec3a4cf9b7a7f0dbb487fb16d1e58c13469d24a9db787c000630528` |
| [public/js/scene/materials.js][materials] | 유지 | `410e95a192304247ff34e52ec9874242bed577f0f37b1508423372fee17882c6` |
| [public/js/scene/orchestra.js][orchestra] | 유지 | `4465471bbcea945acf47516fae8d208374ef2ca5eb858eda3e67b1ce61a8c63f` |
| [public/js/scene/characters.js][characters] | 유지 | `331ade6a43aee760b6f18ed8478bc698e35386d9180fcff140d54567e4f1b0ce` |
| [public/js/scene/audience.js][audience] | 수정 | `d54764015ae562570f5ab0ed82a1830eb8efcbb98a0d06ed3dc5127241e9f505` |
| [public/js/scene/screen.js][screen] | 수정 | `013fad18f30aba991063976b5c33d402182ac25cf61ad5d92112205029bf41df` |
| [public/js/scene/hall.js][hall] | 수정 | `8e2831fcca6a7edba9250b4e42d2fa88a63fe0d92d2dde2e4ce1c92b0ddf2150` |
| [public/js/scene/foyer.js][foyer] | 유지 | `2b28cfc6f46fa05a9168d587c85e8691c2c7b16ea735185b08f5cd46d6aea56e` |
| [public/js/scene/hallplan.js][hallplan] | 유지 | `a9f13dcfe5bc1bd90ff4fad97246f0a5a2c5a0aaec8d66eaff8924fc1ad618ae` |
| [public/js/scene/seats.js][seats] | 수정 | `c5dc9616f0e127c2ff98e6707496c92cb2798af6c2364cae2df1bd5c00ecab27` |
| [public/js/scene/instance-batches.js][instance-batches] | 신규 | `09d81ddfc1a10dd34a5f44e053da2cb00678038403d42720f1e4aa2942923e01` |
| [public/js/scene/geometry.js][geometry] | 신규 | `28fc26938e8e2f4c9f64113dc018177c2694adadd8efc3dae8091a9e78e0a25e` |
| [public/js/scene/merge.js][merge] | 수정 | `7634326eaa7ac3706e7834384ffe35a962f6da156c786f251510f25798f683de` |
| [public/js/scene/instruments.js][instruments] | 유지 | `e7aee816a225f6b0b7143c7cc30f870dc764ebbac63b15873d80592a77cbc2bc` |
| [public/js/scene/director.js][director] | 유지 | `20ced19ffca9bac94e11b533ff18ea93b8417ab61cb0964e863da91a69bb3a8d` |
| [public/js/scene/stage.js][stage] | 유지 | `4bd644f2872339ef39e5f557e3b1d845e5fb0c0089770dcf66add0c5f320175a` |
| [public/js/scene/lobby.js][lobby] | 유지 | `207b3409cf76cd43e82c6b04b205ee364a3185b114dfc67f03a42b867bdcfa70` |
| [public/js/scene/recital.js][recital] | 유지 | `2fae6c7c3dfed6000a54ed867b6bcf397cc27be40a88ebbf13f9b6f0baa654dc` |
| [public/js/scene/sphere.js][sphere] | 수정 | `55f3c0ec16ff3cb092f98f449d7ea7774fb72f9f92cf586bc9e1c0f8793fa6dc` |
| [public/js/scene/domeshow.js][domeshow] | 수정 | `54ed6d88ff4c91bf802ba5affccdde96a09b6e512f20087131224108af8dbcbd` |
| [public/js/scene/dome3d.js][dome3d] | 수정 | `832f368158c44589a857183879771e55f90d234a600c9fafcd6b935e327c91c0` |
| [public/js/scene/sphereplan.js][sphereplan] | 유지 | `8b30f5718d17fbcf0a4ffdb0c8e1a7ebb306f5a859bc3f138f768e7ae5cb7585` |
| [public/js/audio/engine.js][engine] | 수정 | `c194f89992a132a1729475791ba9953536bde616f357876c9dcbc2c584bbe57a` |
| [public/js/audio/performance.js][performance] | 수정 | `a7b48b3c333ee100d86fe7990ff82bf116d660059f65203e3666bdb86d5ddb13` |
| [public/js/audio/crowd.js][crowd] | 유지 | `99fffcba861e4d9e2afdb6dd2e7157f4d4f2a6e4300ed6b7eb2f42fe0611530f` |
| [public/js/audio/crowd-loader.js][crowd-loader] | 신규 | `d7bfde3a5c3d63c752ae3b3625ee7f596732a757da1bb75f06069bb8ef8eb4c0` |
| [public/js/audio/crowd-worker.js][crowd-worker] | 신규 | `3da0d399f5ece9c835ba457d14c26483f2ad85e055bad51b419635e89888a02b` |
| [public/js/net/room.js][room] | 유지 | `e915652566cf2c11b824ac156e4ac1f2ff0dfe4f1389c68654d1c117a3063ef5` |
| [server.js][server] | 유지 | `525fa6171a6350d10957639ea8ab09c19b233b2260c6575937b0c0abde5d82b3` |
| [server/rooms.js][rooms] | 유지 | `39507fbee21b59682edfe8033b5b06623f6375cc80f52f5e22eba3b235ebc6cd` |
| [server/ws.js][ws] | 유지 | `c604930a7c08ccbb9d130b544060d82b15c8d2beece59938b9e6c9a46d1b4d1f` |
| [public/music/index.json][music-index] | 유지 | `22e9432314f0c1ce45628b39881c408cd41cd9b9587a6ba9c20976b947c7ab4d` |
| [public/samples/manifest.json][sample-manifest] | 유지 | `66bd0110a11b533b5956aa880662e2a0d5c6edef3b833ae5108e8d9f1462a777` |
| [public/vendor/three/three.core.js][three] | 유지 | `9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6` |
| [tests/instance-batches.test.mjs][test-pick] | 신규 | `10cc4b70d753c73e583e7bc1cf4008b10223b7576a28c24738c94cdebc1c7654` |
| [tests/seats.test.mjs][test-seats] | 신규 | `df88b694c0dc75a338b86a19e6a21d3ddf4d8ac551568763e738272529b36182` |
| [tools/bench/full-frame.mjs][full-frame] | 신규 | `f0b8973f462846a33413a4e55657d737554899e78b17988e28219545b37a5411` |
| [tools/bench/full-frame-fixture.js][fixture] | 신규 | `ba197fc2117d8af462146b3c833c9e0b8c0a4fa8c19fa3cdf3037bb32c2d325d` |

후속 집계기 T=`09492033251fd1986f7ce8c755b39923e539407a`: [tools/bench/collect-plan.mjs][collect-plan], SHA-256 `9305ce824c4c7f3ff2af6d1bff5e50e70acbcc279bf6561b32e60a3f1eeb15e2`. 제품 06c의 일부라고 표시하지 않아.

[boot]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/boot.js
[plaza]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/plaza.js
[plaza-world]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/plazaWorld.js
[tickets]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/tickets.js
[venue]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/venue.js
[main]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/main.js
[quality]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/quality.js
[ui]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/ui.js
[materials]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/materials.js
[orchestra]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/orchestra.js
[characters]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/characters.js
[audience]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/audience.js
[screen]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/screen.js
[hall]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/hall.js
[foyer]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/foyer.js
[hallplan]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/hallplan.js
[seats]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/seats.js
[instance-batches]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/instance-batches.js
[geometry]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/geometry.js
[merge]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/merge.js
[instruments]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/instruments.js
[director]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/director.js
[stage]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/stage.js
[lobby]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/lobby.js
[recital]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/recital.js
[sphere]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/sphere.js
[domeshow]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/domeshow.js
[dome3d]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/dome3d.js
[sphereplan]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/scene/sphereplan.js
[engine]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/audio/engine.js
[performance]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/audio/performance.js
[crowd]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/audio/crowd.js
[crowd-loader]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/audio/crowd-loader.js
[crowd-worker]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/audio/crowd-worker.js
[room]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/js/net/room.js
[server]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/server.js
[rooms]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/server/rooms.js
[ws]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/server/ws.js
[music-index]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/music/index.json
[sample-manifest]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/samples/manifest.json
[three]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/public/vendor/three/three.core.js
[test-pick]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/tests/instance-batches.test.mjs
[test-seats]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/tests/seats.test.mjs
[full-frame]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/tools/bench/full-frame.mjs
[fixture]: https://github.com/eddy961206/forest-philharmonic/blob/06c8ac5e6956b3b337102b342fbd4e422b43baf9/tools/bench/full-frame-fixture.js
[collect-plan]: https://github.com/eddy961206/forest-philharmonic/blob/09492033251fd1986f7ce8c755b39923e539407a/tools/bench/collect-plan.mjs
[main-before]: https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/main.js
[seats-before]: https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/scene/seats.js
[sphere-before]: https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/scene/sphere.js
[domeshow-before]: https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/scene/domeshow.js
[dome3d-before]: https://github.com/eddy961206/forest-philharmonic/blob/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f/public/js/scene/dome3d.js
[diff]: https://github.com/eddy961206/forest-philharmonic/compare/6a59c33ced4fbbe237b38eb5a4c63e38636bf07f...06c8ac5e6956b3b337102b342fbd4e422b43baf9
