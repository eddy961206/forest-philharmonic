# 이전 성능 측정 원본

이전 원본은 **커밋 `ed3a5db17a53cd84b75e33a25352831f148f9431`**에 그대로 보존돼 있어. 현재 브랜치는 그 커밋의 후손이고 이력을 다시 쓰지 않았어. 과거 자료 1,330개 경로를 현재 트리에서 제외해서 제품 변경을 검토하기 쉽게 만들었어. 과거 실패·악화·한계도 같은 원본에 남아 있어.

현재 후보를 검사할 때는 [로컬 에이전트 인계](LOCAL_AGENT_HANDOFF.md)를 사용해. 이 보관 자료의 후보 `6c78172`와 현재 HEAD를 혼동하지 않아.

## 웹에서 읽기

| 내용 | 고정 커밋 링크 |
|---|---|
| 마지막 전체 보고서 | [performance-e741.md](https://github.com/eddy961206/forest-philharmonic/blob/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-e741.md) |
| e741/6c 측정 계획·원시 결과·실패 기록 | [main-e741](https://github.com/eddy961206/forest-philharmonic/tree/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-data/main-e741) |
| 최신 당시의 독립 성능 검토 | [review-notes](https://github.com/eddy961206/forest-philharmonic/blob/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-data/latest-e741-review-notes.md) |
| 셰이더 후보와 채택하지 않은 변경 | [shader-review](https://github.com/eddy961206/forest-philharmonic/blob/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-data/latest-e741-shader-review.md) |
| 그 이전 측정 전체 | [performance-data](https://github.com/eddy961206/forest-philharmonic/tree/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-data), [historical-a41](https://github.com/eddy961206/forest-philharmonic/tree/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/historical-a41) |
| 당시 Windows/POSIX 재현 안내 | [렌더](https://github.com/eddy961206/forest-philharmonic/blob/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-reproduce-e741.md), [실제 재생·기능](https://github.com/eddy961206/forest-philharmonic/blob/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-runtime-e741.md) |

## 현재 작업 트리를 바꾸지 않고 내려받기

전체 이력이 있는 clone의 루트에서 실행해. 아래 명령은 PowerShell과 POSIX 셸에서 같아. 출력 ZIP 경로에는 아직 존재하지 않는 파일명을 사용해.

```sh
git cat-file -e ed3a5db17a53cd84b75e33a25352831f148f9431
git archive --format=zip --output=../forest-performance-ed3a5db.zip ed3a5db17a53cd84b75e33a25352831f148f9431 docs
```

첫 명령에서 커밋을 찾지 못하면 shallow clone인지 확인하고, 필요한 이력을 먼저 가져와. Git이 없으면 [해당 커밋 전체 ZIP](https://github.com/eddy961206/forest-philharmonic/archive/ed3a5db17a53cd84b75e33a25352831f148f9431.zip)을 받을 수도 있어. ZIP에는 당시 코드와 Git에 저장했던 원본이 함께 들어 있어.

과거 도구를 그대로 실행하려면 별도 worktree를 만들어. 기존 수정 파일은 건드리지 않아.

```sh
git worktree add --detach ../forest-evidence-ed3a5db ed3a5db17a53cd84b75e33a25352831f148f9431
```

과거 JSON 안의 `/workspace/...`는 당시 실행 위치야. 그 경로가 지금 컴퓨터에도 있다고 가정하지 말고, 원본은 보존한 채 복사한 계획을 로컬 경로로 변환해.

## 이미지와 용량의 한계

과거 원본 PNG 180장은 당시 채팅에 별도 ZIP으로 제공됐으며 Git에는 PNG의 해시·목록만 들어 있어. 위 Git archive만으로 그 PNG를 복구할 수는 없어. [당시 이미지 ZIP 안내와 SHA-256](https://github.com/eddy961206/forest-philharmonic/blob/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-screenshots-e741.md)을 확인하거나 현재 후보·기준을 로컬에서 다시 캡처해.

이번 정리는 **현재 파일 트리와 main 대비 PR 변경량**을 줄여. Git 과거 이력 안의 데이터까지 지우지 않으므로 기존 전체 clone의 `.git` 크기가 같은 비율로 줄지는 않아. 기록 삭제나 force push는 필요 없어.
