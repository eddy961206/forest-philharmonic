# 지휘자 연미복 뒷자락

실제 야외 공연장에서 모차르트 교향곡40번을 연주하는 지휘자를 옆에서 확인했다. 엉덩이 뒤의 떠 있는 검은 판은 동물 꼬리가 아니라 연미복 뒷자락이다. 지휘자는 부엉이이고 동물 꼬리 생성 대상에 포함되지 않는다.

기존 모델은 중심이 (0, hipY−0.06, +0.2)인 사각판을 X축 +0.35rad로 회전했다. 위쪽 가장자리는 몸통 뒤에서 떨어지고 아래쪽은 앞쪽으로 기울었다. 캐릭터의 앞은 local −Z, 뒤는 +Z이므로 지휘자 전체 방향이나 옷을180도 뒤집을 이유는 없었다.

변경: 허리 뒤 (0, hipY+0.14, +0.12)를 상단 고정점으로 두고 길이0.34의 두 갈래 좁아지는 연미복 자락을 만든다. X축 −0.25rad로 자락이 아래·뒤(+Z)로 내려가게 했다. 다른 정장 단원에게도 같은 접합 구조를 적용한다. 몸통 rigid merge에 포함하므로 별도 자락 draw call을 추가하지 않는다. 팔·IK·접촉 허용값·지휘 방향·카메라·입퇴장 코드는 바꾸지 않았다.

회귀검사 tests/coat-tails.test.mjs는 실제 생성된 자락 상단·밑단 좌표가 최종 merged body mesh에도 있는지 확인한다. 상단이 몸통 capsule 내부에 있고 밑단이 아래·뒤에 있는지, 정지·인사0/0.3/0.55rad·서기0/0.5/1·걷기 다리 자세에서 확인한다. focused-test.txt 참고.

증거: before-side.png 및 before-conducting.webm은 원래 사각판. after-side.png, after-bow.png, after-walking.png와 after-conducting/bow/walking.webm은 수정 모델. 영상은 WebGL canvas의 브라우저 MediaRecorder 원본이며 후처리 인코딩하지 않았다. before/after-model-sha256.txt는 촬영 모델 소스 해시다. 입퇴장 동작은 실제 StageManager의 conductorFace/conductorBow/conductorExit로 구동했다. 테스트용 연주곡 선택 및 옆 카메라 배치는 debug API를 사용했다.

브라우저: 별도 CDP9225, http://127.0.0.1:8096. 기본 Chrome 데스크톱 기능 확인이다. 성능·실제 iPad·전체 동작 하네스는 여기서 검증하지 않았고 루트 통합 검증 대상이다. 자기 탭을 닫고 browser.disconnect를 호출한다.


배포한 증거 폴더의 영상은 같은 기본 이름의 MP4다. 원본 WebM은 로컬 QA 작업 폴더에 보존한다. 일부 중간 실패는 사진·JSON만 PR에 보존하며 최종 통과 영상과 구분한다. 전체 인코딩·디코딩 결과는 상위 `media-check.json`에 있다.
