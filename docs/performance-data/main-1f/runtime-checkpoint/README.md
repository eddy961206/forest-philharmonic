# main 1f runtime 중간 증거

**닫힌 job 0–7, 총 8건 중 PASS 6건 / FAIL 2건의 원본을 공개하는 중간 묶음이야. 최종 전체 검증이나 전체 성능 비교 완료를 의미하지 않아.**

제품 수정이나 새 브라우저 실행 없이 원본 JSON·로그를 바이트 그대로 복사했어. desktop 실패를 보정·삭제하거나 다른 실행으로 덮어쓰지 않았어. 새 desktop recheck는 이 checkpoint의 분류 시점에 **미실행**이며, 후속 결과는 이 묶음에 포함하지 않아.

## 고정 버전과 환경

- baseline 소스 커밋: `1f8e5f16f1eee03140e13ba1ee66832841559604`
- 실제 이 8건에 사용한 candidate 제품: `dea7997c6278f10ff467815ab96b370362549b0c`
- Linux x64, headless Chromium 153.0.8010.0 / Playwright 1.64.1 / FONT_MODE=local.
- `softwareRequested=true`, `--use-angle=swiftshader`가 기록돼. 실제 GL renderer 문자열은 해당 수집기에 없어.
- desktop 960×540 CSS px / DPR 1, mobile 390×844 CSS px / DPR 2의 에뮬레이션이야. 실물 스마트폰 결과가 아니야.
- baseline 커밋은 소스 비교 기준이야. **이 묶음에 baseline의 새 runtime 실행이나 FPS 전후 비교 결과가 들어 있는 것은 아니야.**

## 닫힌 실행의 결과

| job | 원본 결과 | 상태 | exit | 범위·실패 |
|---|---|---|---:|---|
| 0 | [plaza-hall-desktop](plaza/main1f-plaza-hall-desktop-plaza-hall-desktop.json) | **PASS** | 0 | 솔로 광장 UI 핵심 흐름 |
| 1 | [plaza-sphere-mobile](plaza/main1f-plaza-sphere-mobile-plaza-sphere-mobile.json) | **PASS** | 0 | 솔로 광장 UI 핵심 흐름 |
| 2 | [plaza-hall-mobile](plaza/main1f-plaza-hall-mobile-plaza-hall-mobile.json) | **PASS** | 0 | 솔로 광장 UI 핵심 흐름 |
| 3 | [plaza-sphere-desktop](plaza/main1f-plaza-sphere-desktop-plaza-sphere-desktop.json) | **PASS** | 0 | 솔로 광장 UI 핵심 흐름 |
| 4 | [functional-hall-desktop](functional/main1f-functional-hall-desktop-hall-desktop.json) | **FAIL** | 1 | 오디오 재개 2초 timeout + 예전 medium DPR 기대값 1 / 실제 0.85 |
| 5 | [functional-hall-mobile](functional/main1f-functional-hall-mobile-hall-mobile.json) | **PASS** | 0 | 원래 2초 재개 조건 포함 full 기능 검사 |
| 6 | [functional-sphere-desktop](functional/main1f-functional-sphere-desktop-sphere-desktop.json) | **FAIL** | 1 | 오디오 재개 2초 timeout + auto 초기값 high 기대 / 실제 medium |
| 7 | [functional-sphere-mobile](functional/main1f-functional-sphere-mobile-sphere-mobile.json) | **PASS** | 0 | 원래 2초 재개 조건 포함 full 기능 검사 |

각 stdout의 SHA가 닫힌 job metadata의 logSha256과 같고, raw·summary·wrapper의 상태도 일치해. `transfer-runtime-plan-4-8.json`의 processExitCode는 1, copyStatus는 PASS야. **전송·보존 성공은 기능 검사 통과를 뜻하지 않아.**

## 수집기 버전은 구분해야 해

| 실행 | 수집기 SHA-256 |
|---|---|
| plaza jobs 0–3 | `08b9bc81034582c30ffcabd94c220ead66cf223fb8f1666a3d7466670b8e22ce` |
| functional job 4, Hall desktop | `4583ac3b0118412c2c86eaa52b252a03df9605f3ad039f9df38a70da6ac31921` |
| functional jobs 5–7 | `983c1a0e9489ef56d2115fe79a626039d32f09be771aef9a573875928d7f2807` |

기능 수집기는 **2개 버전**이야. 후자는 새 main의 수동 DPR 기대식이 반영됐지만 auto 복귀를 예전 수동 초기값과 같다고 기대하는 검사는 남아 있었어. 자세한 소스·trace 판단은 [오디오 리뷰](../reviews-checkpoint/audio-resume-trace-review.md)에 있어.

## 데스크톱 복수 실패의 보존

