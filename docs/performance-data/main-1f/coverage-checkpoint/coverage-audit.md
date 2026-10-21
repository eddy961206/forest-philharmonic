# 최신 main 1f 검증 범위 독립 감사

## 판정 시점과 읽은 자료

**이 문서는 수집기의 설계 범위와 2026-10-21 13:21:46 UTC에 닫힌 결과를 구분한 감사야. 이후 대기열의 실행 완료를 자동으로 반영하지 않아.** 브라우저, GPU, 이미지 계산은 실행하지 않았고, 기존 원본 JSON·실행 계획·소스·재현 문서만 읽었어. 과거 a41·3f·6a/06 결과는 최신 1f 결과로 세지 않았어.

비교 대상은 baseline `1f8e5f16f1eee03140e13ba1ee66832841559604`와 candidate `dea7997c6278f10ff467815ab96b370362549b0c`야. `REVISION` 문자열만으로 소스가 같다고 판단하지 않고, 실제 HTTP 소스 해시와 수집기 해시가 별도로 필요해. 최신 재현 가이드의 수집기 체크포인트는 `cc0f9da70083b35818b0bca70487e0609d4609c4`이고, desktop functional 최초 실행과 이후 수정된 수집기는 바이트가 달라. 수정된 수집기로 재검사하기 전에는 이전 FAIL을 PASS로 바꿀 수 없어.

아래에서 **계획**은 실행 전 정의, **닫힘**은 해당 실행의 원본 status가 최종 상태라는 뜻이야. **PASS**는 해당 수집기의 assertion 범위만 의미해. 실기기 성능·청각적 무결성·장시간 안정성까지 통과했다는 뜻은 아니야.

## 실행 상태: 계획과 확정 결과를 분리

| 묶음 | 수집기 설계 / 계획 수 | 이 감사 시점에 확인한 실제 상태 | 아직 확정하지 않은 부분 |
|---|---|---|---|
| 고정 장면 렌더 | `render-plan.json` 28회. 두 공연장 × 세 품질 × 두 viewport의 A/B 24회 + high desktop 역순 B/A 4회. 각 장면 warmup 4, 표본 8 | `fixed/render`의 첫 high desktop A/B 4회 PASS. Sphere 12장면의 raw·해시·readiness·24 PNG는 별도 독립 감사 완료. 후속 임시 실행 폴더의 004~012 9회도 runner JSON은 PASS, 013 Hall high mobile candidate는 RUNNING | 임시 9회의 페어별 동일 조건·해시·시각 검토를 이 문서에서 새로 완료했다고 세지 않음. 나머지 14회 미완료. high 역순 반복까지 끝난 통합 개선율은 미확정 |
| rAF 간격 | `cadence-plan.json` 12회. low front/wide 8회 × 120간격, mobile auto front 4회 × 160간격 | 닫힌 최신 결과 없음 | 모든 cadence 결과, 1% low, auto 결과 대기 |
| GPU query | `gpu-plan.json` 4회. Hall high desktop front, Sphere high desktop forest A/B, 각각 4표본 | 닫힌 최신 결과 없음 | query 지원/유효성 및 elapsed 결과 대기. SKIP도 프로세스 exit 0일 수 있음 |
| 런타임 전체 | `runtime-plan.json` 33회 | 첫 8회 닫힘: plaza 4회 PASS, mobile functional 두 공연장 PASS, desktop functional 두 공연장 FAIL | baseline mobile transport, loading 8회, native audio 4회, 65초 audio 6회, rooms 2회, protocol 1회, rituals 2회 등 나머지 25회 대기 |
| desktop functional 재검사 | `functional-preset-recheck-plan.json` 2회, candidate full 범위 | 대기 | 기대 품질 값 수정 후 두 공연장 full 검사. 기존 2초 resume FAIL을 없애는 변경은 아님 |
| baseline desktop transport 추적 | `baseline-desktop-transport-plan.json` 2회 | `baseline-followup-queue.json`: WAITING_FOR_REMAINING_QUEUE | 최신 baseline에서도 동일 high desktop clock 정체가 재현되는지 아직 모름. 이전 6a 결과나 mobile low PASS로 대체 불가 |
| Node 단위 검사 | 통합 메타데이터의 실제 case 75개 | `docs/performance-data/main-1f-integration/node-tests.json`: 75 PASS, 0 FAIL | CPU 단위 검사야. 이 감사에서 재실행하지 않았고 실제 WebGL·소리·실기기 검증은 아님 |

