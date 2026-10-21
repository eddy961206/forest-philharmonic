# Mobile 역순 및 3D 움직임 계획 추가 — 작성 시점 미실행

`mobile-reverse-plan.json`은 최초 mobile high/low의 모든 장면을 B→A로 반복해. 원래 결과와 악화행을 보존하고 순서 영향을 함께 보고하기 위한 계획이야.

`dome-motion-plan.json`은 Sphere full desktop high/medium A→B의 움직임·전환 진단이야. 완료 ms에는 probe 비용이 있으므로 성능 표에 합치지 않아. 같은 입력에서의 갱신 요청·상태 복원과 PNG를 별도 확인해. 기존 49파일 manifest 대신 [vendor 두 파일을 확장한 manifest](../dome-motion-source-manifest.json)를 새 진단 집계에 명시해.

실행 명령과 판단 범위는 [추가 재현 가이드](../../../performance-supplement-1f.md)에 있어. 기존 supplementary-plans/inventory.json의 두 계획 범위는 그대로 두고 새 파일은 [publication inventory](../motion-preparation/publication-inventory.json)에 기록했어.
