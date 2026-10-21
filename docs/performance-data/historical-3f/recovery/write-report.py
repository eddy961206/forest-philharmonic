#!/usr/bin/env python3
"""strict 집계의 숫자를 그대로 사용해 과거 3f 전용 보고서를 작성해."""
import json
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo-root', type=Path, required=True)
ROOT = parser.parse_args().repo_root.resolve()
DATA = ROOT / 'docs/performance-data/historical-3f'
summary = json.loads((DATA / 'analysis/summary.json').read_text())
visual = json.loads((DATA / 'analysis/visual-metrics/summary.json').read_text())
rows = summary['rows']
base = 'performance-data/historical-3f'
out = []
def put(s=''):
    out.append(s)
def f(x, digits=1):
    return '미측정' if x is None else f'{x:,.{digits}f}'
def pair(r,key,digits=1):
    return f"{f(r['before'].get(key),digits)} → {f(r['after'].get(key),digits)}"
names = {'front':'무대 가까이','wide':'객석 전체','mid':'중앙 객석','rotate':'이동·급회전','broadcast':'무대 중계','dome':'일반 돔 AURORA','forest':'FOREST3D','peaks':'PEAKS3D','crossfade':'FOREST → PEAKS 전환','reveal':'ARCH → FOREST 공개 연출','effects-show':'폭죽·색종이·활성 빔'}
venues = {'hall':'숲속 홀','sphere':'스피어'}
devices = {'desktop':'데스크톱 viewport','mobile':'모바일 viewport 에뮬레이션'}

