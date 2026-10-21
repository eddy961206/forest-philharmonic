# 새 저녁 기능의 통합 UI 검사

`rituals.mjs`는 `3f1655b0c035a630adbcfbf19582dd9363386f34` 원본과 그 위에 최적화를 통합한 후보에서 같은 입력을 실행하는 추가 기능 검사야. a41 제품·측정 도구·원시 결과는 바꾸지 않아. **작성 단계에서는 브라우저를 실행하지 않았어. Node 문법과 `--help`만 확인했으며, 아래 항목의 제품 PASS를 주장하지 않아.**

다른 GPU·오디오·로딩 측정이 모두 끝난 뒤 직렬로 실행해. 원본과 후보는 각각 별도의 새 브라우저 문맥으로 부팅하고, **처음부터 수동 low**를 저장해. 관객·음악·조명·무대 효과를 끄지 않아. low 부팅에 따른 앱의 원래 경량 경로는 양쪽에 같은 조건으로 적용돼. 실행 중 `phase`, `perf.time`, 음악 스케줄, 오디오 시계, 의식 타이머를 덮어쓰지 않아.

## 실행

```bash
node qa-3f/rituals.mjs --help
```

Playwright와 Chrome은 기존 개발용 설치를 사용해. `PLAYWRIGHT_MODULE`, `CHROME_EXECUTABLE`, `CHROME_ARGS`, `SOFTWARE_RENDERER`, `FONT_MODE`, `FONT_ROOT`는 다른 직렬 QA와 같은 환경을 전달하면 돼. 이 스크립트 자체는 라이브러리를 설치하지 않아.

현재 작업 공간에서는 `forest-philharmonic/tools/bench/browser.mjs`를 공용 브라우저 헬퍼로 읽어. 다른 위치에서는 `BENCH_HELPER_ROOT`를 지정하면 돼. 나중에 `tools/bench`로 보관하면 같은 디렉터리의 `browser.mjs`를 우선 찾아. 원본 a41 도구를 수정하거나 새 하네스를 기존 고정된 `bench-source`에 덮어쓰지 않아.

```bash
BASE_URL=http://127.0.0.1:8084 \
REVISION=3f1655b0c035a630adbcfbf19582dd9363386f34 \
LABEL=rituals-baseline OUTPUT_DIR=qa-3f/ritual-results \
node qa-3f/rituals.mjs hall desktop

BASE_URL=http://127.0.0.1:8085 \
REVISION=3f-integrated-candidate \
LABEL=rituals-after OUTPUT_DIR=qa-3f/ritual-results \
node qa-3f/rituals.mjs hall desktop
```

위 `REVISION`은 실행자가 붙이는 식별자야. 각 결과는 실제 HTTP로 응답한 `main.js`의 SHA256을 따로 저장하고, 끝날 때 같은 바이트인지 다시 확인해. `EXPECTED_MAIN_SHA256`을 지정하면 시작할 때 기대한 소스와 다른 서버를 바로 거부해. 현재 서버 포트는 원본 8084, 통합본 8085이며, 다른 환경에서는 실제 서버 주소를 지정해.

인자를 생략하면 Hall/Sphere × desktop/mobile 네 조합을 순서대로 실행해. 기본 화면은 desktop 960×540 DPR1, mobile 390×844 DPR2야. 좁은 재검사는 같은 프로그램에서 `SCENARIO=foyer`, `recital`, `interval`, `sleep` 중 하나를 선택하면 돼. 재검사는 다른 `LABEL` 또는 `OUTPUT_DIR`에 저장해. 이미 있는 case 폴더와 summary는 덮어쓰지 않아.

## 입력과 fixture의 경계

| 묶음 | 실제 입력으로 검사하는 부분 | 대기를 줄이는 명시적 fixture |
|---|---|---|
| Hall 로비 | 문 반대 방향에서 마우스/터치로 문을 향해 회전, 원래 좌석에 E/터치로 착석 | `director.placeAt`으로 로비와 실제 빈 좌석 근처까지 이동해. 조작 후 `seatGroup`·관객 부모의 false→true 복귀를 확인해. Sphere는 `NOT_APPLICABLE`이야. |
| 독주 무대석 | 피아노 독주 프로그램 버튼, 무대석 버튼, E/걷기 버튼, 악보 넘김이 버튼, 비독주 프로그램 버튼 | 기존 카메라 tween을 `director.update(2.5)`로 마쳐. 프로그램 선택 전 지휘자의 이동만 snap하고, 기존 좌석 객체·인덱스와 독주 종료 후 일반석 복귀를 확인해. |
| 인터미션 | 실제 2분 설정, 도토리차, 숲속 소식·닫기, 2부 시작 | `intervalNow(120)`으로 휴식 경계에 도달하고 단원 퇴장을 snap해. Hall은 로비의 첼리스트, Sphere는 자기 자리의 첼리스트가 실제 `practice`를 시작하는지 확인해. 2부의 원래 `hush`를 기다려. |
| 수면·깨우기 | 실제 15분 예약·취소, 실제 키·마우스/터치로 깨우기 | 취소 후 `goToSleep()`으로 수면 경계만 시작해. 예약이 남아 있으면 제품 함수가 진입을 거부하므로, 성공한 수면 진입도 취소의 별도 근거가 돼. |

