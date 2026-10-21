# PC 검증 기록

이 파일을 결과 폴더에 복사해 채워. 실행 방법은 [실제 PC 재현 안내](reproduce-on-pc.md), 필드 정의는 [측정 방법](bench-method.md), 로딩·오디오·방 검증은 [런타임 검증](runtime-validation.md)에 있어. **비워 둔 항목은 통과를 뜻하지 않아. 실행 안 함·확인 불가·제외 이유를 그대로 적어.**

## 1. 시험 식별과 코드

| 항목 | 기록 |
| --- | --- |
| 실행 날짜·시간·시간대 / 실행자 | |
| 결과 묶음 ID / 보관 경로 | |
| A 최종 비교용 main SHA | `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6` |
| 이전 ec5 실험 재현인지 | 해당할 때만 `ec5ef65fab027353b51f751ffb59aa65b863af0a`. 최종 비교 묶음과 분리해 |
| B PR #1 head SHA | |
| fetch한 브랜치 또는 PR ref | `perf/261021-venue-rendering` 또는 `pull/1/head` |
| A/B worktree 절대 경로 | |
| 양쪽 `git status --short` / 수정 여부 | |
| 실행한 도구 checkout SHA / 수정 여부 | |
| 서버 A/B 주소와 실제 `server.js` 경로 | |
| 응답 main.js와 로컬 파일 바이트 확인 | |
| 원시 JSON의 `sourceHashes` / fixture hash | |
| 앱·도구 버전이 측정 중 변했는지 | |

## 2. 기기·브라우저·도구

| 항목 | 기록 |
| --- | --- |
| 제조사·모델 / desktop·노트북·실제 폰·에뮬레이션 | |
| OS 버전·build / 아키텍처 | |
| CPU / RAM | |
| GPU / VRAM(확인 가능할 때) / driver | |
| 내장·외장 GPU 선택 방식 | |
| Node / npm / Python | |
| Playwright / Chrome·Chromium 버전 | |
| 브라우저 실행 파일 절대 경로 | |
| Pillow / NumPy / 폰트 패키지 버전 | |
| 별도 도구 package-lock 보관 경로 | |
| `chrome://version` / `chrome://gpu` 캡처 | |
| JSON `meta.renderer` | |
| 하드웨어·소프트웨어 렌더러·확인 불가 판정 | |
| `HEADLESS` / `SOFTWARE_RENDERER` / 실제 `CHROME_ARGS` | |
| 화면 해상도·주사율·OS 배율 / 외부 모니터 | |
| AC·배터리·잔량 / OS 전원 모드 | |
| 실내 온도 / 기기 온도 도구 / 시작 온도 | |
| 다른 부하 작업·업데이트 / 실행 전 휴식 시간 | |
| 오디오 장치·연결 방식 / AudioContext sample rate | |

기존 저장 자료는 SwiftShader였어. 이 기기의 하드웨어 결과와 기존 소프트웨어 시간을 한 A/B 쌍으로 사용하지 않아. 실제 폰이 아니라면 실모바일 측정 항목은 미측정으로 적어.

## 3. 시험 전에 정한 목표와 조건

| 항목 | 기록 |
| --- | --- |
| 목표: 60FPS·30FPS·기타 / 해당 해상도·품질 | |
| 허용 p95·긴 프레임 빈도·관찰 시간 | |
| 화질 합격 기준: 자막·좌석·악기·돔·효과 | |
| 자동 품질 허용 범위와 수동 품질의 구분 | |
| 공연장 / 초기 프리셋 / desktop·mobile UA | |
| 초기 preset 저장과 새 context·reload 여부 / LITE 여부 | |
| 요청 WIDTH×HEIGHT·DPR / 실제 `meta.pixelRatio` | |
| `FONT_MODE` / `FONT_ROOT` / 폰트 동일성 | |
| MODE / WARMUP / SAMPLES / SCREENSHOTS | |
| auto의 `fixturePolicy.animationDtCapSeconds=0.05` / 실제 elapsed / 제어한 음악 시각 구분 | |
| 중계: 첫 활성화 또는 준비 후 갱신 / low steady의 94 warmup·100 samples | |
| 장면의 정확한 순서 | |
| 관객 count·fill·seed / 일반 seed·UUID seed | |
| 곡·음악 시각 / controlled clock 또는 실제 오디오 | |
| 카메라·FOV / 수동이면 좌석·모드·시선 | |
| 실행 명령·환경변수 파일 경로 | |

고정 품질 비교에는 auto 결과를 섞지 않아. low 부팅 뒤 high로 바꾼 상태를 fresh desktop high와 같은 구성으로 취급하지 않아. 실제 반영된 프리셋·scale·pixel ratio를 확인해.

