# 야외 전용 24곡 · 저사양 모드 · 연주 자세 · 후면 카메라

2026-10-25 KST. 기존 PR #20, `feat/orchestral-repertoire`에 누적하는 변경이다. 이전 90곡 검증은 [이전 기록](outdoor-expansion-validation.md)에 별도로 보존한다.

## 변경 범위

- 야외에서 다른 공연장과 공유하던 16곡을 새 작품으로 교체했다. 기존 야외 8곡은 유지했다. 홀 41곡·스피어 41곡·야외 24곡, 고유 106곡이다. 프로그램 간 중복과 카탈로그 누락을 자동 검사한다. [전체 판본과 출처](outdoor-repertoire-sources.md).
- 곡의 악장·선택한 편곡 전체를 사용한다. 피아노 독주, 현악, 관악, 관현악, 오르간, 합창을 포함한다. 피아노 두 대/네 손 악보는 앱의 한 대에 통합하며 실제 두 피아니스트를 구현했다고 표시하지 않는다.
- 피가로·세비야의 이발사는 독립 트랙의 MIDI 채널 충돌을 분리한다. 이발사의 현악 주법은 원본 MusicXML의 실제 위치로 복원한다. 타이스의 조옮김과 보케리니의 D.C.도 원본·변환·SHA를 보존한다.
- 표를 가진 관객의 공연장 로딩 중 옛 닉네임/공연장 선택 UI가 보이지 않도록 초기 HTML에서 숨긴다. 직접 로비와 초대 흐름에서는 초기화 뒤 필요한 컨트롤을 표시한다.
- 광장 매표소와 공연장 설정에 저사양 모드를 추가했다. 렌더 30 fps 목표, DPR 최대 1, 자동 해상도 조절, 관객 표현 35%, 입자 20%, 추가 조명/효과 제한, 중계 2 Hz, 스피어 3D 세계 갱신 최대 10 Hz를 적용한다. 음표·연주자·좌석 점유·방·기존 기기의 음원 품질은 유지한다. 일반 모드로 전환하면 기존 사용자 설정에 따라 효과와 표현량을 복구한다. 초기 모델 구조는 재입장 전까지 유지한다.
- iPad Chrome/Safari 등 Apple 터치 기기에서는 자동 네이티브 전체화면 진입을 생략한다. 카메라 영역의 터치 드래그만 스크롤을 막고 패널의 스크롤은 유지한다. 브라우저 전체화면 버튼은 남아 있으며, 직접 켠 전체화면의 시스템 종료 제스처까지 강제로 막지는 않는다.
- 첼로만 무릎을 벌린 자세로 구성한다. 악기를 무릎 사이에 놓고, 활의 이동 범위는 실제 어깨·팔 길이·관절 제한에서 계산한다. 피치카토는 지판 하단에서 뜯도록 바꿨다. 팔 길이나 검사 허용값은 늘리지 않았다.
- 자동 카메라의 단원 후면·객석 방향 구도는 [연출 문서](cinema-direction.md)에 정리한다.
- [단원 입퇴장 건너뛰기](skip-stage-transitions.md)를 설정에 추가했다. 걷는 이동만 즉시 끝내고 박수·인사·곡 사이 휴식은 유지한다. 함께 보기에서는 방장이 설정하며 손님에게 동기화한다.

## 공통 연주 표시와 무대 이동

야외 공연장은 음표·발밑 표시 조건에 `!IS_OUTDOOR`가 있어 설정을 켜도 효과를 생성하지 않았다. 세 공연장 모두 같은 사용자 설정을 적용하도록 바꿨다. 밝은 야외 나무 바닥에서는 일반 알파 합성과 조금 진한 보라색을 사용한다. 실제 광원을 추가하지 않고 기존 원판을 재사용한다.

저사양 모드에서도 연주 중인 단원의 음표와 발밑 표시는 남긴다. 입자 풀은 재사용하고 동시 음표를 최대 24개(초기 경량 모델 8개)로 제한한다. 일시정지·이동 중·비활성 단원에는 표시하지 않는다. 설정 해제는 즉시 적용되며 두 효과의 독립 토글과 일반 모드 복구도 검사한다. 세 공연장 × 활성/해제/저사양의 **9개 조합**과 focused 검사 3개가 통과했다. [원자료](evidence/outdoor-exclusive/performer-effects/report.json) · [야외 실제 화면](evidence/outdoor-exclusive/performer-effects/outdoor-active.png).

