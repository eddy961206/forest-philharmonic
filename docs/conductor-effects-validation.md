# 지휘 및 단원 효과 검증 — 2026-10-27

- 홀의 밝은 바닥에 NormalBlending과 야외와 같은 조명 세기를 적용. 약한 연주 에너지의 표시를 제곱근 곡선으로 보강.
- 음표는 NormalBlending, toneMapped=false, 크기 .22~.36으로 배경 대비 개선. 기존 저사양 24개 제한 유지.
- 첫 onset을 ready fade가 버리던 문제 수정.
- 지휘자는 악보 강약·음길이·4마디 추정 프레이즈·파트 진입을 캐시하여 표현.

## 검증
- npm run verify:motion -- --out work/conductor-effects-final-verification: pass, failures=[]; 소스 해시와 로그는 evidence/conductor-effects/verification.
- verify-performer-effects.mjs: 홀·스피어·야외 high/off/efficient 통과, pageerror 0. 사진과 4초 영상 보존. 홀 efficient 사진에서 음표 확인.
- record-playing-motion.mjs: 홀 베토벤 5번 30초부터 지휘자 10초 녹화, 601 프레임, pageerror 0.
- 초기 직접 node --test 호출은 three loader 누락으로 실패. 저장소 loader를 지정한 12개 focused 검사 통과.
- 첫 최종 브라우저 실행은 다른 녹화기가 탭을 닫아 중단. 순차 재실행 통과.

## 범위
실제 iPad 및 저사양 기기, 모든 객석 거리의 시인성, 이번 변경 후 FPS는 미측정. 영상은 저장했으며 전체 연속 동작의 수동 재생 검토는 미완료.
