# 고정 품질 28개 실행 완료 증거 체크포인트

**수집·집계가 28개 모두 성공했다는 뜻이야. 28개 모두 성능이 개선됐다는 뜻은 아니야.** 같은 품질 비교 14쌍·140개 장면 행을 원본 그대로 공개해. 시간이 늘어난 행, Draw Calls가 늘어난 행도 삭제하거나 평균으로 감추지 않았어. 성능·화질의 최종 결론은 반복 측정과 별도 검토를 함께 읽어야 해.

## 포함한 파일과 출처

| 종류 | 수 | 공개 위치 |
| --- | ---: | --- |
| 전체 프레임 raw JSON | 28 | `render/` |
| 닫힌 실행 wrapper JSON | 28 | `logs/` |
| 실행 stdout/stderr 원문 로그 | 28 | `logs/` |
| 원래 계획·제품 manifest·당시 도구 manifest | 3 | `render-plan.json`, `source-manifest.json`, `collector-manifest.json` |
| 임시 수집 위치 → canonical 전송 기록 | 2 | `transfer-render-plan-0-4.json`, `transfer-render-plan-4-28.json` |
| 완료 집계 JSON·Markdown | 2 | `analysis/` |
| PNG | 280 | **Git에 복사하지 않았어.** `inventory.json`에 원본 경로·바이트 수·SHA만 기록했어. |

원본 파일 **91개 / 6,705,014바이트**를 binary copy했고, 모든 목적지 파일을 원본과 바이트 단위로 대조했어. `logs/`·`render/` 구조와 각 원문 안의 경로·타임스탬프·수치·판정은 바꾸지 않았어. 생성 문서는 이 README·inventory·SHA256SUMS뿐이야. 원본 JSON은 당시 절대 경로를 유지하므로, 파일별 공개 경로 연결은 [inventory.json](inventory.json)을 확인해.

PNG **280개 / 80,821,821바이트**는 원본 바이트의 SHA만 계산했어. 이 큐레이션에서는 복사·이미지 디코딩·육안 검토·SSIM을 하지 않았어. PNG를 포함한 **전체 원본 아카이브는 후속 제공 예정이며 이 체크포인트 시점에는 아직 생성·제공되지 않았어.** 이 Git 폴더를 전체 이미지 증거 아카이브로 간주하면 안 돼.

기존 high·desktop medium/low·runtime·reviews 체크포인트는 수정하지 않았어. 이 폴더의 중복 파일은 전체 fixed 계획을 한곳에서 다시 확인하기 위한 독립 복사본이야. runtime 000–007 요약기의 별도 공개 큐레이션은 이번 묶음에 포함하지 않았어.

## 수치의 의미

[완료 표](analysis/summary.md)와 [전체 JSON](analysis/summary.json)의 **140행은 `frame()` 전체 호출과 동기 `readPixels` 완료 시간(ms)** 비교야. GPU 완료 대기와 수집 도구의 오버헤드가 포함돼. **실제 앱 FPS·1% Low FPS·순수 GPU 시간으로 환산하거나 표현하면 안 돼.** summary의 PASS는 계획·출처·조건 검사와 집계 완료 상태야.

각 장면은 warmup 4프레임 후 표본 8개야. 이 작은 표본의 p95/p99는 최대 한 프레임에 좌우될 수 있어. 같은 실행 안의 8프레임이나 여러 장면을 독립적인 여러 번의 실행처럼 세지 않아. CDP TaskDuration 같은 누적 경과 시간 차이를 CPU 사용률로 읽지 않고, ThreadTime 및 JS heap·텍스처/geometry 개수도 각 정의에 따라 별도로 봐야 해. 실제 GPU 시간·VRAM 사용량은 이 고정 sync 집계에서 미측정이야.

이 fixture는 음악 시각·카메라·관객 시드를 통제하고 **실제 음표 스케줄러를 꺼 둔 렌더 비교**야. 실제 음악과 GPU 부하를 함께 관찰한 오디오 검증, 물리 출력 음질·AV 동기화, 이동 체감 FPS, 배터리·발열 검증을 대신하지 않아. 적응형 품질 관찰도 이 고정 품질 140행과 별개야.

## 반복과 아직 남은 검토

