# 대표 연주 동작 시각 리뷰

## 범위와 결론

현재 실제 Chrome 앱에서 대표 6개 악기군을 각각 8초씩 녹화했다. 각 영상에서 시간순 5개 프레임을 직접 검토하고, 전체 녹화 구간의 프레임별 관절 기록도 확인했다. 모든 106곡·모든 각도의 시각 품질을 보증하는 검사는 아니며, 성능 측정 및 실제 iPadOS 검증은 포함하지 않았다.

눈에 띄는 두 배치 결함을 수정했다. 나머지 네 사례는 검토한 각도와 구간에서 큰 관통·관절 뒤집힘이 보이지 않아 수정하지 않았다.

| 대상 | 곡 | 요청 시작(초) | 결과 |
|---|---|---:|---|
| choir-0 | bizet-habanera | 18.4583 | 악보집 양손 유지, 가창 입 모양 변화. 큰 자세 결함 없음. |
| tb-0 | wagner-valkyries | 312.3988 | 슬라이드가 악보판을 실제 관통. 악보대를 옆으로 이동해 해소. |
| vn1-0 | strauss-blue-danube | 501.8665 | 활 그립/악기 유지. 큰 자세 결함 없음. |
| fl-0 | khachaturian-sabre-dance | 122.9774 | 입과 악기, 양손 유지. 큰 자세 결함 없음. |
| timp-0 | tchaikovsky-1812 | 870.3955 | 세 북의 헤드/테두리 겹침. 북 배치를 벌리고 안쪽 타격점으로 보정. |
| piano-0 | tchaikovsky-piano-concerto-1 | 166.0959 | 양손 건반 이동과 팔 굽힘 유지. 큰 자세 결함 없음. |

## 수정과 확인

- 트롬본: 기존 local x=0.1의 악보판이 슬라이드 공간을 가로막았다. 악보대 x만 -0.4로 이동했다. 악기·팔·접점 허용값은 변경하지 않았다. 실제 삼각형과 기울어진 판의 교차로 원인을 확인했다. 회귀 검사는 두 단원, 준비 21단계, 슬라이드 13위치, 몸 기울임 9조합(4,914자세)에서 판과 받침턱에 1.5cm 여유를 요구한다.
- 팀파니: 기존 인접 북 중심거리는 약44.3cm인데 반지름 합은65cm/59cm였다. 새 중심은 x/z=(-.64,-.23),(0,-.52),(.60,-.23)이다. 테두리 두께를 포함한 최소 간격은 약2.87cm다. 바깥 북은 안쪽45% 지점을 쳐서 팔을 늘리지 않고 도달하게 했다. 집중 검사에서 최대 팔 목표 오차2.54cm, 안정된 타격 순간 헤드 높이 오차는 부동소수점 수준이다.
- 수정 후 같은 구간/카메라로 각각8초 재촬영했다. initial-after-tb-0-timeline.jpg에서 슬라이드가 악보판 옆으로 완전히 드러난다. initial-after-timp-0-timeline.jpg에서 세 북의 테두리가 분리되고 채가 북 표면에 유지된다. 두 영상 모두 브라우저 오류0이며 실연주 프레임이 확인됐다.

## 증거

- spot-*.webm: 최초 대표6건 각8초
- spot-*-timeline.jpg 및 frame-1~5.png: +0,+1.75,+3.5,+5.25,+7초
- initial-after-tb-0.webm / initial-after-timp-0.webm 및 대응 timeline: 수정 후 동일구간
- 각 영상의 JSON: 대상곡, 요청시각, 실제 프레임시각, 소스해시, 관절 기록
- capture-summary.json: 최초6건 구간 요약
- focused-tests.txt: 관련 회귀검사2개 PASS
- stand-analysis.json: 수정 전 실제 악보판 교차 근거(표본에 머리 sway가 포함되어 횟수는 반복실행 시 약간 달라질 수 있음)

## 재현

`APP_PORT=8096 CDP_PORT=9225 QA_OUT=../outdoor-exclusive-qa/motion-spot-review node tools/qa/record-playing-motion.mjs --label spot --plan ../outdoor-exclusive-qa/motion-spot-review/recording-plan.json`

`node --experimental-loader ./tests/helpers/three-loader.mjs --test tests/timpani-clearance.test.mjs tests/trombone-stand-clearance.test.mjs`

수정 후 캡처 소스 SHA256: d21135d7dbbec5ab09fd76c6a782398389dbc40df99adc794fb5a311f9ff842a

종료 시 소스 일치: False

## 최종 고정 소스 재촬영

병행 캐릭터 수정 종료 후 트롬본/팀파니만 각각8초 재촬영했다. 최종 파일은 `after-final-tb-0.webm`, `after-final-timp-0.webm`이고, 대응 `-timeline.jpg`에 시간순5프레임이 있다. 이전 해시 불일치 캡처는 `initial-after-*`로 분리했다.

최종 두 영상은 시작/종료 소스해시가 모두 일치한다. 직접 확인한 최종 프레임에서도 트롬본 슬라이드와 악보판의 분리, 팀파니 세 북의 분리 및 채 타격 자세가 유지된다. 브라우저 오류는 모두0이다. 트롬본481/481프레임, 팀파니472/481프레임이 실연주 상태였다. 관련 집중 검사는 재실행하지 않았다. 9225 앱 탭은0개로 정리했다.

최종 SHA256: `622bf9896fad273b8301e2b139475b5c8e8eac34ac7fa85ed3cdefdbc38c3b1e`
