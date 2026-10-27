# 후면 자동 카메라 검사

2026-10-25 KST. 전용 cdp-direct Chrome 9225, 서버8096. 제품 카메라의 자연 편집을 실시간 녹화했으며 재생속도·카메라 위치·편집 시각을 검사 목적으로 바꾸지 않았다. 곡 선택 및 시작 위치 seek만 사용했다.

- focused cinema-program 11개 통과. 후면3종 순환, 독주, 모든파트의 경계/고정악기 회피 포함.
- outdoor-rear.webm/json: 야외 교향곡40번 120초. rear-ensemble 및 rear-shoulder.
- hall-rear.webm/json: 홀 아름답고푸른도나우 40초. rear-shoulder.
- sphere-rear.webm/json: 스피어 발퀴레의기행 40초. rear-oblique.
- piano-portrait-rear.webm/json: 야외 환상즉흥곡, 세로390×844 Chrome 에뮬레이션, 40초.

각 JSON에 제품 소스 해시, 선택된 단원의 음표 활성 여부, 8~12초 hold, 페이지 visibility와 콘솔 오류가 있다. `outdoor-sequence.jpg`는 자연 편집 순서이며 `rear-motion-sequence.jpg`는 후면 장면의 시작과 끝 프레임이다. 카메라 내부 통과나 지형 관통은 확인한 프레임에서 보이지 않았다. 전곡·전단원의 모든 동작 조합이나 실제 iPhone/Safari 검증은 아니다.

## 검사 도구 재시도

첫 180초 녹화는 Puppeteer 기본 protocolTimeout180초에 걸려 저장하지 못했다. connect protocolTimeout240000으로 늘리고 120초로 재녹화했다. 첫 홀 녹화는 다음 검사를 너무 일찍 실행하여 기존 QA탭이 닫혔다. 홀을 단독으로 다시 녹화했다. 둘 다 제품 런타임 오류와 구분한다. 최종 완료한 JSON만 결과로 사용한다.

최종4개 JSON 모두PASS. 총240초24장면/후면5장면. 제품JS SHA-256 `45419db4520f32265f7b6e723c27ad5596a9d764f80960822d1aa6c8daa8878a` 동일. 피아노세로 시작/끝프레임에서 연주자와건반일부가왼쪽전경에보이고관통은없었다. 피아노전체를넣는구도는아니다. 9225의8096검사탭은종료했고남은앱탭0개를확인했다.
