import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Worker as NodeWorker } from 'node:worker_threads';
import { AudioEngine } from '../public/js/audio/engine.js';
import { renderApplause } from '../public/js/audio/crowd.js';

function context() {
  const buffers = [];
  const sources = [];
  const node = () => ({
    gain: { value: 0 }, frequency: { value: 0 }, Q: { value: 0 },
    connect(target) { return target; },
  });
  return {
    buffers, sources,
    createBuffer(numberOfChannels, length, sampleRate) {
      const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
      const buffer = { numberOfChannels, length, sampleRate, getChannelData: channel => channels[channel] };
      buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const source = { ...node(), playbackRate: { value: 1 }, start(when) { this.startedAt = when; } };
      sources.push(source);
      return source;
    },
    createGain: node,
    createBiquadFilter: node,
  };
}

function install(t, key, value) {
  const had = Object.hasOwn(globalThis, key);
  const previous = globalThis[key];
  globalThis[key] = value;
  t.after(() => { if (had) globalThis[key] = previous; else delete globalThis[key]; });
}

function fakeWorker(t) {
  const instances = [];
  class FakeWorker {
    constructor(url, options) { this.url = url; this.options = options; this.requests = []; this.terminated = false; instances.push(this); }
    postMessage(request) { this.requests.push(request); }
    terminate() { this.terminated = true; }
    respond() {
      const { index, options } = this.requests.at(-1);
      const length = Math.floor(options.seconds * 44100);
      this.onmessage({ data: { index, length, sampleRate: 44100, channels: [new Float32Array(length), new Float32Array(length)] } });
    }
  }
  install(t, 'Worker', FakeWorker);
  const engine = new AudioEngine();
  engine.ctx = context();
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

test('the actual module worker keeps all four original PCM buffers bit for bit', async t => {
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
  const engine = new AudioEngine();
  engine.ctx = context();
  const ready = engine.prepareApplause();
  assert.equal(engine.ctx.buffers.length, 0); // No synchronous synthesis at boot.
  assert.equal(engine.prepareApplause(), ready);
  const crowd = await ready;
  const cases = [
    [crowd.welcome, { seconds: 5.5, people: 120, seed: 11 }],
    [crowd.normal[0], { seconds: 10, people: 170, seed: 21 }],
    [crowd.normal[1], { seconds: 10, people: 170, seed: 22 }],
    [crowd.finale, { seconds: 15, people: 240, seed: 31, rhythmic: true }],
  ];
  for (const [actual, options] of cases) {
    const expected = renderApplause(context(), options);
    assert.equal(actual.sampleRate, 44100);
    assert.equal(actual.length, expected.length);
    assert.equal(actual.numberOfChannels, 2);
    assert.equal(pcmHash(actual), pcmHash(expected));
  }
  assert.equal(engine.ctx.buffers.reduce((bytes, buffer) => bytes + buffer.length * 8, 0), 14288400);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].messageCount, 4);
  assert.deepEqual(workers[0].errors, []);
  assert.equal(workers[0].terminated, true);
  assert.equal(engine._crowd, crowd);
  assert.equal(engine.prepareApplause(), ready);
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
  for (let index = 0; index < 4; index++) {
    assert.equal(worker.requests.at(-1).index, index);
    assert.equal(engine.ctx.buffers.length, index);
    worker.respond();
    assert.equal(engine.ctx.buffers.length, index + 1);
    assert.equal(worker.requests.length, Math.min(index + 2, 4));
  }
  const crowd = await ready;
  assert.equal(crowd.welcome, engine.ctx.buffers[0]);
  assert.equal(crowd.normal[0], engine.ctx.buffers[1]);
  assert.equal(crowd.normal[1], engine.ctx.buffers[2]);
  assert.equal(crowd.finale, engine.ctx.buffers[3]);
  assert.equal(worker.terminated, true);
  assert.equal(worker.onmessage, null);
  assert.equal(engine.prepareApplause(), ready);
});

test('browsers without Worker complete through the unchanged synchronous synthesizer', async t => {
  install(t, 'Worker', undefined);
  const engine = new AudioEngine();
  engine.ctx = context();
  const ready = engine.prepareApplause();
  assert.equal(engine.ctx.buffers.length, 4);
  const crowd = await ready;
  assert.equal(engine._crowd, crowd);
  assert.equal(engine.prepareApplause(), ready);
  assert.equal(crowd.welcome.length, 242550);
  assert.equal(crowd.finale.length, 661500);
});

