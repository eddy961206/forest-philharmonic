# e741 → 6c78172: 로딩·음향·기능 실행 결과

작성 기준: `2026-10-22T01:10:35.459209+00:00`. 원본 진행 상태: `2026-10-22T01:09:51.623008+00:00`.

이 문서는 완료된 원문 JSON과 실행 종료 기록을 읽어서 만든 결과야. 제품 기준선은 `e741811d1d7a040afcdd3a8230465980c64f82fc`, 후보는 `6c7817218814f00631089eb2c6f150d68190980f`야. 분석 중 제품이나 수집 도구를 수정하거나 브라우저를 추가 실행하지 않았어. 원문 파일 경로·SHA-256·수집기 해시는 [기계 판독 요약](runtime-validation-summary.json)에 있어.

## 현재 완료 범위

| 검증 | 완료 결과 | 해석 범위 |
|---|---|---|
| 로컬 멀티플레이 프로토콜 | 16/16 PASS | 실제 서버·RoomClient, UI 렌더링과 분리 |
| 고정 관객 초기 로딩 | 두 공연장 × 전후 4회 PASS; 쌍별 111/111 확인 | 회당 cold 1회 + warm 1회 |
| 박수 Worker / CSP fallback PCM | 4/4 PASS; 32버퍼·64채널 해시 일치 | 기존 동기 합성과 같은 브라우저에서 비교 |
| 실제 AudioContext + native rAF 음악 | 두 공연장 × 전후 × desktop/mobile 8/8 PASS | low, 30초 live 창, 2초 재개 조건 유지 |
| 제어 프레임 기능 | 완료 4회 중 PASS 4회 | 아래 개별 상태·제한 참고 |
| 브라우저 방 UI | 완료 2회 중 PASS 2회 | 아래 개별 상태·제한 참고 |
| 돔 이동·전환 | 완료 2회 중 PASS 2회 | 아래 개별 상태·제한 참고 |

runtime-app 전체 16개 중 16개 종료. 종료 기록이 없는 raw는 집계하지 않았어.

## 공통 측정 환경과 조건

Linux x64, Node 24.19.0, Playwright 1.62.1, Chromium 153.0.8010.0 headless, ANGLE SwiftShader야. 물리 GPU·실제 휴대폰 결과가 아니야. 폰트는 같은 시스템 대체 폰트를 사용했어. browser command-line 조회가 `--enable-automation` 미설정 때문에 거절된 native 기록은 그 오류와 요청한 Chrome 인자를 모두 보존했어. 제품 오류와 구분해야 해.

로딩은 desktop high 640×360/DPR 1, native 음악은 desktop 640×360 또는 모바일 에뮬레이션 390×844/DPR 1에 low야. 두 조건 모두 각 전후끼리 동일 preset이야. low의 기존 Lite 경로를 사용한 native 결과를 high 최적화나 새로운 적응형 품질 효과로 계산하지 않아.

## 초기 로딩: 같은 조건의 한 쌍씩

`loading.mjs`가 실제 입장 버튼의 활성화를 MutationObserver로 재고, 본 장면의 rAF는 첫 호출부터 잡아 두었어. 실제 장면 생성·PMREM·AudioContext/IR·샘플 디코딩·박수 준비·악보 로딩은 수행해. 완전한 화면의 첫 표시나 사용자가 움직일 수 있는 시각까지 측정한 값은 아니야. cold는 새 Chromium context의 HTTP 캐시, warm은 같은 context에서 같은 URL로 두 번째 진입이야. 운영체제·Node 파일 캐시는 cold라는 보장이 없어.

관객 seed 417, 점유 좌석의 정렬 SHA-256, 곡, 샘플 수·PCM 용량, viewport/DPR, renderer, preset, 폰트, 수집기 및 브라우저 조건을 각각 대조했어. Hall·Sphere 비교가 각각 111/111 PASS야. [Hall 파일 비교 결과](loading-hall-comparison.json), [Sphere 파일 비교 결과](loading-sphere-comparison.json), [로딩 원문](runtime-core-v2/raw/)을 참고해.

