# 브레멘의 밤손님

사용자의 “브레멘 음악대 키워드로 아이디어를 내서 구현” 요청으로 만든 작은 동화책 공연이야. 구현 커밋은 `404739ec6bfdc3cf6b8574a0da26423bbdb50881`이야. 주 에이전트가 직접 구현·검증했고 서브에이전트는 사용하지 않았어.

## 찾아가는 방법

1. 홀 또는 스피어에 입장해.
2. 화면 아래 **프로그램**을 열어.
3. 곡 목록 맨 아래 **작은 발자국**을 네 번 눌러. 중간에 6초 넘게 쉬면 처음부터 다시야.
4. 한 번 발견한 뒤에는 버튼이 **브레멘의 밤손님**으로 바뀌고 한 번 눌러 다시 볼 수 있어.

발견 여부만 로컬 저장해. 저장소가 막혀 있어도 현재 페이지에서는 발견과 재생이 가능해. 키보드로 버튼에 이동한 뒤 Enter/Space로도 찾을 수 있어.

## 공연과 소리

달빛과 숲속 집을 배경으로 당나귀 → 강아지 → 고양이 → 수탉이 차례로 어깨를 빌려 탑을 쌓아. 원래 그린 SVG 동화책 무대와 짧은 등장·연주 움직임을 사용해. 본 공연의 3D 캐릭터를 교체하는 기능은 아니야.

네 친구는 **튜바·클라리넷·피치카토 현악·트럼펫**으로 약 **26.9초**의 오리지널 소품을 들려줘. 112BPM, 12마디, 음표 116개야. 외부 노래나 녹음을 복사하지 않았어. 이미 준비한 앱의 악기 샘플을 재사용해서 오디오 시계에 예약하고, 좌우 위치·음량 변화·짧은 페이드로 합주해.

- 기존 마스터 음량과 음소거를 따라가. 새로운 AudioContext나 샘플 다운로드를 추가하지 않아.
- 혼자 감상하며 재생 중이었다면 그 곡을 잠시 멈추고, 닫을 때 같은 곡·연주 단계가 유지될 때 이어서 재생해. 원래 정지한 곡은 재생하지 않아.
- 같이 보는 방에서는 방의 재생 명령을 보내지 않아. 로컬 본 공연 소리만 잠깐 줄여. 실제 두 사용자 방에서의 통합 검사는 이번에 하지 않았어.
- 닫기·Esc·다른 앱 대화상자·페이지 숨김에서 예약 음성과 노드를 정리해. 다시 재생한 뒤에도 기존 공연 단축키가 뒤에서 동작하지 않게 했어.
- 동작 줄이기 환경에서는 네 친구를 정적으로 보여줘. 곡이 끝나면 일반 환경에서도 작은 흔들림을 멈춰.

숨겨져 있을 때 DOM 공연도 생성하지 않아. 새 WebGL 모델·조명·텍스처·상시 애니메이션 루프는 0개야. 소스 모듈과 발견 버튼은 페이지에 포함돼. 실제 공연 창을 열 때만 SVG와 음성 노드를 만들어.

## 검증 방법과 결과

Chrome 156 / M4 Mac mini, 기존 앱 CDP 9224에서 검사했어. 도구는 사용자 지시에 따라 cdp-direct로 실제 버튼을 누르고, 같은 브라우저의 Puppeteer로 상태를 기록했어. 실제 화면은 [데스크톱](evidence/quality-preserving-optimization/bremen-desktop.png)과 [390px 화면](evidence/quality-preserving-optimization/bremen-mobile.png)에 있어.

