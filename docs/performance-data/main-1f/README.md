# 최신 main 1f 기준 검증

## 기준선과 제품

- baseline: `1f8e5f16f1eee03140e13ba1ee66832841559604`, 서버 18083.
- candidate: `dea7997c6278f10ff467815ab96b370362549b0c`, 서버 18084.
- 별도 detached worktree에서 고정한 제품을 제공해. 도구·보고서 변경이 제품 서버의 코드에 섞이지 않아.
- `source-manifest.json`은 JS/CSS/index/server/package 49개 경로의 양쪽 SHA-256이야. 각 browser collector는 실제 제공된 관련 소스의 해시도 따로 기록해.

## 실행 계획과 상태

`render-plan.json`은 수동 high·medium·low × desktop/mobile viewport × 두 공연장 A/B 24회와 desktop high 역순 재관찰 4회야. 홀은 front/wide/foyer/rotate/broadcast/hidden/return/effects-show, 스피어는 front/wide/rotate/dome/forest/peaks/ocean/clouds/crossfade/reveal/broadcast/effects-show를 다뤄. 같은 품질의 `frame()+readPixels` 완료 시간이며 FPS가 아니야.

`cadence-plan.json`은 수동 low 8회와 mobile auto 4회야. 후자는 해상도와 프리셋이 달라질 수 있으므로 적응형 관찰로 분리해.

`runtime-plan.json`에는 광장 4회, 전체 기능 4회, baseline 모바일 transport 2회, cold/warm loading 8회, 실제 렌더+음표 30초 4회, 반복 WebGL을 멈춘 별도 65초 오디오 6회, 방/프로토콜 3회, 의식·수면 2회가 있어.

`gpu-plan.json`의 WebGL2 timer query는 이 실행 환경에서는 SwiftShader 소프트웨어 질의야. 물리 GPU 시간이나 VRAM으로 표현하지 않아.

**계획 파일이 있다는 것은 완료했다는 뜻이 아니야.** 2026-10-21 14:12 UTC 기준 고정 품질 28실행은 모두 닫혔고, [완료 집계](fixed-complete-checkpoint/analysis/summary.md)는 14쌍·140행, 조건 불일치 제외 0개야. 수집·조건 검증 PASS가 모든 장면의 성능 개선을 뜻하지 않아. 평균 완료 시간과 메인 스레드 시간이 증가한 행도 그대로 포함해. high desktop의 역순 반복과 최초 결과를 합쳐 독립 표본 수나 성공률을 부풀리지 않아.

광장 4개와 candidate 모바일 기능 2개는 PASS야. desktop 기능 2개는 오디오 재개 시계 정지와 구형 수동/자동 preset 기대값으로 FAIL이며 원본을 보존했어. 제품을 바꾸지 않고 수집기의 기대값만 최신 main에 맞췄고 desktop은 별도 재검사할 예정이야. cadence·나머지 runtime·GPU·추가 low/mobile 역순·실제 3D 회전/전환 검사는 진행 중이거나 대기 중이야. 최종 상태와 원본은 후속 커밋으로 추가해. FAIL·미실행·제외 결과를 삭제하거나 PASS로 바꾸지 않아.

## 계측 변경

새 main에서는 UI-ready와 돔 compileAsync 완료가 분리돼. full-frame은 UI+visible gate 이후 실제 warmup의 base/활성 overlay 제출, 프로그램 ready/link를 확인하고 계측 hook을 복원한 뒤 표본을 수집해. loading/functional의 visible 관찰은 컴파일 성공·첫 픽셀 완료를 보장하지 않으므로 별도 지표야. timing 구간과 기존 fixture는 보존했고 변경 근거는 `tool-preparation`에 있어.

광장 수집기는 UI 발권·부스 inert/Escape·표·복귀·무표 차단을 검사하고 CSS 포함 소스를 전후 대조해. 각 호출의 LABEL은 고유해야 해.

소프트웨어 렌더러, viewport/UA/touch 에뮬레이션, 직접-entry 로비와 광장 UI 경로, synthetic 시각 clock과 실제 오디오 검증을 구분해. [PC 재현 가이드](../../performance-reproduce-1f.md)와 [추가 역순·3D 검사 가이드](../../performance-supplement-1f.md)에 제품·도구 버전과 명령을 정리했어.

수집기 기대값 수정은 `functional-*-expectation-correction.json`과 원본 snapshot에 기록했어. `collector-manifest-683cd2e.json`은 수정 전 공개 도구, `collector-manifest.json`은 현재 도구의 해시야. 각 raw가 기록한 실제 collector 해시를 우선해. `functional-preset-recheck-plan.json`은 원래 FAIL 결과를 덮어쓰지 않는 별도 desktop 재검사 계획이야.

## 많은 원본 파일을 검토하는 방법

`.gitattributes`는 `docs/performance-data` 아래 JSON·log·TAP만 `linguist-generated`로 표시해. [GitHub가 제공하는 기본 diff 표시 설정](https://docs.github.com/en/repositories/working-with-files/managing-files/customizing-how-changed-files-appear-on-github)을 사용해 제품 변경과 설명 문서를 먼저 읽기 쉽게 한 거야. 원본 파일·실패·불리한 수치는 삭제하지 않고, 해당 파일을 열거나 내려받아 그대로 확인할 수 있어. Markdown 보고서와 제품·검증 도구 코드는 이 설정 대상이 아니야.