Hall·Sphere desktop 모두 첫 번째 `transport-resume` 2000ms timeout과 두 번째 품질 assertion이 별도로 남아 있어. `CONTINUE_ON_TRANSPORT_FAIL=1`은 첫 실패를 보존하고 실제 버튼으로 일시정지한 뒤 후속 컨트롤을 진단하는 옵션이야. 전체 상태는 FAIL이야.

재개 후 약 2.01초 동안 두 desktop은 실제 AudioContext.currentTime과 getOutputTimestamp가 고정됐고, 관찰 onTick은 각각 81회 진행했어. 같은 시각은 재개 전 snapshot에도 나타나서 정지의 시작을 재개 클릭에 특정할 수 없어. 원인이 제품·headless 오디오·소프트웨어 그래픽스/readPixels·출력 환경 중 무엇인지는 확정하지 않았어. 품질 기대값 오류가 오디오 실패를 설명하거나 없애지는 않아.

Mobile 두 실행은 짧은 재개 조건을 통과했지만 low/24kHz/작은 관객 수라는 다른 조건이야. full PASS를 음질·동기화·장시간·실물 기기 전체 통과로 확대하지 않아.

## PNG는 이 Git 중간 묶음에 없어

PNG **22개**(광장 20개, desktop 기능 실패 캡처 2개)는 저장소에 복사하지 않았어. [inventory.json](inventory.json)의 `omittedPNGs`에 원래 실행 경로, 현재 보존 경로, 바이트 수, SHA-256, 픽셀 크기를 모두 기록했어.

**PNG 전체를 포함한 최종 전체 증거 아카이브는 생성 예정이며, 이 checkpoint 작성 시점에는 아직 생성하지 않았어.** 이 폴더나 해시 목록을 그 최종 아카이브로 오해하면 안 돼. 파일을 실제로 포함하고 해시를 검증한 뒤 별도 경로·완료 상태로 제공해야 해.

캡처 시점에도 제한이 있어. 광장 first-page·returned-to-plaza 8장은 1초 opacity 로딩 페이드 중이고 일부 이모지 글리프가 빠져 보여. 완성 화면 화질 비교 자료로 쓰지 않아. concert-entered는 0:00/공연 시작 전이야. 기능 failure PNG 2개는 두 번째 assertion 뒤 캡처여서 audio freeze 순간 자체를 보여 주지 않아.

## 수집·판정의 경계

plaza는 배치 fixture 없이 실제 입력으로 진행한 솔로 입장·복귀 검사야. full 기능 검사는 main rAF를 잡아 두고 명시적 frame과 readPixels를 실행하며, 좌석 옆 배치·연주자 입장 완료 등의 fixture를 사용해. 재개 대기 구간은 100ms 수동 관찰만 하고 추가 main frame이나 오디오 시계 변경은 하지 않았어.

이 결과는 native rAF로 계속 렌더링하며 음악을 재생한 성능 검사나 동일 품질 FPS 개선 증거가 아니야. FPS, GPU 시간, 실제 출력 글리치, 음질, 발열·배터리 성능은 여기서 주장하지 않아. UI-ready와 Sphere mesh.visible 관찰도 구분하며, mesh.visible=true를 컴파일 성공이나 첫 픽셀 준비의 증거로 확대하지 않아.

## 파일·해시·재현

- JSON·로그 32개와 원본 source-manifest/transfer record 3개, **35개 파일**을 원본 바이트 그대로 복사했어.
- [inventory.json](inventory.json): 원본→이 폴더의 경로 매핑, 바이트 수, SHA-256, 닫힌 실행 상태, 제외한 PNG 목록.
- [SHA256SUMS](SHA256SUMS): 이 폴더의 복사 파일·README·inventory를 검증하는 SHA-256 목록. 목록 자체의 해시는 목록에 넣지 않았어.
- [리뷰 묶음](../reviews-checkpoint/README.md): 독립 검토 원문 4개를 수정 없이 보존해.

Linux에서는 이 폴더에서 `sha256sum -c SHA256SUMS`, macOS에서는 `shasum -a 256 -c SHA256SUMS`로 확인할 수 있어. Windows PowerShell에서는 `Get-FileHash -Algorithm SHA256 <파일>` 값을 inventory/SHA256SUMS와 비교해.

원본의 절대 `/tmp`·workspace 경로와 metadata 내용은 출처를 보존하려고 고치지 않았어. 로컬 복사 경로는 inventory의 relativePath 매핑을 사용해. 원본 실행 명령은 각 job metadata의 command/env와 transfer record에 들어 있어. 동일 버전의 수집기·브라우저·helper를 확보해 새 출력 경로에서 실행해야 하며, 새 결과로 이 원본을 덮어쓰면 안 돼.
