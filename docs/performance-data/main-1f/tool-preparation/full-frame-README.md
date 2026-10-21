# 1f 돔 준비 상태를 확인하는 full-frame 수집기 준비본

이 폴더의 수정본은 아직 저장소 원본에 복사하지 않았어. 실행 중이던 6a batch가 기존 도구를 계속 읽으므로 별도 경로에 준비했고, 실제 브라우저 실행은 root가 담당해.

## 교체 대상

아래 두 파일만 같은 이름의 `forest-philharmonic/tools/bench/` 파일과 교체하면 돼.

| 파일 | 준비본 SHA-256 |
|---|---|
| full-frame.mjs | `2bf556b443cd64df6b4d743ec45e11dc382e6a9014083054472ddb39919d37c9` |
| full-frame-fixture.js | `262b5f126c6214d1875010056da4327117af2c764dab8d04854dc4b709871d98` |

`browser.mjs`는 `--help`의 상대 import를 실행하기 위한 **수정 없는 helper 사본**이야. 교체 대상이 아니야. 원본 byte 사본은 `originals/`, 원본 해시는 `original-manifest.json`, 수정 내용은 `changes.patch`, 정적 대조·검사 결과와 해시는 `prepared-review.json`에 있어.

## 바뀐 검사

1. 기존 `__bench`/입장 버튼 준비 조건에 Sphere `dome.mesh.visible === true` 조건을 더해 기다려. visible을 강제로 바꾸거나 compile을 직접 실행하지 않아. 실패한 wait는 `initialReadiness`와 전체 FAIL로 보존해.
2. 기존과 같은 수의 WARMUP 프레임 동안만 base와 overlay의 `onAfterRender`를 감싸서 draw submission을 세어. 원래 callback의 `this`, 인수, 반환값을 보존하고 main camera와 기타 카메라의 호출 수를 구분해.
3. warmup의 `finally`에서 원래 callback을 복원해. 그 뒤 프로그램 `isReady`, GL `LINK_STATUS`, 제공되는 `diagnostics.runnable`을 확인하고, CDP 시작 snapshot과 실제 표본 수집은 그 다음에 시작해. pending 프로그램을 강제로 기다리는 LINK_STATUS 조회는 생략하고 미확인으로 처리해.
4. Sphere base가 main camera에서 한 번도 그려지지 않았거나, 활성 2-pass overlay가 빠졌거나, 사용한 프로그램 상태가 미확인이면 표본 수집 전에 FAIL해. 홀은 `NOT_APPLICABLE`, 기존 single-pass의 overlay도 해당 없음, 안 쓰는 overlay 프로그램은 `NOT_USED_IN_WARMUP`으로 구분해.
5. 각 step의 시간 측정 직전·직후 돔이 숨겨져 있으면 FAIL해. 측정되는 frame/readPixels 구간에는 새 카운터나 프로그램 조회가 없어.

원시 JSON에는 `initialReadiness`와 `scenarios[name].domeReadiness`가 추가돼. 후자는 실제 draw 수, 전환 mix/reveal, 현재 세계, 사용된 프로그램의 확인 결과와 실패 이유를 담아. probe 설치가 끝난 뒤 warmup 또는 준비 판정이 실패해도 가능한 증거를 저장해.

## 보존을 정적으로 확인한 구간

다음 여섯 구간은 이전 원본과 byte 동일해. SHA-256는 review JSON에 있어.

- `setup()`과 모든 scenario: 곡, 오디오 시계 정책, 카메라/FOV, 관객, 세계 전환 시각, 효과.
- 실제 `frame()` + 선택적 `readPixels`의 시작/종료 timestamp 구간.
- 기존 meta 수집 함수.
- CLI 설정과 sample/WARMUP 횟수 설정.
- 난수·UUID·애니메이션 시계와 main route 주입.
- 실제 sync/cadence 표본 수집 loop.

원본 두 파일과 helper도 작업 종료 시 `originals/` 사본과 byte 동일한 것을 확인했어. 준비본이 실제 페이지에서 올바르게 동작한다는 뜻은 아니며 그 검증은 아직 미실행이야.

## 실행한 검사

```bash
node --check verification/prepared-1f-tools/full-frame.mjs
node --check verification/prepared-1f-tools/full-frame-fixture.js
node verification/prepared-1f-tools/full-frame.mjs --help
```

세 명령 모두 exit 0이었어. 로그는 `collector-syntax.log`, `fixture-syntax.log`, `help.log`에 있어. 브라우저·GPU·제품 변경·commit·stage는 하지 않았어.

## 해석 범위

`onAfterRender`는 렌더 제출 경로의 근거야. 실제 돔 픽셀이 depth 검사를 통과했는지, 화면이 시각적으로 정상인지, GPU 성능이 개선됐는지를 증명하지 않아. 실제 1f baseline와 최종 candidate의 캡처·성능 실행이 필요해.

새 조건은 아직 숨겨진 돔의 잘못된 표본을 막으므로 최초 준비 대기가 길어질 수 있어. 이 도구의 새 대기 시간을 초기 로딩 성능 지표와 혼동하면 안 돼. native rAF cadence에는 일반적인 collector overhead와 작은 visibility guard 비용이 포함될 수 있어. 프로그램 조회는 측정 밖이지만 첫 Auto frame 이전 wall-clock elapsed에 영향을 줄 수 있으므로 양쪽 revision에 같은 도구를 사용하고 기존 실제 시계를 인위적으로 보정하지 않아.

프로그램 검사는 사용된 base와 overlay의 currentProgram에 한정돼. world cube shader를 별도로 추적하는 기능이나 청각·물리 기기 검증을 추가한 것은 아니야. 새 브라우저 검증을 실행하기 전에는 이 준비본을 browser-PASS로 기록하면 안 돼.
