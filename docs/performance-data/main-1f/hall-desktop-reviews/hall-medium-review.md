# Hall medium 첫 A/B 독립 검토

완료된 **004 baseline-a / 005 candidate-a**, main `1f8e5f1` → 제품 `dea7997`의 desktop medium 한 쌍만 검토했어. **같은 품질에서의 SwiftShader 동기 완료 시간 비교이며 실제 PC FPS가 아니야.** 기존 high 검토는 보존했고 low·역순·다른 기기 결과를 이 문서에 채우지 않았어.

## 조건과 원본 확인

- 기준선 `1f8e5f16f1eee03140e13ba1ee66832841559604`, 후보 `dea7997c6278f10ff467815ab96b370362549b0c`, 수집기 기준 `cc0f9da70083b35818b0bca70487e0609d4609c4`야.
- 두 실행 모두 로그의 PASS / exit 0, 로그 텍스트 SHA-256, 계획 SHA-256과 job, raw 완료 상태·revision이 맞아. 검토 중 읽은 파일들의 마지막 크기·해시도 같았어.
- 12개 served source 경로의 전후 기록이 안정적이고 고정 제품 Git 객체·manifest와 일치해. 기준선 quality.js의 404도 원본에 파일이 없는 상태와 맞아. 수집기·fixture·browser helper 세 파일은 A/B 기록, 현재 파일, cc0f9da Git 객체의 SHA가 같아.
- 제품 manifest 전체는 49경로지만 이 raw가 HTTP 해시를 기록한 것은 12경로야. 나머지 37경로의 HTTP 내용을 이 검토에서 새로 확인했다고 하지 않아.
- Linux x64, Chromium 153.0.8010.0, Playwright 1.64.1, Headless SwiftShader, local fonts가 같아. viewport 640×360, 기기 DPR 1, renderer pixelRatio 0.85, medium / 실제 scale 1이 같아.
- 관객 1,531명, 좌석 1,885개, 일반 관객 대상 1,879개, 무대석 6개, Lite=false야. fill 0.8·seed 417, 곡·합성 시계·장면 순서·각 카메라 위치/target/FOV·효과 조건이 같아.
- 장면당 예열 4회와 수집 8표본이야. A/B 8장면의 128표본이 모두 visible / awake / medium / scale1 / WebGL error0 / context 유지 / readPixels 완료를 기록해. 초기 UI readiness는 READY이며 Hall의 돔 검사는 NOT_APPLICABLE이야.
- page/console error와 실패 요청은 없고 양쪽 ReadPixels stall 경고가 각각 4개야. UI는 숨기고 음표 scheduler는 끈 통제 fixture이므로 실제 UI 기능·음악 재생 통과로 계산하지 않아.

## 8개 장면의 시간·그리기량

모든 값은 A→B야. 시간 변화가 음수이면 감소, 양수이면 증가야. p95/p99는 n=8의 최대 표본 한 개이므로 장시간 tail 안정성을 증명하지 않아. 실제 FPS·1% Low FPS·GPU ms는 미측정이야.

| 장면 | sync 평균 ms | 평균 변화 | p95 ms | p95 변화 | 평균 calls | 평균 triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| front | 2139.72 → 1680.81 | -21.45% | 2313.60 → 1820.20 | -21.33% | 1714.500 → 1711.500 | 11699248.000 → 7413240.000 |
| wide | 7040.32 → 7100.65 | +0.86% | 7722.00 → 7436.70 | -3.69% | 1822.375 → 1822.375 | 11858282.250 → 11858282.250 |
| foyer | 12663.45 → 13283.07 | +4.89% | 12979.10 → 14020.60 | +8.02% | 1849.125 → 1849.125 | 11853193.750 → 11853193.750 |
| rotate | 3847.20 → 3622.34 | -5.84% | 5106.40 → 4835.20 | -5.31% | 703.125 → 743.500 | 11466992.875 → 9452091.875 |
| broadcast | 5196.97 → 4819.24 | -7.27% | 6839.50 → 6421.60 | -6.11% | 2025.750 → 1854.875 | 16018789.875 → 13181424.125 |
| broadcast-hidden | 163.03 → 173.34 | +6.33% | 168.50 → 194.60 | +15.49% | 600.000 → 600.000 | 382877.000 → 382877.000 |
| broadcast-return | 5198.58 → 4941.51 | -4.94% | 6930.20 → 6540.50 | -5.62% | 2032.125 → 1861.500 | 16020472.875 → 13190008.875 |
| effects-show | 4880.16 → 4712.56 | -3.43% | 8006.80 → 8404.50 | +4.97% | 1757.750 → 1774.750 | 11705850.000 → 9261786.000 |