| 공연장/캐시 | ready ms 기준선 → 후보 | 변화 | long task 합계 ms | 최장 long task ms | 횟수 | JS heap B |
|---|---:|---:|---:|---:|---:|---:|
| hall / cold | 13,536.3 → 11,602.7 | -14.28% | 2,853 → 2,099 | 2,011 → 1,774 | 3 → 3 | 410,000,000 → 462,000,000 |
| hall / warm | 10,837.3 → 11,037.5 | +1.85% | 1,918 → 1,288 | 1,263 → 979 | 3 → 3 | 410,000,000 → 462,000,000 |
| sphere / cold | 8,116.3 → 7,687.7 | -5.28% | 2,325 → 2,100 | 1,395 → 1,674 | 3 → 5 | 410,000,000 → 410,000,000 |
| sphere / warm | 7,212.5 → 6,825.5 | -5.37% | 1,502 → 1,170 | 831 → 847 | 3 → 4 | 410,000,000 → 410,000,000 |

**악화된 관측을 제외하지 않았어.** Hall warm ready는 200.2ms 늘었고, Hall heap 스냅샷은 410MB→462MB야. Sphere cold 최장 long task는 1,395→1,674ms, warm은 831→847ms로 늘었어. 모든 조건에서 long task 합계는 줄었지만 이 값은 전체 CPU 사용 시간이 아니야. heap은 GC를 강제하지 않은 거친 `usedJSHeapSize` 한 시점이고 오디오 네이티브 메모리·VRAM·최대 사용량이 아니므로 메모리 개선이나 누수 여부를 단정할 수 없어.

| 고정된 내용 | Hall | Sphere |
|---|---:|---:|
| high 관객 점유 인원 | 846 | 3,461 |
| 악기 샘플 수 | 389 | 389 |
| 디코드한 악기 PCM | 296,771,776 B | 296,771,776 B |
| close/wash 박수 PCM | 15,552,000 B | 15,552,000 B |
| cold 샘플 응답 인코드 크기 | 10,666,245 B | 10,666,245 B |
| warm 샘플 캐시 적중 | 389/389, 응답 인코드 0 B | 389/389, 응답 인코드 0 B |

표의 값은 전후와 cold/warm에서 일치했어. 네트워크 응답 바이트는 CDP의 encodedDataLength이며 실제 패킷 총량이 아니야. seed를 고정한 `main.js`만 QA identity 응답으로 분리했고, 그 cold 응답은 99,044→102,976B야. 원본 배포 main.js 전송량으로 해석하면 안 돼. 관객 RNG 외의 전역 무작위 값과 IR 샘플은 같게 만들지 않았어. Sphere 돔의 `mesh.visible` 확인은 양쪽 성공했지만 첫 픽셀·shader compile 성공을 검증하는 관측은 아니야.

한 번씩의 cold/warm 관측이라 오차 막대나 반복 실험의 인과 개선율은 없어. 로딩 시간이 줄었다는 관측과 통계적으로 재현되는 성능 개선을 구분해야 해.

## 음표·박수·재개 동작 보존

### Worker PCM

[원문](runtime-core-first/raw/audio-worker-candidate.json)의 Worker desktop/Lite, CSP로 Worker를 막은 fallback desktop/Lite 네 경로가 모두 통과했어. 각 경로의 welcome·normal0·normal1·finale에 close/wash 8개 스테레오 버퍼가 있고, 총 32버퍼의 64채널 SHA-256이 같은 브라우저에서 기존 동기 합성 결과와 정확히 같아. desktop은 15,552,000B, Lite는 10,368,000B야.

