# 레퍼토리 확장 검증 기록

검증 담당: GPT-6 Sol, medium. 코드·데이터 검사와 브라우저 관측을 분리해 기록했다.

## 범위와 기준

- 기준 커밋: `1b9d4b88b756df2ef962c5ca9df8a7377e1ebd3f` (`feat/orchestral-repertoire` 작업 전 상태).
- 기준 목록: 홀 26곡, 스피어 26곡, `public/music/index.json` 52곡, 고유 ID 52개. `public/js/programs.js`와 index를 Node로 읽어 확인했다.
- 목표: 기존 52곡과 신규 30곡으로 홀·스피어 각각 41곡, 고유 곡 82곡을 제공한다. 기존 엘가 「위풍당당」 한 곡은 사용자 요청에 따라 전체 행진곡으로 확장하는 의도적 수정 예외다. 동물 단원이 연주하며 필요한 단원과 악기는 확장할 수 있다.
- 이 문서는 검증 절차와 실제 관측 결과를 구분해 적는다. 앱 구현이 준비되기 전에는 브라우저나 오디오 검사를 시작하지 않는다.

## 구현 준비 후 검증 절차

1. `git diff`와 생성 파일 목록을 확인한다. 신규 30곡의 ID가 기존 ID와 겹치지 않는지, 기존 52곡의 데이터와 목록이 의도치 않게 삭제되지 않았는지 비교한다.
2. `public/js/programs.js`, `public/music/index.json`, `public/music/*.json`을 교차 검사한다. 홀·스피어별 개수, 고유 ID, 참조 파일 존재, 메타데이터 일치, 공연 순서 및 장르 분포를 확인한다.
3. 각 악보 JSON의 `duration`, `beats`, `tracks`, `notes`를 검사한다. 음표 배열은 `(시작초, 길이초, MIDI 음높이, 세기)` 4개 단위여야 하며, 유효 범위와 시간 순서, 끝 시각을 확인한다. 피아노 독주곡은 피아노 트랙만 쓰는지 확인한다. 합주곡은 악기 편성과 `ensembleKo`, `conducted` 설명, 무대에 표시되는 단원·악기가 맞는지 확인한다.
4. `tools/program.py`, 악보 원본, `CREDITS.md`를 대조한다. 각 신규 곡의 작곡가·작품·악장 표기가 원본과 대응하는지, 악보 데이터와 샘플의 출처·라이선스가 기록됐는지 확인한다. 특히 외부 MIDI의 원본 URL, 판본, 사용 조건과 재배포 조건을 확인한다. 수작업 편곡은 원곡과 편곡 범위를 구별해 기록한다.
5. 유지 관리 테스트를 `npm test`로 실행한다. 실패 시 해당 테스트와 실제 기능 관계를 조사하고, 고쳐진 뒤에 한 번 더 확인한다.
6. `npm start`로 로컬 서버를 띄운 뒤 `cdp-direct launch --port 9222`, `cdp-direct new <URL>` 순서로 브라우저를 연다. 홀과 스피어에서 신규 곡 검색·선택·재생·일시정지·곡 변경을 각각 확인한다. 화면 상태, 콘솔 오류, 네트워크 요청, 연주 시간 진행을 기록한다.
7. 오디오는 브라우저의 AudioContext 상태와 노트 스케줄링 및 샘플 요청을 확인한다. 자동화만으로 실제 스피커 음질이나 작품의 음악적 완성도를 보증하지 않는다. 직접 들은 경우에만 청취 결과를 별도로 기록한다.

## 실제 실행 기록

