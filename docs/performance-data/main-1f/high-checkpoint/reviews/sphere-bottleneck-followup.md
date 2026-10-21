# Sphere 병목 후속 메모 — 관찰과 가설

작성: 2026-10-21T12:55:06.905047+00:00

첫 high desktop AB에서 세계·중계 완료시간이 늘어난 이유를 하나로 확정할 수는 없어. 확인한 것은 **증가분 대부분이 제출 이후 완료 대기 구간에 있고, JS wrapper에서는 그만큼의 증가가 보이지 않는다**는 점이야. 기준선1f8e5f1, 후보dea7997, 동일640×360·high·scale1·SwiftShader, 장면당8표본이야.

## 1. 직접 관찰한 시간 분해

단위ms. submit은 frame() 반환까지, wait는 그 뒤 blocking readPixels 완료까지야. phase wrapper는 중첩되므로 renderSubmit·worlds·broadcast를 합산하면 안 돼.

| 장면 | submit 기준선→후보 | wait 기준선→후보 | Δ전체 | Δsubmit | Δwait | worlds wrapper 기준선→후보 |
|---|---:|---:|---:|---:|---:|---:|
| front | 19.400→20.163 | 1031.125→890.062 | -140.300 | +0.763 | -141.062 | 0.000→0.037 |
| wide | 17.975→16.237 | 2913.475→2825.525 | -89.688 | -1.738 | -87.950 | 0.000→0.013 |
| rotate | 9.400→8.700 | 1533.413→1497.638 | -36.475 | -0.700 | -35.775 | 0.012→0.000 |
| dome | 8.463→7.750 | 711.400→727.025 | +14.912 | -0.712 | +15.625 | 0.013→0.000 |
| forest | 15.012→15.950 | 1881.125→2047.850 | +167.662 | +0.938 | +166.725 | 0.250→0.275 |
| peaks | 16.237→15.437 | 2041.975→2089.838 | +47.062 | -0.800 | +47.862 | 0.262→0.163 |
| ocean | 15.838→15.875 | 2373.462→2395.475 | +22.050 | +0.037 | +22.012 | 0.200→0.238 |
| clouds | 15.150→16.050 | 2316.562→2256.113 | -59.550 | +0.900 | -60.450 | 0.187→0.162 |
| crossfade | 17.213→15.438 | 2154.975→2138.625 | -18.125 | -1.775 | -16.350 | 0.200→0.175 |
| reveal | 15.050→14.062 | 2012.062→2054.625 | +41.575 | -0.987 | +42.563 | 0.175→0.125 |
| broadcast | 19.300→17.300 | 1841.812→1978.587 | +134.775 | -2.000 | +136.775 | 0.000→0.000 |
| effects-show | 270.375→287.413 | 1595.163→1688.225 | +110.100 | +17.038 | +93.062 | 0.025→0.050 |

forest 증가167.66ms 중166.73ms가 완료 대기 증가야. broadcast는 완료시간이134.78ms 늘었지만 submit은2.00ms 줄고, broadcast wrapper도4.550→3.838ms로 줄었어. 이 구간 분해만으로 실제 GPU 시간이나 순수 JS 실행 시간을 확정하지 않아.

effects-show는 양쪽 모두 두 번째 측정 표본에 renderSubmit 약2049.2→2171.9ms spike가 있어. 나머지7개 submit 평균은 16.029→18.014ms야. dome program 검사는 이 효과의 모든 program/state를 보증하지 않아.

## 2. Draw Calls와 코드가 함께 보여 주는 것

중계 없는4개 표본의 calls/triangles는 완전히 같고, 중계 있는4개는 매번557 calls·254672 triangles 감소했어. 평균 calls는2127.5→1849야. 후보main은 shadow autoUpdate를 끄고 프레임마다 한 번 needsUpdate를 세워. Three는 첫 shadow pass 뒤 이를 해제해서 같은 프레임 두 번째 camera의 shadow를 건너뛰어. **관측된 반복 감소는 shared shadow 변경과 강하게 일치해.** 다만 shadow 전용 draw counter를 직접 수집한 것은 아니야.

