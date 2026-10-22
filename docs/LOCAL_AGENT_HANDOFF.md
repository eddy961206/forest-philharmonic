# 이 PR을 맡은 로컬 AI의 실행 과제

대상은 [PR #1](https://github.com/eddy961206/forest-philharmonic/pull/1), 브랜치는 `perf/261021-venue-rendering`이야. **사용자가 이 PR과 브랜치 이력을 보라고 맡겼다면, 이 문서부터 읽고 아래 검증·수정·병합 판단을 직접 이어서 수행해.** 사용자가 별도의 채팅 프롬프트를 복사해 줄 예정은 없어.

사용자가 정한 위임 범위는 다음과 같아.

> 머지는 내 로컬에서 다른 AI 에이전트가 직접 띄워보고 똑같이 테스트해보고 성능 개선 효과가 있으면 머지하고 아님 더 고치게.

따라서 읽기나 계획 제시로 끝내지 말고 **로컬에서 앱 실행 → 회귀·기능 재검사 → 실제 GPU 전후 비교 → 이득과 보존 조건 확인 → 병합 또는 추가 수정·재측정**까지 진행해. 이 PR의 위임 범위 안에서 각 단계마다 사용자에게 같은 승인을 다시 요청하지 않아. 이 지시는 다른 PR이나 무관한 작업을 자동 병합하라는 뜻은 아니야. 실행 권한·물리 GPU·필요한 관측 수단이 실제로 없으면 가능한 검증까지 수행하고, 확인하지 못한 항목과 막힌 이유를 PR에 남겨.

[최신 추가 검증 기록](AUDIO_PREPARATION_FOLLOWUP.md)에 오디오 준비 후보를 직접 측정한 결과·채택 판단·남은 검증을 적었어. [cabfe78 시점의 수정 기록](MERGE_PREPARATION.md)에는 앞서 확인한 CPU·배열 절감과 실제 GPU에서 수행할 Sphere 원인 분리의 네 조건이 있어. 과거 결과를 최신 후보의 재측정 결과로 사용하지 마.

## 이번 수정과 아직 확인할 점

- `npm test`는 `tests/`의 제품·도구 회귀 파일을 명시적으로 실행해. 보존 디렉터리의 옛 `.test.mjs`까지 자동 발견하던 검색 범위를 고쳤고 Windows 셸 glob에도 의존하지 않아.
- 자동 화질의 medium→low 경계에서 실제 픽셀 비율이 오히려 올라가던 경로를 고쳤어. 내려가는 화질 단계에서 픽셀 작업량이 증가하지 않는지 확인해.
- 스피어의 정지 카메라는 같은 시야의 큐브 면 마스크 계산을 재사용해. 카메라 이동·회전·투영 변경은 다시 계산하고 세계 텍스처 갱신은 계속해.
- 좌석의 near/far/picking이 같은 instance 행렬을 공유하도록 중복 배열을 줄였어. 이는 typed array 보유량 변화이며 실측 heap·VRAM 절감 수치로 바꾸어 말하지 않아.
- 관객 murmur/noise도 기존 Worker에서 준비하도록 바꿨어. full/Lite의 메인 스레드 준비 호출 시간이 반복 비교에서 약 188/114ms→1ms로 줄었고, 전체 17개 오디오 버퍼의 PCM은 같았어. 직접 호출·CSP fallback·탭 숨김·context 재생성도 검사했어.
- 실제 stereo 샘플의 모노 변환을 한 번의 루프로 바꾸되 Float32 중간 반올림을 보존했어. 샘플 준비 분리 실험에서 반복 이득과 전수 PCM 동일성을 확인했고, 최종 제품 메서드도 따로 검사했어. [추가 기록](AUDIO_PREPARATION_FOLLOWUP.md)의 Lite 첫 로딩 이상 관측과 제품 단발 변동도 로컬 cold 확인에 포함해. 앱 전체 입장 시간/FPS 개선율로 바꾸어 말하지 마.
- 원시 측정 자료는 이전 `ed3a5db17a53cd84b75e33a25352831f148f9431` 커밋에서 보존해. [보존 안내](PERFORMANCE_ARCHIVE.md)를 참고해. 아래 도구는 그 자료를 복원하지 않아도 실행돼.
- **기존 스피어의 돔 renderOrder·box proxy 성능은 실제 GPU에서 아직 확정하지 못했어.** 옛 SwiftShader 비교에서는 wide·forest가 두 순서에서 모두 느려졌어. 이번 수정으로 자동 해결됐다고 가정하지 마.

## 1. 고정된 두 제품과 같은 수집기를 준비해

Node 22 이상, Python 3.10 이상, Git이 필요해. 기존 사용자 작업 폴더의 파일·브랜치는 그대로 두고 별도 검토 worktree를 만들어. 아래 `forest-local-review`와 `forest-merge-check-001`은 아직 없는 경로를 사용해. 이미 있으면 새 이름을 선택하고 이후 명령에도 같은 이름을 써.

기존 clone의 루트에서 실행해. 두 ref를 명시해서 single-branch clone에서도 `origin/main`이 실제로 생기게 해.

```sh
git status --short
git fetch origin refs/heads/main:refs/remotes/origin/main refs/heads/perf/261021-venue-rendering:refs/remotes/origin/perf/261021-venue-rendering
git log --oneline --decorate -12 origin/perf/261021-venue-rendering
git -c core.autocrlf=false worktree add --detach ../forest-local-review origin/perf/261021-venue-rendering
cd ../forest-local-review
git log -1 --format=fuller
git rev-parse origin/main
npm test
npm install --prefix ../forest-bench-tools playwright@1.62.1
node ../forest-bench-tools/node_modules/playwright/cli.js install chromium
```

명령이 실패하면 다음 단계로 넘기지 말고 원인을 먼저 고쳐. Python 회귀 검사도 Bash에서는 `python3 -m unittest discover -s tools/bench/tests -p 'test_*.py'`, PowerShell에서는 `py -3 -m unittest discover -s tools/bench/tests -p 'test_*.py'`로 실행해. 기존 clone이 없으면 저장소를 새 경로에 clone한 뒤 위 순서를 시작해.

이후 명령의 기준 위치는 새 `forest-local-review` 루트야. **실행 시점의 최신 `origin/main`과 최신 후보를 비교해.** `e741811d1d7a040afcdd3a8230465980c64f82fc`는 과거 비교의 기준이고 도구의 생략 기본값이므로, 아래처럼 `--baseline-ref origin/main`을 명시해. 후보가 최신 main을 포함하지 않으면 별도 작업 브랜치에서 main을 통합하고 회귀 문제를 해결한 뒤 새 후보를 고정해. 미커밋 제품 수정은 측정 후보로 사용하지 않아.

**Bash/macOS/Linux:**

```bash
python3 tools/bench/prepare-merge-check.py --baseline-ref origin/main --candidate-ref HEAD --output ../forest-merge-check-001 --playwright ../forest-bench-tools/node_modules/playwright
```

**Windows PowerShell:**

```powershell
py -3 tools/bench/prepare-merge-check.py --baseline-ref origin/main --candidate-ref HEAD --output ../forest-merge-check-001 --playwright ../forest-bench-tools/node_modules/playwright
if ($LASTEXITCODE -ne 0) { throw '계획 준비 실패: 새 폴더로 원인을 고친 뒤 다시 준비해' }
```

현재 도구가 후보 커밋에 없거나 수정된 상태면 준비가 실패해. 원격에서 받은 커밋 그대로 시작하고, 로컬에서 제품을 추가 수정했다면 새 후보 커밋·새 출력 폴더로 비교해. 기존 출력은 덮어쓰지 않아. 원본 worktree와 다른 CRLF 바이트도 거부하므로 도구는 새 worktree를 만들 때만 `core.autocrlf=false`를 적용해.

기존 Chrome/Edge로 확인하려면 준비 명령에 `--chrome "실제 실행 파일 경로"`를 추가해. 기본은 별도 Playwright Chromium의 **화면이 보이는 창**이야. 개인 브라우저 프로필은 사용하지 않아. 렌더러 문자열이 SwiftShader·llvmpipe·WARP 등 소프트웨어이거나 GPU 종류를 확인할 수 없으면 FAIL로 남겨. 이 검사를 꺼서 통과 처리하지 말고 GPU 가속·드라이버·원격 데스크톱 조건을 먼저 확인해.

## 2. 서버 두 개를 열고 같은 기능 검사와 실제 사용자 흐름을 확인해

각각 **다른 터미널**, `forest-local-review` 루트에서 실행해. 이 작업을 위해 연 서버만 마지막에 종료해.

```bash
HOST=127.0.0.1 PORT=8381 QUIET=1 node ../forest-merge-check-001/baseline/server.js
```

```bash
HOST=127.0.0.1 PORT=8382 QUIET=1 node ../forest-merge-check-001/candidate/server.js
```

PowerShell에서는 각각 이렇게 실행해.

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '8381'
$env:QUIET = '1'
node ../forest-merge-check-001/baseline/server.js
```

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '8382'
$env:QUIET = '1'
node ../forest-merge-check-001/candidate/server.js
```

### 같은 자동 기능 검사를 양쪽에서 실행해

아래 공통 명령은 Bash와 PowerShell에서 같아. 기존 성능 계획의 고정 SHA·서버·브라우저·소스 manifest 설정을 사용해 **기준/후보 × Hall/Sphere × desktop/mobile, 총 8개** 기능 작업을 만들어. desktop은 이전 클라우드 Sphere 검사와 같은 640×360 / DPR 1, mobile은 390×844 / DPR 2야. 같은 후보의 네 조합을 모두 검사하고, 기준에서도 같은 도구를 실행해. 계획 파일을 이미 만들었다면 덮어쓰지 않아.

```sh
node --input-type=module -e "import fs from 'node:fs'; const root='../forest-merge-check-001'; const source=JSON.parse(fs.readFileSync(root+'/plan.json','utf8')); const jobs=[]; for(const side of ['baseline','candidate']) for(const venue of ['hall','sphere']) for(const device of ['desktop','mobile']) { const seed=source.find(job=>job.env.SOURCE_SIDE===side); const id='functional-'+side+'-'+venue+'-'+device; const mobile=device==='mobile'; jobs.push({id,script:'tools/bench/functional.mjs',args:[venue,device],timeoutSeconds:180,directory:'functional',env:{...seed.env,LABEL:id,SCOPE:'full',CONTINUE_ON_TRANSPORT_FAIL:'0',EXPECTED_AUTO_PRESET:'',WIDTH:mobile?'390':'640',HEIGHT:mobile?'844':'360',DPR:mobile?'2':'1',TIMEOUT_MS:'120000'}}); } fs.writeFileSync(root+'/functional-plan.json',JSON.stringify(jobs,null,2)+'\n',{flag:'wx'});"
```

**Bash:**

```bash
python3 ../forest-merge-check-001/candidate/tools/bench/run-plan.py ../forest-merge-check-001/functional-plan.json --output ../forest-merge-check-001/functional-run --heartbeat-seconds 20
```

**PowerShell:**

```powershell
py -3 ../forest-merge-check-001/candidate/tools/bench/run-plan.py ../forest-merge-check-001/functional-plan.json --output ../forest-merge-check-001/functional-run --heartbeat-seconds 20
```

각 작업의 전체 상한은 180초야. 첫 실패·시간 초과에서 멈추고 `functional-run/logs/`, `progress.json`과 이미 끝난 JSON을 보존해. `functional-run/functional/`의 각 `*-summary.json`과 원본 JSON을 읽고, 후보의 모든 조합에서 `status: PASS`, `failures: []`, `unchecked: []`, page/console 오류와 context loss가 없는지 확인해. 기준의 실패도 별도로 남겨서 기존 문제와 새 회귀를 구분해. 기능 결과는 `collect-plan.mjs`에 넣지 않아. 그 집계기는 다음 절의 렌더 성능 계획용이야.

이 도구는 실제 UI·키보드·터치 입력을 쓰면서 main rAF를 제어하고 일부 대기를 fixture로 단축해. **이 검사의 프레임 수·소요 시간은 FPS나 실제 청감 검증이 아니야.** `SCOPE=transport`나 실패 후 계속 진행 옵션을 켠 결과를 전체 기능 PASS로 바꾸지 마. 새로운 오디오 변경의 PCM·fallback·ready 계약은 현재 `tests/`와 해당 변경의 검증 문서도 함께 읽어.

### 정상 앱을 직접 조작해

[기준 화면](http://127.0.0.1:8381/)과 [후보 화면](http://127.0.0.1:8382/)에서 **같은 설정·곡·좌석**으로 아래를 직접 확인해. 이때는 측정 fixture가 없는 정상 앱을 사용해.

| 흐름 | 확인할 결과 |
|---|---|
| 광장→발권→홀/스피어 입장→광장 복귀 | 버튼·이동·공연장 전환이 끝나고 화면이 멈추지 않아 |
| 이동·360° 회전·앉기/일어나기·객석 선택 | 좌석 누락·잘못된 picking·시야 경계의 깜빡임이 없어 |
| 재생→일시정지→탐색→재개 | 실제 소리가 이어지고 탐색 전 유지음·음악 시각이 어긋나지 않아 |
| 스피어 숲·산·바다·세계 전환 | 정지 카메라도 세계가 계속 움직이고 회전 시 검은 면·낡은 면이 없어 |
| high/medium/low/auto 변경·창 크기 변경 | 픽셀 비율·카메라·그림자가 갱신되고 낮출 때 순간적으로 더 무거워지지 않아 |
| 중계를 시야 밖으로 뺐다가 복귀 | 영상·자막이 바로 갱신되고 그림자가 사라지지 않아 |
| 두 탭의 방 생성·입장·동기화·채팅·재접속 | 방장과 참가자 상태·공연장·재생이 유지돼 |
| 각 공연장 최소 5분 실제 감상·탭 숨김/복귀 | 음악 끊김·중복 애니메이션·지속적인 메모리 증가 징후를 기록해 |

개발자 도구의 오류와 화면/소리 문제는 원본 캡처·재현 순서·기기 환경으로 남겨. 청취하지 않았다면 “오디오 시계만 확인”이라고 써. 실제 휴대폰을 사용하지 않았다면 모바일 에뮬레이션을 실기기 결과로 적지 않아. 이 수동 창과 두 탭은 아래 성능 수집을 시작하기 전에 닫아.

## 3. 회귀가 의심된 장면만 실제 GPU로 직렬 비교해

기본 계획은 **Hall front, Sphere wide/forest**야. high·1280×720·DPR 1, 같은 카메라/FOV·곡·음악 시각·관객 seed와 80% 점유 조건을 써. 각 장면은 native rAF 준비 60프레임 뒤 600개 간격을 모아. 준비·측정에 `readPixels` 완료 대기를 넣지 않아. 양쪽 모두 음표 스케줄러를 끈 통제된 렌더링이므로 위 실제 음악·UI 확인이 별도로 필요해.

공연장마다 **A→B→B→A를 두 블록**, 총 16개 브라우저 작업을 하나씩 실행해. 같은 버전의 600프레임을 600회 독립 실험처럼 계산하지 않아. 전체 `public/` HTTP 응답과 제품/server 파일·수집기 해시를 실행 전후에 검사하고 manifest와 대조해. 해시 검사는 측정 창 밖이며 샘플 캐시도 데우므로 이 결과로 첫 로딩 시간을 주장하지 않아.

**Bash:**

```bash
python3 ../forest-merge-check-001/candidate/tools/bench/run-plan.py ../forest-merge-check-001/plan.json --output ../forest-merge-check-001/run --heartbeat-seconds 20
node ../forest-merge-check-001/candidate/tools/bench/collect-plan.mjs --plan ../forest-merge-check-001/plan.json --root ../forest-merge-check-001/run --manifest ../forest-merge-check-001/source-manifest.json --output ../forest-merge-check-001/summary
python3 ../forest-merge-check-001/candidate/tools/bench/assess-merge-check.py --summary ../forest-merge-check-001/summary/summary.json --manifest ../forest-merge-check-001/source-manifest.json --output ../forest-merge-check-001/assessment.json
```

**PowerShell:**

```powershell
py -3 ../forest-merge-check-001/candidate/tools/bench/run-plan.py ../forest-merge-check-001/plan.json --output ../forest-merge-check-001/run --heartbeat-seconds 20
node ../forest-merge-check-001/candidate/tools/bench/collect-plan.mjs --plan ../forest-merge-check-001/plan.json --root ../forest-merge-check-001/run --manifest ../forest-merge-check-001/source-manifest.json --output ../forest-merge-check-001/summary
py -3 ../forest-merge-check-001/candidate/tools/bench/assess-merge-check.py --summary ../forest-merge-check-001/summary/summary.json --manifest ../forest-merge-check-001/source-manifest.json --output ../forest-merge-check-001/assessment.json
```

실행기는 첫 실패에서 멈추고 완료 자료·FAIL·TIMEOUT을 보존해. 실패 뒤에도 집계/판정을 실행하면 누락이 성공으로 바뀌지 않고 INVALID로 남아. 작업당 상한은 100초이고 기본 전체 예산은 종료 정리까지 약 28분이야. 대개 실제 GPU에서는 더 짧아. 20초 heartbeat가 있고 Ctrl+C는 자식 브라우저까지 정리해. 종료 오류가 남으면 프로세스를 확인한 뒤 다음 측정을 시작해. 다른 GPU 작업·브라우저 벤치마크는 동시에 돌리지 마.

예산이 모자라면 기존 결과를 보존하고 `--job-timeout 180`처럼 **새 계획·새 폴더**에 두 버전 모두 같은 조건을 적용해. 이미 끝난 index를 건너뛰어 이어갈 때만 같은 계획에서 `run-plan.py --start N`을 사용해. 실패 index를 같은 폴더에 재실행하거나 출력 파일을 지워 통과 이력으로 바꾸지 마.

## 4. 숫자와 화면을 함께 보고 결정해

`summary/summary.md`, `summary.json`, `assessment.json`, 원본 PNG와 실행 로그를 읽어. 평균·p50/p95/p99는 rAF 시작 간격 ms이고, 관찰 FPS는 `1000/평균 간격`이야. 1% Low는 가장 느린 `ceil(N×0.01)`개 간격 평균의 역수여서 600표본이면 6개가 기준이야. 실제 디스플레이 표시 FPS나 GPU 전용 시간은 아니야.

| 자동 판정 | 의미·다음 행동 |
|---|---|
| `CLEAR` | 모든 장면·4쌍에서 평균 간격 +5%, p95 +10%, 1% Low −10% 보류선을 넘지 않았어. 실제 이득과 화면·기능 확인은 별도로 필요해 |
| `INCONCLUSIVE` | 일부 반복만 보류선을 넘었어. 잡음으로 지우지 말고 전원·열·백그라운드 작업을 확인하고 새 계획으로 필요한 장면을 다시 비교해 |
| `HOLD_REGRESSION` | 같은 장면·같은 지표가 4쌍 중 3쌍 이상 보류선을 넘었어. 원인 변경을 분리하거나 해당 변경을 되돌린 후보를 재측정해 |
| `INVALID` | 실패·누락·해시·품질·GPU·실행 조건 문제야. 성능 결론을 내리지 않아 |

이 수치는 **사전에 고정한 공학적 보류 기준**이야. 통계적 유의성을 보증하지 않고, CLEAR도 “더 빨라짐”의 뜻은 아니야. VSync 상한에 묶이면 렌더 비용 감소가 rAF FPS에 드러나지 않을 수 있어. 같은 장면의 전후 PNG도 나란히 봐서 좌석·그림자·돔·중계가 유지되는지 확인해. 한 PC의 결과를 전체 PC·모바일에 일반화하지 않아.

**CLEAR만 보고 병합하지 마.** 같은 GPU에서 반복되는 프레임 시간/CPU 비용 감소나 검증 가능한 자원 절감 등 실제 이득을 별도로 제시하고, 그 이득이 회귀 위험보다 크다고 판단될 때 병합해. 차이가 없거나 판정이 애매하면 이득을 만들었다고 적지 말고 보류해. 최종 판정기는 모든 실행의 GPU·전체 소스 해시 검사와 실제 시작/종료 시각을 요구하고, ABBA 라벨만 맞춘 병렬·순서 뒤바뀐 실행도 거부해.

최종 보고에는 제품 두 SHA, 실제 GPU/OS/드라이버·브라우저, 전원·디스플레이 Hz, 전체 해시 manifest, 4쌍 각각의 지표, 화면·음악·사용자 흐름 결과와 남은 문제를 남겨. 회귀를 줄인 수정이 있다면 원래 후보와 수정 후보를 섞지 말고 새 커밋·새 측정으로 이어가. 원본 raw/PNG는 Git 제품 변경에 다시 수천 파일로 추가하지 말고 별도 결과 묶음으로 전달해.

## 5. 결과를 이 PR에 남기고 조건에 따라 완료해

사용자가 별도로 결과를 받아 다른 에이전트에 전달할 필요가 없게 **[PR #1](https://github.com/eddy961206/forest-philharmonic/pull/1)의 본문 또는 새 결과 댓글에 검증 결론을 남겨.** 최소한 아래 내용이 GitHub에서 서로 연결돼야 해.

| 기록 | 필요한 내용 |
|---|---|
| 고정 제품 | 기준 main SHA, 실제 측정한 후보 SHA, 수집기 SHA/manifest, 검증 시각 |
| 실제 환경 | OS·GPU·드라이버·브라우저, 해상도/DPR, 디스플레이 Hz·전원 조건 |
| 기능·음악 | Node/Python 결과, 자동 기능 8개 상태, 정상 앱의 화면·조작·청감 확인, 확인 못한 항목 |
| 성능 | 모든 ABBA pair 지표, 자동 판정, 개선·악화·불확실성을 모두 포함한 해석 |
| 추가 수정 | 무엇을 왜 바꿨는지, 전후 커밋, 회귀 확인과 새 측정 결과 |
| 최종 결론 | `MERGED`, `CONTINUE_FIXING`, `BLOCKED` 중 하나와 근거·다음 작업 |

**이득이 확인되고 필수 기능·화질·음악에 새 회귀가 없다면 측정한 후보를 병합해.** 병합 직전에 원격 main과 이 PR head를 다시 읽고, 검증한 두 SHA와 같은지 확인해. 새 커밋이 생겼다면 최신 제품을 고정해 필요한 비교를 다시 수행해. 기존 CI는 해당 후보의 결과인지 확인하고, GitGuardian처럼 `neutral/skipped`인 검사를 성공으로 세지 않아. 지원되는 GitHub 도구의 head SHA 조건을 사용하거나 동등한 확인을 거쳐 PR을 병합하고, 병합 커밋과 최종 main SHA를 결과에 남겨.

**이득이 없거나 악화·불확실성이 남으면 제안만 쓰고 끝내지 말고 원인을 분리해서 수정·재측정을 이어가.** 별도 작업 브랜치에서 한 가설씩 수정하고, 이 PR 브랜치에 이력을 보존하는 일반 push로 반영해. 그다음 새 후보 커밋·새 출력 폴더로 검증해. 원래 raw를 덮어쓰거나 기존 커밋 이력을 재작성하지 않아. 실행 환경이나 실제 권한 부족으로 더 진행할 수 없으면 `BLOCKED`로 남기고, 가능한 범위에서 확인한 사실과 정확한 다음 실행 절차를 PR에 기록해.

## 추가 최적화는 측정한 병목 순서로 진행해

1. **스피어 렌더 순서·proxy 분리:** 성능이 악화되면 별도 진단 브랜치에서 돔 renderOrder 변경만 이전 정책으로 돌린 버전, box proxy만 이전 구 proxy로 돌린 버전을 각각 비교해. 원래 후보와 화면·품질을 같게 유지해. 전체 프레임 삼각형의 약 0.22%만 줄였던 proxy 변경에 큰 FPS 이득을 가정하지 마.
2. **GPU 비용 분해:** 실제 GPU timer가 정상 지원될 때 세계 큐브맵·돔·그림자·후처리 비용을 분리해. 화면에 보이는 물체를 줄이거나 ray marching 품질을 낮추기 전에, 같은 결과를 중복 계산하는 패스부터 찾아.
3. **초기 준비와 청감:** 이번 house Worker·stereo compact를 적용한 제품에서도 느린 CPU의 cold 진입에 반복 long task와 늦은 음표 요청이 남는지 확인해. [오디오 재현 절차](AUDIO_PREPARATION_FOLLOWUP.md#4-같은-오디오-검사를-로컬에서-재현하기)로 전수 PCM과 실제 제품 실행을 함께 대조해. decode 동시성 제한은 아직 측정·채택하지 않았으므로 필요가 관측될 때 따로 비교하고, 음표·샘플·잔향 품질을 줄이지 않아.
4. **캐시의 실제 효과:** 이번 정지 카메라 계산 재사용·좌석 배열 공유가 프레임 CPU와 보유 메모리에 어떤 영향을 주는지 비교해. GC 시점의 단일 heap 차이를 누수 해소나 VRAM 절감으로 부르지 않아.
5. **자동 화질 회복:** 고정 high 결과와 분리해서 부하 상승→안정화→회복을 관찰해. 경계에서 실제 pixelRatio가 단조롭게 내려가는지, 회복이 진동하지 않는지, 장시간 청감이 유지되는지가 기준이야.
