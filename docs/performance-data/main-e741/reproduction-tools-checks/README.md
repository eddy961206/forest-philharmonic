# PC 계획 변환기 검사

최신 source의 prepare-local-plan.py / prepare-runtime-plan.py를 실제 원본 plan JSON과 합성 파일·mock Git 응답으로 검사한 14개 fixture야. 브라우저·GPU·네트워크·실제 Git·Windows를 실행한 검사가 아니야. Python AST 2개와 Bash 18블록 구문 검사도 수행했어.

검사 스냅샷은 당시 로컬 REPO 절대 경로를 담고 있어. 다른 PC에서 재실행할 때는 test_prepare_plans.py를 별도 파일로 복사하고 REPO를 그 PC의 source 경로로 지정해. 원본 파일·로그는 바꾸지 않아. 최초 fixture 한 개가 원본 장면명을 rotation으로 잘못 예상해서 실패했고 실제 명칭 rotate로 기대값만 바로잡았어. 원본 plan이나 제품의 성공 조건을 낮춘 것이 아니야.

ZIP 검증은 실제 180 PNG 묶음 전체 SHA와 181 payload의 크기·SHA를 대조해 PASS였어. PNG 패키징 도구도 ZIP 안의 모든 payload를 다시 읽어 원본과 대조했어.
