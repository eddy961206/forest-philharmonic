# 최신 main의 공연장 렌더링 통합 검토

기준 main은 `e741811d1d7a040afcdd3a8230465980c64f82fc`, 가져온 최적화 브랜치는 `8729cdd6e0a78374429aaf27a877d31e9feaa27e`야. 아래 내용은 2026-10-22 통합 때 확인한 코드·Node 검사 결과야. 실제 WebGL 성능과 화면 비교는 해당 버전의 브라우저 측정 결과를 함께 봐야 해.

## 충돌 해결과 보존한 기능

- `sphere.js`: main의 밤 장면 최소 객석 밝기 `GLOW_MIN`과 통로등 `AISLE_MIN`을 유지했어. 자동 병합이 만든 `white` 상수 중복 선언을 제거했어. 기존 최적화의 좌석 생성용 벡터 재사용, 조명용 색·위치 재사용도 유지했어.
- `sphere.js`, `dome3d.js`, `domeshow.js`: main의 Apple GPU 검은 화면 대응을 보존했어. 움직이는 조명의 `pow` 입력 범위, 3D 세계 림 조명의 음수 입력 방지, 돔 해시와 최종 출력 범위 수정이 사라지지 않았어. 이것들은 main의 개선이며 이번 최적화의 새 성과로 세지 않아.
- `screen.js`: 실제 쉬는 시간인 `interval`의 다음 곡 자막과 빈 자막 텍스처 업로드를 유지했어. 최적화의 재활성화 즉시 촬영, 웹폰트 로딩 후 자막 갱신, 렌더 실패 시 상태 복원도 유지했어.
- `dome3d.js`의 박스 ray proxy, `domeshow.js`의 불투명 물체 뒤 돔 렌더 순서, 큐브맵 크기 변경 후 기존 면 무효화는 보존했어. 기존 main의 가시 면 마스크와 두 세계 교대 갱신을 새 최적화라고 주장하지 않아.
- `audience.js`: main의 관객 비율 설정, 같은 좌석의 외형 유지, 방의 예약 좌석과 실제 그리는 인원 분리, 쉬는 시간 대화 애니메이션을 유지했어.

## 관객 geometry 변경을 되돌린 이유

이전 최적화는 관객 부품 생성에서 `mergeVertices`를 제거했어. main은 이미 같은 위치·법선을 가진 정점을 합쳐서 압축하고 있었기 때문에 이 변경은 초기 생성 CPU를 줄이는 대신 GPU에 저장하고 처리할 정점을 늘렸어. 이번 통합에서는 관객 geometry 생성만 main과 동일하게 복원했어. 다른 파일의 geometry 공유·인덱스 보존은 변경하지 않았어.

1,000석의 같은 `planHouse` 결과, 점유율 80%로 실제 생성한 Three 객체를 비교했어. geometry byte는 각 Mesh의 index와 attribute 배열 byteLength 합계이며 GPU VRAM 실측값이 아니야. instanceMatrix·instanceColor는 이 표에 포함하지 않아.

| 조건 | main 정점 → 이전 최적화 | main geometry byte → 이전 최적화 | 삼각형 |
|---|---:|---:|---:|
| full, 800명 표시 | 3,764 → 5,035 | 180,368 → 210,872 | 양쪽 7,312 |
| Lite, 200명 표시 / 전체 800명 | 653 → 1,028 | 29,328 → 38,328 | 양쪽 1,130 |

확장한 삼각형 좌표·법선의 최대 차이는 `1e-15` 미만이고 instanceColor는 같았어. Node 24.19.0에서 새로운 모듈의 첫 관객 생성을 10회씩 교대로 관찰한 중앙값은 main 34.50ms, 이전 최적화 14.59ms였어. 이 값은 초기 객체 생성의 짧은 CPU 관찰이며 렌더링 FPS를 뜻하지 않아. 지속 렌더링과 메모리를 우선해서 main의 압축을 유지하기로 했어.

## 실행한 검사

`tests/helpers/three-loader.mjs`로 저장소에 포함된 Three.js를 그대로 불러왔어. Node 검사에는 실제 WebGL 컨텍스트가 없고 렌더 호출·기하·상태 전이를 확인해.

```sh
node --check public/js/scene/sphere.js
node --check public/js/scene/screen.js
node --check public/js/scene/audience.js
node --check public/js/scene/dome3d.js
node --check public/js/scene/domeshow.js
node --experimental-loader ./tests/helpers/three-loader.mjs tests/audience.test.mjs
node --experimental-loader ./tests/helpers/three-loader.mjs tests/screen.test.mjs
node --experimental-loader ./tests/helpers/three-loader.mjs tests/dome.test.mjs
node --experimental-loader ./tests/helpers/three-loader.mjs tests/dome-integration.test.mjs
```

구문 검사 5개와 audience 2개, screen 11개, dome 7개, dome-integration 4개 case가 통과했어. 새 관객 검사는 비율을 늘렸을 때 기존 관객의 좌석·변환·색·애니메이션 위상이 유지되는지, Lite LOD로 표시 인원을 줄여도 방 예약과 박수 인원이 유지되는지 확인해. `node --test`의 파일 단위 통과 수와 실제 case 수를 혼동하지 않도록 여기서는 각 파일을 직접 실행했어.

## 최신 main 측정에 필요한 수집기 변경

기존 `full-frame-fixture.js`는 예전 `buildAudience(seats, { rand, fill })` 인터페이스를 사용했어. 최신 main은 `planHouse(seats, seeded(417))`로 계획을 만든 뒤 `buildAudience(plan, { share: 0.8 })`로 생성해야 해. 1f 기준의 과거 원본은 수정하지 않고 새 도구와 새 기준 커밋으로만 비교해야 해. 관객 API 변경 때문에 과거 1f 표의 수치를 최신 main의 성능으로 재표기할 수 없어.
