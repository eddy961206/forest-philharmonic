# CDP 지표 정의 검토 부록

[공식 소스 검토](cdp-metrics-source-review.md)는 기존 광장·오디오 원문 4개 뒤에 추가한 별도 문서야. 새로운 성능 실행이나 제품 수정이 아니야. 기존 README·inventory·SHA256SUMS는 당시 4개 리뷰의 체크포인트로 그대로 보존했으며 이 부록 파일을 포함하는 전체 폴더 목록이라는 뜻은 아니야.

Chromium 153.0.8010.0의 공식 구현과 CDP 문서에서 기본 TaskDuration·ScriptDuration, ThreadTime·ProcessTime의 시계·범위·오류값·계측 한계를 확인했어. 동기 readPixels 대기가 포함된 TaskDuration을 CPU 사용률로 바꾸거나, 조회가 계속 0인 ProcessTime을 CPU 작업이 없다는 근거로 사용하지 않아.

GitHub용 문서는 원본의 GenUI 표기를 실제 공식 URL의 Markdown 링크로 변환한 파생본이야. [변환 기록](cdp-publication.json)에 원본 해시·출력 해시·ref/URL 매핑과 역변환 동등성 검사를 남겼어. 원본은 최종 증거 묶음의 `reviews/cdp-metrics-source-review.md`로 보존해.

- 원본 SHA-256: `af673eb90b84a82a13dd6238355ae9c71f60b58beab1d9867453af0e2ed91b25`
- GitHub 파생본 SHA-256: `07b26f1093b434999b0cc93bd4c23db70338b91ac35bc16b39fc338e6abb7e0e`
- 변환 기록 SHA-256: `4fda79dd58b1260741c2058de23e3e6c905cc0fe4b1beb8cca7b1c1cdaf91470`
