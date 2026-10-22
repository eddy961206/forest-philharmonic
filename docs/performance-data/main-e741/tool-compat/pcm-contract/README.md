# 박수 PCM 기대값 정정

2026년 재실행의 loading Hall/Sphere × baseline/candidate 4조건은 실제 박수 버퍼가 모두 15,552,000바이트인데 수집기가 구형 값 14,288,400바이트를 고정으로 기대해서 실패했어. 이 기록은 그 **수집기 기대값 오류**를 바로잡는 작업이야. 제품·음질·버퍼·시나리오를 변경하지 않았고 기존 FAIL 파일도 수정하거나 새 결과로 덮어쓰지 않았어. 해당 원문 경로와 SHA-256 및 실패 내용은 `manifest.json`의 `pastFailureArtifactsReadOnly`에 있어.

## 명시적 계약

| 원본 형식 | profile | 각 profile의 layer | 버퍼 sampleRate | people 합성 설정 | 예상 전체 PCM |
|---|---|---|---:|---|---:|
| 구형 desktop/Lite | welcome 5.5초, normal 10초 두 개, finale 15초 | stereo mix 1개 | 44,100 Hz | 120 / 170 / 170 / 240 | 14,288,400 B |
| e741 desktop | 같은 4개 duration | stereo close + stereo wash | 24,000 Hz | profile마다 320 | 15,552,000 B |
| e741 Lite | 같은 4개 duration | stereo close + stereo wash | 16,000 Hz | profile마다 200 | 10,368,000 B |

seed는 순서대로 11/21/22/31이며 finale만 rhythmic=true야. 각 버퍼는 `floor(seconds × sampleRate) × channels(2) × Float32 bytes(4)`로 계산하고 모두 합해. **people/seed/rhythmic은 원본 코드에서 가져온 기대 합성 설정이야. PCM 메타데이터만 읽어서 실제 사람 수나 난수 seed를 측정했다고 주장하지 않아.** 합성 PCM 자체의 동일성은 별도의 audio-worker 검사가 담당해.

`browserState`가 실제 profile 이름·layer 이름·길이·채널·sampleRate·버퍼 수를 수집해. `auditApplausePcm`은 알려진 두 레이아웃에 대해 각 필드를 정확히 검사하므로 전체 바이트 수만 우연히 같아도 통과하지 않아. 혼합 레이아웃, 알 수 없는 pair 필드, 다른 sampleRate, 누락·추가 버퍼, 잘못된 profile 이름/길이/채널 또는 Lite 여부가 불명확하면 FAIL이야. 새로운 합성 정책이 추가되면 도구 계약도 근거와 함께 갱신해야 해.

loading의 cold/warm 결과와 audio-stability의 boot 결과에 `applausePolicy`의 실제·기대 정보와 불일치 필드를 저장해. 비교 도구도 전후 실제 `applause` profile 메타데이터를 비교해. 기존 비교의 샘플·관객·캐시·시계·오디오 late-note 조건은 그대로야.

## 실제 실행 및 재현

```sh
cd /workspace/scratch/25707ad85ea4/forest-philharmonic
node tests/applause-contract.test.mjs
node tools/bench/loading.mjs --help
node tools/bench/audio-stability.mjs --help
node tools/bench/compare-loading.mjs --help
```

Node 검사 4개는 구/신 desktop/Lite 전체 합계와 설정, 합계가 같아도 개별 buffer가 틀리면 실패하는지, 알 수 없는 구조·누락·추가 거부, 실제 `browserState` 함수의 metadata 수집을 stub 환경에서 확인했어. 테스트·help의 실제 stdout/stderr와 종료 코드는 이 디렉터리에 있어. **여기서 브라우저를 실행하지 않았어.** 수정된 도구를 통한 실제 loading/audio-stability 재실행 결과는 별도로 남겨야 해.

## 함께 확인한 구형 가정

- `loading.mjs`와 `audio-stability.mjs`에 있던 14,288,400 상수 두 곳을 이 계약으로 대체했어.
- `audio-resume`의 유지음 경로 오판정은 별도 `held-note-audit/`에서 다뤘어. 원래 2초 재개 조건은 byte-for-byte 같아.
- 관객 `#optAudience`/`settings.audience`와 seed의 `const rand` 앵커 문제는 앞선 체크포인트에서 구/신 관객 API를 구분하도록 고쳤어.
- 샘플 389/207개와 기본 Hall/Sphere 곡 기대값은 확인한 e741 소스·실제 로딩 결과에서 유지되어 변경하지 않았어.
- audio-stability는 곡 시작부터 61~68초까지 관찰하고 seek/resume을 하지 않아. 최초 `play()`의 `pos=0`에서는 유지음 재개 요청이 없으므로 현재 신규 음표 목록 검사는 그대로 적용돼. 이 검사를 유지음 검증으로 해석하면 안 돼.
- `audio-worker.mjs`는 최신 close/wash 합성의 desktop/Lite 및 Worker/fallback 검증 도구야. 그 버전은 구형 단일-buffer 제품에 대한 호환 실행기로 표시하지 않아.
