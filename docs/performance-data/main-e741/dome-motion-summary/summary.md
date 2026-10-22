# Sphere 돔 회전·전환 파일 대조

상태: **PASS**. 파일과 관측 기록의 검증 결과야.

선택한 품질: medium. 원본 계획의 index와 전체 SHA를 사용했어.

## 실행별 검증

| 실행 | 원본/로그 | 종합 | 품질 | 호출/타깃 | 복원/GL | 돔 draw/program | PNG |
|---|---|---|---|---|---|---|---|
| baseline-dome-motion | PASS/PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| candidate-dome-motion | PASS/PASS | PASS | PASS | PASS | PASS | PASS | PASS |

## 같은 입력의 호출 수

숫자는 각 단계 전체의 호출/삼각형 합계야. 시간·FPS·성능 개선율은 계산하지 않았어.

| 품질 | 단계 | 표본 A/B | renderer 호출 A/B | 삼각형 A/B | cube 요청 A/B | 관측 타깃 A/B |
|---|---|---|---|---|---|---|
| medium | rotation | 28 / 28 | 26274 / 26274 | 78962582 / 78870350 | 42 / 42 | 1 / 1 |
| medium | reveal | 20 / 20 | 35810 / 35810 | 61450376 / 61377908 | 33 / 33 | 1 / 1 |
| medium | crossfade | 20 / 20 | 36743 / 36743 | 61436976 / 61364508 | 33 / 33 | 2 / 2 |

## 실패·누락·진행 기록

기록 검증에서 실패·누락을 찾지 못했어. 이것은 아래 미검증 범위의 성공 판정이 아니야.

## 이미지와 출처

품질별 15개 PNG 쌍의 절대 경로·SHA·카메라/음악/돔 조건은 image-pairs.json에 있어. 픽셀 평가는 하지 않았어.
모든 입력 경로·바이트 수·SHA, 도구와 서버 소스 대조 범위는 summary.json의 provenance를 확인해.

## 해석 한계

- 파일·기록 검증 PASS는 브라우저 재실행이나 실제 기기 성공을 뜻하지 않아.
- 28개의 고정 1/60초 회전 step과 전환 5개 시각×4회 렌더야. 연속 4초 시청 검사가 아니야.
- 음표 스케줄러가 꺼진 합성 음악 시계 fixture야. 오디오 품질·경합 검증이 아니야.
- cubeUpdateRequests.returnedNormally는 renderer.render의 정상 반환 관측이야. proxy draw/world program/픽셀 신선도 증명이 아니야.
- faceRequestCoverage는 제품과 같은 11×9 표본 규칙의 최초 사용 요청 검사야. 독립 가시 픽셀·최소 face mask 검증이 아니야.
- domeReadiness는 주 화면 돔 base/overlay의 draw 제출·프로그램 상태야. 큐브 내부 proxy 프로그램 검증과 달라.
- 복원 검사는 실제로 만난 상태와 임시 wrapper에 한정돼. 강제 예외·비기본 XR/target 상태를 주입하지 않았어.
- completeMs/submitMs/completionWaitMs/times는 전부 집계 제외야. 계측 포함 진단값을 FPS나 성능 개선으로 쓰지 않아.
- PNG는 바이트 해시만 읽어. 디코딩·픽셀 지표·육안 검토·화질 판정은 하지 않아. viewport는 원본 선언값이야.
- manifest 전체 중 수집기가 HTTP 해시를 남긴 15개 경로만 직접 대조해. 다른 파일과 실제 실행 runner 바이트는 이 기록만으로 입증하지 못해.
- 소스 SHA는 HTTP 원본의 해시야. 실행 main에는 fixture/suffix가 붙고 Three UUID 난수 경로도 분리돼. 원본 제품 그대로의 실행이라고 해석하지 않아.
- injectedMain.combinedSha256은 기록 형식만 확인해. 원본 소스 바이트가 포함되지 않아 결합 본문을 재계산하지 않아.
