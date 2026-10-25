# AI가 사용하는 동작 검증 하네스

## 기본 명령

저장소 루트에서 Node 18 이상으로 실행한다. 브라우저나 외부 npm 패키지는 필요 없다.

```sh
npm run verify:motion
```

명령은 단위·회귀 검사와 전체 곡 동작 검사를 실행한다. 실패하면 종료 코드 1을 반환한다. 이전 성공 보고서를 재사용하지 않는다. 실행 중 소스·악보·검사 코드가 변경되어도 실패한다.

| 출력 | 용도 |
| --- | --- |
| `work/motion/verification-summary.json` | AI의 첫 진입점. pass/fail, 범위, 실패 원인, 측정값, 허용값, 재현 명령 |
| `work/motion/report.md` | 사람이 읽는 요약 |
| `work/motion/motion-audit.json` | 곡별·악기별 관절/접촉/충돌 수치와 전체 무대 이동 결과 |
| `work/motion/recording-plan.json` | 실제 악보에서 자동 생성한 단원별 활성 연주 구간 |
| `work/motion/unit-tests.log`, `motion-audit.log` | 실행 원자료 |

`--out <폴더>`로 출력 위치를 바꿀 수 있다. `--skip-unit`은 CI에서 별도 `npm test` 단계가 성공한 경우에만 쓴다. 요약에 생략 사실이 표시된다.

## 자동 검사의 범위

실제 공연 목록에서 곡을 수집한다. 각 곡의 시작·25/50/75/95%·각 파트 첫 진입·음이 밀집한 구간을 계산한다. 구간마다 2초 연주와 0.5초 정지 전환을 60 Hz로 진행한다. 모든 단원의 인사·퇴장·입장은 끝까지 검사한다.

- 팔 뼈 길이, 팔꿈치 제한, 유한한 좌표, 손 목표점 도달, 연속 프레임의 급격한 손 이동
- 손과 채의 결합, 실제 머리·주둥이·코 타원체와 채 선분의 충돌
- 전체 단원과 지휘자의 경로 확보, 퇴장·입장 완료
- 곡의 파트·자리 번호·음표 형식, 실제 단원별 활성 연주 구간
- 미등록 공연장 무대 어댑터, 연주 악보가 없는 단원, 알려지지 않은 파트 누락

홀·스피어·야외 마당은 같은 악단 무대와 바닥 정의를 쓴다. 야외는 `buildStage`로 실제 무대를 만들고, `outdoor.test.mjs`에서 잔디·계단 렌더 높이와 이동 바닥을 함께 검사한다. `navgrid.test.mjs`는 격자 셀 안의 곡선 단차까지 경로 전체를 독립 검사한다. 관객석 조명·GPU는 수치 동작 검사 대상이 아니다. 새로운 독립 무대는 `motion-contracts.mjs`의 등록만 바꾸지 말고, `audit-playing-motion.mjs`가 실제 무대 생성과 길찾기를 실행하도록 확장해야 한다.

## 실패에서 수정까지

1. 요약의 `failures`를 읽는다. `song`, `sid`, `ci`, `time`, `phase`, `windowStart`로 원인 구간을 찾는다.
2. `metric`/`value`/`limit`과 `action`을 읽고 실제 자세나 모델 위치를 수정한다.
3. `reproduce` 명령으로 같은 난수 시드와 전체 실행 순서를 다시 검사한다. 앞 구간의 상태가 이어지는 경우가 있으므로 전체 재실행이 정확한 수치 재현 방법이다.
4. 필요하면 `preview` 명령으로 해당 악절을 녹화한다. 브라우저의 집중 미리보기는 수치 검사의 전체 상태 이력과 같다는 뜻이 아니다.
5. 새 형태의 결함이면 회귀 규칙과 단위 검사를 추가한다. 이번 채와 주둥이 관통도 영상에서 찾은 뒤 자동 규칙으로 전환했다.

## 화면 검사가 필요한 변경

기존 연주 방식의 악보 추가는 위 자동 검사를 기본으로 한다. 각 곡마다 수동 스크린샷을 요구하지 않는다. 새로운 외형·악기·자세·무대는 영향을 받는 사례를 자동 녹화하고 연속 동작을 확인한다. 수치만으로 모든 실루엣·가림·미감을 증명할 수는 없다.

별도 터미널에서 서버를 실행하고 전용 Chrome을 준비한다. 녹화는 `puppeteer-core`가 필요하다. 로컬 또는 전역 설치, 또는 `PUPPETEER_PATH`를 지원한다.

```sh
PORT=8096 npm start
cdp-direct launch --port 9224
cdp-direct new http://127.0.0.1:8096 --port 9224
```

