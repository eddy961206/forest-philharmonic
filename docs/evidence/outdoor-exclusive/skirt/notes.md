# 앉은 치마 관통 수정

원인: 기존 치마는 높이 .28인 열린 원뿔을 뒤로 기울인 형태였다. 수평으로 앞으로 뻗는 허벅지와 무릎이 원뿔 앞면보다 밖에 있었다. 서기에도 같은 치마가 몸통에 고정되어 있었다. 실제 야외 모차르트 교향곡40번의 vn1:0 루나 옆/앞 before 영상에서 재현했다.

수정: 허리, 허벅지 위, 무릎, 밑단의 4개 단면을 24분할한 100 vertex 드레이프 mesh. 서있는 형태의 position/normal GPU morph 1개. setStanding의 다리 모델 교체 시점(.5)에 맞춰 후반부에 직립 형태로 이어진다. 기존 다리/IK/팔 허용값/연미복은 유지한다. celloSeat는 벌어진 무릎을 감싸는 폭으로 생성한다. 현재 vc 캐스트는 모두 정장이다. cast.json은 실제 무대에 생성된 치마 단원 목록이며 바이올린/비올라/하프/플루트/피콜로/색소폰/첼레스타 및 서있는 타악기/합창이 포함된다.

비용: 기존 치마는 독립 DoubleSide 재질로 이미 한 draw였다. 새 치마도 한 mesh 한 draw다. 100 vertex GPU morph이고 프레임당 CPU mesh 재작성이나 cloth simulation을 하지 않는다. 낮은 화질에서는 기존 bakeColor를 적용한다. standalone skirt를 body rigid merge에서 제외하여 morph를 보존한다.

검사: focused-test.txt. 모든 CAST 치마 체형과 별도 celloSeat에 대해 실제 렌더되는 다리 vertex 중 치마가 덮어야 하는 구간에서 4방향 ray가 치마 안쪽에 있는지 검사. 다리 visibility 유지, 단면 vertex 수, 서기 morph 연결과 허리 고정, 기존 tailcoat 회귀 검사 통과.

## 초기 치마 모델 검토 — 기립 미해결

브라우저: 8096 서버, 별도 CDP9224. before/after-front/side.png와 원본 3초 WebM. after-transition.webm은 실제 StageManager orchestraRise(true/false)와 exitAll을 호출한 8.5초 원본 녹화. after-standing/walking.png는 해당 연속영상 도중 캡처했다. 시점은 QA용 director 고정이다. 다리 관통 제거를 확인했다. 서는 자리의 기존 의자와 옷 겹침은 남아 있으며 가구/이동 경로 수정은 이번 범위에 포함하지 않았다. 전체 악기·동작 하네스 및 성능은 root 통합 검증 대상이다. 자기 브라우저 탭을 닫고 disconnect했다.

소스 해시: source-sha256.txt. 제품 변경은 characters.js, 신규 skirt.js, 신규 tests/skirt.test.mjs다. 공용 orchestra/stage/악기 rig는 수정하지 않았다.

## 의자 앞 기립 후속 수정

초기 after-standing.png의 검은 의자 모서리 관통을 보존했다. 기존 Walker는 setStanding으로 몸통 높이만 바꾸고 좌석 home에서 일어났으므로 의자를 통과했다. stage.js에서 비고정악기 치마 단원만 homeYaw 전방으로 기립점을 정했고, 좌석 home 자체와 고정악기 좌표는 바꾸지 않았다. 현재 forward-only-standing.png로 보존한 1차 기립 화면에서는 의자는 해결됐으나 보면대 기둥과 치마가 겹치는 추가 문제를 발견했다. 이것은 최종 승인 화면이 아니며 기립점 측방 보정이 필요하다.

## 최종 기립점

양쪽 후보(local X=±.55, Z=−.30, 체형 scale 반영) 중 이웃 좌석에서 더 먼 쪽을 고른다. 위치를 home+offset으로 매번 계산해 반복/스킵에서 누적되지 않는다. 완전히 앉으면 home으로 돌아온다. 고정악기는 제외한다. 최초 전방 이동만 적용한 사진/영상은 forward-only-*로 보존했고, 최종 사진/영상은 final-*다.

실제 affected CAST는 9명(vn1:0, vn2:0, vn2:2, va:1, fl:0, picc:0, sax:0, tamb:0, tri:0)이다. 최종 focused 검사 7/7 통과. 각 home→기립점의 21지점에서 floorAt가 home.y와 같다. 의자 좌석 실제 .44×.42 범위, 실제 standParts의 상단/기둥 vertex, 다른 좌석 및 다른 단원 동시 기립점과의 간격을 확인했다. 고정악기 위치, home 불변, 스킵 도중 입장/퇴장/솔로기립, 반복 착석도 검사한다. 최종 해시는 final-source-sha256.txt다.

최종 final-standing.png와 final-walking.png를 root도 직접 확인했다. 의자 모서리와 악보대 기둥의 큰 관통이 해소된 것을 확인했다. 전체 단위·동작 검사는 최종 통합 기록을 따른다.


배포한 증거 폴더의 영상은 같은 기본 이름의 MP4다. 원본 WebM은 로컬 QA 작업 폴더에 보존한다. 일부 중간 실패는 사진·JSON만 PR에 보존하며 최종 통과 영상과 구분한다. 전체 인코딩·디코딩 결과는 상위 `media-check.json`에 있다.
