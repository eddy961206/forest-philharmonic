import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Worker as NodeWorker } from 'node:worker_threads';
import { AudioEngine } from '../public/js/audio/engine.js';
import { houseBufferLayout, renderApplause, renderMurmur, renderNoise } from '../public/js/audio/crowd.js';

function context() {
  const buffers = [];
  const sources = [];
  const nodes = [];
  const node = () => {
    const created = {
      gain: { value: 0, targets: [], setTargetAtTime(...args) { this.targets.push(args); } },
      frequency: { value: 0 }, Q: { value: 0 },
      connect(target) { return target; },
      disconnect() { this.disconnected = true; },
    };
    nodes.push(created);
    return created;
  };
  return {
    buffers, sources, nodes, sampleRate: 48000, currentTime: 12,
    createBuffer(numberOfChannels, length, sampleRate) {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      const buffer = { numberOfChannels, length, sampleRate, getChannelData: channel => channels[channel] };
      buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const source = node();
      Object.assign(source, { playbackRate: { value: 1 }, start(when) { this.startedAt = when; }, stop() { this.stopped = true; } });
      sources.push(source);
      return source;
    },
    createGain: node,
    createBiquadFilter: node,
  };
}

function audioEngine({ lite = false } = {}) {
  const engine = new AudioEngine();
  engine.ctx = context();
  engine.lite = lite;
  engine.ac = { level: 1, reverb: 1 };
  // PCM transfer is real; graph/fade behaviour has its own focused tests below.
  engine.murmurPreparations = 0;
  engine._prepareMurmur = prepared => {
    if (engine._house) return;
    engine.murmurPreparations++;
    engine._house = { source: { buffer: prepared.bed }, shots: prepared.shots, dispose() {} };
  };
  return engine;
}

function install(t, key, value) {
  const had = Object.hasOwn(globalThis, key);
  const previous = globalThis[key];
  globalThis[key] = value;
  t.after(() => { if (had) globalThis[key] = previous; else delete globalThis[key]; });
}

function fakeWorker(t, options) {
  const instances = [];
  class FakeWorker {
    constructor(url, options) { this.url = url; this.options = options; this.requests = []; this.terminated = false; instances.push(this); }
    postMessage(request) { this.requests.push(request); }
    terminate() { this.terminated = true; }
    respond() {
      const { kind, index, options } = this.requests.at(-1);
      if (kind === 'house') {
        const buffers = houseBufferLayout().map(({ numberOfChannels, length, sampleRate }) => ({
          length, sampleRate, channels: Array.from({ length: numberOfChannels }, () => new Float32Array(length)),
        }));
        this.onmessage({ data: { kind, index, buffers } });
        return;
      }
      const length = Math.floor(options.seconds * options.sr);
      const layers = Object.fromEntries(['close', 'wash'].map(name => [name, {
        length, sampleRate: options.sr, channels: [new Float32Array(length), new Float32Array(length)],
      }]));
      this.onmessage({ data: { kind, index, layers } });
    }
  }
  install(t, 'Worker', FakeWorker);
  const engine = audioEngine(options);
  return { instances, engine };
}

function pcmHash(buffer) {
  const hash = createHash('sha256');
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  }
  return hash.digest('hex');
}

function originalHouse(ctx, lite) {
  // Keep the pre-worker call sites independent of renderHouse/layout helpers.
  // Shared configuration would let changed seeds/rates/talker counts pass.
  return {
    bed: renderMurmur(ctx, { seconds: 9, talkers: lite ? 18 : 30, seed: 5, sr: 16000 }),
    shots: ['cough', 'cough', 'cough', 'creak', 'creak', 'rustle', 'rustle', 'rustle']
      .map((kind, i) => ({ kind, buf: renderNoise(ctx, kind, { seed: 40 + i, sr: 16000 }) })),
  };
}

