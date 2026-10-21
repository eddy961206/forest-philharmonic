# main 1f 독립 리뷰 중간 보존본

**완료된 광장 4건과 기능 4건의 독립 리뷰 원문 4개를 바이트 그대로 복사했어. 새 테스트 실행이나 전체 최종 검증 완료를 뜻하지 않아.**

- [plaza-progress-review.md](plaza-progress-review.md): 광장 4개 조합의 실제 입력·입장·표·복귀 증거와 PNG 20장 육안 검토.
- [plaza-progress-review.json](plaza-progress-review.json): 세부 상태, 소스 19개 대조, 소비한 증거 36개 목록과 해시.
- [audio-resume-trace-review.md](audio-resume-trace-review.md): desktop 2개의 오디오 시계 고정 관찰과 서로 다른 추가 품질 assertion, mobile 2개의 짧은 재개 검사 범위.
- [audio-resume-trace-review.json](audio-resume-trace-review.json): 원본/복사본 18쌍, 정확한 수집기 snapshot 2개, trace 파생 통계와 한계.

제품 버전은 `dea7997c6278f10ff467815ab96b370362549b0c`야. [runtime-checkpoint](../runtime-checkpoint/README.md)의 닫힌 8개 실행은 **PASS 6 / FAIL 2**이며, 두 desktop은 오디오 timeout과 별도 품질 assertion이 함께 남아 있어. 기능 collector는 Hall desktop `4583ac3…`, 나머지 `983c1a0…`로 구분해야 해. 새 desktop recheck는 이 checkpoint의 분류 시점에 미실행이고 여기에는 포함하지 않았어.

광장 첫/복귀 캡처 8장은 로딩 페이드 중이며, 일부 이모지 표시·focus 복귀의 한계도 원문에 남아 있어. 공연장 입장 캡처는 공연 시작 전이고, 오디오 원인·음질·성능·실물 기기 전체 PASS를 주장하지 않아.

PNG는 이 리뷰 폴더나 runtime 중간 폴더에 복사하지 않았어. **최종 전체 증거 아카이브에 22개 PNG를 모두 포함할 예정이지만, 이 checkpoint 작성 시점에는 아직 그 아카이브를 생성하지 않았어.** 원본 경로·크기·SHA는 [runtime inventory의 omittedPNGs](../runtime-checkpoint/inventory.json)에 있어.

## 원문·경로·해시

보고서 안의 절대 workspace 경로와 당시의 문구는 원문 그대로 보존했어. Git에서 결과 파일을 찾을 때는 [runtime inventory](../runtime-checkpoint/inventory.json)의 `sourcePath`→`relativePath` 매핑을 사용해. 이 폴더의 [inventory.json](inventory.json)은 리뷰 원본 경로·복사 경로·바이트 수·SHA를 기록해.

[SHA256SUMS](SHA256SUMS)에는 리뷰 4개, README, inventory의 해시가 있어. Linux의 `sha256sum -c SHA256SUMS` 또는 macOS의 `shasum -a 256 -c SHA256SUMS`로 확인할 수 있어. Windows는 `Get-FileHash -Algorithm SHA256 <파일>` 값을 목록과 비교해.

처음 두 광장 실행만 다룬 중간 리뷰는 원본 verification에 별도로 보존돼. 이 Git 묶음은 네 조합으로 확장된 현재 리뷰 4개만 담아. 원본 데이터를 보정·수정하거나 후속 재검사로 대체하지 않았어.
