# 실제 3D 움직임 진단 — 실행 전 준비 기록

새 도구는 `tools/bench/dome-motion.mjs`이고 [사용 절차](../../../performance-supplement-1f.md)에 범위와 한계를 적었어. **이 체크포인트에서는 브라우저 실행 전**이야. 제품 1f/dea와 기존 full-frame/fixture/browser helper는 바꾸지 않았어.

작성자의 본체·두 main 결합본 syntax 검사와 `--help` 네 실행은 preparation-v2에 있어. 다른 에이전트의 읽기 전용 검토는 static-review에 있어. v1에서 지적한 timeout, 요청 품질 대조, cube draw 증거 범위를 보완한 v2를 동결했어. 정적 검사 통과를 런타임·픽셀 품질 통과로 해석하지 않아.

정상 반환한 cube render 갱신 요청은 실제 world proxy draw·program 준비·픽셀 신선도 증명이 아니야. close 실패 시 다음 GPU 실행을 중단하도록 추가 queue의 motion batch는 첫 FAIL에서 멈춰. queue는 이 환경에서 사용한 절대 경로를 가진 실행 기록이고, PC 재현에는 위 가이드의 portable run-plan 명령을 사용해.

`publication-inventory.json`과 SHA256SUMS는 이 커밋에서 추가한 15개 원본 사본만 다뤄. 경로는 main-1f 디렉터리를 기준으로 해. 기존 다른 inventory의 범위를 확대하지 않았어. 감사 원문에 남은 scratch 절대 경로와 sandbox 링크는 원본의 출처 기록이며 GitHub에서 직접 열리는 링크가 아닐 수 있어. 이 README와 재현 가이드의 상대 링크를 사용해.

추가 vendor manifest는 기존 49파일 원본을 보존하고 Three core/module 두 파일을 추가한 51파일 버전이야. frozen commit 바이트와 두 로컬 HTTP 응답을 대조한 증명은 manifest-extension에 있어. 실제 수집기에서 HTTP로 해시를 기록하는 범위가 51파일 전부라는 뜻은 아니야.