function graphEngine(t) {
  const result = fakeWorker(t);
  delete result.engine._prepareMurmur;
  result.engine.makeup = {};
  result.engine.reverbIn = {};
  const listeners = new Set();
  const document = {
    hidden: false,
    addEventListener(name, listener) { assert.equal(name, 'visibilitychange'); listeners.add(listener); },
    removeEventListener(name, listener) { assert.equal(name, 'visibilitychange'); listeners.delete(listener); },
  };
  install(t, 'document', document);
  install(t, 'GainNode', class { constructor(ctx) { return ctx.createGain(); } });
  install(t, 'BiquadFilterNode', class { constructor(ctx) { return ctx.createBiquadFilter(); } });
  return { ...result, document, listeners };
}

for (const lite of [false, true]) test(`the actual module worker preserves all 17 audio buffers bit for bit (${lite ? 'Lite' : 'desktop'})`, async t => {
  const workers = [];
  // Adapt only the message boundary. The production module executes unchanged
  // in a real separate thread with neither AudioContext nor document available.
  class BrowserWorker {
    constructor(url, options) {
      assert.equal(options.type, 'module');
      const adapter = `import { parentPort } from 'node:worker_threads';
        globalThis.self = { postMessage: (message, transfer) => parentPort.postMessage(message, transfer) };
        await import(${JSON.stringify(url.href)});
        parentPort.on('message', data => self.onmessage({ data }));`;
      this.worker = new NodeWorker(new URL(`data:text/javascript,${encodeURIComponent(adapter)}`));
      this.messageCount = 0;
      this.errors = [];
      this.worker.on('message', data => { this.messageCount++; this.onmessage?.({ data }); });
      this.worker.on('error', error => { this.errors.push(error); this.onerror?.({ error, preventDefault() {} }); });
      this.worker.on('messageerror', error => this.onmessageerror?.({ error }));
      this.terminated = false;
      workers.push(this);
    }
    postMessage(message) { this.worker.postMessage(message); }
    terminate() { this.terminated = true; this.worker.terminate(); }
  }
  install(t, 'Worker', BrowserWorker);
  t.after(() => workers.forEach(worker => worker.worker.terminate()));
  const engine = audioEngine({ lite });
  const ready = engine.prepareApplause();
  assert.equal(engine.ctx.buffers.length, 0); // No synchronous synthesis at boot.
  assert.equal(engine.prepareApplause(), ready);
  const crowd = await ready;
  const people = lite ? 200 : 320;
  const sr = lite ? 16000 : 24000;
  const cases = [
    [crowd.welcome, { seconds: 5.5, people, seed: 11, sr }],
    [crowd.normal[0], { seconds: 10, people, seed: 21, sr }],
    [crowd.normal[1], { seconds: 10, people, seed: 22, sr }],
    [crowd.finale, { seconds: 15, people, seed: 31, rhythmic: true, sr }],
  ];
  for (const [actual, options] of cases) {
    const expected = renderApplause(context(), options);
    for (const name of ['close', 'wash']) {
      assert.equal(actual[name].sampleRate, sr);
      assert.equal(actual[name].length, expected[name].length);
      assert.equal(actual[name].numberOfChannels, 2);
      assert.equal(pcmHash(actual[name]), pcmHash(expected[name]));
    }
  }
  const expectedHouse = originalHouse(context(), lite);
  const actualHouse = [crowd.house.bed, ...crowd.house.shots.map(shot => shot.buf)];
  const expectedHouseBuffers = [expectedHouse.bed, ...expectedHouse.shots.map(shot => shot.buf)];
  for (let i = 0; i < actualHouse.length; i++) {
    assert.equal(actualHouse[i].length, expectedHouseBuffers[i].length);
    assert.equal(actualHouse[i].sampleRate, 16000);
    assert.equal(actualHouse[i].numberOfChannels, i === 0 ? 2 : 1);
    assert.equal(pcmHash(actualHouse[i]), pcmHash(expectedHouseBuffers[i]));
  }
  assert.deepEqual(crowd.house.shots.map(shot => shot.kind), expectedHouse.shots.map(shot => shot.kind));
  assert.equal(engine._house.source.buffer, crowd.house.bed);
  const houseBytes = expectedHouseBuffers.reduce((sum, buffer) => sum + buffer.length * buffer.numberOfChannels * 4, 0);
  assert.equal(engine.ctx.buffers.reduce((bytes, buffer) => bytes + buffer.length * buffer.numberOfChannels * 4, 0), 40.5 * sr * 16 + houseBytes);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].messageCount, 5);
  assert.deepEqual(workers[0].errors, []);
  assert.equal(workers[0].terminated, true);
  assert.equal(engine._crowd, crowd);
  assert.equal(engine.prepareApplause(), ready);
  assert.equal(engine.murmurPreparations, 1);
});

