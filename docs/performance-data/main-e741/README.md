# e741 → 6c78172: 최신 main 통합 검증 원본

제품 기준은 `e741811d1d7a040afcdd3a8230465980c64f82fc`, 후보는
`6c7817218814f00631089eb2c6f150d68190980f`로 고정했어. 뒤의 문서·검증 도구
커밋은 제품 코드를 바꾸지 않아. 실제 제공된 코드의 SHA-256은 각 raw에 있어.

## 닫힌 첫 체크포인트

- `high-plan.json`: desktop high A→B / B→A, 두 공연장, 총 8개 실행.
- `high/`: 각 실행의 raw JSON, 종료 wrapper, stdout/stderr, 진행 기록.
- [high 비교표](high-summary/summary.md): 4/4쌍, 18개 장면 행의 조건·해시 검증 통과.
- `high-image-manifest.json`: 원본 캡처 36장의 크기와 SHA-256. PNG는 최종 증거 묶음으로 제공해.
- `node-files/`: Node 회귀 11개 파일을 각각 직접 실행한 로그. 실제 case 79개 통과.
- `syntax-integration.json`: 제품 JavaScript 46개 구문 검사.
- `measurement-manifest.json`: 원본 제품·수집기와 환경 기록.
- `source-manifest.json`: 위 원본을 집계기 `files[]` 형식으로 변환한 기록.
- `chromium.json`: 이 환경의 실제 Chromium 실행 설정.

이 체크포인트는 전체 검증 완료를 뜻하지 않아. 후속 화질·기기·재생·입력·로딩
결과는 최종 보고서에서 별도로 구분해. 과거 `1f→dea` 자료를 최신 결과에 합치지 않아.

## 해석

Linux x64 / Node 24.19.0 / Playwright 1.62.1 / Chromium 153.0.8010.0,
ANGLE SwiftShader, headless에서 실행했어. 물리 GPU 장치 노드는 없고,
브라우저가 보고한 hardwareConcurrency는 9야. 기기·온도·발열 성능 실측이 아니야.
Google Fonts 대신 같은 시스템 폰트 조건을 사용했어.

동기 suite는 원래 `frame()`을 실행한 뒤 `readPixels` 완료를 기다려 시간을 재.
**이 시간의 역수를 앱 FPS로 쓰지 않아.** 장면당 2회 준비 뒤 4회 표본이므로
p95/p99는 최대 표본과 같고 1% Low는 미측정이야. GPU timer 확장이 있어도
이 suite는 GPU 프레임 시간을 수집하지 않았고 VRAM 역시 미측정이야.

합성 fixture는 같은 관객 계획·카메라·음악 시각·연출을 만들지만 실제 음표
스케줄러를 끈 상태야. 실제 재생/입력 suite와 범위가 다르므로 각 결과의 method를 읽어.
Sphere의 `crowd=11076`은 계획상 점유 인원이며 표시 LOD 상한과 같지 않아.
화질을 낮추거나 관객을 추가로 줄여 얻은 같은 품질 개선으로 제시하지 않아.

Hall front의 완료시간 감소와 제출 삼각형 감소는 두 실행 순서에서 재현됐어.
Sphere wide·forest 및 Hall broadcast-hidden의 악화도 원본 표에 그대로 남겼어.
Sphere 전반의 FPS가 좋아졌다는 결론은 이 자료가 뒷받침하지 않아.

## 재현

[PC 재현 안내](../../performance-reproduce-e741.md)에 별도 worktree와 포트,
소프트웨어 옵션 제거, 실제 renderer 확인, Windows/Bash 실행법, 시간 제한,
진행 기록, 중간부터 재개, 이미지 비교, 측정 해석을 설명했어.

이 폴더를 저장소에서 그대로 사용하면 아래 명령으로 원본 집계를 다시 만들 수 있어.
출력은 새로운 폴더로 지정해.

```bash
node tools/bench/collect-plan.mjs \
  --plan docs/performance-data/main-e741/high-plan.json \
  --root docs/performance-data/main-e741/high \
  --manifest docs/performance-data/main-e741/source-manifest.json \
  --output qa-results/recollect-e741-high
```

다른 PC에서 새로 측정할 때는 원본 plan의 클라우드 경로와 SwiftShader 플래그를
그대로 쓰지 말고 재현 안내대로 새 plan을 만들어. 기존 raw와 실패 로그는 덮어쓰지 않아.
