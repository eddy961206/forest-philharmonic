# 레퍼토리 실시간 성능 검증

이후의 팔 렌더링·모바일 색상 전송 최적화는 [화질 유지 최적화 보고서](quality-preserving-optimization.md)에 별도로 기록했어. 아래 수치를 이후 후보의 수치로 재사용하지 않아.

검증 담당은 사용자 요청으로 지정한 **GPT-6.1 Sol**이야. 부모 에이전트가 피날레 조명 수정과 Node 회귀 테스트를 맡았고, GPT-6.1 Sol이 수정 전후 실제 브라우저 성능을 측정했어.

기존 구현에서 **엘가 404.06초 전곡 연주는 완료**했어. 연주 중 늦은 음표 예약·브라우저 오디오 누락은 관측되지 않았어. 다만 곡이 끝난 뒤 **약 2.1초 화면 정지**를 찾았어. 조명 수를 일정하게 유지하는 수정 후보에서 종료 구간을 다시 검사했고, 해당 셰이더 증가와 큰 멈춤은 재현되지 않았어. 수정 후보의 검사 범위는 짧은 종료 재현과 40초 연주야. 후보가 다시 7분 전곡을 완주했다고 해석하면 안 돼.

스피어의 발퀴레 합주에는 114.9ms 화면 간격이 한 번 있었어. 이때 오디오 처리 예산 사용률의 관측 최댓값은 약 80%였어. 모든 공연장·카메라·곡에서 항상 60FPS라고 판정하지 않아.

## 코드와 환경

