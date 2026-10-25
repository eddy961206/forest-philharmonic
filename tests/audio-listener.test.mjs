import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioEngine } from '../public/js/audio/engine.js';
import { SECTIONS, sectionCenter } from '../public/js/layout.js';
const sectionCount = Object.keys(SECTIONS).length;

const position = { x: 0, y: 1.2, z: 10 };
const forward = { x: 0, y: 0, z: -1 };
const up = { x: 0, y: 1, z: 0 };

function fixture({ legacy = false, sampleRate = 48000 } = {}) {
  const writes = [];
  const param = (name) => ({
    setTargetAtTime(value, time, constant) { writes.push({ name, value, time, constant }); },
    setValueAtTime(value, time) { writes.push({ name, value, time }); },
  });
  const listener = legacy ? {
    setPosition(...values) { writes.push({ name: 'position', values }); },
    setOrientation(...values) { writes.push({ name: 'orientation', values }); },
  } : Object.fromEntries([
    'positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ',
  ].map((key) => [key, param(key)]));
  const engine = new AudioEngine();
  engine.ctx = { currentTime: 1, sampleRate, listener };
  engine.ac = { airMin: 3800, airK: 0.055 };
  engine.sections = Object.fromEntries(Object.keys(SECTIONS).map((key) => [key, {
    pos: sectionCenter(key), air: { frequency: param(`air:${key}`) },
  }]));
  engine._initListener();
  return { engine, writes, param };
}

