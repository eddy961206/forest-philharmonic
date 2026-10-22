# 추가 오디오 준비 검증과 채택 판단

**추가 후보 두 가지를 직접 검증하고 반영했어.** 관객 웅성거림·생활 소리 합성을 기존 Worker로 옮겨 메인 스레드의 긴 정지를 줄였고, 스테레오 샘플을 모노로 합치는 루프를 줄였어. 오디오 데이터·샘플 집합·샘플레이트·Lite의 잘림과 fade는 유지했어.

이 검증의 기준은 `cabfe78d4ef04112372479c98d67a45e552c9b77`, 제품 변경은 [`a9c0b95`](https://github.com/eddy961206/forest-philharmonic/commit/a9c0b95ee62e65520a167206a606d9309844a6ad)에 있어. 이 문서를 추가한 후속 커밋도 같은 제품 바이트를 사용해. 비교한 실제 HTTP 소스 SHA-256, 모든 반복의 값과 PCM 대조는 [검증 JSON](audio-preparation-validation.json)에 있어. main 대비 렌더 성능 검증과 별개인 **추가 변경의 비교**야. 실제 GPU·정상 앱의 총 입장 시간·스피커 청음 결과로 확대하지 않아.

## PR과 커밋 이력을 맡은 로컬 AI가 시작할 곳

사용자가 별도 프롬프트를 복사해서 전달하지 않아. [PR #1](https://github.com/eddy961206/forest-philharmonic/pull/1)의 첫 안내와 [LOCAL_AGENT_HANDOFF.md](LOCAL_AGENT_HANDOFF.md)가 실행 지시야. 거기에 사용자 위임 범위, 최신 main/후보 고정, 동일 기능 검사, 실제 GPU ABBA 비교, 결과를 PR에 기록하는 방법, **이득이 확인되면 병합하고 그렇지 않으면 수정·재측정하는 조건**을 적었어. 읽기나 추가 제안만으로 작업을 끝내지 않아.

## 1. 관객 소리의 메인 스레드 합성을 Worker로 이전 — 채택

기존 `prepareApplause()`는 Worker를 시작하기 전에 9초짜리 stereo murmur와 cough/creak/rustle 8개를 동기로 만들었어. 이제 기존 module Worker가 그 9개 버퍼를 먼저 만든 다음, 원래 박수 4개 프로필을 순서대로 준비해. 합성식·seed·순서·full/Lite 설정은 그대로야. AudioBuffer 복사와 Web Audio graph 연결은 해당 AudioContext를 소유한 스레드에서 해.

`prepareApplause()`의 공유 promise는 house와 박수뿐 아니라 실제 house graph까지 준비된 뒤 끝나. 정상 boot는 이 promise를 기다리고 입장 UI를 열어. 직접 `applause()`/`setMurmur(양수)`를 호출하는 기존 API의 동기성도 유지하고, 이미 만든 house PCM을 재사용해 중복 AudioBuffer 보관을 막았어. AudioContext 재초기화 때는 이전 house source·tick·visibility listener도 정리해.

### 실제 Chromium의 반복 결과

오디오 모듈만 연 검사 페이지에서 A→B→B→A를 두 블록, 브라우저 실행 8개를 직렬로 수행했어. 각 실행에서 full→Lite를 검사해서 **모드별 기준 4회·후보 4회**야. 실제 module Worker와 OfflineAudioContext의 AudioBuffer를 사용했고, 합성 결과 해시는 시간 측정 뒤 계산했어. 단위는 ms, 표는 중앙값이야.

| 측정 | full 이전 → 이후 | Lite 이전 → 이후 |
|---|---:|---:|
| `prepareApplause()` 호출 반환까지 | 188.15 → **0.95** | 114.20 → **1.05** |
| 준비 중 가장 긴 timer 간격 | 188.70 → **8.05** | 114.60 → **6.90** |
| house 포함 준비 완료까지 | 571.60 → 504.85 | 359.50 → 320.80 |
| 준비 중 long task | 4회 모두 1개 → **모두 0개** | 4회 모두 1개 → **모두 0개** |

호출 반환 시간의 전체 범위는 full **176.9–216.3 → 0.8–1.0ms**, Lite **105.5–140.3 → 0.8–1.9ms**였어. 해당 합성 때문에 UI 스레드가 길게 막히던 경로를 줄였다는 근거로 채택했어.

전체 준비 완료 시간의 범위는 겹쳤고, 후보 Lite 한 번은 392ms로 기준 Lite의 최대 379.8ms보다 길었어. **전체 CPU·총 메모리·앱 입장 시간이 줄었다는 결론은 내리지 않아.** 같은 PCM 계산을 다른 스레드에서 하고 있으며, 보유 PCM도 full 16,960,500B / Lite 11,776,500B로 같아.

### 보존·실패 경로 확인

- 기준/후보를 서로 직접 대조해서 **모드별 10개 검사에서 17개 AudioBuffer·26개 채널의 PCM 해시와 형상이 모두 같았어.** house 9개와 박수 close/wash 8개를 모두 포함해.
- 실제 Chromium에서 full/Lite × 정상 Worker/CSP `worker-src 'none'`의 네 조건을 통과했어. CSP 차단 때의 예상 console 메시지를 제외하고 page/console 오류가 없었어.
- [회귀 테스트](../tests/crowd-preparation.test.mjs)는 실제 별도 Node Worker 실행, 공유 promise, 순차 전송, partial fallback, malformed 결과, timeout, 취소·늦은 응답, 직접 호출 세 시점, graph 준비 오류, 탭 숨김 fade, init cleanup을 확인해.
- CSP/구형 브라우저 fallback은 합성을 동기로 수행하므로 긴 멈춤이 남아. 직접 `setMurmur(양수)`가 house Worker 작업 도중 호출되면 동기 보장을 위해 임시 계산이 겹칠 수 있지만, 추가 AudioBuffer 복사·보관은 하지 않아. 정상 boot의 입장 전 `setMurmur(0)`는 이 경로를 사용하지 않아.

## 2. 실제 스테레오 샘플의 모노 변환 — 채택

실제 MP3 389개를 확인했더니 모두 stereo였어. 실제 로딩에서도 full 389개, Lite 207개가 두 채널로 디코딩됐어. `_compact()`의 기존 두 채널 루프는 출력 Float32 배열을 두 번 순회하며 읽고 썼어. 한 번 순회하도록 바꾸되, 첫 채널을 더한 뒤의 Float32 반올림과 +0 규칙을 명시적으로 유지했어.

```js
o[i] = Math.fround(0 + left[i] / 2) + right[i] / 2;
```

단순 `(left[i] + right[i]) / 2`와는 극소값·signed zero에서 결과가 다를 수 있어. [테스트](../tests/sample-compact.test.mjs)는 이전 채널별 알고리즘을 독립 reference로 보존하고, subnormal·±0·극값·NaN/Infinity·mono/3채널·Lite 잘림/fade를 비교해. 두 입력이 `2^-149`인 고정 사례의 예상 0도 검사해. mono/다채널 경로, 샘플 수, 원래 fetch/decode 동시성 6, sample rate는 바꾸지 않았어.

### 실제 샘플 전수 로딩 실험

[sample-preparation.mjs](../tools/bench/sample-preparation.mjs)는 실제 `AudioEngine.loadSamples()`와 모든 대상 MP3, 브라우저의 실제 `decodeAudioData()`·AudioBuffer를 써. WebGL·잔향 생성·관객 준비·앱 UI는 실행하지 않는 분리 실험이야. cold는 브라우저 MP3 응답 cache hit 0개, warm은 같은 browser context에서 전부 hit인지 직접 확인했어. OS·서버 cache까지 차가웠다는 뜻은 아니야.

먼저 고정 cabfe78 제품에서 기존 방식과 실험용 stereo 함수를 비교했어. **full ABBA → Lite ABBA → full ABBA → Lite ABBA**, 총 16개 독립 브라우저 실행에서 cold/warm 32개 관측을 모았어. 네 반복씩의 중앙값이야.

| 조건 | 전체 샘플 준비 이전 → 실험 | 감소 | `_compact` 시간 합계 이전 → 실험 |
|---|---:|---:|---:|
| full cold | 2,663.70 → 2,159.45ms | 18.9% | 944.15 → 256.05ms |
| full warm | 2,615.00 → 1,920.30ms | 26.6% | 882.55 → 257.00ms |
| Lite cold | 970.05 → 828.25ms | 14.6% | 317.95 → 71.45ms |
| Lite warm | 929.95 → 674.50ms | 27.5% | 274.25 → 63.10ms |

모든 인접 A/B 짝에서 샘플 준비와 compact 시간이 줄었고, 이 32개 관측에는 long task가 없었어. compact 시간 감소는 중앙값 기준 약 71–78%야. 같은 파일·PCM을 유지하면서 해당 CPU 작업을 줄인 근거로 제품에 반영했어. **표의 14.6–27.5%는 이 분리 실험의 샘플 준비 시간이며 앱 전체 로딩이나 FPS 개선율이 아니야.**

### 제외하지 않은 이상 관측과 최종 제품 확인

확증 반복 전에 한 탐색 Lite cold에서 단일 compact가 366.8ms, long task가 370ms였어. 전체 샘플 준비도 1,310.8ms로 느렸어. 원인은 확정하지 못했고, 해당 값과 실행을 [검증 JSON](audio-preparation-validation.json)에 그대로 남겼어. 후속 32개 관측에서 재현되지 않았다는 사실만으로 모든 기기에서 없다고 판단하지 않아.

제품 반영 뒤에는 실험 함수를 정의하지 않은 페이지에서 **제품의 `_compact()` 자체**로 full/Lite cold/warm 네 관측을 따로 확인했어. 전부 long task 0이었고 compact 합계는 full 269.0/236.8ms, Lite 88.2/77.9ms였어. 전체 샘플 준비는 full 2,245.2/1,822.9ms, Lite 1,116.2/706.7ms였어. 이는 제품 적용·PCM 확인용이며 위 반복 통계에 합치지 않았어. Lite cold의 변동도 숨기지 않아.

초기 탐색·확증·제품 확인 **44개 cold/warm 관측 모두**, 각 모드의 모든 PCM 채널·버퍼 길이·rate·샘플 집합이 기준과 bitwise 동일했어. 실행별 관련 HTTP 394경로를 전후 대조했고 MP3 389개·manifest·layout은 그대로야. 실험 수집기와 제품 확인 수집기의 작은 변경(사용하지 않는 fixture 정의 생략, 실행 출처 기록)도 서로 다른 SHA로 남겼어.

## 3. 검토했지만 추가하지 않은 후보

| 후보 | 판단과 다음 조건 |
|---|---|
| mono 샘플에서 복사 생략 | 실제 파일·디코딩 결과가 모두 stereo라 현재 자산에는 효과가 없어. 미반영 |
| fetch 6 / decode 2–4로 동시성 분리 | 기준 프로파일에서 long task가 없었고 compact가 먼저 확인된 병목이었어. decode 제한 자체는 성능 비교하지 않았으므로 개선 주장 없이 보류. 메모리 압박·decode 경합이 실제로 관측될 때 cap3/6을 같은 PCM·준비 시간·native 메모리 조건으로 비교해 |
| compact를 매번 양보하거나 Worker로 이동 | 이번 단일 순회만으로 비용이 크게 줄었어. 메시지 전송·추가 대기를 먼저 넣지 않았어. 로컬의 느린 CPU에서 반복되는 long task가 남으면 그 작업을 특정하고 실험해 |
| Sphere renderOrder / box proxy | 이 클라우드는 물리 GPU가 없어 미확정. [앞선 기록의 네 조건](MERGE_PREPARATION.md#실제-gpu에서-먼저-분리할-변경)으로 원인 분리해. 과거 SwiftShader의 wide/forest 악화를 해결했다고 가정하지 마 |
| GPU 패스별 비용 / 자동 품질 회복 / 긴 감상 | [로컬 실행 지시](LOCAL_AGENT_HANDOFF.md)의 실제 GPU·정상 앱·청음 단계에서 확인해. 이 문서의 오디오 CPU 개선으로 대체하지 않아 |

## 4. 같은 오디오 검사를 로컬에서 재현하기

먼저 [로컬 실행 지시](LOCAL_AGENT_HANDOFF.md)의 별도 검토 worktree와 Playwright 설치를 완료해. 다음 추가 비교는 **cabfe78과 현재 후보**용이야. main 대비 GPU 비교용 8381/8382 서버와 혼동하지 않아. 새 경로만 사용해.

```sh
git -c core.autocrlf=false worktree add --detach ../forest-audio-before cabfe78d4ef04112372479c98d67a45e552c9b77
git -c core.autocrlf=false worktree add --detach ../forest-audio-after HEAD
```

현재 후보의 검토 루트에서 각각 다른 터미널로 서버를 열어. 아래 명령은 Bash/PowerShell에서 같아.

```sh
node --input-type=module -e "process.env.HOST='127.0.0.1'; process.env.PORT='8391'; process.env.QUIET='1'; await import('../forest-audio-before/server.js');"
```

```sh
node --input-type=module -e "process.env.HOST='127.0.0.1'; process.env.PORT='8392'; process.env.QUIET='1'; await import('../forest-audio-after/server.js');"
```

수집기는 항상 **현재 후보의 파일**을 양쪽 서버에 사용해. 한 번에 하나씩 실행하고 GPU 벤치·음악 재생·다른 CPU 작업과 겹치지 마. 새 output 폴더·label을 사용하고 실패·느린 실행도 보존해. `REVISION`에는 각 서버 worktree에서 `git rev-parse HEAD`로 읽은 SHA를 기록해.

**Bash 설정·후보 확인 예시:**

```bash
export PLAYWRIGHT_MODULE=../forest-bench-tools/node_modules/playwright
export OUTPUT_DIR=../forest-audio-results-001
export TIMEOUT_MS=90000
export BASE_URL=http://127.0.0.1:8392
export REVISION=$(git -C ../forest-audio-after rev-parse HEAD)
AUDIO_PREPARATION=house-worker AUDIO_CASES=all node tools/bench/audio-worker.mjs candidate-contract
node tools/bench/sample-preparation.mjs candidate-full-01 full original 6
node tools/bench/sample-preparation.mjs candidate-lite-01 lite original 6
```

**PowerShell의 같은 설정·실행:**

```powershell
$env:PLAYWRIGHT_MODULE = '../forest-bench-tools/node_modules/playwright'
$env:OUTPUT_DIR = '../forest-audio-results-001'
$env:TIMEOUT_MS = '90000'
$env:BASE_URL = 'http://127.0.0.1:8392'
$env:REVISION = git -C ../forest-audio-after rev-parse HEAD
$env:AUDIO_PREPARATION = 'house-worker'
$env:AUDIO_CASES = 'all'
node tools/bench/audio-worker.mjs candidate-contract
if ($LASTEXITCODE -ne 0) { throw '오디오 계약 실패' }
node tools/bench/sample-preparation.mjs candidate-full-01 full original 6
if ($LASTEXITCODE -ne 0) { throw 'full 샘플 검사 실패' }
node tools/bench/sample-preparation.mjs candidate-lite-01 lite original 6
if ($LASTEXITCODE -ne 0) { throw 'Lite 샘플 검사 실패' }
```

샘플 도구의 `original`은 **해당 서버가 제공하는 제품 메서드**라는 뜻이야. 후보 서버에서는 최적화된 제품 메서드를 실행해. `stereo-fused`는 cabfe78 서버에서 가설을 비교할 때만 쓴 실험 fixture야. 최종 제품 전후 비교는 양쪽 모두 `original`을 사용하고 서버·REVISION을 바꿔.

반복 비교는 각 profile에서 cabfe78의 8391을 A, 후보의 8392를 B로 **ABBA 두 블록** 수행해. Worker 도구는 A에 `AUDIO_PREPARATION=legacy`, B에 `house-worker`, 양쪽 `AUDIO_CASES=worker`를 써. 샘플 도구는 full/Lite를 각각 반복하고 각 실행의 cold/warm을 분리해. 단발 값이나 서로 다른 profile을 섞어 비교하지 않아. 실행마다 새 label을 사용해.

장시간 작업은 기존 [run-plan.py](../tools/bench/run-plan.py)의 JSON job 형식으로 `timeoutSeconds: 120`과 새 output 폴더를 지정해 실행할 수 있어. 각 job은 해당 도구의 `script`, CLI `args`, 위 `env`를 갖고 `--heartbeat-seconds 20`을 사용해. 도구 내부 TIMEOUT만 전체 프로세스 상한으로 오해하지 마. 두 버전에 같은 브라우저·전원·cache 관측 조건을 적용해.

## 5. 증거와 최종 병합 판단

이번 환경은 Linux x64, Playwright 1.62.1 / Chromium 153.0.8010.0이야. 오디오 분리 검사는 실제 브라우저 AudioBuffer/Worker/MP3 decoder를 사용했지만 스피커 청음은 하지 않았어. 전체 회귀 `npm test`는 16개 파일, Python 계획·판정 검사는 5개 case를 통과했어. 파일 수를 개별 case 수로 바꾸어 부르지 않아.

최종 제품의 **Hall/Sphere × desktop/mobile 자동 기능 네 조합도 전부 PASS**였어. desktop 640×360 / DPR 1, mobile 390×844 / DPR 2에서 입장·이동·시야·착석·재생/탐색/재개·품질·관객·중계를 확인했고 Sphere는 세계 전환도 검사했어. Hall은 각각 14개, Sphere는 각각 17개 완료 렌더 프레임이야. 실패·unchecked·page/console error·실패 요청·context loss는 없었어. 이 검사는 SwiftShader, 제어된 main rAF와 일부 대기 단축 fixture를 쓰므로 실제 GPU 성능이나 실기기·청음 결과는 아니야. 렌더 경고와 fixture 목록도 JSON에 남겼어.

[검증 JSON](audio-preparation-validation.json)은 모든 오디오 반복 값·pair, PCM/제품/도구 해시와 최종 기능 검사 결과를 추린 기록이야. 브라우저의 전체 상태 dump·모든 타이머 표본·원시 샘플별 시간 파일을 다시 수천 줄로 복제하지 않았어. 원본 파일의 해시는 식별용으로 남겼고, 원시 자료 전체가 Git에 첨부됐다는 뜻은 아니야. 현재 수집기로 새 폴더에 재현할 수 있어.

최종 CI는 **현재 PR head**의 checks를 확인해. GitGuardian의 neutral/skipped를 보안 검사 PASS로 세지 않아. 기존 cabfe78 체크나 과거 e741→6c 성능 결과를 현재 후보 결과로 사용하지 마.

이 추가 CPU 개선은 이득의 일부 근거야. 기존 Sphere의 실제 GPU 회귀 의심, 정상 앱의 화면·기능·음악 확인이 아직 남아 있어. 로컬 AI는 [실행 지시](LOCAL_AGENT_HANDOFF.md)에 따라 최신 main과 후보를 직접 검사하고, 이득과 보존 조건을 함께 만족할 때 병합해. 그렇지 않으면 새 수정·새 측정 결과를 PR에 남기며 이어가.
