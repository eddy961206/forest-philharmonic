# 두 공연장 성능 최적화와 검증 기록

> 이 문서는 `a41b7e4` 기준의 전체 측정 보존본이야. 이후 `3f1655b` 통합 결과는 [최종 성능 보고서](performance-report.md)에서 따로 다뤄. 아래 수치·실패·이미지는 당시 버전의 결과이며 새 main에 소급하지 않아.

이 보고서의 측정 기준은 main `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`이야. 이후 `3f1655b0c035a630adbcfbf19582dd9363386f34` 통합의 결과와 분리해서 보존해. 진행 중 추가된 이동·충돌·돔 셰이더·곡별 연주자 입퇴장을 통합한 뒤 이 기준으로 다시 측정했어. 홀과 Sphere의 실제 앱 코드를 수정하고, 같은 장면의 변경 전후 렌더링·이미지·기능을 비교했어. **고정 프리셋의 개선과 자동 화질 조절은 아래에서 따로 평가해.**

이번 실행 환경에는 물리 GPU가 없어서 Chromium의 ANGLE/SwiftShader를 사용했어. 이 결과는 실제 PC나 휴대폰에서 60/30FPS를 달성했다는 증거가 아니야. 하드웨어 GPU 시간·GPU 메모리·전력·발열, iOS Safari·실제 Android Chrome·Edge의 결과는 미측정이야. 재현 도구와 원시 표본을 함께 남겼으니 [실제 PC에서 재현하기](reproduce-on-pc.md)를 따라 기기별로 판단해 줘.

## 자료 안내

| 자료 | 확인할 내용 |
| --- | --- |
| [구조 조사와 변경 판단](architecture-audit.md) | 요청한 파일과 실제 호출 경로, 유지한 구조와 적용하지 않은 선택 |
| [실제 PC 재현 안내](reproduce-on-pc.md) | Windows PowerShell, macOS/Linux, 브라우저·GPU 조건, 전후 실행과 판단 순서 |
| [측정 방법](bench-method.md) | 도구별 명령, 카메라·시점·난수·표본 수, 시간과 이미지 지표 정의 |
| [런타임 검증](runtime-validation.md) | 오디오 Worker, 로딩, 재생, 멀티플레이의 실행과 근거 |
| [셰이더 실험](shader-experiments.md) | 적용하지 않은 후보, 출력 차이와 성능 악화까지 포함한 결과 |
| [검증 과정 기록](validation-log.md) | 기준선 고정, 계측 수정, 제외한 실행, 재측정과 판단 기록 |
| [실기기 기록 서식](pc-validation-template.md) | 하드웨어·전원·환경과 전후 원시 파일을 남길 서식 |

## 1. 확인한 병목과 적용한 변경

### 홀: 화면 밖 좌석까지 제출되던 비용을 줄였어

기존 좌석은 종류별로 큰 InstancedMesh에 묶여 있어서 일부만 보여도 그 묶음 전체가 렌더 대상이 됐어. 같은 의자 geometry·재질·색·배치를 유지하면서 층과 공간 셀로 나눴어. 전체 객석이 보일 때 작은 묶음 수만 늘어나는 문제는 카메라별 선택으로 보완했어. 한 종류의 작은 묶음이 **전부** 프러스텀에 들어올 때만 큰 묶음으로 그려서, 작은 묶음 기준보다 추가 좌석을 제출하지 않아.

무대 중계와 관객 카메라가 서로 다른 영역을 보므로 `scene.onBeforeRender`에서 해당 카메라로 선택해. fabric·frame·accent는 같은 instance matrix를 공유하고, 큰 묶음과 작은 묶음도 같은 geometry를 재사용해. 좌석 선택은 공간별 broad phase를 쓰되 원래 좌석 ID로 돌려줘서 앉기와 방 동기화의 식별자를 유지해.

`seats.js`, `hall.js`, `instance-batches.js`가 이 경로야. 홀 전체가 들어오는 시점은 컬링 이득이 제한적이고, 일부 시점에서는 draw call이 늘어나는 비용도 있어. 아래 표에 그 결과를 함께 남겼어.

### 공통 geometry: 디테일을 없애지 않고 인덱스를 보존했어

좌석의 중복 정점은 위치만 보지 않고 **모든 정점 속성이 정확히 같은 경우**만 공유해. hard normal·UV seam·색 경계를 유지해. 병합 도우미는 기존 인덱스를 펼쳤다가 다시 저장하는 일을 줄이고, 병합 과정의 임시 geometry를 정리해. 병합 대상 아래에 보존할 자식이 있을 때 parent를 지운 뒤 잃어버리던 경로도 수정했어.

관객은 이미 인스턴싱과 LOD가 적용돼 있었어. 이를 다시 설계하지 않고 원래 geometry의 인덱스를 유지했어. 85명 구조 검증에서는 full 일반 관객의 geometry 속성+인덱스 저장량이 **531,368 → 169,616 bytes**, 약 **68.1% 감소**했어. 펼쳐서 비교한 속성·행렬·색·좌석 점유·LOD 결과는 같고, 제출 삼각형 351,104개도 같아. 이 값은 해당 구조 fixture의 버퍼 합계이고 앱 전체 GPU 메모리가 아니야.

### 공통 렌더: 같은 프레임의 그림자와 중복 갱신을 재사용해

무대 중계 카메라와 관객 카메라는 같은 조명과 애니메이션을 봐. 프레임마다 그림자 맵을 한 번 갱신하고 두 렌더에서 사용하도록 했어. 연주자 Lite instance 동기화도 중계 촬영 전에 끝내서 두 카메라가 같은 프레임의 포즈를 보게 했어.

중계는 실제 촬영 프레임에만 카메라 변환·projection을 계산하고, 자막 픽셀이 바뀔 때만 canvas를 다시 그려. 처음 켜거나 숨겼다 다시 켤 때는 즉시 촬영해. low에서 기존 90프레임 주기를 기다리느라 검은 화면으로 시작하던 경우가 개선돼. 이 첫 화면 차이는 화질 회귀와 구분해.

환경 생성에 쓰고 남은 PMREM 생성기와 RoomEnvironment, 교체한 후처리 리소스도 정리해. 숨긴 탭에서는 시각 업데이트를 쉬고 오디오의 별도 시계는 유지해. 계측 카운터는 마지막 render 호출만이 아니라 그림자·돔·중계·후처리를 포함한 앱 프레임 합계로 바꿨어.

### Sphere: 기존 면 선택과 LOD는 유지하고, 덮이는 픽셀과 프록시 비용을 줄였어

기준 main에는 이미 13,845석의 인스턴싱·거리 LOD, 관객 LOD, 보이는 큐브 면 선택, 아래쪽 면 생략, 전환 중 세계 갱신 분산이 있었어. 이 기존 작업을 이번 PR의 성과로 계산하지 않아.

새 변경은 다음과 같아.

