# 새 main 1f 광장 네 조합 독립 검토

**완료된 job 0–3, 즉 Hall·Sphere 각각 desktop·mobile의 핵심 솔로 입장 흐름은 네 건 모두 원본 증거와 일치하는 PASS야. 화면 완성도·전체 접근성·음악 품질·성능 통과로 확대하지 않아.**

이 검토는 완료된 JSON·stdout·종료 metadata·PNG만 읽었어. 브라우저를 추가 실행하거나 제품·수집기·runtime 원본을 수정하지 않았어. 첫 두 건만 다룬 이전 보고서는 `plaza-progress-review-first-two.json/md`로 바이트 그대로 보존했어. 별도 functional suite의 실패는 광장 PASS에 섞지 않았어.

## 실행 조건과 출처

- 제품 커밋: **dea7997c6278f10ff467815ab96b370362549b0c**
- 수집기 SHA-256: **08b9bc81034582c30ffcabd94c220ead66cf223fb8f1666a3d7466670b8e22ce**
- helper SHA-256: **90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9**
- Linux x64, headless Chromium 153.0.8010.0, Playwright 1.64.1, FONT_MODE=local. softwareRequested=true와 --use-angle=swiftshader가 기록돼. 이 수집기는 실제 GL renderer 문자열을 저장하지 않아.
- desktop은 960×540 CSS px / DPR 1, mobile은 390×844 CSS px / DPR 2 / maxTouchPoints 5 / finePointer false야. mobile은 브라우저 에뮬레이션이야.
- NAVIGATION=ui, placement fixtures는 네 건 모두 비어 있어. 공연장은 수동 low를 요청하고 광장은 앱의 기본 렌더 경로를 사용해. 이 suite는 실제 적용 preset을 별도로 판독하는 성능 비교가 아니야.
- 네 건의 raw·summary·종료 metadata가 PASS/exit 0으로 일치하고 stdout SHA도 일치해. 수집된 소스 19개는 각 실행 시작·끝, 네 실행 사이, 위 커밋의 바이트가 모두 같아. 전체 의존 파일을 검증했다는 뜻은 아니야.
- 검토한 원본 36개와 runtime에 옮긴 36개는 각각 바이트가 같고 저장 직전 재해시도 일치했어. 계획 파일 자체는 읽지 않았고 metadata 네 개의 같은 planSha256 라벨만 확인했어.

## 실제 입력과 상태의 근거

| job·조합 | 상태 / exit | 실제 매표소 이동·z 위치 | 이동 거리(scene units) | 표 번호 / 동물 | warning 수 |
|---|---|---|---:|---|---:|
| 0 · hall-desktop | PASS / 0 | W keyboard · 8.600 → 0.936383 | 7.663617 | H-7635 / fox | 0 |
| 1 · sphere-mobile | PASS / 0 | CDP thumb-stick touch · 8.600 → 0.423038 | 8.176962 | S-4911 / sheep | 1 |
| 2 · hall-mobile | PASS / 0 | CDP thumb-stick touch · 8.600 → 0.837514 | 7.762486 | H-4299 / raccoon | 0 |
| 3 · sphere-desktop | PASS / 0 | W keyboard · 8.600 → 0.818980 | 7.781020 | S-3048 / mouse | 1 |

네 건 모두 매표소 창구에서 2.1 scene units 이내에 도착했고, 이후 다음 여섯 회귀 항목의 상태와 원시값을 재확인했어.

| 항목 | 확인한 증거 | 인정하는 범위 |
|---|---|---|
| dialog·Tab | role=dialog, aria-modal, 배경 4개 inert, BUTTON→SUMMARY | 초기 focus와 Tab 한 번 |
| 이름 입력 중 Escape | bkName에서 Escape → dialog hidden / inert 해제 / 표 없음 → 실제 행동 버튼으로 다시 열기 | 취소·재개; 포커스 복귀는 별도 |
| 표 조작 | desktop 마우스 클릭 / mobile touch tap 뒤 표 번호 안내 | visible stub의 실제 pointer 입력 |
| 표·정체성 보존 | 발권·stub·검표·입장 표 전체 객체 동일, 이름·동물 유지 | 같은 탭의 실제 문서 이동 간 sessionStorage |
| 광장 복귀 | 실제 공연장 program tab·plaza 버튼, 표 null, 이름·동물 유지, 지난 표 shortcut 표시 | 앱 내부 복귀 경로 |
| 무표 접근 차단 | 표 없는 venue URL 접근이 광장 root로 돌아옴 | 솔로 접근 guard |