```sh
npm run record:motion -- --plan work/motion/recording-plan.json --case vn1-0 --label review
npm run record:motion -- --song tchaikovsky-1812 --venue sphere --section bells --chair 0 --start 854.4061 --seconds 8 --label bells
npm run record:motion -- review bow,exit,entry
npm run record:motion -- outdoor outdoorBow,outdoorExit,outdoorEntry
```

`--plan`에서 `--case`를 생략하면 전체 생성 사례를 녹화한다. 도구는 해당 곡이 실제 연주 중인지, 해당 단원에게 실제 음이 있는지, 촬영 동안 연주했는지 검사한다. WebGL과 실제 Web Audio를 함께 녹화하고 프레임별 관절 자료를 저장한다. `MOBILE=1`은 Chrome 모바일 에뮬레이션이며 실제 iPhone 검사가 아니다.

## 새 코드를 추가할 때

| 변경 | 구현 위치와 계약 |
| --- | --- |
| 곡 | `public/music/*.json`, `programs.js`. 자동 구간 수집을 그대로 사용 |
| 단원/악단 | `layout.js`의 `SECTIONS`/`CAST`, orchestra의 rig 대응. 모든 자리의 실제 연주 악보 필요 |
| 악기 | `instruments.js`에서 실제 접촉점 반환. 해당 `*-rigs.js`에서 배율과 좌표 변환 후 `setArm` 사용 |
| 새 연주법 | 악보 시간 기반 결정적 상태, 탐색·정지 초기화, 회귀 검사 |
| 캐릭터 외형 | 렌더 머리와 동일한 `headVolumes` 유지. 새로운 충돌체가 있으면 검사 범위 확장 |
| 장소 | 렌더 바닥과 길찾기 바닥을 공유. 실제 무대 생성/입퇴장 어댑터와 영상 사례 추가 |

성능 검사는 `quality-optimization-measure.mjs`로 녹화 없이 따로 실행한다. 검사 명령, 소스 해시, 원자료와 미검증 범위를 PR에 함께 남긴다. 숫자 통과를 전체 곡 완주·실제 기기 성능·예술적 품질 보장으로 확대하지 않는다.

## 야외 공연장 흐름 검사

전용 Chrome에서 다음 명령으로 광장 매표소 → 야외 표 → 입구 → 실제 합주 → 착석 → 걷기 → 자동 카메라를 확인한다. 매표소와 입구까지의 위치만 테스트 훅으로 옮기고, 화면 버튼과 실제 발권·입장 코드를 사용한다. `--record`는 실제 연주와 소리를 24초 연속 녹화한다. `MOBILE=1`은 모바일 Chrome 에뮬레이션이다.

```sh
QA_OUT=work/outdoor node tools/qa/verify-outdoor.mjs --record
MOBILE=1 QA_OUT=work/outdoor node tools/qa/verify-outdoor.mjs --record
QA_OUT=work/outdoor node tools/qa/quality-optimization-measure.mjs outdoor outdoor 20 measure
```

동일 장면의 성능 측정은 녹화·수치 검사 종료 후 별도로 실행한다. 야외 측정 곡은 「모차르트 교향곡 40번」 199초의 음이 밀집한 구간이다. 공연 목록 무결성 검사는 모든 공연장 사이의 곡 ID 중복도 차단한다.

## 저사양 렌더 측정

`QUALITY_MODE=efficient`로 저장된 저사양 모드에서 시작한다. 실제 렌더 완료의 `stats.sequence`가 바뀐 프레임만 집계한다. 60 Hz 브라우저 콜백 횟수를 30 fps 렌더 횟수로 오인하지 않는다. `CPU_RATE=4`는 Chrome CPU 감속 모의 환경이며 실제 구형 기기 성능을 뜻하지 않는다. 측정 도구는 종료할 때 감속 설정을 원복한다.

```sh
QUALITY_MODE=efficient CAMERA=cinema QA_OUT=work/efficient node tools/qa/quality-optimization-measure.mjs efficient outdoor 20 measure
```

## 첼로의 앉은 자세

`tests/cello-seated-clearance.test.mjs`는 실제 두 첼리스트의 준비·휴식·긴 활·피치카토 자세를 검사한다. `characters.js`의 `seatedLegVolumes`는 렌더 다리와 같은 capsule 치수이며, `instruments.js`의 `bodyGeometry`는 실제 첼로 몸통이다. 캐릭터 체형이나 첼로 모델을 바꾸면 이 데이터도 실제 메시와 함께 갱신한다. 팔 길이와 `ARM_LIMITS`를 늘려 접점 실패를 감추지 않는다. 이 표본 검사는 영상 확인을 보완하며 모든 볼륨 내부나 연속 자세의 충돌 증명은 아니다.
