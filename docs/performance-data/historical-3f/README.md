# 이전 3f 측정의 보존본

이 폴더는 **광장 추가 전 main `3f1655b0c035a630adbcfbf19582dd9363386f34` 전용**이야. 최신 main 통합본의 성능·기능 검증으로 읽으면 안 돼. 원시 결과의 버전·수치·절대 경로·실패 기록은 바꾸지 않았어.

설명과 모든 주요 전후 표는 [3f 결과 보고서](../../performance-report-3f.md)에 있어.

| 경로 | 내용 |
| --- | --- |
| `render/*.json` | 원본 42개 실행. 같은 환경·같은 fixture의 기준/후보 21쌍이야. |
| `render/*.png` | 대표 6쌍의 원본 PNG. 홀 front·wide, 스피어 dome·forest·crossfade·broadcast야. 원래 3f 계획에는 foyer가 없었어. |
| `bench-source/` | 측정 당시에 동결한 도구 15개. 원본 해시를 확인했어. |
| `source-manifest.json` | 측정 시작 전 기준·후보 파일 SHA-256. 원본 그대로야. |
| `render-plan.json`, `render-status-*.json` | 계획 42개와 실제 종료 시각·상태. 계획과 실행 결과를 구분해. |
| `analysis/summary.json`, `summary.csv`, `comparisons/` | 원시 42개 결과를 다시 검사한 strict 집계. 고정 품질 61행, auto 2행을 구분해. |
| `analysis/visual-metrics/` | 전체 이미지 63쌍의 새로운 CPU 비교 결과. 원본 파일 해시와 MAE·RMSE·SSIM 정의가 있어. |
| `node-tests/case-tap/` | 당시 9개 테스트 파일, 69개 case의 TAP 실행 결과와 로그. |
| `recovery/candidate-recovery-check.json` | 복구 커밋 `2a627fa`의 53개 파일과 당시 snapshot의 일치 검사. |
| `original-inventory.json` | 원본 전체 233개 파일의 크기·SHA-256·Git 포함 여부. |
| `manifest.json` | 현재 보존본의 모든 payload 해시. manifest 자신은 자기참조를 피하려고 제외해. |
| 그 밖의 원본 계획·스크립트·로그 | 준비만 했거나 미실행인 항목도 삭제하지 않았어. `runtime-plan-static-check` PASS는 런타임 실행 PASS가 아니야. |

원본 126개 PNG 중 Git에는 12개만 있어. 전체 이미지를 재확인하려면 별도 전체 증거 압축본의 `qa-3f/render/`를 사용해. 목록에 있는 SHA-256으로 같은 파일인지 확인할 수 있어. 61개 수동 이미지 쌍은 47개 PNG/RGB 완전 동일, 14개 차이야. auto 2쌍은 해상도가 달라서 별도 관찰로 보존했어.

## 집계 재현

저장소 root에서 다음을 실행해. 출력 경로를 이 원본 폴더 밖으로 지정해야 해.

```bash
node docs/performance-data/historical-3f/collect-summary.mjs \
  --qa-root docs/performance-data/historical-3f \
  --tools-root docs/performance-data/historical-3f/bench-source \
  --output-root /tmp/forest-historical-3f-reanalysis
```

이번 복구의 실제 결과는 `21/21 PASS`, `rows=61`, `adaptive=2`, `excluded=[]`이야. JSON 파싱·소스 해시·장면 조건의 성공을 실기기 60FPS나 전체 기능 검증의 성공으로 바꾸면 안 돼.

전체 이미지 지표를 다시 계산하려면 전체 압축본의 qa-3f를 `--qa-root`로 전달해.

```bash
python3 docs/performance-data/historical-3f/recovery/compare-3f-images.py \
  --qa-root /path/to/unpacked/qa-3f \
  --output-root /tmp/forest-historical-3f-image-analysis
```

Pillow·NumPy가 필요해. 이 도구는 원본 이미지를 읽기만 하고 지정한 출력에 JSON을 써. threshold 0, 리사이즈·정렬 없이 비교해.

## 보존본 무결성 확인

저장소 root에서 다음 Python 코드를 실행하면 manifest에 기록된 모든 파일의 크기와 SHA-256을 확인할 수 있어.

```python
import hashlib, json
from pathlib import Path
root = Path('docs/performance-data/historical-3f')
manifest = json.loads((root / 'manifest.json').read_text())
for entry in manifest['files']:
    payload = (root / entry['file']).read_bytes()
    assert len(payload) == entry['bytes'], entry['file']
    assert hashlib.sha256(payload).hexdigest() == entry['sha256'], entry['file']
print(f"{len(manifest['files'])}개 파일의 크기·SHA-256 일치")
```

`curate-3f.py`는 원본 전체에서 이 작은 묶음을 만든 복구 도구이고, `write-report.py --repo-root /path/to/repository`는 검증된 숫자를 3f 보고서에 옮긴 도구야. curation은 비어 있는 새 출력 폴더만 허용해. 이후 추가한 README·육안 검토 기록·보고서 생성기까지의 해시는 최종 manifest에 기록했어.
