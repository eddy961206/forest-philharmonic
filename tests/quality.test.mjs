import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveQuality } from '../public/js/quality.js';

function feed(c, ms, seconds, policy) {
  const changes = [];
  for (let t = 0; t < seconds * 1000; t += ms) {
    const change = c.sample(ms, policy);
    if (change) changes.push(change);
  }
  return changes;
}

// The venue deliberately gives medium a lower base DPR than low. Include
// fractional device DPRs as well as the 1.25/1.5 preset caps.
const venuePixelRatios = dpr => ({
  high: Math.min(dpr, 1.5),
  medium: Math.min(dpr, 1.25) * 0.85,
  low: Math.min(dpr, 1.25),
});
const effectiveDpr = (state, ratios) => state.scale * ratios[state.quality];

test('진입·한 번의 끊김은 화질을 내리지 않아', () => {
  const c = new AdaptiveQuality();
  assert.equal(feed(c, 100, 6).length, 0);
  assert.equal(feed(c, 1000 / 60, 9).length, 0);
  c.sample(800);
  assert.equal(feed(c, 1000 / 60, 9).length, 0);
  assert.equal(c.quality, 'high');
  assert.equal(c.scale, 1);
});

test('지속 부하에서는 해상도부터 내리고 바닥을 넘지 않아', () => {
  const c = new AdaptiveQuality();
  const changes = feed(c, 30, 13);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].quality, 'high');
  assert.equal(changes[0].scale, 0.9);
  feed(c, 60, 300);
  assert.equal(c.quality, 'low');
  assert.equal(c.scale, 0.6);
});

test('안정적으로 회복되면 해상도와 화질을 한 단계씩 복구해', () => {
  const c = new AdaptiveQuality({ quality: 'low', scale: 0.6 });
  assert.equal(feed(c, 1000 / 60, 18).length, 0);
  const changes = feed(c, 1000 / 60, 130);
  assert.ok(changes.length >= 6);
  assert.equal(c.quality, 'high');
  assert.equal(c.scale, 1);
  assert.ok(changes.every(x => x.reason === 'recovery'));
});

test('큰 지연은 프리셋을 내리되 DPR를 늘리지 않아', () => {
  const c = new AdaptiveQuality({pixelRatios:{high:2,medium:1.25,low:1.25}});
  const changes = feed(c, 100, 13);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].quality, 'medium');
  assert.ok(changes[0].scale * 1.25 <= 2);
});

test('소수 DPR에서 프리셋을 내려도 반올림으로 해상도가 늘지 않아', () => {
  const c = new AdaptiveQuality({quality:'high',scale:0.6,pixelRatios:{high:1.35,medium:1.25,low:1.25}});
  const previousDpr = c.scale * 1.35;
  const changes = feed(c, 100, 13);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].quality, 'medium');
  assert.equal(changes[0].scale, 0.64);
  assert.ok(changes[0].scale * 1.25 <= previousDpr);
});

test('실제 프리셋의 medium 0.6에서 low로 내려도 픽셀 수가 늘거나 바닥에서 재할당하지 않아', () => {
  for (const dpr of [0.875, 1, 1.1, 1.249999999999, 1.25, 1.35, 1.5, 2]) {
    const pixelRatios = venuePixelRatios(dpr);
    const c = new AdaptiveQuality({ quality: 'medium', scale: 0.6, maxQuality: 'medium', pixelRatios });
    const before = effectiveDpr(c, pixelRatios);
    const changes = feed(c, 50, 13);
    assert.equal(changes.length, 1, `DPR ${dpr}`);
    assert.equal(c.quality, 'low');
    assert.ok(Math.abs(c.scale - 0.51) < 1e-12);
    assert.ok(Math.abs(effectiveDpr(c, pixelRatios) - before) < 1e-12);
    assert.equal(feed(c, 100, 120).length, 0, 'the floor must not repeatedly resize the renderer');
  }
});

test('모바일 low에서 회복한 뒤 다시 느려지는 실제 경로도 매번 DPR를 유지하거나 줄여', () => {
  const pixelRatios = venuePixelRatios(2);
  const c = new AdaptiveQuality({ quality: 'low', maxQuality: 'medium', pixelRatios });
  const recovery = feed(c, 1000 / 60, 30);
  assert.equal(recovery.length, 1);
  assert.equal(c.quality, 'medium');
  assert.equal(c.scale, 1);
  const before = effectiveDpr(c, pixelRatios);
  const changes = feed(c, 50, 90);
  assert.ok(changes.some(change => change.quality === 'medium' && change.scale === 0.6));
  let previous = before;
  for (const change of changes) {
    const current = effectiveDpr(change, pixelRatios);
    assert.equal(change.reason, 'load');
    assert.ok(current <= previous + 1e-12);
    assert.ok(current >= 0.6375 - 1e-12);
    previous = current;
  }
  assert.equal(c.quality, 'low');
  assert.equal(c.scale, 0.51);
  assert.equal(feed(c, 50, 120).length, 0);
});