이전 ec5 auto의 1/60초 dt 상한 실행은 자동 품질 개선 근거에서 제외돼. 새 auto 시험은 정상 앱의 0.05초 상한과 실제 경과시간을 사용하고, 음악 시각은 여전히 제어한 fixture라는 점을 적어. synthetic 정책 입력 검사와 실제 오디오 재생은 별도 항목이야.

## 4. 실행 순서와 원시 결과

각 환경·프리셋·모드 묶음마다 이 표를 복사해. 라벨을 재사용한다면 새 결과 폴더로 분리해.

| 순서 | 라벨 | 코드 | 시작 시각·온도·전원 | raw JSON / PNG | 완료·오류·제외 |
| --- | --- | --- | --- | --- | --- |
| 1 | A1 | 기준 main | | | |
| 2 | B1 | PR | | | |
| 3 | B2 | PR | | | |
| 4 | A2 | 기준 main | | | |

| 비교 | 결과 JSON | mean 변화 | p50 변화 | p95 변화 | 자체 변동과 해석 |
| --- | --- | --- | --- | --- | --- |
| A1 → B1 | | | | | |
| A2 → B2 | | | | | |
| A1 ↔ A2 / B1 ↔ B2 | | | | | |

`compare.mjs`의 변화율은 `(B-A)/A×100`이야. 시간을 비교할 때 음수는 짧아진 관측을 뜻해. 모드·장면별로 적고, 일부 시점만 좋은 경우 나머지 시점도 남겨.

### 시간·표본의 의미

- 사용한 시간 필드: `completeMs` / `cadenceMs` / 정상 앱의 live rAF / 그 외:
- 표본 수와 관찰 시간:
- n<100의 1% Low: **미측정**. 다른 경우에도 실제 계산 정의와 표본 수를 따로 적어:
- cadence 비교의 `observedRafFps` / `onePercentLowRafFps` / 느린 표본 개수 / sync에서 FPS 필드가 없는지:
- 작은 표본의 p95/p99와 실행 순서·온도 변동에 대한 제한:
- 동기 `readPixels` 완료 시간을 FPS로 환산하지 않았는지:
- controlled visual clock과 실제 오디오의 구분:
- 평균 callback FPS·1% Low·p95의 방향이 서로 다른 조건 / auto에서 실제 preset·scale 변화:
- 느려진 장면 / 변화가 자체 변동보다 작아 판단 보류한 장면:

한 실행의 여러 장면, smoke, 준비 횟수가 다른 중계, 별도 repeat를 독립 실험 수로 합치지 않아. 각 A/B 쌍 안의 장면 순서·표본 수가 같은지 확인하고, 다른 시퀀스의 빠른 재관찰로 최초의 느린 결과를 대체하지 마.

## 5. 화면과 조작

| 장면·관심 영역 | A/B PNG / 이미지 비교 JSON | 직접 본 차이·의도한 변화 | 판정 |
| --- | --- | --- | --- |
| 좌석·난간·계단·공연장 전체 | | | |
| 관객·연주자·악기·그림자 | | | |
| 중계 첫 화면·재개·자막 | | | |
| Sphere 숲·설산·세계 전환·지붕 열림 | | | |
| 겹친 색종이·불꽃 / 활성 빔 | | | |

- 이미지 조건: 같은 순서·warmup·n·시각·폰트·크기·실제 pixel ratio인지:
- 이미지 쌍 수 / 실제 실행 묶음 수 / smoke·repeat·auto 포함 여부:
- SSIM/MAE/RMSE의 사용 정의 / threshold / crop:
- 통계가 놓칠 수 있는 작은 대상 누락을 확대 확인한 내용:
- 실제 이동·회전·앉기·일어나기·시작·pause/resume/seek:
- `functional.mjs` 결과 파일 / 실제 입력으로 추가 확인한 내용:

## 6. 로딩·오디오·방 검사

| 검사 | A 결과 파일 | B 결과 파일 | 통과·실패·미실행 / 근거 |
| --- | --- | --- | --- |
| cold/warm 홀 desktop | | | |
| cold/warm Sphere desktop | | | |
| cold/warm 홀 mobile 에뮬레이션 | | | |
| cold/warm Sphere mobile 에뮬레이션 | | | |
| 65초 착석 오디오 홀 | | | |
| 65초 착석 오디오 Sphere | | | |
| PR Worker 정상·CSP fallback·PCM | 해당 없음 | | |
| PR Node 회귀 / 프로토콜 | 해당 없음 | | |
| PR 두 탭 방 UI / 공연장 초대 / handoff | 해당 없음 | | |

### Node 회귀

- 실제 실행별 TAP 파일·시각·테스트 소스 hash와 pass/fail 수:
- 후속 재실행이 교체하는 기존 case / 중복을 제외한 검증 범위:

기존 보고서의 60개 범위는 실제 59개 실행에서 quality의 옛 7개를 후속 8개로 교체한 `52 + 8`이야. 단일 60개 실행이나 서로 다른 67개 검사로 기록하지 마. 이 PC에서 새로 실행한 결과는 자체 TAP로 따로 적어.

