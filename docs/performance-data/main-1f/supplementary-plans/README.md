# 추가 검증 계획 — 작성 시점 미실행

원래 계획을 대체하지 않는 별도 진단이야. 제품 기준은 main `1f8e5f1`과 후보 `dea7997`로 고정하고 원본 실패·악화 행을 유지해.

- `baseline-desktop-transport-plan.json`: 후보 high desktop의 정지한 AudioContext clock과 같은 UI 경로를 최신 main에서도 확인해. 과거6a의 실패나 mobile/low 통과를 최신 high의 비교로 대신하지 않아.
- `low-reverse-plan.json`: 첫 low desktop 비교에서 여러 장면이 느려져, 원래 모든 low desktop 시나리오를 후보→기준 순서로 재관찰해. 최초 A/B와 나란히 보고하고 유리한 쪽만 고르지 않아.

두 계획은 기존 렌더·cadence·runtime·GPU 작업과 동시에 실행하지 않아. 여기 있는 reason의 `PLANNED_NOT_RUN`은 문서를 만들 당시 상태야. 닫힌 실행 로그가 없으면 통과로 해석하면 안 돼. 최종 실행 결과는 별도 결과 폴더와 최종 보고서에 연결해.