단원 입퇴장 생략은 기본 꺼짐이다. 이동 중 켜도 걷는 동선만 완료하며 인사·박수·곡 사이 휴식은 유지한다. 실제 2인 편성에서 박수/인사 약 3.48초(코드 3.5초, 관찰 40ms 간격), 설정한 휴식 4초가 약 4.04초로 관찰됐다. 방장·손님 설정 동기화와 새 방장의 자기 설정 복구, 로컬 저장을 확인했다. [별도 방법과 결과](skip-stage-transitions.md).

## 지휘자와 연주 동작

지휘자 옆에서 떠 있던 검은 판은 연미복 뒷자락이었다. 기존 판의 상단이 몸에서 떨어지고 밑단이 앞으로 기울어 있었다. 허리 뒤에 붙은 두 갈래 자락으로 바꾸고 아래·뒤로 떨어지게 했다. 캐릭터 앞은 local −Z, 뒤는 +Z이며 지휘 방향 자체는 맞았다. 자락을 기존 몸통 메시와 합쳐 추가 draw call을 만들지 않는다.

지휘·인사·걷기 상태의 실제 화면과 연속 영상을 확인했다. 상단 접합·아래/뒤 방향·실제 최종 병합 메시의 꼭짓점을 검사한다. [원인과 검사](evidence/outdoor-exclusive/conductor/notes.md) · [수정 전](evidence/outdoor-exclusive/conductor/before-side.png) · [수정 후](evidence/outdoor-exclusive/conductor/after-side.png) · [지휘 영상](evidence/outdoor-exclusive/conductor/after-conducting.mp4).

추가로 바이올린·플루트·트롬본·팀파니·피아노·합창을 실제 공연에서 각각 8초 녹화했다. 눈에 띄는 악기·악보대 교차와 모델 배치를 확인하며, 작은 미감 차이는 수정 범위에서 제외했다. 트롬본은 악보대 x를 0.1→−0.4로 옮겨 슬라이드 공간을 확보했다. 실제 판·받침턱과의 간격을 4,914자세에서 검사했다. 팀파니는 세 북의 테두리 사이를 최소 2.87cm로 벌리고 바깥 북의 안쪽을 치도록 했다. 팔 길이·허용값은 늘리지 않았다. 두 사례의 집중 검사와 수정 후 각 8초 영상이 통과했다. 개별 발견과 수정 전후 결과는 [대표 연주 검토 기록](evidence/outdoor-exclusive/motion-spot-review/notes.md)에 정리한다.

## 치마와 기립 동작

앉은 치마가 짧은 원뿔 형태라 수평 허벅지·무릎을 덮지 못했다. 허리→허벅지 위→무릎→밑단의 네 단면을 연결한 작은 모델로 바꿨다. 서기·앉기에서는 GPU morph 하나로 모양을 이어준다. 다리를 숨기지 않으며 기존 한 mesh/draw를 유지한다. 매 프레임 천 물리 시뮬레이션이나 메시 재생성은 하지 않는다.

실제 전환 영상을 보다가 일어날 때 의자 모서리가 옷을 뚫는 문제도 찾았다. 제자리에서 높이만 바꾸던 기립을 고쳐, 치마를 입은 비고정악기 단원은 의자 옆으로 비켜 선다. 양쪽 후보 중 이웃과 더 떨어진 쪽을 선택한다. 완전히 앉으면 같은 좌석으로 돌아오며 고정악기의 연주 위치는 유지한다. 전방으로만 이동한 첫 시도는 악보대와 겹쳐 실패 기록으로 남겼다.

실제 해당 단원 9명에 대해 이동 경로 21지점의 바닥 높이, 의자 크기, 실제 악보대 꼭짓점, 다른 좌석과 동시 기립 위치를 검사한다. 앉은 치마는 전체 CAST 치마 체형과 추가 첼로 자세의 실제 다리 표면으로 검사한다. focused 검사 7개와 최종 앞·옆 연주/서기→앉기→퇴장 8.5초 영상을 확인했다. 이 표본 검사는 모든 임의 체형·모든 가구 배치의 연속 충돌 증명은 아니다.

[수정 전](evidence/outdoor-exclusive/skirt/before-side.png) · [앉은 모습 수정 후](evidence/outdoor-exclusive/skirt/final-side.png) · [최종 기립](evidence/outdoor-exclusive/skirt/final-standing.png) · [최종 전환 영상](evidence/outdoor-exclusive/skirt/final-transition.mp4) · [원인·중간 실패·검사](evidence/outdoor-exclusive/skirt/notes.md).

