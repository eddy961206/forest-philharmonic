# 첼로 도달 범위 후속 수정

첫 수정의 전체 하네스 실패(92건)는 ../initial-failure/motion-audit.json에 보존했다. 활 끝의 최대 스트로크에서 악기를 앞으로 옮긴 만큼 오른팔이 과신전됐다.

string-rigs.js에서 첼로 활 스트로크 범위를 실제 오른어깨 좌표·두 팔뼈 길이·기존 최소 팔굽힘각으로 계산했다. 활의 현 접점과 손의 frog 접점은 보존하고, 활을 실제 도달 구간 안에서 움직인다. 손목을 따로 순간이동하거나 팔 길이·기존 허용값을 바꾸지 않았다.

첫 재검사에서 프로코피예프 피치카토 3프레임이 남았다(최대3.046cm). 이 실패는 motion-audit-first-fix-failed.json에 보존했다. 첼로는 브리지보다 위 지판 하단 근처에서 현을 뜯으므로 피치카토 접점을 악기 길이방향으로 .12 올렸다.

최종 검사: 106곡,51명,30rig,177660프레임,6106750팔샘플, failures=[] 및 exit0. 전체 팔접점 최대오차 0.0250940872. 원래3cm기준 유지. 최종 첼로 요약:

```json
{
  "id": "cello",
  "frames": 0,
  "armSamples": 483316,
  "nonFinite": 0,
  "maxContactError": 0.016108981977477035,
  "maxBoneError": 2.220446049250313e-16,
  "maxStep": 0.1211577187970821,
  "maxHandleGap": 0,
  "minBeaterHeadClearance": null,
  "minFlex": 0.17453292519943253,
  "maxFlex": 2.297330548119083,
  "failures": []
}
```

회귀 테스트는 tests/cello-seated-clearance.test.mjs이며 함수와 들여쓰기를 정리했다. 두 실제 첼로 CAST·전체 활 끝 요청·휴식·부분준비·피치카토와 실제 악기 메시-다리 capsule 간격을 검사해 통과했다.

최종 녹화는 after-cello-0/1.mp4(각6초 무음, 실제 바흐Air 연주), 사진은 after-cello-0/1.png. 영상 3초 프레임도 직접 확인했고 다리 관통 해소와 활 그립을 확인했다. 수정 전 사진은 ../cello-before.png다. 카메라만 근접 고정했으며 연주 애니메이션을 교체하지 않았다. 기존 전후 증거는 덮어쓰지 않았다.

브라우저 9224를 일시정지 상태로 root에 반환했다. 최종 전체 verify는 root에서 별도 진행한다.
