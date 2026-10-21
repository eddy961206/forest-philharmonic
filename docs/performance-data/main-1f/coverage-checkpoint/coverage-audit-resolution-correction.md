# Coverage 감사 해상도 표기 정정

기존 [coverage-audit.md](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/reviews/coverage-audit.md)는 덮어쓰지 않았어. 원문 SHA-256은 `85df7eb1e582fee838c3bdcc76a8c492dfbafdbc4eaac4fa06980b35418b329f`야. 아래는 수집기별 viewport 기본값을 구분하는 정정이며, 원문에 기록한 2026-10-21 13:21:46 UTC 결과 상태를 갱신하는 문서가 아니야.

원문의 실기기/browser 행에서 desktop 640×360을 공통 helper의 전체 검사 조건처럼 읽을 수 있게 쓴 부분은 부정확했어. `browser.mjs`의 `viewport(device, defaults)`는 **각 수집기가 넘긴 기본값**을 사용하고, `WIDTH`·`HEIGHT`·`DPR` 환경변수가 있으면 그 값으로 바꿔. 640×360은 기존 full-frame(sync와 cadence) 및 GPU timer의 desktop 기본값이야.

| 수집기 | desktop 기본 viewport | mobile 기본 viewport | 기본 DPR | 근거 |
|---|---:|---:|---:|---|
| full-frame.mjs, sync/cadence | 640×360 | 390×844 | desktop 1, mobile 2 | full-frame.mjs:23, browser.mjs:43 |
| gpu-timer.mjs | 640×360 | 390×844 | desktop 1, mobile 2 | gpu-timer.mjs:37 |
| functional.mjs | 960×540 | 390×844 | desktop 1, mobile 2 | functional.mjs:240 |
| plaza.mjs | 960×540 | 390×844 | desktop 1, mobile 2 | plaza.mjs:70 |
| rituals.mjs | 960×540 | 390×844 | desktop 1, mobile 2 | rituals.mjs:293 |
| audio-resume.mjs, native/controlled | 960×540 | 390×844 | desktop 1, mobile 2 | audio-resume.mjs:63 |
| loading.mjs, audio-stability.mjs | 960×540 | 390×844 | desktop 1, mobile 2 | 두 수집기가 재사용하는 loading-proxy.mjs:19의 browserOptions |
| rooms.mjs | 960×640 | 설계상 없음 | 1 | rooms.mjs:17 |
| multiplayer.mjs | 해당 없음 | 해당 없음 | 해당 없음 | Node WebSocket / RoomClient 검사, 브라우저 없음 |
| 새 dome-motion.mjs | 640×360 | 지원하지 않음 | 1 | full desktop high/medium 전용 준비본. 아직 브라우저 실행 안 함 |

원문 cutoff 당시 실제로 닫혀 있던 functional·plaza 8개 raw의 `viewport`·`devicePixelRatio`를 다시 읽었어. desktop 네 개는 모두 `[960,540]`, DPR 1이고, mobile 네 개는 모두 `[390,844]`, DPR 2였어. 이는 raw 값을 읽은 확인이며 검사를 새로 실행한 것이 아니야. 아직 실행하지 않은 loading/audio/rooms 등의 실제 viewport를 기본값만으로 확정하지 않아.

viewport와 deviceScaleFactor는 CSS 화면 및 기기 에뮬레이션 조건이야. 제품의 renderer pixelRatio·renderScale·화질별 후처리 및 cube render target 크기와 같은 값은 아니야. 같은 품질 비교에서는 해당 실행 raw의 실제 renderer 설정·drawing buffer/RT 증거를 함께 확인해야 해.

실기기·Safari·Windows/Mac GPU·발열·배터리 미실행이라는 원문의 한계는 그대로야. 해상도가 다른 suite의 완료 시간을 한 성능 표에서 직접 비교하면 안 돼.