test('one shared preparation requests the next profile only after copying the previous one', async t => {
  const { engine, instances } = fakeWorker(t);
  const ready = engine.prepareApplause();
  assert.equal(engine.prepareApplause(), ready);
  assert.equal(instances.length, 1);
  const worker = instances[0];
  assert.match(worker.url.href, /\/audio\/crowd-worker\.js$/);
  assert.deepEqual(worker.options, { type: 'module' });
  assert.equal(worker.requests.length, 1);
  assert.equal(worker.requests[0].kind, 'house');
  assert.equal(engine._house, null);
  worker.respond();
  assert.equal(engine.ctx.buffers.length, 9);
  assert.equal(engine._house, null, 'the ready promise includes wiring the house graph');
  for (let index = 0; index < 4; index++) {
    assert.equal(worker.requests.at(-1).index, index);
    assert.equal(engine.ctx.buffers.length, 9 + index * 2);
    worker.respond();
    assert.equal(engine.ctx.buffers.length, 9 + (index + 1) * 2);
    assert.equal(worker.requests.length, Math.min(index + 3, 5));
  }
  const crowd = await ready;
  for (const [index, pair] of [crowd.welcome, ...crowd.normal, crowd.finale].entries()) {
    assert.equal(pair.close, engine.ctx.buffers[9 + index * 2]);
    assert.equal(pair.wash, engine.ctx.buffers[9 + index * 2 + 1]);
  }
  assert.equal(worker.terminated, true);
  assert.equal(worker.onmessage, null);
  assert.equal(engine.prepareApplause(), ready);
});

test('browsers without Worker complete through the unchanged synchronous synthesizer', async t => {
  install(t, 'Worker', undefined);
  const engine = audioEngine();
  const ready = engine.prepareApplause();
  assert.equal(engine.ctx.buffers.length, 17);
  const crowd = await ready;
  assert.equal(engine._crowd, crowd);
  assert.equal(engine.prepareApplause(), ready);
  assert.equal(crowd.welcome.close.length, 132000);
  assert.equal(crowd.finale.wash.length, 360000);
});

test('a worker failure keeps completed buffers and synthesizes only the missing profile', async t => {
  const { engine, instances } = fakeWorker(t);
  const ready = engine.prepareApplause();
  const worker = instances[0];
  worker.respond(); // House PCM is the first request.
  for (let index = 0; index < 3; index++) worker.respond();
  const completed = engine.ctx.buffers.slice(9);
  const lateMessage = worker.onmessage;
  assert.equal(worker.onerror, worker.onmessageerror);
  let prevented = false;
  worker.onerror({ preventDefault() { prevented = true; } });
  const crowd = await ready;
  assert.equal(prevented, true);
  assert.equal(worker.terminated, true);
  assert.equal(engine.ctx.buffers.length, 17);
  assert.equal(crowd.welcome.close, completed[0]);
  assert.equal(crowd.welcome.wash, completed[1]);
  assert.equal(crowd.normal[0].close, completed[2]);
  assert.equal(crowd.normal[1].wash, completed[5]);
  assert.ok(crowd.finale.close.getChannelData(0).some(value => value !== 0));
  assert.ok(crowd.finale.wash.getChannelData(0).some(value => value !== 0));
  lateMessage({ data: null });
  assert.equal(engine.ctx.buffers.length, 17);
});

