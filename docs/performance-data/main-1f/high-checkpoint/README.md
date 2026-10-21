# 최신 main 1f: 첫 high desktop 비교 체크포인트

고정 제품 1f8e5f1 ↔ dea7997의 첫 A/B, 두 공연장 **4개 실행 PASS**만 담은 중간 증거야. 전체 28개 계획 중 **2/14쌍·20장면**만 완료된 시점이며 `analysis-first-high/summary.json` 상태는 의도적으로 INCOMPLETE야. 나머지 결과를 이 요약에 임의로 끼워 넣지 않아.

시간은 `frame()+readPixels` 완료 ms이고 FPS·순수 GPU 시간이 아니야. 같은 high, scale 1, 640×360, DPR 1, 장면별 warmup 4·표본 8이야. p95/p99는 작은 8표본에서 모두 최대 표본이라 안정적인 꼬리 분포 추정이 아니야. SwiftShader 단일 AB 관찰이며 물리 PC·스마트폰 성능으로 일반화하지 않아.

Hall front 완료시간은 2212.41→1802.96ms지만 wide 6962.20→7019.99ms, foyer 12566.16→12827.98ms로 늘었어. Sphere front는 1050.52→910.23ms이고 forest 1896.14→2063.80ms, broadcast 1861.11→1995.89ms로 늘었어. 좋아진 장면만 선택하지 않고 전체 표와 원본을 함께 공개해.

`render/`에는 원시 JSON, `logs/`에는 실제 실행·stdout, `reviews/`에는 독립 Sphere 검토가 있어. 실행 전후 served source와 pinned 제품 명세를 대조했으며 새 돔 warmup 검사는 실제 base/활성 overlay 제출과 프로그램 ready/link를 관찰했어. 정확한 범위·제한은 각 원문에 남겨.

원본은 바이트 그대로 복사했어. `inventory.json`에는 복사 매핑과 모든 파일 SHA-256이 있고 PNG 40개의 원본 경로·크기·해시도 포함해. **PNG를 모두 담을 최종 증거 아카이브는 아직 생성 전**이야. 그림을 보지 않고 JSON만으로 완전한 화질 동등성을 판정하지 않아.

실행 방법은 [PC 재현 안내](../../../performance-reproduce-1f.md), 계획과 collector 해시는 [상위 폴더](../README.md)를 참고해.
