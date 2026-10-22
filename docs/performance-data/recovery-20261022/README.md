# 2026-10-22 복구한 과거 검증과 중단 방지 실행기

**이 폴더의 성능 수치는 과거 `1f8e5f1 → dea7997` 비교야. 최신 main `e741811` 또는 이후 통합 코드의 성능 결과가 아니야.** 새 브라우저 측정 없이 이미 종료된 원본을 복구했어.

## 보존 범위

- cadence raw 12개·종료 wrapper 12개·stdout/stderr 로그 12개와 원래 계획·제품 manifest를 바이트 그대로 복사했어. 원본 경로·SHA는 `inventory.json`에 있어.
- wrapper 12개의 PASS/exit 0/finishedAt, 로그 SHA, raw 제품 소스 전후 SHA를 확인했어. 이 PASS는 수집 종료이며 성능 향상 판정이 아니야.
- 기존 fixed 28 raw·140행은 [기존 체크포인트](../main-1f/fixed-complete-checkpoint/README.md)에 있어. 중복 복사하지 않았어.
- cadence PNG 20개는 해시만 inventory에 남겼어. 이 복구에서는 이미지를 디코딩·육안 판정하지 않았어.

## 동일 품질 low: 관측값 전체

Chromium 153.0.8010.0, Playwright 1.64.1, Linux headless, ANGLE SwiftShader 조건이야. desktop 640×360/DPR1, mobile 390×844/DPR2의 에뮬레이션이야. 같은 fixture에서 네이티브 rAF callback 간격을 읽었고 음악 시계는 합성이며 실제 음표 예약은 껐어. 실제 PC/스마트폰 FPS·청감·발열·30/60FPS 달성을 입증하지 않아.

| 공연장·화면·장면 | 평균 FPS 전→후 | 1% Low 전→후 | p95 ms 전→후 | 평균 calls 전→후 |
|---|---:|---:|---:|---:|
| hall desktop front | 6.75→7.90 | 2.37→3.09 | 279.3→191.3 | 435.49→436.49 |
| hall desktop wide | 4.26→4.22 | 1.66→1.70 | 346.4→530.0 | 492.75→492.75 |
| hall mobile front | 4.54→4.59 | 1.84→1.88 | 363.8→510.8 | 348.98→351.98 |
| hall mobile wide | 2.73→2.99 | 1.10→1.18 | 829.0→460.4 | 492.75→528.75 |
| sphere desktop front | 9.26→8.87 | 3.47→3.59 | 150.2→167.1 | 411.99→411.99 |
| sphere desktop wide | 2.17→2.17 | 0.83→0.87 | 710.8→814.1 | 490.75→490.75 |
| sphere mobile front | 5.10→4.71 | 2.14→1.87 | 286.6→350.4 | 323.42→323.42 |
| sphere mobile wide | 1.65→1.68 | 0.64→0.81 | 839.6→861.5 | 455.75→455.75 |

각 장면 표본 120개, 설정별 한 번의 A/B 실행이야. p50/p99·삼각형·coarse JS heap과 계산식은 `summary.json`에 있어. 실행 시도 수를 프레임 수로 부풀리지 않았고 악화된 결과도 보존했어.

## 적응형: 해상도 변화가 포함된 별도 결과

| mobile front | 평균 FPS 전→후 | p95 ms 전→후 | 마지막 renderScale 전→후 |
|---|---:|---:|---:|
| hall | 4.49→6.17 | 444.9→284.8 | 0.7225→0.6000 |
| sphere | 5.19→6.73 | 353.5→254.7 | 0.7225→0.6000 |

두 버전 모두 scale 1에서 시작했고 후보가 0.6까지 더 낮췄어. 표본 160개이며 이 결과를 동일 화질의 최적화 실적으로 합산하면 안 돼. 품질 회복 정책·청감·열 안정성 검사는 별도야.

## 기능 결과 복구

기존 runtime 0–7은 광장 입장·복귀 4개 PASS, mobile 기능 2개 PASS, desktop 기능 2개 FAIL이야. wrapper 경로·SHA는 `summary.json`에 연결했어. desktop 두 건은 AudioContext.currentTime이 재개 검사 동안 정체됐고 뒤이어 오래된 화질 기대값 오류도 있었어. 도구 기대값 오류로 오디오 실패까지 지우면 안 돼. 이후 runtime 8–33은 canonical 종료 원본을 복구하지 못했고 성공으로 표시하지 않아.

## 무제한 대기 방지

`tools/bench/run-plan.py`는 기본 job당 600초 wall timeout과 20초 heartbeat를 적용해. plan의 `timeoutSeconds` 또는 CLI로 시간을 명시할 수 있어. 각 job의 로그를 최종 output에 즉시 기록하고 wrapper·`progress.json`을 같은 filesystem의 임시 파일+fsync+replace로 교체해. 다음 job이 멈춰도 이전 종료 기록은 남아. SIGINT/SIGTERM은 INTERRUPTED/130, timeout은 TIMEOUT/124로 보존하고 `--continue-on-failure`가 있으면 다음 job으로 진행해. 기존 완료 파일을 덮어쓰지 않아.

Linux/macOS는 독립 session/process group에 SIGTERM을 보낸 뒤 유예 시간 후 SIGKILL로 자손 프로세스를 정리해. Windows는 CREATE_NEW_PROCESS_GROUP와 제한 시간 있는 `taskkill /PID … /T /F`를 사용해. cleanup 실패는 `cleanupErrors`에 남겨. Windows 실제 실행은 하지 않았고 호출 경로만 mock으로 확인했어. 강제 전원 종료·SIGKILL·디스크 고장은 완결 상태를 보장하지 못해. 그때 남은 RUNNING을 PASS로 바꾸면 안 돼.

같은 output에는 runner 하나만 실행해. 전체 batch 종료 뒤에 임시 폴더를 복사하는 이전 외부 wrapper 대신 아래처럼 직접 저장해.

```bash
python tools/bench/run-plan.py path/to/plan.json --output qa-results/current --job-timeout-seconds 300 --heartbeat-seconds 20 --continue-on-failure
```

Windows PowerShell에서도 위 단일 행을 사용할 수 있어. `python` 대신 설치 환경에 맞게 `py -3`를 써도 돼. `node`는 PATH에 있어야 해. 브라우저 launch와 URL은 plan/env에 별도로 설정해. 이미 닫힌 index가 0–3이면 같은 plan/output에 `--start 4`로 이어가고, 실패한 index 재시도는 새 output 폴더를 사용해.

## 실행기 검증

`runner-targeted-tests.py`는 Linux에서 실제 자식·손자 프로세스를 만들어 timeout/종료·heartbeat·중간 보존·이어하기·기존 증거 보호·SIGTERM·원자 교체 실패를 검사해. Windows taskkill은 mock 검사야. 브라우저나 제품 기능 테스트 개수에 더하지 않아. 명령과 실제 결과는 `runner-tests.log`에 있어.

```bash
python docs/performance-data/recovery-20261022/runner-targeted-tests.py
```

원본 복사본과 보고서 해시는 이 폴더에서 `sha256sum -c SHA256SUMS`로 확인할 수 있어.
