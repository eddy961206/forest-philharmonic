import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { test } from 'node:test';
import { hardwareRendererIssue, sha256, sourceHashes, verifySourceTree } from '../tools/bench/browser.mjs';
import { fixedAudienceMain } from '../tools/bench/loading-proxy.mjs';
import { planHouse } from '../public/js/scene/audience.js';
import { seeded } from '../public/js/app/state.js';

test('hardware gate rejects software and unknown renderers', () => {
  for (const renderer of [null, '', 'WebKit WebGL', 'ANGLE', 'ANGLE (Google, Vulkan SwiftShader Device (Subzero))',
    'Mesa llvmpipe (LLVM 19)', 'Microsoft Basic Render Driver', 'ANGLE (Microsoft, WARP)'])
    assert.ok(hardwareRendererIssue(renderer), String(renderer));
  for (const renderer of ['ANGLE (Intel, Intel(R) Iris Xe Graphics, D3D11)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)', 'AMD Radeon RX 7900 XTX',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070, OpenGL)']) assert.equal(hardwareRendererIssue(renderer), null);
});

test('full source contract catches non-core asset and local server drift', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'forest-source-contract-'));
  const keys = ['SOURCE_MANIFEST', 'SOURCE_SIDE', 'SOURCE_TREE', 'REVISION'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    await fs.mkdir(path.join(directory, 'public'));
    const files = { 'public/index.html': '<html>fixture</html>', 'public/worker.js': 'worker fixture', 'server.js': 'server fixture' };
    for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(directory, name), content);
    const manifest = {
      baseline: 'old', candidate: 'new',
      files: [...Object.entries(files).map(([name, content]) => ({ path: name, baselineSha256: sha256(content), candidateSha256: sha256(content) })),
        { path: 'public/absent.js', baselineSha256: null, candidateSha256: null }],
      collectors: { 'tools/bench/browser.mjs': sha256(await fs.readFile(new URL('../tools/bench/browser.mjs', import.meta.url))) },
    };
    const manifestPath = path.join(directory, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    Object.assign(process.env, { SOURCE_MANIFEST: manifestPath, SOURCE_SIDE: 'candidate', SOURCE_TREE: directory, REVISION: 'new' });
    assert.equal(Object.keys((await verifySourceTree()).files).length, 4);
    let corrupted = false, disposed = 0;
    const requested = [];
    const page = { request: { async get(url) {
      const name = new URL(url).pathname.slice(1);
      requested.push(name);
      const content = files['public/' + name];
      return { ok: () => content !== undefined, status: () => content === undefined ? 404 : 200,
        body: async () => Buffer.from(corrupted && name === 'worker.js' ? 'wrong worker' : content),
        dispose: async () => { disposed++; } };
    } } };
    const hashes = await sourceHashes(page, 'http://127.0.0.1:8382/');
    assert.deepEqual(requested.sort(), ['absent.js', 'index.html', 'worker.js']);
    assert.equal(hashes['worker.js'].sha256, sha256(files['public/worker.js']));
    assert.equal(disposed, 3);
    corrupted = true;
    await assert.rejects(sourceHashes(page, 'http://127.0.0.1:8382/'), /worker\.js/);
    await fs.writeFile(path.join(directory, 'server.js'), 'uncommitted server edit');
    await assert.rejects(verifySourceTree(), /server\.js/);
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('live main.js and legacy scopes satisfy bench fixture and fixedAudienceMain contracts', async () => {
  const mainBody = await fs.readFile(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const loopBody = await fs.readFile(new URL('../public/js/app/loop.js', import.meta.url), 'utf8');
  const fixtureBody = await fs.readFile(new URL('../tools/bench/full-frame-fixture.js', import.meta.url), 'utf8');

  assert.ok(
    (mainBody.includes('function frame()') || mainBody.includes('createLoop(app)')) && mainBody.includes('window.__fp ='),
    'public/js/main.js must preserve the bench route boundary markers',
  );
  assert.match(loopBody, /function frame\s*\(/, 'loop.js must keep named frame() callback for rAF capture');

  // Verify fixedAudienceMain on live main.js and both legacy main.js shapes
  const liveTransformed = fixedAudienceMain(mainBody, 417);
  assert.equal(liveTransformed.metadata.replacements, 1);
  assert.equal(liveTransformed.metadata.anchorKind, 'controller-house');

  const legacy1 = fixedAudienceMain('const x = 1;\nconst rand = room ? seeded(room.seed) : Math.random;\n', 417);
  assert.equal(legacy1.metadata.anchorKind, 'legacy-solo-rand');
  const legacy2 = fixedAudienceMain('housePlan = planHouse(hall.seats.filter((s) => !s.stage), room ? seeded(room.seed) : Math.random);', 417);
  assert.equal(legacy2.metadata.anchorKind, 'planned-house');

  // Verify the inline seeded generator produces the exact same house plan as state.seeded(417)
  // while immediately restoring global Math.random on first draw
  const sampleSeats = Array.from({ length: 24 }, (_, index) => ({
    index,
    x: (index % 6) - 2.5,
    y: Math.floor(index / 6) * 0.6,
    z: 6 + Math.floor(index / 6) * 1.1,
    level: '1층',
    row: String.fromCharCode(65 + Math.floor(index / 6)),
  }));
  const expectedPlan = planHouse(sampleSeats, seeded(417));
  const sentinelRand = () => 0.123456789;
  let observedGlobalDuringPlan = null;
  let actualPlan = null;
  const snippet = fixedAudienceMain('app.house.seatAudience();', 417).served;
  const runSnippet = new vm.Script(snippet);
  const sandbox = {
    Math: Object.create(Math, { random: { value: sentinelRand, writable: true, configurable: true } }),
    S: { room: null },
    app: {
      house: {
        seatAudience() {
          const capturedRand = sandbox.Math.random;
          actualPlan = planHouse(sampleSeats, capturedRand);
          observedGlobalDuringPlan = sandbox.Math.random;
        },
      },
    },
  };
  runSnippet.runInNewContext(sandbox);
  assert.equal(observedGlobalDuringPlan, sentinelRand, 'global Math.random must be restored immediately on first seeded call');
  assert.equal(sandbox.Math.random, sentinelRand, 'global Math.random must remain restored after seatAudience()');
  assert.equal(actualPlan.seed, expectedPlan.seed);
  assert.deepEqual(
    actualPlan.order.map((seat) => seat.index),
    expectedPlan.order.map((seat) => seat.index),
  );

  // Verify no lexical redeclaration / syntax collision when appending full-frame-fixture.js
  // to either live main.js (imports stripped) or a legacy monolithic main.js scope
  const stripStaticImports = (code) => code.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  assert.doesNotThrow(() => new vm.Script(`${stripStaticImports(mainBody)}\n${fixtureBody}`), 'live main.js + fixture syntax');

  const legacyMonolithStub = `
    let wallT = 0, lastNow = 0, levelSmoothed = 0, concertStarted = false, showStarted = false;
    let phase = 'lobby', audience = null, hush = 0, sleepy = false, quality = 'high', renderScale = 1, fx = null;
    const SP = { C: { x: 0, y: 0, z: 0 }, R: 50, EDGE: { k: 0, d: 0 } };
    function frame() {}
    window.__fp = {};
  `;
  assert.doesNotThrow(() => new vm.Script(`${legacyMonolithStub}\n${fixtureBody}`), 'legacy monolith + fixture syntax');
});