test('malformed worker messages fall back and late decode errors are ignored', async t => {
  const { engine, instances } = fakeWorker(t);
  const ready = engine.prepareApplause();
  const worker = instances[0];
  worker.respond(); // House PCM is the first request.
  for (let index = 0; index < 3; index++) worker.respond();
  const lateDecodeError = worker.onmessageerror;
  // The close layer is valid but the wash is absent. Accepting a half-pair
  // would make the full-house mix fail later when applause actually starts.
  worker.onmessage({ data: { kind: 'applause', index: 3, layers: { close: {
    sampleRate: 24000, length: 360000, channels: [new Float32Array(360000), new Float32Array(360000)],
  } } } });
  assert.equal((await ready).finale.close.sampleRate, 24000);
  assert.equal(worker.terminated, true);
  lateDecodeError({ preventDefault() {} });
  assert.equal(engine.ctx.buffers.length, 17);
});

test('direct applause remains synchronous while an unfinished worker is terminated', async t => {
  const { engine, instances } = fakeWorker(t);
  const ready = engine.prepareApplause();
  const worker = instances[0];
  worker.respond(); // House PCM is the first request.
  for (let index = 0; index < 3; index++) worker.respond();
  engine.dryBus = {};
  engine.reverbIn = {};
  install(t, 'GainNode', class { constructor(ctx) { return ctx.createGain(); } });
  install(t, 'BiquadFilterNode', class { constructor(ctx) { return ctx.createBiquadFilter(); } });
  const source = engine.applause(12.75, 1.3);
  assert.equal(source.startedAt, 12.75);
  assert.equal(source.buffer.length, 360000);
  assert.equal(source.buffer.sampleRate, 24000);
  assert.equal(worker.terminated, true);
  assert.equal(engine.ctx.buffers.length, 17);
  assert.equal(source.buffer, (await ready).finale.close);
  assert.equal(engine.ctx.sources.length, 2);
  assert.equal(engine.ctx.sources[1].buffer, (await ready).finale.wash);
  assert.equal(engine.ctx.sources[1].startedAt, 12.75);
});

for (const transferred of [0, 1]) test(`audio initialization cancels an old generation after ${transferred} transfers and ignores late responses`, async t => {
  const { engine, instances } = fakeWorker(t);
  const oldReady = engine.prepareApplause();
  const oldWorker = instances[0];
  for (let i = 0; i < transferred; i++) oldWorker.respond();
  const oldMessage = oldWorker.onmessage;
  const oldError = oldWorker.onerror;
  const stopped = new Error('Stop after init resets the crowd');
  install(t, 'window', { AudioContext: class { constructor() { throw stopped; } } });
  await assert.rejects(engine.init(), error => error === stopped);
  assert.equal(await oldReady, null);
  assert.equal(oldWorker.terminated, true);
  assert.equal(engine._crowd, null);
  assert.equal(engine._crowdPreparation, null);
  oldMessage({ data: null });
  oldError();
  engine.ctx = context();
  const newReady = engine.prepareApplause();
  assert.notEqual(newReady, oldReady);
  for (let index = 0; index < 5; index++) instances[1].respond();
  const crowd = await newReady;
  oldMessage({ data: null });
  assert.equal(engine._crowd, crowd);
  assert.equal(engine.ctx.buffers.length, 17);
});

test('reinitialization after the last transfer prevents a queued old graph from being installed', async t => {
  const { engine, instances } = fakeWorker(t);
  const oldReady = engine.prepareApplause();
  for (let index = 0; index < 5; index++) instances[0].respond();
  const stopped = new Error('Stop after init clears the old generation');
  install(t, 'window', { AudioContext: class { constructor() { throw stopped; } } });
  await assert.rejects(engine.init(), error => error === stopped);
  assert.ok(await oldReady, 'the completed PCM result can still resolve for its original caller');
  assert.equal(engine._house, null, 'the completed old result cannot install an old-context graph');
  assert.equal(engine._crowd, null);
  assert.equal(engine.murmurPreparations, 0);
});

