# Dome motion 수집기 독립 정적 재검토

## 결론과 범위

**v2에서 새 실행 차단 사유를 발견하지 못했어.** v1에서 지적한 timeout·독립 품질 기대값·큐브 갱신 관측의 과장 문제는 소스에서 해소됐어. 이 결론은 읽기 검토 결과이며 실제 브라우저 통과나 cleanup 성공을 뜻하지 않아.

- 검토자: `/root/hall_review`
- v1 SHA-256: `69f975e5ad77f473c7f2319d31d7ea2c30ea56e20f4d2b5a059e0fc36f312ed8`
- v2 SHA-256: `953ec414c17d02328dd3deb56e1832aa28602bf51bde67dfd8538892432a5bc1`
- 기준 제품: main `1f8e5f16f1eee03140e13ba1ee66832841559604` / 통합 후보 `dea7997c6278f10ff467815ab96b370362549b0c`
- 현재 v2 본문은 33,612 bytes, 445행이고 검토를 마친 SHA와 일치해.
- 제품·기존 도구·새 도구는 수정하지 않았어. 이번 작업에서는 이 Markdown과 동반 JSON만 작성했어.

## v1 지적과 v2 해소

| 항목 | v1에서 발견한 문제 | v2에서 읽어 확인한 변경 | 판정 범위 |
|---|---|---|---|
| 비동기 작업과 종료 | 일부 `page.evaluate`와 `browser.close`가 멈추면 실패 증거 저장까지 도달하지 못할 수 있었음 | 모든 명시적인 `page.evaluate`에 `bounded` 적용. 마지막 snapshot/source/close는 최대 10/15/10초. close 전 저장하고 실패 결과를 다시 저장한 뒤 exit 1 | 코드상 해소. 실제 브라우저 정지·예외 주입 미실행 |
| 요청 품질 | suffix의 페이지 lexical `quality`로 기대값을 만들면 잘못 선택된 실제 preset이 스스로 통과할 위험 | Node CLI에서 독립 `requestedQuality` 생성. meta·예열·준비·각 motion의 input/sample/output에서 preset, 수동 설정, scale 1과 예상 DPR 대조. 관측한 모든 큐브 요청 크기도 Node 기대값과 대조 | 고정된 1f/dea desktop high/medium 정책에 대해 코드상 해소 |
| 큐브 완료의 의미 | `renderer.render` 정상 반환을 실제 proxy draw·shader 완료·fresh pixel로 읽을 수 있는 명칭 | schema 2의 `cubeUpdateRequests.returnedNormally`, `faceRequestCoverage`, `lastUpdateRequest`, `bothSlotsRequestedAtSampledTime`으로 관측 범위를 좁힘 | 호출·정상 반환·world/epoch/시각만 확인. 실제 큐브 픽셀 미입증 |

관련 코드는 `tools/bench/dome-motion.mjs`의 요청 품질 정의(33–43행), request 관측(113–182행), deadline과 품질 assertion(259–302행), 실행 및 cleanup(337–445행)이야. 동반 JSON에는 항목별 근거와 소스 해시가 있어.

## 호출·시간·검사의 의미

두 고정 main 모두 `SPHERE_ACOUSTICS, SP`를 import해. 기존 main 뒤에 fixture와 suffix를 같은 모듈로 붙이는 방식이므로 `SP`를 포함한 main lexical 변수 접근은 소스상 유효해. 이는 브라우저에서 실제 설치가 성공했다는 결과는 아니야.

전환 검사는 실제 dome controller로 4초 전환의 0/25/50/75/100%를 직접 진행한 뒤 각 시각에서 4회 렌더하는 진단이야. medium의 교대 갱신에도 양쪽 슬롯에 해당 시각의 요청 기회가 생기도록 하며 high에도 같은 횟수를 적용해. 네 표본을 모두 보존하고 마지막 PNG를 찍어. 연속 4초 관람, 실제 사용자 입력, 오디오 재생이나 FPS 검증으로 계산하면 안 돼. 코드상 28개 회전 step과 40개 전환 step은 **계획된 제어 프레임 수**이며 이 리뷰에서 실행한 수가 아니야.

