# 최신 main 대비 추가 장면 시각 비교 — special만

## 판정과 범위

2026-10-22 수집한 **special 20 PNG / 10 전후 쌍**을 비교했어. **7쌍은 PNG 바이트와 RGB 픽셀이 모두 같고, 차이는 Sphere의 `peaks`, `ocean`, `clouds` 3쌍에만 있어.** 최저 SSIM은 **0.999476471**, 최대 MAE는 **0.116503183/255**, 최대 RMSE는 **0.674465023/255**야. 원본을 직접 본 6쌍에서는 큰 구조 소실·검은 돔 면·효과 제거를 발견하지 못했어. 세 3D 세계의 픽셀 완전 동일성을 주장하지 않아.

- 기준 제품: `e741811d1d7a040afcdd3a8230465980c64f82fc`
- 비교 제품: `6c7817218814f00631089eb2c6f150d68190980f`
- 입력 위치: `/workspace/scratch/25707ad85ea4/verification/special/render`
- Hall medium desktop: `foyer`, `rotate`, `effects-show` 3쌍.
- Sphere medium desktop: `dome`, `peaks`, `ocean`, `clouds`, `reveal`, `rotate`, `effects-show` 7쌍.
- **기존 high/matrix 63쌍, 역사 1f/dea 비교, 별도 dome-motion 자료와 합산하지 않았어.**

이 판정은 저장된 한 시점의 화면 비교야. FPS·GPU 시간·오디오 품질이나 연속 이동 중 무회귀를 뜻하지 않아.

## raw에서 확인한 비교 조건

4 raw JSON이 모두 `PASS`이고, 각 공연장의 전후 공통 메타데이터·시나리오 정의가 일치해. fixture/collector/helper SHA, 시나리오 순서, 카메라 시작 위치/target/FOV, 곡·음악 시각 정책, 품질·렌더 배율·해상도, 관객 수·시드와 조명/효과 조건을 비교했어. 모든 80개 측정 표본은 `medium`, `renderScale=1`, 페이지 visible, completed이고 GL 오류·context loss·sleep 상태가 없어. page/console/request 오류도 없어.

| 조건 | 확인한 값 |
|---|---|
| 실행 환경 | Linux x64, Headless Chromium 153.0.8010.0, Playwright 1.62.1, ANGLE SwiftShader |
| 화면 | 640×360 CSS px / 캡처 PNG 640×360, device DPR 1, renderer pixelRatio 0.85, renderScale 1 |
| 고정 품질 | medium, Lite false, 전후 동일 |
| 음악 | beethoven-ode-to-joy, 시나리오 시작 25초, 매 step 합성 음악 시각 1/60초 증가 |
| 관객 | Hall 1,503 / eligible 좌석 1,879, Sphere 11,076 / eligible 좌석 13,845 |
| 난수 | 관객·장면 seed 417, 별도 UUID seed 874, 시나리오마다 장면 난수 재설정 |
| 준비/수집 | 장면마다 warmup 2 + 측정 step 4, 마지막 step 후 canvas PNG 1장 |
| 음향 조건 | 실제 엔진 생성, 음표 스케줄러 비활성화, 합성 음악 시계; 실제 연주/음질 검증 아님 |
| effects-show | laser/wash만 480×1/60초 준비, 즉시 색종이 2회·폭죽 3회, 10 settling update, 지연 피날레 타이머 제외 |
| Sphere 준비 확인 | 각 장면 base 돔 main-camera draw와 프로그램 링크 확인; reveal에서는 overlay도 draw/링크 확인 |

`rotate`는 fixture의 같은 결정론적 이동·회전 공식과 6개 step을 사용해. raw의 camera는 시작 pose이며 최종 camera matrix 자체를 기록한 것은 아니야. 마지막 정지 사진 1쌍으로 빠른 회전의 전 구간을 확인했다고 표현하지 않아. `reveal`도 전환 중 한 시점이야. warmup 후 raw에 기록된 mix는 전후 모두 약 0.5011104938, reveal=1이며 base/overlay가 모두 그려졌어. 이것이 전체 전환 곡선의 시각적 일치를 증명하지는 않아.

각 raw의 **12개 HTTP 소스 경로 상태**는 실행 전후 동일하고 기존 source manifest와 일치해. baseline에 없는 `quality.js`의 404는 예상된 상태야. manifest SHA는 `504b7dccaa999e723a740d2171e9a347bb663cd985f1debb0f56d7704ac898a9`야. 이 검사는 기록된 소스 집합의 일치 확인이며 이번 작업에서 Git을 다시 실행하거나 실행된 전체 소스 트리를 감사한 것은 아니야. SwiftShader의 readPixels stall 경고와 Sphere의 KHR_parallel_shader_compile 미지원 경고는 원본에 남아 있어.