- opaque 구조물이 깊이를 기록한 뒤 돔을 그려, 가려진 돔 픽셀의 비싼 fragment shader 실행을 줄일 수 있게 했어. 투명 난간·빔의 순서는 유지해.
- 큐브맵 방향을 만드는 내부 프록시를 구에서 상자로 바꿨어. 면당 **2,208 → 12 triangles**이며 ray-marching shader와 반복 상한은 그대로야. 정규화 광선은 수학적으로 같지만 부동소수점 보간의 작은 차이는 실제 이미지에서 별도로 검사했어.
- high 큐브 해상도 640은 유지했어. 품질 전환 시 medium 512·low 384로 기존 render target을 실제 resize하고, 버려진 면을 stale로 표시해서 다시 보일 때 갱신해. **이 resize에 따른 화질·비용 변화는 동일 품질 개선으로 계산하지 않아.** 새로 low로 시작한 Lite 빌드는 기존처럼 3D 대신 경량 장면을 사용해.
- 보이지 않는 중계 때문에 추가 큐브 면을 요구하지 않게 했고, fade-out은 shader가 중계를 쓰는 마지막 구간까지 갱신해. render target·XR 상태는 예외가 나도 복원해.

이전 ec5 기준의 FOREST 탐색 종료, PEAKS 하늘 계산 지연, reveal 끝점 분기 후보는 따로 44개 case로 실험했지만 채택하지 않았어. 이 실험을 a41의 새 셰이더 성능이나 픽셀 동일성 근거로 재사용하지 않아. 출력 차이 또는 불안정한 이득·명확한 악화가 있었어. 원본과 실패한 후보도 [실험 자료](performance-data/shader-experiments/README.md)에 남겼어.

### 오디오: 음표와 음색을 유지하며 반복 작업을 줄였어

공간 음향 listener는 위치나 방향이 실제로 달라졌을 때만 AudioParam 목표를 다시 예약해. 정확한 값 비교를 써서 작은 이동을 임의로 생략하지 않아. 연주 시각 상태는 filter/map으로 새 배열을 만들던 부분을 원래 순서의 제자리 압축으로 바꿨어. 600프레임·33개 의자 fixture의 대상 배열 생성 **23,517 → 0**, 상태·이벤트 해시와 불연속 시간 이동 결과가 같아.

박수 합성은 같은 `crowd.js`를 module Worker에서 실행하고, 한 profile씩 PCM을 transfer해. 메인 스레드는 원래 형식의 AudioBuffer를 만들고, 입장 버튼을 열기 전에 준비 완료를 기다려. Worker 불가·CSP 차단·오류에는 원래 동기 합성으로 남은 profile을 완성해. 실제 브라우저의 정상 경로와 CSP fallback 모두 4종 PCM이 원본과 완전히 같았어.

악기 MP3·음악 JSON, 동시 발음·음표 선택·샘플 decode 형식·공간음향 필터·잔향·스케줄링 lookahead는 바꾸지 않았어. 기존 Lite의 207샘플/24kHz 정책도 이번에 더 낮추지 않았어. Worker 이동은 메인 스레드 점유를 줄이는 변경이며, 총 CPU나 peak 메모리·부팅시간의 감소를 자동 보장하는 변경은 아니야.

## 2. A — 고정 품질의 전후 비교

같은 호스트·브라우저·카메라·FOV·viewport·DPR·관객 seed·곡 시점·프리셋·장면 순서·업데이트 수를 사용했어. 각 프리셋은 새 브라우저 context에서 처음부터 해당 화질로 부팅했어. high로 시작한 뒤 medium/low로 전환하면 기준 main은 기존 큐브 해상도를 유지하지만 PR은 실제 크기를 바꾸므로, 그 전환의 비용 감소는 이 동일 품질 표에 포함하지 않아. full 관객은 홀 1,531명, Sphere 12,863명이고 Lite는 기존 cap을 사용해. 곡은 `beethoven-ode-to-joy`, 기본 시각은 25초, 중계는 5초야. 성능 fixture는 입장 연출을 건너뛰고 연주자 전원을 무대에 배치하는 스트레스 조건이야. a41의 곡별 roster가 실제 UI에서 전환되는지는 별도 기능 검사로 확인해. 성능 fixture의 음표 예약은 꺼져 있고 시각 상태만 같은 음악 시각으로 제어해.

아래 동기 완료 시간은 `frame()` 시작부터 1×1 `readPixels` 완료까지의 벽시계 시간이야. JS 제출·드라이버 대기·소프트웨어 렌더 완료가 들어 있어. **이를 역수로 바꾼 값을 실제 FPS로 쓰지 않아.** 고정 품질 동기 모드의 각 장면은 준비 4회 후 6개 표본이므로 p95/p99를 안정적인 장기 꼬리 지연이라고 해석하면 안 돼. 시간 변화율은 `(after / before - 1) × 100`이고, 음수면 시간이 짧아진 거야.

### 데스크톱 viewport

#### 숲속 홀 · high

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-hall-high-desktop-sync.json) | 2,597.1 → 1,823.6 | 2,735.3 → 1,886.3 | -29.8% | 1,713.3 → 1,710.3 | 11,699,198 → 7,413,190 |
| [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-hall-high-desktop-sync.json) | 6,872.6 → 6,547.9 | 7,034.4 → 6,817.0 | -4.7% | 1,814.7 → 1,814.7 | 11,858,529 → 11,858,529 |
| [중거리](performance-data/latest-a41/qa-a41/render/baseline-full-hall-high-desktop-sync.json) | 4,615.7 → 3,937.3 | 4,845.7 → 4,109.3 | -14.7% | 1,722.7 → 1,739.7 | 11,701,036 → 9,256,972 |
| [이동·회전](performance-data/latest-a41/qa-a41/render/baseline-full-hall-high-desktop-sync.json) | 3,841.4 → 3,358.5 | 4,511.6 → 3,859.8 | -12.6% | 699.7 → 741.5 | 11,460,051 → 9,376,969 |
| [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-full-hall-high-desktop-sync.json) | 5,407.3 → 4,794.3 | 6,593.7 → 5,783.0 | -11.3% | 2,580.3 → 2,342.7 | 17,588,419 → 14,144,315 |
| [폭죽·활성 빔](performance-data/latest-a41/qa-a41/render/baseline-full-hall-high-desktop-sync.json) | 5,268.4 → 4,678.0 | 7,999.3 → 7,549.2 | -11.2% | 1,736.0 → 1,753.0 | 11,704,448 → 9,260,384 |

#### Sphere · high

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-desktop-sync.json) | 963.6 → 949.2 | 1,017.4 → 1,015.8 | -1.5% | 1,712.0 → 1,712.0 | 2,267,848 → 2,267,848 |
| [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-desktop-sync.json) | 2,938.5 → 2,877.8 | 3,070.7 → 2,982.8 | -2.1% | 1,780.3 → 1,780.3 | 3,699,488 → 3,699,488 |
| [일반 돔](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-desktop-sync.json) | 817.3 → 860.7 | 972.7 → 987.9 | +5.3% | 654.0 → 654.0 | 2,557,834 → 2,557,834 |
| [3D 숲](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-desktop-sync.json) | 1,958.1 → 2,055.7 | 2,073.9 → 2,266.5 | +5.0% | 1,748.0 → 1,748.0 | 3,275,340 → 3,268,752 |
| [3D 산](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-desktop-sync.json) | 2,085.6 → 1,950.1 | 2,259.9 → 2,073.6 | -6.5% | 1,747.0 → 1,747.0 | 3,275,052 → 3,268,464 |
| [세계 교차 전환](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-desktop-sync.json) | 1,960.3 → 2,013.6 | 2,027.3 → 2,177.0 | +2.7% | 1,745.7 → 1,745.7 | 3,274,668 → 3,268,080 |
| [돔 열림 전환](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-desktop-sync.json) | 1,988.7 → 1,915.5 | 2,098.0 → 2,048.6 | -3.7% | 1,745.0 → 1,745.0 | 3,274,476 → 3,267,888 |
| [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-desktop-sync.json) | 1,764.9 → 1,747.3 | 2,132.6 → 2,084.4 | -1.0% | 2,597.2 → 2,318.7 | 4,520,785 → 4,393,449 |
| [폭죽·활성 빔](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-desktop-sync.json) | 1,989.1 → 2,076.9 | 4,425.9 → 4,448.1 | +4.4% | 1,762.3 → 1,762.3 | 3,273,280 → 3,273,280 |

