# 오디오 렌더 검증

## 확인한 범위

- 신규 30곡 각각 18초, 위풍당당 전체판의 4개 구간 각각 16초를 렌더했다. 합계 34구간 / 음악 604초다. 각 렌더에는 마지막 잔향 3초를 추가했다.
- 실제 앱의 `AudioEngine`, `Performance.prepare`, 샘플 정규화, 음량 조절, 공간 음향·잔향·컴프레서·리미터를 사용했다. 48 kHz 스테레오 Chromium `OfflineAudioContext`, 음량 0.8, 청취 위치 (0, 1.5, 8)이다.
- 695개 MP3 샘플을 브라우저에서 실제 디코딩했고 실패는 0개였다. 신규 30곡 전체의 정적 검사와 별개로 각 곡의 오디오가 생성되는지 확인했다.
- 각 구간에서 무음 아님, 비정상 수치 NaN/Infinity 0, 절댓값 1 이상인 클리핑 표본 0, 렌더 예외 0을 확인했다. 관측 최대 피크는 0.752122이다. 원시 결과는 [JSON](evidence/repertoire/offline-audio-summary.json)에 있다.

## 절차

1. 로컬 서버를 실행한 뒤 `cdp-direct launch --port 9223 --headless --profile <작업용 경로>`로 별도 검증 브라우저를 실행했다.
2. `cdp-direct new http://127.0.0.1:8096/favicon.svg --port 9223`으로 같은 출처의 빈 문서를 열었다. 실제 앱을 켠 9222 포트의 검증 탭과 분리했다.
3. `tools/qa/render-repertoire.js` 내용을 `cdp-direct eval`로 실행했다. 이 파일은 샘플 은행을 로드하고 `window.renderRepertoireExcerpt(id, start, length, venue)` 함수를 제공한다.
4. 처음 8곡은 시작부/금관/합창/첼레스타/대편성 구간을 골랐다. 나머지 22곡은 음표가 가장 많은 10초 구간의 2초 전부터 18초를 검사했다. 위풍당당은 0·124·320·386초에서 각 16초를 검사했다.
5. 전체 스테레오 PCM 표본으로 peak, RMS, clipping, nonfinite를 계산했다. `window.repertoireWav(id)`는 마지막 렌더의 WAV를 추출한다.

## 구간별 실제 결과

| 곡 ID | 시작초 | 길이초 | 피크 | RMS | 클리핑 / 비정상 표본 |
|---|---:|---:|---:|---:|---:|
| beethoven-symphony-5 | 0 | 18 | 0.4264 | 0.0577 | 0 / 0 |
| strauss-blue-danube | 185 | 18 | 0.3596 | 0.0585 | 0 / 0 |
| handel-hallelujah | 35 | 18 | 0.2913 | 0.0525 | 0 / 0 |
| chopin-nocturne-9-2 | 0 | 18 | 0.3952 | 0.0596 | 0 / 0 |
| tchaikovsky-sugar-plum | 0 | 18 | 0.0695 | 0.0104 | 0 / 0 |
| khachaturian-sabre-dance | 25 | 18 | 0.1398 | 0.0265 | 0 / 0 |
| prokofiev-dance-knights | 60 | 18 | 0.1825 | 0.0206 | 0 / 0 |
| tchaikovsky-1812 | 760 | 18 | 0.3162 | 0.0511 | 0 / 0 |
| elgar-pomp-and-circumstance | 0 | 16 | 0.4349 | 0.0495 | 0 / 0 |
| elgar-pomp-and-circumstance | 124 | 16 | 0.6088 | 0.0935 | 0 / 0 |
| elgar-pomp-and-circumstance | 320 | 16 | 0.5929 | 0.1150 | 0 / 0 |
| elgar-pomp-and-circumstance | 386 | 16 | 0.5301 | 0.0664 | 0 / 0 |
| mozart-eine-kleine | 308 | 18 | 0.5641 | 0.0581 | 0 / 0 |
| vivaldi-spring | 88 | 18 | 0.4261 | 0.0553 | 0 / 0 |
| pachelbel-canon | 88 | 18 | 0.3684 | 0.0603 | 0 / 0 |
| mendelssohn-wedding-march | 98 | 18 | 0.5016 | 0.0801 | 0 / 0 |
| chopin-minute-waltz | 58 | 18 | 0.4306 | 0.0723 | 0 / 0 |
| brahms-hungarian-dance-5 | 68 | 18 | 0.3737 | 0.0637 | 0 / 0 |
| strauss-radetzky-march | 18 | 18 | 0.7521 | 0.1458 | 0 / 0 |
| mozart-lacrimosa | 198 | 18 | 0.5359 | 0.0877 | 0 / 0 |
| dvorak-new-world-4 | 548 | 18 | 0.4635 | 0.0755 | 0 / 0 |
| grieg-morning-mood | 168 | 18 | 0.3288 | 0.0532 | 0 / 0 |
| tchaikovsky-piano-concerto-1 | 688 | 18 | 0.5560 | 0.0967 | 0 / 0 |
| tchaikovsky-swan-lake | 88 | 18 | 0.2117 | 0.0394 | 0 / 0 |
| grieg-mountain-king | 128 | 18 | 0.3938 | 0.0728 | 0 / 0 |
| rossini-william-tell | 18 | 18 | 0.2178 | 0.0360 | 0 / 0 |
| wagner-valkyries | 298 | 18 | 0.5031 | 0.0762 | 0 / 0 |
| strauss-zarathustra | 48 | 18 | 0.3034 | 0.0542 | 0 / 0 |
| ravel-bolero | 668 | 18 | 0.3823 | 0.0563 | 0 / 0 |
| rimsky-bumblebee | 38 | 18 | 0.3625 | 0.0554 | 0 / 0 |
| bizet-toreador | 18 | 18 | 0.3223 | 0.0425 | 0 / 0 |
| bizet-habanera | 178 | 18 | 0.2367 | 0.0383 | 0 / 0 |
| offenbach-can-can | 78 | 18 | 0.1708 | 0.0254 | 0 / 0 |
| tchaikovsky-waltz-flowers | 448 | 18 | 0.2651 | 0.0332 | 0 / 0 |

## 판단의 한계

- 이는 실제 엔진으로 생성한 음향 신호의 검사다. 자동 렌더만으로 듣기 좋은 정도나 유튜브 실황과 같은 연주 품질을 판정하지 않는다. 스피커·헤드폰으로 직접 청취했다고 주장하지 않는다.
- 오프라인 렌더는 실시간 오디오 끊김, GPU 부하, 모바일 발열, iOS Safari의 메모리 제약을 검증하지 않는다. 실제 브라우저 UI/AudioContext/단기 프레임 관측은 [GPT-6 Sol medium 검증 기록](repertoire-validation.md)에 따로 남겼다.
- 전체 곡을 처음부터 끝까지 청취한 것이 아니다. 82곡 전체는 구조·샘플 참조·메타데이터를 검사했고, 변경된 31곡은 위 표의 일부 구간에서 음향 신호를 검사했다.
- 난수로 만드는 잔향과 디튠 때문에 재실행 시 PCM 표본과 소수점 측정치는 조금 달라질 수 있다. 악보 JSON 빌드는 결정적이며 `--check`로 비교한다.
