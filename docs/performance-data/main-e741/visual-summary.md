# 최신 main e741 기준 시각 비교

**최신 `e741811`과 고정 후보 `6c78172`의 PNG 126개, 63쌍을 비교했어. 46쌍은 파일 바이트와 픽셀 모두 동일하고 17쌍에 차이가 있어.** 이 결과는 과거 1f/dea 비교와 별개야. 과거 결과를 합치거나 최신 결과로 바꾸어 표시하지 않았어.

## 범위와 동일 조건

- 기준 커밋: `e741811d1d7a040afcdd3a8230465980c64f82fc`
- 후보 커밋: `6c7817218814f00631089eb2c6f150d68190980f`
- 입력: `/workspace/scratch/25707ad85ea4/verification/{high,matrix}/render`의 baseline/candidate PNG. high 18쌍, matrix 45쌍이며 누락·남는 PNG는 없어. PNG 원본은 수정하거나 복사하지 않았어.
- 관련 실행 JSON 28개는 모두 PASS야. 대응하는 14개 실행쌍의 카메라·FOV·장면 순서·관객 seed·곡·합성 음악 시점·해상도·DPR·프리셋·renderScale·Lite 여부·수집기 해시·환경·fixture가 일치했어. 실행 전후의 나열된 source 해시도 안정적이야. 검사한 메타 필드·원본 JSON 해시·장면별 설정은 `visual-summary.json`에 남겼어.
- 관객은 최신 `planHouse`/`share` API를 사용하는 동일 fixture야. 기록된 전체 관객은 Hall 1,503명, Sphere 11,076명이야. 이는 모든 인원을 똑같은 geometry LOD로 그렸다는 뜻은 아니야.
- 환경은 Linux headless Chromium 153.0.8010.0·ANGLE SwiftShader, PC viewport 640×360, 모바일 viewport 390×844, DPR 1이야. 모바일은 데스크톱 브라우저의 viewport/UA·Lite 경로 시험이며 스마트폰 실기기 검증이 아니야. 모바일은 high도 기존 Lite 경로야.
- 모든 실행은 장면당 준비 2프레임·수집 4프레임 뒤의 캡처야. high desktop은 두 실행 순서가 포함되고 나머지 조합은 한 번씩이야. 실제 오디오 엔진은 만들지만 음표 스케줄러를 끄고 합성 음악 시계를 써.

## 정량 방법

기존 `tools/bench/compare-images.py`를 63쌍에 그대로 호출했어. 한 Python 프로세스에서 CPU로 6.47초 걸렸고 추가 브라우저·GPU 렌더는 하지 않았어. 비교 도구 SHA-256은 `328a65ef13b105dc593181c2a049401413374a09a8b4d54aa2100fa569e66eb4`야.

전체 이미지를 비교했고 crop·리사이즈·자동 정렬을 하지 않았어. PNG alpha는 검은 배경에 합성했고 8-bit encoded RGB를 사용했어. MAE/RMSE는 0~255 채널값 단위야. 변경 픽셀은 RGB 한 채널이라도 차이가 있는 경우(`threshold=0`)이므로 작은 반올림 차이도 포함해. SSIM은 RGB 채널별 7×7 균일 창, K1=.01, K2=.03, 표본 공분산 49/48, 가장자리 3px를 제외한 valid 창 평균이야. 수치 하나로 화질 통과·실패를 판정하지 않았어.

| 공연장 | 프리셋 | viewport 유형 | 비교 쌍 | 바이트·픽셀 동일 | 최저 SSIM | 최대 MAE |
|---|---|---|---:|---:|---:|---:|
| hall | high | desktop | 8 | 6 | 0.999919819 | 0.005048 |
| sphere | high | desktop | 10 | 6 | 0.999519751 | 0.053508 |
| hall | high | mobile | 4 | 2 | 0.999473708 | 0.031939 |
| hall | low | desktop | 4 | 3 | 0.966164168 | 1.388339 |
| hall | low | mobile | 4 | 3 | 0.866685050 | 5.362173 |
| hall | medium | desktop | 4 | 4 | 1.000000000 | 0.000000 |
| hall | medium | mobile | 4 | 3 | 0.999859605 | 0.005378 |
| sphere | high | mobile | 5 | 4 | 0.999958570 | 0.003629 |
| sphere | low | desktop | 5 | 4 | 0.925550531 | 1.767345 |
| sphere | low | mobile | 5 | 4 | 0.773431099 | 6.018889 |
| sphere | medium | desktop | 5 | 3 | 0.999619531 | 0.072073 |
| sphere | medium | mobile | 5 | 4 | 0.999971388 | 0.003084 |

전체 최저 SSIM은 0.773431099, 최대 MAE는 6.018889/255, 최대 RMSE는 21.628350/255, 최대 변경 픽셀 비율은 27.300097%야. 모두 같은 low mobile Sphere 중계 쌍에서 발생했어. **그 쌍과 나머지 low 중계 3쌍은 실제 중계 출력 내용이 달라.** 아래 판정처럼 이것을 단순 화질 손실이나 동일 화면의 성능 비교로 해석하면 안 돼.

그 4쌍을 제외한 59쌍의 최저 SSIM은 0.999473708, 최대 MAE는 0.072073/255야. 이 요약은 큰 기능적 차이와 작은 픽셀 차이를 구분하기 위한 것이며, 제외한 결과도 표와 JSON에 모두 남겼어.

## 원본 직접 확인

다음 8쌍의 원본 16장을 `view_image`로 직접 읽었어. Hall front/wide, Sphere forest/crossfade 및 데스크톱·모바일 각각 큰 차이 2쌍이 포함돼. 63쌍 전체를 육안 확인했다고 주장하지 않아.