준비 Promise의 재사용, 준비 버퍼 수, 준비 후 동기 재생 경로와 Worker 종료도 확인했어. fallback 두 경로의 `worker-src none` console 오류는 의도한 차단 증거로 보존했어. 이 검사는 앱 전체 GPU 작업이나 물리 스피커 출력·잔향까지 녹음한 비교가 아니고, 단발 준비 시간으로 성능 향상률을 계산하지 않았어.

[독립 소스 비교](tool-compat/held-note-audit/README.md)는 최신 main과 후보의 음향 핵심 7개 구간이 같은 문자열임을 기록해. crowd.js 전체, Performance의 시각화 이전 transport·scheduler, 악기 envelope/room 상수, AudioContext/오디오 그래프, 샘플 로딩·디코드·선택, timer·발음·sustain/release·stop, 박수 재생 이후 믹스·IR 생성이 대상이야. 음표 수나 샘플 음질을 줄인 성능 개선으로 계산하지 않아. 코드 보존과 PCM 일치는 중요한 근거지만 실제 출력 장치·HRTF·리샘플링의 청감 일치를 대신하지 않아.

### Native 음악 8회

실제 solo/공연 시작/일시정지/22초 탐색/재개 UI, 원래 AudioContext·샘플·스케줄러, native main rAF를 사용했어. `READBACK=0`, `FRAME_MODE=native`, `LIVE_WINDOW_MS=30000`, `PRELUDE_FRAMES=2`, 고정 관객 seed 417이야. 원래 재개 조건은 음악 시각이 탐색 위치 + 0.05초를 2,000ms 안에 넘는 것이며 완화하지 않았어. 아래 표의 재개 시간은 이 조건이 관측될 때까지의 Node 경과 시간이야.

관찰 래퍼는 `playNote`의 인자·시계·원본 메서드를 바꾸지 않고, scheduler의 악보 인덱스·호출 수·음높이·길이·gain/layer를 비교해. 탐색 직전부터 울리던 held 음은 원래 악보, 남은 길이, skip, velocity, start time과 예상 수량을 별도로 검사해. 원문 `observation.notes`와 `observation.noteAudit`에 각 요청의 인자·원본 이벤트·불일치 목록이 있어. scheduler의 humanization과 절대 시각은 서로 같은 바이트라고 주장하지 않아.

| 공연장/화면 | 제품 | 신규 scheduler / held 요청 | held 예상/관측 | 2초 조건 관측 ms | 전체 late / live late | live 최장 tick 간격 ms |
|---|---|---:|---:|---:|---:|---:|
| hall/desktop | 기준선 | 923 / 9 | 9/9 | 247.4 | 48 / 36 | 1,606.3 |
| hall/desktop | 후보 | 920 / 9 | 9/9 | 245.9 | 0 / 0 | 583.2 |
| sphere/desktop | 기준선 | 475 / 0 | 0/0 | 246.7 | 51 / 51 | 2,980.9 |
| sphere/desktop | 후보 | 483 / 0 | 0/0 | 234.6 | 8 / 0 | 619.0 |
| hall/mobile | 기준선 | 966 / 9 | 9/9 | 240.0 | 33 / 0 | 42.6 |
| hall/mobile | 후보 | 935 / 9 | 9/9 | 253.1 | 0 / 0 | 54.3 |
| sphere/mobile | 기준선 | 499 / 0 | 0/0 | 234.4 | 28 / 28 | 2,844.6 |
| sphere/mobile | 후보 | 487 / 0 | 0/0 | 256.3 | 6 / 6 | 813.9 |

8회 모두 23개 조건이 통과했어. 관측된 원본 악보 불일치, held 누락/추가, scheduler 호출 수 불일치, 재생 중 출처 불명 요청, observer 오류, 기록 누락, page/console 오류와 context loss는 모두 0이야. 이는 검사한 구간 안의 요청 계보를 확인한 결과이며 곡 전체 모든 음의 실제 출력 완료를 보증하지 않아. 전체 요청 수는 시작/관찰 창의 음악 시각 차이로 달라지므로 단순 총수 차이를 음표 생략으로 볼 수 없어.

