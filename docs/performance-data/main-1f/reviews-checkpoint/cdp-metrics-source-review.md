# CDP Performance 지표의 정의와 해석 범위 검토

검토일: 2026-10-21 UTC. 공식 Chrome DevTools Protocol 문서와 Chromium 소스만 사용했어. 이 문서는 **소스 검토**이며 브라우저·GPU·새 성능 측정은 실행하지 않았어. 제품, 수집기, 기존 성능 원본도 수정하지 않았어.

## 1. 최종 보고서에 적용할 결론

- 기본 `timeTicks`에서 **TaskDuration은 관측한 renderer 메인 스레드 task의 누적 경과시간**이야. task 내부의 동기 대기를 포함하므로 CPU 실행시간이나 CPU 사용률로 표기하면 부정확해.
- 일반적인 페이지 대상에서 **ΔThreadTime은 관측 대상 renderer 메인 스레드의 구간 CPU 실행시간**이라고 설명할 수 있어. 계측 비용을 포함하며, 다른 스레드·프로세스·GPU 전체의 비용은 나타내지 않아.
- **ScriptDuration은 계측된 스크립트 구간 시간**이야. 기본 도메인에서는 순수 JavaScript CPU 시간으로 해석하면 안 돼. DevTools가 실행시킨 코드의 모든 비용이 이 항목에 들어간다고도 보장할 수 없어.
- **ProcessTime은 현재 renderer 프로세스 전체 스레드의 CPU 누적시간**이야. 조회 오류를 `0`으로 바꾸는 구현이 있으므로, `0`만으로 CPU 사용이 없었다거나 측정이 정상이라고 판단하지 않아.
- `Runtime.evaluate`/`Runtime.callFunctionOn`으로 실행한 동기 `readPixels`가 관측 중인 task 안에서 기다린 시간은 기본 TaskDuration에 포함돼. 그렇다고 CDP 왕복 전체, GPU 자체 실행시간, 실제 표시 FPS를 의미하지는 않아.