기대 mix나 world/overlay 결과를 직접 대입해 assertion만 통과시키는 경로는 검토 범위에서 발견하지 못했어. 다만 시간이 제어된 fixture라는 사실은 유지해야 해. 렌더 호출 기록과 제품과 동등한 11×9 face demand 규칙은 독립적인 최소 가시면 마스크나 화면 픽셀 정확성의 증거가 아니야.

메인 돔 base/overlay의 draw·program readiness와 큐브 내부 world proxy·world shader·픽셀 freshness는 별개야. v2는 후자를 증명하지 않는다고 명시해. `completeMs`에는 wrapper와 상태 조회 등 진단 비용이 들어가므로 성능 개선표, FPS 또는 GPU 시간으로 사용하면 안 돼.

복원 검사는 실제로 만난 render target·cube face·mipmap·XR·viewport·scissor 및 임시 hook 상태에 한정돼. 비기본 target/XR 설정이나 renderer 예외를 강제 주입하지 않았으므로 모든 예외 복원 경로를 검증했다고 볼 수 없어.

## 실행한 것과 실행하지 않은 것

이 리뷰어는 v1/v2 소스와 작성자 메타데이터를 읽었고, 작은 파일의 SHA-256과 두 고정 main의 Git blob을 대조했어. `node --check`, `--help`, 브라우저 실행, GPU 실행, 이미지 계산, timeout 예외 주입은 **실행하지 않았어**.

작성자가 별도로 기록한 검사는 1f main 결합본 syntax, dea main 결합본 syntax, 수집기 syntax, `--help`의 네 가지이고 각각 exit 0이야. 작성자의 기록을 읽어 인용한 것이므로 독립 재실행으로 합산하지 않아. 작성자도 이 준비 기록에서 브라우저·GPU 미실행을 명시했어.

- 작성자 v2 기록: `/tmp/forest-dome-motion-preparation-review-v2.json`
- 기록 SHA-256: `8f4e7795f37263534eb596127971bc133160be16348858997a9296d1da070cb4`
- v1 기록도 원본 SHA로 보존되어 있으며 자세한 명령·출력은 동반 JSON의 `authorPreparationRecords`에 있어.

## 종료 실패 시 후속 작업 조건

**`browserClose.status === 'FAIL'`이면 다음 브라우저/GPU/성능 측정을 시작하지 않아야 해.** 해당 실행의 브라우저가 실제로 종료되어 자원을 더 사용하지 않는지 실행 담당자가 확인한 뒤에만 계속해야 해. 확인할 수 없다면 실패 원본과 종료 미확인 상태를 보존하고 후속 측정을 멈춰야 해.

v2는 close 직전과 실패 후에 결과를 저장하고 `terminationConfirmed=false`와 Node exit 1을 남겨. Node 프로세스 종료는 브라우저 프로세스 종료의 증명이 아니야. `Promise.race` 역시 진행 중인 page 작업을 취소하지 않아. 이 경로가 실제 정지 상태에서 작동하는지는 이번 읽기 검토로 입증되지 않았어. `TIMEOUT_MS`도 실행 전체 시간 제한이 아니라 명시된 작업별 상한이야.

## 비차단 문구 메모

도움말의 “medium의 alternating cadence 때문에 생기는 인위적인 1초 된 슬롯을 피해”는 픽셀 freshness까지 확인한 듯 읽힐 여지가 있어. “1초 전 시각의 갱신 요청만 남는 진단 편향을 줄여”가 더 정확해. 바로 뒤에 픽셀 갱신 미입증 제한이 명확하게 있어 **실행 블로커로 보지는 않아**. 이 의견 때문에 도구 파일을 수정하지 않았어.

이 문서의 `STATIC_REVIEW_NO_NEW_EXECUTION_BLOCKER`는 실제 런타임 PASS, 화질 합격 또는 성능 개선 판정이 아니야.
