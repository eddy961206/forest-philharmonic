# 숲속 작은 음악회 — 야외 공연장

## 구현

2026-10-24 KST, 기존 `feat/orchestral-repertoire` / PR #20에 누적했다.

- 동네 공원의 이웃 음악회: 크림색 천막, 목재 무대, 전구 줄, 접이식 의자 288석, 잔디와 나무.
- 관객은 차분한 일상복을 입는다. 야외에는 짧은 잔향을 적용하고 실내 로비·대형 중계 화면·레이저·폭죽 설정은 노출하지 않는다.
- 홀·스피어의 41곡씩은 유지한다. 야외는 기존 16곡을 독주·현악·관현악으로 구성한다. 전체 고유 곡 수는 82곡이다.
- 광장 매표소, 왼쪽 뒤편 입구, 로비의 세 번째 선택, 입장권, 공개방·초대 링크에 `outdoor`를 연결했다.
- 같은 무대 바닥·계단·단원 경로를 사용한다. 야외 관객 이동은 별도 바닥 정의를 사용한다. 의자·나무·전구는 인스턴싱하고 고정 부품은 재질별로 병합했다.

## 실행 방법

```sh
npm start
```

광장 매표소에서 **숲속 작은 음악회** 표를 고른다. 개발 중 바로 입장하려면 `http://localhost:8080/?venue=outdoor&lobby=1`을 연다.

## 검증 환경과 절차

- Mac mini Apple M4 / 32 GiB / macOS 26.5.1, Chrome 156, Node 24.22.1.
- 사용자 지시에 따라 전용 `cdp-direct` Chrome(9224)을 사용했다. 자동화는 같은 CDP 연결의 `puppeteer-core`를 사용한다.
- 테스트 앱은 `127.0.0.1:8096`. 같은 네트워크의 미리보기는 별도 `0.0.0.0:8097` 서버다.
- PC 1280×800 / high, 모바일 Chrome 에뮬레이션 390×844 / low로 실제 WebGL과 Web Audio를 검사했다.
- 성능 측정은 녹화·인코딩·단위 검사와 분리했다. 측정 직전에 기존 테스트 앱 탭을 닫고, 현재 탭의 실제 곡·playing 상태·visibility를 확인한다.

### 자동 검사

```sh
npm run verify:motion -- --out work/outdoor/verification
```

**268개 단위·회귀 검사 통과.** 전체 82곡, 51단원, 30개 연주 방식, 142,110프레임과 5,182,248팔 샘플 검사에서 실패 0개. 홀·스피어·야외 무대 계약을 모두 수집한다.

야외의 288개 좌석 바닥·안정된 좌석 ID·실제 선택용 raycast, 양쪽 무대 계단의 렌더 높이와 이동 높이, 입구→객석→계단 이동, 기둥·나무 장애물, 공연장 선택·기억·URL, 실제 WebSocket 방 생성·입장·재접속·목록을 검사했다.

원자료: [검증 요약](evidence/outdoor/verification/verification-summary.json), [단위 검사 로그](evidence/outdoor/verification/unit-tests.log), [동작 검사](evidence/outdoor/verification/motion-audit.json).

### 실제 화면·연속 녹화

```sh
QA_OUT=work/outdoor node tools/qa/verify-outdoor.mjs --record
MOBILE=1 QA_OUT=work/outdoor node tools/qa/verify-outdoor.mjs --record
QA_OUT=work/outdoor npm run record:motion -- outdoor outdoorBow,outdoorExit,outdoorEntry
```

광장 → 매표소 → 야외 표 발권 → 새 입구 → 입장 → 「푸른 도나우」 실제 합주 → 착석 → 걷기 → 자동 카메라를 검사했다. 매표소와 입구의 접근 위치만 테스트 훅으로 옮겼고, 발권·입장 버튼과 실제 애플리케이션 코드를 실행했다. 따라서 이 검사를 광장 전체 자동 길찾기 검증으로 확대하지 않는다.

PC와 모바일 크기 모두 통과했다. 콘솔 오류 0개, 페이지 가로 넘침 없음, AudioContext running을 확인했다. 소규모 「라데츠키 행진곡」도 같은 흐름을 별도로 통과했다.

실제 WebGL과 Web Audio를 24초씩 연속 녹화했다. 전경·객석·가까운 무대 시점을 포함한다. 별도로 인사 10초, 전원 퇴장 65초, 전원 입장 85초를 녹화했다. 지휘자를 포함한 경로 확보, 퇴장 완료, 제자리 복귀를 영상 프레임 자료와 종료 상태로 검사했다.

| 결과 | 자료 |
| --- | --- |
| PC 실제 합주 | [영상](evidence/outdoor/desktop-concert.mp4), [검사 JSON](evidence/outdoor/desktop-flow.json) |
| 모바일 에뮬레이션 합주 | [영상](evidence/outdoor/mobile-concert.mp4), [검사 JSON](evidence/outdoor/mobile-flow.json) |
| 전원 인사 | [영상](evidence/outdoor/bow.mp4), [프레임 자료](evidence/outdoor/bow.json.gz) |
| 전원 퇴장 | [영상](evidence/outdoor/exit.mp4), [프레임 자료](evidence/outdoor/exit.json.gz) |
| 전원 입장 | [영상](evidence/outdoor/entry.mp4), [프레임 자료](evidence/outdoor/entry.json.gz) |

