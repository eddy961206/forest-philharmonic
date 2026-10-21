# 6a 런타임 중간 증거

이 폴더는 **측정 작업이 계속되는 중간 체크포인트**야. 완료된 원시 JSON·로그를 바이트 그대로 보존했어. 전체 계획의 완료 보고서가 아니야. `inventory.json`은 원본 경로·파일 크기·SHA-256과 Git에 복사하지 않은 이미지 목록을 포함해. 전체 PNG·실행 스크립트는 최종 6a 증거 ZIP에 함께 보존할 예정이야.

- 제품 기준선은 `6a59c33`, 성능 후보는 `06c8ac5`야. 모바일 입력 수정은 별도 서버의 `0949203-plus-mobile-joy-zone-layer` 라벨이며 `mobile-touch-fix-source.json`과 실제 응답 해시로 구분해.
- `runtime/` 첫 11개 작업은 6 PASS / 5 FAIL이야. 덮어써지는 `summary.json` 하나를 전체 집계로 쓰지 않아. `runtime/review-first.json`에 실제 UI와 명시 fixture, 미실행 항목을 구분했어. 아직 실행하지 않은 runtime plan 항목도 원본 계획에 남아 있어.
- `functional-v2/`는 후보 모바일 두 탐색 실패와 기준선 두 옵션 충돌을 보존해. `functional-baseline-corrected/`는 탐색 전의 중계 assertion 실패야. `functional-baseline-scope/`에서 기준선 양쪽의 투명 조이스틱 영역에 가로막힌 터치를 실제 재현했어. `functional-touch-fix/`는 수정 후 두 모바일 full suite가 완료된 결과야. 과거 실패를 지우지 않았어. `mobile-touch-review.json`에 범위와 한계를 기록했어.
- `native-fixed/`는 실제 main rAF와 음표 예약을 유지한 30초 관찰 네 실행이야. 같은 좌석·관객·곡이지만 시작 음악 시각이 조금 다르므로 strict 동일 시점 FPS 개선율로 쓰지 않아. 음표 예약 지연은 실제 스피커의 글리치 측정이 아니야. `native-fixed/review-native-fixed.json`을 함께 봐 줘.
- 유효 GPU query 비교는 `gpu-timer/`의 Hall 쌍과 `gpu-timer-recheck/`의 Sphere 쌍이야. 원래 Sphere baseline의 종료 로그 해시와 최종 raw가 맞지 않아 그 원래 Sphere 쌍은 제외했어. 실패 원본과 제외 이유도 남아 있어. `gpu-review.json`의 query는 **SwiftShader 소프트웨어 드라이버 시간**이며 물리 GPU 시간·VRAM이 아니야.
- `worker/`는 실제 module Worker와 CSP 차단 fallback의 네 박수 프로필·양쪽 채널 PCM 비교야. 청취·출력 장치·발열 검사는 아니야.
- `transfer-*.json`은 실행이 닫힌 뒤 임시 출력에서 복사한 모든 바이트와 로그 해시를 검증한 기록이야. 수집기의 PASS/FAIL을 수정하지 않아. 예전 절대 경로는 당시 실행 환경의 기록이며, 이 폴더에서 파일을 찾을 때는 inventory의 상대 경로를 사용해.

실제 PC 재현은 [광장 통합본 재현 절차](../../performance-reproduce-6a.md)를 사용해. 물리 PC·스마트폰·iOS Safari·장시간 청취/발열은 이 체크포인트에서 실측되지 않았어.