| 검사 | 결과 |
|---|---|
| 발견 | 프로그램 → 발자국 네 번 클릭으로 실제 대화상자 열림 |
| 홀 전곡 | 약 27초 뒤 종료 문구, 남은 예약/재생 음성 0 |
| 재생 중 K 입력 | 본 공연 계속 일시정지, 단축키 관통 없음 |
| 다시 듣기 → Esc | 본 공연 재개, 프로그램 패널 유지, 발자국 버튼으로 초점 복원 |
| 빠른 열기/닫기 3회 | 매번 음성 0, 최종 원래 makeup gain 12 복원 |
| 스피어 390×844 | 대화상자 x=17, 폭=356, 높이≈504 CSS px, 가로 넘침 없음 |
| 스피어 전곡 종료 | 음성 0, 캐릭터 animation=none |
| 재생 중 동작 줄이기 | 음성 116개 예약 상태에서 animation=none, opacity=1 |
| 일반 동작 재개 | 같은 캐릭터에 등장/흔들림 animation 적용 |
| 앱 도움말로 교체 | 브레멘 닫힘, 음성 0, helpClose 초점, 원래 음량으로 복원 중 |
| 유지 관리 테스트 | `npm test`: 222/222 통과 |
| 브라우저 pageerror | 기록한 기능 검사에서 0 |

독립 OfflineAudioContext에서 현재 앱이 디코딩한 샘플을 재사용해 48kHz 스테레오 27.914초를 렌더했어. 마스터 gain 0.8, 실제 미니어처와 같은 사전 믹스 경로를 사용했고 본 공연의 리미터는 적용하지 않았어.

- 음표 116개, 누락 악기 0.
- peak **0.289815**, RMS **0.040764**; NaN/Infinity 없음, 클리핑 없음.
- stop 후 예약/재생 음성 0.

이는 신호와 정리 검증이야. 직접 스피커·헤드폰 청취의 음악적 평가로 해석하지 않아. 실제 iPhone/iOS Safari, 두 기기의 함께 보기와 장시간 사용은 미검증이야.

## 검사 중 수정한 문제

1. ‘한 번 더 만나기’를 비활성화하며 초점이 빠지면 Esc가 뒤의 프로그램 패널까지 닫았어. 닫기 버튼으로 초점을 옮기고, 대화상자가 열린 동안 문서에서 기존 공연의 키 이벤트 전파를 차단했어. 재검사에서 패널 유지와 초점 복원을 확인했어.
2. 빠르게 다시 열면 원래 음량으로 돌아가는 페이드의 중간값을 저장해 점차 작아졌어. 오디오 노드마다 최초의 원래 값만 보관하도록 바꾸고, 3회 반복 뒤 12로 복원된 것을 확인했어.
3. 다시 재생한 직후 출력 지연 중에 열면 transport의 일시정지 위치가 조금씩 앞당겨질 수 있었어. 작은 공연으로 들어갈 때 재개 시작 위치보다 앞서지 않게 했어.
4. 첫 자동화는 터치 에뮬레이션 전환이 페이지를 재로딩하는데도 기존 버튼을 눌러 중단됐어. 모바일 페이지를 새로 입장한 뒤 별도로 검사했어. 중단 시도를 모바일 성공 근거로 사용하지 않았어.

## 기록과 재현

[기능 원시 기록](evidence/quality-preserving-optimization/bremen-check.json), [모바일](evidence/quality-preserving-optimization/bremen-mobile-check.json), [재생 중 동작 줄이기](evidence/quality-preserving-optimization/bremen-accessibility.json), [대화상자 교체](evidence/quality-preserving-optimization/bremen-dialog-replacement.json)를 보관했어. [테스트 로그](evidence/quality-preserving-optimization/tests-final.txt)와 SHA-256 manifest도 같은 폴더에 있어.

전용 Chrome 9224와 후보 서버 8096이 준비된 상태에서 저장소 폴더에서 실행해. 자동화 전에 발자국을 한 번 발견해야 재개 테스트를 실행할 수 있어.

```sh
node tools/qa/quality-optimization-measure.mjs bremen-ready hall 1 plain
node tools/qa/quality-optimization-bremen.mjs
MOBILE=1 node tools/qa/quality-optimization-measure.mjs bremen-mobile-ready sphere 1 plain
node tools/qa/quality-optimization-bremen-mobile.mjs
npm test
```
