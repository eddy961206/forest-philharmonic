# 3f 통합의 오디오·런타임 정적 검토

기준 main은 `3f1655b0c035a630adbcfbf19582dd9363386f34`야. a41 측정 중인 8080 코드와 로딩 도구는 바꾸지 않고 별도 integration worktree만 검토했어. 상세 파일 hash와 실행 범위는 [runtime-source-review.json](runtime-source-review.json)에 있어.

## 확인해서 고친 캐시 회귀

새 main은 인터미션의 로비 연주자를 `AudioEngine.addSpot('lobby', ...)`으로 추가해. 기존 PR의 listener 캐시는 귀의 위치·방향이 같으면 바로 반환해서, 고정 귀로 듣는 동안 새 음원의 거리와 air filter가 초기값으로 남았어. `moveSpot`으로 음원을 옮겨도 같은 문제가 생겨. 원래 새 main의 매 프레임 계산에서는 생기지 않던 통합 회귀야.

`_spatialDirty`를 귀 pose와 따로 관리하게 고쳤어. 새 음원 또는 실제 source 좌표 변경은 다음 listener 호출에서 거리·고음 감쇠만 다시 계산하고, 변하지 않은 귀의 AudioParam은 중복 예약하지 않아. 동일 좌표 이동은 무효화하지 않고, init과 listener 재연결 때 상태를 초기화해. 주파수 계산식·Nyquist clamp·보간 상수·샘플·음표·스케줄은 그대로야.

새 회귀 3개는 정지 귀에서 add 후 600회 반복, legacy 귀에서 move/동일 좌표/아주 작은 좌표 차이/입력 복사·Nyquist, async init 이전 dirty reset을 확인하도록 작성했어. **테스트 본문은 아직 실행하지 않았어.** Node syntax 두 파일과 `git diff --check`만 exit 0으로 확인했어.

## 보존한 동작과 남은 범위

Performance와 crowd의 a41/3f 원본 파일은 바이트가 같아. Worker/helper도 a41 측정 후보와 같아. 이것은 소스 연결 근거이고 새 main에서의 PCM·장시간 재생 통과를 뜻하지 않아. AudioEngine의 새 upstream spot 동작을 살리면서 위 무효화만 추가했어.

RoomClient와 server/rooms의 새 vote 경로는 3f 원문과 같아. 기존 15개 프로토콜 결과를 새 encore 투표 검사의 통과로 확장하지 않아. 실제 로비·인터미션·잠자기·깨기·encore는 별도 동작 검사가 필요해.

main 담당자에게 잠자기 직전 예약 rAF와 wake의 중복 예약 위험, hidden/sleep 구간의 FPS 제외, phase/quality hold와 실패한 recovery의 재상향 차단을 전달했어. main/quality와 UI 소스는 이 작업에서 수정하지 않았어.