후속 렌더 임시 원본은 `/tmp/forest-qa-1etnu01q/logs/004-…`부터 있어. 이는 감사 시점의 진행 상태만 기록한 경로이고, 영구 보존 경로는 root의 transfer manifest와 최종 evidence archive로 연결해야 해. 실행 중 파일은 수정하지 않았어.

### 최초 desktop functional FAIL의 정확한 범위

| 실행 | 보존된 실패 | 실제로 도달한 검사 | 통과로 세면 안 되는 검사 |
|---|---|---|---|
| Hall desktop | 실제 AudioContext 재개 후 2초 안에 음악 시간이 0.05초 이상 진행해야 하는 조건 timeout. 이어진 기존 quality 기대 값 `0.85 !== 1` | 입장, 이동·시점, listener 목표 pose, 실제 UI 앉기·일어나기, roster, seek, resume 관측, playback, quality 일부 | quality 전체 완료, 이후 audience·broadcast toggle·automatic·layout |
| Sphere desktop | 같은 2초 resume timeout. 이후 기존 auto 기대 값 `'medium' !== 'high'` | 위 공통 검사와 full FOREST3D 선택·전환 끝 controller 상태, 수동 quality/실제 cube RT 크기, audience, broadcast toggle까지 | automatic 완료, 최종 layout |

두 mobile raw는 PASS지만 Chromium의 mobile viewport/touch 에뮬레이션이야. 실제 Android/iOS 실행으로 표현할 수 없어. desktop 재검사 수집기를 고쳤다는 사실만으로 기존 raw FAIL과 재개 시계 정체가 해결되지는 않아.

## 사용자 요구별 coverage

