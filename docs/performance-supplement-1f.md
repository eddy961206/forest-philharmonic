# 추가 역순 비교와 실제 3D 회전·전환 검사

이 문서는 [PC 재현 가이드](performance-reproduce-1f.md)의 보완 절차야. 제품 기준선은 `1f8e5f16f1eee03140e13ba1ee66832841559604`, 후보는 `dea7997c6278f10ff467815ab96b370362549b0c`로 유지해. 최초 계획이나 완료 원본을 고치지 않고 별도 계획·출력 폴더·label을 추가했어. 이 문서에 명령이 있다는 사실 자체가 해당 검사의 실행·통과를 뜻하지 않아. 실제 결과와 미완료 범위는 최종 보고서 및 각 실행 JSON을 확인해.

## 왜 추가했는지

첫 desktop low와 mobile high 비교에는 빨라진 장면과 느려진 장면이 함께 있었어. 실행 순서나 일시적인 부하가 영향을 주었는지 확인하기 위해 후보 B를 먼저, 기준 A를 나중에 실행하는 반복을 추가했어. 첫 결과를 대체하거나 유리한 장면만 골라 반복하지 않아.

| 계획 | 추가 범위 | 출력 폴더 |
|---|---|---|
| `low-reverse-plan.json` | 두 공연장 desktop low, 각각 원래의 모든 장면, B→A 4실행 | `fixed-low-reverse` |
| `mobile-reverse-plan.json` | 두 공연장 mobile high·low, 각각 원래의 모든 장면, B→A 8실행 | `fixed-mobile-reverse` |
| `dome-motion-plan.json` | Sphere full desktop high·medium 각각 A→B, 4실행 | `dome-motion` |

기존 high desktop 역순 4실행은 원래 `render-plan.json`에 이미 포함돼 있어. medium은 독립 실행 한 쌍만 있으므로 모든 프리셋을 두 번씩 반복했다고 표현하지 않아. 같은 실행에서 수집한 8프레임도 독립 실행 8회가 아니야.

추가 계획은 [supplementary-plans](performance-data/main-1f/supplementary-plans/)에 있어. 기존 가이드의 서버·의존성·폰트·환경 설정을 그대로 사용하되, 새 도구는 이 PR 브랜치의 커밋에서 별도 worktree로 받아. 원래 가이드가 고정한 `cc0f9da`에는 새 `dome-motion.mjs`가 없어. 사용한 전체 commit SHA와 도구 SHA를 실제 PC 기록에 남겨.

```bash
git fetch origin perf/261021-venue-rendering
git worktree add --detach ../forest-motion-tools origin/perf/261021-venue-rendering
cd ../forest-motion-tools
git rev-parse HEAD
sha256sum tools/bench/dome-motion.mjs tools/bench/full-frame.mjs tools/bench/full-frame-fixture.js tools/bench/browser.mjs
```

Windows PowerShell에서는 같은 `git` 명령으로 worktree를 만들고, 마지막 명령 대신 다음을 사용해.

```powershell
Get-FileHash tools/bench/dome-motion.mjs, tools/bench/full-frame.mjs, tools/bench/full-frame-fixture.js, tools/bench/browser.mjs -Algorithm SHA256
```

원래 full-frame 수집기·fixture·browser helper는 새 3D 검사 때문에 수정하지 않았어. 계획과 기록된 SHA를 대조한 뒤 기존 가이드의 환경변수를 설정해. 실제 GPU로 측정할 때는 가이드의 안내대로 SwiftShader 강제 옵션을 제거하고 실제 renderer 문자열을 저장해.

## 원래 장면의 역순 반복

`run-plan.py`는 브라우저 환경변수를 상속해. 아래 명령은 새 tools worktree에서 순서대로 실행해. 출력 폴더에 같은 log가 이미 있으면 덮어쓰기를 거부하므로 재검사에는 새 폴더를 써.

```bash
python3 tools/bench/run-plan.py docs/performance-data/main-1f/supplementary-plans/low-reverse-plan.json --output ../results/low-reverse-r1 --continue-on-failure
python3 tools/bench/run-plan.py docs/performance-data/main-1f/supplementary-plans/mobile-reverse-plan.json --output ../results/mobile-reverse-r1 --continue-on-failure
```

Windows에서는 Python 설치 방식에 따라 `python3`를 `python`으로 바꿔. 각 계획의 URL은 원래 가이드와 같은 localhost 18083/18084이고 제품 revision도 고정돼 있어. 다른 포트를 쓰면 **새 계획 사본**을 만들고 그 파일의 해시를 기록해. 실제 앱 코드나 완료 원본에 측정 편의를 위한 수정을 하지 않아.