#### 숲속 홀 · medium

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-hall-medium-desktop-sync.json) | 2,624.1 → 1,807.0 | 2,748.8 → 1,972.5 | -31.1% | 1,713.3 → 1,710.3 | 11,699,198 → 7,413,190 |
| [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-hall-medium-desktop-sync.json) | 7,084.0 → 6,893.0 | 7,157.2 → 7,036.9 | -2.7% | 1,814.7 → 1,814.7 | 11,858,529 → 11,858,529 |
| [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-full-hall-medium-desktop-sync.json) | 5,596.8 → 4,667.4 | 7,906.0 → 6,261.5 | -16.6% | 1,981.3 → 1,831.2 | 15,540,138 → 12,745,288 |

#### Sphere · medium

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-medium-desktop-sync.json) | 927.0 → 901.5 | 1,023.1 → 960.6 | -2.8% | 1,712.0 → 1,712.0 | 2,267,848 → 2,267,848 |
| [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-medium-desktop-sync.json) | 3,062.7 → 2,822.0 | 3,196.4 → 2,968.9 | -7.9% | 1,780.3 → 1,780.3 | 3,699,488 → 3,699,488 |
| [3D 숲](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-medium-desktop-sync.json) | 1,573.4 → 1,616.8 | 1,812.8 → 1,812.9 | +2.8% | 1,745.2 → 1,745.2 | 3,271,644 → 3,268,350 |
| [세계 교차 전환](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-medium-desktop-sync.json) | 1,615.4 → 1,731.6 | 1,992.7 → 1,858.2 | +7.2% | 1,746.5 → 1,746.5 | 3,272,028 → 3,268,734 |
| [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-medium-desktop-sync.json) | 1,610.8 → 1,601.7 | 2,065.3 → 2,031.9 | -0.6% | 2,312.0 → 2,126.3 | 4,103,109 → 4,018,218 |

### 모바일 viewport·터치 에뮬레이션

이 모바일 high·medium은 기존 모바일 Lite 모델 경로를 유지한 프리셋이야. 데스크톱 full 모델과 서로 비교하지 않아.

#### 숲속 홀 · high

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-hall-high-mobile-sync.json) | 1,126.3 → 1,063.2 | 1,168.4 → 1,100.6 | -5.6% | 537.0 → 540.0 | 687,172 → 591,784 |
| [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-hall-high-mobile-sync.json) | 1,720.4 → 1,684.1 | 1,855.0 → 1,755.5 | -2.1% | 662.0 → 698.0 | 874,003 → 864,835 |
| [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-full-hall-high-mobile-sync.json) | 1,740.4 → 1,474.7 | 1,928.3 → 1,702.7 | -15.3% | 798.8 → 726.8 | 1,075,106 → 936,313 |

#### Sphere · high

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-mobile-sync.json) | 1,186.8 → 1,168.8 | 1,217.3 → 1,213.7 | -1.5% | 517.0 → 517.0 | 473,894 → 473,894 |
| [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-mobile-sync.json) | 2,502.2 → 2,497.7 | 2,783.2 → 2,631.2 | -0.2% | 629.0 → 629.0 | 823,517 → 823,517 |
| [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-mobile-sync.json) | 1,393.7 → 1,465.0 | 1,539.6 → 1,584.0 | +5.1% | 777.5 → 669.5 | 1,179,549 → 1,116,296 |
| [일반 돔](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-high-mobile-sync.json) | 1,245.6 → 1,297.1 | 1,378.7 → 1,387.7 | +4.1% | 277.0 → 277.0 | 506,760 → 506,760 |

#### 숲속 홀 · medium

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-hall-medium-mobile-sync.json) | 571.3 → 562.0 | 589.6 → 601.4 | -1.6% | 537.0 → 540.0 | 687,172 → 591,784 |
| [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-hall-medium-mobile-sync.json) | 932.3 → 903.5 | 1,028.7 → 951.6 | -3.1% | 662.0 → 698.0 | 874,003 → 864,835 |
| [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-full-hall-medium-mobile-sync.json) | 827.1 → 794.5 | 1,057.3 → 988.6 | -3.9% | 738.8 → 695.8 | 955,377 → 840,624 |

#### Sphere · medium

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-medium-mobile-sync.json) | 553.8 → 530.8 | 606.4 → 547.0 | -4.2% | 517.0 → 517.0 | 473,894 → 473,894 |
| [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-medium-mobile-sync.json) | 1,215.8 → 1,242.9 | 1,298.4 → 1,294.8 | +2.2% | 629.0 → 629.0 | 823,517 → 823,517 |
| [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-medium-mobile-sync.json) | 795.8 → 744.7 | 995.3 → 902.2 | -6.4% | 722.3 → 650.3 | 1,040,573 → 998,404 |
| [일반 돔](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-medium-mobile-sync.json) | 577.9 → 645.6 | 632.7 → 680.0 | +11.7% | 277.0 → 277.0 | 506,760 → 506,760 |

모든 고정 품질 표본에서 실제 quality·renderScale, 카메라와 장면 순서, GL 오류를 검사했어. 각 행의 장면 링크는 기준 원시 JSON이야. 대응 후보 파일명은 `baseline` 대신 `after`이고, [전체 CSV](performance-data/latest-a41/qa-a41/summary.csv)와 [검증된 집계 JSON](performance-data/latest-a41/qa-a41/summary.json)에 전후 파일명이 함께 있어.

### 브라우저 rAF 간격

외부 네이티브 rAF callback 간격은 readback 없이 별도로 측정했어. 이 표의 FPS는 그 callback 빈도야. 시각 장면과 음악 시각은 비교용 fixture로 제어하므로 실제 음향과 모든 UI를 함께 쓰는 실기기 전달 FPS와 구분해. 1% Low는 가장 느린 1% 간격의 평균을 역수로 계산해. 100개 표본에서는 가장 긴 한 간격에 좌우돼.

#### 숲속 홀 · low