### 로딩

- 브라우저 cold / 서버·OS 캐시 조건 / 사전 요청 여부:
- cold와 warm의 readyMs·longtask 합계/최대 / raw 목록:
- MP3 캐시 적중·304 / 실제 다운로드 bytes / proxy 기록:
- Playwright route를 추가하지 않았는지:
- 관객 수·샘플 수·샘플/박수 PCM bytes 차이:
- 고정 관객 seed / cold·warm·A·B의 정렬 점유 좌석 hash 일치 / `compare-loading.mjs` 결과:
- `controlledMainFixture`의 원본·변경 SHA와 identity/no-cache 조건 / 원래 main.js 전송량과의 구분:
- 반복 렌더가 멈춘 fixture 결과라는 제한:

### 오디오

- 악보 이벤트 순서·voice 생성·source start / 예약 lead와 late note:
- 실제 오디오 시계 진행 / analyser / pause 뒤 voice 정리:
- Worker 정상·fallback의 원본 PCM 채널 해시:
- 관찰한 visibility / background 검증 여부:
- 실제 헤드폰·스피커에서 들은 누락·클릭·지연·공간 음향:
- 5Hz 시각 갱신 검사와 지속 WebGL 부하·출력 장치 검사의 구분:

### 같이 보기

- 새 localhost 비공개 방만 사용했는지:
- 생성·입장·다른 공연장 초대·방장/게스트 권한·동기화:
- 채팅 실제 UI·방장 넘기기·재접속·빈방 정리:
- protocol 통과와 실제 두 탭 UI 결과의 구분:

## 7. 정상 앱과 장시간 사용

| 코드·조건 | 60초 live rAF JSON | 처음 | 5분 | 15분 | 30분 |
| --- | --- | --- | --- | --- | --- |
| A | | | | | |
| B | | | | | |

각 시점에 곡·좌석·프리셋·scale·실제 pixel ratio, callback 간격/체감 끊김, CPU/GPU 온도 또는 확인 불가, 오디오 증상, 메모리 종류와 값을 적어. 첫 실행과 열이 오른 실행을 구분해.

- 시작 전 휴식 / A/B 실행 순서 / 전원·온도 조건 일치:
- 정상 앱에서 실제 렌더와 오디오를 함께 사용한 시간:
- 숨긴 시각·기간 / 복귀 첫 화면·음악 지속·quality 회복:
- 효과·중계·세계 전환의 눈에 띄는 끊김:
- WebGL context lost·console/page 오류:
- DevTools Performance trace 파일 / 녹화한 동작 / 계측 조건:
- CPU throttling 없음·4× 등 / 그래픽 벤치와 분리 여부:
- JS heap·프로세스 메모리·GPU 메모리 중 실제 측정한 범위:
- 실제 Android/iPhone/Safari 추가 측정 여부와 별도 기기 기록:

## 8. 실패·제외·재실행 기록

실패 raw 파일도 보관해. 미완료·조건 불일치를 0ms로 취급하거나 성공으로 고치지 않아.

| 실행 ID / 파일 | 현상 | 원인 또는 미확인 | 정량 비교 포함·제외 이유 | 수정·재실행 파일 |
| --- | --- | --- | --- | --- |
| | | | | |

- 도구 버전·fixture가 바뀐 경우 변경 내용과 해시:
- 원시 측정 당시 도구·소스 manifest / 최종 소스 manifest / 집계 도구 버전의 구분:
- 예상한 CSP 차단과 예상하지 못한 console/page 오류 구분:
- warm 캐시 없음·다른 폰트·renderer 변경·표본 수 불일치 여부:
- 중단된 실행의 마지막 완료 장면과 미완료 범위:

최종 도구 hash를 과거 원시 실행에 소급 적용하지 않아. 실패 원본과 수정 전 실행기도 보존하고, 새 실행 또는 재집계가 어떤 원본을 읽었는지 연결해.

## 9. 이 기기에서의 판단

**판정:** 통과 / 조건부 통과 / 개선 확인 / 차이 판단 보류 / 회귀 / 미실행 중 해당하는 내용을 적어.

- 동일 품질에서 개선된 장면과 근거:
- 동일 품질에서 느려졌거나 차이를 확정하지 못한 장면:
- 자동 품질을 포함한 사용감과 실제 화질 변화:
- 목표 60/30FPS를 판단한 실제 해상도·장면·관찰 시간:
- 기능·음질·예약·방 검증의 남은 문제:
- 물리 GPU·실제 폰·장시간·발열 등 미측정 항목:
- 적용하거나 다시 확인할 설정 / 추가 검증이 필요한 이유:

이 판단은 위에 적은 코드·기기·조건에 한정돼. 다른 기기와 비교할 때는 각자의 A/B 결과와 환경을 함께 봐.
