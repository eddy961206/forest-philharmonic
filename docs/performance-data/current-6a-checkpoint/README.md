# 6a 성능 검증 중간 증거: 28개 계획 중 첫 4개 실행

이 폴더는 **완료된 high·desktop·sync 전후 실행 4개를 보존한 중간 checkpoint**야. 원래 28-job 계획 전체의 완료 보고나 최종 성능 판정이 아니야. 고정한 실행은 Hall 기준선/후보와 Sphere 기준선/후보 각 한 번이고, 각 장면은 8표본·준비 4프레임이야. 다른 품질·mobile·반복·cadence·실제 음악·물리 기기 결과까지 통과했다는 뜻은 아니야.

실행 원본과 이미지는 바이트 그대로 복사했어. raw의 과거 revision, 경로, 타임스탬프, 상태, 메타데이터를 현재 커밋으로 고치지 않았어. 후속 제품/CSS/도구 변경을 이 측정에 섞지 않았고, 현재 실행 중인 다른 benchmark의 파일은 수집 대상에 넣지 않았어.

## 코드와 실행 조건

| 항목 | 이 checkpoint의 범위 |
| --- | --- |
| 기준선 | `6a59c33ced4fbbe237b38eb5a4c63e38636bf07f` |
| 후보 raw의 원래 라벨 | `42dffe5-plus-screen-visibility` — Git ref가 아니라 당시 작업 트리 라벨이야. |
| 후보 제품 소스를 공개한 커밋 | `06c8ac5e6956b3b337102b342fbd4e422b43baf9` |
| 소스 연결 근거 | 원본 `source-commit-map.json`과 `source-manifest.json` |
| 완료된 계획 index | 0·1·2·3, 총 4/28개 |
| 실행 순서 | Hall A → Hall B → Sphere A → Sphere B |
| 화면 | 640×360, DPR 1, high, renderScale 1 |
| 측정 | sync, 장면당 8표본, WARMUP 4 |
| 환경 | Linux x64, Chromium 153.0.8010.0, Playwright 1.64.1, headless, local fonts |
| 렌더러 | ANGLE Vulkan / SwiftShader 소프트웨어 렌더러 |
| collector SHA-256 | `f0b8973f462846a33413a4e55657d737554899e78b17988e28219545b37a5411` |

Hall은 `front,wide,foyer,rotate,broadcast,broadcast-hidden,broadcast-return,effects-show`, Sphere는 `front,wide,dome,forest,peaks,ocean,clouds,crossfade,reveal,broadcast,effects-show` 순서야. 장면 순서도 조건의 일부야. 각 raw의 환경·fixture·제공 소스 해시와 logs의 원래 명령·시작/종료 시각을 함께 확인해.

## 숫자의 의미와 제한

`completeMs`는 시각 프레임 호출부터 1×1 readPixels 완료까지의 벽시계 시간이야. **sync ms를 1000/ms로 바꾸어 FPS라고 부르면 안 돼.** JS·드라이버·GPU 대기를 포함하며 순수 GPU frame time도 아니야. submitMs와 completionWaitMs도 각각 순수 CPU·GPU 시간으로 읽지 않아.

여기에는 평균 FPS·1% Low나 60/30FPS 달성 근거가 없어. 8표본의 nearest-rank p95/p99는 모두 가장 느린 표본 하나이며, 드문 끊김이나 장시간 안정성을 대표하지 않아. 각 공연장은 A/B 한 쌍이므로 반복 순서·열 상태·통계적 재현성도 이 묶음으로 확정하지 않아. GPU 타이머 확장의 존재 표시가 있어도 이 collector는 GPU ms를 수집하지 않았어.

SwiftShader 결과는 실제 PC/휴대폰 GPU 실측이 아니야. 물리 기기의 FPS·발열·배터리·오디오 출력으로 일반화하지 않아. fixture는 통제한 음악 시각과 무대 상태를 쓰고 음표 스케줄러를 끈 시각 렌더 벤치마크야. 실제 음악과 GPU 동시 부하의 안정성·음질은 별도로 검증해야 해.

