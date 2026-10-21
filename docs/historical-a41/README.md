# 과거 a41 검증 문서와 핵심 근거 복구

이 폴더는 연결이 끊긴 이전 세션의 **a41 단계 문서와 측정 근거를 보존한 자료**야. 원래 문서 5개를 파일명·내용·줄바꿈까지 바이트 그대로 복사했어. 문서 안의 수치, 실패, 미완료 상태, 원래 상대 링크를 고치지 않았어. 이번 복구 과정에서 브라우저·오디오·성능 벤치마크·제품 테스트를 새로 실행하지 않았어.

**여기의 결과를 광장이 추가된 main이나 현재 PR의 실행 결과로 읽으면 안 돼.** 기준은 `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`이고, 셰이더 실험 등 일부 이전 근거는 문서에 명시된 `ec5ef65fab027353b51f751ffb59aa65b863af0a` 기준이야. 이후 `3f1655b` 통합 결과는 [3f 전용 보고서](../performance-report-3f.md)에서 따로 확인해. 현재 PC에서 다시 실행할 때는 [현재 재현 안내](../reproduce-on-pc.md)와 실제 비교할 두 커밋을 사용해.

## 문서 5개

| 보존한 원문 | 원래 범위와 읽는 방법 |
| --- | --- |
| [performance-report.md](performance-report.md) | a41 전체 성능·품질·로딩·기능 보고서야. 이름에 기준 SHA가 없어도 본문의 기준과 표는 a41이야. |
| [performance-report-a41.md](performance-report-a41.md) | a41 보존본임을 알리는 문단을 포함한 당시 보고서야. 첫 문단이 가리키는 `performance-report.md`도 이 복구 시점에는 여전히 a41 내용이므로, 그 링크만 보고 3f 완료 보고서라고 해석하지 마. |
| [runtime-validation.md](runtime-validation.md) | 로딩, Worker의 PCM 동일성, 음표 예약, 실제 UI 조작, 방 동기화의 도구·조건·결과·제한을 기록했어. ec5에서 연결한 근거와 a41 재실행을 구분해. |
| [validation-log.md](validation-log.md) | 기준선 고정, 계측 보정, 실패, 재검사, 제외한 실행, 커밋 체크포인트가 남아 있어. 문서의 ‘현재’·‘최종’은 당시 세션 시점의 표현이야. |
| [shader-experiments.md](shader-experiments.md) | **ec5 기준의 미채택 셰이더 후보 실험**이야. a41·3f·광장 통합본의 셰이더 성능 증거로 사용하지 않아. |

본문 수정은 **0개**야. [복구 manifest](manifest.json)의 `modifiedDocuments`는 빈 배열이고, 각 원문과 복사본의 SHA-256·바이트 수가 같아. 링크를 새 경로로 바꾸는 대신 아래 경로 표와 [개별 링크 대응표](link-map.json)를 추가했어.

## 전체 원본 ZIP 찾기

전체 원본은 이 작업의 **최종 보고에 제공하는 `forest-philharmonic-evidence-a41.zip` 첨부파일**에서 받아. 파일명을 기준으로 찾으면 돼. 이 Git 폴더에는 큰 PNG, 전체 오디오·로딩 추적, 실행기와 이전 증거의 중복 사본을 모두 넣지 않았어. 다른 단계의 `forest-philharmonic-evidence-3f.zip`, `forest-philharmonic-evidence-6a.zip`와 구분해.

`forest-philharmonic-evidence-a41.zip` 안의 원본 루트는 다음과 같아.

| ZIP 안의 경로 | 내용 |
| --- | --- |
| `qa-a41/` | 이전 작업 폴더의 전체 원시 JSON·CSV·PNG·로그·계획·수집 이력이야. |
| `docs-a41/` | 이전 저장소의 `docs/` 전체야. 문서가 원래 가리키던 `performance-data/`도 이 아래 있어. |
| ZIP의 README·inventory | 전체 아카이브의 범위와 파일 해시를 확인하는 자료야. 이 Git 폴더의 선별 manifest와 구분해. |