test('실제 high와 medium의 기존 바닥을 유지하고 양방향 프리셋 변경에서 DPR를 올리지 않아', () => {
  for (const dpr of [1, 1.1, 1.25, 1.251, 1.333333333333, 1.37, 1.5, 2]) {
    const pixelRatios = venuePixelRatios(dpr);
    const c = new AdaptiveQuality({ quality: 'high', scale: 0.6, minQuality: 'medium', pixelRatios });
    const before = effectiveDpr(c, pixelRatios);
    assert.equal(c.scale, 0.6);
    assert.equal(feed(c, 100, 13).length, 1);
    assert.equal(c.quality, 'medium');
    assert.ok(effectiveDpr(c, pixelRatios) <= before + 1e-12);
    feed(c, 100, 120);
    assert.equal(c.scale, 0.6, 'the full build still stops at medium scale 0.6');

    c.reset('medium', 1);
    const beforeRecovery = effectiveDpr(c, pixelRatios);
    assert.equal(feed(c, 1000 / 60, 22).length, 1);
    assert.equal(c.quality, 'high');
    assert.ok(c.scale >= 0.6 && c.scale <= 1);
    assert.ok(effectiveDpr(c, pixelRatios) <= beforeRecovery + 1e-12,
      `DPR ${dpr}: rounding a recovery must not increase pixel work`);
  }
});

test('새 low 바닥에서도 곡 사이 회복과 수동 초기화는 범위와 Lite 상한을 지켜', () => {
  const pixelRatios = venuePixelRatios(2);
  const c = new AdaptiveQuality({ quality: 'low', scale: 0.51, maxQuality: 'medium', pixelRatios });
  assert.equal(feed(c, 1000 / 60, 60, { allowRecovery: false }).length, 0);
  assert.equal(c.scale, 0.51);
  const changes = feed(c, 1000 / 60, 180, { allowRecovery: true });
  assert.ok(changes.some(change => change.quality === 'low' && change.scale > 0.51));
  assert.ok(changes.some(change => change.quality === 'medium'));
  for (const change of changes) {
    assert.equal(change.reason, 'recovery');
    assert.notEqual(change.quality, 'high');
    assert.ok(change.scale <= 1);
    assert.ok(effectiveDpr(change, pixelRatios) >= 0.6375 - 1e-12);
  }
  assert.equal(c.quality, 'medium');
  assert.equal(c.scale, 1);
  assert.equal(feed(c, 1000 / 60, 120).length, 0);
  c.reset('low', 1);
  assert.equal(c.scale, 1, 'manual reset keeps the full preset resolution');
  assert.equal(c.raiseBlocked, false);
  c.reset('low', 0);
  assert.equal(c.scale, 0.51);
  c.reset('medium', 2);
  assert.equal(c.scale, 1);
});

test('다음 프리셋 바닥이 현재 DPR보다 높으면 회복으로 큰 렌더 타깃을 만들지 않아', () => {
  const c = new AdaptiveQuality({ quality: 'medium', minQuality: 'medium', pixelRatios: { medium: 1, high: 3 } });
  assert.equal(feed(c, 1000 / 60, 180).length, 0);
  assert.equal(c.quality, 'medium');
  assert.equal(c.scale, 1);
});

test('경계 근처의 부하는 설정을 왕복하지 않아', () => {
  const c = new AdaptiveQuality({quality:'medium'});
  const changes = [];
  for(let i=0;i<40;i++)changes.push(...feed(c,i%2?20:24,3));
  assert.equal(changes.length,0);
});

test('숨긴 탭에서 돌아오거나 수동 선택하면 이전 부하 기록을 버려', () => {
  const c = new AdaptiveQuality();
  feed(c, 30, 9);
  c.reset('high',1);
  assert.equal(feed(c,1000/60,30).length,0);
  assert.equal(c.scale,1);
});

test('가벼운 자동 모드의 회복 상한과 잘못된 입력을 지켜', () => {
  const c = new AdaptiveQuality({quality:'low',maxQuality:'medium'});
  for(const n of [0,-10,NaN,Infinity])assert.equal(c.sample(n),null);
  feed(c,1000/60,120);
  assert.equal(c.quality,'medium');
  assert.equal(c.scale,1);
});

test('입장이나 전환 유예는 이전 느린 관측을 버리고 새 관측부터 판단해', () => {
  const c = new AdaptiveQuality();
  feed(c, 30, 9);
  assert.equal(c.slow, 1);
  c.hold(3500);
  assert.equal(c.slow, 0);
  assert.equal(c.fast, 0);
  assert.equal(c.samples.length, 0);
  assert.equal(feed(c, 100, 3.5).length, 0);
  assert.equal(feed(c, 30, 3).length, 0);
  assert.equal(c.quality, 'high');
  assert.equal(c.scale, 1);
  assert.equal(feed(c, 30, 3).length, 1);
});

