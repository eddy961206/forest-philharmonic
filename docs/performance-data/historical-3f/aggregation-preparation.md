# 3f 집계·보존·게시 준비 도구

기준 커밋은 `3f1655b0c035a630adbcfbf19582dd9363386f34`야. 이 문서와 세 스크립트는 **실행 준비 자료**야. 문법·도움말 검사만 했고 렌더링, 집계, 큐레이션, 게시 payload 생성은 아직 실행하지 않았어. 이전 `qa-a41` 원본과 결과는 수정하지 않았어.

## 1. 완료된 raw JSON 집계

```bash
node qa-3f/collect-summary.mjs \
  --qa-root qa-3f \
  --tools-root forest-philharmonic/tools/bench
```

기본 출력은 `qa-3f/summary.json`, `summary.csv`, `comparisons/`야. 과거 집계 결과를 보존하면서 다시 집계하려면 `--output-root`에 다른 폴더를 지정해. 기존 실패를 삭제하거나 성공 이력으로 바꾸지 말고 수정 사유와 함께 보존해.

`render-plan.json`에서 기준/후보 쌍을 구성해. 계획된 raw가 없거나 `PASS`가 아니거나 조건이 다르면 전체 집계는 `FAIL`, exit 1이야. 완료한 쌍의 부분 집계는 남기지만 완성된 전체 결과로 해석하지 않아. 도구·초기 manifest 등 전제가 잘못되면 별도 FAIL 요약을 남겨.

다음 계약을 검사해.

- 초기 `source-manifest.json`의 `baseline`은 위 3f SHA이며, `files[]`에는 `file`, `baselineSha256`, `candidateSha256`가 있어야 해. 원시 `sourceHashes`의 실제 served 제품 파일 7개를 해당 초기 snapshot과 대조해.
- 모든 쌍의 fixture, fixturePolicy, fixture 해시, viewport, DPR, 브라우저·폰트·실행 플래그, 실제 renderer metadata, 준비/측정 수, 장면 순서와 카메라 설정이 일치해야 해. 제품 SHA, revision 라벨, 서버 URL은 각 계획과 초기 manifest로 별도 검증해. 행렬 중간에 fixture 소스가 바뀌면 같은 묶음으로 집계하지 않아.
- 새 fixture는 `eligibleAudienceSeats`, `recitalSeats`를 기록하고 합이 전체 `seats`와 같아야 해. 각 표본은 `asleep: false`, `visibility: "visible"`를 기록해야 해. guard만 실행하고 상태를 기록하지 않은 예전 fixture는 최신 결과로 받지 않아.
- 수동 프리셋의 모든 표본에서 실제 quality와 scale 1을 확인해. auto는 `raf-cadence`만 허용하고 별도 `adaptive[]`에 남겨.
- `completeMs`는 동기 완료 시간으로 유지해. `observedRafFps`는 실제 `cadenceMs`의 평균을 역수로 계산하고, 1% Low는 n≥100일 때 느린 상위 ceil(n×.01) 간격 평균의 역수야. 미측정 heap이나 부족한 1% Low 표본은 `null`이며 0으로 바꾸지 않아.

기존 비교 CLI를 Worker에서 그대로 실행해. 이전 호스트의 중첩 Node `execFile` 빈 stdout 문제를 우회하는 실행 방식만 계승했으며 comparator의 검사나 수식은 바꾸지 않아. 각 입력 raw의 SHA-256과 bytes, 집계기·비교기·공유 helper의 해시도 따로 남겨.

## 2. 최종 증거 bytecopy

```bash
node qa-3f/curate-results.mjs \
  --qa-root qa-3f \
  --workspace-root . \
  --repo-root forest-integration-3f \
  --tools-root forest-philharmonic/tools/bench \
  --provenance-root forest-philharmonic/docs/performance-data/provenance \
  --runtime-root /tmp/forest-qa-runtime \
  --output forest-philharmonic/docs/performance-data/latest-3f
```

제품을 원래 checkout으로 옮긴 뒤라면 `--repo-root forest-philharmonic`으로 바꿔. 제품 root와 도구 root는 서로 다른 출처로 기록해. `--tools-root`는 저장소 root가 아니라 `compare.mjs` 등이 있는 bench 폴더야. 다른 PC에서는 런타임 위치도 명시해.

모든 측정과 문서 정리가 끝나고 원본을 고정한 뒤 실행해. 비어 있지 않은 출력은 거부해. stdout 로그를 보존하려면 수집 중인 `qa-3f` 밖에 써서 원본이 복사 중 바뀌지 않게 해.

`qa-3f`의 JSON·PNG·로그·계획·runner·집계기·이 준비 스크립트는 상대 경로를 유지해 복사해. `STOP`은 제외해. FAIL/ERROR/RUNNING, 파싱할 수 없는 JSON, 종료 기록이 없는 계획도 그대로 보존하고 따로 집계해. status 빈도는 실행 수나 성공률이 아니야.

초기 source manifest는 그대로 보존하고 최종 제품·도구·테스트 SHA는 별도의 `final-source-manifest.json`에 기록해. `qa-v2/run-portable.mjs`와 실제 런타임 package/lock도 원본 그대로 보존해. package 파일의 비밀 키·토큰 패턴·인증 URL만 검사하며 npmrc나 환경변수는 수집하지 않아. 이전 provenance와 최초 환경 자료는 3f 실행 증거와 구별해.

PNG는 읽기·복사·해시만 수행하고 디코딩하거나 다시 인코딩하지 않아. 복사된 source/target의 SHA-256·bytes가 같은지 확인해. 복사 무결성 PASS는 기능 또는 성능 측정 PASS를 뜻하지 않아.

## 3. Git-data payload만 준비

```bash
python3 qa-3f/build-git-payload.py \
  --repo-root forest-philharmonic \
  --output qa-publish-3f
```

최종 게시용 저장소에 제품·도구·문서·증거를 모두 모은 뒤 실행해. 기본 제품 root는 `forest-integration-3f`이므로 위처럼 최종 checkout을 명시하는 편이 분명해. 출력은 저장소와 `qa-3f` 바깥의 없거나 비어 있는 폴더여야 해.

정확한 3f baseline tree와 working file bytes를 비교해 변경 entry만 작성해. UTF-8 안전 텍스트는 tree inline content, 바이너리는 base64 blob 요청 파일로 나누고 source SHA-256·Git blob SHA·bytes를 남겨. 삭제는 `sha: null`이야. 원본 PNG는 재인코딩하지 않아.

Git index·commit·ref·API는 변경하지 않아. unresolved merge, symlink, 경로 탈출, 숨긴 untracked 파일과 자격 증명 파일명을 거부해. tracked `.gitignore`는 허용해. 보존 로그가 `git ls-files --cached --others --exclude-standard`에 나타나도록 최종 저장소에 `!docs/performance-data/**/*.log` 예외가 있어야 해.

최종 feature parent는 이 스크립트가 결정하지 않아. 별도 게시 단계에서 당시 PR 브랜치의 head를 확인해서 전달해야 해. blob 생성 응답 SHA가 요청 manifest의 예상 Git SHA와 같은지 검증한 뒤 tree를 생성해야 하고, 이 준비 과정 자체는 업로드나 커밋을 수행하지 않아.