| viewport·장면 | 평균 callback FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| desktop · [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-hall-low-desktop-cadence.json) | 7.74 → 8.77 | 2.92 → 2.82 | 207.4 → 189.2 | 428.5 → 429.5 | 588,186 → 477,642 |
| desktop · [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-hall-low-desktop-cadence.json) | 5.06 → 4.88 | 1.96 → 1.62 | 288.5 → 304.4 | 492.4 → 492.4 | 747,152 → 747,152 |
| desktop · [이동·회전](performance-data/latest-a41/qa-a41/render/baseline-full-hall-low-desktop-cadence.json) | 5.26 → 5.56 | 1.93 → 1.40 | 395.4 → 393.1 | 173.7 → 200.2 | 549,785 → 494,054 |
| mobile · [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-hall-low-mobile-cadence.json) | 5.48 → 5.59 | 1.84 → 1.97 | 306.9 → 343.9 | 342.7 → 345.7 | 564,361 → 468,973 |
| mobile · [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-hall-low-mobile-cadence.json) | 3.12 → 3.44 | 1.19 → 1.29 | 485.8 → 435.2 | 492.4 → 528.4 | 747,152 → 737,984 |
| mobile · [이동·회전](performance-data/latest-a41/qa-a41/render/baseline-full-hall-low-mobile-cadence.json) | 3.59 → 3.98 | 1.47 → 1.54 | 560.1 → 475.6 | 105.7 → 122.9 | 508,464 → 437,655 |
| desktop · [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-steady-full-hall-low-desktop-cadence.json) (준비 94회) | 4.60 → 5.82 | 1.37 → 2.09 | 484.4 → 261.6 | 462.5 → 472.9 | 596,034 → 526,172 |
| mobile · [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-steady-full-hall-low-mobile-cadence.json) (준비 94회) | 3.51 → 3.91 | 1.38 → 1.42 | 659.9 → 389.9 | 451.5 → 466.9 | 595,078 → 528,240 |

#### Sphere · low

| viewport·장면 | 평균 callback FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| desktop · [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-low-desktop-cadence.json) | 8.57 → 8.68 | 3.25 → 3.26 | 175.8 → 187.3 | 405.8 → 405.8 | 378,589 → 378,589 |
| desktop · [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-low-desktop-cadence.json) | 2.31 → 2.37 | 0.83 → 1.53 | 1,076.1 → 618.7 | 491.4 → 491.4 | 969,550 → 969,550 |
| desktop · [이동·회전](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-low-desktop-cadence.json) | 3.99 → 4.05 | 1.20 → 1.99 | 463.6 → 423.7 | 138.0 → 138.0 | 687,965 → 687,953 |
| desktop · [일반 돔](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-low-desktop-cadence.json) | 6.09 → 6.34 | 2.23 → 2.50 | 384.7 → 258.4 | 53.0 → 53.0 | 562,616 → 562,616 |
| mobile · [근거리](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-low-mobile-cadence.json) | 5.01 → 5.03 | 1.68 → 1.28 | 474.6 → 311.4 | 318.2 → 318.2 | 352,268 → 352,268 |
| mobile · [객석 전경](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-low-mobile-cadence.json) | 1.93 → 1.88 | 0.76 → 0.68 | 1,244.9 → 789.4 | 456.4 → 456.4 | 697,758 → 697,758 |
| mobile · [이동·회전](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-low-mobile-cadence.json) | 2.71 → 2.59 | 0.77 → 0.96 | 764.6 → 728.9 | 85.0 → 85.0 | 573,365 → 573,345 |
| mobile · [일반 돔](performance-data/latest-a41/qa-a41/render/baseline-full-sphere-low-mobile-cadence.json) | 4.10 → 3.68 | 1.47 → 1.31 | 410.3 → 414.3 | 47.0 → 47.0 | 380,240 → 380,240 |
| desktop · [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-steady-full-sphere-low-desktop-cadence.json) (준비 94회) | 4.84 → 5.43 | 1.60 → 1.98 | 460.7 → 269.1 | 455.2 → 455.2 | 829,185 → 829,185 |
| mobile · [무대 중계](performance-data/latest-a41/qa-a41/render/baseline-steady-full-sphere-low-mobile-cadence.json) (준비 94회) | 4.05 → 4.08 | 1.53 → 1.49 | 578.3 → 477.3 | 441.2 → 441.2 | 643,677 → 643,677 |

각 행 100개 간격이야. `broadcast`는 별도 실행에서 양쪽 모두 준비 94회를 진행해 원래 90프레임 주기를 지난 뒤 측정했어. 첫 검은 화면과 즉시 촬영의 차이를 이 steady 관찰의 개선율로 섞지 않았어. 단, 준비된 상태에서도 중계 영상은 원래 촬영 주기로 갱신돼.

### 개선되지 않은 결과와 재측정

한 번의 짧은 실행에서 좋아진 수치만 골라 쓰지 않았어. 최초 동일 품질 행렬에서 평균 시간이 늘어난 조건은 아래와 같아. 이 목록은 회귀 원인이 확정됐다는 뜻이 아니며, 작거나 일관되지 않은 차이를 안정적인 개선이라고 해석하지 않아.

- hall/low/desktop/wide +3.6%
- sphere/high/desktop/dome +5.3%
- sphere/high/desktop/forest +5.0%
- sphere/high/desktop/crossfade +2.7%
- sphere/high/desktop/effects-show +4.4%
- sphere/high/mobile/broadcast +5.1%
- sphere/high/mobile/dome +4.1%
- sphere/low/mobile/wide +2.5%
- sphere/low/mobile/rotate +4.7%
- sphere/low/mobile/dome +11.3%
- sphere/medium/desktop/forest +2.8%
- sphere/medium/desktop/crossfade +7.2%
- sphere/medium/mobile/wide +2.2%
- sphere/medium/mobile/dome +11.7%

아래는 후보 → 기준 순서로 새로 실행한 high 재관찰이야. 홀은 `front` 단독, Sphere는 `front,wide,dome,forest` 순서라 최초의 더 긴 시퀀스와 포즈 누적 상태가 같다고 볼 수 없어. 최초 결과를 대체하거나 합쳐 하나의 개선율을 만들지 않고, 각 재관찰 내부의 전후 쌍만 비교해. 각 장면 준비 4회·측정 6회야.

| 장면 | 평균 완료 ms 전 → 후 | p95 ms 전 → 후 | 시간 변화 | 평균 draw calls 전 → 후 | 평균 triangles 전 → 후 |
| --- | ---: | ---: | ---: | ---: | ---: |
| [홀 · 근거리](performance-data/latest-a41/qa-a41/render/baseline-repeat-full-hall-high-desktop-sync.json) | 2,638.8 → 1,688.3 | 2,888.5 → 1,816.0 | -36.0% | 1,713.3 → 1,710.3 | 11,699,198 → 7,413,190 |
| [Sphere · 근거리](performance-data/latest-a41/qa-a41/render/baseline-repeat-full-sphere-high-desktop-sync.json) | 926.5 → 923.4 | 950.4 → 974.1 | -0.3% | 1,712.0 → 1,712.0 | 2,267,848 → 2,267,848 |
| [Sphere · 객석 전경](performance-data/latest-a41/qa-a41/render/baseline-repeat-full-sphere-high-desktop-sync.json) | 3,016.6 → 2,745.4 | 3,169.8 → 2,857.3 | -9.0% | 1,780.3 → 1,780.3 | 3,699,488 → 3,699,488 |
| [Sphere · 일반 돔](performance-data/latest-a41/qa-a41/render/baseline-repeat-full-sphere-high-desktop-sync.json) | 842.4 → 834.4 | 877.7 → 882.5 | -0.9% | 654.0 → 654.0 | 2,557,834 → 2,557,834 |
| [Sphere · 3D 숲](performance-data/latest-a41/qa-a41/render/baseline-repeat-full-sphere-high-desktop-sync.json) | 2,091.8 → 1,911.1 | 2,213.2 → 2,052.6 | -8.6% | 1,748.0 → 1,748.0 | 3,275,340 → 3,268,752 |