Hall의 탐색 위치는 실행마다 실제 held 9개를 검사했어. Sphere 곡의 22초 위치는 held 예상 0개였고 실제도 0개여서, Sphere에서 소리가 나는 유지음의 청감 결과까지 검사했다고 표현하지 않아. Hall 곡은 `beethoven-ode-to-joy`(73.94초), Sphere 곡은 `bach-wachet-auf`(92.66초)이며 전후 곡 hash가 같아. Lite 관객의 실제 점유는 Hall 200명/Sphere 2,500명으로 전후 같고, 계획 인원 846/3,461명과 구분해.

**late가 0이어야 PASS인 검사는 아니야.** late는 요청한 `when`이 그 시점 AudioContext.currentTime보다 이전인 요청 수야. 후보 Sphere mobile에서 live 6건이 남았고, Sphere desktop은 전체 8건 중 live 밖에 8건이 있었어. 악보 인자 검사가 통과해도 청감상 끊김이 없다고 할 수 없어. 원래 main의 baseline에서도 late가 발생했으므로 이번 후보에서 처음 생긴 문제라는 근거는 없지만, 실제 기기에서 들으며 재확인할 잔여 위험이야. 원문 요청을 다시 세어 요약과 일치함을 확인했고 후보 Sphere mobile의 가장 늦은 lead는 −327.1ms(인덱스 339–344), Sphere desktop은 −31.8ms였어. 낮은 FPS에서도 음악 시계가 진행한다는 것만으로 이런 요청 지연이 없어지는 것은 아니야.

30초 live 창에서 실제 오디오/음악 시계는 약 29.995~30.016초 진행했어. 엔진의 `voices`는 논리 음성 레코드이며 모든 AudioNode 수·오디오 스레드 CPU·장치 underrun 수가 아니야. native 검사에서 `controlledWaitsContainNoMainFrames=true`는 해당 없음 분기의 결과이므로 native 중 렌더가 중지됐다고 해석하지 않아. 또 공통 경계 이름에 `after-readPixels`가 있어도 이 8회의 READBACK=0 경로에서는 readPixels를 실행하지 않았어.

### Native rAF 진단값과 비교 한계

| 공연장/화면 | main rAF Hz 기준선 → 후보 | 1% low Hz | p95 ms | 시작 음악 시각 s |
|---|---:|---:|---:|---:|
| hall/desktop | 5.058 → 5.890 | 0.918 → 1.923 | 374.2 → 329.0 | 24.802667 → 24.674667 |
| sphere/desktop | 4.846 → 4.756 | 0.388 → 1.270 | 388.9 → 407.2 | 24.695999 → 24.610666 |
| hall/mobile | 5.340 → 6.153 | 1.329 → 2.409 | 351.1 → 309.6 | 25.826665 → 25.037332 |
| sphere/mobile | 4.030 → 4.078 | 0.450 → 1.166 | 446.6 → 487.3 | 24.973333 → 24.674667 |

좌석·카메라 위치/회전/FOV·preset·DPR·관객 hash·곡 hash·수집기·브라우저 조건은 각 전후 쌍에서 일치했어. 그러나 네 쌍의 live 시작 음악 시각이 정확히 일치하지 않고 관찰 길이도 수 ms 달라. 따라서 표는 진단값이며 엄밀한 동일 음악 시각 FPS A/B 성능 향상으로 채택하지 않아. 각 raw의 `eligibleWithinThisRun=true`는 실행 중 감지된 조건 변경이 없다는 뜻일 뿐 두 실행 간 동등성 판정이 아니야. frame 시작·이벤트·1초 상태 표본 사이에서 일어난 짧은 변화까지 배제하지는 못해.

main rAF 시작 간격은 compositor가 실제 표시한 FPS나 GPU 프레임 시간이 아니야. 관찰 래퍼 자체의 부하도 포함해. 각 1% low는 가장 느린 표본 2개에 기반하므로 안정적 추정이 아니야. Sphere desktop의 평균 rAF·p95, Sphere mobile의 p95 악화도 그대로 남겼어. 이 소프트웨어 환경에서 안정적인 30/60FPS를 입증하지 못했어.