| 요구 / 시나리오 | 현재 수집기가 실제로 하는 일 | 닫힌 최신 결과 | 입증하지 못하는 부분 / 해석 제한 | 소스 근거 |
|---|---|---|---|---|
| 두 공연장 최초 입장·초기 로딩 | loading은 cold/warm 동일 브라우저 HTTP cache, transfer/resource bytes, sample·PCM·관객 fingerprint를 비교. main rAF는 보류하고 enter 버튼 readiness 측정. plaza는 별도 실제 UI 경로 | plaza candidate 4조건 PASS. loading 최신 결과 대기 | `readyMs`는 첫 완전 렌더·첫 playable concert 시간 아님. 광장→표 구매→공연장까지 전체 성능이나 OS/서버 cold cache는 측정하지 않음 | loading.mjs:124,132,193,207; loading-proxy.mjs:157,174; plaza.mjs:82 |
| 관객이 많고 연주 중, 가까운 무대·전체 객석 | seed 417, fill 0.8, non-stage 좌석으로 재구성. 실제 오케스트라·관객·그림자·후처리 렌더. front/wide 고정 카메라·FOV 64·곡·시각 동일 | high desktop A/B 네 실행 닫힘. Sphere 12장면 별도 감사 완료 | 실제 음악 스케줄러는 꺼져 있고 `perf.time`은 synthetic. 동시 오디오 CPU 부하를 포함한 공연 FPS가 아님 | full-frame-fixture.js:103,127,169 |
| 이동하며 빠르게 회전 | `rotate`는 0.24 rad/frame yaw와 작은 x 이동·pitch를 주는 기존 benchRotate 경로. 현재 Sphere rotate의 world 선택은 ARCH | 첫 high desktop rotate 원본 있음 | FOREST3D 등에서 새 cubemap 면이 갑자기 드러나는 경로가 아님. 실제 키/터치 연속 이동, 빠른 3D 방향 전환·잔상은 기존 matrix로 입증 불가. 별도 dome-motion 수집기가 요청됐으나 아직 실행 안 함 | full-frame-fixture.js:16,128,139 |
| Sphere 일반 셰이더 | `dome`에서 AURORA, 돔 상부 카메라를 사용 | high desktop A/B 닫힘 | 다른 모든 painted shader·모든 시각의 같은 품질을 포괄하지 않음 | full-frame-fixture.js:134,139 |
| Sphere 실시간 3D 세계 | full desktop high/medium의 FOREST3D·PEAKS3D·OCEAN3D·CLOUDS3D 고정 카메라. full-frame readiness는 사용한 base/overlay 실제 main-camera draw와 프로그램 상태 확인 | high desktop 네 세계 A/B 원본·PNG 감사 완료. medium은 runner PASS만 확인 | desktop low 및 모든 mobile viewport는 기존 LITE fallback. mobile high 이름만 보고 실시간 3D world를 검증했다고 말하면 안 됨 | full-frame-fixture.js:112,139; domeshow.js:690; full-frame.mjs:124 |
| 세계 전환·크로스페이드 전체 | fixed matrix는 dur 60초 전환을 `dome.update(30)`으로 중간까지 직접 진행한 다음 warmup 4+표본 8프레임, 마지막 한 PNG. functional은 programme seek 후 `dome.update(8)`로 끝 상태를 직접 확인 | 첫 high desktop crossfade/reveal 중간 프레임 원본 있음. Sphere desktop functional에서 끝 controller mix/reveal 0은 관측됨 | 전환 시작/25/50/75/end 이미지나 연속 4~7초 시청을 입증하지 않음. 단일 PNG에서 overlay draw가 있어도 눈에 보이는 seam/잔상·시간적 팝핑 무결성은 별도야 | full-frame-fixture.js:141,142; functional.mjs:707,758 |
| 무대 중계와 숨김·복귀 | Hall broadcast, broadcast-hidden, broadcast-return의 다른 시선에서 중계 동작·부하. Sphere는 ARCH 중계 fixed 시점. functional 실제 UI 화면 off/on·pause 첫 refresh 확인 | high desktop 원본 있음. mobile functional PASS; Sphere desktop toggle까지 실행 | 모든 live 카메라, performer 교체·30분 방치 후 stale frame, 최악 중계+3D+파티클 조합 전체는 미검증 | full-frame-fixture.js:136,138; functional.mjs:791 |
| 폭죽·레이저·wash | 효과를 활성화하고 조명을 480회 1/60 업데이트, 즉시 confetti/fireworks와 10 settling update를 고정한 effects-show | 첫 high desktop 원본 있음 | 자연스러운 곡 마지막 타이머·전체 finale 시간 경로, 실제 소리와 폭죽 cue 동기화 전체는 아님 | full-frame-fixture.js:154 |
| high/medium/low 동일 품질 A/B | 양 버전 같은 viewport/DPR/preset, fixed seed·clock·camera로 계획. 품질·renderScale 원본 저장. 단계별 sample8과 PNG | high desktop 4회 닫힘, 추가 runner 완료분은 위 상태표 | 단순 low 전환을 같은 품질 개선으로 합산 금지. n8에서는 nearest-rank p95/p99가 최댓값. 한 번의 A/B로 안정적 효과 크기 확정 불가 | render-plan.json; browser.mjs:154; full-frame.mjs:35,169 |
| 평균 FPS·1% low·frame 안정성 | 별도 cadence만 native rAF callback 시작 사이 간격을 수집. low 120, mobile auto 160. 1% low는 가장 느린 ceil(n×.01) 간격의 평균으로 계산 | 최신 cadence 결과 없음 | sync completeMs를 1000으로 나눈 FPS는 앱 FPS가 아님. 120/160 모두 최악 두 간격만으로 1% low 계산. high/medium cadence는 계획에 없고 시뮬레이션 음악·입력 조건이야 | full-frame.mjs:145; browser.mjs:154; collect-plan.mjs:75,109 |
| CPU 메인 스레드 | phase wrapper, CDP Task/Script/Layout/RecalcStyle duration window 차이, longtask 관측 | 첫 high desktop raw 있음 | wrapper·계측·synchronous readPixels 대기가 포함돼. core utilization, 순수 JS 실행 비용, CPU 전체 프로파일 flame chart, 작업별 allocation·GC 분석 아님 | full-frame-fixture.js:5,21; full-frame.mjs:166,176 |
| GPU frame time·fragment/shader 비용 | 별도 EXT_disjoint_timer_query_webgl2가 실제 frame을 감싸고 readPixels는 query 밖. support/valid/disjoint/timeout을 기록. Hall front와 Sphere forest 각각 4표본 | 최신 GPU query 미완료 | unsupported/invalid는 미측정·SKIP. SwiftShader query는 물리 GPU 시간 아님. shader별 시간·컴파일 ms·fragment invocation/overdraw·대역폭을 직접 분리하지 않음 | gpu-timer.mjs:51,250,270; reproduce guide:620,631 |
| JS/GPU 메모리·텍스처/RT | renderer.info geometry/texture 수, JS heap 관측. GPU collector는 main scene geometry backing ArrayBuffer bytes 일부 추정 | 첫 high desktop counts/heap 있음 | counts는 byte 수·VRAM 아님. world scene·cache·object overhead·instanceMatrix/color·texture/RT/audio·driver 전체를 포함하지 않음. 장시간 leak/peak GPU allocation·GPU memory budget은 미측정 | full-frame-fixture.js:186; gpu-timer.mjs:130; reproduce guide:635 |
| 적응형 품질·회복·발열 | mobile auto front160간격 계획, functional auto 선택과 초기 policy 값 검사 | mobile functional에서 auto 설정 PASS. desktop는 새 기대 값 재검사 대기 | 고정 playing phase에서 실제 회복 허용 구간인 곡 사이 상태를 밟지 않아 상향 회복 입증 못 함. 160간격은 wall duration 고정이 아니고 열·배터리·지속 부하·hysteresis 전체 검사가 아님 | cadence-plan.json; functional.mjs:810; main.js의 allowRecovery; reproduce guide:328,664 |
| 앉아서 장시간 감상 | 수동 가이드에 30분·5/15/30분 관측 절차 있음. audio65는 별도 65초 | 최신 30분 결과 없음 | 65초/30초를 장시간 재생·발열·메모리 leak·수면 이후 복귀 안정성으로 표현 불가. 가이드 절차가 있다는 사실은 실행 근거 아님 | reproduce guide:811,815 |
| audio scheduling과 저빈도 visual 분리 | audio-stability는 실제 AudioContext, 실제 예약·AudioBufferSource 시작·score 순서·late0·RMS·voice count, visual만 200ms마다 업데이트, main WebGL rAF 보류 | 최신 65초 6회 대기 | 반복 WebGL 경쟁이 없는 5Hz visual 조건. 물리 output glitch·음색·잔향·AV 동기화 전체를 입증 못 함. 실제 선택 좌석 차이 가능성을 기록하므로 strict performance A/B 아님 | audio-stability.mjs:153,214,255 |
| 실제 렌더와 audio 경쟁 | audio-resume native mode, real rAF·real clock·note wrapper. 양 venue desktop low, seed417, readback0, prelude0, live30초 A/B 계획 | 최신 네 실행 대기. 현재 functional의 실제 2초 resume 실패는 별도 보존 | desktop low LITE라 high 3D world worst case/모바일 실기기 경쟁 아님. live late notes 관측값이 있어도 suite PASS 가능. 시작 음악 시각·실제 pose/seat를 맞추지 않으면 same-condition 개선율로 사용할 수 없음 | runtime-plan.json:18번째 job부터; audio-resume.mjs:25,342,473 |
| 청각적 음질·장치 underrun·AV sync | note 순서·예약 lead와 실제 AudioContext 시간, 일부 RMS 및 listener parameter 관측 | 청각적/물리 장치 검증 결과 없음 | 음표 예약 늦음은 실제 DAC glitch와 같지 않아. loopback 녹음, reference waveform/AV latency, 실헤드폰 공간감·잔향 청취, Safari audio interruption 미실행 | audio-resume.mjs의 liveWindow; audio-stability.mjs의 source observations; reproduce guide:732 |
| 입장·이동·앉기·일어나기·공연 제어 | 실제 키/touch/pointer UI. 좌석 근처 배치와 director tween 가속, stage roster snap 등 fixture shortcut 명시. seek은 real event와 perf.seek 관측, 강제 seek 금지 | mobile 두 공연장 PASS. desktop partial 결과·resume FAIL 위 표 | 자연스러운 전 경로 이동·층간 충돌·모든 좌석·멀티터치 동시 이동/시점/점프·경사로 전체는 아님 | functional.mjs:247,516,551,576,605 |
| 연주자·지휘자·관객 애니메이션 | 실제 render update 포함, roster identity와 몇 static PNG 관측 | high desktop PNG, partial/full functional 있음 | 활·손가락·박수·지휘 cue가 모든 악기/곡에서 오디오 타이밍과 일치하는지 정량 검사 없음 | full-frame-fixture.js:21,113; functional.mjs의 roster |
| listener 위치·공간 음향 | intended camera pose와 engine listener target·AudioParam 관측 | 두 mobile PASS, desktop도 해당 단계 도달 | 보간 중 AudioParam 즉시 값이 target과 같아야 한다고 오판하면 안 됨. 물리 청각적 거리감·방향·room reverb 변화 비교 아님 | functional.mjs:574; architecture audit:93 |
| 광장과 티켓·입장/복귀 | native app rAF, 실제 booth 이동/선택/ticket/venue entry/return, inert·Escape 취소·티켓 없는 직접입장 guard | candidate Hall/Sphere desktop/mobile 네 회 PASS | baseline 광장 A/B 성능, multiplayer 티켓 경로, 실제 mobile 하드웨어 성능은 미측정 | plaza.mjs:82; runtime/plaza의 네 raw |
| 멀티플레이 방 생성/입장/동기화/채팅/방장 | rooms는 두 UI 탭 실제 create/join/start/pause/resume/chat/host handoff와 disabled controls. protocol은 actual RoomClient+별도 서버로 forged guest state/cmd/handoff 거부, snapshot/rejoin/seed/ping | 최신 UI rooms·protocol 결과 대기 | 같은 컴퓨터 두 탭, 음량0·낮은 품질·대부분 rAF 보류. 두 물리 장치/네트워크 장애·지연 중 AV drift·고동접 부하·mobile room 전체는 미검증. 상태 일치와 정밀 시간 동기화는 다른 주장 | rooms.mjs:133,172,208; multiplayer.mjs의 state/cmd, reconnect 검사 |
| 멀티플레이 공연장 변경 권한 | UI cross는 입장 전 잘못 선택한 공연장에서 초대 링크를 따라 올바른 venue로 이동. protocol wrong-venue join은 거부와 room 불변 확인 | 최신 결과 대기 | 이미 진행 중인 방의 venue를 변경·마이그레이션하거나 게스트가 변경을 시도하는 UI 기능 전체를 검증하는 시나리오는 아님. room host 권한과 room venue immutable 정책을 구분해야 함 | rooms.mjs의 crossMode; multiplayer.mjs의 wrongVenue |
| 로비/recital/interval/수면 | Hall mobile all: 실제 door center/frustum 기준 fixture, UI stage seat·tea/second half, 수면 설정/취소와 direct sleep boundary+queued-rAF race. Sphere는 sleep만 | 최신 두 실행 대기 | stage snap·placeAt·직접 interval clock·goToSleep shortcut. 자연스러운 15분 timer 만료/30분 감상·full transition·OS background 전 과정 아님. Sphere all은 예전 곡 전제가 남아 현재 계획에서 제외 | rituals.mjs의 help, foyer, interval, sleep |
| iOS Safari·Android Chrome·Chrome/Edge 실기기 | helper는 Playwright Chromium만 실행하며 desktop 640×360 DPR1, mobile390×844 DPR2/touch/AndroidUA. 가이드에 실PC Chrome/Edge executable 및 실기기 절차 | 이 환경의 Linux/SwiftShader Chromium 결과만 있음 | Safari/WebKit·물리 Android/iPhone/iPad·실제 Windows/Mac GPU·배터리·열·OS memory pressure는 미실행. Chromium UA는 Safari 검증 근거가 아님 | browser.mjs:43,95,103; reproduce guide:835 |

