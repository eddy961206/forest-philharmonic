# cabfe78 시점의 병합 전 수정·검증 기록

이 문서는 `cabfe78d4ef04112372479c98d67a45e552c9b77`까지의 검증 기록이야. **그 뒤 직접 검증·반영한 오디오 준비 최적화와 최신 검사 결과는 [추가 검증 기록](AUDIO_PREPARATION_FOLLOWUP.md)에 있어.** 아래의 15개 테스트 파일·소스 해시·미검증 후보 상태는 이 과거 시점에 해당하며 최신 후보 결과로 대체해서 읽지 않아. 실행할 작업은 [로컬 AI 지시](LOCAL_AGENT_HANDOFF.md)를 따라.

대상은 `perf/261021-venue-rendering`이야. **코드·회귀 테스트·로컬 비교 도구를 정리했지만, 실제 PC에서 화면·음악과 성능 이득을 확인하는 단계는 남아 있어.** main 병합은 로컬 AI가 [인계 절차](LOCAL_AGENT_HANDOFF.md)에 따라 판단해.

이번 변경 전 브랜치는 `ed3a5db17a53cd84b75e33a25352831f148f9431`, 비교 기준 main은 `e741811d1d7a040afcdd3a8230465980c64f82fc`야. 과거 e741→6c 성능 숫자는 [역사 보고서](performance-e741.md)에 분리했어. 현재 후보의 실측으로 재사용하지 않아.

## 고친 문제

### 테스트 검색 범위

이전 `npm test`는 저장소 전체에서 `.test.mjs`를 자동 발견했어. 그 결과 `docs/`에 보존한 과거 테스트 4개가 현재 코드에 없는 import를 실행했어. [tools/test.mjs](../tools/test.mjs)는 유지하는 `tests/` 안의 파일만 재귀적으로 열거하고 Node에 명시적으로 전달해. Windows 셸의 glob 확장에 의존하지 않아. 과거 자료를 복원해도 제품 테스트 집합에 섞이지 않아.

[CI 설정](../.github/workflows/ci.yml)은 Ubuntu Node 18/22, Windows Node 22에서 `npm test`와 Python 판정 도구 테스트를 실행해. 실제 실행 결과는 PR의 해당 커밋 checks에서 확인해. CI 통과를 실제 GPU 성능 검증으로 해석하지 않아.

### 자동 화질을 내릴 때 픽셀 수가 증가하던 경계

[quality.js](../public/js/quality.js)의 공통 scale 바닥 `0.6`은 medium보다 low의 기본 pixelRatio가 큰 설정과 충돌했어. 예를 들어 기기 DPR이 1.25 이상이면 medium의 실제 DPR `1.0625 × 0.6 = 0.6375`에서 low의 `1.25 × 0.6 = 0.75`로 올라가, 픽셀 면적이 약 38.4% 증가했어.

이제 프리셋별 바닥을 계산해서 low에서는 scale `0.51`로 같은 실제 DPR `0.6375`를 유지해. high/medium의 기존 바닥과 수동 프리셋은 유지해. 프리셋 변경 때 반올림으로 픽셀이 늘어나는 경로도 막았어. 회복할 프리셋의 최소 해상도가 현재보다 높아지는 특수 설정에서는 그 회복 시도를 보류해.

[quality.test.mjs](../tests/quality.test.mjs)는 실제 프리셋 비율과 여러 소수 DPR, low→medium 회복 후 재하강, 바닥에서 반복 resize 방지, 수동 reset과 Lite 상한을 검사해. 이 경계는 low까지 허용하는 Lite 경로에서 중요하고, full 경로의 medium 하한은 그대로야.

## 검증해서 반영한 추가 최적화

### 정지 카메라의 돔 가시성 계산 재사용

[domeshow.js](../public/js/scene/domeshow.js)는 같은 카메라에서도 매번 99개 ray로 필요한 cube face를 계산했어. 카메라의 world 행렬·역투영 행렬·돔 반경·절단면이 정확히 같을 때만 mask를 재사용하도록 바꿨어. 카메라별 WeakMap으로 보관하고 이동·회전·FOV·aspect·view offset·부모 rig 변화는 다시 계산해.

세계 애니메이션과 cube 텍스처 렌더 요청은 기존 주기로 계속해. [회귀 테스트](../tests/dome-integration.test.mjs)는 시야별 mask 보존, 여러 카메라, 정지한 30프레임의 추가 ray 계산 0회와 음악 시각 갱신을 확인해.

[CPU 벤치 도구](../tools/bench/dome-visibility.mjs)로 이전 커밋과 현재 소스를 각각 import해서 360개 시야의 mask가 같은지 먼저 확인했어. Node 24.19 / Linux x64, mock renderer, 20,000회 호출 × 5쌍, 실행 순서를 번갈아 바꾼 결과야.