## 현재 확인한 결과

- 로컬 통합 단위·회귀 검사 **312개 통과**.
- 전체 동작 검사 **106곡·51단원·30rig·177,660프레임·6,110,324팔 표본**, 실패 0. 최종 첼로 최대 손 접점 오차 1.46cm로 기존 3cm 기준 안이다.
- 야외 24곡을 실제 음향 엔진으로 각각 12초 발췌 렌더했다. 샘플 695개 로드 성공. 무음·클리핑·비정상 값·예외 0, 최대 peak 0.889924. 선택한 구간에 시작된 음의 원래 길이와 잔향을 보존한다.
- 기능 브라우저 검사 8항목 통과. 광장 체크 → 비공개 표 → main 모듈 지연 로딩 → 입장 → 재생 중 화질 전환 → 390px 버튼 배치 → 실제 터치 입력 → 직접 로비를 확인했다. 콘솔 오류·경고 0.
- 화질 전환 중 같은 곡·AudioContext·방 객체·좌석 점유 158개와 착석 위치를 유지했다. 표현 관객은 표본에서 158명 ↔ 59명, DPR 1.5 ↔ 1로 바뀌었다. 무작위 관객 표본 수는 실행마다 달라질 수 있다.
- iPad Chrome을 모의한 입장과 아래 방향 터치 드래그에서 자동 전체화면 호출 0회이며 카메라 pitch가 실제로 변했다. 패널 스크롤과 직접 로비는 유지했다.
- 최종 제품 커밋 `4fb86a3eb56cf7fcf5628cc22df326bbee90ff82`의 GitHub CI: Ubuntu Node 18·22, Windows Node 22 모두 통과했다. 전체 악보 동작 검사는 Ubuntu Node 22 작업에서 실행한다. [실행 기록](https://github.com/eddy961206/forest-philharmonic/actions/runs/40164443374).

## 소스별 검증 범위

기능별 영상과 수치 검사는 해당 시점의 소스 해시를 각각 보존한다. 후속 의상 변경 뒤 이전 영상까지 다시 촬영했다고 표시하지 않는다. 최종 전체 동작 검사와 성능 측정은 같은 최종 제품 소스를 사용한다.

| 검증 | 제품 JS SHA-256 | 범위 |
| --- | --- | --- |
| 로딩·iPad 모의·초기 후면·첼로 | `45419db4520f32265f7b6e723c27ad5596a9d764f80960822d1aa6c8daa8878a` | 해당 기능의 실제 브라우저/영상 |
| 입퇴장 생략 | `67f2e4a56f5d14351bb41d60833e8181796fe3bf6dd814e9feee1d457192e383` | 방장/손님·박수·간격 |
| 공통 음표·표시 | `f6cd0a4f7b153f5a5e492e8ff9f96221fdbf7c521a7ddab150970e4e9eaa7d5f` | 3개 공연장 × 3개 모드 |
| 하강 카메라 v2 | `e277e0f88f5f422bfe53e5db46d905163c8dc1fa882fd0dcc1eb1c7846137694` | 홀·스피어 각 50초 |
| 트롬본·팀파니 최종 | `622bf9896fad273b8301e2b139475b5c8e8eac34ac7fa85ed3cdefdbc38c3b1e` | 각 8초, 캡처 시작/끝 일치 |
| 최종 전체 검사·성능 | `d7774508fe3847b038b40a8470957f276b3c2cb772d7ce1a3e002e0c94540211` | 기립 보정까지 포함 |

최종 검증 입력(악보·검사 포함) SHA-256: `cf71fee130aad7cc693e93157eb96059629fa1d6a6628e36ad3fa7e8d9929215`, 255파일. 보고서의 `baseCommit`은 실행 시작 시 Git HEAD이며, 아직 커밋 전이던 수정도 `sourceSHA256`에 포함한다.

## 검증 방법

최종 결과와 소스 해시는 아래 원자료를 기준으로 기록한다. 성능 측정은 녹화·인코딩·단위 검사·오디오 렌더와 동시에 실행하지 않는다.

```sh
python3 tools/build_repertoire.py --check
python3 tools/prepare_outdoor_chamber.py --check
npm run verify:motion -- --out work/outdoor-exclusive/verification
CDP_PORT=9225 QA_OUT=work/outdoor-exclusive/modes node tools/qa/verify-accessibility-modes.mjs
QA_OUT=work/outdoor-exclusive node tools/qa/render-outdoor-audio.mjs
QUALITY_MODE=high CAMERA=cinema QA_OUT=work/outdoor-exclusive node tools/qa/quality-optimization-measure.mjs high outdoor 20 measure
QUALITY_MODE=efficient CAMERA=cinema QA_OUT=work/outdoor-exclusive node tools/qa/quality-optimization-measure.mjs efficient outdoor 20 measure
```

로컬 서버 8096과 전용 Chrome 9224/9225를 사용한다. Python 변환은 `tools/requirements-music.txt`의 mido 버전을 사용한다. 브라우저 도구는 `PUPPETEER_PATH` 또는 전역 `puppeteer-core`를 지원한다.

## 실제 영상 확인

자동 카메라를 야외 120초·홀 40초·스피어 40초·세로 피아노 독주 40초 녹화했다. 총 24장면에서 연주 대상 자격·장면 간격·페이지 표시 상태 검사를 통과했고 콘솔 오류는 없었다. 후면 5장면에서 어깨 너머·뒤쪽 사선·합주 뒤 전경 세 구도를 모두 확인했다. 확인한 장면의 시작과 끝 프레임에서 머리·악기·지형 관통은 보이지 않았다.

| 영상 | 길이 | 원자료 |
| --- | ---: | --- |
| 야외 자동 편집 | 120초 | [영상](evidence/outdoor-exclusive/rear-camera/outdoor-rear.mp4) · [장면 기록](evidence/outdoor-exclusive/rear-camera/outdoor-rear.json) |
| 홀 후면 | 40초 | [영상](evidence/outdoor-exclusive/rear-camera/hall-rear.mp4) · [장면 기록](evidence/outdoor-exclusive/rear-camera/hall-rear.json) |
| 스피어 후면 | 40초 | [영상](evidence/outdoor-exclusive/rear-camera/sphere-rear.mp4) · [장면 기록](evidence/outdoor-exclusive/rear-camera/sphere-rear.json) |
| 세로 피아노 | 40초 | [영상](evidence/outdoor-exclusive/rear-camera/piano-portrait-rear.mp4) · [장면 기록](evidence/outdoor-exclusive/rear-camera/piano-portrait-rear.json) |
| 첼로 곰·판다 | 각 6초 | [곰 영상](evidence/outdoor-exclusive/cello/after-cello-0.mp4) · [판다 영상](evidence/outdoor-exclusive/cello/after-cello-1.mp4) |

[시간순 장면](evidence/outdoor-exclusive/rear-camera/outdoor-sequence.jpg) · [후면 장면의 시작/끝](evidence/outdoor-exclusive/rear-camera/rear-motion-sequence.jpg) · [첼로 수정 전](evidence/outdoor-exclusive/cello-before.png) · [수정 후 곰](evidence/outdoor-exclusive/cello/after-cello-0.png) · [수정 후 판다](evidence/outdoor-exclusive/cello/after-cello-1.png).

피아노 세로 화면은 연주자와 건반 일부를 왼쪽 전경에 담는 구도다. 첼로 영상은 실제 바흐 Air 연주 중 근접 카메라로 촬영한 무음 영상이다. 카메라 영상은 실제 자동 편집을 사용했고, 곡 선택과 시작 위치 이동 외에 장면 순서·재생속도·카메라를 검사 전용으로 바꾸지 않았다.

전후·실패 기록을 포함한 보존용 MP4 32개는 원본 브라우저 WebM에서 H.264/AAC MP4로 변환하고 전체 디코딩을 통과했다. 일정한 30fps 시간축으로 출력하며 원래 공연 시간은 유지한다. 최초 가변 프레임 출력의 스피어 영상에서 null muxer 시간값 중복 경고가 발생해 30fps로 다시 변환했다. 세로 영상의 홀수 픽셀 크기는 우측·하단에 각 1px를 추가해 H.264 규격에 맞췄다. 원본 Opus 헤더 경고는 있었으나 최종 MP4의 전체 디코딩 오류는 없었다. [최종 변환·전체 디코딩 결과](evidence/outdoor-exclusive/media-check.json)에 경고와 검사 결과를 보존한다.

## 홀·스피어 하강 카메라

최종 v2는 단원 뒤 중앙에서 6.5m→3.5m로 내려가며 시선을 객석 위로 올린다. 실제 단원 위치·크기·현재 곡의 배정을 이용해 33개 경로 표본에서 머리와 상체가 최소 3명(3명 미만 편성은 전원) 화면 아래쪽에 남는지 검사한다. 머리·고정 악기·지형 회피도 함께 확인한다. 조건을 충족하지 않으면 기존 후면 구도를 유지한다. 이 계산은 장면을 선택할 때만 한다.

홀·스피어 각각 50초의 실제 자동 편집을 녹화했다. 시작·중간·끝 화면을 직접 확인했다. 아래 투영 수치는 물체에 의한 가림까지 계산한 수가 아니므로 실제 화면 확인과 구분한다.

| 항목 | 홀 | 스피어 |
| --- | ---: | ---: |
| 자동 장면 수 | 5 | 6 |
| 실제 카메라 표본 수(250ms 간격) | 46 | 39 |
| 하단에 머리·상체가 남은 최소 단원 | 18 | 9 |
| 실제 카메라 높이 | 6.50→3.548m | 6.50→3.548m |
| 위아래 시선 각도 | −7.99→15.17도 | −7.99→19.42도 |

[홀 영상](evidence/outdoor-exclusive/grand-reveal/hall-v2-final.mp4) · [홀 시간순 화면](evidence/outdoor-exclusive/grand-reveal/hall-v2-sequence.jpg) · [스피어 영상](evidence/outdoor-exclusive/grand-reveal/sphere-v2-final.mp4) · [스피어 시간순 화면](evidence/outdoor-exclusive/grand-reveal/sphere-v2-sequence.jpg) · [전체 수치와 버전 구분](evidence/outdoor-exclusive/grand-reveal/v2-README.md).

카메라 focused 검사 16개와 두 영상의 활성 대상·장면 간격·visibility·오류 검사가 통과했다. v1은 스피어 끝 장면에서 단원이 사라져 요구 미달로 판정했다. v2의 첫 시도는 안전 전경으로 바뀐 뒤 독립 하강 후보를 건너뛰던 분기 문제가 있어 수정했다. 최종 영상에는 이 문제를 고친 v2만 사용한다.

## 원자료

- [전체 검사 요약](evidence/outdoor-exclusive/verification/verification-summary.json) · [단위 검사 로그](evidence/outdoor-exclusive/verification/unit-tests.log) · [동작 결과](evidence/outdoor-exclusive/verification/motion-audit.json)
- [오디오 24곡 결과](evidence/outdoor-exclusive/audio.json) · [피가로 발췌](evidence/outdoor-exclusive/mozart-figaro-overture.wav) · [백조 발췌](evidence/outdoor-exclusive/saint-saens-the-swan.wav)
- [로딩·저사양·iPad 터치 검사](evidence/outdoor-exclusive/modes/accessibility-modes.json)
- [입퇴장 옵션·박수 간격·방장/손님 동기화](evidence/outdoor-exclusive/skip-stage/result.json)
- [최초 실패](evidence/outdoor-exclusive/initial-failure/verification-summary.json) · [첼로 후속 수정](evidence/outdoor-exclusive/cello/notes.md)

## 발견한 실패와 수정

첫 전체 검사는 첼로 오른손 접점 오류 92건과 제거된 야외 곡을 참조한 녹화 사례 1건으로 실패했다. 첼로 다리만 벌리고 악기를 앞으로 옮기면 긴 활 끝에서 오른팔이 과하게 펴졌다. 실제 도달 범위 안에서 활을 움직이도록 고쳤다. 후속 검사에 남은 피치카토 3프레임도 실제 뜯는 위치를 지판 하단으로 옮겨 고쳤다. 과거 실패 원자료를 최종 성공 결과와 구분해서 보존한다.

저사양 렌더는 일반 브라우저 콜백 횟수가 아닌 실제 렌더 완료 번호 `stats.sequence`로 측정한다. 프레임 선택에는 브라우저의 애니메이션 타임스탬프를 사용해서 콜백 실행 시각의 작은 지연이 불규칙한 16/50 ms 간격으로 증폭되지 않게 한다.

최종 통합 검사 전 한 실행은 검사 도중 카메라 소스·테스트가 바뀌어 입력 해시 일치 조건에서 실패했다. 단위·동작 검사 개별 통과와 전체 실행 성공을 구분했다. [입력 변경 실패 기록](evidence/outdoor-exclusive/inputs-changed-failure/verification-summary.json)을 보존하고, 소스 동결 뒤 전체 검사를 다시 수행했고 최종 실행은 입력 해시 유지와 전체 통과를 확인했다.

카메라 녹화의 첫 시도는 Puppeteer의 기본 180초 통신 제한으로 끝나지 못했다. 제한을 240초로 늘려 120초로 재녹화했다. 첫 홀 영상은 다음 검사에서 QA 탭이 닫혀 중단되어 단독으로 재녹화했다. 두 실패는 앱 런타임 오류와 구분하며 최종 성공 영상만 통과 결과에 포함한다. 공간 단독 구도로 끝난 스피어 v1은 `sphere-v1-rejected.mp4`로 따로 보존한다.

## 독립 성능 측정

Mac mini M4 / Chrome 156 / 1200×800 / DPR 1, 실제 연주와 자동 카메라에서 각 20초 측정했다. 다른 QA 공연 탭을 닫고 녹화·영상 인코딩·전체 검사·오디오 렌더를 모두 종료한 뒤 순서대로 실행했다. 스크린샷에서 공연장·단원·곡 이름을 확인했고 모든 결과의 `visible=visible`, `phase=playing`, 브라우저 오류 0을 확인했다. 총 100초 표본이며 장시간 열화나 최악의 모든 장면 측정은 아니다.

| 모드 | 평균 fps | 프레임 p95(ms) | CPU 제출 평균(ms) | draw/frame | 100ms 초과 지연 음 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 야외 일반 | 59.95 | 17.20 | 4.09 | 774.5 | 0 |
| 야외 저사양 | 30.00 | 33.90 | 2.40 | 193.0 | 0 |
| 야외 저사양 + CPU 4배 감속 모의 | 30.00 | 35.30 | 3.79 | 204.4 | 0 |
| 홀 저사양 | 30.00 | 34.00 | 3.07 | 310.0 | 0 |
| 스피어 저사양 | 30.00 | 34.70 | 2.46 | 211.4 | 0 |

p95는 프레임의 95%가 그 시간 안에 그려졌다는 뜻이다. 저사양은 30fps를 목표로 제한한다. CPU 4배 감속은 Chrome의 모의 조건이며 GPU·메모리·실제 구형 기기를 재현하지 않는다. 100ms 지연 음은 엔진 예약 시각을 검사한 값이며 모든 오디오 드롭아웃을 측정한 값은 아니다.

같은 야외 곡의 이 표본에서 저사양의 초당 draw 호출은 일반 대비 약 87.5% 적었다. 일반/저사양은 자동 카메라의 구도가 완전히 같은 프레임 비교가 아니므로 이것을 모든 장면의 고정 개선율로 해석하지 않는다. 최종 치마·기립·악기 배치가 모두 포함된 동일 제품 소스에서 측정했다.

[측정 요약](evidence/outdoor-exclusive/performance/summary.json) · [야외 일반](evidence/outdoor-exclusive/performance/high-outdoor.json) · [야외 저사양](evidence/outdoor-exclusive/performance/efficient-outdoor.json) · [CPU 감속](evidence/outdoor-exclusive/performance/efficient-cpu4-outdoor.json) · [홀](evidence/outdoor-exclusive/performance/efficient-hall.json) · [스피어](evidence/outdoor-exclusive/performance/efficient-sphere.json).

## LAN 실행 확인

동일 네트워크의 최신 전체 앱 주소는 `http://192.168.55.22:8097/`다. 공연장 한 곳으로 고정하지 않고 광장에서 시작한다. Mac에서 LAN 주소로 받아온 HTML·주요 JS·곡 목록 12개가 현재 파일과 SHA-256이 일치했다. 이 주소는 공개 배포가 아니며 실제 휴대폰 접속 시험을 대신하지 않는다. [HTTP·파일 해시 결과](evidence/outdoor-exclusive/lan-check.json).

## 미검증 범위

실제 iPad Chrome·Safari, 실제 구형 휴대폰/노트북, 장시간 발열·메모리 압박은 미검증이다. iPad Chrome 기능 검사는 데스크톱 Chrome에서 UA·터치·화면 크기를 재현한 것이다. CPU 감속을 사용한 측정도 실제 구형 기기 측정과 구분한다. 신호 렌더는 발췌 구간의 무음·클리핑·비정상 값을 확인하며 전곡 실시간 청취 또는 실제 오케스트라 실황의 예술적 품질을 보장하지 않는다.

첼로 간격 검사는 실제 악기 표면과 다리 중심선 표본을 비교하는 회귀 검사다. 모든 연속 자세의 엄밀한 충돌 증명은 아니므로 실제 연주 영상과 함께 확인한다. main 병합과 Vercel 배포는 하지 않는다.