test('a stalled worker is stopped and missing PCM is completed before resolving', async t => {
  const { engine, instances } = fakeWorker(t);
  const timers = [];
  install(t, 'setTimeout', (fn, ms) => { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer; });
  install(t, 'clearTimeout', timer => { if (timer) timer.cleared = true; });
  const ready = engine.prepareApplause();
  const worker = instances[0];
  worker.respond(); // House PCM is the first request.
  for (let index = 0; index < 3; index++) worker.respond();
  assert.equal(timers.at(-1).ms, 30000);
  assert.ok(timers.slice(0, -1).every(timer => timer.cleared));
  timers.at(-1).fn();
  const crowd = await ready;
  assert.equal(crowd.finale.wash.length, 360000);
  assert.equal(worker.terminated, true);
  assert.ok(timers.every(timer => timer.cleared));
});

test('constructor restrictions fall back, and synthesis errors reject without leaking a worker', async t => {
  install(t, 'Worker', class { constructor() { throw new Error('Worker blocked by policy'); } });
  const engine = audioEngine();
  const failure = new Error('AudioContext allocation failed');
  engine.ctx = { createBuffer() { throw failure; } };
  await assert.rejects(engine.prepareApplause(), error => error === failure);
  assert.throws(() => engine._prepareCrowd(), error => error === failure);
});

test('an incomplete house result falls back before allocating a partial house', async t => {
  const { engine, instances } = fakeWorker(t);
  const ready = engine.prepareApplause();
  instances[0].onmessage({ data: { kind: 'house', index: -1, buffers: [] } });
  const crowd = await ready;
  assert.equal(instances[0].terminated, true);
  assert.equal(engine.ctx.buffers.length, 17);
  const expected = originalHouse(context(), false);
  assert.equal(pcmHash(crowd.house.bed), pcmHash(expected.bed));
  assert.deepEqual(crowd.house.shots.map(shot => pcmHash(shot.buf)), expected.shots.map(shot => pcmHash(shot.buf)));
});

for (const moment of ['before-preparation', 'worker-pending', 'house-transferred']) {
  test(`direct murmur keeps one house and one graph (${moment})`, async t => {
    const { engine, instances, listeners } = graphEngine(t);
    let ready;
    if (moment !== 'before-preparation') ready = engine.prepareApplause();
    if (moment === 'house-transferred') instances[0].respond();
    engine.setMurmur(0.7, 900);
    const house = engine._house;
    assert.equal(house.source.startedAt, 12.05, 'the direct API starts before returning');
    assert.equal(engine.ctx.buffers.length, 9);
    assert.equal(engine.ctx.sources.length, 1);
    ready ||= engine.prepareApplause();
    assert.equal(engine.prepareApplause(), ready);
    const worker = instances[0];
    if (moment === 'worker-pending') {
      worker.respond(); // Discard an already-rendering house without copying it.
      assert.equal(engine.ctx.buffers.length, 9);
    }
    assert.equal(worker.requests.at(-1).kind, 'applause');
    assert.equal(worker.requests.at(-1).index, 0);
    for (let index = 0; index < 4; index++) worker.respond();
    const crowd = await ready;
    assert.equal(crowd.house.bed, house.source.buffer);
    assert.equal(crowd.house.shots, house.shots);
    assert.equal(engine._house, house);
    assert.equal(engine.ctx.buffers.length, 17);
    assert.equal(engine.ctx.sources.length, 1);
    assert.equal(engine.tickHandlers.size, 1);
    assert.equal(listeners.size, 1);
    assert.equal(worker.requests.length, moment === 'before-preparation' ? 4 : 5);
  });
}