원래 비교와 같은 `MODE=sync`, 4 warmup, 8표본, 동일 카메라·장면·화질·DPR을 사용해. 측정값은 `frame()+readPixels` 동기 완료 ms야. 역수를 FPS로 쓰면 안 돼. mobile은 UA·viewport·touch 에뮬레이션이고 원래 Lite 경로를 그대로 사용해. 해당 결과를 실물 휴대폰이나 full 3D 세계의 성능으로 분류하지 않아.

집계에는 새 폴더와 같은 plan을 넘기고, manifest는 원래 제품 쌍의 파일을 사용해.

```bash
node tools/bench/collect-plan.mjs --plan docs/performance-data/main-1f/supplementary-plans/low-reverse-plan.json --root ../results/low-reverse-r1 --manifest docs/performance-data/main-1f/source-manifest.json --output ../results/low-reverse-summary-r1
node tools/bench/collect-plan.mjs --plan docs/performance-data/main-1f/supplementary-plans/mobile-reverse-plan.json --root ../results/mobile-reverse-r1 --manifest docs/performance-data/main-1f/source-manifest.json --output ../results/mobile-reverse-summary-r1
```

## 실제 3D 세계의 움직임과 전환

원래 Sphere `rotate` fixture는 ARCH 장면이야. 실시간 3D 세계를 빠르게 돌려 본 증거로 쓰지 않기 위해 별도 `dome-motion.mjs`를 추가했어. 이 도구는 기존 full-frame fixture를 그대로 main 응답 뒤에 붙이고, 별도 suffix로 입력과 관측만 추가해. 서버 파일과 제품 파일은 수정하지 않아.

| 검사 | 입력·관측 |
|---|---|
| 빠른 회전 | FOREST3D에서 기존 `benchRotate` 경로, 28개의 1/60초 step, yaw 0~360도 |
| reveal | ARCH→FOREST3D, 4초 전환의 0·25·50·75·100% 시각 |
| crossfade | FOREST3D→PEAKS3D, 같은 다섯 시각 |
| 시간적 재사용 | 각 전환 시각에 고정된 입력으로 4회 렌더하고 첫 pass부터 전부 보존 |
| 큐브 관측 | face·target 객체 ID·texture UUID·world·시각·정상 반환한 render 갱신 요청 |
| 상태 복원 | 실제로 사용한 target·face·mip·XR·viewport·scissor 및 임시 hook 복원 |
| 준비 상태 | main camera의 실제 dome base/overlay draw 관측과 program ready/link 상태 |
| 이미지 | 회전 5장, reveal 5장, crossfade 5장, 실행당 최대 15 PNG |

medium의 매 2프레임 갱신과 두 world slot 교대 때문에, 시각을 1초씩 건너뛰며 단 한 프레임만 그리면 인위적으로 1초 전 슬롯을 보게 될 수 있어. 그래서 각 checkpoint에서 네 번 그려. 첫 pass를 숨기지 않고 모두 기록하고 마지막 PNG를 저장해. 이것은 **4초 연속 재생을 관찰한 결과가 아니야.** 실제 rAF 속도, 네트워크, 오디오 타이밍, 연속 전환의 청감·시각적 매끄러움도 이 도구의 판정 대상이 아니야.

Node에서 요청 품질·수동 설정·renderScale 1·예상 pixelRatio·큐브 크기를 독립적으로 정하고 meta·warmup·각 표본과 대조해. 실제 품질 변수를 그대로 기대값으로 삼아 서로 일치한다고 판정하지 않아. high/medium의 기본 desktop viewport는 640×360/DPR 1이며, 실제 PC에서 다른 값을 쓰면 두 버전에 똑같이 적용하고 기록해.

```bash
python3 tools/bench/run-plan.py docs/performance-data/main-1f/supplementary-plans/dome-motion-plan.json --output ../results/dome-motion-r1
```

처음에는 `--continue-on-failure` 없이 실행해. 실패한 raw·log·PNG를 보존하고 원인을 확인한 뒤, 원래 계획의 다음 index부터 `--start`로 계속하거나 새 폴더에서 새 label로 재검사해. 특히 `browserClose.status=FAIL`이면 프로세스 종료가 확인되지 않은 상태이므로 다른 브라우저 측정을 바로 시작하지 않아. `TIMEOUT_MS`는 준비·개별 page evaluate 등의 상한이고 전체 suite의 실행 시간 상한은 아니야. close에는 별도 최대 10초 상한이 있고 실패 상태를 먼저 디스크에 남겨.

