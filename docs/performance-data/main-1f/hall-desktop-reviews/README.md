# Hall high·medium 닫힌 실행의 독립 검토

최신 제품 `1f8e5f1`→`dea7997`의 첫 desktop high·medium 쌍을 독립 검토했어. 전체 계획이나 반복 실험 완료 보고서가 아니야.

- [high 검토](hall-fixed-review.md): 평균·p95·calls·triangles·CDP·heap과 PNG 차이를 확인했어. 이 high 실행은 medium 실행 중의 별도 이미지 분석보다 먼저 끝났어.
- [medium 검토](hall-medium-review.md): 같은 조건·12개 served source·도구/fixture·로그/계획과 장면 8개의 A/B 총128표본을 대조했어. PNG는 SHA만 비교했고 pixel 분석은 하지 않았어.

high PNG 비교에 든 2.294초 CPU 작업이 medium 실행 창과 겹쳤을 가능성을 medium 리뷰에 적었어. 정확한 시각과 영향 크기는 알 수 없고, 그 사실을 특정 악화의 원인으로 확정하거나 불리한 실행을 제외하는 데 쓰지 않았어.

원본 raw·실행 로그는 [high 중간 기록](../high-checkpoint/)과 [medium·low 중간 기록](../desktop-medium-low-checkpoint/)에 있어. 이 폴더의 MD/JSON은 원본 리뷰와 byte 동일하며 inventory/SHA256SUMS로 추적할 수 있어. 최종 값은 후속 전체 비교와 함께 읽어야 해.