for (const failure of ['malformed', 'error', 'timeout']) {
  test(`a pending house ${failure} retains the direct murmur buffers during fallback`, async t => {
    const { engine, instances } = graphEngine(t);
    const timers = [];
    install(t, 'setTimeout', fn => { timers.push(fn); return fn; });
    install(t, 'clearTimeout', () => {});
    const ready = engine.prepareApplause();
    engine.setMurmur(0.5, 900);
    const house = engine._house;
    const worker = instances[0];
    if (failure === 'malformed') worker.onmessage({ data: null });
    else if (failure === 'error') worker.onerror({ preventDefault() {} });
    else timers.at(-1)();
    const crowd = await ready;
    assert.equal(worker.terminated, true);
    assert.equal(engine.ctx.buffers.length, 17);
    assert.equal(crowd.house.bed, house.source.buffer);
    assert.equal(crowd.house.shots, house.shots);
    assert.equal(engine.ctx.sources.length, 1);
  });
}

test('direct house allocation failure stops the worker and rejects the shared readiness promise', async t => {
  const { engine, instances } = graphEngine(t);
  const ready = engine.prepareApplause();
  const failure = new Error('House allocation failed');
  engine.ctx.createBuffer = () => { throw failure; };
  assert.throws(() => engine.setMurmur(1, 900), error => error === failure);
  await assert.rejects(ready, error => error === failure);
  assert.equal(engine.prepareApplause(), ready);
  assert.equal(instances[0].terminated, true);
  assert.equal(engine._house, null);
  assert.equal(engine._crowd, null);
});

test('ready includes the real house graph, hidden fade and generation-scoped cleanup', async t => {
  const { engine, instances, document, listeners } = graphEngine(t);
  const ready = engine.prepareApplause();
  engine.setMurmur(0, 900);
  assert.equal(engine.ctx.buffers.length, 0, 'a muted pre-concert frame does not force sync synthesis');
  for (let index = 0; index < 5; index++) instances[0].respond();
  assert.equal(engine._house, null);
  const crowd = await ready;
  const house = engine._house;
  const oldContext = engine.ctx;
  assert.equal(house.source.buffer, crowd.house.bed);
  assert.equal(house.shots, crowd.house.shots);
  engine._prepareMurmur(crowd.house);
  assert.equal(engine.prepareApplause(), ready);
  assert.equal(engine.ctx.sources.length, 1);
  assert.equal(engine.tickHandlers.size, 1);
  assert.equal(listeners.size, 1);
  const [onVisibility] = listeners;
  engine.setMurmur(0.7, 900);
  assert.equal(house.target, 0.7);
  document.hidden = true;
  onVisibility();
  assert.deepEqual(house.out.gain.targets.at(-1), [0, 12, 0.3]);
  assert.equal(house.target, -1);
  document.hidden = false;
  onVisibility();
  engine.setMurmur(0.7, 900);
  assert.deepEqual(house.out.gain.targets.at(-1), [0.7 * 0.005, 12, 1.6]);
  assert.equal(house.target, 0.7);
  const targetCount = house.out.gain.targets.length;
  const stopped = new Error('Stop after init clears the old generation');
  install(t, 'window', { AudioContext: class { constructor() { throw stopped; } } });
  await assert.rejects(engine.init(), error => error === stopped);
  assert.equal(engine._house, null);
  assert.equal(engine._crowd, null);
  assert.equal(engine._crowdPreparation, null);
  assert.equal(engine.tickHandlers.size, 0);
  assert.equal(listeners.size, 0);
  assert.equal(house.source.stopped, true);
  assert.equal(oldContext.nodes.length, 6);
  assert.ok(oldContext.nodes.every(node => node.disconnected));
  document.hidden = true;
  onVisibility();
  assert.equal(house.out.gain.targets.length, targetCount, 'a saved stale listener cannot touch the old graph');
});

test('house graph failures reject readiness before the concert can enter', async t => {
  const { engine, instances } = fakeWorker(t);
  const failure = new Error('House graph creation failed');
  engine._prepareMurmur = () => { throw failure; };
  const ready = engine.prepareApplause();
  for (let index = 0; index < 5; index++) instances[0].respond();
  await assert.rejects(ready, error => error === failure);
  assert.equal(engine.prepareApplause(), ready);
  assert.equal(engine._crowd, null);
  assert.equal(instances[0].terminated, true);
});