특히 Sphere의 새 ray-marching shader 자체는 그대로 두었어. 프록시 삼각형이나 중계 draw call이 줄었다는 사실을 전체 공연 FPS의 같은 비율 개선으로 확대하지 않아. 하드웨어 GPU에서 반복 측정해 fragment 비용과 제출 비용의 비중을 확인해야 해.

## 3. B — 적응형 품질

기존 자동 조절은 애니메이션 안정화를 위해 50ms로 제한한 dt를 FPS 계산에도 사용해서 실제로 매우 느려도 20FPS 아래를 제대로 관찰하지 못했어. 이제 실제 프레임 간격을 사용해. 3초 window의 평균과 p90을 보고, 연속된 느린 window 2개·회복 window 5개·6초 cooldown을 두었어. 한 번의 긴 프레임에 바로 단계를 내리지 않아.

해상도 scale은 0.6~1.0에서 단계적으로 내려가고 여유가 지속되면 복구해. 심한 과부하에서는 프리셋을 먼저 내려. 프리셋 변경 때문에 오히려 pixel ratio가 커지는 것도 막아. 수동 화질에는 자동 조절을 적용하지 않아. 숨긴 탭에서 돌아올 때 측정 상태를 다시 준비해.

Lite 여부는 기존처럼 첫 입장 때 정해져. Lite는 해상도와 후처리를 medium까지 회복할 수 있지만 공연 도중 수천 모델을 full로 재생성하지 않아. **고성능 휴대폰의 full 3D 세계 자동 승격은 구현하지 않았어.** 현재의 안전한 경량 경로를 유지한 범위야.

| 공연장 · mobile auto | 평균 callback FPS 전 → 후 | 1% Low 전 → 후 | p95 간격 ms 전 → 후 | 마지막 프리셋 전 → 후 | 마지막 scale 전 → 후 |
| --- | ---: | ---: | ---: | --- | ---: |
| hall · 근거리 ([전](performance-data/latest-a41/qa-a41/render/baseline-auto-full-hall-auto-mobile-cadence.json) / [후](performance-data/latest-a41/qa-a41/render/after-auto-full-hall-auto-mobile-cadence.json)) | 5.20 → 6.58 | 1.68 → 2.07 | 458.3 → 323.4 | low → low | 0.85 → 0.60 |
| sphere · 근거리 ([전](performance-data/latest-a41/qa-a41/render/baseline-auto-full-sphere-auto-mobile-cadence.json) / [후](performance-data/latest-a41/qa-a41/render/after-auto-full-sphere-auto-mobile-cadence.json)) | 5.02 → 5.92 | 1.92 → 1.49 | 469.2 → 338.3 | low → low | 0.85 → 0.60 |

각 실행은 120개 실제 rAF 간격을 기록했어. 프리셋·해상도가 변하므로 서로 같은 화질 결과가 아니야. 전체 구간은 시작 준비와 하향 전환 비용까지 포함하며, 마지막 상태의 안정 FPS로 해석하지 않아. 모든 프레임의 실제 quality·scale과 간격은 위 전/후 원시 JSON 링크에 있고, [집계 JSON](performance-data/latest-a41/qa-a41/summary.json)은 그 요약이야. 이번 과부하 환경에서의 하향 관찰과 정책 단위 검사의 회복을 구분해. 실제 GPU의 성능 회복·발열 회복까지 확인한 것은 아니야.

두 공연장 모두 이 관찰에서 평균과 p95는 좋아졌지만, **Sphere의 1% Low는 1.92 → 1.49로 나빠졌어.** 120표본의 1% Low는 가장 긴 두 간격에 좌우되며, 전환을 포함한 이 실행에서 모든 꼬리 지연이 개선됐다고 주장하지 않아. 최종 scale도 기존 0.85와 후보 0.60으로 다르므로 이 평균 FPS 차이는 동일 선명도에서의 개선 수치가 아니야.

인위적인 프레임 간격을 재생한 [정책 trace](performance-data/runtime/policy-trace.json)도 보존했어. 이것은 정책의 하향·복구·히스테리시스를 검증하는 입력 재생이고 실제 기기의 FPS 향상 수치가 아니야.

## 4. 시각적 품질

같은 수동 품질의 **61 PNG쌍 중 47쌍은 PNG 파일 바이트와 RGB 픽셀이 완전히 같아**. 나머지 14쌍 전부와 high desktop 대표 15쌍을 육안으로 확인했어. 중복을 빼면 수동 26쌍을 직접 판독한 거야. 대표 Hall high 6장면은 모두 같고, Sphere high 9장면 중 6장면은 같았어. [전 수치·원본 경로·SHA-256](performance-data/latest-a41/qa-a41/visual-review/summary.json)과 [상세 판독](performance-data/latest-a41/qa-a41/visual-review/review.md)을 남겼어.

61쌍은 정규 동기 캡처 37 + 별도 반복 5 + smoke 1 + cadence 캡처 18(준비 후 중계 4 포함)이야. **61개의 독립적인 개선 실험이나 서로 다른 61개 장면을 뜻하지 않아.** a41의 동일 조건 before/after만 사용했고, 이전 ec5 이미지는 합치지 않았어.

| 차이가 남은 범위 | PNG 쌍 | MAE, 8-bit RGB | 전체 화면 변경 픽셀 | SSIM |
| --- | ---: | ---: | ---: | ---: |
| Sphere forest/peaks/crossfade 돔, forest 반복 1쌍 포함 | 6 | 0.049661–0.099225 | 2.550781–12.100694% | 0.997345485–0.999455271 |
| 두 공연장의 중계 화면 | 8 | 0.001124–0.017930 | 0.014757–0.221093% | 0.999105894–0.999975894 |

돔에서는 숲의 얇은 줄기 경계와 설산의 세부 픽셀에 차이가 있어. 확인한 정지 이미지에서는 큰 장면 구성과 무대·객석을 유지했고, 굵은 줄기나 큰 영역이 통째로 사라진 변화는 보이지 않았어. 모든 차이는 화면 상단 돔 영역 안에 있었어. high forest의 별도 반복 캡처는 최초 촬영과 before/after 각각의 PNG SHA-256도 같았어.

shader 문자열이 같더라도 보조 형상의 보간·반올림 경로, 돔 렌더 순서와 전체 앱의 상태 갱신 차이가 함께 있어. 따라서 **돔 차이를 반올림 하나나 자연적 RNG/시간 차이로 단정하지 않아.** 변경 하나씩을 분리한 픽셀 실험은 이번 자료에 없어. [a41 소스 보존 검토](performance-data/provenance/a41-sphere-review.md)는 이미지의 단독 원인 분석과 구분해.

중계 8쌍은 영상 안의 지휘자 손·팔·봉 주변 자세가 조금 달라. 화면 바깥의 실제 무대·객석과 중계 구도는 같고, 화면 전체가 비거나 깨지는 차이는 보이지 않았어. 이 양상은 중계 촬영 전에 현재 프레임의 Lite 연주자 상태를 동기화한 변경과 일치하지만, 그 변경만이 유일한 원인임을 분리해 입증한 것은 아니야. 작은 차이는 [중계 확대본 8개 목록](performance-data/latest-a41/qa-a41/visual-review/detail-crops/manifest.json)으로 확인할 수 있어.