test('a worker failure keeps completed buffers and synthesizes only the missing profile', async t => {
  const { engine, instances } = fakeWorker(t);
  const ready = engine.prepareApplause();
  const worker = instances[0];
  for (let index = 0; index < 3; index++) worker.respond();
  const completed = engine.ctx.buffers.slice();
  const lateMessage = worker.onmessage;
  assert.equal(worker.onerror, worker.onmessageerror);
  let prevented = false;
  worker.onerror({ preventDefault() { prevented = true; } });
  const crowd = await ready;
  assert.equal(prevented, true);
  assert.equal(worker.terminated, true);
  assert.equal(engine.ctx.buffers.length, 4);
  assert.equal(crowd.welcome, completed[0]);
  assert.equal(crowd.normal[0], completed[1]);
  assert.equal(crowd.normal[1], completed[2]);
  assert.ok(crowd.finale.getChannelData(0).some(value => value !== 0));
  lateMessage({ data: null });
  assert.equal(engine.ctx.buffers.length, 4);
});

test('malformed worker messages fall back and late decode errors are ignored', async t => {
  const { engine, instances } = fakeWorker(t);
  const ready = engine.prepareApplause();
  const worker = instances[0];
  for (let index = 0; index < 3; index++) worker.respond();
  const lateDecodeError = worker.onmessageerror;
  worker.onmessage({ data: { index: 3, sampleRate: 24000, length: 1, channels: [] } });
  assert.equal((await ready).finale.sampleRate, 44100);
  assert.equal(worker.terminated, true);
  lateDecodeError({ preventDefault() {} });
  assert.equal(engine.ctx.buffers.length, 4);
});

test('direct applause remains synchronous while an unfinished worker is terminated', async t => {
  const { engine, instances } = fakeWorker(t);
  const ready = engine.prepareApplause();
  const worker = instances[0];
  for (let index = 0; index < 3; index++) worker.respond();
  engine.dryBus = {};
  engine.reverbIn = {};
  const source = engine.applause(12.75, 1.3);
  assert.equal(source.startedAt, 12.75);
  assert.equal(source.buffer.length, 661500);
  assert.equal(source.buffer.sampleRate, 44100);
  assert.equal(worker.terminated, true);
  assert.equal(engine.ctx.buffers.length, 4);
  assert.equal(source.buffer, (await ready).finale);
});

test('audio initialization cancels an old generation and ignores every late response', async t => {
  const { engine, instances } = fakeWorker(t);
  const oldReady = engine.prepareApplause();
  const oldWorker = instances[0];
  oldWorker.respond();
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
  for (let index = 0; index < 4; index++) instances[1].respond();
  const crowd = await newReady;
  oldMessage({ data: null });
  assert.equal(engine._crowd, crowd);
  assert.equal(engine.ctx.buffers.length, 4);
});

test('a stalled worker is stopped and missing PCM is completed before resolving', async t => {
  const { engine, instances } = fakeWorker(t);
  const timers = [];
  install(t, 'setTimeout', (fn, ms) => { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer; });
  install(t, 'clearTimeout', timer => { if (timer) timer.cleared = true; });
  const ready = engine.prepareApplause();
  const worker = instances[0];
  for (let index = 0; index < 3; index++) worker.respond();
  assert.equal(timers.at(-1).ms, 30000);
  assert.ok(timers.slice(0, -1).every(timer => timer.cleared));
  timers.at(-1).fn();
  const crowd = await ready;
  assert.equal(crowd.finale.length, 661500);
  assert.equal(worker.terminated, true);
  assert.ok(timers.every(timer => timer.cleared));
});

test('constructor restrictions fall back, and synthesis errors reject without leaking a worker', async t => {
  install(t, 'Worker', class { constructor() { throw new Error('Worker blocked by policy'); } });
  const engine = new AudioEngine();
  const failure = new Error('AudioContext allocation failed');
  engine.ctx = { createBuffer() { throw failure; } };
  await assert.rejects(engine.prepareApplause(), error => error === failure);
  assert.throws(() => engine._prepareCrowd(), error => error === failure);
});
