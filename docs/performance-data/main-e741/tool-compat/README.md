# e741 도구 호환성 21건 감사 기록

이 디렉터리는 브라우저를 실행하지 않는 검증이야. 제품의 FPS·음질·실제 모바일 동작을 측정한 결과가 아니야.

`manifest.json`에는 실제 Git 원본 3개와 수정 시점 도구 6개의 SHA-256 및 바이트 수를 기록했어. `sources/`에는 `8729cdd`, `e741811`, `6c78172`의 main.js를 그대로 보존했고, `snapshots/`에는 도구를 그대로 복사했어. 이 스냅샷의 audio-resume은 유지음 관찰기 수정 **이전** 버전이야. 후속 수정과 혼동하지 마.

## 그대로 다시 실행

Node.js 24에서 아래 명령을 실행하면 돼. 외부 패키지나 브라우저는 필요 없어.

```sh
cd /workspace/scratch/25707ad85ea4/verification/tool-compat-e741
sh run.sh
```

매 실행은 `runs/UTC시각/`에 새 결과를 남겨. 같은 실행 이름은 덮어쓰지 않아. `verify-compat.mjs`는 저장한 소스 해시를 먼저 검증한 다음 실제 `fixedAudienceMain`과 `browserState`를 호출해. `browserState`의 WebGL·AudioBuffer 정보만 작은 stub으로 공급하므로 PCM 결과는 합산 로직 검증용 바이트이며 앱의 실제 메모리 측정값이 아니야.

검사는 원본 3개 × uint32 seed 경계값 3개 = 9건, 지원 앵커 없음·중복·혼재 거부 4건, 잘못된 seed 거부 5건, 구형/신형 PCM 및 잘못된 pair 거부 3건으로 총 21건이야. 이어서 변환 결과 9개와 관련 실행기 5개의 구문 검사, 실행기 4개의 `--help`를 실행해. 표준 출력·오류 원문은 실행 디렉터리 옆 `.stdout.log`/`.stderr.log`에, 구조화된 결과와 해시는 `results.json`에 있어.

최초 inline 검사는 이 환경의 Node `spawnSync` 제한 때문에 Git 실행에서 EPERM을 반환했어. 이후 shell `git show`로 원본을 추출하고 같은 검사를 통과했어. 이 디렉터리의 실행은 그 원본 바이트를 읽으므로 Node subprocess를 사용하지 않아. 최초 실패를 제품 실패나 브라우저 실행 결과로 해석하면 안 돼.

제품/도구 소스는 이 검증을 실행하면서 변경하지 않아. 이 기록을 프로젝트에 보존하려면 디렉터리 전체를 함께 복사하면 돼.