| 단계 | 명령·방법 | 관측 결과 | 상태 |
| --- | --- | --- | --- |
| 기준 목록 | Node로 `HALL_SETLIST`, `SPHERE_SETLIST`, `index.json`의 길이와 고유 ID 집계 | 홀 26, 스피어 26, index 52, 고유 ID 52 | 완료 |
| 변경 파일 및 데이터 무결성 | 82곡 검사·기존 JSON 바이트 비교 | 누락 0, 의도적 Elgar 교체 1 | 통과 |
| 작품 정체성 및 라이선스 | 원본·판본·기여자·라이선스 대조 | 판본 표시 완료, Sabre 재배포 허가 미확인 | 일부 미확인 |
| 자동 테스트 | `npm test` 및 Python MIDI unittest | 214/214, 7/7 | 통과 |
| 홀 브라우저·오디오 | `cdp-direct` | 선택·재생·일시정지·탐색·전환 관측 | 표본 통과 |
| 스피어 브라우저·오디오 | `cdp-direct` | 선택·재생·첼레스타 동작 관측 | 표본 통과 |

## MIDI 변환기 중간 코드 검토 (곡 생성 전)

- `tools/midi_score.py`는 tempo 이벤트를 tick 기준으로 모은 뒤 구간별 초 단위 적분을 한다. `set_tempo`가 적용되는 tick부터 새 tempo를 쓰므로 기본 계산 방향은 맞다. 변박은 해당 tick에서 beat 번호를 다시 시작한다. 원본 파일에 변박이 마디 중간에 들어오는 경우 음악적 박절은 따로 대조해야 한다.
- 초기 검토의 포트·채널 상태 혼합과 type 0 채널별 override 제한은 후속 수정으로 해결됐다. 최신 구현은 전역 MIDI 사건을 tick 순서로 처리하고 `(port, channel)`로 프로그램·컨트롤러·페달·누른 음을 관리한다. `sourceTrack:port:channel` 키로 악기 override를 지정할 수 있다.
- 프로그램 선언이 없는 채널의 프로그램 0(피아노)은 General MIDI 기본값이므로 오류로 판정하지 않는다. 지원하지 않는 명시적 프로그램 번호는 별도 확인 대상이다.
- 페달 64와 음표 겹침은 같은 MIDI 포트·채널의 트랙을 함께 처리한다. 같은 음높이의 중복 note-on에는 FIFO(`popleft`)를 쓴다. 원본 악보가 LIFO 의미의 겹친 같은 음을 쓰는지 확인해야 한다.
- 새 GM 음색 이름은 중간 상태의 `public/samples/manifest.json`에 모두 있다. 이는 샘플 목록 존재만 확인한 것이다. 파일 디코딩 및 실제 소리 출력은 아직 확인하지 않았다.
- 기본 `python3`에는 `mido`가 없지만, `tools/.cache/repertoire-venv/bin/python`에 `mido==1.3.3`이 있다.

### 2026-10-23 합성 MIDI 회귀검증

명령: `tools/.cache/repertoire-venv/bin/python -m unittest discover -s tests -p test_midi_score.py -v`

결과: 첫 6개 테스트 모두 통과했다. 이후 pitchwheel/RPN과 발췌·템포 배율을 추가해 7개 테스트 모두 통과했다(0.004초). 임시 MIDI 파일로 템포 전환과 6/8 박자, tick 0 MuseScore 포트, 포트별 악기, 트랙 사이 페달, type 0 채널별 override, 겹친 음, expression, velocity 0 note-off 및 pitchwheel을 확인했다. `node --test tests/pitch-bend.test.mjs`의 seek·샘플 교차 구간 2개 테스트도 통과했다. 실제 스피커 청취는 하지 않았다.

### 2026-10-23 전체 데이터와 브라우저

