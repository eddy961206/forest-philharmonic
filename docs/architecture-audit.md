# 조사한 실행 경로와 변경 범위

> **과거 a41 기준의 구조 조사야.** 아래 파일별 판단과 변경 범위는 당시 코드에 대한 기록으로 보존했어. 현재 비교는 **e741811 → 6c78172**이므로 [최신 성능·검증 보고서](performance-e741.md), [e741 렌더 재현 안내](performance-reproduce-e741.md), [e741 재생·기능·방·로딩 안내](performance-runtime-e741.md)에서 현재 결과와 재현 조건을 확인해. 이 문서의 구조 설명을 최신 전체 실측 결과로 인용하지 않아.

최종 비교 기준은 `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`이야. 최신 e741 성능 표는 [결과 보고서](performance-e741.md), 당시 실행 순서와 제외 사유는 [검증 과정](validation-log.md)에 있어. 이 문서는 소스에서 확인한 구조와 변경 판단을 설명해. 각 파일을 수정했다거나 모든 가능한 장면을 실측했다는 뜻은 아니야.

## 프레임과 오디오 시계

`main.js`는 부팅 때 재질 모드·Renderer·환경·공연장·오케스트라·관객·음향을 만들고, `frame()`에서 음악의 현재 시각을 읽어 연주 상태와 무대·카메라·효과를 갱신해. Sphere는 시점이 움직인 뒤 필요한 큐브 면을 그려. 이후 중계 카메라와 방문자 카메라가 장면을 렌더하고, 선택한 프리셋에 따라 후처리를 해.

`Performance.time`은 AudioContext의 시각과 출력 지연을 기준으로 계산돼. 음표 예약은 `requestAnimationFrame` 횟수가 아니라 AudioEngine의 별도 tick에 연결돼. 기존 25ms tick과 전경 0.4초·배경 3초 lookahead는 이번 PR에서 바꾸지 않았어. 시각 상태 갱신의 배열 생성은 줄였지만 음표의 순서·시각·강약·동시 발음 제한을 변경하지 않았어. 이 구조가 주 스레드의 무한 정체까지 막아 주는 것은 아니므로 장시간 실제 출력은 별도 실기기 검증 범위야.

## 파일별 확인과 판단

