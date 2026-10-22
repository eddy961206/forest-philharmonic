# 최신 main 음향 보존 및 유지음 관찰기 검증

대상은 main `e741811d1d7a040afcdd3a8230465980c64f82fc`와 제품 후보 `6c7817218814f00631089eb2c6f150d68190980f`야. 이 기록을 만드는 동안 제품 파일은 변경하지 않았고 브라우저를 실행하지 않았어.

## 실제 발견한 수집기 문제

최신 main의 `Performance._resumeHeld(pos)`는 탐색·재개 시 이미 시작한 음을 `skip = pos - on`, `dur = on + originalDur - pos`로 다시 요청해. 이 호출은 신규 음표의 `schedIdx`를 증가시키지 않아. 이전 `audio-resume.mjs`는 모든 `playNote` 요청을 `schedIdx - 1`의 신규 음표로 간주했고 원래 duration과 같아야 한다고 검사했어. 그래서 최신 main과 후보 모두 정상적인 유지음을 음표 불일치 또는 인덱스 반복으로 판정할 수 있었어.

이 실패는 `AudioContext.currentTime`이 실제로 멈추는 문제와 달라. 유지음 관찰기를 고쳐도 원래 **2초 안에 running && playing && time > seekTime + 0.05** 판정은 바꾸지 않았어. 그 판정부터 기존 FAIL 분류까지의 소스 구간이 수정 전후 byte-for-byte 같다는 해시 증거를 `source-comparison.json`에 남겼어.

## 관찰기 수정과 실패 보존

`tools/bench/audio-note-audit.mjs`는 `_schedule`, `_resumeHeld`, `playNote`의 원래 인자·수신 객체·반환값·예외를 보존하며 호출 출처만 기록해. 다음 항목을 별도로 검사해.

- 신규 예약음: 원래 악보 이벤트와 section/inst/midi/dur/gain/layer/skip의 일치, 소비한 인덱스와 실제 요청의 일치, 호출 전후 `schedIdx` 증가량과 요청 수의 일치, 같은 곡·transport 구간 내 연속 인덱스.
- 유지음: 원래 악보에서 도출한 기대 목록, 원래 인덱스, skip, 남은 duration, 시작 시각, velocity, gain/layer, 요청 수, 누락·추가·순서 변경. 유지음 호출이 존재하지만 요청을 전혀 내지 않는 경우도 기대 목록과 비교해 실패해.
- 원래 음표 호출의 예외, 관찰기 내부 오류, 관찰 개수와 원문 개수 불일치, 재생 중 출처를 설명할 수 없는 요청도 별도 실패로 남겨.

`observation.notes`에 실제 값·기대값·원래 악보 이벤트·불일치 필드를 모두 남겨. `observation.noteAudit`에는 유지음 호출별 기대 인덱스와 관찰 수·누락/추가 수 및 신규 예약음 개수 오류를 남겨. 구형 `_resumeHeld` 미지원은 `held.supported=false`로 표시하므로 유지음을 검증했다고 해석하지 않아. 프레임 수, 오디오 시계, RNG, seek 위치, 제품 스케줄러의 lookahead와 타이머는 바꾸지 않았어.

## 실제 실행 결과와 재현

저장된 `audio-note-audit.stdout.log`는 신규 Node 검사 **7개 통과**, `performance.stdout.log`는 기존 Performance 검사 **6개 통과**한 원문이야. 각 `.run.json`에 실행 명령과 작업 디렉터리, 종료 코드가 있어. `audio-resume-help.stdout.log`는 최신 실행기 사용법이며 `--help`는 브라우저를 띄우지 않아.

```sh
cd /workspace/scratch/25707ad85ea4/forest-philharmonic
node tests/audio-note-audit.test.mjs
node tests/performance.test.mjs
node tools/bench/audio-resume.mjs --help
python3 /workspace/scratch/25707ad85ea4/verification/tool-compat-e741/held-note-audit/verify-source.py
```

신규 검사에는 실제 `Performance` 클래스를 같은 RNG·pause·seek·재개·hidden 전환·낮은 빈도 애니메이션으로 실행해서 관찰 전후 전체 음표 요청과 stop 호출 및 마지막 transport 상태가 정확히 같음을 확인하는 항목이 있어. 잘못된 skip/dur/midi/gain/when/velocity, 유지음 누락·추가·중복·재정렬, 신규 음표 인덱스만 소비하고 요청하지 않는 오류, 원래 예외 및 관찰기 자체 예외를 의도적으로 주입해서 검사 실패가 남는지도 확인했어. 실제 브라우저 직렬 실행은 별도 결과로 판단해야 해.

## 독립 소스 비교

