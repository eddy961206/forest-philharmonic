# 역사 캡처 280장 / 전후 140쌍 시각 비교

**범위는 main `1f8e5f16f1eee03140e13ba1ee66832841559604`와 후보 `dea7997c6278f10ff467815ab96b370362549b0c`야. 최신 `e741811` 통합본의 화질 검증으로 사용하지 않아.**

2026-10-22에 저장된 PNG만 읽어서 한 번 분석했어. 새 브라우저·GPU 렌더는 실행하지 않았어. `tools/bench/compare-images.py`를 같은 Python 프로세스에서 각 쌍에 한 번씩 호출했고 전체 정량 계산은 약 33초 걸렸어. 각 이미지 원본은 이전 경로에 그대로 두고 복사하지 않았어.

## 결과

- PNG 280장에 대응하는 전후 140쌍이 모두 있어. 누락된 counterpart는 없어.
- **96쌍은 PNG 바이트와 픽셀이 완전히 같아.** Hall 38/56쌍, Sphere 58/84쌍이 같아.
- 나머지 44쌍의 SSIM은 최소 0.799869, 전체 MAE 최대는 7.335114/255야. 차이율은 RGB 어느 한 채널이라도 1 이상 다르면 세기 때문에 작은 반올림 차이에도 높아질 수 있어.
- 최대 차이가 나온 low 모바일 중계에서는 기준선이 아직 검은 영상을 표시하고 후보가 실제 중계 영상을 표시했어. 이를 화질 저하나 완전 동등성으로 단순 판정하지 않아.
- 대표 5쌍과 최대 차이 2쌍을 육안 확인했어. 전체 140쌍을 모두 육안으로 검수한 것은 아니야.

| 공연장 | 프리셋 | 화면 | 비교쌍 | 바이트 동일 | 최소 SSIM | 최대 MAE |
|---|---|---|---:|---:|---:|---:|
| hall | high | desktop | 16 | 12 | 0.999168 | 0.036026 |
| hall | high | mobile | 8 | 5 | 0.996817 | 0.140672 |
| hall | low | desktop | 8 | 6 | 0.965755 | 1.416622 |
| hall | low | mobile | 8 | 4 | 0.799869 | 7.335114 |
| hall | medium | desktop | 8 | 6 | 0.999196 | 0.035069 |
| hall | medium | mobile | 8 | 5 | 0.997029 | 0.123337 |
| sphere | high | desktop | 24 | 10 | 0.996174 | 0.150007 |
| sphere | high | mobile | 12 | 11 | 0.989258 | 0.611649 |
| sphere | low | desktop | 12 | 11 | 0.935342 | 1.463064 |
| sphere | low | mobile | 12 | 10 | 0.824604 | 5.065197 |
| sphere | medium | desktop | 12 | 5 | 0.996807 | 0.128947 |
| sphere | medium | mobile | 12 | 11 | 0.989248 | 0.592311 |

## 대표 육안 확인

| 장면 (a 반복) | 해상도 | MAE | 변경 픽셀 % | SSIM | 관찰 |
|---|---|---:|---:|---:|---|
| hall-high-desktop-sync-front | 640×360 | 0.000000 | 0.000000 | 1.000000 | 무대·악기·연주자·객석 형상이 같고 픽셀도 완전히 같아. |
| hall-high-desktop-sync-wide | 640×360 | 0.000000 | 0.000000 | 1.000000 | 네 층 발코니·샹들리에·좌석·관객이 같고 픽셀도 완전히 같아. |
| hall-high-desktop-sync-broadcast-return | 640×360 | 0.036026 | 0.061198 | 0.999169 | 무대와 객석은 유지되고 중계 화면 안쪽에 작은 갱신 차이가 보여. |
| sphere-high-desktop-sync-forest | 640×360 | 0.035017 | 2.755642 | 0.998651 | 숲의 기둥·원근·지면·광원과 큰 객석·무대가 유지돼 보여. 미세한 픽셀 차이는 있어. |
| sphere-high-desktop-sync-crossfade | 640×360 | 0.069967 | 8.331163 | 0.998632 | 숲과 다음 세계가 겹쳐지는 구성·경계·객석·무대가 유지돼 보여. 미세한 픽셀 차이는 있어. |
| hall-low-mobile-sync-broadcast-return | 780×1688 | 7.335114 | 58.698277 | 0.799869 | 기준선의 중계는 검은 영상에 자막만 있고 후보는 실제 연주 영상이 보여. 즉시 재촬영 동작 차이가 커서 같은 영상의 화질 비교로 해석하지 않아. |
| sphere-low-mobile-sync-broadcast | 780×1688 | 5.065197 | 35.953184 | 0.824604 | 기준선은 돔 중계가 검은 영상과 일부 깨진 글리프로 남았고 후보는 연주 영상과 자막을 보여. 중계 밖에도 일부 작은 차이가 있어; 모든 차이의 원인을 단정하지 않아. |

## 방법과 재현

원본 경로: `/workspace/scratch/296fafc0af7f/verification/main-1f/fixed/render`.
전체 프레임, threshold=0, 8-bit RGB, alpha를 검정 배경에 합성, 크기 변경·정렬·보정 없음. SSIM은 RGB별 7×7 균일 창, sample covariance 49/48, K1=.01/K2=.03, data range 255, 가장자리 3px 제외 후 평균이야.

```sh
python3 tools/bench/compare-images.py \
  <원본경로>/baseline-a-full-hall-high-desktop-sync-front.png \
  <원본경로>/candidate-a-full-hall-high-desktop-sync-front.png \
  --output comparison.json
```

전체 쌍의 파일 이름·SHA256·해상도·MAE·RMSE·변경 픽셀·SSIM은 `visual-summary.json`에 있어. 모바일 결과는 에뮬레이션이며 실물 기기 결과가 아니야. SSIM만으로 시각 품질의 통과·실패를 판정하지 않아. 특히 중계 첫 촬영과 자막 폰트 갱신의 동작 차이는 같은 영상의 압축·해상도 차이와 구분해야 해.