test('긴 방해 뒤 유예 끝을 가로지른 프레임은 부하로 누적하지 않아', () => {
  const c = new AdaptiveQuality({ nowMs: 1000 });
  c.hold(3500, 100000);
  assert.equal(c.holdUntil, 103500);
  assert.equal(c.sample(100000, { nowMs: 103600 }), null);
  assert.equal(c.samples.length, 0);
  assert.equal(c.slow, 0);
  assert.equal(feed(c, 30, 3).length, 0);
  assert.equal(c.quality, 'high');
});

test('곡 중에는 해상도를 먼저 조절하고 보통 부하로 프리셋을 바꾸지 않아', () => {
  const playing = { allowPresetChange: false, allowRecovery: false };
  const c = new AdaptiveQuality({ quality: 'high' });
  const changes = feed(c, 30, 100, playing);
  assert.ok(changes.length > 0);
  assert.ok(changes.every(change => change.quality === 'high'));
  assert.equal(c.quality, 'high');
  assert.equal(c.scale, 0.6);
  assert.equal(feed(c, 30, 30, playing).length, 0);
  const between = feed(c, 30, 3, { allowPresetChange: true, allowRecovery: true });
  assert.equal(between.length, 1);
  assert.equal(between[0].quality, 'medium');
});

test('곡 중에도 심한 지속 부하는 프리셋을 내리고 0.6 바닥을 지켜', () => {
  const c = new AdaptiveQuality({ quality: 'high' });
  const changes = feed(c, 100, 100, { allowPresetChange: false, allowRecovery: false });
  assert.ok(changes.some(change => change.quality === 'medium'));
  assert.equal(c.quality, 'low');
  assert.equal(c.scale, 0.6);
  assert.ok(changes.every(change => change.scale >= 0.6));
});

test('해상도와 프리셋 복구는 곡 사이에만 하고 Lite 상한을 넘지 않아', () => {
  const c = new AdaptiveQuality({ quality: 'low', scale: 0.6, maxQuality: 'medium' });
  assert.equal(feed(c, 1000 / 60, 60, { allowPresetChange: false, allowRecovery: false }).length, 0);
  assert.equal(c.scale, 0.6);
  c.hold(3500); // the new concert phase starts with its own grace period
  const changes = feed(c, 1000 / 60, 150, { allowPresetChange: true, allowRecovery: true });
  assert.ok(changes.length >= 5);
  assert.ok(changes.every(change => change.reason === 'recovery' && change.quality !== 'high'));
  assert.equal(c.quality, 'medium');
  assert.equal(c.scale, 1);
});

test('실패한 복구는 전환·숨김 유예 뒤에도 재시도하지 않고 수동 선택으로 초기화해', () => {
  const c = new AdaptiveQuality({ quality: 'low', scale: 0.6 });
  assert.equal(feed(c, 1000 / 60, 22).length, 1);
  assert.equal(c.scale, 0.7);
  const raisedAt = c.raisedAt;
  feed(c, 100, 20);
  assert.equal(c.scale, 0.6);
  assert.equal(c.raiseBlocked, true);
  c.hold(6000);
  assert.equal(c.raisedAt, raisedAt);
  assert.equal(c.raiseBlocked, true);
  assert.equal(feed(c, 1000 / 60, 90).length, 0);
  c.reset('low', 0.6);
  assert.equal(c.raiseBlocked, false);
  assert.ok(feed(c, 1000 / 60, 30).some(change => change.reason === 'recovery'));
});

test('일반 모드의 자동 품질은 심한 부하에도 보통 재질을 유지해', () => {
  const c = new AdaptiveQuality({ quality: 'high', minQuality: 'medium' });
  const changes = feed(c, 100, 300, { allowPresetChange: false, allowRecovery: false });
  assert.ok(changes.some(change => change.quality === 'medium'));
  assert.ok(changes.every(change => change.quality !== 'low'));
  assert.equal(c.quality, 'medium');
  assert.equal(c.scale, 0.6);
  assert.equal(feed(c, 200, 30).length, 0);
});

test('일반 모드도 안정적인 곡 사이에는 해상도와 높음 프리셋을 복구해', () => {
  const c = new AdaptiveQuality({ quality: 'medium', scale: 0.6, minQuality: 'medium' });
  assert.equal(feed(c, 1000 / 60, 60, { allowRecovery: false }).length, 0);
  const changes = feed(c, 1000 / 60, 150, { allowRecovery: true });
  assert.ok(changes.length >= 5);
  assert.ok(changes.every(change => change.reason === 'recovery'));
  assert.equal(c.quality, 'high');
  assert.equal(c.scale, 1);
});
