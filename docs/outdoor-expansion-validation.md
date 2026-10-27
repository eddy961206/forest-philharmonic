# 야외 신곡·음향·카메라·연결 안정성 개선

2026-10-25 KST. 기존 PR #20 `feat/orchestral-repertoire`에 누적한 변경이다. main 병합과 Vercel 배포는 하지 않았다.

## 달라진 경험

- 기존 82곡과 다른 8곡을 야외 프로그램 앞에 추가했다. 고유 **90곡**, 홀 41곡·스피어 41곡·야외 24곡(새 8곡 + 기존 선곡 16곡)이다. [곡별 길이·편성·원본·라이선스](outdoor-repertoire-sources.md)를 보존했다. 자장가는 55초 한 절 전체이며 나머지는 2분31초~7분17초다.
- 음향 엔진: 평탄한 MIDI에 악절의 시작·중간·끝 강약과 음색 변화를 적용했다. 원본 다이내믹은 보존한다. 짧은 현악·관악 음의 어택/릴리스를 음 길이에 맞췄다. 곡 전체의 실제 chairs 합집합으로 합주 복제음을 조절하고, 독주 한 명은 드라이/잔향 복제음을 모두 끈다. 추가 샘플 뱅크·보이스 없이 처리한다.
- 자동 카메라: 현재 울리는 단원을 우선하고 반주 화음의 음 개수 편향을 제거했다. 소편성/조용한 단원은 10~12초 머문다. 이동 경로의 머리·지형 가림을 검사한다. 피아노는 높은 사선·뚜껑 반대쪽 얼굴·건반 뒤쪽으로 구도를 나눴다.
- 야외: 입구·중앙 통로·뒤쪽 횡단 통로를 하나의 자갈길로 연결했다. 같은 재질을 합쳐 mesh 9개를 줄이고 정적 mesh의 로컬 행렬 재계산을 껐다.
- 곡 로딩: 재생과 다음 곡 단원 준비가 같은 다운로드를 공유한다. 큰 악보는 최근 4개만 보관한다. 실패는 재시도하고, 실패한 사전 읽기가 빈 악단으로 굳지 않는다. 15초 제한으로 멈춘 요청을 끝낸다.
- 멀티플레이: 옛 소켓의 늦은 메시지를 무시한다. 다른 탭으로 대체된 연결은 재연결 경쟁을 끝낸다. 혼자 있는 방장도 같은 페이지에서 복귀하면 공연 상태를 유지한다.

## 최소 검증 범위와 결과

| 검사 | 결과 |
|---|---|
| 통합 회귀·동작 하네스 1회 | 289개 통과. 90곡·51단원·30rig·152,610프레임, 실패 0 |
| 마지막 피아노 측면 구도 수정 후 | 카메라 집중 검사 10개 통과 + 45초 실제 자동 연주 영상 |
| 새 8곡 실제 엔진 신호 렌더 | 곡당12초에 시작된 음과 이후 지속음·잔향3초, 695개 샘플 로드 성공, 무음/클리핑/비정상 값/예외 없음 |
| 실제 브라우저 2개 | 개인 방장 재연결 → 관객 중간 입장 → 관객 재연결 → 방장 퇴장/승계 통과 |
| 연속 화면 | 짐노페디 PC45초, 교향곡40번 세로40초. 실제 자동 카메라와 오디오를 녹화. 대상 자격·간격·visibility·오류 검사 통과 |
| 실제 합주 성능 | 녹화·인코딩·하네스를 끝낸 뒤 별도 측정. 교향곡40번 199초에서 탐색 후5초 준비+20초 측정 |

두 클라이언트의 서버 시계 기준 연주 오차는 중간 입장 0.085초, 관객 재연결 후 0.074초였다. 작은 로컬 표본이며 인터넷 지연 보장은 아니다.

교향곡40번에서 20초당 음표 시작 수가 가장 많은 구간은199초(842개)다. 해당 구간에서 자동 카메라를 켠 상태로 측정했다. PC1200×800 high, 모바일390×844/DPR2 low, Mac mini M4/Chrome156이다.

| 환경 | 평균 FPS | 프레임 p95 ms | 렌더 제출 p95 ms | 100ms 초과 늦은 음 |
|---|---:|---:|---:|---:|
| PC high | 59.95 | 18.20 | 4.70 | 0 |
| 모바일 Chrome 에뮬레이션 low | 59.95 | 18.10 | 3.10 | 0 |

## 직접 확인한 화면과 남은 한계