## 정량 결과

| 공연장 | 장면 | SSIM ↑ | MAE ↓ | RMSE ↓ | 변경 픽셀 비율 | PNG 바이트 |
|---|---|---:|---:|---:|---:|---|
| hall | foyer | 1.000000000 | 0.000000000 | 0.000000000 | 0.000000% | 동일 |
| hall | rotate | 1.000000000 | 0.000000000 | 0.000000000 | 0.000000% | 동일 |
| hall | effects-show | 1.000000000 | 0.000000000 | 0.000000000 | 0.000000% | 동일 |
| sphere | dome | 1.000000000 | 0.000000000 | 0.000000000 | 0.000000% | 동일 |
| sphere | peaks | 0.999476471 | 0.116503183 | 0.674465023 | 15.217448% | 차이 있음 |
| sphere | ocean | 0.999548307 | 0.025464410 | 0.350683443 | 3.585938% | 차이 있음 |
| sphere | clouds | 0.999732233 | 0.021226852 | 0.186370052 | 4.839410% | 차이 있음 |
| sphere | reveal | 1.000000000 | 0.000000000 | 0.000000000 | 0.000000% | 동일 |
| sphere | rotate | 1.000000000 | 0.000000000 | 0.000000000 | 0.000000% | 동일 |
| sphere | effects-show | 1.000000000 | 0.000000000 | 0.000000000 | 0.000000% | 동일 |

변경 픽셀은 RGB 어느 채널이라도 1 이상 달라진 픽셀이야(threshold=0). 그래서 `peaks`의 15.217448%는 화면 15%의 품질이 저하됐다는 뜻이 아니야. 그 장면의 전체 채널 평균 절대 오차는 0.116503/255야. SSIM 수치만으로 통과/실패 문턱을 만들지 않았어.

## 원본 육안 확인

`view_image`로 **6쌍 / 12개 원본 PNG**를 직접 봤어. 콜라주·크기 변환·노이즈 제거·차분 확대·PNG 편집은 하지 않았어.

- **hall / foyer**: 검은 대리석 기둥·금색 장식·격자 바닥·붉은 카펫·달/숲 벽화·양쪽 출입구 구성이 같아. 이 쌍은 PNG 바이트까지 같아.
- **hall / effects-show**: 관객·악기·연주자·무대 배치와 조명 광선, 색종이, 세 곳의 폭죽 모양/위치가 같아. 효과를 끄거나 생략한 모습은 없고 PNG 바이트까지 같아.
- **sphere / effects-show**: 돔 건축 장면과 대규모 곡선 객석, 중앙 무대·조명 광선·색종이/폭죽이 같아. 이 쌍도 PNG 바이트까지 같아.
- **sphere / peaks**: 이 집합에서 SSIM·MAE·RMSE·변경 픽셀 비율 모두 차이가 가장 큰 쌍이야. 산 능선·눈 표면·청록 오로라·돔 경계·무대/객석이 같은 구성을 유지해. 원본 640×360을 나란히 보았을 때 큰 구조 소실·검은 면·확연한 선명도 저하는 관찰되지 않았어. 픽셀은 완전히 같지 않아.
- **sphere / ocean**: 해초 기둥·수중 깊이감·해저 굴곡/빛 무늬와 무대·객석이 같은 구성을 유지해. 이 한 시점에서 큰 구조 차이는 관찰되지 않았어. 픽셀은 완전히 같지 않으며 고래 움직임 등 보이지 않는 시각 요소는 이 사진으로 평가하지 않았어.
- **sphere / clouds**: 밝은 태양·구름/산 능선·수평선과 객석에 비치는 밝기의 전체 구성이 유지돼. 이 한 시점에서 큰 구조 차이는 관찰되지 않았어. 픽셀은 완전히 같지 않아.

곡 시각·시드·카메라·진행 step을 맞췄으므로 차이를 단순히 서로 다른 연주 시점으로 설명하지 않았어. ray proxy/보간/렌더 순서/부동소수점 중 어떤 항목이 세 세계의 미세 차이를 만들었는지는 이 비교에서 분리하지 않았어. 따라서 자연스러운 애니메이션 차이라고 단정하지도 않았어. Hall과 Sphere 효과 장면은 실제로 바이트 동일해, 이 범위에서는 효과를 줄인 화면을 동일 품질 개선으로 계산하는 문제가 없어.

## 도구, 입력 무결성과 재현