| 직접 볼 비교 이미지 | 범위 |
| --- | --- |
| [Hall 대표 1](performance-data/latest-a41/qa-a41/visual-review/contact-sheets/hall-high-desktop-1.png) / [2](performance-data/latest-a41/qa-a41/visual-review/contact-sheets/hall-high-desktop-2.png) | front·wide·mid·rotate·broadcast·effects-show |
| [Sphere 대표 1](performance-data/latest-a41/qa-a41/visual-review/contact-sheets/sphere-high-desktop-1.png) / [2](performance-data/latest-a41/qa-a41/visual-review/contact-sheets/sphere-high-desktop-2.png) | front·wide·dome·forest·peaks·crossfade·reveal·broadcast·effects-show |
| [모든 수동 차이 1](performance-data/latest-a41/qa-a41/visual-review/contact-sheets/manual-differences-01.png) / [2](performance-data/latest-a41/qa-a41/visual-review/contact-sheets/manual-differences-02.png) / [3](performance-data/latest-a41/qa-a41/visual-review/contact-sheets/manual-differences-03.png) / [4](performance-data/latest-a41/qa-a41/visual-review/contact-sheets/manual-differences-04.png) | 차이가 있는 14쌍 전부 |
| [auto 별도 관찰](performance-data/latest-a41/qa-a41/visual-review/contact-sheets/automatic-separate-not-same-quality.png) | 해상도가 달라진 2쌍, 동일 품질 집계에서 제외 |

**auto 2쌍은 수동 61쌍과 따로 봐야 해.** 양쪽 마지막 프리셋은 low지만 baseline renderScale 0.85와 후보 0.60은 내부 해상도가 달라. 후보의 난간·악기·얼굴 윤곽에서 계단과 샘플링 차이가 보여. Hall SSIM 0.868554161, Sphere 0.952882924는 그 별도 관찰값이고, 동일 선명도 유지의 성공 수로 세지 않았어.

수치는 원본 PNG의 8-bit RGB에 계산했어. SSIM은 RGB 채널 평균, uniform 7×7 창, K1=0.01/K2=0.03, data_range 255, 표본 공분산 49/48, 가장자리 3px를 제외한 valid window를 사용해. 변경 픽셀은 한 채널만 1단계 달라도 포함해. 넓은 검은 영역과 변하지 않은 영역도 평균에 들어가므로 **높은 SSIM을 자동 화질 합격선으로 사용하지 않았어.** 비교 그림은 before / after / 차이×8이며, 수치는 강조·축소 전 원본 기준이야.

이 결과는 SwiftShader의 정해진 시점에서 캡처한 정지 이미지 검증이야. 판독한 수동 스냅샷에서는 큰 형상·좌석·연주자 누락을 발견하지 못했지만, 연속 프레임의 깜박임·실기기 품질·실제 앱 FPS까지 보장하지 않아. 원본 PNG와 profile 168파일의 hash가 분석 전후 그대로임을 확인했고, GPU/오디오 측정을 멈춘 구간에서만 이미지 계산을 했어. [분석 로그](performance-data/latest-a41/qa-a41/visual-review/analysis-process.jsonl)에 시작·종료 시각을 남겼어.

## 5. 로딩과 메모리

**이 절은 main `a41b7e40f2cc3c9e00c40bb77bf9a28bb5b201a6`와 당시 8080 후보의 관측이야. 이후 3f 통합 코드의 성능 결과로 재사용하지 않아.** 2026-10-21 07:07~07:10 UTC에 두 공연장×desktop/mobile×변경 전후의 8개 실행을 직렬로 수집했어. 각 실행은 cold 한 번과 같은 BrowserContext의 warm 한 번이야. 전후 4쌍의 파일 비교는 각각 **109개 조건 확인을 통과**했어. [요약·원본 hash](performance-data/latest-a41/qa-a41/runtime-results/loading-fixed-summary.json)에 계산 근거를 남겼어.

Desktop은 960×540·요청/실제 DPR 1·high·48kHz, mobile은 390×844·요청 DPR 2/실제 1.25·low·24kHz였어. 두 조건 모두 같은 컨테이너의 Chromium 153·SwiftShader·headless 실행이고 실제 휴대폰이 아니야. main의 반복 rAF를 보관한 상태에서 장면 생성·PMREM·잔향 생성·샘플 다운로드/decode·박수 준비·악보 로딩은 실제로 진행했어. **`readyMs`는 ‘혼자 보기’ 버튼의 활성화 시점이고, 정상 앱 전체의 첫 인터랙티브 화면 시간은 아니야.**

### 준비시간과 주 스레드의 긴 작업

시간 변화는 `(후−전)/전`이야. 음수는 이번 관측에서 짧아졌다는 뜻이야. 각 칸은 **반복 평균이 아닌 한 번의 관측**이므로 작은 차이에 인과적 의미를 부여하지 않아.

| 조건 | 캐시 | 준비시간 ms 전 → 후 | 시간 변화 | 50ms 이상 작업 합계 ms | 가장 긴 작업 ms | 긴 작업 수 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Hall desktop | cold | 15,033.4 → 13,444.4 | -10.57% | 2,958 → 2,022 | 1,700 → 1,388 | 8 → 6 |
| Hall desktop | warm | 17,918.3 → 17,643.3 | -1.53% | 2,403 → 1,965 | 1,242 → 1,143 | 4 → 9 |
| Hall mobile | cold | 11,760.4 → 10,854.5 | -7.70% | 3,858 → 3,663 | 3,008 → 3,297 | 3 → 3 |
| Hall mobile | warm | 10,726.9 → 10,801.7 | +0.70% | 3,600 → 4,374 | 2,712 → 4,012 | 4 → 2 |
| Sphere desktop | cold | 10,136.3 → 10,118.0 | -0.18% | 2,545 → 2,188 | 1,564 → 1,427 | 5 → 7 |
| Sphere desktop | warm | 12,585.5 → 12,818.0 | +1.85% | 2,117 → 1,731 | 1,312 → 1,221 | 3 → 4 |
| Sphere mobile | cold | 6,140.4 → 5,966.5 | -2.83% | 3,680 → 3,337 | 2,872 → 3,036 | 4 → 2 |
| Sphere mobile | warm | 5,949.5 → 6,105.4 | +2.62% | 3,595 → 3,849 | 2,763 → 3,420 | 3 → 2 |

Hall desktop의 cold 준비시간은 1,589.0ms 짧게 관측됐지만 Sphere desktop cold 차이는 18.3ms에 그쳤어. **warm에서는 Hall mobile +0.70%, Sphere desktop +1.85%, Sphere mobile +2.62%로 더 오래 걸렸어.** Hall mobile warm의 긴 작업 합계는 3,600→4,374ms(+21.50%), 최대 작업은 2,712→4,012ms(+47.94%)였고, Sphere mobile warm도 합계 3,595→3,849ms(+7.07%), 최대 2,763→3,420ms(+23.78%)였어. 박수 작업을 Worker로 옮겼다는 이유만으로 부팅의 모든 지표가 개선됐다고 결론내리지 않아.

### 다운로드·PCM·관객 조건과 메모리 snapshot

