# main 1f 통합 체크포인트

이 폴더는 main `1f8e5f16f1eee03140e13ba1ee66832841559604`와 작업 브랜치 `71f4841d026496608749451580789ca62f0f7042`를 합치는 시점의 정적 검토·실제 Node 단위 검사 기록이야.

- 실제 case 75개 PASS. 파일별 subprocess 종료만 세지 않고 직접 실행된 TAP의 `ok`/`not ok`를 집계했어.
- 새 upstream의 high DPR 상한 1.5와 medium×0.85는 그대로 유지했어. 이 해상도 변경을 우리 동일 품질 최적화 성과로 계산하지 않아.
- full build 자동 품질의 최소 프리셋은 medium이고, Lite/low 부팅 안전 경로는 남겼어. 실제 프레임 시간·유예·히스테리시스·복구 정책은 하나의 AdaptiveQuality로 통합했어.
- 화면 밖 무대 중계는 upstream처럼 내부 시간을 진행하고 scene 렌더만 건너뛰어. 다시 보이면 첫 프레임을 갱신해.
- Sphere uOne·2-pass 전환·compileAsync·warm/texture 예열을 유지하고, 예열 실패 때 임시 world 슬롯도 finally에서 복구해.
- 관객/좌석 속성 보존 indexing과 공간 batch를 유지하면서 upstream renderOrder를 합쳤어. 자막 blank 텍스처 업로드는 Sphere가 직접 읽는 경로에서도 지워지도록 보존했어.
- 이 체크포인트에는 새 통합본의 실제 브라우저 PASS를 아직 주장하지 않아. 6a/06 서버 측정은 별도 과거 결과로 남기고 새 1f 기준선을 다시 측정해.
- 브라우저 확장 연결은 사용 불가였고, 사용자가 지정한 Playwright/CDP와 설치된 Chromium/SwiftShader를 사용해 후속 검증해. 이는 실물 PC GPU·스마트폰 측정이 아니야.
