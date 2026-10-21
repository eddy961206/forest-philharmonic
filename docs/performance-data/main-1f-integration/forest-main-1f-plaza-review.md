# 새 main 1f 광장 통합 검토

- 비교: `6a59c33ced4fbbe237b38eb5a4c63e38636bf07f` → `1f8e5f16f1eee03140e13ba1ee66832841559604`; 공개 checkpoint `71f4841d026496608749451580789ca62f0f7042`.
- 범위: 읽기 전용 소스 검토. 브라우저/GPU/실물 검증·제품 수정·원시 결과 접근 없음.

## 판단

**자동 병합된 광장 변경과 우리 venue 전용 `#joyZone { z-index: 9 }`를 함께 유지하면 돼.** 직접적인 CSS 선택자 충돌은 없어. venue transport는 z10이고, plaza는 다른 ID의 zone z11·stick z12·ticket stub z13, booth z30을 써. 새 joystick deadzone/capture 처리는 seek의 stacking 문제를 대체하지 않아. 화면의 실제 겹침은 새 통합본에서 재확인해야 해.

## 핵심 변경과 남은 확인

- **booth-robustness-accessibility**: 곡 목록 실패에도 공연장 카드가 생기고, 서버 응답 대기/5초 실패는 solo로 제한돼. 공연장 변경 시 이전 mode/room/code를 초기화해. paying guard가 중복 결제와 결제 중 닫기를 막고, booth 뒤 네 요소 inert·첫 카드 focus·완료 focus·입력 중 Escape를 처리해. 근거: [public/js/plaza.js:308](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/plaza.js#L308). 기본 solo collector selector 변경은 필요 없어. 실패한 music/index, 느린 room 목록, 빠른 공연장 변경, double pay/Escape, 키보드 Tab/Shift+Tab을 별도 범위로 검증해.
- **focus-live-region-limits**: 닫을 때 canvas.focus()를 호출하지만 plaza canvas에 tabindex를 주는 코드는 보이지 않아 포커스 복귀가 확실하지 않아. pzToast에는 role/aria-live가 없고, 느린 music/index 응답의 buildVenueCards가 focus된 카드 DOM을 교체할 수 있어. 기존/추가 접근성 한계이지 실측한 회귀로 단정하지 않아. 근거: [public/js/plaza.js:482](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/plaza.js#L482). 실제 키보드·접근성 트리 검사 후 필요하면 열었던 버튼으로 focus 복귀와 live region을 별도 작은 수정으로 검토해. 이번 통합에서 추정만으로 제품을 바꾸지는 않아.
- **navigation-and-gesture**: index의 초기 is-plaza 판정이 표 없는 직접 venue URL의 깜박임을 줄여. ?lobby와 room 경로는 예외로 남아 있어 현재 functional/loading appURL과 맞아. BFCache pageshow.persisted에서 gate 어둠/busy/소리를 복구하고, canvas 주 포인터·pointercancel, orientation camera fit, joystick lostpointercapture를 보완해. 근거: [public/index.html:22](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/index.html#L22). 기존 plaza 버튼 복귀/무표 redirect와 BFCache back은 다른 테스트야. 실제 pageshow.persisted를 기록하고, BFCache가 사용되지 않으면 복귀 기능 PASS로 대신하지 않아.
- **storage-guard**: tickets.js가 storage getter까지 try/catch하고 identity를 페이지 메모리에 캐시해 저장소 차단 중 같은 페이지 identity는 안정돼. ticket은 sessionStorage만 사용하므로 storage 차단 상태의 페이지 간 발권/입장까지 보장하지 않아. 기존 plaza collector의 직접 storage 읽기·쓰기 자체도 차단 시 실패할 수 있어. 근거: [public/js/tickets.js:40](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/tickets.js#L40). 기본 정상 storage 경로는 유지해. storage-denied 전용 검사는 observer도 guarded access로 만들고, page-local identity와 navigation persistence를 구분해서 보고해.
- **plaza-render-cost**: 매 프레임 팔 목표 Vector3를 재사용하고 100ms joystick interval을 없앤 것은 할당/타이머 절약이야. 자기 이름 sprite 제거는 화면과 리소스도 바꿔. 반딧불 DPR 보정/40px clamp, halo 240px clamp는 가까운 입자 과대 크기를 제한하지만 같은 픽셀 출력은 아니야. 먼 홀 위치·창 재질·warm sprite·gate veil 텍스처도 변경됐어. 근거: [public/js/plaza.js:660](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/plaza.js#L660). upstream 변경을 새 baseline의 일부로 받아들이고 이전 6a 이미지/FPS 개선율과 혼합하지 않아. 실제 GPU 수치가 없으므로 성능 상승을 수치로 주장하지 않아.
- **fonts-and-audio**: 광장 간판 텍스처는 폰트 로드 뒤 한 번 다시 그려 needsUpdate를 설정해. 바람 버퍼 3→4초/LFO, 네 귀뚜라미·clink 음색·fade가 추가돼 음향 CPU/메모리는 일부 증가할 수 있어. hidden에서 AudioContext를 suspend하고 귀뚜라미 생성을 건너뛰어 배경 비용을 줄여. 근거: [public/js/scene/plazaWorld.js:33](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/public/js/scene/plazaWorld.js#L33). plaza screenshot 앞에 fonts.ready와 실제 native frame을 기다리는 방안을 권장해. 초기 로딩 시간을 숨기는 방식으로 ready 기준을 바꾸지는 않아. 숨김/복귀·터치 오디오 활성화·BFCache를 실제로 확인해.
- **readme-and-loading-meaning**: README의 Windows 셰이더 30초→3초와 텍스처 사전 업로드 주장은 새 main의 설명이야. 이번 세션의 검증 수치로 재사용할 근거는 없어. main 초기화가 warmTextures/dome warm 뒤 ui.ready로 진행하므로 loading의 readyMs가 포함하는 작업도 새 버전에서 달라져. 근거: [README.md:274](https://github.com/eddy961206/forest-philharmonic/blob/1f8e5f16f1eee03140e13ba1ee66832841559604/README.md#L274). 1f 기준선·통합 후보를 새 SHA/결과 폴더로 비교해. 고정 06 서버와 기존 6a 원본은 그대로 보존하고, readiness와 최초 실제 프레임/전환 시 지연을 구분해.

## collector 변경안 — 아직 수정하지 않음

| 도구 | 기존 흐름 호환성 | 다음 보완 |
| --- | --- | --- |
| `tools/bench/plaza.mjs` | selector/36px gesture 변경은 정적으로 필요하지 않아. world.pickables/PLAZA gates와 __plaza contract도 유지돼. | sourceHashes에 css/style.css를 추가하고 종료 시 동일 소스 검증을 검토해. 현재 CSS 근거는 raw에 빠져 있어. 캡처 전에 fonts.ready + native frame을 관찰해서 텍스처 repaint 전/후 이미지를 섞지 않아. 새 별도 case: booth keyboard/inert/Escape/double-pay, 실패/느린 목록, BFCache persisted 복귀, orientation·multi-pointer/cancel, storage-denied. readPlaza의 unguarded storage는 storage-denied 검사에서 제품 회귀와 분리해. |
| `tools/bench/functional.mjs` | ?venue=...&lobby와 기존 36px joystick 이동은 계속 유효해. 새 deadzone 임계값보다 큼. | CSS·joystick·index 출처 hash를 별도 manifest로 보강하고 현재 seek hit-test/입력 원본 진단을 유지해. 390×844 및 가로 화면에서 seek 입력이 joyZone/joystick에 가로채이지 않는지 재확인해. 기존 오디오 2초 FAIL 기준을 그대로 남기고 새 main의 준비 시간이 달라진 점을 별도 관찰해. |
| `tools/bench/loading.mjs / loading-proxy.mjs` | appURL의 lobby 예외와 fixedAudienceMain의 solo rand anchor 한 곳이 유지돼. 현재 waitReady 계약을 바꿀 필요는 정적으로 없어. | 1f 코드로 새 baseline/candidate cold/warm pair를 수집하고 6a 결과와 합치지 않아. 새 warmTextures/compile 비용을 실제 준비 시간에 포함해. 추가 HTTP 해시 요청으로 cold/warm 캐시를 미리 데우지 않아. CSS/index provenance가 필요하면 측정 후나 이미 수집 중인 응답/별도 고정 checkout manifest로 남겨. 현재 loading은 venue 준비 시간이며 광장 첫 입장·발권 로딩 검사가 아님을 유지해. |

## 통합 순서

1. main/screen/seats conflicts are handled by their owners; do not replace the whole merged CSS or plaza files with older versions.
2. Record final merged source hashes, especially CSS/index/joystick, and retain the venue-only z9 override.
3. Keep 06 measurement servers frozen; use a new 1f baseline and merged candidate for new evidence.
4. First rerun existing solo plaza UI and venue mobile seek; then add narrowly scoped new-feature cases with original failures preserved.

상세 파일 해시·근거 줄·제안은 같은 이름의 JSON에 있어. README의 upstream Windows 30초→3초 수치는 이번 검토에서 실측하지 않았고, 새 main 효과와 기존 6a/06 최적화 성과를 합치지 않아.
