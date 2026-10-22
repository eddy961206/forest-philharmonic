# 이전 성능 결과 — e741 → 6c

이 문서는 2026-10-22 `ed3a5db`에서 마감한 **이전 후보**의 핵심 결과를 가리켜. 현재 브랜치의 품질 정책·돔 시야 캐시·좌석 데이터 공유를 측정한 수치가 아니야. 현재 후보의 검증은 [로컬 에이전트 인계](LOCAL_AGENT_HANDOFF.md)를 따라가.

[전체 보고서 원문](https://github.com/eddy961206/forest-philharmonic/blob/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-e741.md)에는 전 화질·viewport 결과, 시각 비교, 실제 재생과 기능 검사, 실패·악화·미측정 범위를 모두 보존했어. [원본 보관·복구](PERFORMANCE_ARCHIVE.md)에서 JSON·로그·도구도 받을 수 있어.

## 버전과 측정 조건

| 항목 | 이전 실행 조건 |
|---|---|
| 기준 | `e741811d1d7a040afcdd3a8230465980c64f82fc` |
| 후보 | `6c7817218814f00631089eb2c6f150d68190980f` |
| 브라우저 | 클라우드 Linux, Chromium 153.0.8010.0, Playwright 1.62.1, headless |
| 렌더러 | ANGLE Vulkan SwiftShader 소프트웨어 렌더러 |
| 아래 표 | high, PC viewport 640×360, 요청 DPR 1, renderScale 1 |
| 표본 | 장면별 준비 2프레임 + 측정 4프레임, A→B와 B→A 각 한 번 |
| 시간 | `frame()` 후 `readPixels`로 기다린 동기 완료 ms. 앱 FPS나 순수 GPU 시간이 아니야 |

## 개선과 악화 관측

처리 시간 변화가 음수면 감소, 양수면 증가야.

| 장면 | 첫 A→B | 역순 B→A |
|---|---:|---:|
| Hall 가까운 시점 | −25.21% | −20.30% |
| Hall 넓은 시점 | +0.68% | −4.62% |
| Hall 중계 복귀 | −3.87% | −10.71% |
| Sphere 가까운 시점 | −4.92% | +4.54% |
| Sphere 넓은 시점 | +4.47% | +5.29% |
| Sphere 숲 | +1.17% | +4.99% |
| Sphere 중계 | −2.55% | −3.98% |

Hall 가까운 시점의 제출 삼각형은 약 37.1% 줄었고, 해당 캡처 쌍은 동일했어. Sphere의 넓은 시점과 숲은 두 순서에서 모두 느려졌으며 당시 원인 변경을 분리하지 못했어. 이 관측을 삭제하거나 잡음이라고 확정하지 않아. [원본 high 요약](https://github.com/eddy961206/forest-philharmonic/blob/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-data/main-e741/high-summary/summary.md), [독립 검토](https://github.com/eddy961206/forest-philharmonic/blob/ed3a5db17a53cd84b75e33a25352831f148f9431/docs/performance-data/latest-e741-review-notes.md)가 근거야.

## 이전 결과로 확정하지 않은 것

- 실제 PC·스마트폰·태블릿의 FPS 향상, 60/30FPS 달성, 물리 GPU 시간·VRAM.
- 장시간 감상·발열·배터리·메모리 누수·실제 스피커 출력의 글리치와 AV 동기화.
- 두 공연장 전체의 일관된 성능 향상. 특히 Sphere 넓은 시점·숲은 실제 GPU로 다시 비교해야 해.
- 과거 4표본의 p95/p99를 안정적인 장시간 꼬리 지연으로 해석하는 것.

당시 제품 Node 회귀 79개·기능·Worker PCM·돔 이미지 비교 통과는 그 제품과 조건의 기록이야. 이후 추가된 보관 파일 때문에 기본 `npm test`가 실패하던 문제와 자동 품질 DPR 문제는 [이번 수정](MERGE_PREPARATION.md)에서 따로 처리했어. 과거 통과 기록을 현재 HEAD의 실행 결과로 대체하지 않아.