예를 들어 원문에서 `performance-data/latest-a41/qa-a41/render/baseline-full-hall-low-desktop-cadence.json`을 가리키면, ZIP의 `docs-a41/performance-data/latest-a41/qa-a41/render/`에서 같은 이름을 찾으면 돼. 같은 원시는 `qa-a41/render/`에도 있어. 원문의 그림 링크도 `docs-a41/`를 앞에 붙이면 원래 상대 구조로 열 수 있어. ZIP을 풀고 **`docs-a41/performance-report-a41.md`를 Markdown 뷰어로 열면** 원래 문서 사이와 대부분의 증거 링크를 그대로 따라갈 수 있어.

원문에서 저장소 소스인 `../public/`, `../tests/`, `../tools/bench/`를 가리키는 링크는 별도 확인이 필요해. 당시 제품 체크포인트는 [code-checkpoint.json](evidence/qa-a41/code-checkpoint.json)에 있고, 도구·제품의 파일별 해시도 보존했어. 재현할 checkout의 파일과 이 해시를 비교해. 오늘의 동명 파일이 당시 파일과 같다고 가정하지 마. 당시 수집 도구 보존본은 ZIP의 `docs-a41/performance-data/latest-a41/repository/tools/bench/` 등에 있으며, 일부 진단 단계별 원본은 `docs-a41/performance-data/provenance/`에 따로 있어.

## 원문 상대 경로와 여기 보존한 경로

| 원문에서 보이는 상대 경로 | 이 Git 폴더 또는 전체 ZIP에서 찾는 곳 |
| --- | --- |
| 문서 5개의 파일명 | 이 폴더의 같은 이름이야. 서로 간 링크는 그대로 유효해. |
| `performance-data/latest-a41/qa-a41/<상대 경로>` | 선택된 JSON·CSV는 `evidence/qa-a41/<상대 경로>`, 나머지는 ZIP의 `qa-a41/<상대 경로>` 또는 `docs-a41/performance-data/latest-a41/qa-a41/<상대 경로>`야. |
| 본문의 `qa-a41/<상대 경로>` | 위와 같은 원시 자료야. 선택된 파일은 `evidence/qa-a41/`, 전체는 ZIP의 `qa-a41/`에서 찾아. |
| `performance-data/runtime/<상대 경로>` | 선택된 JSON은 `evidence/performance-data/runtime/<상대 경로>`, TAP·Markdown 등은 ZIP의 `docs-a41/performance-data/runtime/<상대 경로>`야. |
| `performance-data/provenance/<상대 경로>` | 선택된 JSON은 `evidence/performance-data/provenance/<상대 경로>`, 원본 JS·patch·설명은 ZIP의 `docs-a41/performance-data/provenance/<상대 경로>`야. |
| `performance-data/shader-experiments/<상대 경로>` | 결과 JSON과 기존 manifest는 `evidence/performance-data/shader-experiments/<상대 경로>`, GLSL 후보·실행기·전체 설명은 ZIP의 `docs-a41/performance-data/shader-experiments/<상대 경로>`야. |
| `performance-data/latest-a41/manifest.json`, `final-source-manifest.json` | `evidence/performance-data/latest-a41/`에 원문 그대로 있어. 여기의 선별 목록보다 큰 과거 전체 보존 범위를 설명하므로, 미복사 파일이 언급돼도 손상으로 해석하지 마. |
| `bench-method.md`, `reproduce-on-pc.md`, `architecture-audit.md`, `pc-validation-template.md` | 당시 원문은 ZIP의 `docs-a41/`에 있어. 현재 실행 안내는 이 폴더의 상위 `docs/`를 사용하되 당시 소스 동일성을 대신하는 자료로 쓰지 마. |
| 그 밖의 문서·이미지·로그·원본 도구 | [link-map.json](link-map.json)의 `archivePath` 또는 ZIP의 원래 상대 구조로 찾아. |

[link-map.json](link-map.json)에는 문서별 190개 링크·원시 경로 참조를 기록했어. `preservedRelative`가 있으면 이 폴더 기준으로 열 수 있고, `archivePath`만 있으면 전체 ZIP에서 열면 돼. `repository-reference`는 원래 저장소 소스 링크라서 기록된 체크포인트·파일 해시로 확인해야 해. `currentConveniencePath`는 현재 파일을 찾기 위한 참고값이며 역사적 동일성의 증거가 아니야.