## UI 기능·방·돔 후속 실행

이 부분은 native 음악과 별도 조건이야. 제어 프레임 기능 검사는 실제 UI/키보드/CDP touch를 쓰지만 main rAF를 잡고 한 프레임씩 실행한 뒤 `readPixels` 완료를 기다려. desktop은 처음 high 960×540, mobile은 처음 low 390×844이며 이후 medium/low/high 수동 전환을 실제 검사해. 카메라 좌석 근접 배치, 기존 tween 완료, 현재 곡 roster 정렬을 fixture로 사용하므로 연속 자유 이동이나 실제 공연 전체 리허설과 같지 않아.

| 실행 | 상태 | 완료 프레임/조건 | 미검사·실패 |
|---|---|---|---|
| candidate-functional-hall-desktop | PASS | 14 frames, resume passed | 없음 |
| candidate-functional-sphere-desktop | PASS | 17 frames, resume passed | 없음 |
| candidate-functional-hall-mobile | PASS | 14 frames, resume passed | 없음 |
| candidate-functional-sphere-mobile | PASS | 17 frames, resume passed | 없음 |
| candidate-rooms-hall | PASS | 별도 원문 참조 | 없음 |
| candidate-rooms-sphere | PASS | 별도 원문 참조 | 없음 |
| baseline-dome-motion | PASS | 별도 원문 참조 | 없음 |
| candidate-dome-motion | PASS | 별도 원문 참조 | 없음 |

native PASS와 controlled 기능 실패가 함께 나오는 경우 서로 상쇄하지 않아. 각 조건의 `resumeTrace`/시계 진행·worker tick·실패·unchecked 원문을 별도 보존해. `readPixels`의 GPU stall 경고 자체는 해당 검사가 실제 동기 GPU 완료를 기다린 흔적이고 경고를 지운 결과로 보고하지 않아. 종료 상태와 후속 미검증 항목은 문서 첫 표의 시점을 따라.

기능 네 실행 모두 입장, W/마우스 또는 CDP joystick/canvas drag, E 또는 touch 앉기·일어나기, 카메라와 listener 목표 위치/방향, 실제 시작·정지·탐색·재개, 수동 medium/low/high 전환, 관객 및 무대 중계 on/off와 실제 render pass를 확인했어. 재개 trace는 2초 조건을 그대로 두고 286.4/285.6/326.7/312.4ms에서 통과했고 AudioContext 시계와 tick이 진행했어(Hall desktop, Sphere desktop, Hall mobile, Sphere mobile 순서). page/console error·실패·unchecked·context loss·WebGL error는 네 raw에서 모두 비어 있어. Sphere에는 KHR_parallel_shader_compile 미지원 경고가 있고 데스크톱에는 readPixels 경고가 있어.

Sphere desktop은 프로그램 UI와 탐색으로 FOREST3D를 표시하고 live 복귀를 확인했어. 모바일은 기존 Lite의 FOREST 셰이더 경로이므로 모바일 3D 세계를 검증했다고 말하지 않아. 자동 화질 항목은 setting/reset 후 초기 preset(SwiftShader desktop medium, mobile low)만 확인했고 실제 프레임 시간에 따른 하강·회복·열 안정성을 측정하지 않았어. 연주자/지휘자 roster와 렌더는 확인했지만 개별 손가락·활·음향 최종 출력 동기를 계측한 결과는 아니야.