이 중계 포함4표본은 submit23.55→20.025ms로 줄었으나 완료시간2381.70→2553.475ms로 늘었어. 중계 없는4표본도1340.525→1438.30ms로 늘었으므로 증가를 중계 코드 한 곳으로 지목할 근거는 없어.

Box proxy는 면마다2208→12 triangles를 제출하지만 dome3d의 shader 전체를 포함한 앞부분23845bytes는 두 revision에서 동일해. domeshow도32763bytes가 동일해. high 큐브는 양쪽640²/every1, face mask·교대 crossfade·ray marching 반복은 유지돼. forest/peaks/ocean/clouds/crossfade/reveal의 전체 triangles 감소6588개는3×2196과 맞지만, 동일 픽셀의 fragment 연산은 그대로야. 따라서 vertex/primitive 절감이 fragment 지배 비용을 크게 줄인다고 기대할 근거는 부족해. 이 자료에는 실제 fragment invocation counter가 없어.

돔 base renderOrder를−1→10으로 바꾸면 앞의 불투명 구조물이 가린 픽셀을 depth로 거를 가능성은 있어. 이 변화는 별도 큐브맵에서의 world shader 비용을 줄이지 않고, 실제 early-depth 효율도 이 수집기로 측정하지 않았어.

## 3. CDP 수치의 범위

forest의 TaskDuration은15189.109→16534.965ms, DevToolsCommandDuration은15176.055→16518.578ms야. ScriptDuration은1.601→1.328ms, ThreadTime은137.691→147.499ms야. broadcast는 TaskDuration14910.834→15992.782ms, DevToolsCommandDuration14897.327→15979.722ms인 반면 ThreadTime166.444→153.757ms야. 긴 DevTools 평가/동기 대기가 포함된 TaskDuration 증가를 CPU 연산 증가로 읽으면 안 돼. 12장면의 모든phase와 CDP counter 차분은 JSON에 보존했어.

## 4. 아직 가설인 것

- 고비용 fragment 작업과 completion/driver scheduling이 지배적이라 proxy vertex·shadow draw 절감의 완료시간 효과가 작거나 순서/부하 변동에 가려졌을 수 있어. GPU time·fragment invocation·프로세스 전체 CPU·고정 열/클럭 기록이 없어 확정 못 해.
- Box rasterization/삼각형 경계/driver 처리나 돔 draw order 변화가 이 환경의 완료시간에 영향을 줬을 수도 있어. 개별 변경만 켜고 끄는 A/B를 하지 않아 Box가 느려짐의 원인이라는 결론은 금지야.
- effects index1의 renderer.render spike에 driver stall, 아직 예열되지 않은 효과 program/state 또는 command flush가 관련될 수 있어. 트레이스/해당 효과별 program-readiness/driver counter가 없어 어느 원인도 확정 못 해. dome readiness는 모든 효과 program을 보증하지 않아.
- 첫 AB 순서에 따른 호스트 시스템 변동이 세계·중계 시간 증가 일부를 만들었을 수 있어. 역순반복으로도 기기 열/백그라운드 변수를 모두 통제하지는 못해.

현재 근거로는 Box를 회귀 원인으로 확정하거나, shared shadow 호출 감소를 전체 시간 개선으로 환산하거나, 동기 완료시간을 FPS로 바꾸면 안 돼.

## 5. 코드·원본 근거와 다음 반복

코드 행은 후보dea7997 기준이야. JSON codeReferences에 pinned SHA256와 검토한 행을 남겼어. 주요 위치는 main의 shadow설정97~101/1965~1983, dome3d의 shader16~530와 proxy534~543/update618~628, domeshow의 high프로필684~690과 shader640~679, vendor Three의 shadow guard9143~9148/reset9427이야.

원본 두 JSON 경로/해시와 이전 리뷰해시는 JSON에 있어. 제품·도구·원본은 변경하지 않았어. 계획26/27의 candidate-b→baseline-b 역순 high 쌍은 아직 닫힌 결과가 없어서 미검토야. 완료되면 fixture·source·readiness 일치부터 확인하고 별도 반복으로 추가할 예정이야.