위 결론은 아래의 버전 고정 구현과 시계·프로세스·WebGL 명령 구현을 함께 읽은 판단이야. 공식 프로토콜의 도메인 설명과 과거 고정 커밋의 동일한 핵심 구조도 대조했어. [CDP Performance 공식 문서](https://chromedevtools.github.io/devtools-protocol/tot/Performance/) · [Chromium 2024 고정 커밋의 Performance agent](https://chromium.googlesource.com/chromium/src/+/97e0f013d49d99a455afe1609c387a3662cf8fd2/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc) · [Chromium main의 시계 정의](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/time/time.h) · [Chromium main의 Linux 프로세스 CPU 구현](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/process/process_metrics_linux.cc) · [Chromium main의 ReadPixels 구현](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/gpu/command_buffer/client/gles2_implementation.cc)

## 2. 버전과 조회 경로

측정 브라우저에 기록된 버전 문자열과 같은 **Chromium `153.0.8010.0` 태그**를 우선 사용했어. 태그 메타데이터가 가리킨 커밋은 `16bd491dedbcbf51ea052faf4a1e4443cb826f26`이야. 이 검토는 배포된 실행 파일의 모든 빌드 옵션이나 바이너리를 그 커밋과 대조한 검증은 아니야.

- 태그 메타데이터 전체 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0?format=JSON>
- 태그의 agent 원문 전체 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc?format=TEXT>
- 커밋 고정 사람이 읽는 URL: <https://chromium.googlesource.com/chromium/src/+/16bd491dedbcbf51ea052faf4a1e4443cb826f26/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc>

태그 agent 원문은 일반 웹 도구가 본문을 열지 못해서, 공식 Gitiles HTTP 원문을 읽고 base64를 해제해 확인했어. 성공한 웹 검색 ref가 없는 자료는 아래에 그렇게 구분했어. 접근 실패 ref를 본문 근거로 사용하지 않았어. HTTP 원문은 읽기만 했으며 실행하지 않았어.

이 agent 파일은 조회 당시 main 커밋 `8bb4a4aaa970f3f948e50d0ff728a435fa72f0d1`의 파일과 바이트가 같았어. **같다고 확인한 것은 agent `.cc` 한 파일**이야. 전체 Chromium 소스나 모든 플랫폼 구현이 같다는 뜻은 아니야. 태그와 main 원문의 SHA-256은 모두 `0eee80a8c94d9bd303ddefe49fb419b2e07665df371273bbe451a399b5159262`, 크기는 14,962 bytes였어.

프로토콜 `tot` 페이지와 main URL은 움직일 수 있으므로 최종 재현에서는 버전 태그·커밋과 아래 해시를 함께 사용해야 해. 프로토콜 문서도 tip-of-tree의 호환성을 고정 보장하지 않아. [CDP 공식 버전 정책](https://chromedevtools.github.io/devtools-protocol/index.html)

## 3. 각 지표를 어떻게 읽어야 하나

| 지표 | 153 구현에서의 의미 | 보고할 수 있는 표현 | 해석 제한 |
| --- | --- | --- | --- |
| TaskDuration | task observer가 시작/끝을 재서 누적하고, 조회 중인 task의 진행분도 포함. 기본 시계는 `timeTicks` | `관측 구간 task 누적 경과시간(ms)` | task 내부 동기 대기 포함. task 사이 모든 idle 시간, CPU 사용률, 순수 GPU 시간은 아님 |
| ScriptDuration | `CallFunction`/`ExecuteScript` probe의 바깥 스크립트 구간을 누적. 중첩 style/layout 시간을 조정 | `계측된 스크립트 구간 경과시간(ms, timeTicks)` | 네이티브 호출 대기와 DevTools 코드 분류에 유의. JS CPU 실행시간과 동일하지 않음 |
| ThreadTime | 현재 스레드의 `ThreadTicks`에서 enable/restore 시 저장한 원점을 뺀 값 | `renderer 메인 스레드 CPU 실행시간 Δ(ms), 계측 포함` | 페이지 target의 정상 지원 환경이라는 조건. 전체 renderer/Chrome CPU, AudioWorklet·worker·GPU 비용이 아님 |
| ProcessTime | 현재 프로세스의 누적 CPU 사용 시간을 직접 반환 | `renderer 프로세스 CPU 실행시간 Δ(ms), 유효한 조회에 한함` | 프로세스 시작부터 누적. 전 스레드 합계로 벽시계보다 빨리 증가 가능. 오류가 0으로 대체될 수 있음 |

네 값은 원문에서 초 단위로 반환돼. 비교는 같은 세션·안정된 프로세스의 before/after 차이를 사용하고 필요하면 1,000을 곱해 ms로 변환해야 해. 모든 지표를 “navigation 이후” 또는 “enable 이후”로 통일해서 설명하면 안 돼. `InnerEnable`이 각 누적 duration을 전부 초기화하지는 않고, ThreadTime 원점은 다시 설정해. disable/enable, target 교체, renderer 재시작을 가로지르는 차이는 별도로 무효 처리해야 해. 정의·원점 근거는 S3, CPU 시계와 프로세스 범위 근거는 S4–S6이야.

### timeDomain을 반드시 함께 적기

`Performance.enable`에서 도메인을 생략하면 `timeTicks`야. 명시적으로 `threadTicks`를 선택하면 TaskDuration·ScriptDuration 등의 duration 계산에 스레드 실행 시계를 사용해. 이때 같은 지표명이라도 기본 도메인과 의미가 달라져. 지원되지 않는 플랫폼에서 이 도메인을 요청하면 오류를 반환하고, 활성화 중 도메인을 바꾸는 요청도 거절해. `ThreadTime`은 선택한 duration 도메인과 별도로 스레드 시계를 사용해. S1·S2·S3 근거야.

### ThreadTime을 “메인 스레드 CPU”라고 해도 되는 범위

`WebDevToolsAgentImpl`은 main thread를 확인하는 생성 경로에서 페이지용 `InspectorPerformanceAgent`를 붙여. 따라서 이 프로젝트처럼 페이지 CDP 세션을 관측할 때 위 표현이 타당해. ThreadTicks는 스레드가 CPU에 배정된 동안 흐르는 시계라서, I/O 등의 대기 때문에 스케줄에서 빠진 시간은 포함하지 않아. 반대로 CPU를 쓰며 회전 대기하는 비용은 CPU 시간으로 남을 수 있어. S4·S8 근거야.

여러 renderer를 쓰는 문서나 별도 worker, 오디오 스레드, compositor, 브라우저/GPU 프로세스의 총비용은 이 값 하나로 합산되지 않아. 특히 소프트웨어 렌더러에서 GPU 프로세스가 쓴 CPU 비용까지 메인 스레드 ThreadTime이 보여 준다고 설명하면 안 돼. 이것은 측정 범위로부터의 판단이며, 이번에 다른 프로세스 비용을 추가 측정하지 않았어.

## 4. Runtime 평가와 동기 readPixels의 귀속

현재 `full-frame-fixture.js`는 실제 `frame()` 뒤에 CPU 배열을 받는 1×1 `gl.readPixels`를 호출해. Chromium GLES2 client 구현에는 이런 결과 회수 경로에서 명령 완료를 기다린 뒤 결과를 복사하는 부분이 있어. PBO에 쓰고 반환하는 별도 경로와 구분해야 해. **WebGL의 모든 readPixels 사용을 항상 같은 방식의 동기 대기라고 일반화하지 않았어.** S7과 로컬 fixture가 근거야.

이 대기가 계측 중인 메인 스레드 task 안에서 발생하면, 기본 TaskDuration의 시작/끝 시계는 그동안 계속 흐르므로 대기 시간이 포함돼. 반면 그 스레드가 블록되어 CPU에서 내려간 부분은 ThreadTime에 같은 길이로 포함되지 않아. 이것은 두 시계와 명령 완료 대기 구현을 결합한 **소스 기반 추론**이며, 새 tracing 실험으로 귀속을 확인한 결과는 아니야.

DevTools 세션은 V8 inspector 명령과 별도 dispatcher를 사용하고, debugger task 및 Blink script probe도 각각 존재해. 따라서 `Runtime.evaluate`/`callFunctionOn`의 전체 실행시간이 ScriptDuration 하나에 들어간다고 단정하지 않아. 스크립트 probe 안에 네이티브 대기가 들어가면 해당 구간의 경과시간에 포함될 수 있지만, 실제 명령 비용의 일부가 `DevToolsCommandDuration` 등으로 분류될 수도 있어. S3·S9·S10 근거야.

다음 계산이나 표현은 피해야 해.

- `TaskDuration` 감소량을 그대로 CPU 연산 감소량으로 바꾸기.
- `TaskDuration - ThreadTime`을 GPU 대기 시간으로 명명하기. CPU 스케줄링 대기·다른 동기 대기·범위 차이도 섞일 수 있어.
- `DevToolsCommandDuration`을 전부 불필요한 계측비로 보고 빼기. 평가 명령이 시킨 실제 앱 작업도 포함할 수 있어.
- 전체 CDP 왕복시간을 하나의 renderer task로 취급하기. 전송·큐 대기·비동기 promise 대기 등은 구분해야 해.
- 동기 readback 완료시간의 역수를 실제 FPS 또는 순수 GPU FPS로 제시하기.

현재 controlled 수집의 `completeMs`는 **전체 frame 호출과 readPixels 완료 대기를 포함하는 비용**이라고 표현하는 것이 맞아. 표시 주기에 맞춘 실제 앱의 native rAF cadence나 GPU timer query와 별도 항목으로 유지해야 해.

## 5. 0·누락·플랫폼 차이

### ProcessTime의 0

S3의 현재 구현은 프로세스 CPU 조회 실패를 기본 0 duration으로 바꿔 내보내. S6의 Linux 구현에서는 `/proc` 읽기·수치 해석 실패가 오류로 반환될 수 있어. 따라서 0은 정상적인 아주 작은 값·계산 해상도·조회 실패의 가능성을 함께 고려해야 해. **이번 실행에서 나타난 0의 정확한 원인이 sandbox인지, 다른 시스템 오류인지 이 소스 검토로 확정하지 않았어.**

동일한 의미 있는 부하 구간에서 ThreadTime은 증가하지만 ProcessTime이 계속 0이라면 ProcessTime의 유효성을 의심할 근거는 있어. 원본 0을 보존하고, 유효성을 확인하지 못한 파생 CPU 수치는 `미측정/유효성 미확인`으로 표시하는 편이 맞아. 짧은 구간의 0 차이만으로 무지원이라고 판정해서도 안 돼.

`GetPlatformIndependentCPUUsage`의 “첫 호출은 0” 설명은 간격별 CPU 비율을 계산하는 다른 API의 규칙이야. **ProcessTime이 호출하는 누적 CPU API의 0을 그 규칙으로 설명하면 안 돼.** S5의 두 API 정의를 대조했어.

### ThreadTime과 누락 값

스레드 CPU 시계도 플랫폼별 지원·초기화·분해능 조건이 있어. unsupported를 모든 환경에서 동일하게 0으로 반환한다고 단정하지 않아. 명시적 `threadTicks` 도메인은 지원 검사를 하지만, 기본 도메인의 ThreadTime 숫자 하나만으로 지원이 보장되는 것은 아니야. metric이 아예 없거나 비활성 상태의 빈 배열이면 0을 채우지 말고 누락으로 남겨야 해.

| 근거 | 확인한 플랫폼 차이 | 보고상의 처리 |
| --- | --- | --- |
| S4 `time.h` | 지원 매크로와 Windows runtime 지원 검사, 초기화 조건이 있음 | OS·아키텍처·Chrome 버전을 기록하고 정상 증가 여부를 확인 |
| S11 POSIX 구현 | Linux/Android 계열 스레드 CPU 시계는 `CLOCK_THREAD_CPUTIME_ID` 경로 | 벽시계와 별도 시계임을 명시; 타 OS와 동일 분해능을 보장하지 않음 |
| S12 Windows 구현 | x86 계열의 cycle/TSC 경로와 ARM64의 user+kernel time 경로가 다름. 초기화 전 빈 값 가능 | 모든 Windows 기기의 동일 정밀도·지원 여부를 가정하지 않음 |
| S6 Linux 프로세스 구현 | 프로세스 CPU는 user+system tick을 합산하며 오류 경로가 존재 | 매우 짧은 차이의 0과 지속적인 조회 실패를 구분 |

이 표는 공식 구현의 지원 경로 설명이야. 물리 Windows/macOS/Android/iOS 장치에서 각각 검증했다는 뜻은 아니고, Safari의 다른 계측 API에도 그대로 적용하지 않아.

## 6. 계측 오버헤드와 이번 collector의 범위

Performance agent 활성화는 task observer와 계측 probe를 추가하고, getMetrics는 여러 시계·카운터·프로세스 CPU·heap 정보를 읽어. S4도 ThreadTicks 조회가 TimeTicks보다 비쌀 수 있으며 OS와 sandbox 경로에 따라 달라진다고 설명해. snapshot의 모든 필드는 완전히 같은 순간에 원자적으로 읽히는 것이 아니야. **이 검토에서는 활성화 전후 오버헤드를 정량 측정하지 않았어.**

동기 readPixels는 렌더 파이프라인의 대기를 유도하는 능동적인 측정 조건이야. native 렌더 cadence와 별도로 비교해야 하고, CDP 관찰 구간의 수치에도 QA 작업이 일부 포함돼. TaskDuration과 ThreadTime의 차이 또는 작은 개선량만으로 오버헤드를 제거한 제품 성능을 추정하지 않아.

현재 worktree를 읽기 전용으로 확인한 수집기 증거는 다음과 같아. 이 해시는 **검토 시점 파일**을 식별하며, 과거 모든 실행이 이 버전을 썼다는 증명은 아니야. 각 raw JSON의 source manifest를 우선해야 해.

| 로컬 파일 | bytes | SHA-256 | 정적 확인 |
| --- | ---: | --- | --- |
| `/workspace/scratch/296fafc0af7f/forest-philharmonic/tools/bench/full-frame.mjs` | 13760 | `2bf556b443cd64df6b4d743ec45e11dc382e6a9014083054472ddb39919d37c9` | `Performance.enable`에 도메인 생략. 시나리오 전후 snapshot과 raw metric을 보존. sync 표본은 `step(true)` |
| `/workspace/scratch/296fafc0af7f/forest-philharmonic/tools/bench/full-frame-fixture.js` | 12135 | `262b5f126c6214d1875010056da4327117af2c764dab8d04854dc4b709871d98` | `frame()` 직후 CPU 배열을 받는 동기 readPixels. completeMs와 submitMs를 분리 |

collector의 기존 해석 주석은 task/script duration에 QA 비용과 동기 대기가 포함되고 CPU utilization이나 순수 GPU 시간이 아니라는 경계를 이미 적고 있어. 최종 표의 한글 제목·설명도 그 경계에 맞춰야 해.

권장 최종 문구:

> 기본 CDP timeTicks의 ΔTaskDuration은 관측 구간 task 경과시간이며 동기 readPixels 대기와 계측 비용을 포함해. ΔThreadTime은 지원되는 환경에서 같은 renderer 메인 스레드의 CPU 실행시간을 나타내. ProcessTime은 조회 오류가 0으로 나타날 수 있어 유효성이 확인되지 않은 값으로 CPU 개선을 주장하지 않았어. 이 지표들은 native FPS나 순수 GPU 시간과 별도로 해석했어.

## 7. 공식 자료 목록: 전체 URL·짧은 인용·해시

직접 인용은 각 원문당 25단어 이내로 제한했어. 다음 SHA-256은 Gitiles `?format=TEXT` 응답을 base64 해제한 **소스 파일 bytes** 기준이야. 웹 도구가 성공한 별도 main/과거 커밋 ref는 보조 대조 자료로만 표시하고, 153 태그 자체를 열었다고 혼동하지 않도록 구분했어.

### S1. CDP Performance 도메인 문서

- 전체 URL: <https://chromedevtools.github.io/devtools-protocol/tot/Performance/>
- 짧은 인용: “Time domain to use for collecting and reporting duration metrics.”
- 사용: 선택 가능한 timeDomain과 명령의 공개 계약. 개별 metric 내부 정의는 아래 Chromium 구현으로 확인했어.
- 웹 검색 본문 ref: [CDP Performance 공식 문서](https://chromedevtools.github.io/devtools-protocol/tot/Performance/). 이후 open은 redirect 페이지였으므로 그 빈 페이지를 정의 근거로 삼지 않았어.
- 버전 정책 URL: <https://chromedevtools.github.io/devtools-protocol/index.html> [CDP 공식 버전 정책](https://chromedevtools.github.io/devtools-protocol/index.html)

### S2. 공식 protocol PDL의 시간 도메인 주석

- 전체 URL: <https://chromium.googlesource.com/chromium/src/+/b103e6f9307bb41c3928e7e8f377488e856aeff9/third_party/blink/public/devtools_protocol/browser_protocol.pdl>
- 짧은 인용 두 개, 합계 10단어: “Use monotonically increasing abstract time (default).” / “Use thread running time.”
- 사용: 기본 timeTicks와 threadTicks의 구분을 확인한 고정 커밋의 공식 protocol 정의.
- 웹 검색 ref: [Chromium 고정 커밋의 protocol PDL](https://chromium.googlesource.com/chromium/src/+/b103e6f9307bb41c3928e7e8f377488e856aeff9/third_party/blink/public/devtools_protocol/browser_protocol.pdl)

### S3. 153 버전의 InspectorPerformanceAgent 구현

- 공식 태그 원문 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc?format=TEXT>
- bytes: 14962; SHA-256: `0eee80a8c94d9bd303ddefe49fb419b2e07665df371273bbe451a399b5159262`.
- 짧은 인용: `GetCumulativeCPUUsage().value_or(base::TimeDelta())`.
- 주요 위치: `InnerEnable`, `InnerSetTimeDomain`, `GetTimeTicksNow`, `getMetrics`, `ScriptStarts/ScriptEnds`, `WillProcessTask/DidProcessTask`.
- 사용: 네 지표의 계측·원점·단위·실패값 처리. 태그 원문은 공식 HTTP 직접 조회 성공, 성공한 웹 본문 ref는 없음.
- 웹 도구로 별도 확인한 과거 고정 커밋 URL: <https://chromium.googlesource.com/chromium/src/+/97e0f013d49d99a455afe1609c387a3662cf8fd2/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc> [Chromium 2024 고정 커밋의 Performance agent](https://chromium.googlesource.com/chromium/src/+/97e0f013d49d99a455afe1609c387a3662cf8fd2/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc). **이 ref는 2024 커밋이며 153 태그의 ref가 아니야.**

### S4. ThreadTicks와 시계 지원·비용의 공식 정의

- 태그 원문 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/base/time/time.h?format=TEXT>
- bytes: 58380; SHA-256: `e66bef19df9d66cb48f6e6cc7eff68faf35dd46b29ac469206b6e7d122c1bb80`.
- 짧은 인용: “Represents a thread-specific clock that runs only while the thread is scheduled.”
- 사용: 스레드 CPU 시계의 범위, 블록·스케줄 대기 제외, 지원·초기화·조회 비용의 플랫폼 차이.
- 별도로 열린 main URL: <https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/time/time.h> [Chromium main의 시계 정의](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/time/time.h)

### S5. 누적 프로세스 CPU API 정의

- 태그 원문 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/base/process/process_metrics.h?format=TEXT>
- bytes: 24078; SHA-256: `bfd9dcd28d394d0969d970182c666cdc4b68eaeb7a143a91ef36e23fbb93f354`.
- 짧은 인용: “Returns the cumulative CPU usage across all threads of the process since process start”.
- 사용: ProcessTime의 프로세스·전 스레드 범위와 원점. 간격별 CPU 비율 API의 첫 호출 0 규칙과 구분.
- 별도로 열린 main URL: <https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/process/process_metrics.h> [Chromium main의 프로세스 CPU API 정의](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/process/process_metrics.h). 정확한 해당 API 본문은 153 태그 HTTP 원문으로 확인했어.

### S6. Linux 프로세스 CPU 조회 구현

- 태그 원문 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/base/process/process_metrics_linux.cc?format=TEXT>
- bytes: 33733; SHA-256: `eb91cfe101c5973152bc0a96e7c1f8a5ac0de365497207015dcfbf7eec0cc593`.
- 직접 인용 없음. `ParseTotalCPUTimeFromStats`와 `GetCumulativeCPUUsage`의 user/system tick 합산 및 오류 반환을 확인했어.
- 별도로 열린 main URL: <https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/process/process_metrics_linux.cc> [Chromium main의 Linux 프로세스 CPU 구현](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/process/process_metrics_linux.cc)

### S7. readPixels의 CPU 결과 회수 경로

- 태그 원문 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/gpu/command_buffer/client/gles2_implementation.cc?format=TEXT>
- bytes: 259044; SHA-256: `3e92d94ab9e502a5a4795c3c919d877d52ab4c9eab50e3e123d7b900f5715c63`.
- 짧은 인용: `if (!WaitForCmd())`.
- 사용: `ReadPixels`의 CPU 메모리 결과 회수 경로에는 명령 완료 대기가 있음. PBO 경로와 구분.
- 별도로 열린 main URL: <https://chromium.googlesource.com/chromium/src/+/refs/heads/main/gpu/command_buffer/client/gles2_implementation.cc> [Chromium main의 ReadPixels 구현](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/gpu/command_buffer/client/gles2_implementation.cc)

### S8. 페이지 Performance agent의 main thread 연결

- 태그 원문 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/third_party/blink/renderer/core/exported/web_dev_tools_agent_impl.cc?format=TEXT>
- bytes: 25983; SHA-256: `9d8c2b2517e701ee797da215eefb749bcb9c1c8ebe397512e3e0b09354f47830`.
- 직접 인용 없음. 생성자의 main-thread 확인, 페이지 세션에 Performance agent 추가, debugger task probe 연결을 확인했어.
- 공식 HTTP 원문 조회 성공; 성공한 웹 본문 ref는 없음.

### S9. DevTools의 명령 전달

- 태그 원문 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/third_party/blink/renderer/core/inspector/devtools_session.cc?format=TEXT>
- bytes: 20262; SHA-256: `4d8629bcf2de2c10e248aee10b693a9b81fdba9822fb89542bef632d4a35208b`.
- 직접 인용 없음. inspector 명령을 V8 session으로 dispatch하는 경로와 명령 종류에 따른 task 전달을 확인했어.
- 공식 HTTP 원문 조회 성공; 성공한 웹 본문 ref는 없음.

### S10. Inspector task 실행 경로

- 태그 원문 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/third_party/blink/renderer/core/inspector/inspector_task_runner.cc?format=TEXT>
- bytes: 3360; SHA-256: `679ec9a12cd3f8fe6b0f9f2de700af2e4519491d84745312a6110761e054d806`.
- 직접 인용 없음. interrupt를 쓰는 경로와 isolate thread에 task를 post하는 경로를 구분했어. 명령의 벽시계 왕복과 단일 task 시간을 동일시하지 않는 근거야.
- 공식 HTTP 원문 조회 성공; 성공한 웹 본문 ref는 없음.

### S11. POSIX/Android의 스레드 CPU 시계

- 태그 원문 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/base/time/time_now_posix.cc?format=TEXT>
- bytes: 4340; SHA-256: `ad8a692b7c94b84c6a8e516b61074485a3414fa419401630ad73b58d13f1ebf7`.
- 직접 인용 없음. `ThreadTicksNowIgnoringOverride`의 thread CPU clock 경로를 확인했어.
- 공식 HTTP 원문 조회 성공; 성공한 웹 본문 ref는 없음.

### S12. Windows의 스레드 CPU 시계

- 태그 원문 URL: <https://chromium.googlesource.com/chromium/src/+/refs/tags/153.0.8010.0/base/time/time_win.cc?format=TEXT>
- bytes: 38327; SHA-256: `ede1ea219907af440d995185f388c88896d186cb5dcaa192e571b7237f01864c`.
- 직접 인용 없음. `ThreadTicks::GetForThread`의 x86/ARM64 경로, 지원 검사, 빈 초기값 가능성을 확인했어.
- 공식 HTTP 원문 조회 성공; 성공한 웹 본문 ref는 없음.

## 8. 실제 확인한 것과 남아 있는 것

**완료:** 공식 프로토콜 조회, 측정 버전 태그의 agent·시계·프로세스·명령 전달 원문 조회, 파일 bytes/SHA 기록, 현재 collector/fixture의 읽기 전용 소스 대조, 위 해석 경계 작성.

**미실행:** Performance 계측 on/off 오버헤드 A/B, trace 이벤트로 개별 평가 명령의 구체적인 카운터 귀속 확인, ProcessTime=0의 환경별 오류 코드 확인, 실제 OS별 clock 해상도·지원 검증, 물리 GPU/오디오/브라우저 추가 실행. 이 문서로 해당 검사가 PASS했다고 주장하지 않아.

Root가 최종 답변에서 웹 근거를 직접 인용하려면 위 전체 URL을 다시 열고 자신의 성공 ref를 사용하면 돼. exact 153 원문을 웹 도구가 못 읽는 경우에는 공식 HTTP 원문을 직접 확인했다는 접근 방식과 SHA를 유지하고, 과거/움직이는 main ref를 153 태그의 직접 인용처럼 바꾸면 안 돼.