실제 시작 버튼으로 첫 공연의 `hush`를 통과하고, 인터미션 뒤에도 원래 단계 전환을 기다려. 입퇴장 중 `queued`·`walking` 단원을 `snapRoster`/`snapConductor`로 목적지에 놓을 뿐, 하네스가 `playing` 상태를 직접 만들지 않아. 긴 화면 조작 중 짧은 곡이 끝나는 일을 피하려고 실제 일시정지 버튼을 눌러 멈춰 둬. 이 도구는 별도 transport·PCM 검사나 자연적인 입퇴장 경로 검사를 대체하지 않아.

## 프레임 예약 관찰

메인 `frame`의 예약 요청은 각각 고유 ID로 보류돼. `cancelAnimationFrame`에 전달된 ID는 큐에서 제거하고 다시 실행하지 않아. 명시적 화면 검사에서는 그 시점에 예약된 콜백을 먼저 큐에서 소진한 뒤 원래 함수를 실행해. 원래 예약을 남겨 놓은 채 함수를 직접 호출해 중복 체인을 만드는 방식은 쓰지 않아. UI 진행 막대의 `draw`는 실제 native rAF로 계속 실행하고 요청·취소·전달만 관찰해.

두 수면 순서를 구분해서 기록해.

1. **일반 수면:** 수면 직전 예약이 남아 있으면 한 번 전달해서 제품의 `asleep` 검사에서 반환하게 해. 메인 렌더·UI draw·AudioContext 시계가 멈춘 것을 확인하고 실제 입력으로 깨워.
2. **빠른 깨우기의 명시적 예약 순서:** 수면 직전 메인 예약을 아직 전달하지 않은 상태를 유지한 채 실제 깨우기 입력을 보내. 이때 120ms 대기와 스크린샷 동안에도 메인 예약을 의도적으로 보류해. 자연적인 레이스 발생 시간이나 빈도를 재는 실험은 아니고, 가능한 입력·콜백 순서를 고정한 기능 검사야.

각 깨우기 후에는 메인 콜백 네 개를 실제 native rAF로 전달해. 콜백 timestamp 중복, 최대 동시 pending 수, 실제 main render 수, UI draw 예약 수, WebGL 오류를 원시 값으로 남겨. 결과의 시간값을 FPS로 바꾸지 않아. 네 프레임 관찰은 모든 visibility·수면·wake 경쟁을 전부 검증했다는 뜻도 아니야. 이 짧은 창 밖의 lifecycle 경쟁은 `unchecked`에 남겨.

수면 중 AudioContext가 `suspended`가 되는지, 실제 깨우기 후 `running`으로 돌아와 `currentTime`이 0.02초 이상 진전하는지는 각각 2초 제한으로 확인해. 실패하면 오디오 상태·시각·마지막 UI 상태와 오류를 남기고 PASS로 바꾸지 않아. 실제 15분 만료, 마지막 30초 fade, 9초 퇴장, 실제 들리는 품질·지연·발열은 이 경계 검사에 포함되지 않아.

## 알려진 상류 표시 문제와 실패 처리

정적 소스에서 상류 3f의 수면 예약 표시 문제를 확인했어. 버튼은 15분을 선택하지만 main의 sleep 처리기가 `ui.setSleepLeft(0)`를 호출하면서 선택 표시를 다시 ‘끄지 않음’으로 바꿔. 실제 예약은 남아서 다음 타이머 tick에는 카운트다운이 나오는 구조야.

이 표시 검사는 기대값을 낮추지 않고 `known-upstream-sleep-selection-display` 분류의 **FAIL**로 남겨. 표시 실패 뒤에도 실제 카운트다운·취소·수면·깨우기 검사는 계속할 수 있지만, 전체 결과는 FAIL이야. 이 문서는 아직 그 실패를 브라우저로 재현했다는 주장이 아니며, 원본·후보 양쪽의 실제 결과로 확인해야 해.

빠른 깨우기의 예약 취소·중복 여부도 실패를 보존한 채 native 전달 증거까지 수집해. 나머지 필수 전제가 깨져 검사를 계속할 수 없으면 즉시 실패하고, 도달하지 못한 묶음은 `NOT_RUN`으로 남겨. WebGL 또는 브라우저가 막히면 상태·스크린샷을 얻지 못했다는 이유도 기록해.

## 결과 파일

각 `${LABEL}-${venue}-${device}` 폴더에 다음 파일이 생겨.

- `result.json`: 소스 hash·환경·입력 결과·실행한 fixture·상태·그룹별 PASS/FAIL/NOT_RUN·범위 밖 항목.
- `raw.json`: 실제 메인 예약/취소/전달, UI draw 계수, 의식 단계 변화, visibility·WebGL context-loss 관찰. 제한을 넘긴 원시 trace는 잘림 여부를 표시해.
- `errors.json`: 실패와 페이지·콘솔·네트워크 진단.
- `events.jsonl`: 실행 순서와 진행 기록.
- 번호가 붙은 PNG: 로비·무대석·소식 창·예약 표시·수면 덮개·완료 또는 실패 화면. 결과에 파일별 SHA256을 남겨.

상위의 `${LABEL}-${SCENARIO}-summary.json`은 case 경로와 상태를 모아. `REVISION` 라벨만으로 같은 소스를 검증했다고 보지 말고, 각 case의 `mainSha256`과 관련 모듈 hash를 같이 확인해. 현재 실제 실행 결과가 없으면 **미실행**으로 보고하고, 문법 검사 성공을 제품 기능 성공으로 쓰면 안 돼.