## 바로 읽을 핵심 근거

| 확인할 내용 | 보존한 근거 |
| --- | --- |
| a41 렌더 비교 전체 집계 | [summary.json](evidence/qa-a41/summary.json), [summary.csv](evidence/qa-a41/summary.csv), [정의·대표 수치](evidence/qa-a41/key-findings.json) |
| 홀 high desktop 원시 전후 | [baseline](evidence/qa-a41/render/baseline-full-hall-high-desktop-sync.json), [after](evidence/qa-a41/render/after-full-hall-high-desktop-sync.json) |
| Sphere high desktop 원시 전후 | [baseline](evidence/qa-a41/render/baseline-full-sphere-high-desktop-sync.json), [after](evidence/qa-a41/render/after-full-sphere-high-desktop-sync.json) |
| 고정 관객 로딩 8개 실행·4쌍 조건 검사 | [loading-fixed-summary.json](evidence/qa-a41/runtime-results/loading-fixed-summary.json), [Hall desktop 상세 비교](evidence/qa-a41/runtime-results/loading-comparison-hall-desktop.json), [Sphere mobile 상세 비교](evidence/qa-a41/runtime-results/loading-comparison-sphere-mobile.json) |
| 65초 실제 오디오 예약 6개 실행의 파일 검증 | [audio-stability-summary.json](evidence/qa-a41/runtime-results/audio-stability-summary.json), [입력·집계기 해시 연결](evidence/performance-data/provenance/a41-audio-stability-verification.json) |
| 실제 두 탭 방 UI | [Hall cross](evidence/qa-a41/runtime-results/rooms-current-hall-cross.json), [Sphere core](evidence/qa-a41/runtime-results/rooms-current-sphere-core.json) |
| Hall 재개 실패와 기준선 대조 | [후보 재검사](evidence/qa-a41/functional-recheck/recheck-hall-hall-desktop.json), [기준선 transport](evidence/qa-a41/transport-control/baseline-transport-hall-desktop.json), [후보 fake-output](evidence/qa-a41/fake-output-functional/candidate-fake-output-hall-desktop.json) |
| Sphere 품질 resize 관측을 고친 재검사 | [recheck-sphere-sphere-desktop.json](evidence/qa-a41/functional-recheck/recheck-sphere-sphere-desktop.json) |
| Worker·CSP fallback의 PCM 동일성 | [browser-worker.json](evidence/performance-data/runtime/browser-worker.json) |
| Node 회귀의 실제 실행 범위 | [a41 59개 실행](evidence/performance-data/runtime/a41-node-tests/results.json), [품질 8개 후속 실행](evidence/performance-data/runtime/a41-quality-dpr-regression/result.json), [고유 범위 60개 합산 근거](evidence/performance-data/runtime/a41-quality-dpr-regression/combined-scope.json) |
| 원본 이미지 전후 수치 | [visual-review/summary.json](evidence/qa-a41/visual-review/summary.json), [metrics.csv](evidence/qa-a41/visual-review/metrics.csv) |
| ec5 셰이더의 실패·미채택 결과 | [44개 case 요약](evidence/performance-data/shader-experiments/raw/full/summary.json), [최초 FOREST 실패 smoke](evidence/performance-data/shader-experiments/raw/forest-v1-smoke/summary.json), [미완성 reveal-lite-m1 원문](evidence/performance-data/shader-experiments/raw/full/reveal-lite-m1.json) |

실패와 성공을 함께 남겼어. 예를 들어 Hall의 pause → seek → resume 2초 조건 실패는 65초 연속 재생 성공으로 해결됐다고 기록하지 않아. 품질 테스트의 후속 8개를 이전의 변경 없는 52개에 연결한 60개 범위는 **한 번에 60개를 재실행한 결과가 아니야**. 이전 집계기의 실패·복구는 [collector-repair.json](evidence/qa-a41/collector-repair.json)에 있으며, 렌더를 새로 실행한 결과와 구분해.

## 5MB 안에서 보존한 범위

