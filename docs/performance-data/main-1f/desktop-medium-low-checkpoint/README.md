# Desktop medium·low 중간 기록

**전체 28개 고정 렌더 계획은 진행 중이야.** 이 폴더는 닫힌 004–011번 실행 8개, 4쌍, 40개 장면 행만 보존해. 첫 high 000–003번은 [별도 체크포인트](../high-checkpoint/)에 있어. `analysis/summary.json`의 INCOMPLETE는 나머지 계획이 이 부분 묶음에 없다는 뜻이며 전체 통과를 주장하지 않아.

제품은 main `1f8e5f16f1eee03140e13ba1ee66832841559604`와 후보 `dea7997c6278f10ff467815ab96b370362549b0c`로 고정했어. 도구·fixture·served source·실제 프리셋·scale·카메라·환경 동등성은 collect-plan에서 검사했어. 실행당 4 warmup/장면당 8개의 `frame()+readPixels` 동기 완료 ms이며 실제 앱 FPS나 물리 GPU 시간이 아니야. 악화된 행도 [부분 비교표](analysis/summary.md)에 그대로 있어.

JSON·로그·plan·manifest·부분 집계는 원본 바이트를 복사하고 전후 해시를 검증했어. 80개의 PNG는 이 폴더에서 재압축하거나 픽셀 분석하지 않았고 `inventory.json`에 경로·크기·SHA-256을 기록했어. 최종 증거 묶음에 원본 PNG를 포함할 예정이야. 최종 화질 판정은 별도 전체 이미지 비교 뒤에 작성해.

Hall medium의 실행 창에는 다른 에이전트의 2.29초 이미지 계산이 겹쳤을 가능성이 있어. 정확한 UTC를 알 수 없으므로 원인이나 영향 크기를 단정하지 않아. 비교 자체를 폐기하거나 유리한 값으로 대체하지 않았어. 전용 하드웨어·독점 CPU 실험이라는 의미도 아니야.

구체적인 환경·실행 명령과 실제 PC A/B/B/A 절차는 [재현 가이드](../../../performance-reproduce-1f.md)를 봐 줘. mobile viewport, high 역순, cadence, 실제 음표, 로딩, software GPU query의 후속 결과는 아직 이 중간 묶음에 포함되지 않아.