샘플 수와 PCM은 전후·cold/warm 모두 같았어. desktop은 **389개 / 296,771,776 PCM bytes**, mobile은 **207개 / 64,184,568 PCM bytes**이고 박수 4종은 모든 조건에서 **14,288,400 PCM bytes**야. 각 cold의 CDP MP3 수신 응답 크기는 desktop 10,666,245 bytes, mobile 5,666,528 bytes로 전후 같았어. 모든 warm에서 각각 389/207개 MP3가 캐시 적중했고 MP3 수신 응답 크기는 0이었어. 이 값은 CDP의 encoded response 크기이며 전체 네트워크 패킷 크기가 아니야.

관객 전용 seed 417을 격리했고, **Hall desktop 979명·mobile 200명, Sphere desktop 12,909명·mobile 2,500명**의 인원과 정렬한 점유 좌석 SHA-256이 각각 전후·cold/warm에서 같았어. 원래 난수로 수집한 최초 Hall 4건은 삭제하지 않았지만, 군중 조건이 달라 시간·longtask의 인과 개선율에서는 제외했어. [수집기 원문과 보정 기록](performance-data/provenance/loading-audience-control-correction.json)에 원시 파일 hash와 제외 이유가 있어.

아래는 준비 완료 직후의 `usedJSHeapSize` 값이야. MB는 1,000,000 bytes이며 같은 실행의 cold/warm에서 같은 값이 기록됐어. Chrome이 제공하는 거친 snapshot이므로 **피크 메모리·프로세스 전체·AudioBuffer native 메모리·GPU 메모리의 감소율로 사용하지 않아.** 강제 GC나 heap snapshot 분석도 하지 않았어.

| 조건 | JS heap snapshot 전 → 후 | 관측 변화 |
| --- | ---: | ---: |
| Hall desktop | 410 → 386 MB | -5.85% |
| Hall mobile | 157 → 212 MB | +35.03% |
| Sphere desktop | 747 → 435 MB | -41.77% |
| Sphere mobile | 286 → 157 MB | -45.10% |

**Hall mobile은 오히려 55MB 높게 관측됐어.** 이 단일 snapshot만으로 원인이 retained geometry인지 GC 시점인지 Worker/AudioBuffer인지 구분할 수 없어. 실제 기기에서 같은 부팅 순서로 반복하고 메모리 도구로 원인을 나눠 확인해야 해.

캐시를 유지하려고 Playwright 요청 라우트를 사용하지 않았어. 대신 임시 localhost 프록시가 관객 생성 한 줄만 치환한 main을 identity·별도 QA ETag로 제공했어. 원본/제공 main SHA를 모두 남기고 그 전송량은 `controlledMainFixture`로 분리했어. **그 수치를 원래 gzip main의 다운로드 크기라고 부르면 안 돼.** 외부 폰트 대신 동일한 로컬 폰트를 사용했고, 관객 이외의 절차적 난수·잔향 IR 샘플은 바이트 단위로 고정하지 않았어. 새 브라우저의 HTTP 캐시는 비었지만 upstream Node/OS 캐시는 이미 따뜻할 수 있어. 따라서 이번 표는 재현 가능한 제한 조건의 관측 자료이고, 실제 PC/휴대폰 로딩 개선의 확정값은 아니야.


## 6. 기능·오디오·멀티플레이 검증

**이 절도 a41 측정 후보의 결과야. 이후 3f 통합의 새 기능 검사와 분리해.** 검사마다 렌더·오디오·네트워크 조건이 다르므로 한 종류의 PASS로 나머지를 대신하지 않아.