## 표현하면 안 되는 결론과 필요한 후속 증거

1. **fixed completeMs 개선을 FPS 개선으로 변환하지 않기.** 한 장면 8표본은 frame tail의 견고한 통계가 아니고, software renderer의 synchronous 대기는 앱의 자연스러운 rAF와 달라. 첫 Sphere A/B에서도 forest·broadcast 등 일부 completeMs가 증가했어. 역순 반복·조건 검증 전 원인을 단정하면 안 돼.
2. **같은 화질 A/B와 적응형 품질을 분리하기.** 모든 mobile은 LITE이고 auto는 실제 조건별 선택 정책이 달라질 수 있어. 선택된 DPR/renderScale·cube 크기·profile·program·world를 확인하고 같은 설정만 비교해야 해.
3. **3D 빠른 회전과 전환 전체는 빈틈이야.** 현재 rotate는 ARCH. 새 `dome-motion.mjs` 요청은 이 감사 이후의 작업이고 아직 코드·실행 근거가 없어. 그 도구가 28~32 fixed step와 5개 전환 시각을 측정하더라도 연속 4초 영상·실기기 프레임 페이싱의 증명은 아니야.
4. **GPU timer와 memory 미측정을 숨기지 않기.** support flag가 true인 것과 유효한 query 표본이 있는 것은 달라. geometry backing buffer 추정이나 renderer.info texture 수를 GPU memory MB로 표시하면 안 돼.
5. **AudioContext resume FAIL과 수집기 기대 값 오류를 분리하기.** 후자는 실제 제품 preset 변경 때문에 생긴 옛 assertion 오류지만, 2초 clock 정체 원인은 같은 말로 해결되지 않아. 최신 baseline desktop 대조와 실제 native audio 원본이 필요해.
6. **30초/65초를 장시간·청각적 품질 검증으로 부르지 않기.** audio65는 반복 WebGL을 멈췄고 native30은 desktop low야. 실기기 30분·실청취·AV/장치 loopback·배터리/열은 사용자에게 별도 미실행으로 남겨야 해.
7. **프로그램 draw와 화질을 구분하기.** readiness의 onAfterRender/main camera와 linked/ready는 빈 돔을 성능 개선처럼 세는 것을 막아. 실제 화면 픽셀·전환 경계·잔상·cube seam까지 보장하지 않으므로 같은 카메라 PNG와 시간 경로 증거가 별도로 필요해. 현재 first Sphere에서는 KHR_parallel_shader_compile 미지원이라 그 확장 동작까지 검증한 것이 아니야.