녹화한 시간순 프레임에서 피아노 머리 잘림·뚜껑의 얼굴 가림을 발견했다. 높은 구도와 뚜껑 반대편으로 고친 뒤 최종 영상에서 확인했다. 세로 합주 영상에서는 관악기·현악기·지휘자와 객석 시점, 신체·악기 가림을 확인했다. 녹화는 움직이는 실제 WebGL/WebAudio이고, 사람이 전곡을 처음부터 끝까지 시청·청취한 검사는 아니다. 프레임 표본으로 모든 동작의 미감을 증명하지 않는다.

실제 iPhone/Safari, 장시간 발열, 느린 외부 네트워크, 대규모 동시 접속은 미검증이다. 독주 소리의 공간 위치는 기존 섹션 중심을 사용한다. 곡 안에서 독주와 합주가 교대할 때 순간별 인원까지 바꾸지는 않는다. 음향 신호 검사와 표현 처리 개선이 실제 오케스트라 실황이나 감동의 정도를 보장하지는 않는다.

## 재현 명령

```sh
npm run verify:motion -- --out work/outdoor-expansion/verification
QA_OUT=work/outdoor-expansion node tools/qa/render-outdoor-audio.mjs
QA_OUT=work/outdoor-expansion node tools/qa/verify-room-reconnect.mjs
QA_OUT=work/outdoor-expansion QA_LABEL=piano SONG_ID=satie-gymnopedie-1 START_SECONDS=0 node tools/qa/record-cinema.mjs outdoor 45
MOBILE=1 QA_OUT=work/outdoor-expansion QA_LABEL=orchestra-mobile SONG_ID=mozart-symphony-40 START_SECONDS=55 node tools/qa/record-cinema.mjs outdoor 40
CAMERA=cinema QA_OUT=work/outdoor-expansion SONG_ID=mozart-symphony-40 START_SECONDS=199 node tools/qa/quality-optimization-measure.mjs desktop outdoor 20 measure
MOBILE=1 CAMERA=cinema QA_OUT=work/outdoor-expansion SONG_ID=mozart-symphony-40 START_SECONDS=199 node tools/qa/quality-optimization-measure.mjs mobile outdoor 20 measure
```

로컬 서버8096과 전용 Chrome9224를 사용한다. 명령은 순서대로 실행한다. 성능 측정과 녹화/오디오 렌더/인코딩은 동시에 실행하지 않는다.

## 원자료와 소스 구분

- [전체 검사 요약](evidence/outdoor-expansion/verification/verification-summary.json), [실행 로그](evidence/outdoor-expansion/verification/unit-tests.log), [동작 원자료](evidence/outdoor-expansion/verification/motion-audit.json)
- [음향 신호](evidence/outdoor-expansion/audio.json), [실제 2클라이언트](evidence/outdoor-expansion/multiplayer.json), [PC 성능](evidence/outdoor-expansion/desktop-outdoor.json), [모바일 성능](evidence/outdoor-expansion/mobile-outdoor.json)
- [피아노 최종 영상](evidence/outdoor-expansion/piano-final.mp4), [세로 합주 영상](evidence/outdoor-expansion/orchestra-mobile.mp4), [마지막 카메라 검사](evidence/outdoor-expansion/camera-final-tests.log)
- [사랑의 인사 음향 표본](evidence/outdoor-expansion/elgar-salut-damour.wav), [교향곡40번 음향 표본](evidence/outdoor-expansion/mozart-symphony-40.wav)

최종 제품 JS SHA-256: `af3ec67a9e46d4ddaeaeb97b2aa30f634fc31a7a15fa7df47c3a0710fe851290`.
최초 통합 검사 입력 SHA-256: `1526ff768f31d1a23e54e2429a861e7ae523b8428865c9a753f1400ad461faea`. 이 검사는 마지막 피아노 측면 좌표 한 줄 수정, 성능 도구의 `CAMERA=cinema` 옵션, 음향 발췌 경계에서 원래 음 길이 보존, 모차르트 판본 설명의 문구 교정 전이다. 이후 카메라 집중 검사와 최종 피아노 영상을 확인했다. 세로 합주/멀티플레이 자료는 피아노 측면 수정 전 소스이며 해당 동작은 그 수정의 영향을 받지 않는다. 음향 발췌 검사는 도구 수정 후 새로 렌더했다. 각 JSON에 개별 소스 해시를 남겼다. 최종 커밋의 전체 CI 결과는 PR에 기록한다. MP4 영상 2개는 전체 디코딩을 통과했다. 원본 WebM 변환 중 Opus 패킷 경고 1개씩이 발생했으며, 최종 영상/음향 길이는 각각 45.045/44.966초와 40.040/39.989초다. [미디어 확인 원자료](evidence/outdoor-expansion/media-check.json)에 경고를 보존했다.
