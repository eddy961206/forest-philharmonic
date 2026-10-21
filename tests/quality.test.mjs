import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveQuality } from '../public/js/quality.js';

function feed(c, ms, seconds) {
  const changes = [];
  for (let t = 0; t < seconds * 1000; t += ms) {
    const change = c.sample(ms);
    if (change) changes.push(change);
  }
  return changes;
}

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