## 근거 파일과 추적 방법

아래 소스 행은 이 감사에서 읽은 현재 수집기 기준이야. 이미 닫힌 raw에 들어 있는 collectorSourceSha256가 다르면 그 실행은 해당 과거 바이트를 기준으로 해석해야 해. 공개 재현 가이드의 명령·수동 절차는 실행 결과가 아니며, architecture 문서의 작성 시점 “미측정” 표도 이번 snapshot 이후 결과를 대신하지 않아.

- [재현 가이드](sandbox:/workspace/scratch/296fafc0af7f/forest-philharmonic/docs/performance-reproduce-1f.md): 252·256·268·283·328·594·620·635·652·664·732·811·835행.
- [구조 감사](sandbox:/workspace/scratch/296fafc0af7f/forest-philharmonic/docs/architecture-audit-1f.md): 32·83·107·111·133·139·151행.
- [full-frame collector](sandbox:/workspace/scratch/296fafc0af7f/forest-philharmonic/tools/bench/full-frame.mjs), [fixture](sandbox:/workspace/scratch/296fafc0af7f/forest-philharmonic/tools/bench/full-frame-fixture.js), [browser helper](sandbox:/workspace/scratch/296fafc0af7f/forest-philharmonic/tools/bench/browser.mjs).
- [render 계획](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/render-plan.json), [cadence 계획](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/cadence-plan.json), [runtime 계획](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime-plan.json), [GPU 계획](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/gpu-plan.json).
- [desktop candidate 재검사 계획](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/functional-preset-recheck-plan.json), [baseline desktop transport 계획](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/baseline-desktop-transport-plan.json), [필요한 이유](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/baseline-desktop-transport-reason.json).
- [Sphere first A/B 독립 리뷰](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/reviews/sphere-fixed-review.json), [병목 관찰/가설 분리](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/reviews/sphere-bottleneck-followup.md).
- [Hall desktop 최초 FAIL](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/functional/main1f-functional-hall-desktop-hall-desktop.json), [Sphere desktop 최초 FAIL](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/functional/main1f-functional-sphere-desktop-sphere-desktop.json).

