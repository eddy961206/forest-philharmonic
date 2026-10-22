# 원본 PNG 다운로드·무결성 확인·재비교

이 작업의 **채팅 최종 응답에 첨부한 `forest-philharmonic-e741-screenshots.zip`**을 내려받아. Git에는 원본 JSON·로그·계획·이미지 해시를 보존하고, 크기가 큰 PNG는 이 ZIP으로 제공해. 저장소만 clone하면 PNG까지 내려오지는 않아.

| 항목 | 실제 제공 내용 |
|---|---|
| 기준 / 후보 제품 | e741811d1d7a040afcdd3a8230465980c64f82fc / 6c7817218814f00631089eb2c6f150d68190980f |
| ZIP 크기 | 34,842,644 bytes (약 33.23 MiB) |
| 원본 PNG | 180장, 총 34,794,405 bytes |
| ZIP payload | PNG 180장 + EVIDENCE_GUIDE.md 1개 |
| ZIP SHA-256 | c297c48355137b34e23919156411969cbc55a4e1e80f504e28396dfc745eb0c6 |

[기계 판독용 ZIP 기록](performance-data/main-e741/screenshot-archives.json)과 ZIP 내부 `manifest.json`에 크기·SHA를 남겼어. 생성 시 모든 payload를 ZIP에서 다시 읽어 원본과 대조했어. PNG를 편집·재압축·크기 변경하지 않았어. 패키징·검증 도구는 Python 표준 라이브러리만 사용해.

## 1. 무결성 검사와 압축 해제

[PC 재현 안내](performance-reproduce-e741.md)의 `source` 저장소를 준비한 뒤 아래 명령을 실행해. `FP_ROOT`는 `source`가 들어 있는 작업 폴더야. Git 원본 JSON·로그의 해시를 유지하도록 최초 clone부터 `git -c core.autocrlf=false clone ...`을 사용해.

### Windows PowerShell

```powershell
$FP_ROOT = Join-Path $env:USERPROFILE 'forest-perf-e741'
$FP_ZIP = "$env:USERPROFILE\Downloads\forest-philharmonic-e741-screenshots.zip"
$FP_IMAGES = "$FP_ROOT\screenshots-e741"
py -3 "$FP_ROOT\source\tools\bench\verify-evidence.py" $FP_ZIP --expected-sha256 c297c48355137b34e23919156411969cbc55a4e1e80f504e28396dfc745eb0c6
if ($LASTEXITCODE -ne 0) { throw 'ZIP 무결성 확인 실패' }
Expand-Archive -LiteralPath $FP_ZIP -DestinationPath $FP_IMAGES
```

### macOS / Linux Bash

```bash
FP_ROOT="$HOME/forest-perf-e741"
FP_ZIP="$HOME/Downloads/forest-philharmonic-e741-screenshots.zip"
FP_IMAGES="$FP_ROOT/screenshots-e741"
python3 "$FP_ROOT/source/tools/bench/verify-evidence.py" "$FP_ZIP" \
  --expected-sha256 c297c48355137b34e23919156411969cbc55a4e1e80f504e28396dfc745eb0c6
# 위 명령이 PASS / exit 0인지 확인한 뒤 새 폴더에 풀어.
python3 -m zipfile -e "$FP_ZIP" "$FP_IMAGES"
```

검증 도구는 ZIP 전체 SHA, 내부 파일 목록·크기·각 SHA를 확인하고 파일을 추출하거나 수정하지 않아. 정상 결과의 `payloadFiles`는 181, `pngFiles`는 180이야. 이 무결성 검사는 성능 수치나 시각적 품질을 판정하는 검사가 아니야.

## 2. 압축 안의 실제 경로

| 폴더 | PNG 수 | 대응 자료 |
|---|---:|---|
| high/render | 36 | high desktop A→B 및 B→A, 18쌍 |
| matrix/render | 90 | 나머지 프리셋·mobile viewport, 45쌍 |
| runtime-app/raw | 34 | 돔 고정 시점 15쌍 + 후보 방 UI 캡처 4장 |
| special/render | 20 | 로비·회전·세계·효과, 10쌍 |

`baseline-*`와 `candidate-*`가 대응해. 네 후보 방 UI 캡처는 A/B 쌍이 아니야. high/matrix 63쌍, 돔 15쌍, special 10쌍은 서로 다른 검사 집합으로 보고서에 나눠 기록했어.

