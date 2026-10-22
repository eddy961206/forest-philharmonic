# 최신 main의 돔 회전·전환 검증과 비교 도구 감사

최종 파일 검증은 **PASS**야. `summary.json/md`와 `image-pairs.json`은 원본 runtime-app 계획의 medium A/B만 선택한 결과야. 별도 `pixel-summary.json`은 그 검증을 통과한 15 PNG 쌍의 정량 비교와 직접 확인한 4쌍의 관찰을 담아. 과거 1f/dea, 기존 high/matrix 이미지 결과와 합치지 않았어.

## 원본과 선택 범위

- 기준 `e741811d1d7a040afcdd3a8230465980c64f82fc`, 후보 제품 `6c7817218814f00631089eb2c6f150d68190980f`야.
- 원본 `runtime-app-plan.json`의 index **14, 15**인 `baseline-dome-motion`, `candidate-dome-motion`을 선택했어. 원본 16 job 계획의 SHA-256 `1bc3e99ca2b2b7889b7b097a5d19667dd97f95c395bec26890071ac63c7d61f0`와 원래 014/015 로그 index·job 본문·collector 해시·종료 상태를 그대로 검증했어. 계획·로그·raw JSON·PNG를 재작성하지 않았어.
- 실제 파일은 `runtime-app/raw/{baseline,candidate}-dome-motion-sphere-medium-desktop.json`이야. 전체 runtime PNG는 34개, 그중 돔은 30개(15쌍)야.
- 환경은 Linux headless Chromium 153.0.8010.0·ANGLE SwiftShader, viewport 640×360, DPR 1이야. 요청과 관측 모두 medium, renderScale 1, pixelRatio 0.85, cube face 512×512를 유지했어.

## 확인한 상태와 호출

양쪽 각각 회전 28 step, reveal 5개 checkpoint×4회, crossfade 5개 checkpoint×4회로 **68표본**을 검증했어. 초기 warmup 2프레임은 별도야. 요구 cube face coverage는 양쪽 **249/249**가 유효했고, 요청한 face는 양쪽 모두 `0,1,2,4,5`였어. 여기서 유효란 같은 world/epoch에 정상 반환한 render 요청이 관측됐다는 뜻이야. 큐브 내부 proxy의 실제 draw 완료나 모든 픽셀의 신선도까지 증명하는 값은 아니야.

| 단계 | 표본 A/B | cube 요청 A/B | 관측 target A/B | renderer 호출 합 A/B | 삼각형 합 A → B |
|---|---:|---:|---:|---:|---:|
| rotation | 28 / 28 | 42 / 42 | 1 / 1 | 26,274 / 26,274 | 78,962,582 → 78,870,350 |
| reveal | 20 / 20 | 33 / 33 | 1 / 1 | 35,810 / 35,810 | 61,450,376 → 61,377,908 |
| crossfade | 20 / 20 | 33 / 33 | 2 / 2 | 36,743 / 36,743 | 61,436,976 → 61,364,508 |

호출 수가 같고 삼각형 차이는 요청 face마다 2,196개씩 줄인 proxy와 맞아. 가시 면 선택·시간 분산이 이번에 새로 더 줄었다는 근거는 아니야. 메인 카메라 돔 draw/program, target/face/mip/XR/viewport/scissor 복원, GL 오류·context loss, source 전후 해시 검사가 통과했어. reveal 끝은 양쪽 `FOREST3D`, crossfade 끝은 `PEAKS3D`이며 둘 다 mix=0·reveal=0·overlayVisible=false야.

**연속 4초 영상을 검사한 것이 아니야.** 고정 시각 0/25/50/75/100%를 직접 진행한 checkpoint이고 회전도 1/60초의 고정 step 28개야. 계측 포함 `completeMs`·`submitMs`·대기시간은 비교 도구에서 집계 제외했어. FPS나 성능 개선율로 해석하지 않아. 음표 스케줄러는 꺼져 있어 음질·오디오 경합 검사도 아니야.

## PNG 비교

기존 `compare-images.py`로 CPU에서 1.28초 만에 15쌍을 계산했어. crop·리사이즈·정렬 없이 전체 PNG, alpha 검정 합성, encoded 8-bit RGB, threshold 0을 사용했어. SSIM은 7×7 균일 창·표본 공분산 49/48·valid 창 평균이야. 3쌍은 바이트·픽셀 동일, 12쌍은 차이가 있어. 최저 SSIM은 **0.997233045**, 최대 MAE는 **0.129064/255**, 최대 RMSE는 **1.177237/255**야.

| checkpoint | SSIM | MAE / 255 | 변경 픽셀 비율 |
|---|---:|---:|---:|
| rotation-00 | 0.999760891 | 0.033352 | 6.652344% |
| rotation-07 | 0.999886125 | 0.015726 | 3.207899% |
| rotation-14 | 0.999998602 | 0.000391 | 0.108073% |
| rotation-21 | 0.999732860 | 0.018718 | 2.532118% |
| rotation-27 | 0.999478299 | 0.033413 | 4.507812% |
| reveal-0 | 1.000000000 | 0.000000 | 0.000000% |
| reveal-25 | 1.000000000 | 0.000000 | 0.000000% |
| reveal-50 | 1.000000000 | 0.000000 | 0.000000% |
| reveal-75 | 0.999911413 | 0.014758 | 3.792969% |
| reveal-100 | 0.999499715 | 0.038777 | 3.941406% |
| crossfade-0 | 0.999892496 | 0.017066 | 4.191840% |
| crossfade-25 | 0.999190295 | 0.045631 | 7.110243% |
| crossfade-50 | 0.997233045 | 0.129064 | 12.789062% |
| crossfade-75 | 0.999553252 | 0.101308 | 14.598090% |
| crossfade-100 | 0.999412040 | 0.118303 | 15.615885% |