front는 평균 −21.45%, p95 −21.33%이고 triangles는 11,699,248→7,413,240으로 줄었어. rotate·broadcast·broadcast-return·effects-show도 평균 완료 시간은 줄었어. **wide +0.86%, foyer +4.89%, broadcast-hidden +6.33%는 평균이 늘었고 그대로 남겼어.**

foyer는 p95도 +8.02%, broadcast-hidden은 +15.49%야. 이 두 장면과 wide의 calls/triangles는 A/B 동일해. 이 결과를 개선으로 바꾸거나 외부 부하 때문이라고 확정하지 않아. effects-show는 평균 −3.43%지만 p95 +4.97%여서 평균과 긴 프레임의 방향이 달라.

rotate는 calls 703.125→743.5로 +40.375(+5.74%), effects-show는 1757.75→1774.75로 +17(+0.97%)이야. 좌석 공간 배치에서 보이지 않는 인스턴스를 덜 제출하는 대신 draw가 늘 수 있다는 코드 구조와 부합하지만, 개별 pass를 분리한 실험은 아니므로 전체 변화의 단일 원인으로 확정하지 않아.

## CPU와 메모리

CDP delta는 각 장면의 8표본 수집 창 전체 값이야. TaskDuration에는 동기 드라이버 대기와 QA 작업이 포함될 수 있어 CPU 점유율이나 순수 CPU 실행 시간으로 바꾸지 않아.

| 장면 | Task delta ms | Script delta ms | ThreadTime delta ms | sample heap MiB | CDP after heap MiB | 마지막 textures / geometries |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| front | 17191.33 → 13475.23 | 20.140 → 1.902 | 215.210 → 210.089 | 391.006 → 391.006 | 22.072 → 21.898 | 98 / 1159 → 97 / 1143 |
| wide | 56370.42 → 56850.38 | 1.729 → 3.276 | 183.209 → 183.662 | 391.006 → 391.006 | 23.738 → 24.589 | 98 / 1202 → 97 / 1189 |
| foyer | 101338.26 → 106296.54 | 2.786 → 2.188 | 155.805 → 180.690 | 391.006 → 391.006 | 24.412 → 24.441 | 98 / 1211 → 97 / 1198 |
| rotate | 30800.67 → 29006.82 | 1.613 → 1.763 | 93.291 → 100.297 | 391.006 → 391.006 | 24.701 → 24.778 | 98 / 1233 → 97 / 1220 |
| broadcast | 41612.98 → 38583.45 | 1.757 → 1.934 | 170.693 → 183.938 | 391.006 → 391.006 | 25.064 → 25.496 | 99 / 1249 → 98 / 1236 |
| broadcast-hidden | 1316.57 → 1399.96 | 1.005 → 0.978 | 66.807 → 65.682 | 391.006 → 391.006 | 25.523 → 25.861 | 99 / 1249 → 98 / 1236 |
| broadcast-return | 41616.16 → 39567.54 | 1.768 → 1.737 | 152.656 → 163.960 | 391.006 → 391.006 | 25.348 → 26.028 | 99 / 1251 → 98 / 1238 |
| effects-show | 39085.95 → 37750.95 | 1.689 → 1.873 | 244.051 → 229.854 | 391.006 → 391.006 | 25.257 → 28.028 | 99 / 1269 → 98 / 1256 |

front의 ScriptDuration은 20.140→1.902 ms로 줄었지만 wide·rotate·broadcast·effects-show는 늘었어. ThreadTime도 foyer·rotate·broadcast·broadcast-return 등에서 늘었어. 단계별 메서드 시간, 제출 시간, 완료 대기, 6개 CDP delta를 JSON에 보존했으며 CPU 항목 전부가 좋아졌다는 결론은 내리지 않아.

