# 고정 장면 숫자와 high 역순 반복 독립 검토

[전체 140행 검토](fixed-complete-numeric-review.md), [Hall high 역순](hall-high-reverse-review.md), [Sphere high 역순](sphere-high-reverse-review.md)을 원본 바이트 그대로 보존했어. JSON에는 계산 입력과 파일·조건 대조가 있어. 원본 로그·raw와 집계는 [완료 체크포인트](../fixed-complete-checkpoint/README.md)에 있어.

최초 a 120행은 평균 완료시간 감소 56/증가 64, p95 감소 60/증가 60, CDP ThreadTime 감소 42/증가 78이야. high desktop 역순 b 20행은 평균 감소 15/증가 5였어. 각 행은 독립 실험이나 성능 성공률이 아니며 a/b를 합쳐 n=16으로 만들지 않았어. Hall high front의 감소와 wide·foyer 증가가 반복됐고, Sphere high forest·peaks는 두 번 모두 증가했어. 전체·모바일 성능이 일관되게 개선됐다는 결론을 내리지 않아.

검토는 이미 닫힌 파일과 가벼운 숫자 계산만 사용했어. 파일·산술 assertion 개수는 제품 기능 테스트 개수가 아니야. 140행 검토는 PNG를 읽지 않았고 두 역순 검토는 PNG의 SHA만 읽었어. 이 작업에서 이미지 디코딩·브라우저·GPU·원본 수집기 재실행은 하지 않았어. 실제 FPS, 물리 GPU 시간, VRAM, 음질·영상 동기화도 검증한 것으로 확대하지 않아.

문서·JSON 안의 scratch/staging 절대 경로는 당시 출처 그대로야. Git에서 해당 로컬 경로가 열리는 것은 아니며, 공개 원본 경로 매핑은 완료 체크포인트 inventory를 확인해. PNG와 검토 스크립트를 포함한 전체 증거 아카이브는 후속 제공 범위야.

publication-inventory.json과 SHA256SUMS는 이 여섯 리뷰 파일의 바이트 보존만 확인해. 이후의 low/mobile 역순, cadence, 실제 3D 회전/전환, 이미지 품질 분석은 별도 결과로 읽어야 해.