| workload | 이전 batch median | 이후 batch median |
|---|---:|---:|
| 정지 카메라 | 125.857 ms | 8.102 ms |
| 계속 회전하는 카메라 | 121.490 ms | 120.321 ms |

정지 시 절감은 호출당 약 **0.0059 ms**야. 작은 JS 작업의 감소이며 앱 전체 FPS나 GPU 성능 개선율이 아니야. 회전은 일부 pair가 더 느렸고, median 차이만으로 개선이라고 판단하지 않아. 모든 pair와 소스 해시는 [이번 검증 기록](merge-preparation-validation.json)에 있어.

저장소 루트에서 재현해. 출력 JSON은 새 파일명을 사용해.

```sh
git worktree add --detach ../forest-before-merge-prep ed3a5db17a53cd84b75e33a25352831f148f9431
node --experimental-loader ./tests/helpers/three-loader.mjs tools/bench/dome-visibility.mjs --baseline ../forest-before-merge-prep --out ../forest-dome-cpu-check.json
```

### Sphere 좌석의 중복 instance 배열 공유

[sphere.js](../public/js/scene/sphere.js)의 near/far/picking 표현은 생성 이후 동일한 transform을 유지해. 세 표현이 하나의 행렬 attribute를, near/far는 하나의 색 attribute를 공유하도록 바꿨어. mesh별 count와 bounds는 별도로 유지해.

| 고정 객석 13,845개 / 30 section | 이전 | 이후 | 절감 |
|---|---:|---:|---:|
| transform·색의 retained typed-array backing bytes | 2,990,520 B | 1,052,220 B | **1,938,300 B** |

별도로 추가하는 recital 좌석 6개는 이 집계 대상이 아니야. 전체 앱 heap·peak allocation·GPU VRAM을 측정한 수치도 아니야. [좌석 테스트](../tests/sphere-seats.test.mjs)는 모든 고정 객석 위치·방향·전역 ID, 공유 배열의 실제 byteLength, full/Lite LOD 전후 picking ID·거리, 정적 attribute version과 독립 bounds를 검사해.

## 이번 실행 결과와 범위

| 검사 | 결과 | 범위 |
|---|---|---|
| `npm test` | 15개 파일 PASS, 실패 0 | 유지하는 제품·도구 회귀 파일. 파일 수를 개별 case 수로 부르지 않아 |
| `python -m unittest discover -s tools/bench/tests -p 'test_*.py'` | 5개 case PASS | 실제 임시 Git worktree·ABBA 계획, 덮어쓰기 거부, 정상·회귀·잘못된 증거 판정 |
| 실제 저장소의 계획 생성 | PASS | 고정 e741과 후보 제품 snapshot으로 16개 job 생성. 실제 GPU job 실행은 하지 않았어 |
| 전체 소스 계약 통합 검사 | 양쪽 PASS | 제품 합집합 509경로, public HTTP 505경로, 수집기 31개를 전후 대조. baseline에 없는 5경로는 404 확인 |
| Sphere desktop 기능 | PASS | 640×360 / DPR 1, 17개 완료 렌더 프레임 |
| Hall mobile 에뮬레이션 기능 | PASS | 390×844 / DPR 2, 14개 완료 렌더 프레임 |
| 새 cadence 수집기 smoke | PASS | Sphere low, 준비 2 / 측정 4. 실행 경로 확인용이며 성능 판단에서 제외 |
| 실제 GPU 필수 gate의 음성 검사 | 의도한 FAIL / exit 1 | SwiftShader를 실제 GPU 자료로 받아들이지 않는 걸 확인 |

브라우저 검사는 Playwright 1.62.1 / Chromium 153.0.8010.0 / Linux / headless SwiftShader / system font 조건이야. 기능 검사 둘 다 failures·unchecked·page/console error·failed request·context loss가 없었어. shader extension 미지원과 검사용 readPixels stall 경고는 남아 있어.

기능 검사는 실제 UI·키보드/터치 입력을 쓰지만 main rAF를 제어하고 좌석 접근·배우 정렬·세계 전환의 일부 대기를 fixture로 단축해. 음악 시계·탐색·재개 상태를 확인했으며 실제 스피커 출력은 청음하지 않았어. 실제 모바일 기기나 정상 rAF의 장시간 감상 결과로 확대하지 않아. 소스 해시는 기능 도구의 12개 경로이며, 별도로 실행한 전체 소스 계약 검사의 범위와 구분해.

정확한 환경·검사 항목·제품 및 도구 해시·CPU 원시 pair는 [검증 JSON](merge-preparation-validation.json)에 남겼어. 이 JSON은 필요한 항목을 추린 기록이고 브라우저의 전체 상태 dump나 화면 캡처 묶음은 아니야.

