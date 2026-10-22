# 로컬 AI 인계: 실제 화면·GPU 비교 후 병합 판단

대상은 `perf/261021-venue-rendering`이야. 이번 원격 작업은 이 브랜치까지 수정·push하고 끝내. **이 문서는 main 병합을 실행하는 스크립트가 아니야. 로컬에서 실제 화면과 성능을 확인한 뒤 별도로 판단해.**

[이번 수정·검증 기록](MERGE_PREPARATION.md)에 확인한 CPU·배열 절감, Sphere 원인 분리의 네 조건, 아직 측정하지 않은 오디오·로딩 최적화 후보와 검증 조건을 적었어.

## 이번 수정과 아직 확인할 점

- `npm test`는 `tests/`의 제품·도구 회귀 파일을 명시적으로 실행해. 보존 디렉터리의 옛 `.test.mjs`까지 자동 발견하던 검색 범위를 고쳤고 Windows 셸 glob에도 의존하지 않아.
- 자동 화질의 medium→low 경계에서 실제 픽셀 비율이 오히려 올라가던 경로를 고쳤어. 내려가는 화질 단계에서 픽셀 작업량이 증가하지 않는지 확인해.
- 스피어의 정지 카메라는 같은 시야의 큐브 면 마스크 계산을 재사용해. 카메라 이동·회전·투영 변경은 다시 계산하고 세계 텍스처 갱신은 계속해.
- 좌석의 near/far/picking이 같은 instance 행렬을 공유하도록 중복 배열을 줄였어. 이는 typed array 보유량 변화이며 실측 heap·VRAM 절감 수치로 바꾸어 말하지 않아.
- 원시 측정 자료는 이전 `ed3a5db17a53cd84b75e33a25352831f148f9431` 커밋에서 보존해. [보존 안내](PERFORMANCE_ARCHIVE.md)를 참고해. 아래 도구는 그 자료를 복원하지 않아도 실행돼.
- **기존 스피어의 돔 renderOrder·box proxy 성능은 실제 GPU에서 아직 확정하지 못했어.** 옛 SwiftShader 비교에서는 wide·forest가 두 순서에서 모두 느려졌어. 이번 수정으로 자동 해결됐다고 가정하지 마.

## 1. 고정된 두 제품과 같은 수집기를 준비해

기존 작업 폴더에 미커밋 변경이 있으면 건드리지 말고 별도 clone을 써. Node 22 이상, Python 3.10 이상, Git이 필요해. 먼저 브랜치 최신 커밋과 `origin/main`을 확인하고 `npm test`를 실행해. 아래 기본 baseline은 이전 비교의 `e741811d1d7a040afcdd3a8230465980c64f82fc`야. 다른 main과 비교한다면 준비 명령에 `--baseline-ref origin/main`을 명시해. 준비기는 refs를 전체 SHA로 고정하고 같은 Git 객체의 바이트로 별도 worktree 두 개를 만들어.

저장소 루트에서 공통 준비:

```sh
git fetch origin
git log -1 --format=fuller
npm test
npm install --prefix ../forest-bench-tools playwright@1.62.1
node ../forest-bench-tools/node_modules/playwright/cli.js install chromium
```

**Bash/macOS/Linux:**

```bash
python3 tools/bench/prepare-merge-check.py --candidate-ref HEAD --output ../forest-merge-check-001 --playwright ../forest-bench-tools/node_modules/playwright
```

**Windows PowerShell:**

```powershell
py -3 tools/bench/prepare-merge-check.py --candidate-ref HEAD --output ../forest-merge-check-001 --playwright ../forest-bench-tools/node_modules/playwright
if ($LASTEXITCODE -ne 0) { throw '계획 준비 실패: 새 폴더로 원인을 고친 뒤 다시 준비해' }
```

현재 도구가 후보 커밋에 없거나 수정된 상태면 준비가 실패해. 원격에서 받은 커밋 그대로 시작하고, 로컬에서 제품을 추가 수정했다면 새 후보 커밋·새 출력 폴더로 비교해. 기존 출력은 덮어쓰지 않아. 원본 worktree와 다른 CRLF 바이트도 거부하므로 도구는 새 worktree를 만들 때만 `core.autocrlf=false`를 적용해.

기존 Chrome/Edge로 확인하려면 준비 명령에 `--chrome "실제 실행 파일 경로"`를 추가해. 기본은 별도 Playwright Chromium의 **화면이 보이는 창**이야. 개인 브라우저 프로필은 사용하지 않아. 렌더러 문자열이 SwiftShader·llvmpipe·WARP 등 소프트웨어이거나 GPU 종류를 확인할 수 없으면 FAIL로 남겨. 이 검사를 꺼서 통과 처리하지 말고 GPU 가속·드라이버·원격 데스크톱 조건을 먼저 확인해.

## 2. 서버 두 개를 열고 실제 사용자 흐름을 먼저 봐

각각 **다른 터미널**, 원래 저장소 루트에서 실행해.

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

## 추가 최적화는 측정한 병목 순서로 진행해

1. **스피어 렌더 순서·proxy 분리:** 성능이 악화되면 별도 진단 브랜치에서 돔 renderOrder 변경만 이전 정책으로 돌린 버전, box proxy만 이전 구 proxy로 돌린 버전을 각각 비교해. 원래 후보와 화면·품질을 같게 유지해. 전체 프레임 삼각형의 약 0.22%만 줄였던 proxy 변경에 큰 FPS 이득을 가정하지 마.
2. **GPU 비용 분해:** 실제 GPU timer가 정상 지원될 때 세계 큐브맵·돔·그림자·후처리 비용을 분리해. 화면에 보이는 물체를 줄이거나 ray marching 품질을 낮추기 전에, 같은 결과를 중복 계산하는 패스부터 찾아.
3. **초기 준비와 청감:** 관객 생성·샘플 decode·박수 준비의 long task와 늦은 음표 요청이 함께 생기는지 확인해. 효과가 큰 작업의 실행 위치/시점을 바꾸되 음표·샘플·잔향 품질을 줄이지 않아.
4. **캐시의 실제 효과:** 이번 정지 카메라 계산 재사용·좌석 배열 공유가 프레임 CPU와 보유 메모리에 어떤 영향을 주는지 비교해. GC 시점의 단일 heap 차이를 누수 해소나 VRAM 절감으로 부르지 않아.
5. **자동 화질 회복:** 고정 high 결과와 분리해서 부하 상승→안정화→회복을 관찰해. 경계에서 실제 pixelRatio가 단조롭게 내려가는지, 회복이 진동하지 않는지, 장시간 청감이 유지되는지가 기준이야.