## 3. 실제 한 쌍의 픽셀 지표를 다시 계산

이미지 비교에만 Pillow와 NumPy가 필요해. 앱 runtime 의존성은 추가하지 않아. 별도 가상환경을 만들고 버전을 기록해 두면 돼.

### Windows PowerShell

```powershell
py -3 -m venv "$FP_ROOT\image-tools"
$FP_PYTHON = "$FP_ROOT\image-tools\Scripts\python.exe"
& $FP_PYTHON -m pip install Pillow numpy
& $FP_PYTHON -m pip freeze | Out-File -Encoding utf8 "$FP_ROOT\image-tool-versions.txt"
& $FP_PYTHON "$FP_ROOT\source\tools\bench\compare-images.py" `
  "$FP_IMAGES\high\render\baseline-a-full-hall-high-desktop-sync-front.png" `
  "$FP_IMAGES\high\render\candidate-a-full-hall-high-desktop-sync-front.png" `
  --output "$FP_ROOT\hall-front-pixels.json"
```

### macOS / Linux Bash

```bash
python3 -m venv "$FP_ROOT/image-tools"
FP_PYTHON="$FP_ROOT/image-tools/bin/python"
"$FP_PYTHON" -m pip install Pillow numpy
"$FP_PYTHON" -m pip freeze > "$FP_ROOT/image-tool-versions.txt"
"$FP_PYTHON" "$FP_ROOT/source/tools/bench/compare-images.py" \
  "$FP_IMAGES/high/render/baseline-a-full-hall-high-desktop-sync-front.png" \
  "$FP_IMAGES/high/render/candidate-a-full-hall-high-desktop-sync-front.png" \
  --output "$FP_ROOT/hall-front-pixels.json"
```

이 Hall high front 쌍은 SHA가 같고 MAE/RMSE 0, 변경 픽셀 0%, SSIM 1이 나와야 해. 다른 쌍은 [63쌍 비교 JSON](performance-data/main-e741/visual-summary.json), [돔 비교](performance-data/main-e741/dome-motion-summary/pixel-summary.json), [추가 장면 비교](performance-data/main-e741/special-visual-summary.json)의 파일명을 같은 방식으로 사용해.

원본 저장 경로가 `/workspace/...`로 기록된 경우 ZIP 루트의 대응 상대 경로로 바꿔. 원본 JSON의 절대 경로 자체를 편집하면 기존 파일 SHA는 달라지므로, 원본은 보관하고 새 비교 결과는 다른 이름으로 저장해.

## 4. 결과를 읽을 때 구분할 점

- 전체 8-bit RGB를 비교하며 alpha는 검정 배경에 합성해. 크기 변경·자동 정렬·crop은 원본 보고서에서 사용하지 않았어. SSIM은 RGB 채널별 7×7 균일 창의 평균이야.
- 성능·돔 비교의 PC 캡처는 640×360(122장), 모바일은 390×844(54장)이야. 방 UI 4장은 별도 960×640이므로 같은 해상도라고 섞지 않아. 모바일 PNG를 실물 스마트폰 렌더링으로 해석하지 않아. 글꼴은 system fixture이고 일부 한글 대체 글리프가 있어.
- low 중계 네 쌍은 기준의 검거나 이전 상태인 중계와 후보의 즉시 갱신 영상이 달라. 같은 프리셋이어도 엄격한 동일 영상 성능 성과에서는 제외했어.
- 스크린샷은 고정 순간을 비교해. 연속 움직임·실제 프레임 표시·장시간 안정성·음질을 대신하지 않아. 성능은 [렌더 안내](performance-reproduce-e741.md), 실제 재생·입력·방은 [런타임 안내](performance-runtime-e741.md)로 별도 확인해.
- **이전 1f/dea 세션의 280 PNG는 이 ZIP에 없어.** 앞서 복구한 지표·파일 해시는 Git에 남겼지만, 최종 패키징 때 이전 scratch 원본 경로가 더 이상 존재하지 않아 함께 제공하지 못했어. 그 오래된 지표를 현재 180장의 결과로 섞지 않아. 최신 e741/6c에 수집한 PNG 180장은 모두 포함했어.