저장한 제품 원문 6개와 `verify-source.py`로 아래 **7개 구간이 main과 후보에서 정확히 같은 문자열**임을 재확인할 수 있어.

| 구간 | 확인한 의미 |
|---|---|
| crowd.js 전체 | 최신 close/wash 박수·웅성거림 합성 알고리즘 보존 |
| Performance의 visuals 이전 전체 | 음악 로딩·shape/level·play/pause/seek·유지음·타이머 예약 로직 보존 |
| 악기 family/envelope·room 상수 | 음색 envelope와 공연장 설정 보존 |
| AudioContext 생성부터 init 오디오 그래프 | 같은 Lite/desktop 조건에서 샘플레이트·EQ·compressor·limiter·공간 잔향 경로 보존 |
| 샘플 로딩/디코딩/선택 | 원래 샘플 전송·디코딩·nearest 선택 정책 보존 |
| timer부터 voices·sustain·stop·chime | native currentTime, 25ms worker tick, 발음·sustain·release 정책 보존 |
| applause 재생 이후 전체 | 박수 재생 믹스·house murmur·잔향 impulse 생성 보존 |

실제 후보 차이는 정지 listener의 동일 automation 생략, 위치·회전·이동 음원 변화에 맞는 공간 파라미터 갱신, 박수 합성의 Worker 이동과 입장 전 준비 대기, 연주 시각화의 배열 할당 제거야. main의 최신 음색·앙상블 spread·유지음 재개를 이전 버전으로 되돌리지 않았어. 곡 JSON·악기 샘플·layout·Sphere acoustics 파일은 이 두 제품 commit 간 변경 목록에 없었어.

코드가 같은 것은 기능 보존 근거이며 물리적인 음질 보증은 아니야. timer Worker의 메시지는 결국 메인 스레드에서 처리하므로 무거운 렌더가 메인 스레드를 막으면 예약이 늦을 수 있어. 원래 visible 0.4초·hidden 3초 lookahead는 같지만 하드웨어에서의 실제 예약 지연과 출력 안정성은 따로 측정해야 해.

## 기존 실패와 후보 회귀를 구분하는 기준

과거 저장된 `runtime-6a-checkpoint`의 controlled Hall desktop 결과는 baseline `6a59c33`과 후보 `06c8ac5` 모두 pause **이전** 약 0.4초 관찰에서 `AudioContext.state='running'`, worker tick 16회 증가, `currentTime` 증가 0을 기록했어. baseline은 원래 2초 재개 조건도 실패했고, 후보는 재개 조건은 통과했지만 pre-pause 실패 때문에 전체 FAIL이었어. 이후 native RAF/READBACK=0 별도 조건의 Hall·Sphere 양쪽 두 제품 4회는 PASS였고 30초 관찰에서 오디오 시계가 진행했어. 이들은 과거 제품의 결과이며 e741/6c 측정값으로 재사용하면 안 돼.

새 브라우저 결과에서는 먼저 원본 제품·도구 helper 해시와 조건을 맞춰야 해. `prePauseAudioClockAdvanced=false`라면 pause/seek를 최초 원인으로 단정할 수 없어. tick도 늦으면 메인 스레드 예약 전달 지연 근거이고, tick은 정상인데 running currentTime만 멈추면 native audio clock 정체를 관찰한 것이야. 어느 경우든 그래프·브라우저·장치·GPU 중 원인은 아직 확정할 수 없어. baseline과 후보에 같은 실패가 반복되면 기존 조건의 문제로 분류하고, 후보에만 반복되는 실패는 후보 회귀 가능성으로 남겨. 다음 프레임 뒤 시계가 움직여도 원래 2초 실패는 그대로 유지해야 해.

## 최종 보고에서 남겨야 할 미측정 항목

- 실제 스피커/헤드폰 출력 캡처, 청음 AB 비교, 청각적 glitch·clip·잔향·밸런스 평가는 하지 않았어.
- 실제 오디오 장치 underrun과 출력 드롭, 모든 AudioNode/BufferSource 수, 오디오 렌더 스레드 CPU, 그래프별 CPU·메모리 피크는 측정하지 않았어. `engine.voices`는 논리적 voice 객체 수이며 AudioNode 수가 아니야.
- 박수 PCM 일치 검사는 합성 버퍼 보존을 검증하지만 최종 장치 출력 또는 HRTF/리샘플링까지 같음을 증명하지 않아.
- 30초 이하 관찰이나 Node mock clock은 장시간 감상·발열·배터리·메모리 누수 안정성의 증거가 아니야.
- 실제 iPhone/iPad Safari, Android 기기, 노트북의 오디오 장치·백그라운드 정책·절전 동작은 별도 실측이 필요해. Chromium viewport/touch 에뮬레이션을 실제 모바일 측정으로 표시하면 안 돼.