| 범위 | 이 28개에 포함한 순서 | 반복 해석 |
| --- | --- | --- |
| Hall·Sphere desktop high | a: baseline → candidate, b: candidate → baseline | 공연장별 ABBA 순서를 포함해. a와 b 사이에는 다른 품질·기기 실행이 있어 연속 네 번의 실행은 아니야. |
| desktop medium·low | a: baseline → candidate | 각 설정 한 쌍이야. |
| mobile high·medium·low | a: baseline → candidate | 각 설정 한 쌍이야. |

low·mobile의 추가 역순 반복은 **별도 수집·검토 대기 범위**이며 이 폴더에는 들어 있지 않아. 전체 28개 실행의 이미지 품질 비교와 최종 시각 판정도 후속 검토 대상이야. 이미 있는 일부 장면 검토를 전체 이미지 품질 검증 완료로 넓혀 읽으면 안 돼. 고정 조건이 맞는다는 집계 판정 자체가 픽셀·시각 품질 동등성을 증명하지 않아.

Mobile은 Chromium의 viewport·UA·touch 에뮬레이션이야. 특히 LITE 경로의 shader world와 실제 3D cubemap 경로를 같은 실험으로 묶으면 안 돼. raw의 실제 world·render path·pixel ratio를 읽어야 하며, 장면 이름 `peaks`·`crossfade`만 보고 실시간 3D 세계 성능이라고 주장하면 안 돼.

## 고정 버전과 환경

- 기준 제품: `1f8e5f16f1eee03140e13ba1ee66832841559604`.
- 후보 제품: `dea7997c6278f10ff467815ab96b370362549b0c`. 이후 브랜치 HEAD와 혼동하지 말아줘.
- 실제 응답 소스의 전후 SHA가 측정 코드의 근거야. manifest에만 있고 HTTP 응답 SHA가 없는 파일은 summary의 `sourceCoverage.notServedHashed`에 남아 있어.
- Chromium `153.0.8010.0`, Playwright `1.64.1`, Linux x64, headless, SwiftShader 소프트웨어 렌더러, local font 조건이야. 물리 PC GPU·실물 iOS/Android 결과가 아니야.
- 렌더 수집기 SHA: `2bf556b443cd64df6b4d743ec45e11dc382e6a9014083054472ddb39919d37c9`.
- fixture SHA: `262b5f126c6214d1875010056da4327117af2c764dab8d04854dc4b709871d98`.
- browser helper SHA: `90e571499532eb894d96ec8b015c9da08a3b0f62c59b5e51b5534258321255c9`.
- 집계기 SHA: `9305ce824c4c7f3ff2af6d1bff5e50e70acbcc279bf6561b32e60a3f1eeb15e2`.
- 계획 SHA: `6259727537dbd446e56ef3e5fa23b41c847fecd3c17a2a0cc28aa79ff40d8dc1`.
- 제품 manifest SHA: `d28ee8fae2fd8ff836d82855e7b84b749c905cdeb5740d8ed72e562c6730c84d`.

`collector-manifest.json`은 당시 파일을 수정 없이 복사한 거야. 다른 suite의 수집기 항목도 포함하지만 이 폴더에서 그 suite를 실행·통과했다고 주장하지 않아.

## 무결성 확인과 큐레이션 과정

wrapper 28개가 `finishedAt`·`exitCode=0`·`PASS`로 닫혔는지, 각 wrapper의 plan/job/log SHA 및 raw의 identity·수집기·fixture·helper SHA가 맞는지 확인했어. 완료 집계가 참조한 입력 86개와 transfer의 원본 364개(logs/render와 PNG 포함)를 각각 기록된 SHA에 대조했어. 완료 집계는 14쌍·140행·제외 0개이며, 원본의 불리한 수치는 그대로 유지했어.

큐레이션 Python 원문과 실행/결과 증거는 `verification/main-1f/curate-fixed-complete.py`, `curation-fixed-complete.execution.json`, `curation-fixed-complete-result.json`에 별도로 남겨. 기존 목적지가 있으면 거절하고, 새 폴더에만 쓰며, 모든 원본의 SHA를 마지막에 다시 확인해. 이 과정은 파일 수집·검증일 뿐 브라우저나 제품 재실행이 아니야.

공개 폴더에서는 다음으로 파일 해시를 확인할 수 있어.

```bash
sha256sum -c SHA256SUMS
```

`SHA256SUMS`는 복사 원본·README·inventory의 공개 파일 해시를 포함해. PNG 해시는 inventory의 `imagesNotCopied`에만 있으며 파일이 이 폴더에 없으므로 위 명령의 대상이 아니야.