입구는 실제 gate geometry를 화면에 투영하고 raycast/DOM hit test로 확인한 위치를 클릭·터치했어. mobile 두 건은 처음 입구가 화면 밖이라 각각 109.2px 실제 터치 드래그를 한 뒤 화면 안의 gate를 눌렀어. desktop은 추가 회전 없이 성공했어. 제품의 입장 함수 직접 호출이나 캐릭터 위치 배치는 사용하지 않았어.

입력 증거는 해시로 고정된 수집기의 Playwright/CDP 호출과 전후 상태야. 모든 event의 isTrusted를 저장한 trace나 전체 이동 궤적은 없어. 이름 입력은 Playwright fill이며, mobile Escape는 키보드 에뮬레이션이라 휴대폰 가상 키보드를 검증하지 않아.

## PNG 20장 육안 검토

1. **첫 화면·복귀 화면 8장은 로딩 페이드 도중이야.** 모두 어두운 overlay와 “숲속 광장으로 가는 중…”이 남아 있어. 정확한 제품 CSS의 .pz-loading은 opacity 1s transition을 사용하고, 수집기는 .done 부착과 폰트·네이티브 callback 두 번만 기다려. 영구 정지의 증거는 아니지만 완료된 광장 화질 비교용 캡처로 사용할 수 없어. 원본을 보존하고, 완료 화면이 필요하면 computed opacity/transition 종료를 별도 관찰한 새 캡처를 써야 해.
2. **이모지 일부가 빈 사각형으로 보여.** 동물·매표원·결제 항목 일부에 나타나며, Sphere desktop의 생쥐 그림은 정상적으로 보이므로 모든 이모지가 없는 건 아니야. 한글은 읽혀. fontStatus=loaded는 글리프 충족을 증명하지 않고, 환경 폰트 부족 가능성은 있으나 단독 원인이나 제품 회귀로 확정하지 않았어.
3. **발권·검표 화면은 해당 viewport 안에서 내용과 입장 버튼을 확인할 수 있어.** 표 번호·이름은 JSON과 같고 mobile 번호 줄바꿈은 있지만 버튼이 가려진 모습은 없어. 모든 화면 방향·텍스트 길이에 대한 보장은 아니야.
4. **공연장 진입 캡처는 0:00, 공연 시작 전 상태야.** Hall 로비·Sphere 입구와 조작 UI의 초기 진입을 보여. 이 plaza 수집기는 dome.mesh.visible/컴파일 완료를 관찰하지 않으므로 hasDome=true를 돔 준비 완료로 해석하지 않아.

## 오류와 접근성 제한

pageErrors, consoleErrors, failedRequests는 네 건 모두 빈 배열이야. Hall 두 건은 warning도 없고 Sphere 두 건은 각각 KHR_parallel_shader_compile 미지원 경고가 하나 있어. 공연장 초기 상태에서 WebGL 오류 0, context loss 없음이 확인돼.

| 조합 | Escape 직후 focus | 표 닫기 직후 focus | 다시 열기 직후 focus |
|---|---|---|---|
| hall-desktop | bkName | boothDone | BODY |
| sphere-mobile | bkName | boothDone | BODY |
| hall-mobile | BODY | BODY | BODY |
| sphere-desktop | bkName | BODY | BODY |

bkName·boothDone은 해당 순간 숨겨진 dialog 안의 요소야. BODY를 보고한 실행도 있어. 즉시 snapshot이므로 지속 시간을 확정할 수 없고, 다시 열기 BODY도 예약된 focus rAF 이전일 수 있어. 전체 focus-return·Tab 순환·스크린리더 PASS로 확대하지 않아.

