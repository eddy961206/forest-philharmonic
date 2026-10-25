# 반복 사용 성능 결함 점검

2026-10-25, PR #20 `feat/orchestral-repertoire`에 누적. 배포와 main 병합은 하지 않았다.

## 발견한 문제와 수정

| 문제 | 원인 | 변경 |
| --- | --- | --- |
| 빠른 곡 선택 시 버린 곡까지 CPU 계산 | 다운로드 후 최신 선택 검사보다 악보 정렬·음량·활동 분석이 먼저 실행됨 | 준비 직전에 최신 선택 확인. 같은 곡 요청 공유와 명시적 미리 준비는 유지 |
| 아바타 퇴장·재접속 시 전용 재질 미해제 | geometry만 해제하고 치마·눈 반사·볼터치의 개별 material은 남음 | 캐릭터 소유 재질만 추적·해제. 공유 재질과 텍스처는 유지 |
| 화질 전환 시 Bloom 재질 참조 누적 | vendored UnrealBloomPass.dispose가 high-pass material을 누락 | 공통 composer 해제 함수에서 보완. context loss도 같은 경로 사용 |
| 현재 화질을 다시 눌러도 렌더 자원 재생성 | 값 변경 여부 없이 composer/그림자/자동화질 상태 재설정 | 같은 설정은 즉시 종료 |
| 비정상 클라이언트의 빈 WebSocket 조각 누적 | 바이트 제한과 별개로 빈 payload도 배열에 저장 | 빈 payload는 보관하지 않음. 정상 분할 UTF-8와 64 KiB 한계 유지 |

서버 빈 조각 문제는 일반적인 브라우저 사용에서 재현한 현상이 아니다. 입력 제한의 결함을 회귀 검사로 확인했다.

## 수정 전후 실제 브라우저 재현

도구: CDP direct로 관리하는 전용 Chrome 156에 Puppeteer CDP 연결. Mac mini M4, 1200×800, DPR1. 실제 야외 무대에서 모차르트 교향곡 40번 199초 지점을 재생하고 화면을 직접 확인했다. 이 검사는 FPS 측정이 아니다.

이전 코드는 `QA_REV=ecd5c09`로 모든 tracked `public/js` 모듈을 해당 Git 커밋에서 제공했다. 수정 후 제품 소스는 `44dd386d8ab6e47a0c22ba3d374339eb19de77f3`, JS SHA256 `24787456dc3b66da5483841e30946cf5a7e075488a2fae60befd310394b1cea3`이다.

| 재현 | 이전 | 수정 후 |
| --- | --- | --- |
| 10곡을 연속 선택, 다운로드 응답 보류 후 해제 | 10곡 prepare 실행 | 마지막 1곡만 prepare 실행 |
| high↔low 6회 왕복, 실제 컴파일된 high-pass shader 참조 수 | 1→2→3→4→5→6→7 | 1→1→1→1→1→1→1 |
| 현재 high 6회 재선택 | material dispose 60회 | 0회 |
| 화면에 나타낸 dress 아바타 추가·제거 6회 | 치마 material dispose 매번 0회 | 매번 1회 |

이 검사의 아바타는 실제 Avatar 생성·렌더·제거 경로를 호출한 로컬 객체다. 별도의 두 클라이언트 재접속 검사는 아래에 기록한다. `voices.size=0`은 음향 엔진의 관리 목록이 비었다는 뜻이며 모든 브라우저 내부 AudioNode의 메모리 해제를 입증하지 않는다.

## 재현 명령

이미 준비한 전용 CDP 브라우저와 서버에 연결한다. 다른 공연 QA 탭은 닫는다. `PUPPETEER_PATH`는 실행 환경의 실제 설치 경로를 지정한다.

```sh
QA_REV=ecd5c09 QA_OUT=work/performance-lifecycle/resources-before node tools/qa/verify-performance-resources.mjs
QA_OUT=work/performance-lifecycle/resources-after node tools/qa/verify-performance-resources.mjs
QA_OUT=work/performance-lifecycle/final-cache-aware node tools/qa/verify-performance-lifecycle.mjs
RECONNECT_ROUNDS=6 QA_OUT=work/performance-lifecycle/network node tools/qa/verify-room-reconnect.mjs
npm run verify:motion -- --out work/performance-lifecycle/verification
QUALITY_MODE=efficient CPU_RATE=4 CAMERA=cinema QA_OUT=work/performance-lifecycle/fps node tools/qa/quality-optimization-measure.mjs after outdoor 20 measure
```

메모리 검사와 FPS 검사는 순서대로 실행한다. FPS 동안 녹화·인코딩·다른 검사·다른 공연 탭을 실행하지 않는다.

## 검사 도구에서 바로잡은 점

- 첫 자원 검사에서는 카메라 이동과 눈 깜빡임으로 처음 보이는 기존 geometry까지 새 누수로 취급했다. 고정 무대 구도로 바꾸고 실제 WebGL geometry의 최초 업로드를 추적했다. 이미 scene에 존재하는 geometry의 지연 업로드와 새 객체 누적을 구분한다. 초기 실패 JSON도 보존한다.
- material 검사 초안은 아바타 이름표 Sprite를 공유 재질로 분류했다. 이름표 정상 해제를 확인한 후 공유 캐릭터 Mesh만 검사하도록 분리했다. 허용값으로 실제 누수를 덮은 변경은 없다.
- 공연장 이동 후 전체 renderer의 문서·listener·heap 증가를 처음에는 누수 후보로 분류했다. 별도 재현에서 `pagehide.persisted=true`를 확인했다. Chrome의 BFCache가 뒤로 가기를 위해 이전 문서를 보관한 것이므로 같은 화면 안에서의 누수 검사와 분리한다. 이 캐시를 임의로 끄거나 복귀 동작을 바꾸지는 않았다.

## 공연장 이동의 메모리 해석

일시정지한 뒤 공연장을 이동하면 Chrome이 이전 공연장을 BFCache에 남길 수 있다. 이때 GC 후에도 이전 문서와 listener가 남는 것은 예상 가능한 캐시 동작이다. 측정한 메모리 비용은 기록하되 영구 누수로 단정하지 않는다. 현재 공연장의 scene 객체·샘플 수는 비교하고, 뒤로가기 후 재생 상태 복귀도 확인한다.

`about:blank` 전환 뒤 검사하는 값은 **현재 CDP target의 renderer** 수치다. 브라우저 전체 프로세스의 메모리 회수나 모든 이전 PCM의 즉시 해제까지 입증하지 않는다. 실제 캐시 보존량은 기기와 브라우저의 메모리 정책에 따라 달라질 수 있다.

## 범위와 한계

JS heap은 GC 요청 후 관측한 값이다. 디코딩된 오디오 PCM과 GPU 메모리는 별도이므로 JS heap을 앱 전체 메모리로 해석하면 안 된다. 일반 데스크톱 음향 샘플은 약 457 MiB의 PCM을 사용한다. 반복 검사에서는 버퍼 수와 바이트가 추가로 늘어나는지 확인한다.

CPU 4배 감속은 실제 저사양 기기를 대신하지 않는다. 실제 iPad/구형 기기, 수 시간 발열, 대규모 동시 접속, 모든 브라우저 내부 오디오 노드의 장기 보존 여부는 이번 검사 범위 밖이다. 아래 기록은 검사한 경로에 대한 결과이며 모든 성능 결함의 부재를 보증하지 않는다.