개별 실행은 다음처럼 사용할 수 있어. 의존성·폰트·브라우저 환경변수는 원래 가이드 설정을 유지해.

```bash
OUTPUT_DIR=../results/motion-high-r2 BASE_URL=http://127.0.0.1:18083/ REVISION=1f8e5f16f1eee03140e13ba1ee66832841559604 node tools/bench/dome-motion.mjs baseline-motion-r2 high
OUTPUT_DIR=../results/motion-high-r2 BASE_URL=http://127.0.0.1:18084/ REVISION=dea7997c6278f10ff467815ab96b370362549b0c node tools/bench/dome-motion.mjs candidate-motion-r2 high
```

이 도구의 `completeMs`에는 상태 조회와 renderer probe 비용이 포함돼. **성능 개선율·FPS 표에 합치지 않아.** 면 검사도 제품과 같은 11×9 추정 규칙에 대한 갱신 요청 관측이야. `renderer.render()`가 정상 반환했다는 것만으로 실제 world proxy draw·program 준비·큐브 픽셀 신선도·가시 픽셀 범위·face mask 최소성을 증명하지 않아. 이를 보완하는 PNG 비교와 직접 관찰은 따로 기록해.

## 3D 진단 원본의 파일 검증

네 실행이 닫힌 뒤 다음 비교기를 실행해. 브라우저나 이미지 디코더를 실행하지 않고, 계획·로그·수집기·HTTP 소스 해시와 요청 품질, 카메라·음악·돔 시각, 28/20/20 표본, 실제 관측한 렌더 상태 복원을 대조해. 큐브 타깃 ID는 한 실행 안의 슬롯 관계를 확인하는 값이므로 서로 다른 브라우저의 UUID 문자열이 같아야 한다고 요구하지 않아.

```bash
python3 tools/bench/compare-dome-motion.py --plan docs/performance-data/main-1f/supplementary-plans/dome-motion-plan.json --root ../results/dome-motion-r1 --manifest docs/performance-data/main-1f/supplementary-plans/dome-motion-source-manifest.json --output ../results/dome-motion-summary-r1
```

manifest는 **새 51파일 버전**을 명시해. 기존 49파일 manifest에는 이 진단이 추가 관측하는 Three.js core/module 경로가 없어. 비교기는 실제 HTTP 관측이 기록된 15개 경로만 직접 검증해. 51개 파일 전부를 브라우저에서 확인했다고 표현하지 않아.

출력은 `summary.json`, `summary.md`, `image-pairs.json`이야. 마지막 파일에는 high와 medium 각각 15개 PNG 쌍의 경로·해시·입력 조건이 들어 있어. 종료 코드는 0=기록된 조건 검증 PASS, 1=FAIL, 2=누락·진행 중·부분 기록 INCOMPLETE야. 출력 폴더가 이미 존재하면 덮어쓰지 않아. 도구 해시가 다른 경우 임의로 검증을 풀지 말고 수집에 쓴 도구 버전을 별도 worktree에서 준비해.

비교기가 PASS여도 큐브 내부 program·픽셀의 신선도나 영상 품질이 입증되는 것은 아니야. 시간 계측값은 이 도구에서도 집계하지 않으며, 실제 연속 전환과 오디오 동기화는 별도 검사가 필요해.

## 이미지 비교와 원본 해석

PNG는 각 label·품질·회전 index·전환 종류·비율이 같은 파일끼리 비교해. 서로 다른 품질이나 다른 pass를 섞지 않아. 기존 `compare-images.py`에 두 PNG를 넘겨 SSIM·MAE·변경 픽셀 수를 구하고, 실제 장면을 함께 열어 검은 면·이음새·geometry 손실·그림자·자막 차이를 확인해. 전체 변화율 하나만으로 시각 품질 PASS를 선언하지 않아.

이름이 같은 기존 JSON·PNG는 덮어쓰지 않아. `sourceHashes`와 `sourceHashesAfter`, `toolSources`와 `toolSourcesAfter`, 실행 log의 collector SHA·plan SHA를 대조해. suite PASS는 수집기가 명시한 조건을 통과했다는 뜻이고, 위에서 미측정으로 구분한 항목까지 통과했다는 뜻은 아니야.