| 범위 | 확인한 결과 | 근거와 제한 |
| --- | --- | --- |
| Node 회귀 | 서로 다른 **60개 통과 범위** | a41 실행 59개 중 옛 quality 7개를 후속 quality 8개로 교체한 **52+8**이야. 단일 60개 재실행은 아니야. [합산 근거](performance-data/runtime/a41-quality-dpr-regression/combined-scope.json) |
| 실제 Worker와 CSP fallback | 정상·차단 두 경로 모두 원본 **4종 박수 PCM과 같음** | 정상 응답 4회, 차단 응답 0회, Worker 종료 확인. 같은 모듈 hash로 a41에 연결한 이전 검사야. [PCM·실제 Worker 기록](performance-data/runtime/browser-worker.json) |
| localhost 프로토콜·정적 제공 | **15개 시나리오 통과** | 방 격리·권한·채팅·승계·재연결·Worker MIME/gzip/ETag·MP3 cache/range. a41과 소스 동일성을 확인한 기존 검사야. [프로토콜 결과](performance-data/runtime/multiplayer.json) |
| 실제 두 탭 방 UI | **Hall cross·Sphere core 2건 통과** | 비공개 방 입장·권한·재생 상태 전파·채팅·방장 넘기기와 Hall의 초대 공연장 이동. [범위와 원시 hash](runtime-validation.md#완료한-a41-두-탭-방-ui-검사) |
| 실제 입력·좌석·설정 | Hall mobile, Sphere mobile, Sphere desktop 재검사 **통과** | Hall desktop은 아래 재개 조건 **실패를 유지**해. 전체 4조건 통과라고 표현하지 않아. [검증 과정](validation-log.md) |
| 65초 착석 오디오 | 기준 2조건+후보 4조건 **6건 통과** | 반복 WebGL을 멈추고 실제 음악 시각으로 약 5Hz 시각 상태를 갱신한 조건이야. 아래에 실제 예약·시계 검사를 적었어 |

### 약 5Hz 시각 갱신에서 실제 오디오 예약

a41 기준 Hall desktop·Sphere mobile 2개와 후보의 두 공연장×desktop/mobile 4개, 총 **6개 실행이 통과**했어. 각 실행은 실제 입장·착석·시작 버튼을 사용했고 `beethoven-ode-to-joy`를 65초 넘게 관측했어. [6개 원본과 파일 검증 요약](performance-data/latest-a41/qa-a41/runtime-results/audio-stability-summary.json)에 원시 파일 SHA와 결과를 연결했어. 별도 파일 전용 집계가 raw note/voice/시계 배열을 다시 읽어 **153개 확인 조건을 통과**했으며, 이것은 새 브라우저 실행이나 제품 단위 테스트 153개를 뜻하지 않아.

| 실행 | 실제 오디오 진행 s | 음표 예약 / source start | 최소 예약 여유 ms | 실제 시각 갱신 Hz |
| --- | ---: | ---: | ---: | ---: |
| 기준 Hall desktop | 65.245 | 1,671 / 2,160 | 118.23 | 5.011 |
| 후보 Hall desktop | 65.237 | 1,671 / 2,160 | 117.24 | 5.013 |
| 기준 Sphere mobile | 65.237 | 1,671 / 2,160 | 114.31 | 5.013 |
| 후보 Sphere mobile | 65.216 | 1,671 / 2,160 | 120.04 | 5.014 |
| 후보 Hall mobile | 65.216 | 1,671 / 2,160 | 115.32 | 5.013 |
| 후보 Sphere desktop | 65.237 | 1,671 / 2,160 | 114.85 | 4.998 |

모든 실행에서 관측 종료의 `schedIdx`까지 **1,671개 음표가 원래 악보 순서·section·instrument·MIDI·duration·gain·layer와 정확히 일치**했고, 각 호출은 실제 voice를 만들었어. AudioBufferSource의 실제 `start()`는 각각 2,160회였어. 지속음·레이어 때문에 음표 하나가 여러 source를 쓸 수 있어 두 수를 같아야 한다고 요구하지 않아. Hall desktop과 Sphere mobile의 baseline/candidate 비교에서도 이 수와 샘플 수·PCM bytes가 같았어.

6개 모두 같은 score-prefix SHA-256 `14351705137ec5b799f77cee36acc1178da6c2cfc9890d4a8512be3107c97985`였어. 이 hash는 위의 악보 식별 필드이고 **원래 난수로 변화하는 velocity·정확한 예약 when·출력 파형까지 바이트 동일하다는 뜻은 아니야.** 곡 전체 73.94초의 모든 음표를 끝까지 관측한 결과도 아니야.

요청 시각이 이미 지난 음표는 **0개**, engine의 5ms 보정 범위 안에 들어간 요청도 **0개**였어. 실제 AudioContext는 65.216~65.245초 진행했고, 6개 모두 1초 간격 신호 관측 65/65개에서 0이 아닌 analyser 신호를 확인했어. 실제 일시정지 버튼 뒤에는 `playing=false`, 추적 voice 수 0이었어. 모든 기록은 foreground의 `running`·`visible` 상태였어.

시각 상태 갱신은 실제 `Performance.time`으로 약 5Hz만 호출했고 main rAF의 반복 WebGL은 멈췄어. 원래 25ms 오디오 Worker tick·lookahead·음표·속도·Web Audio 그래프는 유지했어. **이 결과는 낮은 시각 갱신 빈도에서 예약을 유지한 기능 검증이야.** GPU 렌더 정체나 오래 막힌 주 스레드, hidden 탭·물리 출력 장치 underrun·헤드폰 음질까지 검증한 결과는 아니야.

이 오디오 도구는 원래 관객 난수와 가능한 빈자리 선택을 유지했어. 실제로 Hall desktop 기준은 관객 1,101명/좌석 19, 후보는 827명/좌석 60이었어. **같은 초기 장면의 CPU·heap·공간 음향 성능 비교가 아니며 그 값으로 전후 개선율을 만들지 않아.** 관측 중 50ms 이상 longtask가 없었다는 사실도 반복 렌더 없는 조건에 한정해.

### Hall의 pause/seek/resume 실패는 그대로 남겨

Hall desktop의 명시 frame 기능 fixture에서는 일시정지·seek·재개 뒤 **2초 안에 곡 시각이 진행해야 하는 조건이 실패**했어. 후보만이 아니라 a41 baseline의 같은 transport 검사에서도 관측됐어. Worker tick과 JS 관측은 계속됐지만 AudioContext와 output timestamp가 그 구간에 멈췄고 상태는 running·visible이었어. multiprocess와 native fake-output 조건도 실패를 해소하지 못했어. 원인은 확정하지 않았고 timeout이나 음악 시계를 바꿔 통과시키지 않았어.

진단 옵션으로 실패를 보존한 채 실제 일시정지를 누른 뒤 medium/low/high·관객·중계 토글·첫 중계 촬영·auto 선택을 계속 확인했어. 후속 조작은 통과했지만 **전체 결과는 FAIL, exit 1**로 유지했어. 그 뒤 native AudioContext 시각이 다시 움직였어도 곡은 일시정지 상태여서 재개 성공으로 바꿔 해석하지 않아. [실패 trace와 후속 조작의 정확한 범위](runtime-validation.md#6-재개-실패와-브라우저-오디오-시계-분리-진단)에 원본을 연결했어.

위 65초 연속 재생 성공과 두 탭의 재생 상태 동기화는 서로 다른 경로야. **이 성공들로 Hall 재개 실패가 해결됐다고 주장하지 않아.** Sphere desktop의 최초 quality 검사는 cube texture face의 남아 있는 옛 크기 메타데이터를 읽어 실패했어. 검사를 실제 render target 크기와 갱신 pass로 바로잡은 뒤 재검사했고, 최초 실패 원본과 도구 보정도 보존했어. 제품 오류를 고친 것처럼 그 계측 수정을 설명하지 않아.


## 7. 측정 환경과 해석 범위

| 항목 | 이번 실행 |
| --- | --- |
| OS / CPU 자원 | Linux x86_64, 노출 논리 CPU 9개·cgroup CPU quota 8코어, 메모리 제한 8GiB |
| Node / Python | Node 24.19.0, Python 3.12.14 |
| 브라우저 | Chromium 153.0.8010.0, Playwright 1.64.1, `@sparticuz/chromium` 153.0.0 |
| Renderer | ANGLE Vulkan 1.3 / SwiftShader Subzero, 물리 GPU 없음 |
| 앱 그래픽 | 저장소의 Three.js r186 |
| 폰트 | Gowun Batang·IBM Plex Sans KR의 `@fontsource` 5.3.0 로컬 파일 |
| 이미지 비교 | Pillow 12.3.0, NumPy 2.3.5; RGB uniform 7×7 SSIM·MAE·RMSE |
| desktop 전체 프레임 | 640×360, DPR 1 |
| mobile 전체 프레임 | 390×844, DPR 2, Android UA·터치 5점 에뮬레이션 |
| GPU timer / GPU byte 메모리 | 미측정. extension이 있다는 사실은 측정값이 아니야 |
| 실제 스마트폰 / 태블릿 / Safari / Edge | 미실행 |
| 배터리·발열·15~30분 실기기 감상 | 미측정 |

컨테이너 Chromium의 단일 process·in-process GPU·무음 출력 등 특수 인자는 환경 기록에 남겼어. 실제 PC에서는 같은 특수 인자를 무조건 복사하지 말고 GPU가 실제로 선택됐는지 확인해. 전후 비교 안에서는 브라우저·인자·전원 모드를 동일하게 유지해야 해.

장면별 JS 메서드 경과 시간은 서로 중첩돼. `renderSubmit`을 포함하는 `broadcast` 등을 더해서 CPU 총 시간이라고 계산하면 안 돼. JS heap 관측값도 GC와 시점에 영향을 받으며 peak·native audio·GPU 메모리를 뜻하지 않아.

## 8. 남은 범위와 회귀 위험

- 물리 GPU와 실제 모바일의 안정적 60/30FPS는 아직 입증하지 못했어. 하드웨어 드라이버와 발열에 따라 draw call·vertex·fragment 비용 비중이 달라져.
- 객석 전체·로비처럼 거의 모든 좌석이 보이는 장면은 컬링 이득이 작아. 모든 시점에서 큰 개선을 주장하지 않아.
- 저화질 중계는 원래의 긴 촬영 간격을 유지해. 첫 활성화는 즉시 갱신하지만 이후 매 프레임 영상으로 바꾼 것은 아니야.
- 자동 해상도 조절은 화면 선명도를 바꾸고 shader/후처리 프리셋 변경은 재준비 비용이 있어. 같은 품질 최적화와 분리해서 판단해야 해.
- 실제 오디오 출력 장치의 underrun과 지속적인 GPU stall이 겹치는 경우는 별도 실기기 검증이 필요해. 메인 스레드가 원래 lookahead보다 오래 막히는 상황을 이번 변경이 모두 해결하지는 않아.
- 3D 세계의 프록시 보간은 작은 픽셀 차이를 낼 수 있어. 장면·드라이버별 차이가 허용 범위를 넘으면 원래 프록시로 되돌리는 선택지가 있어.

main에 직접 커밋하거나 머지하지 않았고, 자동 머지도 설정하지 않았어. 최종 판단은 이 기록의 고정 품질 결과·시각 비교·기능 결과를 함께 보고 해 줘.