- `tools/.cache/repertoire-venv/bin/python tools/build_repertoire.py --check`: 최종 31개 catalog 항목(신규 30, 기존 엘가 교체 1)의 악보와 index 재생성 비교 통과. `npm test`: 214개 모두 통과. Python MIDI 테스트 7개 모두 통과.
- `git show HEAD:public/music/index.json`의 기존 52개 ID를 각 JSON 바이트와 비교했다. 누락 0개, 변경 1개(`elgar-pomp-and-circumstance`)다. 이 한 곡은 사용자가 요청한 전체 행진곡 확장으로, 2:06 트리오에서 6:44 전체곡으로 바뀌었다.
- `npm test` 첫 실행: 확장된 단원 수를 15개로 하드코딩한 audio-listener 테스트와 performance 스냅샷, 신규 integrity 테스트의 Sabre `NOASSERTION` 때문에 실패했다. 테스트를 실제 `SECTIONS` 개수에 맞추고 기존 15단원만 기존 스냅샷과 비교하도록 수정했다. Sabre의 라이선스 URL 미확정은 명시적으로 `NOASSERTION`인 경우만 허용하며 권리 확인으로 판정하지 않는다. 재실행은 212/212 통과했다. 신규 integrity 테스트는 82개 ID·41+41 배분·31개 원본 SHA256·모든 score JSON의 메타/음표 범위·manifest 샘플 파일을 확인한다.
- `cdp-direct launch --port 9222`와 `cdp-direct new http://127.0.0.1:8096/?venue=hall` 실행. 표 없는 `?venue=hall`은 광장으로 이동하므로 `?venue=hall&lobby`와 `?venue=sphere&lobby`로 각각 진입했다. 홀·스피어 프로그램 목록에서 신규곡이 노출된다.
- 홀: 신규 Beethoven 교향곡 5번 선택 후 `__fp.perf.piece.id=beethoven-symphony-5`, `playing=true`, AudioContext `running`, 샘플 실패 0. 2.5초 관측 구간 `engine.playNote` 179회(현·목관·금관·팀파니 등)를 기록했다. 일시정지 후 `playing=false`, 탐색 슬라이더에 초점을 맞춰 Home을 누르자 0:00으로 이동했다. 재생과 다음곡 전환 뒤 Mozart 「아이네 클라이네」가 재생됐다.
- 스피어: 신규 「사탕 요정의 춤」 선택 후 `tchaikovsky-sugar-plum`, AudioContext `running`, 샘플 40종 로드·실패 0. 자동 카메라 화면에서 토끼 단원이 첼레스타 건반을 연주하는 모델을 확인했다.
- 화면 증거: [홀 프로그램](evidence/repertoire/hall-program.png), [홀 베토벤 재생](evidence/repertoire/hall-beethoven-5.png), [홀 푸른 도나우 무대](evidence/repertoire/hall-blue-danube-stage.png), [스피어 프로그램](evidence/repertoire/sphere-program.png), [스피어 첼레스타 토끼와 건반](evidence/repertoire/sphere-sugar-plum-cinema.png), [스피어 기사들의 춤 현악·뒤쪽 금관](evidence/repertoire/sphere-dance-knights.png), [홀 엘가 합창·팀파니·금관](evidence/repertoire/hall-elgar-full-chorus.png). `sphere-sugar-plum-stage.png`는 좌석·난간에 가려져 악기 확인 근거로 쓰지 않는다. Sabre 화면은 원거리라 악기 모델 구별의 근거로 쓰지 않는다.
- 자동 카메라 상태의 브라우저 `requestAnimationFrame` 1초 측정: 홀 61회/1010.4ms, 스피어 60회/1000.6ms. 이는 이 Mac·이 Chrome 탭에서의 짧은 화면 갱신 관측이며 GPU 프레임 시간이나 모바일 성능 보증은 아니다.
- 390px 모바일 뷰포트: `cdp-direct`에 화면 크기 설정 기능이 없어 같은 Chrome 9222 세션에 CDP `Emulation.setDeviceMetricsOverride`를 적용하고 `Page.captureScreenshot`으로 기록했다. 실제 `innerWidth=390`, `documentElement.scrollWidth=390`이며 프로그램 패널은 x=16, 너비 358px로 화면 안에 들어온다. [홀 모바일 화면](evidence/repertoire/hall-mobile-390.png), [홀 모바일 프로그램](evidence/repertoire/hall-mobile-program-390.png). Mac Chrome 에뮬레이션이며 실제 iPhone 터치·성능은 확인하지 않았다.
- 엘가 전체곡: 브라우저에서 404.06초·20트랙을 로드했다. `__fp.perf.seek`으로 0, 124, 320, 386초를 탐색한 뒤 모두 `playing=true`, AudioContext `running`을 확인했다. 124초에는 현악 저음, 320초에는 합창·현악·금관·팀파니·큰북·심벌즈, 386초에는 합창·현악·금관 트랙이 활성 상태였다. 곡 처음 0.3초는 쉼표 구간이라 활성 음이 없었다. [320초 부근 화면](evidence/repertoire/hall-elgar-full-chorus.png)에서 합창 단원과 팀파니 모델을 확인했다.
- 미검증: 실제 스피커 청취, 모든 82곡의 브라우저 재생, 실제 iPhone 성능, Sabre/Dance of Knights 악보 데이터 재배포 권리, 실황 참고 URL의 재생 가능 여부. Sabre 원본은 `NOASSERTION` 상태다.