| 영역 | 조사한 파일 | 확인한 구조와 이번 판단 |
| --- | --- | --- |
| 렌더와 설정 | `public/js/main.js`, `quality.js` | 중계와 본 화면의 그림자 중복, Lite 행렬 동기화 순서, 후처리 재생성, 숨긴 탭, dt 제한과 자동 품질을 수정했어. 실제 프리셋과 scale을 기록해 고정 품질과 자동 조절을 분리해. |
| 재질과 텍스처 | `scene/materials.js` | 절차적 canvas 텍스처와 `once` 캐시, full/Lite 재질 경로를 확인했어. 기존 텍스처 해상도·색·roughness·normal/UV 경계는 줄이지 않았어. |
| 연주자·악기 | `scene/orchestra.js`, `characters.js`, `instruments.js`, `merge.js` | 음악 상태를 읽는 활·팔·손·지휘·표정 갱신과 Lite 팔 인스턴스 동기화를 확인했어. 포즈 함수를 간략화하지 않고 병합 인덱스 보존과 중계 전 동기화 순서만 바꿨어. |
| 관객 | `scene/audience.js` | 기존 인스턴싱, 거리 LOD와 full/Lite cap을 유지했어. 이미 있는 인덱스를 펼치지 않아 같은 삼각형·색·배치의 버퍼 저장량을 줄였어. |
| 무대 중계 | `scene/screen.js` | 촬영 주기, 별도 카메라와 render target, canvas 자막, Sphere live 연동을 조사했어. 촬영하지 않는 프레임의 계산·같은 자막 redraw를 줄이고 첫 촬영과 재활성화를 즉시 처리해. |
| 홀 본체와 로비 | `scene/hall.js`, `foyer.js`, `hallplan.js` | 층·발코니·샹들리에·로비·계단과 공유 geometry 병합을 확인했어. a41의 이동 공간·기둥·커튼·계단 마감 변경을 그대로 보존해. |
| 홀 좌석 | `scene/seats.js`, `instance-batches.js` | 종류 전체를 한 번에 제출하던 큰 bound를 공간별로 나눴어. 넓은 시점에서는 모든 fine part가 보이는 종류만 coarse로 합쳐. 방문자/중계 카메라별로 선택하며 원래 좌석 순서·ID를 유지해. |
| 이동과 무대 입퇴장 | `scene/director.js`, `stage.js` | a41의 충돌과 곡별 roster 입퇴장을 보존했어. 두 파일은 a41과 같아. 기능 검사의 준비 단계만 새 roster API에 맞췄고 실제 프로그램 전환은 제품의 경로를 사용해. |
| Sphere 객석·조명 | `scene/sphere.js`, `sphereplan.js` | 약 1만 4천 석의 기존 instancing/LOD와 동선을 유지했어. 프레임마다 만들던 임시 Vector3/Color만 재사용해. |
| Sphere 돔 | `scene/domeshow.js` | 기존 shader 장면·live·세계 전환·reveal을 유지해. opaque 구조물 뒤에 돔을 그려 덮이는 fragment 작업을 줄일 수 있게 했어. live fade 판정은 shader가 실제로 사용하는 구간과 맞췄어. |
| Sphere 3D 세계 | `scene/dome3d.js` | 이미 있던 면 선택·바닥 면 생략·crossfade 교대 갱신을 유지해. 프록시 geometry, render target resize와 invalidation, 예외 시 상태 복원을 수정했어. a41의 새 FOREST/KELP 셰이더 계산은 변경하지 않았어. |
| 공간 음향·샘플 | `audio/engine.js` | 정지한 listener의 반복 AudioParam 예약을 줄였어. 샘플 로딩·선택·압축·필터·잔향·음표 생성 메서드는 유지했어. |
| 악보와 시각 상태 | `audio/performance.js` | 음악 JSON 읽기·이벤트 정렬·오디오 예약·탐색과 시각 상태 경로를 확인했어. 프레임별 filter/map 배열을 제자리 압축으로 바꾸고 의자 목록을 reset 때 캐시해. |
| 박수 | `audio/crowd.js`, `crowd-loader.js`, `crowd-worker.js` | 동일 합성 함수를 Worker로 옮기고 profile별 transfer/backpressure를 적용해. 준비 실패·차단 시 원래 합성으로 완성해. 원본 합성 수식과 PCM 형식은 같아. |
| 같이 보기 | `net/room.js`, `server/rooms.js`, `server/ws.js` | 방·권한·시계·좌석·snapshot·명령 경로를 확인했어. 기존 네트워크 프로토콜을 재설계하지 않았고 실제 프로토콜/두 탭 UI 검증을 따로 남겨. |
| 정적 로딩 | `server.js`, `public/music/`, `public/samples/` | 기존 gzip 캐시, ETag/304, MP3/vendor의 HTTP cache, HEAD/range를 확인했어. MP3와 악보를 낮은 품질로 변환하거나 새 서버 성능을 클라이언트 개선으로 계산하지 않았어. |

## 적용하지 않은 선택

- 기존 인스턴싱·LOD·큐브 면 선택을 새 최적화인 것처럼 다시 작성하지 않았어. 수정은 중복 제출·저장·갱신에 집중했어.
- 샹들리에·악기·동물 모델의 형태와 재질을 줄이거나 음표·샘플을 생략하는 변경은 적용하지 않았어.
- ec5의 FOREST·PEAKS·reveal 셰이더 후보는 44개 case로 확인했지만 채택하지 않았어. 후보·원시 출력과 미채택 이유는 [별도 실험 기록](shader-experiments.md)에 있어. 이 이력은 a41의 셰이더 성능 결과가 아니야.
- 고성능 모바일에서 full 모델/3D 세계로 자동 재구축하는 기능은 추가하지 않았어. 입장 때 결정되는 Lite 구조는 유지하고, 그 안에서 해상도·후처리 회복을 허용했어.
- 오디오 샘플의 공연 중 lazy loading은 도입하지 않았어. 음이 시작될 때 다운로드·decode를 기다리게 하는 위험보다 준비 완료 후 입장하는 기존 보장이 더 중요하다고 판단했어.

## 근거를 연결해서 읽기

소스 구조는 위 파일과 [a41 통합 검토 기록](validation-log.md)에서 확인할 수 있어. 최신 e741의 같은 품질 시간·draw call·triangle·heap은 [실제 측정 결과](performance-e741.md), 당시 PCM·예약·로딩·방 기능의 범위는 [런타임 검증](runtime-validation.md)을 봐 줘. 구조상 줄어든 연산과 특정 기기에서 관찰한 FPS는 서로 다른 근거야.