put('''# 이전 세션 복구 결과 — 기준 main 3f1655b 전용

**이 보고서는 광장 추가 이전 `main@3f1655b0c035a630adbcfbf19582dd9363386f34`과 당시 통합 후보의 측정이야. 최신 main·광장 통합본의 측정으로 읽으면 안 돼.** 끊긴 세션이 남긴 원본을 변경하지 않고 다시 집계했어. 새 브라우저 실행 없이 기존 결과 파일을 검증·복구한 작업이야.

복구한 42개 렌더 실행은 21쌍 모두 계획·소스·장면 조건 검사에 통과했어. 홀 high의 무대 근접 시점은 평균 동기 완료 시간 2,480.8 → 1,709.8ms, 약 31.1% 줄었고, 스피어 high의 중계는 1,974.1 → 1,707.4ms, 약 13.5% 줄었어. 반대로 스피어 medium의 3D 세계 전환은 1,694.2 → 1,773.7ms로 약 4.7% 길어졌어. 모든 장면이 빨라졌다는 결과는 아니야.

이 수치는 Chromium/SwiftShader의 동기 완료 시간이야. 실제 PC·스마트폰의 평균 FPS나 GPU 프레임 시간이 아니야. 자동 품질에서 해상도가 달라진 결과도 아래에서 따로 구분했어.

## 1. 버전·무결성·원본 위치

| 구분 | 고정된 근거 |
| --- | --- |
| 기준선 | `3f1655b0c035a630adbcfbf19582dd9363386f34` |
| 원래 후보 라벨 | `3f-integrated-candidate`; 측정 당시 미커밋 통합 worktree였어. 원시 JSON의 라벨을 새 SHA로 바꾸지 않았어. |
| 복구한 후보 커밋 | `2a627fa56f45055ce9b51811f2a2bce2d152bb40` |
| 후보 복구 검증 | 당시 source-manifest의 제품·테스트 53개 파일이 복구 커밋과 모두 같은 SHA-256이야. 기준선 53개 경로의 존재 여부·내용과 frozen 도구 15개도 모두 일치해. |
| 렌더 실행 기록 시각 | 2026-10-21 16:26:01 ~ 17:39:05 KST, 원본 실행 상태 기록 기준이야. |
| 원본 실행 수 | 42개 결과 JSON / 전후 21쌍 / 고정 품질 61개 비교 행 / auto 2개 비교 행 |
| 단위 테스트 | 당시 9개 테스트 파일을 case가 드러나는 TAP 방식으로 별도 실행했고 총 69개 case가 통과했어. 처음의 파일 단위 9개 PASS 로그도 삭제하지 않았어. |

근거 파일은 [초기 source-manifest](performance-data/historical-3f/source-manifest.json), [복구 커밋과의 일치 검사](performance-data/historical-3f/recovery/candidate-recovery-check.json), [원본 전체 233파일 목록](performance-data/historical-3f/original-inventory.json), [보존본 SHA-256 manifest](performance-data/historical-3f/manifest.json), [strict 집계 JSON](performance-data/historical-3f/analysis/summary.json), [전체 고정 품질 CSV](performance-data/historical-3f/analysis/summary.csv)야.

Git에는 원본 비이미지 107개와 대표 이미지 6쌍만 복사했어. 전체 126개 PNG의 해시는 원본 목록에 있고, 저장하지 않은 이미지 114개는 별도 전체 증거 압축본에서 같은 `qa-3f/render/` 경로로 찾아야 해. 이미지 지표는 보존 여부와 관계없이 전체 63쌍을 다시 계산했어.

## 2. 측정 환경과 비교 계약

| 항목 | 조건·해석 |
| --- | --- |
| 브라우저 | Chromium `153.0.8010.0`, Playwright `1.64.1`, Linux x64, headless |
| 렌더러 | ANGLE Vulkan / SwiftShader Device (Subzero), 물리 GPU 실측이 아니야. |
| 데스크톱 설정 | viewport 640×360, DPR 1 |
| 모바일 설정 | viewport 390×844, DPR 2, Android UA·터치 에뮬레이션. 실제 휴대폰·태블릿이 아니야. |
| 화면 품질 | 수동 high·medium·low는 각 프리셋으로 새 context에서 시작했고 모든 측정 표본의 renderScale은 1이야. 실제 내부 pixel ratio는 원시 meta에 별도로 기록돼. |
| 난수 | 관객 seed 417, 절차적 난수 seed 417, UUID seed 874 |
| 장면 | `beethoven-ode-to-joy`, 관객 fill 0.8, 연주자 전원을 무대에 고정한 스트레스 fixture |
| 음악 시각 | 보통 25초, 중계 5초에서 시작해 표본마다 1/60초씩 진행해. 실제 음표 예약은 꺼져 있어. |
| 카메라·시야각 | 시나리오별 위치·방향 고정, FOV 64도. rotate만 정해진 프레임 순서로 움직여. |
| 상태 | `asleep=false`, `visibility=visible`을 표본마다 확인해. 독주회 전용 6석을 일반 관객 배치 대상에서 제외했어. |
| 폰트 | 전후 모두 같은 로컬 폰트 경로를 사용했어. |
| 동기 측정 | 각 장면 준비 4프레임 + 측정 6프레임. 전체 `frame()` 실행 후 1×1 `readPixels` 완료를 기다린 벽시계 시간이야. |
| rAF 측정 | readback 없이 네이티브 rAF callback 시작 사이 간격 100개. auto는 120개야. |
| 계측 범위 | 연주자·관객·그림자·돔·중계·후처리를 포함한 전체 시각 프레임. UI는 캡처에서 숨겨. |

**평균 동기 완료 ms를 역수로 바꿔 FPS라고 쓰지 않았어.** 6표본의 p95·p99는 가장 긴 표본 하나와 같으므로, 장기 꼬리 지연이나 안정적인 1% Low의 근거가 아니야. rAF 평균 FPS는 `1000 / 평균 간격`, 1% Low는 느린 상위 `ceil(n×0.01)`개 간격 평균의 역수야. 100표본의 1% Low는 가장 긴 한 간격에 크게 좌우돼.

CPU 메인 스레드 사용률·순수 GPU 프레임 시간·GPU 메모리 bytes·발열·배터리 소모·실제 출력 오디오 글리치는 이 렌더 자료에서 미측정이야. `gpuTimer: true`는 확장 존재 여부만 뜻해. 원시 자료의 JS 제출 시간·CDP 누적 스냅샷을 CPU 점유율로 바꾸지 않았어. texture·geometry는 개수이며, JS heap은 장면 마지막 스냅샷이야. peak 메모리나 장기 누수 검사로 해석하면 안 돼.

high→medium/low로 실행 중 바꾸면 후보의 cube target이 실제로 resize되는 반면 기준선은 이전 크기를 유지해. 그때의 비용·선명도 변화는 다음 고정 품질 표에 넣지 않았어. 처음부터 low로 시작한 경로는 기존처럼 Lite이고, 스피어 3D 세계는 원래의 경량 표현으로 치환돼.

## 3. A — 같은 수동 품질의 시각 프레임 비교

변화율은 `(후 / 전 - 1) × 100`이야. 음수면 이번 표본에서 완료 시간이 짧아졌어. 각 표의 원시 JSON에는 p50·p95·p99, 모든 개별 표본, 카메라, geometry·texture 개수와 함수별 제출 시간이 있어.
''')