### 마지막 단원·샘플 변경 후 재검증

- 독립 탬버린 `tamb` 단원과 `tri` 단원이 분리된 상태에서 `SECTIONS` 30종, 전체 의자 51개를 확인했다. `public/samples/manifest.json`의 `tambourine` 항목은 1개이며 `public/samples/tambourine/54.mp3`가 있다. 이 검사는 파일 존재와 배치만 확인한다.
- `npm test > /tmp/fp-final-test.log 2>&1`: 214개 통과, 실패 0개(2.532초). 이 안에 모든 악보·샘플 파일 무결성 검사와 pitch-bend JS 테스트가 포함된다.
- `tools/.cache/repertoire-venv/bin/python tools/build_repertoire.py --check`: 종료 코드 0, 31개 catalog 항목의 생성 결과와 index 일치.
- `tools/.cache/repertoire-venv/bin/python -m unittest discover -s tests -p test_midi_score.py -q`: 7개 통과, 실패 0개.
- 탬버린 모델의 새 브라우저 화면은 추가 확인했다. 스피어에서 「사브르의 춤」을 새로 로드하고 탬버린 트랙이 있는 51초로 탐색했다. `__fp.orchestra.players`에서 `sid=tamb`, `rigKind=tambourine`, 악기 인스턴스 존재를 확인했다. 단원에게 시야를 맞춰 찍은 [스피어 탬버린 화면](evidence/repertoire/sphere-tambourine.png)에서 동물 단원, 원형 탬버린과 징글, 연주 자세가 보인다. 관측 중 AudioContext는 `running`, 새 `error`/`unhandledrejection`/`console.error`는 0건이었다. 마지막에 재생 버튼을 눌러 `playing=false`를 확인했다. 스피커 청취는 하지 않았다. 신규 30곡과 엘가 4구간 오프라인 오디오 측정은 별도 `docs/repertoire-audio-validation.md`를 참고해야 한다.

## 판정 원칙

- 데이터·코드 검사, 브라우저 화면 관측, 청취 판단을 각각 구분한다.
- 특정 곡의 음악적 동일성은 제목만으로 판정하지 않는다. 원본 악보의 주요 선율·리듬 또는 명확한 식별 구간을 대조한다.
- 82곡 전체의 정적 검증과 표본 브라우저 검증의 범위를 따로 적는다.

## 부모 에이전트의 추가 확인

- 신규 30곡의 실황 참고 URL을 YouTube 공식 oEmbed 응답으로 조회했다. 30/30에서 제목과 메타데이터가 반환됐으며 곡명과 대조했다. [원시 결과](evidence/repertoire/reference-links.json). 로그인·지역 제한을 포함한 실제 동영상 끝까지 재생은 확인하지 않았다.
- 실제 엔진의 오프라인 오디오 34개 구간 결과는 [오디오 검증 기록](repertoire-audio-validation.md)에 별도로 기록했다.