방 UI 두 실행은 실제 BrowserContext 두 탭에서 비공개 방 생성·입장, 방장/손님 버튼 권한, 실제 시작·pause/resume, 일치하는 roster, 채팅 form 전달/echo, 방장 이양과 새 방장의 정지를 확인했어. Hall cross는 공연장 selector와 잘못된 공연장 초대 URL의 자동 redirect·재입장도 포함해. low, 관객/효과/중계 off, 음량 0, 마지막 두 캔버스 검사만 제어 프레임이라는 fixture를 사용했으므로 방 UI 외의 품질·음향 동기·부하 결과로 쓰지 않아. rooms raw에는 제공된 모든 제품 모듈의 SHA-256 묶음이 없고 revision·runner의 collector hash가 있으므로, 기능/native raw와 같은 수준의 served-source hash 증거가 있는 것처럼 합치지 않아.

### 돔 회전·전환의 명시 프레임 검사

medium 640×360/DPR 1(렌더 pixelRatio 0.85, cube 512), 두 프레임 준비 뒤 28단계의 360도 회전, reveal/crossfade 각각 0/25/50/75/100%의 다섯 시각에서 4패스씩 검사해. 각 전환 20표본, 회전을 합쳐 실행당 68표본이야. 원래 3D 시각 요소를 쓰지만 음표 스케줄러는 끄고 음악 시각을 고정한 fixture라 연속 실시간 4초 공연이나 음향 시험은 아니야.

| 제품 | 회전 | reveal | crossfade | sourceConsistency | 종료 |
|---|---|---|---|---|---|
| baseline-dome-motion | 28/28 | 20/20 | 20/20 | PASS | CLOSED |
| candidate-dome-motion | 28/28 | 20/20 | 20/20 | PASS | CLOSED |

돔 주 카메라 draw·program linked/readiness와 요청한 preset, 표본의 WebGL 오류·state/hook 복원을 확인했어. 회전 중 요구 면의 첫 사용 갱신, 전환의 두 slot 요청은 renderer.render 요청과 정상 반환 관측이야. 큐브 세계의 모든 proxy mesh가 실제 픽셀을 그렸다는 증명, 매 프레임 fresh 픽셀 보장, 최소 face mask나 VRAM 측정으로 해석하면 안 돼. 원래 제품이 제외하는 −Y 면은 계속 제외돼. 캡처 hash가 원문에 있지만 이 보고서는 이미지 품질을 육안·픽셀 차이로 판정하지 않았어. completeMs에는 probe와 readPixels가 포함돼 FPS나 순수 GPU 성능 비교로 쓰지 않아.

## 멀티플레이 프로토콜 16개 검사

[원문](runtime-core-v2/raw/multiplayer-candidate.json)은 실제 로컬 server/rooms/ws와 실제 RoomClient를 Node WebSocket으로 실행했어. 오디오 모듈 MIME/hash/304, 샘플 캐시·Range 바이트, 공개 Hall/비공개 Sphere 방, 같은 seed, 잘못된 공연장 redirect, 늦은 참가자 snapshot, 정원, host 명령 전달·guest 위조 거절, clock ping, pose clamp/seat 0/throttle, 채팅 정제·echo/rate limit, 방장 이양·재접속 권한, 방 격리를 확인했어.

새 main의 재접속 정책에 따라 guest ID 4→4, host ID 1→1과 CID·seniority가 보존됐어. 방/구성원의 유예 설정은 120,000ms이며, 빈 방 목록 제거와 유예 중 코드 재입장은 검사했지만 실제 120초가 지난 뒤의 만료는 기다려서 측정하지 않았어. 이 프로토콜 검사를 렌더된 두 탭의 UI나 장치 간 오디오 동기화, 서버 부하 테스트로 확대 해석하지 않아.

## 첫 FAIL과 도구 정정

[runtime-core-first](runtime-core-first/)의 실패 원문과 종료 로그는 덮어쓰지 않았어. 이후 제품 버전은 고정하고 수집 도구의 오래된 기대값을 확인된 소스 계약에 맞게 고쳤어.