`crossfade-50`, `rotation-27`, `reveal-50`, `reveal-100`의 원본 8장을 직접 확인했어. 숲·산·오로라·무대·객석의 큰 누락은 보이지 않았어. reveal-50 화면은 양쪽 같은 ARCH 표면이라 내부 전환 상태와 현재 시야의 노출을 구분했고, reveal-100에서는 실제 숲이 보이는 것도 확인했어. 모든 프레임·모든 GPU에서 완전한 픽셀 동일성을 검증한 것은 아니야.

## 비교 도구의 최소 호환 변경

기본 모드는 기존 high/medium A/B 4개 job을 계속 요구해. 새 `--job-ids ID [ID ...]` 모드는 원본 전체 계획에서 job을 선택하되 원래 index와 전체 계획 SHA를 유지해. `baseline`/`candidate` 정확한 label과 기존 `baseline-…`/`candidate-…` 형식을 모두 받아. 중복 원본 id·중복 선택·누락 id·품질별 한쪽 누락·다른 조건·다른 revision은 계속 실패해. high를 실행하지 않은 이번 선택을 high 성공으로 표시하지 않아.

기존 source-manifest의 형식은 그대로 쓸 수 있었지만 vendor/three 두 경로가 없어 별도 파생 manifest에 해당 Git blob의 SHA-256을 추가했어. 원본 manifest SHA는 `504b7dccaa999e723a740d2171e9a347bb663cd985f1debb0f56d7704ac898a9`, 파생본은 `f22e48c5f107de16ea932876ca737e21083032d35c60d2d8912956bced78b35d`야. 수집기가 기록한 15개 HTTP 소스만 직접 대조했어.

첫 실행은 `http://127.0.0.1:8381`과 브라우저가 기록한 `http://127.0.0.1:8381/`의 루트 slash 차이로 양쪽 `closedResult`가 FAIL이었어. 그 결과는 `first-url-format-rejection/`에 그대로 보존했어. 빈 루트 path와 `/`만 정규화하도록 비교 도구를 보완했고 host·port·비루트 path·query 차이는 계속 실패해. 원본 URL·계획·로그는 바꾸지 않았어. 새 디렉터리에서 재실행한 결과가 현재 PASS야.

구문/help·선택 모드/기본 모드·negative 검사 12개와 URL 경계 검사 4개를 실행했어. 두 단계의 도구 hash와 검사 결과는 `dome-motion-compat-checks.json`, `dome-motion-compat-url-checks.json`에 각각 남겨. 최종 비교 도구 SHA-256은 **`348237fc3337bb20bda25943f219b443ba52d2ab976a16d8a18b10afa4b59b05`**야. 실제 파일 비교 명령은 60초 상한 안에 완료됐고 PNG 비교도 별도 60초 상한 안에 완료됐어. 브라우저를 새로 실행하지 않았어.

제품 6c와 검증 도구 커밋 `7b07e15ea0a603ad24122588beb1b8c2c528eb51` 사이의 `public/`, `server/`, `server.js` 차이는 없었어. collector·fixture·helper·full-frame 참조 파일과 제품 dome3d/domeshow의 바이트 해시도 같았어. 수집기 해시는 `953ec414c17d02328dd3deb56e1832aa28602bf51bde67dfd8538892432a5bc1`이며, 이번 호환 수정은 수집 완료 후 비교 도구에만 적용했어.

## 재현 명령

이 파일 대조의 `--job-ids`는 브라우저 수집 이후에 추가한 옵션이야. 아래 명령은 이 PR 최신 `source` 작업 폴더의 비교 도구(SHA-256 `348237fc3337bb20bda25943f219b443ba52d2ab976a16d8a18b10afa4b59b05`)로 실행해. 브라우저 수집 제품 e741/6c와 runtime collector 7b의 고정 버전은 그대로 유지해.

원본 전체 plan·raw·logs와 파생 manifest가 있는 경로를 지정하고 저장소 루트에서 실행해. 출력 디렉터리는 새 이름이어야 해. 이미 존재하는 결과를 덮어쓰지 않아.

```sh
FP_VERIFY_ROOT=/path/to/verification
python3 tools/bench/compare-dome-motion.py \
  --plan "$FP_VERIFY_ROOT/runtime-app-plan.json" \
  --root "$FP_VERIFY_ROOT/runtime-app" \
  --manifest "$FP_VERIFY_ROOT/dome-motion-source-manifest.json" \
  --job-ids baseline-dome-motion candidate-dome-motion \
  --output "$FP_VERIFY_ROOT/dome-motion-summary-recheck"
```

`image-pairs.json`에서 eligible=true인 각 baseline/candidate 경로를 `tools/bench/compare-images.py`에 전달하면 픽셀 지표도 재계산할 수 있어. 최종 파일 검증 PASS는 위 범위의 기록·호출·조건 대조이고 실기기 FPS·연속 움직임·모든 픽셀의 신선도 판정은 아니야.