합주·입퇴장 녹화의 시간순 연속 프레임을 확인했다. 전달용 MP4 5개는 전체 디코딩 검사와 Chrome의 실제 재생 진행 검사를 통과했다. PC 합주 녹화의 오디오 평균은 -21.6 dB, 최대 -4.0 dB였다. 원본 WebM을 FFmpeg로 변환할 때 Opus 헤더 경고가 1회씩 있었다. 전달용 H.264/AAC MP4에서는 전체 디코딩 오류가 없었다. 이 경고를 앱의 실시간 오디오 버퍼 끊김과 혼동하지 않는다.

### 별도 성능 측정

```sh
QA_OUT=work/outdoor/performance node tools/qa/quality-optimization-measure.mjs desktop outdoor 20 measure
MOBILE=1 QA_OUT=work/outdoor/performance node tools/qa/quality-optimization-measure.mjs mobile outdoor 20 measure
```

야외는 「푸른 도나우」 231.2561초로 이동한 뒤 5초 준비하고, 음이 밀집한 구간을 20초 측정했다. 평균 FPS는 프레임 간격 평균의 역수다. p95는 프레임 95%가 그 시간 안에 끝났다는 뜻이다. 모든 결과는 수동 high/low와 renderScale 1, visible/playing 상태다.

| 대상 | 측정 | 평균 FPS | 프레임 p95 | 제출 시간 p95 | 음표 예약 지연 / 오디오 underrun / 콘솔 오류 |
| --- | --- | ---: | ---: | ---: | --- |
| 야외 PC high | 1200×800, 20초 | 59.95 | 17.6ms | 5.3ms | 0 / 0 / 0 |
| 야외 모바일 low | 390×844, 20초 | 59.95 | 18.6ms | 3.4ms | 0 / 0 / 0 |
| 기존 홀 high 회귀 | 1200×800, 10초 | 59.95 | 17.4ms | 10.8ms | 0 / 0 / 0 |
| 기존 스피어 high 회귀 | 1200×800, 10초 | 59.85 | 17.8ms | 6.0ms | 0 / 0 / 0 |

[야외 PC 원자료](evidence/outdoor/performance/desktop-outdoor.json), [모바일 원자료](evidence/outdoor/performance/mobile-outdoor.json), [홀](evidence/outdoor/performance/regression-hall.json), [스피어](evidence/outdoor/performance/regression-sphere.json).

네트워크 미리보기 서버도 새 코드로 재시작했다. Mac에서 LAN 주소의 HTTP 200과 야외 모듈을 확인했고, 8097 서버에서 두 WebSocket 클라이언트의 야외 방 생성·입장·재생 위치 공유를 확인했다. [결과](evidence/outdoor/lan-check.json). 다른 물리 기기에서의 접속은 이 검사에 포함하지 않는다.

### 발견 후 수정한 문제

1. 목재 텍스처 함수가 반환한 Canvas를 재질 `map`에 직접 전달해 첫 화면이 그려지지 않았다. `THREE.CanvasTexture`로 변환했다. 실제 생성 장면의 모든 텍스처 슬롯에 `isTexture` 회귀 검사를 추가했다.
2. 기존 이동 격자의 중심 높이만 검사해 셀 안의 좁은 곡선 단차를 놓쳤다. 오른쪽 출입구 경로에 최대 0.36m 단차가 있었다. A*와 경로 단순화가 실제 바닥의 원·방사선 경계를 검사하도록 수정했다. 연결 판정은 캐시한다. 바닥이나 허용 단차 0.23m는 바꾸지 않았다. 전체 단원의 실제 경로를 1cm 간격으로 독립 검사한다.

## 재현 기준과 한계

- 제품 JS 63개 SHA-256: `d96f687eafa997b046e140e743f0d6f20976e75f9df395fe9067756c44250c4a`.
- 악보·테스트·하네스를 포함한 검증 입력 SHA-256: `f7678218b983c53b8dd4aab95203d08afdd733808386f91896c3da69588a0f94`.
- 수치 검사는 실제 악보에서 추출한 구간과 무대 전체 이동을 실행한다. 82곡 모두를 실시간 완주한 검사가 아니다.
- 모바일은 Mac의 Chrome 에뮬레이션이다. 실제 iPhone/Safari의 GPU·발열·배터리·장시간 연속 재생은 미검증이다.
- 녹화와 렌더 이미지는 실제 앱 결과다. 공연의 예술적 품질이나 실황 녹음과 동일한 음질을 자동 검사로 보장하지 않는다.
- Vercel 배포 중단은 유지한다. 이 작업은 PR 브랜치와 로컬 미리보기에 반영하며 main 병합은 하지 않는다.