AudioContext.state=running만 확인했어. 음악 시작·음질·동기화·출력 글리치는 이 suite에서 검증하지 않았어. BFCache/브라우저 Back, 저장소 차단, offline/느린 room 목록, 단체석, 가로 화면/다중 포인터, Safari·실물 iOS/Android, 발열·전력·장시간 안정성도 미검증이야. 일반 브라우저와 다른 --disable-web-security / --no-sandbox 등의 인자가 기록돼 있어 정상 보안·네트워크 조건 전체를 검증한 결과로 볼 수 없어.

FPS·프레임 시간·로딩 개선은 산출하지 않았어. calls/triangles는 순간 상태이며 동일 조건 전후 성능 지표가 아니야.

## 증거 목록과 재현

JSON 보고서에는 원본·복사본 경로, 36개 파일 SHA/크기, PNG 실제 픽셀 크기, 네 실행의 19개 소스별 커밋 대조와 상세 상태가 들어 있어. 아래는 핵심 raw·stdout·종료 metadata야.

| 파일 | SHA-256 |
|---|---|
| [000-plaza-hall-desktop.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/logs/000-plaza-hall-desktop.json) | 5736fe9144d85769b29e5fb487ea5d39219eb01f6521747e00ed07c047050959 |
| [000-plaza-hall-desktop.log](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/logs/000-plaza-hall-desktop.log) | bac7e8d1e850a3a2f44949ca49516b47d708b0091fb058276f9bc2d0fec521da |
| [main1f-plaza-hall-desktop-plaza-hall-desktop.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/plaza/main1f-plaza-hall-desktop-plaza-hall-desktop.json) | 8dda5aa6527a2164950180f2872fecbfa008e21c72ce9b6a7eb0c7b280aa4fda |
| [001-plaza-sphere-mobile.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/logs/001-plaza-sphere-mobile.json) | 5b302fc086a12d65a8ad80320a55b9e924040f354110266fc89d9a9eedb5b09e |
| [001-plaza-sphere-mobile.log](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/logs/001-plaza-sphere-mobile.log) | 8fb78d79c19b9005e42c659b6c08d9b0dc82bcc03d70796f27f77e72c275a456 |
| [main1f-plaza-sphere-mobile-plaza-sphere-mobile.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/plaza/main1f-plaza-sphere-mobile-plaza-sphere-mobile.json) | 4e331c6995b61593096e395156351e0107c70972e9c04b8b73756e8ad91c98ff |
| [002-plaza-hall-mobile.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/logs/002-plaza-hall-mobile.json) | 240fc424aa5c1154a4e67c7e9e7d44c2e063773cf0df42ae37f0715fcd845c1d |
| [002-plaza-hall-mobile.log](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/logs/002-plaza-hall-mobile.log) | 8e5f844b00caf1b1f64c372680daf35ab4c2253d5d15e96f97158175bfb09dec |
| [main1f-plaza-hall-mobile-plaza-hall-mobile.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/plaza/main1f-plaza-hall-mobile-plaza-hall-mobile.json) | 56350460172d4b4091ab09d4e1e1f80eba2b2909825b7fac63dc16b096c776e8 |
| [003-plaza-sphere-desktop.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/logs/003-plaza-sphere-desktop.json) | 8deb9fa4df2e7fd6f6a5ac2ce5f8dbe39a46dda0e8686d39fbb59efc737dd0e6 |
| [003-plaza-sphere-desktop.log](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/logs/003-plaza-sphere-desktop.log) | b866b52af209e180c8301410ad5a377e73e91658a9e2389cbf20f08023b1ac81 |
| [main1f-plaza-sphere-desktop-plaza-sphere-desktop.json](sandbox:/workspace/scratch/296fafc0af7f/verification/main-1f/runtime/plaza/main1f-plaza-sphere-desktop-plaza-sphere-desktop.json) | fefeca8ef85767095187413869269d84f4609c008e1d95c416d9a486426ce6be |

검토 순서는 완료 metadata → stdout SHA → raw/summary/회귀 상태 → 실제 이동·inert·표 객체·복귀 값 → git show 소스 19개 대조 → PNG 20장 육안 확인 → 원본/복사본 36쌍 비교 및 저장 전 재해시야. 리뷰 문서만 새로 저장했어.