function spotFixture(t, options) {
  const result = fixture(options);
  const { engine, param } = result;
  const node = (properties = {}) => ({ ...properties, connect(target) { return target; } });
  let gains = 0, filters = 0;
  engine.ctx.createGain = () => node({ gain: param(`spot:gain:${gains++}`) });
  engine.ctx.createBiquadFilter = () => node({ frequency: param(`spot:filter:${filters++}`) });
  engine.makeup = node();
  engine.reverbIn = node();
  engine._open = 1;
  const original = Object.fromEntries(['GainNode', 'PannerNode'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.GainNode = class { constructor() { return engine.ctx.createGain(); } };
  globalThis.PannerNode = class {
    constructor(_ctx, options) {
      return node(Object.fromEntries(['positionX', 'positionY', 'positionZ'].map(key => [key, { ...param(`spot:${key}`), value: options[key] }])));
    }
  };
  t.after(() => {
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return result;
}

test('calls before audio init do not establish a stale cached pose', () => {
  const engine = new AudioEngine();
  assert.doesNotThrow(() => engine.setListener(position, forward, up));
  assert.equal(engine._listenerPose, null);
});

test('600 identical frames keep the initial targets and schedule no duplicates', () => {
  const { engine, writes } = fixture();
  for (let frame = 0; frame < 600; frame++) {
    engine.ctx.currentTime = frame / 60;
    // The camera creates new vectors each frame: compare values, not references.
    engine.setListener({ ...position }, { ...forward }, { ...up });
  }
  assert.equal(writes.length, 9 + sectionCount); // Listener parameters plus one filter per section.
  assert.equal(writes.filter((write) => write.name.startsWith('air:')).length, sectionCount);
  assert.ok(writes.every((write) => write.time === 0));
});

test('turning updates orientation without changing distance filters', () => {
  const { engine, writes } = fixture();
  engine.setListener(position, forward, up);
  writes.length = 0;
  engine.ctx.currentTime = 2;
  engine.setListener(position, { x: -1, y: 0, z: 0 }, up);
  assert.deepEqual(writes.map((write) => write.name), [
    'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ',
  ]);
  assert.ok(writes.every((write) => write.time === 2 && write.constant === 0.04));
  writes.length = 0;
  engine.setListener(position, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  assert.equal(writes.length, 6); // Camera roll also changes the listening orientation.
});

test('section desks follow head turns while unchanged distance and pose targets are reused', () => {
  const { engine, writes, param } = fixture();
  Object.assign(engine.ac, { model: 'inverse', refDistance: 3.2, rolloff: 1.15 });
  const desk = { pos: { x: 3, y: position.y, z: 0 }, level: 0.62,
    pan: { pan: param('desk:pan') }, g: { gain: param('desk:gain') } };
  engine.sections.vn1.desks = [desk];
  engine.setListener(position, forward, up);
  const initialPan = writes.find(write => write.name === 'desk:pan').value;
  const initialGain = writes.find(write => write.name === 'desk:gain').value;
  assert.ok(initialPan > 0, 'a desk to the right is heard to the right');
  assert.ok(initialGain > 0);
  writes.length = 0;
  for (let i = 0; i < 600; i++) engine.setListener({ ...position }, { ...forward }, { ...up });
  assert.equal(writes.length, 0);

  engine.setListener(position, { x: 0, y: 0, z: 1 }, up);
  assert.equal(writes.find(write => write.name === 'desk:pan').value, -initialPan);
  assert.equal(writes.filter(write => write.name === 'desk:gain' || write.name.startsWith('air:')).length, 0);
  writes.length = 0;
  engine.setListener({ x: 3, y: position.y, z: 20 }, { x: 0, y: 0, z: 1 }, up);
  assert.ok(writes.find(write => write.name === 'desk:gain').value < initialGain, 'a more distant desk stays quieter');
  assert.equal(Math.abs(writes.find(write => write.name === 'desk:pan').value), 0, 'a centred desk stays centred');
});

test('moving retains every spatial target and air absorption value', () => {
  const { engine, writes } = fixture({ sampleRate: 24000 });
  engine.setListener(position, forward, up);
  writes.length = 0;
  const moved = { x: 3, y: 1.6, z: 5 };
  engine.ctx.currentTime = 3;
  engine.setListener(moved, forward, up);
  assert.equal(writes.length, 3 + sectionCount); // Position and filters; orientation is unchanged.
  assert.deepEqual(writes.slice(0, 3), [
    { name: 'positionX', value: 3, time: 3, constant: 0.04 },
    { name: 'positionY', value: 1.6, time: 3, constant: 0.04 },
    { name: 'positionZ', value: 5, time: 3, constant: 0.04 },
  ]);
  for (const [key, section] of Object.entries(engine.sections)) {
    const d = Math.sqrt((section.pos.x - moved.x) ** 2 + (section.pos.y - moved.y) ** 2 + (section.pos.z - moved.z) ** 2);
    assert.equal(section.distance, d);
    const expected = Math.min(Math.max(3800, 21000 / (1 + d * 0.055)), 24000 * 0.49);
    assert.deepEqual(writes.find((write) => write.name === `air:${key}`), {
      name: `air:${key}`, value: expected, time: 3, constant: 0.08,
    });
  }
});

test('the exact cache preserves tiny movements and mutable vector inputs', () => {
  const { engine, writes } = fixture();
  const pos = { ...position };
  engine.setListener(pos, forward, up);
  writes.length = 0;
  pos.x += 1e-12;
  engine.setListener(pos, forward, up);
  assert.equal(writes.length, 3 + sectionCount);
  assert.equal(writes[0].value, 1e-12);
  writes.length = 0;
  engine.setListener(pos, forward, up);
  assert.equal(writes.length, 0);
});

test('listener initialization invalidates a pose sent during async setup', () => {
  const { engine, writes } = fixture();
  const sections = engine.sections;
  engine.sections = {};
  engine.setListener(position, forward, up);
  assert.equal(writes.length, 9);
  // init() binds the listener before creating the sections, synchronously.
  engine._initListener();
  engine.sections = sections;
  writes.length = 0;
  engine.setListener(position, forward, up);
  assert.equal(writes.length, 9 + sectionCount);
});

test('reinitialization binds a new audio listener and resends unchanged targets', () => {
  const first = fixture();
  first.engine.setListener(position, forward, up);
  const second = fixture();
  first.engine.ctx = second.engine.ctx;
  first.engine.sections = second.engine.sections;
  first.engine._initListener();
  first.engine.setListener(position, forward, up);
  assert.equal(second.writes.length, 9 + sectionCount);
  assert.equal(first.writes.length, 9 + sectionCount); // No writes were sent to the old context.
});

test('legacy listeners keep separate position/orientation updates', () => {
  const { engine, writes } = fixture({ legacy: true });
  engine.setListener(position, forward, up);
  assert.equal(writes.length, 2 + sectionCount); // Two legacy calls plus the section filters.
  writes.length = 0;
  engine.setListener({ ...position }, { ...forward }, { ...up });
  assert.equal(writes.length, 0);
  engine.setListener(position, { x: 1, y: 0, z: 0 }, up);
  assert.deepEqual(writes, [{ name: 'orientation', values: [1, 0, 0, 0, 1, 0] }]);
  writes.length = 0;
  engine.setListener({ ...position, x: 1 }, { x: 1, y: 0, z: 0 }, up);
  assert.equal(writes.length, 1 + sectionCount);
  assert.deepEqual(writes[0], { name: 'position', values: [1, 1.2, 10] });
});

test('adding a foyer source refreshes distance and air for a stationary listener only once', (t) => {
  const { engine, writes } = spotFixture(t);
  engine.setListener(position, forward, up);
  const source = { x: 3, y: 1.2, z: 26 };
  engine.addSpot('lobby', source);
  assert.equal(engine._spatialDirty, true);
  writes.length = 0; // Observe the next listener update, separately from node setup.
  engine.ctx.currentTime = 2;
  engine.setListener({ ...position }, { ...forward }, { ...up });
  const distance = Math.sqrt(3 ** 2 + 16 ** 2);
  assert.equal(engine.sections.lobby.distance, distance);
  assert.deepEqual(writes.find(write => write.name === 'spot:filter:0'), {
    name: 'spot:filter:0', value: 21000 / (1 + distance * 0.055), time: 2, constant: 0.08,
  });
  assert.equal(writes.length, 1 + sectionCount); // Filters only: no unchanged listener targets.
  assert.ok(writes.every(write => write.constant === 0.08));
  assert.equal(engine._spatialDirty, false);
  writes.length = 0;
  for (let frame = 0; frame < 600; frame++) engine.setListener(position, forward, up);
  assert.equal(writes.length, 0);
});

test('moving a foyer source refreshes a stationary legacy ear without duplicate pose writes', (t) => {
  const { engine, writes } = spotFixture(t, { legacy: true, sampleRate: 24000 });
  const source = { x: 3, y: 1.2, z: 26 };
  engine.addSpot('lobby', source);
  engine.setListener(position, forward, up);
  writes.length = 0;
  engine.moveSpot('lobby', { ...source });
  engine.addSpot('lobby', { ...source }); // Existing-source path has the same exact cache.
  engine.moveSpot('missing', source);
  assert.equal(engine._spatialDirty, false);
  engine.setListener(position, forward, up);
  assert.equal(writes.length, 0);

  const moved = { x: 3 + 1e-12, y: 1.2, z: 27 };
  engine.ctx.currentTime = 3;
  engine.moveSpot('lobby', moved);
  assert.equal(engine._spatialDirty, true);
  assert.deepEqual(writes.map(write => write.name), ['spot:positionX', 'spot:positionY', 'spot:positionZ']);
  moved.x = 999; // A caller's mutable input cannot silently move the stored source.
  writes.length = 0;
  engine.setListener(position, forward, up);
  const distance = Math.sqrt((3 + 1e-12) ** 2 + 17 ** 2);
  assert.equal(engine.sections.lobby.distance, distance);
  assert.deepEqual(writes.find(write => write.name === 'spot:filter:0'), {
    name: 'spot:filter:0', value: Math.min(21000 / (1 + distance * 0.055), 24000 * 0.49), time: 3, constant: 0.08,
  });
  assert.equal(writes.length, 1 + sectionCount);
  assert.ok(writes.every(write => write.constant === 0.08));
  writes.length = 0;
  engine.setListener(position, forward, up);
  assert.equal(writes.length, 0);
});

test('audio initialization resets source dirtiness before asynchronous setup', async (t) => {
  const { engine } = fixture();
  engine.setListener(position, forward, up);
  engine._spatialDirty = true;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  });
  const stopped = new Error('Stop before constructing a real audio graph');
  globalThis.window = { AudioContext: class { constructor() { throw stopped; } } };
  await assert.rejects(engine.init(), error => error === stopped);
  assert.equal(engine._listenerPose, null);
  assert.equal(engine._spatialDirty, false);
  // Rebinding a listener later in init also invalidates a pose/source cache.
  engine._spatialDirty = true;
  engine._initListener();
  assert.equal(engine._spatialDirty, false);
});

test('solo chairs remove dry and wet desk copies and listener motion cannot restore them', () => {
  const { engine, writes, param } = fixture();
  engine.ac.refDistance = 8;
  engine.ac.rolloff = 1;
  const section = engine.sections.vn1;
  section.desks = [{ level: 0.55, pos: { x: -3, y: 1, z: 0 }, g: { gain: param('desk:dry') }, wet: { gain: param('desk:wet') }, pan: { pan: param('desk:pan') } }];
  engine.setEnsemble({ vn1: 1 });
  assert.equal(section.ensemble, 0);
  assert.equal(writes.find(w => w.name === 'desk:dry').value, 0);
  assert.equal(writes.find(w => w.name === 'desk:wet').value, 0);
  writes.length = 0;
  engine.setListener(position, forward, up);
  assert.equal(writes.find(w => w.name === 'desk:dry').value, 0);
  engine.setEnsemble({ vn1: SECTIONS.vn1.chairs.length });
  assert.equal(section.ensemble, 1);
  assert.equal(writes.filter(w => w.name === 'desk:wet').at(-1).value, 0.55);
  assert.ok(writes.filter(w => w.name === 'desk:dry').at(-1).value > 0);
});