| 직접 확인한 쌍 | SSIM | MAE | 관찰 |
|---|---:|---:|---|
| hall / high / desktop / front | 1.000000000 | 0.000000 | 무대·연주자·악기·근처 관객·좌석이 동일해. 바이트와 픽셀 모두 동일해. |
| hall / high / desktop / wide | 1.000000000 | 0.000000 | 샹들리에·발코니·전 객석·무대의 배치와 조명이 동일해. 바이트와 픽셀 모두 동일해. |
| sphere / high / desktop / forest | 0.999725958 | 0.017556 | 숲의 나무·깊이·바닥·무대·객석이 유지돼. 전체 구도에서 큰 디테일 손실은 보이지 않았지만 픽셀은 완전히 같지 않아. |
| sphere / high / desktop / crossfade | 0.999519751 | 0.053508 | 숲과 산·오로라가 겹치는 전환과 객석·무대가 유지돼. 세부 색·윤곽 차이의 원인은 이 비교만으로 분리하지 않았어. |
| sphere / low / desktop / broadcast | 0.925550531 | 1.767345 | 기준의 검은 IMAG 영역에 후보는 실제 무대 중계를 보여 줘. 같은 프리셋이지만 같은 영상 내용의 비교는 아니야. |
| sphere / low / mobile / broadcast | 0.773431099 | 6.018889 | 기준에서 검은 화면인 상단 중계 영역에 후보는 무대 영상을 보여 줘. 아래 무대·객석의 구도는 유지돼. 대체 한글 글리프는 양쪽 모두 보여. |
| hall / low / desktop / broadcast-return | 0.966164168 | 1.388339 | 기준의 검은 무대 위 스크린에 후보는 연주자·객석이 보이는 중계 영상을 보여 줘. 같은 프리셋이지만 같은 출력 내용이 아니야. |
| hall / low / mobile / broadcast-return | 0.866685050 | 5.362173 | 큰 차이는 검은 스크린과 즉시 표시된 중계 영상의 차이야. 실제 무대·악기·객석의 구도는 유지돼. 자막 일부 대체 글리프는 양쪽에 있어. |

## 성능 결과와 함께 읽을 때

Hall high front/wide에서는 전체 구도·관객·악기·발코니·조명을 유지한 동일 픽셀의 결과를 얻었어. Sphere high forest/crossfade는 픽셀이 완전히 같지는 않지만 직접 확인한 캡처에서 돔의 숲·산·오로라·깊이감·객석·무대가 사라지거나 크게 단순화된 모습은 없었어. 큐브 proxy의 수치 보간·렌더 순서·시간·폰트 중 무엇이 각 작은 차이를 만들었는지는 이 비교만으로 분리하지 않았어. 반복 high forest/crossfade는 두 실행 순서에서 각각 같은 차이 수치가 나왔어.

low 중계 4쌍은 요청한 프리셋·시나리오가 같지만, 기준은 검은 중계 영역이고 후보는 실제 영상을 즉시 보여 줘. 이는 중계 재활성화 때 촬영을 즉시 요청하는 후보 동작과 일치해. **동일 프리셋에서 출력 응답이 개선된 사례로 분류하되, 동일한 영상이 그려진 상태의 성능 이득이라고 계산하지 않아.** 최종 성능 표에서도 실제 출력 상태가 다르다고 밝혀야 해. 큰 차이를 단순한 자연스러운 애니메이션 차이라고 처리하지 않았어.

자막·shot의 일부 처리는 wall clock에 의존하므로 합성 음악 시점이 같다는 사실만으로 모든 애니메이션 픽셀이 같다고 보장할 수는 없어. 일부 한글 자막은 두 버전 모두 대체 글리프로 표시됐어. 이 headless system-font 환경에서 한글 폰트가 정상 표시된다고 검증한 것은 아니야.

이 비교는 고정 프리셋의 제한된 시점이야. 자동 품질의 전환·복원, 빠른 회전 중 모든 cube 면, 실제 재생의 음질·동기화, 실제 스마트폰과 Apple GPU, 장시간 발열과 메모리 안정성은 별도 검증이 필요해. 시각 품질과 성능 판정도 분리해. Sphere wide·forest의 완료시간 악화는 시각 결과가 유사하다는 이유로 사라지지 않아. 돔 renderOrder 변경의 early-Z 절약도 이 이미지 비교에서는 측정하지 않았어.

## 직접 재현하기

입력 PNG를 받은 경로를 `FP_COMPARE_ROOT`로 지정하고 저장소 루트에서 실행하면 돼. 비교 자체에는 앱 실행이나 GPU가 필요 없고 Python의 Pillow·NumPy가 필요해. 아래는 한 쌍의 예야.

```sh
FP_COMPARE_ROOT=/path/to/verification
python3 tools/bench/compare-images.py \
  "$FP_COMPARE_ROOT/high/render/baseline-a-full-sphere-high-desktop-sync-forest.png" \
  "$FP_COMPARE_ROOT/high/render/candidate-a-full-sphere-high-desktop-sync-forest.png" \
  --output /tmp/forest-visual-comparison.json
```

전체 쌍은 `visual-summary.json`의 `pairs[].before`와 `pairs[].after` 경로를 같은 도구에 전달하면 돼. JSON에는 각 원본 PNG의 SHA-256, 해상도, 시나리오, MAE/RMSE/SSIM, 변경 픽셀 수·비율을 모두 기록했어. 재검증할 때 캡처 원본을 먼저 그 해시와 대조하고, 같은 해상도와 threshold 0을 유지해.
