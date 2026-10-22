# 3D 진단 파일 비교기 준비 기록

`tools/bench/compare-dome-motion.py`는 동결된 `dome-motion.mjs` schema 2 원본을 파일만 읽어 비교해. 이 커밋의 상태는 **PREPARED_NOT_EXECUTED**야. 실제 수집이나 집계의 통과를 뜻하지 않아.

최종 도구 SHA-256은 `7223c8985b52d6e5932e7813fdeaad1de6865d47330809aeca61439385e98da5`야. 실행한 확인은 Python AST parse와 `--help`이며 둘 다 종료 0이었어. 독립 읽기 검토에서 진행 중 JSON이 두 번 읽는 사이 갱신되면 FAIL로 분류되던 경로를 INCOMPLETE로 고쳤어. 완료된 원본의 해시 변경은 FAIL을 유지해. 수정 전 준비 v1과 수정 후 v2를 모두 보존해. 합성 자료 검사·실제 원본 집계·브라우저·GPU·이미지 디코딩을 실행하지 않았어.

품질·카메라·합성 음악/돔 시각·프로그램 상태·관측한 렌더 상태 복원·큐브 갱신 요청을 확인하고, high/medium 각각 15개 PNG 쌍의 입력·해시를 정리해. 시간 값은 집계하지 않아. 큐브 render의 정상 반환을 픽셀 신선도나 실제 내부 program draw의 증명으로 사용하지 않아.

정확한 CLI와 출력·종료 코드 설명은 [보완 가이드](../../../performance-supplement-1f.md#3d-진단-원본의-파일-검증)에 있어. guide-static은 Bash fence 6개의 `bash -n` 결과이며, 명령·PowerShell을 실제 실행한 결과는 아니야.

`publication-inventory.json`과 `SHA256SUMS.txt`는 세 준비 파일의 바이트 보존만 확인해. 도구 실행 성공이나 성능·화질 판정은 별도 결과를 확인해.