기존 `compare-images.py`를 수정하지 않고 같은 프로세스에서 10번 호출했어. CPU 비교 구간은 0.864초였고 브라우저/GPU 실행은 없었어. 제품·Git·원본 JSON/PNG는 수정하지 않았어.

도구 SHA-256:

- `tools/bench/compare-images.py`: `328a65ef13b105dc593181c2a049401413374a09a8b4d54aa2100fa569e66eb4`
- `tools/bench/full-frame-fixture.js`: `402bb5506fdf26b4b3a25a47617ed628f9dbad67f6f9673bc0ab4f8d2d034500`
- `tools/bench/full-frame.mjs`: `2bf556b443cd64df6b4d743ec45e11dc382e6a9014083054472ddb39919d37c9`
- `tools/bench/browser.mjs`: `90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9`

raw JSON SHA-256:

- `baseline-special-full-hall-medium-desktop-sync.json`: `0035ccf68f9f782b4fc1761519ed44c705b46e8d4af3b22e1df6dd2abf420176`
- `candidate-special-full-hall-medium-desktop-sync.json`: `f4ae3fa3e10e3a1c178daca062dfed9e253812027b02a2a7f2f819bd6e3464d8`
- `baseline-special-full-sphere-medium-desktop-sync.json`: `ba85245a45c0e8afb4bd10b06149995f758591441ee3163e6598d95ca32f30df`
- `candidate-special-full-sphere-medium-desktop-sync.json`: `f63ac4fbedaa9bf731ad0000b4ef93562f5a279412f8b2517d24ad97b08e72b7`

20 PNG의 **실제 절대 경로·파일명·개별 SHA-256·파일 크기**, 각 비교 결과의 전후 순서는 동반 `special-visual-summary.json`의 `inputs` 및 `pairs`에 모두 저장했어. PNG 이름은 `baseline-special-full-<venue>-medium-desktop-sync-<scenario>.png`와 대응하는 `candidate-special-...png`야. 원본을 전달받은 뒤 파일 SHA를 대조하면 경로가 달라져도 같은 입력인지 확인할 수 있어.

비교 정의는 alpha를 검정 위에 합성한 8-bit encoded RGB이며 선형광 변환·크기 조절·정렬·crop 없이 전 화면을 사용해. MAE/RMSE 단위는 0..255 채널값이야. SSIM은 RGB별 7×7 uniform 창, sample covariance 49/48, K1=.01/K2=.03, dataRange255, 외곽3px를 제외한 valid window와 채널 평균이야.

아래처럼 같은 도구로 개별 쌍을 재현할 수 있어(개발용 Python Pillow와 NumPy 필요):

```bash
python3 tools/bench/compare-images.py \
  /workspace/scratch/25707ad85ea4/verification/special/render/baseline-special-full-sphere-medium-desktop-sync-peaks.png \
  /workspace/scratch/25707ad85ea4/verification/special/render/candidate-special-full-sphere-medium-desktop-sync-peaks.png \
  --output /tmp/special-peaks-visual.json
```

10쌍 전체를 재계산하려면 아래 입력 디렉터리를 원본 PNG의 위치로 바꾸고 저장소 루트에서 실행해. 출력은 재계산용 별도 디렉터리에 생겨.

```python
import pathlib, subprocess, sys
raw = pathlib.Path('/workspace/scratch/25707ad85ea4/verification/special/render')
out = pathlib.Path('/tmp/special-visual-recheck')
out.mkdir(exist_ok=True)
scenes = {'hall': ['foyer', 'rotate', 'effects-show'],
          'sphere': ['dome', 'peaks', 'ocean', 'clouds', 'reveal', 'rotate', 'effects-show']}
for venue, names in scenes.items():
    for name in names:
        suffix = f'special-full-{venue}-medium-desktop-sync-{name}.png'
        subprocess.run([sys.executable, 'tools/bench/compare-images.py',
                        str(raw / ('baseline-' + suffix)), str(raw / ('candidate-' + suffix)),
                        '--output', str(out / f'{venue}-{name}.json')], check=True)
```

## 남은 제한

실물 PC·Android·iOS·하드웨어 GPU, 높은 해상도, 장시간 시청의 검증 결과가 아니야. 효과 장면은 제어한 burst와 광선 시점이며 실제 피날레 전 구간이 아니야. 단일 PNG에서는 시간적 깜빡임·큐브맵 면 경계의 이동 중 안정성·재생 동기화·음질을 평가할 수 없어. 이번 10쌍은 해당 고정 medium 장면에서 시각 구조와 효과 보존의 추가 근거로만 사용해.
