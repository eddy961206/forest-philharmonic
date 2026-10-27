# 단원 입퇴장 건너뛰기

설정 → 소리 → **단원 입퇴장 건너뛰기**를 켜면 단원과 지휘자가 걷는 이동만 즉시 끝낸다. 기본값은 꺼짐이다. 선택은 `fp-settings.skipStageTransitions`에 저장되어 다음 입장에도 유지된다.

박수 소리, 인사, 튜닝, 시작 전 정적, 곡 사이 쉬는 시간은 기존 공연 순서를 유지한다. 이동 중에 켜면 현재 목적지로 이동을 끝낸다. 다시 끄면 다음 이동부터 원래 걷기 동작을 사용한다.

## 구현과 확장

`StageManager.setSkipTransitions()`는 `walking`/`queued` 상태만 완료한다. 입장 시 원래 도착 콜백을 적용해서 독주자의 선 자세와 합창단의 선 자세를 보존한다. 현재 인사·앉기·연주 상태는 바꾸지 않는다. `runConcert`의 전체 빠른 진행(`quick`) 옵션과 별개이며 `endOfPiece`의 박수·간격 대기는 그대로다.

같이 보기에서는 방장이 설정한다. 명령과 공연 상태 스냅샷에 값을 포함하며 손님 컨트롤은 잠근다. 손님의 개인 저장값은 방장 값으로 덮어쓰지 않는다. 방장을 넘겨받거나 혼자 보기로 돌아가면 자신의 저장 설정을 적용한다. 서버는 명령/상태의 크기를 제한하되 이 필드를 제거하지 않는다.

## 확인 결과 — 2026-10-25

- 집중 검사 3개: 독주·합창·지휘자 입퇴장, 인사 유지, 이동 중 켜기, 끄기, 단원 교체, 전체 퇴장.
- 실제 데스크톱 Chrome의 방장/손님 페이지: 기본 꺼짐, 새로고침 보존, 입장 중 켜서 이동 중 단원 0명, 손님 설정 잠금과 동기화, 다음 곡 즉시 배치, 끄기 동기화.
- 듀오의 실제 곡 끝 박수·인사 구간 약 3.48초, 설정한 4초 휴식은 약 4.04초로 관측했다. 상태 관측 간격은 40ms이며 기존 코드의 대기는 각각 3.5초와 4초다. 입장 환영과 곡 끝의 박수 호출, 인사 시작/끝을 기록했다.
- 콘솔 예외 0. 곡 끝으로 이동해 실제 종료 순서를 관측했으며 공연 시간이나 타이머를 가속하지 않았다.

초기 검사 도구가 듀오에 관현악용 8초 기준을 적용해 실패했다. 제품 수정 없이 듀오의 기존 3.5초 기준과 인사 호출로 검사를 고쳤다. 초기 실패도 보존한다.

제품 JS SHA-256: `67f2e4a56f5d14351bb41d60833e8181796fe3bf6dd814e9feee1d457192e383`.

```sh
node --experimental-loader ./tests/helpers/three-loader.mjs --test tests/skip-stage-transitions.test.mjs
APP_PORT=8096 CDP_PORT=9225 QA_OUT=work/skip-stage node tools/qa/verify-skip-stage.mjs
```

`PUPPETEER_PATH` 또는 전역 `puppeteer-core`와 실행 중인 로컬 서버/전용 Chrome이 필요하다. [브라우저 원자료](evidence/outdoor-exclusive/skip-stage/result.json) · [설정 화면](evidence/outdoor-exclusive/skip-stage/settings.png) · [박수 화면](evidence/outdoor-exclusive/skip-stage/applause.png) · [초기 검사 기준 오류](evidence/outdoor-exclusive/skip-stage/initial-wrong-orchestra-assertion.json).

실제 iOS, 전곡 완주, 앙코르 투표를 포함한 전체 공연 종료를 브라우저에서 검증한 것은 아니다. 전체 퇴장·지휘자 이동은 집중 단위 검사로 확인했다.