raw와 review-high-results.json에는 개선·악화 항목이 함께 남아 있어. 검토 JSON은 이 중간 측정에 대한 기존 해석이며 새 브라우저 재실행이 아니야. PASS는 해당 collector 조건과 프로세스 종료를 뜻해. 성능·화질·실기기 전체 합격을 뜻하지 않아.

## 보존한 파일

| 종류 | 개수 | 경로 |
| --- | ---: | --- |
| 렌더 raw JSON | 4 | `render/*-sync.json` |
| 실행 상태 JSON | 4 | `logs/000..003-*.json` |
| stdout/stderr 실행 로그 | 4 | `logs/000..003-*.log` |
| 소스 manifest·공개 커밋 연결 | 2 | `source-manifest.json`, `source-commit-map.json` |
| 기존 육안 검토 | 2 | `visual-review-hall-high.json`, `visual-review-sphere-high.json` |
| 기존 결과 검토 | 1 | `review-high-results.json` |
| 전체 원래 계획 | 1 | `render-plan.json` — 28개 모두 원본 그대로야. |
| 선택한 원본 PNG | 6 | 두 공연장 front A/B 4장과 Hall broadcast-return A/B 2장 |

복사한 원본은 총 24개야. 이외에 mapping.json, inventory.json과 이 README를 새로 작성했어. manifest가 열거한 모든 제품 파일을 복제한 것은 아니고, 제품 파일은 고정 Git 커밋과 제공 소스 해시로 확인해야 해.

PNG는 640×360 원본이며 재인코딩·리사이즈·보정하지 않았어. 두 visual-review는 이 6장 외의 이미지도 검토한 기록이라 일부 참조 PNG는 이 Git 묶음에 없어. 미선정 원본 PNG·다른 실행·실패/중단 기록·추가 QA까지 포함한 **전체 증거는 최종 보고서가 연결하는 전체 원본 ZIP**을 사용해. 이 작은 checkpoint가 전체 증거 ZIP을 대신하지 않아. 최종 ZIP의 실제 파일 목록과 manifest 해시를 확인한 뒤 완전성을 판단해야 해.

과거 a41·3f, 별도 smoke, 다른 GPU/native/audio/functional 실행은 이 폴더에 섞지 않았어. 이 checkpoint에 없는 실행의 완료 여부는 해당 원본과 최종 보고서를 별도로 확인해.

## 경로와 무결성 확인

mapping.json은 원래 절대 경로·verification 기준 상대 경로와 보존 경로를 연결하고 각 파일의 바이트 수·SHA-256을 담아. 원본 JSON 안의 절대 경로를 치환하지 않았으므로 다른 PC에서는 이 mapping으로 파일을 찾아.

inventory.json에는 원본 24개와 README·mapping 2개, 총 26개 파일의 해시가 있어. inventory 자신은 자기 참조 해시를 만들지 않도록 제외했어. 최종 전체 원본 ZIP manifest에서 inventory 파일 자체의 해시도 확인해야 해.

저장소 루트에서 아래 코드를 실행하면 브라우저 없이 복사본의 바이트 수·해시를 확인할 수 있어.

```python
from pathlib import Path
import hashlib
import json

root = Path('docs/performance-data/current-6a-checkpoint')
manifest = json.loads((root / 'inventory.json').read_text(encoding='utf-8'))
for row in manifest['files']:
    data = (root / row['path']).read_bytes()
    assert len(data) == row['bytes'], row['path']
    assert hashlib.sha256(data).hexdigest() == row['sha256'], row['path']
print(f"확인한 파일: {len(manifest['files'])}")
```

PC에서 다시 실행하려면 [6a 고정 재현 안내](../../performance-reproduce-6a.md)를 따라. 원본을 다시 집계한 결과와 브라우저를 새로 실행한 결과는 구분해서 보관해.