performance.memory는 모든 표본에서 정확히 410,000,000 bytes(391.006 MiB)로 같아. 이 API에서는 절감이 관찰되지 않았어. CDP 종료 heap은 front만 줄고 나머지 7장면은 늘었으며 effects-show는 25.257→28.028 MiB야. CDP 수집 전후의 GC/시점 차이가 섞일 수 있으므로 둘 중 하나를 선택해 총 메모리 절감·누수라고 판정하지 않아. geometry/texture 수는 자원 개수이며 VRAM bytes가 아니야.

## PNG는 해시만 확인

새 이미지 디코딩·육안 보기·픽셀 비교·MAE/RMSE/SSIM 계산을 하지 않았어. 아래는 SHA-256 일치 여부야. 서로 다른 SHA만으로 RGB 픽셀이 다르다고 판단하지 않아.

| 장면 | PNG SHA-256 동일 | 추가 시각 검증 |
| --- | --- | --- |
| front | 예 | 미실행 |
| wide | 예 | 미실행 |
| foyer | 예 | 미실행 |
| rotate | 예 | 미실행 |
| broadcast | 아니오 | 미실행 |
| broadcast-hidden | 예 | 미실행 |
| broadcast-return | 아니오 | 미실행 |
| effects-show | 예 | 미실행 |

6쌍은 인코딩된 PNG 파일의 해시가 같아. broadcast와 broadcast-return은 서로 달라. high에서 자막 영역 차이를 관찰했던 사실을 medium의 픽셀 영역·원인 증거로 재사용하지 않아. medium의 정확한 차이는 모든 성능 측정이 끝난 뒤 별도 이미지 배치와 육안 검토로 확인해야 해.

## 배경 CPU 작업 가능성

- 기준선 실행: 2026-10-21 12:50:25.994632–12:59:06.507644 UTC.
- 후보 실행: 2026-10-21 12:59:06.508332–13:07:36.648499 UTC.
- 앞선 high 이미지 SSIM 계산의 기록은 exec chunk d5c0fa, 소요 2.294485258초야. 정확한 UTC 시작·종료는 기록되지 않았어.
- 그 작업 순서·파일 시각으로 확인 가능한 보수적 범위는 12:51:33.200617–13:01:38.633506 UTC라 두 실행 창에 걸칠 수 있어. 이 범위가 2.29초 작업 자체의 지속 시간을 뜻하는 것은 아니야.

어느 장면·표본에 실제로 겹쳤는지와 영향 크기는 확인되지 않았어. 이 때문에 좋아지거나 나빠졌다고 확정하지 않고, 전체 원본과 모든 행을 보존했어. 시간에서 2.29초를 빼거나 결과가 불리한 행만 제외하지 않아. 이번 독립 검토는 JSON 산술·텍스트/PNG 해시만 사용했고 브라우저/GPU·이미지 계산을 새로 실행하지 않았어.

## 근거와 검토 범위

- [독립 검토 JSON](hall-medium-review.json)에 입력 파일 해시, A/B 로그, 소스 Git 객체 대조, 개별 표본 수열, CPU/heap 변화, 카메라/clock, 체크 결과를 남겼어.
- 원본 staging은 `/tmp/forest-qa-1etnu01q/logs/004-baseline-a-hall-medium-desktop.{json,log}`, `005-candidate-a-hall-medium-desktop.{json,log}`와 `render/*-full-hall-medium-desktop-sync.json`이야. 개별 PNG와 완전한 경로는 JSON `inputs`에 있어.
- [고정 full-frame 수집기](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/full-frame.mjs), [통제 fixture](https://github.com/eddy961206/forest-philharmonic/blob/cc0f9da70083b35818b0bca70487e0609d4609c4/tools/bench/full-frame-fixture.js), [후보 seats.js](https://github.com/eddy961206/forest-philharmonic/blob/dea7997c6278f10ff467815ab96b370362549b0c/public/js/scene/seats.js)를 근거로 사용했어.

파일/조건/산술 체크 1,557개 중 실패 0개야. 브라우저 기능 테스트 개수가 아니므로 기존 75개 Node case나 UI PASS와 합산하지 않아. 실제 PC·스마트폰의 60/30FPS, 장시간 안정성·발열, 자동 품질 회복, 초기 로딩, 실제 음표·음질·멀티플레이 기능은 이 파일 검토의 대상이 아니야.