for device in ['desktop','mobile']:
    for venue in ['hall','sphere']:
        for quality in ['high','medium']:
            group=[r for r in rows if r['label']=='baseline' and r['device']==device and r['venue']==venue and r['quality']==quality]
            put(f"### {venues[venue]} · {quality} · {devices[device]}\n")
            put(f"원본 [전]({base}/render/{group[0]['beforeFile']}) / [후]({base}/render/{group[0]['afterFile']}); 각 장면 n=6.\n")
            put('| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |')
            put('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
            for r in group:
                put(f"| {names[r['scenario']]} | {pair(r,'meanMs')} | {pair(r,'p95Ms')} | {r['meanChangePercent']:+.1f}% | {pair(r,'calls')} | {pair(r,'triangles',0)} | {pair(r,'lastHeapMiB')} |")
            put()

put('''## 4. A — low의 rAF 간격 관찰

이 표의 FPS는 통제 fixture를 실행하는 네이티브 rAF callback의 관측 빈도야. 원래 앱의 오디오·입력·네트워크까지 함께 사용한 실기기 FPS와 같다고 볼 수 없어. 각 장면 준비 4프레임, rAF 간격 100개를 수집했어. 같은 실행 안의 front·wide·rotate를 독립적인 반복 실험으로 세지 않아.
''')
for venue in ['hall','sphere']:
    for device in ['desktop','mobile']:
        group=[r for r in rows if r['label']=='baseline' and r['venue']==venue and r['device']==device and r['quality']=='low']
        put(f"### {venues[venue]} · low · {devices[device]}\n")
        put(f"원본 [전]({base}/render/{group[0]['beforeFile']}) / [후]({base}/render/{group[0]['afterFile']}).\n")
        put('| 장면 | 평균 rAF FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | Draw calls 전 → 후 | Triangles 전 → 후 | 마지막 JS heap MiB 전 → 후 |')
        put('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
        for r in group:
            put(f"| {names[r['scenario']]} | {pair(r,'observedRafFps',2)} | {pair(r,'onePercentLowRafFps',2)} | {pair(r,'p95Ms')} | {pair(r,'calls')} | {pair(r,'triangles',0)} | {pair(r,'lastHeapMiB')} |")
        put()
put('''### low 중계: 준비 시간을 늘린 별도 실행

low 중계는 원래 프레임 주기가 길어서 처음 켜진 순간과 갱신이 안정된 뒤를 구분했어. 아래는 별도 `steady` 실행이며 준비 100프레임 뒤 rAF 간격 100개를 수집한 결과야. 앞 표와 합쳐 하나의 개선율을 만들지 않았어.
''')
put('| 공연장·기기 | 평균 rAF FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | Draw calls 전 → 후 | Triangles 전 → 후 |')
put('| --- | ---: | ---: | ---: | ---: | ---: |')
for r in rows:
    if r['label']=='baseline-steady':
        put(f"| [{venues[r['venue']]} · {r['device']}]({base}/render/{r['beforeFile']}) | {pair(r,'observedRafFps',2)} | {pair(r,'onePercentLowRafFps',2)} | {pair(r,'p95Ms')} | {pair(r,'calls')} | {pair(r,'triangles',0)} |")
put('''
## 5. 반복·악화·검사 범위의 한계

후보→기준 순서로 실행한 high 재관찰은 아래와 같아. 처음의 긴 장면 시퀀스와 준비 상태가 같지 않으므로, 각 재관찰 내부의 전후 쌍끼리 비교했어. 이전 결과를 이 결과로 덮어쓰지 않았어.
''')
put('| 공연장·장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 |')
put('| --- | ---: | ---: | ---: |')
for r in rows:
    if r['label']=='baseline-repeat':
        put(f"| [{venues[r['venue']]} · {names[r['scenario']]}]({base}/render/{r['beforeFile']}) | {pair(r,'meanMs')} | {pair(r,'p95Ms')} | {r['meanChangePercent']:+.1f}% |")
put('''
홀 근접 시점은 최초 high -31.1%, 역순 재관찰 -27.7%로 같은 방향이었어. 스피어 FOREST3D는 최초 -1.6%였지만 재관찰 +1.6%여서 이 경로가 확실히 빨라졌다고 말할 근거는 약해.

최초 행렬에서 평균 시간이 늘어난 조건을 빠짐없이 적으면 다음과 같아. 짧은 표본·소프트웨어 렌더러 변동도 섞이므로 이 목록만으로 원인을 특정하지 않아.
''')
for r in rows:
    if r['label']=='baseline' and r['meanChangePercent']>0:
        put(f"- {r['venue']} / {r['quality']} / {r['device']} / {r['scenario']}: {r['meanChangePercent']:+.1f}%")
put('''
계획의 첫 smoke는 홀 low / front 6표본, 177.2 → 147.5ms였어. 준비·도구 확인 자료로 보존하고 위 주 비교와 합산하지 않았어. strict 집계에는 제외된 전후 쌍이 없었어. 이것이 모든 기능 검사가 실행·성공했다는 뜻은 아니야.

**이 3f 계획에는 foyer가 없어.** 로비를 향한 시야, 광장 구매·티켓 입장, 실제 장시간 관람, iOS Safari·Android Chrome 실기기·Edge 검증은 이 묶음으로 증명할 수 없어.

## 6. B — 자동 품질 별도 관찰

두 실행은 각각 rAF 간격 120개이며 내부 해상도가 변했어. 전후 마지막 프리셋은 low지만 최종 renderScale은 기준 0.85, 후보 0.60이야. 아래 FPS 차이를 동일 선명도의 최적화 성과로 계산하면 안 돼. 시작 준비와 품질 전환 비용이 포함돼 있고, 발열 뒤 회복이나 물리 GPU에서의 장기 안정성을 관측한 자료도 아니야.
''')
put('| 공연장 · 모바일 에뮬레이션 | 평균 rAF FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | p99 간격 ms 전 → 후 | 최종 scale 전 → 후 |')
put('| --- | ---: | ---: | ---: | ---: | ---: |')
for r in summary['adaptive']:
    put(f"| [{venues[r['venue']]}]({base}/render/{r['beforeFile']}) | {pair(r,'observedRafFps',2)} | {pair(r,'onePercentLowRafFps',2)} | {pair(r,'p95Ms')} | {pair(r,'p99Ms')} | {pair(r,'finalScale',2)} |")
put('''
홀의 평균 FPS는 높아졌지만 p95는 303.8 → 368.2ms로 나빠졌어. 스피어의 평균 FPS와 p95는 좋아졌지만 1% Low는 1.6573 → 1.6388, p99는 601.6 → 610.0ms로 나빠졌어. 평균 향상으로 꼬리 지연 악화를 덮지 않았어.

## 7. 시각적 품질 비교

같은 프리셋·카메라·FOV·곡 시각·관객 상태·해상도·장면 순서의 전체 캡처 63쌍을 원본 `compare-images.py`로 다시 비교했어. 61개 수동 품질 쌍 중 47개는 PNG bytes와 RGB가 모두 같았고, 14개는 차이가 있었어. 이 61쌍에는 smoke·repeat·steady가 포함돼 있으므로 독립적인 61개 실험의 성공률로 표현하지 않아.

수동 품질 전체에서 최소 SSIM은 0.997345476, 최대 RGB MAE는 0.099224537/255였어. 크기가 작다는 지표만으로 품질 PASS를 선언하지 않아. 대표 6쌍을 실제로 나란히 확인했을 때 무대·동물·관객·난간·돔의 구조나 숲의 공간감이 사라지는 차이는 보이지 않았어. 이 중 FOREST와 crossfade 두 쌍은 돔 내부에 미세한 픽셀 차이가 있었고, 나머지 네 쌍은 bytes가 같았어.

셰이더가 같아도 프록시 geometry의 보간·반올림과 render order가 바뀔 수 있어. 이번 집계에서는 변경을 하나씩 분리해 차이의 단독 원인을 입증하지 않았고, 모든 차이를 자연적 애니메이션 변화로 간주하지 않았어.

### Git에 보존한 대표 6쌍
''')
selected=json.loads((DATA/'original-inventory.json').read_text())['selectedPngPairs']
put('| 장면 | 전 / 후 원본 | RGB MAE | SSIM | 변경 픽셀 % |')
put('| --- | --- | ---: | ---: | ---: |')
for stem in selected:
    r=next(p for p in visual['pairs'] if p['before']==f'baseline-{stem}.png')
    put(f"| {stem.replace('full-','').replace('-desktop-sync-',' / ')} | [전]({base}/render/{r['before']}) / [후]({base}/render/{r['after']}) | {f(r['mae'],6)} | {f(r['ssimUniform7'],9)} | {f(r['changedPixelPercent'],3)} |")
put('''
### 수동 품질에서 RGB가 달랐던 모든 쌍

다른 47쌍은 RGB MAE 0 / SSIM 1이야. 상세 원본 파일명·해시·SSIM 정의는 [전체 이미지 집계](performance-data/historical-3f/analysis/visual-metrics/summary.json)에 있어.
''')
put('| 원본 이미지 라벨 | RGB MAE | SSIM | 변경 픽셀 % |')
put('| --- | ---: | ---: | ---: |')
for r in visual['pairs']:
    if not r['rgbExact'] and not r['automaticQuality']:
        put(f"| [{r['before'].removesuffix('.png')}]({base}/analysis/visual-metrics/{r['metrics']}) | {f(r['mae'],6)} | {f(r['ssimUniform7'],9)} | {f(r['changedPixelPercent'],3)} |")
put('''
auto 두 쌍은 위 수동 비교와 따로 봐야 해. 홀 SSIM 0.869159, 스피어 0.954332이고, 내부 해상도 차이가 있는 영상이야. 후보의 계단·세부 선명도 변화까지 포함하므로 동일 품질 보존의 근거로 쓰지 않았어.

SSIM은 8-bit RGB, alpha를 검정에 합성, 7×7 균일 창, K1=.01, K2=.03, data range=255, 표본 공분산 49/48, 가장자리 3px 제외, RGB 채널 평균이야. 자동 정렬·리사이즈·선형광 변환은 하지 않았어.

## 8. 기능·음향·로딩 검사와 분리한 범위

| 항목 | 이 3f 묶음에 실제 남아 있는 근거 |
| --- | --- |
| 렌더 행렬 | 42개 raw와 종료 상태 42개, 전부 exit 0 / PASS. 엄격한 전후 조건 비교도 완료했어. |
| 단위 테스트 | [case별 TAP 결과](performance-data/historical-3f/node-tests/case-tap/results.json)와 로그에서 9개 파일 69개 case 통과를 확인했어. |
| 소스 통합 검토 | [runtime integration review](performance-data/historical-3f/runtime-integration-review.md)와 source review JSON. 정지한 listener에서 새 로비 음원이 생길 때 캐시가 갱신되지 않던 문제를 수정한 이력이야. |
| 공연 의식 도구 | `rituals.mjs`의 문법·도움말 로그가 있어. 실제 브라우저의 공연 의식 PASS가 아니야. |
| 기능·음향·로딩·방 검증 | 실행 계획과 frozen 도구는 있지만 이 qa-3f 디렉터리에 대응하는 실제 실행 결과는 없어. 계획을 실행 완료로 바꾸지 않았어. |
| 과거 a41의 pause→seek→resume 실패 | 다른 기준 버전의 실패 이력이야. 이 3f 렌더 PASS나 단위 테스트 PASS로 해결됐다고 주장하지 않아. |

렌더 fixture는 실제 AudioEngine을 만들지만 음표 스케줄러를 끄고 합성 연주 시계를 사용해. 이 자료로 실제 음질·음표 정확성·박수 PCM·장시간 오디오 글리치를 검증했다고 말할 수 없어. 소스가 동일하다는 사실과 실제 출력 청취 검사는 서로 다른 근거야.

## 9. 원본 그대로 다시 집계하는 방법

브라우저를 재실행할 필요 없이 Git에 포함된 42 JSON을 검증할 수 있어. 저장소 root에서 다음을 실행해. `--output-root`는 원본 밖의 새 폴더로 지정해.

```bash
node docs/performance-data/historical-3f/collect-summary.mjs \
  --qa-root docs/performance-data/historical-3f \
  --tools-root docs/performance-data/historical-3f/bench-source \
  --output-root /tmp/forest-historical-3f-reanalysis
```

예상 요약은 `status=PASS`, `expectedPairs=21`, `completedPairs=21`, `rows=61`, `adaptive=2`, `excluded=[]`이야. comparator와 browser helper 해시, 원시 입력 해시, served 제품 7파일 해시를 대조해. 결과를 읽는 동안 원본이 바뀌지 않았는지도 다시 확인해.

대표 이미지 한 쌍은 Pillow·NumPy가 설치된 Python으로 다음처럼 비교해. 전체 63쌍을 재집계하려면 전체 증거 압축본의 qa-3f를 먼저 풀어야 해. Git에는 6쌍만 있어.

```bash
python3 docs/performance-data/historical-3f/bench-source/compare-images.py \
  docs/performance-data/historical-3f/render/baseline-full-sphere-high-desktop-sync-forest.png \
  docs/performance-data/historical-3f/render/after-full-sphere-high-desktop-sync-forest.png \
  --output /tmp/forest-historical-3f-forest-image.json

python3 docs/performance-data/historical-3f/recovery/compare-3f-images.py \
  --qa-root /path/to/unpacked/qa-3f \
  --output-root /tmp/forest-historical-3f-all-images
```

실제 PC에서 새로 렌더하려면 기준 `3f1655b`와 복구 후보 `2a627fa`를 서로 다른 worktree·포트에서 실행하고 frozen `bench-source/full-frame.mjs`를 양쪽에 똑같이 사용해. 원래 [render-plan](performance-data/historical-3f/render-plan.json)의 품질·기기·장면 순서·준비 수·표본 수를 유지하되 절대 경로와 포트만 현재 환경으로 바꿔야 해. 최신 제품을 검증하려면 그 최신 기준 SHA와 후보 SHA를 별도로 고정하고 결과 디렉터리를 새로 만들어야 해.

원본의 `--single-process`, `--disable-web-security`, SwiftShader 등 컨테이너 전용 브라우저 인자를 실제 PC의 기본 검사에 무조건 복사하면 안 돼. 실제 GPU가 선택됐는지 확인하고, 전후 두 실행 안에서는 브라우저 버전·인자·화면·전원 조건을 같게 유지해. 자세한 Windows/macOS/Linux 실행 절차는 [PC 재현 안내](reproduce-on-pc.md)를 함께 봐 줘.

원본 3f 전체 행렬을 복구한 기록과 최신 main 통합본의 재검증 결과는 끝까지 별도 자료로 유지해야 해. 이 보고서의 수치·버전 라벨·실패 범위를 최신 실행 결과로 덮어쓰면 안 돼.
''')
(ROOT/'docs/performance-report-3f.md').write_text('\n'.join(out)+'\n')
print('wrote docs/performance-report-3f.md',len(out),'blocks')