| 첫 실행 | 실제 실패 | 정정 근거 | 재실행 |
|---|---|---|---|
| loading 4건 | actual 15,552,000B ≠ 옛 expected 14,288,400B | e741의 4 profile × close/wash × stereo, desktop 24kHz / Lite 16kHz를 소스에서 계산 | 4 PASS |
| multiplayer 1건 | 재접속 ID가 기존 4이면 실패하도록 검사 | 최신 main은 동일 CID의 ID·seniority 보존; 각 탭 sessionStorage도 독립화 | 16 cases PASS |
| audio Worker 1건 | 첫 실행부터 PASS | 구/신 박수 PCM 계약과 기존 합성 결과 직접 비교 | 최초 PASS 원문 사용 |

알 수 없는 PCM layout은 여전히 FAIL이야. 오디오 2초 재개 조건, 필수 프레임, 음표 수량을 완화하지 않았어. 새 `_resumeHeld`가 원래 음표를 남은 길이와 skip으로 재개하므로 이를 신규 scheduler 음과 분리한 도구 교정도 [held-note 감사](tool-compat/held-note-audit/README.md)에 남겼어. scheduler와 held 각각의 원본 악보 정합성·누락·추가를 검사해서 조용히 제외하지 않아. [PCM 계약 감사](tool-compat/pcm-contract/README.md)와 [도구 호환 기록](tool-compat/README.md)을 함께 보면 돼.

과거 `6a59c33/06c8ac5`에서 관측된 controlled AudioContext 정지는 [이전 조건 분석](tool-compat/held-note-audit/README.md)에 남아 있어. 이전 제품/다른 조건의 PASS·FAIL을 e741→6c 결과에 합치거나 이번 실패를 없애는 근거로 쓰지 않아.

## 다시 집계하고 실제 PC에서 확인하는 방법

브라우저 없이 이 로딩 비교를 재생성하려면 저장소 루트에서 새로운 출력 위치를 지정해 실행해. 입력 원문은 변경하지 않아.

```bash
node tools/bench/compare-loading.mjs \
  docs/performance-data/main-e741/runtime-core-v2/raw/loading-baseline-hall-desktop.json \
  docs/performance-data/main-e741/runtime-core-v2/raw/loading-candidate-hall-desktop.json \
  qa-results/loading-hall-comparison.json
node tools/bench/compare-loading.mjs \
  docs/performance-data/main-e741/runtime-core-v2/raw/loading-baseline-sphere-desktop.json \
  docs/performance-data/main-e741/runtime-core-v2/raw/loading-candidate-sphere-desktop.json \
  qa-results/loading-sphere-comparison.json
```

실제 PC의 별도 서버/worktree·Chrome 설정·중간 재개·원문 hash 확인은 [PC 재현 안내](../../performance-reproduce-e741.md)를 따라. 실행 명령·환경변수·timeout·종료코드·heartbeat는 [runtime-app-plan.json](runtime-app-plan.json)과 각 `runtime-app/logs/*.json`, 로딩은 `runtime-core-v2/logs/*.json`에 있어. 실제 GPU를 비교할 때는 SwiftShader 플래그를 제거하고 각 raw의 renderer를 확인해야 해. 기존 클라우드 raw와 실패 로그를 덮어쓰지 않고 새 결과 폴더를 써.

## 아직 이 자료로 확인하지 못한 것

실제 PC·스마트폰·태블릿의 GPU 프레임 시간/VRAM, iOS Safari·Android Chrome·Edge의 실기기 동작, 스피커/헤드폰 녹음과 청음, 최종 공간음향·잔향의 물리 출력 일치, 오디오 underrun 횟수와 전체 AudioNode/graph CPU, 수 시간 관람·열·배터리·메모리 추세는 미측정이야. 30초 native와 일부 명시 프레임 검사를 장시간 안정성으로 표현하지 않아. 이 보고서의 16개 runtime-app 작업은 모두 종료했지만 별도 장시간·실기기·청음 검증까지 완료한 것은 아니야. 각 suite의 PASS는 위에 적은 실제 조건과 검사 범위를 뜻해.