`evidence/`에는 **234개 파일, 4,685,266 bytes**를 넣었어. 모두 원본 JSON·CSV 또는 원래 manifest이고, 내용을 요약해서 새 원시 파일처럼 만들지 않았어. 파일별 바이트·해시는 [manifest.json](manifest.json)에 있어.

- 렌더 원시 JSON 42개 중 **34개**를 보존했어. high·medium 전후, 역순 반복, low의 충분한 준비 후 중계, auto, smoke가 포함돼. 최초 low cadence 8개는 큰 표본 배열 때문에 전체 ZIP에 보존하고, Git에는 그 결과를 포함한 원래 비교·집계 자료를 남겼어.
- 기능 실패·재검사·기준선·multiprocess·fake-output 조건을 함께 보존했어. 일부 성공만 고른 모음이 아니야.
- 로딩·65초 오디오는 원시 파일이 각 1~2MB여서 요약·비교·입력 해시를 이곳에 넣고, 전체 이벤트·자원·음표 배열은 ZIP에 남겼어. 단독 oscillator `audio-clock` 추적도 ZIP의 `qa-a41/audio-clock/`에 있어.
- 이미지 수치·원본 이미지 해시를 보존했어. PNG·contact sheet·crop은 이 폴더에 넣지 않았고, 전체 ZIP에 있어. 이번 복구에서 이미지를 다시 분석하거나 재인코딩하지 않았어.
- 셰이더의 원시 결과에는 최초 실패 smoke와 미완성 파일도 포함돼. packed 후보 GLSL인 `variants.json`, 실행기와 원래 설명은 ZIP에서 확인해.

과거 문서가 참조하는 동결된 `docs/performance-data/latest-a41/qa-a41/`와 원래 `qa-a41/`의 JSON·CSV **221개를 읽어서 바이트가 모두 같은지도 확인했어**. 이 확인은 원본 연결과 복사 무결성을 위한 검사야. 기록된 PASS/FAIL을 바꾸거나 제품을 다시 검증하는 행위는 아니야.

## 수치 해석과 재검증

당시 환경은 Chromium의 ANGLE/SwiftShader였어. desktop/mobile 표기는 viewport·DPR·UA·touch 조건을 뜻하며, 실물 PC·스마트폰 GPU 측정이 아니야. 고정 품질의 동기식 `frame() + readPixels` 완료시간과 외부 rAF 간격은 서로 다른 지표이고, 동기 완료시간의 역수를 실제 FPS로 부르지 않아. GPU timer, GPU 메모리, 발열·전력, 실제 출력의 오디오 글리치, iOS Safari·실물 Android·Edge 결과는 별도 실측이 필요해.

동기 측정은 장면당 6표본이므로 p95/p99가 사실상 최댓값에 의존해. low·auto의 짧은 rAF 표본도 장시간 안정성을 대신하지 않아. 로딩은 반복 렌더를 멈춘 통제된 부팅이며, 65초 오디오도 약 5Hz 시각 상태 갱신 조건이야. 유리한 숫자와 악화한 숫자를 원문 그대로 읽고, 실제 기기에서는 같은 커밋·카메라·곡 시각·프리셋·관객·브라우저 조건으로 다시 비교해.

이 폴더의 복사 무결성은 다음처럼 확인할 수 있어. 원래 큰 묶음의 checksum 파일 대신 **여기의 `checksums.sha256`**를 사용해.

```bash
cd docs/historical-a41
sha256sum --check checksums.sha256
```

macOS에서는 `shasum -a 256 --check checksums.sha256`를 쓸 수 있어. Python이 있는 Windows·macOS·Linux에서는 저장소 루트에서 다음을 실행해도 돼.

```python
from pathlib import Path
import hashlib

root = Path('docs/historical-a41')
for row in (root / 'checksums.sha256').read_text().splitlines():
    expected, relative = row.split('  ', 1)
    actual = hashlib.sha256((root / relative).read_bytes()).hexdigest()
    assert actual == expected, relative
print('보존 파일의 SHA-256이 모두 같아.')
```

이 명령은 파일 무결성만 확인해. 실제 PC 검증은 상위 [재현 안내](../reproduce-on-pc.md)의 준비·기준선 고정·직렬 측정·동일 품질 비교 절차로 진행해.
