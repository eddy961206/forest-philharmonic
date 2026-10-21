// Real Web Audio scheduling with sparse visual state updates and no repeated
// software-WebGL frames. Run serially with other GPU measurements.
// BASE_URL=http://127.0.0.1:8080 node tools/bench/audio-stability.mjs current hall desktop 65
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appURL, config, launchBrowser } from './browser.mjs';
import { browserOptions, localAppProxy, installRuntimeProbe, waitReady, networkCollector, networkSummary, browserState } from './loading-proxy.mjs';

const [label = 'current', venue = 'hall', device = 'desktop', seconds = '65'] = process.argv.slice(2);
assert.ok(/^[a-zA-Z0-9_-]+$/.test(label));
assert.ok(['hall', 'sphere'].includes(venue));
assert.ok(['desktop', 'mobile'].includes(device));
const duration = Number(seconds);
assert.ok(Number.isFinite(duration) && duration >= 61 && duration <= 68, 'First score is 73.94s; use 61-68 seconds to remain before its finale');
const quality = device === 'mobile' ? 'low' : 'high';
const cfg = config(label);
await fs.mkdir(cfg.outputDir, { recursive: true });
const output = path.join(cfg.outputDir, 'audio-stability-' + label + '-' + venue + '-' + device + '.json');
const errors = [], warnings = [];
const result = {
  measuredAt: new Date().toISOString(), label, baseURL: cfg.baseURL, revision: cfg.revision, venue, device, quality, duration, fontMode: cfg.fontMode,
  method: 'Actual local app, original assets and default audio settings. Click the real solo-entry control, place the visitor beside a real available seat, update the existing Director once, use the real sit key/button, then click the real start-show control. The current score roster is snapped onstage to skip the entrance/change animation; older builds without snapRoster retain their original all-player snap. The chosen fixture and exact player keys are recorded. The native main scene rAF is captured; there are no repeated WebGL renders during the measured interval. Performance.updateVisual runs at 5 Hz with the actual Performance.time, while the original 25ms audio worker timer, scheduler, lookahead, playback speed, notes, Web Audio graph and output remain unchanged. engine.playNote and AudioBufferSourceNode.start are transparent observation wrappers. Recording lasts until at least the requested real audio performance time, over 60 seconds. Pause uses the real transport button. This isolates low visual-update frequency from GPU/main-thread overload; it does not validate playback under sustained rendering stalls.',
  limitations: [
    'Browser/renderer identity is recorded. Mobile uses viewport/touch/UA emulation, not a real phone. Software-rendered results do not predict a physical GPU.',
    'AudioContext progress, schedule lead, actual source start calls and analyser signal do not prove physical speaker/headphone output quality or absence of device-level underruns.',
    'No forced hidden-tab or frozen-page simulation. Actual document visibility is recorded; foreground-only results must not be claimed as background-tab coverage.',
    'The existing desktop/high and mobile/low sample policies are retained. Comparing those presets against each other is not an optimization claim.',
    'Longtask and request-byte observations are from this controlled fixture. No repeated scene rendering, allocation stress or CPU throttling is imposed.',
  ],
  checks: {}, errors, warnings, passed: false,
};
let browser, proxy, page;
try {
  proxy = await localAppProxy(cfg);
  browser = await launchBrowser(cfg);
  result.environment = { browserVersion: browser.version(), platform: process.platform, architecture: process.arch, chromeArgs: cfg.chromeArgs, softwareRequested: cfg.softwareRequested, headless: cfg.headless };
  const context = await browser.newContext(browserOptions(device, browser.version()));
  page = await context.newPage();
  page.setDefaultTimeout(cfg.timeoutMs);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    else if (message.type() === 'warning') warnings.push(message.text());
  });
  await installRuntimeProbe(page, quality);
  const network = await networkCollector(page, device === 'mobile');
  await page.goto(appURL(proxy.origin, venue), { waitUntil: 'domcontentloaded' });
  await waitReady(page, cfg.timeoutMs);
  result.boot = await browserState(page);
  assert.equal(result.boot.sampleCount, device === 'mobile' ? 207 : 389);
  assert.equal(result.boot.applausePcmBytes, 14288400);
  assert.equal(result.boot.piece, 'beethoven-ode-to-joy');
  console.log(JSON.stringify({ label, venue, device, stage: 'ready', state: result.boot }));

  await page.getByRole('button', { name: '혼자 보기', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('splash'), null, { polling: 100 });
  result.checks.placement = await page.evaluate(async () => {
    const { director, camera, hall, stage, perf } = window.__fp;
    const seat = hall.seats.filter(seat => !director.occupied.has(seat.index) && Math.abs(seat.x) < 3).sort((a, b) => a.y - b.y || a.z - b.z)[0];
    if (!seat) throw new Error('No available central seat');
    director.placeAt(camera.position.clone().set(seat.x, seat.y, seat.z + 0.5), camera.position.clone().set(seat.x, seat.y + 1, seat.z - 1));
    director.update(1 / 60, { time: 0, perf, obstacles: [] });
    // Main rAF is held, so walking exits/entries cannot finish. On roster-aware
    // builds, snapping everyone would make runConcert wait for unwanted players
    // to leave. Pre-place exactly this score's players, without altering play().
    const { SECTIONS } = await import('/js/layout.js');
    const keys = new Set();
    for (const track of perf.piece.tracks) {
      const chairs = track.chairs || SECTIONS[track.section]?.chairs.map((_, i) => i) || [];
      for (const chair of chairs) keys.add(`${track.section}:${chair}`);
    }
    const rosterAware = typeof stage.snapRoster === 'function';
    if (rosterAware) stage.snapRoster(keys);
    else stage.snapOnstage();
    stage.snapConductor(!!perf.piece.conducted);
    const actual = stage.walkers.filter(w => w.state !== 'off' && !w.leaving).map(w => `${w.player.sid}:${w.player.ci}`).sort();
    const expected = [...keys].sort();
    if (rosterAware && JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Score roster fixture did not match the stage');
    const plan = rosterAware ? stage.plan(keys) : null;
    if (plan && (plan.exits.length || plan.enters.length)) throw new Error('Score roster fixture still requires a walking transition');
    return {
      candidate: seat.index, near: director.nearSeat?.index, phase: window.__fp.phase,
      stageFixture: { mode: rosterAware ? 'current-piece-roster' : 'legacy-all-players', piece: perf.piece.id, expected, actual },
    };
  });
  await page.evaluate(() => document.activeElement?.blur());
  if (device === 'mobile') await page.getByRole('button', { name: '앉기', exact: true }).click();
  else await page.keyboard.press('e');
  result.checks.seat = await page.evaluate(async () => {
    const { director, perf, engine } = window.__fp;
    if (director.mode !== 'seat') throw new Error('The actual sit input did not select a seat');
    director.update(2.5, { time: 0, perf, obstacles: [] });
    const pose = director.listener(null);
    engine.setListener(pose.pos, pose.fwd, pose.up);
    const { hallOpenness } = await import('/js/scene/hallplan.js');
    engine.setRoom(hallOpenness(pose.pos.x, pose.pos.y, pose.pos.z));
    return { mode: director.mode, seat: director.seat?.index, position: pose.pos.toArray(), contextState: engine.ctx.state };
  });
  assert.equal(result.checks.seat.mode, 'seat');
  assert.ok(Number.isInteger(result.checks.seat.seat));

  await page.evaluate(() => {
    const { engine, perf } = window.__fp;
    const state = window.__audioQA = { armedAt: performance.now(), notes: [], sourceStarts: [], samples: [], tickGapsMs: [], visibility: [{ at: performance.now(), state: document.visibilityState }], contextStates: [{ at: performance.now(), state: engine.ctx.state }], visuals: 0 };
    const originalNote = engine.playNote;
    engine.playNote = function (args) {
      const before = this.voices.size;
      const note = { ...args, observedAt: performance.now(), ctxNow: this.ctx.currentTime, leadMs: (args.when - this.ctx.currentTime) * 1000 };
      try { return originalNote.call(this, args); }
      finally { note.voiceCreated = this.voices.size > before; state.notes.push(note); }
    };
    const originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      state.sourceStarts.push({ at: performance.now(), ctxNow: this.context.currentTime, when: args[0] ?? 0, offset: args[1] ?? 0, duration: args[2] ?? null, bufferLength: this.buffer?.length, bufferSampleRate: this.buffer?.sampleRate });
      return Reflect.apply(originalStart, this, args);
    };
    let lastTick = performance.now();
    state.removeTick = engine.onTick(() => { const now = performance.now(); if (perf.playing) state.tickGapsMs.push(now - lastTick); lastTick = now; });
    engine.ctx.addEventListener('statechange', () => state.contextStates.push({ at: performance.now(), state: engine.ctx.state }));
    document.addEventListener('visibilitychange', () => state.visibility.push({ at: performance.now(), state: document.visibilityState }));
    const pcm = new Float32Array(engine.analyser.fftSize);
    state.snapshot = () => {
      engine.analyser.getFloatTimeDomainData(pcm);
      let square = 0;
      for (const value of pcm) square += value * value;
      const stamp = engine.ctx.getOutputTimestamp?.();
      return { at: performance.now(), audioTime: engine.ctx.currentTime, perfTime: perf.time, playing: perf.playing, phase: window.__fp.phase, schedIdx: perf.schedIdx, notesObserved: state.notes.length, sourceStarts: state.sourceStarts.length, voices: engine.voices.size, rms: Math.sqrt(square / pcm.length), context: engine.ctx.state, visibility: document.visibilityState, outputTimestamp: stamp ? { contextTime: stamp.contextTime, performanceTime: stamp.performanceTime } : null, jsHeapBytes: performance.memory?.usedJSHeapSize ?? null };
    };
    state.visualTimer = setInterval(() => { if (perf.playing) { perf.updateVisual(perf.time); state.visuals++; } }, 200);
    state.sampleTimer = setInterval(() => { if (perf.playing) state.samples.push(state.snapshot()); }, 1000);
    state.cleanup = () => {
      clearInterval(state.visualTimer); clearInterval(state.sampleTimer); state.removeTick();
      engine.playNote = originalNote; AudioBufferSourceNode.prototype.start = originalStart;
    };
  });
  await page.getByRole('button', { name: '공연 시작', exact: true }).click();
  await page.waitForFunction(() => window.__fp.perf.playing && window.__fp.engine.ctx.state === 'running', null, { polling: 100, timeout: 30000 });
  result.checks.started = await page.evaluate(() => { const state = window.__audioQA; state.started = state.snapshot(); return state.started; });
  console.log(JSON.stringify({ label, venue, device, stage: 'playing', state: result.checks.started }));
  const watchStart = performance.now();
  let lastReport = -10;
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const snapshot = await page.evaluate(() => window.__audioQA.snapshot());
    assert.equal(snapshot.playing, true, 'Playback ended before the requested interval');
    assert.equal(snapshot.context, 'running');
    assert.ok(performance.now() - watchStart < (duration + 20) * 1000, 'Audio clock stopped advancing');
    if (snapshot.perfTime - lastReport >= 10 || snapshot.perfTime >= duration) {
      lastReport = snapshot.perfTime;
      result.progress = snapshot;
      await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
      console.log(JSON.stringify({ label, venue, device, stage: 'playing-progress', state: snapshot }));
    }
    if (snapshot.perfTime >= duration) break;
  }
  result.recording = await page.evaluate(() => {
    const state = window.__audioQA, { perf } = window.__fp;
    const end = state.snapshot();
    const expected = [];
    for (let index = 0; index < perf.schedIdx; index++) {
      const offset = index * 5, track = perf.piece.tracks[perf.ev[offset]];
      expected.push({ section: track.section, inst: track.inst, midi: perf.ev[offset + 3], dur: perf.ev[offset + 2], gain: track.gain ?? 1, layer: track.layer ?? null });
    }
    const actual = state.notes.map(note => ({ section: note.section, inst: note.inst, midi: note.midi, dur: note.dur, gain: note.gain ?? 1, layer: note.layer ?? null }));
    const probe = window.__runtimeQA;
    for (const entry of probe.longObserver?.takeRecords() || []) probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
    const longTasks = probe.longTasks.filter(entry => entry.start >= state.started.at && entry.start <= end.at);
    state.cleanup();
    return { started: state.started, end, expected, actual, notes: state.notes, sourceStarts: state.sourceStarts, samples: state.samples, tickGapsMs: state.tickGapsMs, visuals: state.visuals, visibility: state.visibility, contextStates: state.contextStates, longTasks };
  });
  const recording = result.recording;
  assert.deepEqual(recording.actual, recording.expected, 'All score events through schedIdx must be requested once and in order');
  assert.equal(recording.notes.every(note => note.voiceCreated), true, 'A scheduled note failed to create a voice');
  assert.ok(recording.sourceStarts.length >= recording.notes.length);
  assert.ok(recording.end.perfTime >= duration);
  assert.ok(recording.end.audioTime - recording.started.audioTime > 60);
  assert.ok(recording.samples.some(sample => sample.rms > 0.00001), 'No nonzero analyser signal observed');
  const leads = recording.notes.map(note => note.leadMs).sort((a, b) => a - b);
  const gaps = [...recording.tickGapsMs].sort((a, b) => a - b);
  const quantile = (values, fraction) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? null;
  result.summary = {
    observedSeconds: recording.end.audioTime - recording.started.audioTime,
    wallSeconds: (recording.end.at - recording.started.at) / 1000,
    notes: recording.notes.length, sourceStarts: recording.sourceStarts.length,
    scoreSequenceSha256: createHash('sha256').update(JSON.stringify(recording.actual)).digest('hex'),
    scoreSequenceExact: true, allNotesCreatedVoices: true,
    visualUpdates: recording.visuals, visualHz: recording.visuals / ((recording.end.at - recording.started.at) / 1000),
    lateRequestedNotes: recording.notes.filter(note => note.leadMs < 0).length,
    requestedWithinEngineClamp5ms: recording.notes.filter(note => note.leadMs < 5).length,
    noteLeadMs: { minimum: leads[0], p50: quantile(leads, 0.5), p95: quantile(leads, 0.95) },
    audioTickGapMs: { p50: quantile(gaps, 0.5), p95: quantile(gaps, 0.95), maximum: gaps.at(-1) },
    maxObservedVoices: Math.max(0, ...recording.samples.map(sample => sample.voices)),
    nonzeroSignalSamples: recording.samples.filter(sample => sample.rms > 0.00001).length,
    longTasks: { count: recording.longTasks.length, totalMs: recording.longTasks.reduce((sum, task) => sum + task.duration, 0), maximumMs: Math.max(0, ...recording.longTasks.map(task => task.duration)) },
    visibility: recording.visibility, contextStates: recording.contextStates,
  };
  await page.locator('#btnPlay').click();
  result.checks.paused = await page.evaluate(() => ({ playing: window.__fp.perf.playing, voices: window.__fp.engine.voices.size, time: window.__fp.perf.time, context: window.__fp.engine.ctx.state }));
  assert.equal(result.checks.paused.playing, false);
  assert.equal(result.checks.paused.voices, 0);
  result.finalState = await browserState(page);
  result.network = { summary: networkSummary(network.entries()), requests: network.entries(), proxyTransactions: proxy.transactions };
  assert.equal(result.summary.lateRequestedNotes, 0, 'At least one note was requested after its intended start time');
  assert.deepEqual(errors, []);
  assert.equal(warnings.some(message => message.includes('note skipped') || message.includes('sample failed')), false);
  assert.deepEqual(proxy.errors, []);
  result.passed = true;
} catch (error) {
  result.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  if (page) await page.evaluate(() => { window.__audioQA?.cleanup?.(); window.__fp?.perf.pause(); }).catch(() => {});
  await browser?.close().catch(() => {});
  if (proxy) { result.proxyErrors = proxy.errors; await proxy.close(); }
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, passed: result.passed, summary: result.summary, error: result.error, errors }));
}
