import assert from 'node:assert/strict';
import test from 'node:test';
import { auditApplausePcm, browserState } from '../tools/bench/loading-proxy.mjs';

const definitions = [['welcome', 5.5], ['normal0', 10], ['normal1', 10], ['finale', 15]];
function fixture(layout, lite) {
  const rate = layout === 'single-stereo' ? 44100 : lite ? 16000 : 24000;
  const layers = layout === 'single-stereo' ? ['mix'] : ['close', 'wash'];
  return { lite, applausePcmBytes: 40.5 * rate * layers.length * 2 * 4,
    applause: { layout, bufferCount: 4 * layers.length, profiles: definitions.map(([name, seconds]) => ({ name,
      layers: layers.map(layer => ({ layer, sampleRate: rate, length: Math.floor(seconds * rate), channels: 2 })),
    })) } };
}

test('legacy and e741 desktop/Lite contracts retain exact rates, people, seeds, durations and PCM totals', () => {
  for (const [layout, lite, bytes] of [
    ['single-stereo', false, 14288400], ['single-stereo', true, 14288400],
    ['close-wash-stereo', false, 15552000], ['close-wash-stereo', true, 10368000],
  ]) {
    const result = auditApplausePcm(fixture(layout, lite));
    assert.equal(result.passed, true);
    assert.equal(result.expected.pcmBytes, bytes);
    assert.deepEqual(result.expected.profiles.map(profile => profile.seed), [11, 21, 22, 31]);
    assert.deepEqual(result.expected.profiles.map(profile => profile.seconds), [5.5, 10, 10, 15]);
    assert.deepEqual(result.expected.profiles.map(profile => profile.people), layout === 'single-stereo' ? [120, 170, 170, 240] : Array(4).fill(lite ? 200 : 320));
    assert.equal(result.expected.profiles[3].rhythmic, true);
  }
});

test('a matching aggregate cannot hide wrong per-profile rate, length, channel count, name or layer', () => {
  for (const field of ['sampleRate', 'length', 'channels', 'layer']) {
    const state = fixture('close-wash-stereo', false);
    state.applause.profiles[1].layers[1][field] = field === 'layer' ? 'unknown' : 1;
    const result = auditApplausePcm(state);
    assert.equal(result.passed, false, field);
    assert.ok(result.mismatches.some(mismatch => mismatch.field.endsWith('.' + field)));
    assert.equal(result.observedPcmBytes, result.expected.pcmBytes, 'the unchanged aggregate alone must not pass');
  }
  const state = fixture('single-stereo', false);
  state.applause.profiles[0].name = 'normal0';
  assert.equal(auditApplausePcm(state).passed, false);
});

test('missing/extra buffers, unsupported layout/Lite policy and incorrect total fail closed', () => {
  const mutations = [
    state => { state.applause = null; },
    state => { state.applause.layout = 'unknown'; },
    state => { state.lite = null; },
    state => { state.applause.profiles.pop(); },
    state => { state.applause.profiles[0].layers.push({ ...state.applause.profiles[0].layers[0] }); },
    state => { state.applause.bufferCount++; },
    state => { state.applausePcmBytes--; },
  ];
  for (const mutate of mutations) {
    const state = fixture('close-wash-stereo', true); mutate(state);
    const result = auditApplausePcm(state);
    assert.equal(result.passed, false);
    assert.ok(result.mismatches.length > 0);
  }
});

test('browserState exposes actual old/new AudioBuffer metadata and rejects mixed or unexpected pair shape', async t => {
  const saved = Object.fromEntries(['window', 'navigator', 'innerWidth', 'innerHeight', 'devicePixelRatio'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.after(() => { for (const [name, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'offline Node', hardwareConcurrency: 1 } });
  globalThis.innerWidth = 960; globalThis.innerHeight = 540; globalThis.devicePixelRatio = 1;
  globalThis.window = { __fp: {
    renderer: { getContext: () => ({ getExtension: () => null }), getPixelRatio: () => 1, info: { memory: {} } },
    engine: { samples: {}, ctx: { sampleRate: 48000, state: 'running' } }, perf: {}, settings: { quality: 'high' }, director: {},
  } };
  const page = { evaluate: (fn, args) => fn(args) };
  for (const [layout, lite] of [['single-stereo', false], ['close-wash-stereo', false], ['close-wash-stereo', true]]) {
    const known = fixture(layout, lite);
    const profiles = known.applause.profiles.map(profile => {
      const buffers = profile.layers.map(layer => ({ sampleRate: layer.sampleRate, length: layer.length, numberOfChannels: layer.channels }));
      return buffers.length === 1 ? buffers[0] : { close: buffers[0], wash: buffers[1] };
    });
    window.__fp.engine.lite = lite;
    window.__fp.engine._crowd = { welcome: profiles[0], normal: [profiles[1], profiles[2]], finale: profiles[3] };
    const state = await browserState(page);
    assert.deepEqual(state.applause, known.applause);
    assert.equal(auditApplausePcm(state).passed, true);
  }
  window.__fp.engine._crowd.welcome.extra = window.__fp.engine._crowd.welcome.close;
  assert.equal(auditApplausePcm(await browserState(page)).passed, false);
  delete window.__fp.engine._crowd.welcome.extra;
  window.__fp.engine._crowd.welcome = window.__fp.engine._crowd.welcome.close;
  assert.equal(auditApplausePcm(await browserState(page)).passed, false);
});