### 읽은 문서·소스 SHA-256

| 파일 | SHA-256 |
|---|---|
| `docs/performance-reproduce-1f.md` | `e5d29abe915770ee5a075ec0c70436ec36426e431c62012e9769a39a0b2c9dbb` |
| `docs/architecture-audit-1f.md` | `9ceb374209cc91c704e6904bde68588cf6d79680ba84fa8d733ad7abd87052df` |
| `tools/bench/full-frame.mjs` | `2bf556b443cd64df6b4d743ec45e11dc382e6a9014083054472ddb39919d37c9` |
| `tools/bench/full-frame-fixture.js` | `262b5f126c6214d1875010056da4327117af2c764dab8d04854dc4b709871d98` |
| `tools/bench/browser.mjs` | `90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9` |
| `tools/bench/functional.mjs` | `ceeba92f2aa3a1bdc28307ad27134a254a152505deaf6bc862c0151292548fad` |
| `tools/bench/loading.mjs` | `fb6eed28c22263ff05038cd09bf4d8375be75d59a25bf7b4df1de3f66fdc50ac` |
| `tools/bench/loading-proxy.mjs` | `e8f311048df6104ca3fd7104753519c128e000e9dc93fe2a5b7f1a5641ef9f7b` |
| `tools/bench/gpu-timer.mjs` | `65f29bf49c379114d234473a985860c71d33de060dc28801d10862d6059b4665` |
| `tools/bench/audio-resume.mjs` | `089678a0b0afcc9be77ae11d7bc160fffce2239e29afc64b78f7fdf6e8a154d7` |
| `tools/bench/audio-stability.mjs` | `97e8704e2fc089d50f0976c2dc7ace75d3b5d7a02431f28090c5e81500e9c0cc` |
| `tools/bench/rooms.mjs` | `76efc3fef6bc604eab326fee079816c3ca12b974c9186ab7cf71e94ae0ac13a2` |
| `tools/bench/multiplayer.mjs` | `8ca860fbdebf008dbaf44560930b83bbb7d65534aca405e484b817b831c2fdd1` |
| `tools/bench/rituals.mjs` | `678641c631bae9605249d181a33ed0177318fb644e2de5c5de2fa10b56a226f3` |
| `tools/bench/plaza.mjs` | `08b9bc81034582c30ffcabd94c220ead66cf223fb8f1666a3d7466670b8e22ce` |

### 계획 SHA-256

| 파일 | SHA-256 |
|---|---|
| `render-plan.json` | `6259727537dbd446e56ef3e5fa23b41c847fecd3c17a2a0cc28aa79ff40d8dc1` |
| `cadence-plan.json` | `80417fb8f74ebf3df05684cb6a9cf7f851edd98245d8aa47f46b514e4c21c564` |
| `runtime-plan.json` | `5c9791e3dd6d67e7d0d88d507688ec95d82697fb4eb9e69bf80cb28ad2b67ccc` |
| `gpu-plan.json` | `9f481be308c0d177c9ea3334bf7b754a7ac83087c53709b7be38f817108fbd42` |
| `functional-preset-recheck-plan.json` | `2f0d93e6b5a6ce7c6083e2a3c5c439bfd6cc132705b8f7c437676f888e19df4e` |
| `baseline-desktop-transport-plan.json` | `02eaa9bae90bb9c87f6b3a1377ad9139fb2d4861894435a3e663f7213dc67604` |