| 구분 | 확인한 조건 |
|---|---|
| 전곡·기본 합주·정리·메모리·원인 조사 | `ee39085fd25a3d2f3c5e967d3ae0e20ef303760a` |
| 조명 수정 후보 | `0bdf222cf1f10aa49efcdda899389bc04e0f1bee` |
| PR | [#20](https://github.com/eddy961206/forest-philharmonic/pull/20), `feat/orchestral-repertoire` |
| 장비 | Apple M4 Mac mini, RAM 32GiB |
| OS | macOS 26.5.1 (25F80), Darwin 25.5.0 arm64 |
| 브라우저·자동화 | 실제 창을 띄운 Chrome 156.0.8078.47, Puppeteer Core 24.37.5, 전용 CDP 9224 |
| GPU | ANGLE Metal Renderer: Apple M4. SwiftShader가 아니야 |
| viewport·DPR | 1200×1189 CSS px, DPR 1 |
| 서버 | `http://127.0.0.1:8096/` |
| 기본 설정 | 자동 화질, 홀 관객 45%, 스피어 25%, FX·조명·음표·중계·잔향 켬, fixedEar 켬 |

사용자가 이전 검증 창을 닫으라고 요청한 뒤, 부모 에이전트가 검증용 Chrome 9222·9223을 종료하고 프로세스와 포트가 사라진 것을 확인했어. 유효 측정은 그 뒤 전용 9224에서 수행했어. 다른 사용자 앱은 종료하지 않았어. 시스템 전체의 백그라운드 부하·온도·전원 상태를 통제한 실험은 아니야.

Browser 플러그인은 이 세션에 없었어. 사용자 규칙에 따라 `cdp-direct launch/new/click/eval`로 준비했고, 장시간 구조화 수집은 같은 CDP 브라우저에 Puppeteer로 연결했어.

## 연주 화면과 측정 방법

혼자 보기 → 편하게 보기 → 곡 선택으로 실제 공연을 시작했어. 지휘자·악기·단원들이 보이는 화면을 직접 확인했어. 카메라는 `[0,16.42,5.9]`, 시선 목표 `[0,2,-9]`, 목표 FOV 52도로 고정했어. `cinema`의 shot hold만 무한으로 설정했어. 단원·악기·음표 애니메이션, 조명, 렌더링, 오디오 스케줄러와 transport는 그대로 실행했어. 곡 종료 후 박수 단계에서는 앱의 원래 카메라 전환이 다시 실행됐어.

[전곡 시작 화면](evidence/repertoire/performance/hall-elgar-concert-full-start.png)과 [종료 후 화면](evidence/repertoire/performance/hall-elgar-concert-full-end.png)을 저장했어. 시작 캡처는 계측 직전에, 종료 캡처는 계측 직후에 찍었어. 매초 카메라 좌표·phase·visibility도 남겼어. 유효 전곡의 모든 playing 표본은 같은 무대 좌표와 `visible` 상태야.

- rAF는 `requestAnimationFrame` 콜백 사이 시간이야. 실제 디스플레이 표시 FPS나 순수 GPU 시간이 아니야. 첫 간격은 버리고 나머지 분포를 계산했어.
- `engine.playNote`의 요청 시각과 AudioContext 시각 차이를 전부 기록했어. 100ms 이상 늦으면 엔진의 음표 생략·지속음 복구 경로에 들어갈 수 있어.
- 매초 활성 음성 수·리소스 개수·transport·오디오 상태·`performance.memory.usedJSHeapSize`를 기록했어. 음성 최댓값은 1초 표본의 최댓값이야.
- CDP `WebAudio.getRealtimeData`를 5초마다 읽었어. `renderCapacity`는 오디오 콜백 처리 시간/콜백 예산이야. 1 이상이면 예산 소진 징후야. 희소 표본의 최댓값이므로 순간 최대 부하를 모두 잡지는 못해.
- `AudioContext.playbackStats`의 underrun events/duration 시작·끝 차이도 기록했어. 이는 브라우저 내부 누락 카운터야. 실제 스피커 녹음이나 사람의 청취를 대신하지 않아.
- CDP TaskDuration과 전용 Chrome 프로세스의 누적 CPU 시간 차이를 수집했어. CPU 100%는 CPU 코어 하나야. GPU 프로세스의 CPU 사용률은 GPU 하드웨어 사용률이 아니야. RSS 합계는 공유 페이지를 중복해서 셀 수 있어.
- `performance.memory.usedJSHeapSize`와 CDP `JSHeapUsedSize`는 서로 다른 관측값으로 보고해. 큰 차이의 원인을 하나로 단정하지 않아.

사용자가 정한 FPS·메모리 한도는 없었어. 프레임 수치는 기술 통계로 보고하고, 50/100ms 초과·늦은 예약·underrun·정리 후 잔여 음성을 따로 확인했어. 이번 관측 표본은 서로 독립적인 반복 실험이 아니야.

## 엘가 전곡 결과 — 기존 구현

415초 관측 중 실제 악보는 404.06초야. 재생 시작부터 자연 종료까지 중간 탐색·일시정지를 하지 않았어. 매초 playing 표본은 404개였어. 실제 악보 구간은 transport의 시작 지연과 출력 latency를 포함한 관측 시각 경계로 집계했어. 정확한 계산은 [요약 스크립트](../tools/qa/summarize-realtime-performance.py)에 있어.

| 지표 | 실제 악보 연주 구간 | 종료 단계 포함 전체 관측 |
|---|---:|---:|
| rAF 간격 수 | 24,160 | 24,677 |
| 평균 | 16.73ms | 16.85ms |
| p50 / p95 / p99 | 16.7 / 17.4 / 18.6ms | 16.7 / 17.4 / 18.6ms |
| 최대 | 65.8ms | **2,084.9ms** |
| 50ms / 100ms 초과 | 2 / 0회 | 6 / 3회 |

연주 중 자동 화질은 high, renderScale은 0.8–0.9였어. 고정 high·원래 해상도 성능으로 해석하면 안 돼. 늦은 예약 100ms 초과 0회, 오디오 상태 변경 0회, 브라우저 underrun events/duration 증가 0이었어. 83개 오디오 표본의 renderCapacity 평균은 0.139, 최대는 0.363이었어. 48kHz·1024프레임 콜백의 평균 간격은 약 21.333ms였어. 활성 음성 표본 최댓값은 172개야.

`performance.memory.usedJSHeapSize`는 약 557.60–590.73MB였어. CDP `JSHeapUsedSize` 평균은 39.03MB, 최종 표본은 65.93MB였어. 두 값을 같은 의미의 JS heap으로 합치지 않아. Three.js geometry/texture 수는 시작 1,833/116 → 종료 단계 끝 1,981/116이었어. 이 개수 변화만으로 누수라고 판정하지 않았어.

전용 Chrome 프로세스 RSS 합계 평균은 3,474MiB, 최대는 3,544MiB였어. 활성 renderer CPU는 약 53.1%, GPU 프로세스 CPU는 약 40.9%였어. 이 값은 브라우저 프로세스 묶음과 해당 관측 시간에만 적용돼.

## 최대 합주 후보와 기존 곡 참고값 — 기존 구현

악보의 밀도·지속음 겹침이 높은 시점을 포함하도록 구간을 골랐어. 실제 곡 선택·탐색 후 약 5초 준비하고 각각 40초 관측했어. 곡 끝이나 박수 단계가 섞이지 않았어. 기존 곡은 같은 후보에서 실행한 참고값이야. 같은 악보의 수정 전후 비교가 아니므로 회귀율이나 개선율을 계산하지 않아.

| 구간 | 실제 악보 시각(s) | p50/p95/p99(ms) | 최대(ms) | >50/>100ms | 활성 음성 표본 최대 | 오디오 capacity 최대 |
|---|---:|---:|---:|---:|---:|---:|
| 홀 · 기존 환희의 송가 | 25.53–65.53 | 16.7/17.6/33.4 | 66.7 | 4/0 | 60 | 0.203 |
| 홀 · 신세계 4악장 | 653.31–693.31 | 16.7/18.2/33.4 | 50.0 | 0/0 | 240 | 0.316 |
| 홀 · 차이콥스키 협주곡 | 722.29–762.29 | 16.7/17.8/18.7 | 18.8 | 0/0 | 299 | 0.252 |
| 스피어 · 기존 바흐 코랄 | 20.15–60.15 | 16.7/18.6/33.4 | 35.3 | 0/0 | 39 | 0.168 |
| 스피어 · 1812 서곡 | 687.57–727.57 | 16.7/33.3/33.6 | 35.3 | 0/0 | 305 | 0.495 |
| 스피어 · 발퀴레 | 282.69–322.67 | 16.7/17.9/18.7 | 114.9 | 1/1 | 412 | 0.799 |
| 스피어 · 사브르의 춤 | 105.51–145.51 | 16.7/17.7/18.6 | 18.7 | 0/0 | 144 | 0.258 |

모든 구간에서 100ms 이상 늦은 예약과 underrun 증가는 0이었어. 발퀴레의 114.9ms 단발성 프레임 지연과 capacity 0.799는 남은 여유가 다른 곡보다 작다는 관측이야. 원인은 분리하지 못했어. 1812는 p95가 33.3ms여서 항상 60Hz라고 볼 수 없어. 각 구간의 화질·renderScale은 [summary.json](evidence/repertoire/performance/summary.json)에 있어.

탐색할 때 엔진은 이미 시작된 피아노 같은 타격음을 다시 치지 않아. 따라서 협주곡의 정적 악보상 동시음 수와 실측 음성 수를 동일시하지 않아. 이 검사는 82곡 전체의 전역 최대 부하를 보증하지 않아.

## 반복 조작 후 정리

각 공연장에서 서로 다른 두 곡을 준비한 뒤, 곡 선택 → 탐색 → 일시정지 → 재개 → 일시정지를 12회 반복했어. 계측기를 제거하고 GC를 요청했어. 마지막에는 같은 곡·비슷한 재생 시각에서 30초 동안 추가로 관측했어.

| 공연장 | GC 후 performance.memory counter 시작→30초 정리 후 | geometry/texture 시작→끝 | 정지 상태의 남은 음성 |
|---|---:|---:|---:|
| 홀 | 556.419→556.879MB | 1,895/116→1,895/116 | 모든 표본 0 |
| 스피어 | 1,130.162→1,130.725MB | 1,849/87→1,850/87 | 모든 표본 0 |

작은 비단조 변화가 있었지만 이 반복 조작에서 선형으로 증가하는 음성·리소스 누수 증거는 없었어. 12회 반복과 30초 정리가 장시간 누수 부재의 증명은 아니야. 스피어의 큰 counter에는 앞서 방문한 문서 보존이 포함돼 있었어.

## 공연장 이동과 메모리 집계

큰 counter를 분리하려고 새 전용 Sphere 탭을 열고 이전 검증 탭을 닫았어. 이후 같은 탭에서 Hall→Sphere로 이동했어. 각 상태에서 일시정지·GC 후 값을 비교했어.

| 상태 | performance.memory.usedJSHeapSize | CDP JSHeapUsedSize | Documents / V8PerContextDatas |
|---|---:|---:|---:|
| 새 탭 Sphere | 576.72MB | 47.20MB | 1 / 2 |
| Hall로 이동 | 1,128.29MB | 72.75MB | 2 / 4 |
| Sphere로 다시 이동 | 1,700.91MB | 118.08MB | 3 / 6 |

각 현재 문서의 샘플 bank는 동일하게 695개 AudioBuffer, PCM 479,016,956바이트였어. PCM 바이트는 길이×채널 수×4로 계산했어. 기타 버퍼·노드·GPU·네이티브 오버헤드는 포함하지 않아.

브라우저 뒤로 가기에서 CDP `Page.frameNavigated.type=BackForwardCacheRestore`가 실제로 발생했고, 이전 Hall의 곡·일시정지 상태가 복원됐어. 이전 문서가 브라우저 뒤로/앞으로 캐시에 보존되는 것을 직접 확인한 근거야. 따라서 현재 스피어 장면만 홀의 두 배 메모리를 쓴다고 결론 내리면 안 돼. 이동 이력에 따라 이 counter들이 증가하는 현상은 확인했어. 캐시 퇴출 시점·메모리가 적은 기기의 영향·오래 이동했을 때 상한은 확인하지 않았어. 무한 누수라고 단정하지 않아.

[이동 원시 결과](evidence/repertoire/performance/navigation-memory.json), [BFCache 복원 이벤트](evidence/repertoire/performance/navigation-back-cache.json)를 남겼어.

## 발견한 종료 지연과 수정 후보

기존 전곡의 관측 시각 407,157.9ms에 2,087ms LongTask가 발생했어. 악보가 끝난 `applause` 단계였어. rAF 2,084.9ms와 뒤이은 617.2ms 간격을 원시 결과에 보존했어. 이 종료 흐름은 성능 문제로 판단했어.

새 Hall 문서에서 엘가 399초부터 약 20초를 재현했어. 첫 불꽃의 PointLight가 보이면서 조명 수 6→7, shader programs 73→88→89가 함께 증가했어. 같은 시점에 150ms LongTask/rAF 150.2ms가 나왔어. CPU profile에는 getProgram/acquireProgram/WebGLProgram/getProgramInfoLog 호출이 있었어. 같은 페이지에서 반복하면 program 수가 89로 유지됐고 LongTask는 0, 최대 rAF는 34.2ms였어. 원래 2.1초 크기는 이미 따뜻해진 브라우저/GPU 캐시 조건에서 그대로 재현되지 않았어.

부모 에이전트가 `0bdf222`에서 flash PointLight를 항상 visible로 두고 밝기만 0↔120으로 바꾸도록 수정했어. 수정 후보에서 새 문서와 동일 페이지 반복을 다시 관측했어.

| 약 20초 종료 재현 | 수정 전 새 문서 | 수정 전 반복 | 수정 후보 새 문서 | 수정 후보 반복 |
|---|---:|---:|---:|---:|
| 최대 rAF 간격 | 150.2ms | 34.2ms | 66.7ms | 33.7ms |
| 첫 flash의 조명 수 | 6→7 | 6↔7 | 7 고정 | 7 고정 |
| programs | 71→89 | 89 고정 | 96→98 | 98 고정 |
| LongTask | 최대 150ms | 0 | 53·55ms 각 1회 | 0 |

수정 후보의 2개 신규 program은 일반 FX 첫 사용 단계에 생겼고, 첫 flash의 대규모 조명 variant 증가는 없어졌어. 밝기는 표본에서 0→112.03→0으로 변했고 visible은 계속 true였어. 80ms 간격 표본이므로 120의 순간 최댓값을 반드시 잡는 것은 아니야. 이 결과는 조명 수 변경에 따른 첫 shader 준비가 종료 지연의 원인이라는 판단을 지지해.

수정 후보의 전곡 7분 재검증·초기 로딩 시간 전후 비교는 하지 않았어. 시작할 때 조명을 한 개 더 등록하는 비용도 고려해야 해. 아래 후보 40초 연주 검증은 별도 범위야.

수정 후보에서 엘가 약 285–325초의 합주를 40초 추가로 관측했어. high 자동 화질·renderScale 0.9였고 rAF 2,401개, 평균 16.68ms, p50/p95/p99 16.7/17.4/18.5ms, 최대 18.8ms였어. 50/100ms 초과는 모두 0, 100ms 이상 늦은 음표 예약과 underrun 증가도 0이었어. 활성 음성 표본 최대 158개, 오디오 capacity 최대 0.259였어. 이 조건에서 지속 연주 성능 악화 징후는 관측되지 않았어. 독립 반복 비교나 모든 장면의 무회귀 보장은 아니야.

[수정 후보 원시 결과](evidence/repertoire/performance/hall-fixed-flash-dense.json), [시작 화면](evidence/repertoire/performance/hall-fixed-flash-dense-start.png), [종료 화면](evidence/repertoire/performance/hall-fixed-flash-dense-end.png)을 남겼어. 계측 종료 후 별도로 공개 debug hook `triggerFinaleFx()`로 시각 효과를 실행했어. [밝기 펄스 화면](evidence/repertoire/performance/candidate-fireworks-flash.png)을 직접 봤고, 무대 조명·종이 꽃가루의 시각 효과가 보이는 것을 확인했어. 같은 flash의 밝기는 캡처 직전 111.94→캡처 후 0, visible=true로 기록됐어. 이 수동 시각 검사는 자연스러운 엘가 종료 계측과 별도야.

부모 에이전트는 수정 후보에서 정규 `npm test` 215/215 통과를 확인했어. 처음 전용 Three loader 없이 fx 테스트 파일을 직접 실행한 명령은 `ERR_MODULE_NOT_FOUND`였고, 정규 저장소 테스트 명령으로 다시 실행해 통과했어. 이 테스트 기록은 부모 에이전트의 확인 결과이고, 여기의 실시간 수치와 구분해.

## 제외한 준비 시도

첫 시도는 홀 로비/walk 시점이었어. 사용자가 지적한 뒤 약 335초에서 중단하고 [lobby-limited 원시 기록](evidence/repertoire/performance/hall-elgar-lobby-limited.json)과 화면을 보존했어. 전곡 완료나 연주 화면 성능의 근거로 쓰지 않았어. 중단된 별도 오디오 observer는 마지막 progress만 남았고, 완전한 버퍼 시계열은 저장되지 않았어.

`hall-elgar-inherited-warmup-aborted*`는 이전 renderScale을 상속한 짧은 준비 시도야. `hall-elgar-cinema-aborted*`는 자동 컷이 관객석을 비추는 것을 확인하고 중단한 시도야. 두 로그도 최종 성능 판정에서 제외했어. 준비 조건이 수정된 이력을 지우지 않았어.

## 재현 순서와 증거

증거는 [performance 폴더](evidence/repertoire/performance/)에 있어. [summary.json](evidence/repertoire/performance/summary.json)은 프레임·오디오·CPU·리소스 요약이고, `.json`은 원시 시계열, `-start/-end.png`는 측정 밖에서 찍은 화면이야. `finale-*.cpuprofile`은 Chrome DevTools Performance에서 열 수 있어. 계측 스크립트의 로컬 절대경로만 저장소 상대경로로 정규화했고, 앱 호출 스택·샘플·시간 값은 유지했어. [manifest.json](evidence/repertoire/performance/manifest.json)에 기존/수정 후보의 출처와 증거 해시를 구분해.

아래 명령은 저장소 폴더에서 실행해. 기존 `cdp-direct`, Node, Puppeteer Core가 설치된 환경이 필요해. `PUPPETEER_PATH`를 지정하거나 로컬/전역 npm의 `puppeteer-core`를 사용해. 서버가 이미 8096에서 실행 중이면 중복으로 띄우지 마.

```sh
HOST=127.0.0.1 PORT=8096 npm start
# 별도 터미널에서 이어서 실행
cdp-direct launch --port 9224 --profile ../performance-chrome
cdp-direct new 'http://127.0.0.1:8096/?venue=hall&lobby' --port 9224
node tools/qa/prepare-concert-camera.mjs replay-preflight
node tools/qa/realtime-performance.mjs reset-elgar replay-elgar-full 415
node tools/qa/realtime-performance-suite.mjs hall
node tools/qa/realtime-performance-suite.mjs sphere
```

`prepare-concert-camera.mjs`는 입장 가능 상태를 기다린 뒤 실제 UI의 혼자 보기·편하게 보기·엘가 선택을 실행해. 0초에서 일시정지하고 위 고정 무대 시점을 설정해. 생성된 `replay-preflight.png`에서 지휘자·단원·무대가 보이는 것을 먼저 확인해야 해. 그다음 full observer를 실행하면 0초부터 실제 시간으로 연주해. suite는 공연장별로 다시 입장하고 같은 무대 시점을 설정해. 다시 실행하면 같은 이름의 결과 파일이 바뀌므로 새 증거를 보존하려면 별도 출력 폴더나 사본을 준비해.

종료 재현은 새 Hall 문서를 먼저 준비한 뒤 실행해. 같은 문서의 두 번째 재생은 이미 준비된 셰이더 조건이라는 점을 구분해야 해.

```sh
cdp-direct navigate 'http://127.0.0.1:8096/?venue=hall&lobby' --port 9224
node tools/qa/prepare-concert-camera.mjs finale-replay-preflight
node tools/qa/profile-finale-transition.mjs finale-replay
python3 tools/qa/summarize-realtime-performance.py
```

`navigation-memory.mjs`는 전용 8096 QA 탭을 새로 만들고 이전 8096 QA 탭을 닫아. 다른 용도의 8096 탭이 없는 전용 브라우저에서만 실행해. 새 Sphere→Hall→Sphere를 차례로 관측해. 이 스크립트와 종료 재현은 합주 수집과 동시에 실행하지 않았어.

## 아직 확인하지 않은 범위

- 실제 iPhone/iPad, Safari, 모바일 발열·배터리·메모리 압박과 캐시 퇴출.
- 실제 스피커 출력 녹음·사람의 청취·물리적 AV 동기화. 내부 카운터 0을 실제 출력 글리치 0이라고 단정하지 않아.
- 자유 이동·돔 전체를 보는 넓은 시야·모든 자동 카메라 컷·고정 native high/low 전체 비교.
- 82곡 전부의 전곡 연주, 수시간 연속 감상, 메모리 누수가 없다는 장기 보장.
- 수정 후보의 전곡 재완주·초기 준비 시간 변화. 기존 SwiftShader 4프레임 결과는 이번 실기기 결과로 재사용하지 않았어.

기능·빌드·정적 테스트 통과와 실제 성능 확인은 구분했어. main 병합·배포는 수행하지 않았어.