## 실제 GPU에서 먼저 분리할 변경

기존 Sphere wide/forest의 반복 악화는 아직 원인이 분리되지 않았어. 이번 두 최적화가 그 악화를 해결했다고 판단하지 않아. [인계 절차](LOCAL_AGENT_HANDOFF.md)의 main 대비 비교에서 문제가 있으면 별도 진단 후보를 만들어 아래 네 조건을 비교해. 새 가시성 캐시와 좌석 배열 공유는 네 조건에서 모두 유지해.

| 조건 | `domeshow.js` base mesh renderOrder | `dome3d.js` world proxy |
|---|---:|---|
| 현재 후보 | `10` | `BoxGeometry(2, 2, 2)` |
| 순서만 원복 | `-1` | box |
| proxy만 원복 | `10` | `SphereGeometry(1, 48, 24)` |
| 두 변경 원복 | `-1` | sphere |

crossfade overlay의 renderOrder, shader, cube 해상도, mask, 갱신 주기는 그대로 둬. `wide`는 ARCH라 world proxy만으로 악화를 설명하기 어려워. `forest`는 FOREST3D이므로 proxy까지 분리해 볼 수 있어. wide·forest 뒤에 crossfade·broadcast·회전 시야도 확인해. 같은 화면에서 반복되는 이득과 회귀를 확인한 변경만 남겨.

## 추가 후보: 병목을 확인한 뒤 시도해

| 후보와 위치 | 먼저 측정할 것 | 수정 가설과 채택 조건 |
|---|---|---|
| murmur/noise 준비: [audio/engine.js](../public/js/audio/engine.js)의 `prepareApplause`, `_prepareMurmur`; [crowd.js](../public/js/audio/crowd.js) | `_prepareMurmur()`의 main-thread 시간과 입장 중 long task 기여 | 박수 Worker 전에 동기로 만드는 9초 stereo murmur와 noise 8개도 기존 Worker 경로로 옮겨 볼 수 있어. 같은 seed/full·Lite의 9개 buffer 길이·rate·채널 PCM 해시, 입장 전 준비·탭 숨김 fade·fallback을 보존해. 전체 CPU/PCM 메모리 절감으로 주장하지 않아 |
| 샘플 decode·compact: `audio/engine.js`의 샘플 로더와 `_compact` | cold/warm 각각 fetch·decode·compact 시간, 동시 decode 수, peak heap, 준비 완료 시간 | fetch 6개와 decode 2~4개를 분리하거나 compact를 예산별로 양보하는 방안을 각각 비교해. sample 수·PCM·sample rate·fade 규칙은 유지하고 long task 감소와 로딩 지연을 함께 판단해 |
| 실제 GPU 패스 | cube world·돔·그림자·후처리의 시간 | GPU timer 지원·disjoint 오류를 확인한 뒤 패스별 비용을 기록해. 시간 일부가 삼각형 감소와 비례한다고 가정하지 말고 중복 계산부터 찾아 |
| 자동 품질 회복과 장시간 감상 | 부하 상승→안정화→회복 시 실제 pixelRatio·프레임 간격·청감, 메모리 추이 | 고정 high 비교와 분리해 측정해. 이미 있는 회복 잠금과 Lite/full 정책을 이해한 뒤 수정하고, 지속적인 왕복이나 순간적인 해상도 상승을 다시 만들지 않아 |

위 표는 cabfe78 시점의 후보 목록이야. 이후 murmur/noise와 샘플 compact를 직접 측정한 결과·채택 여부는 [후속 기록](AUDIO_PREPARATION_FOLLOWUP.md)을 읽어. 남은 후보도 구체적인 병목이 없으면 기능 브랜치에 추가하지 말고, 하나씩 수정·커밋한 새 후보를 같은 조건으로 비교해.

## 자료 정리와 최종 병합 조건

과거 자료 1,330개 경로는 현재 트리에서 제외하고 [ed3a5db 보관 안내](PERFORMANCE_ARCHIVE.md)로 연결했어. 실패·악화 기록도 이전 커밋에 그대로 있어. 이력은 다시 쓰지 않았고 기존 전체 clone의 Git 용량을 줄였다고 주장하지 않아.

로컬 AI는 **회귀 검사 통과 + 실제 화면·음악 확인 + 반복되는 성능 이득 또는 검증 가능한 자원 절감**을 함께 보고 판단해. `CLEAR`는 사전에 정한 회귀 보류선을 넘지 않았다는 뜻이야. 차이가 없거나 결과가 애매하면 이득을 주장하지 말고 원인 분리·수정을 이어가. main 병합은 그 판단 뒤에 수행해.
