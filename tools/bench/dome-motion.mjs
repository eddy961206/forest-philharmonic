// Controlled Sphere motion/transition diagnostics. Never imported by the app.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { appURL, choice, config, diagnosticsFailed, integer, openPage, save, sha256, sourceHashes, viewport } from './browser.mjs';

if (process.argv.includes('--help')) {
  console.log(`node tools/bench/dome-motion.mjs [label] [high|medium]
Sphere full desktop 전용. 기존 main 응답 뒤에 full-frame-fixture.js를 그대로
붙이고 별도 suffix로만 카메라/시각을 제어해. 제품 파일은 수정하지 않아.
FOREST3D 28개 1/60초 step에서 기존 benchRotate 경로로 yaw 0~360도를 돌려.
ARCH→FOREST3D reveal, FOREST3D→PEAKS3D crossfade는 4초 전환의
0/25/50/75/100% 시각을 각각 직접 진행·렌더하고 마지막 overlay 종료를 확인해.
각 전환 시각은 4회 고정 렌더를 전부 보존하고 마지막 PNG를 찍어. 이로써
medium의 alternating cadence 때문에 생기는 인위적인 1초 된 슬롯을 피해.
중간 시각을 건너뛰는 검사야. 연속 4초 시청·실제 입력·FPS·음질 검증이 아니야.
큐브 face/target/texture의 갱신 요청과 정상 반환, renderer 상태 복원,
실제 dome draw/program readiness, GL 오류와 예외를 원본에 남겨.
큐브 renderer.render 정상 반환은 proxy mesh draw·world program 완료·픽셀의
갱신을 증명하지 않아. 필요한 면에 같은 world/시각의 호출이 있었는지만 검사해.
Node가 요청한 품질·renderScale=1·DPR별 예상 pixelRatio를 모든 표본과 대조해.
renderer wrapper와 상태 조회가 들어간 completeMs는 진단값일 뿐 성능 비교나
FPS로 쓰지 않아. 관측하지 못한 내부 slot/VRAM/화면 픽셀은 추정하지 않아.
환경: BASE_URL, REVISION, OUTPUT_DIR, PLAYWRIGHT_MODULE, CHROME_EXECUTABLE,
CHROME_ARGS, SOFTWARE_RENDERER=1, FONT_ROOT, FONT_MODE, HEADLESS=0, WIDTH,
HEIGHT, DPR, TIMEOUT_MS=180000, WARMUP=4, SCREENSHOTS=0(기본은 저장).
TIMEOUT_MS는 준비와 각 비동기 조작의 상한이야. 실행 전체 제한은 아니야.
마지막 snapshot/source/close는 각각 최대 10/15/10초야. close timeout도 FAIL로
저장하고 Node를 exit 1로 끝내. 이 경우 브라우저 종료는 확인 불가로 기록해.
같은 label/quality의 JSON·PNG는 덮어쓰지 않아. 실패 원본은 그대로 남겨.
--help는 브라우저를 실행하지 않아.`);
  process.exit(0);
}
assert.ok(process.argv.length <= 4, '인자는 label과 high|medium까지만 지원해.');
const [label = 'dome-candidate', quality = 'high'] = process.argv.slice(2);
choice(quality, ['high', 'medium'], 'quality');
const cfg = config(label), size = viewport('desktop', { width: 640, height: 360 });
// Independent Node expectations for the pinned 1f/dea manual desktop profiles.
// A page that silently chooses another preset cannot validate itself.
const requestedQuality = { quality, settingsQuality: quality, renderScale: 1,
  pixelRatio: quality === 'high' ? Math.min(size.dpr, 1.5) : Math.min(size.dpr, 1.25) * .85,
  cubeSize: quality === 'high' ? 640 : 512 };
const warmupFrames = integer(process.env.WARMUP, 'WARMUP', 4);
const screenshots = process.env.SCREENSHOTS !== '0';
const fixtureURL = new URL('./full-frame-fixture.js', import.meta.url);
const fixture = await fs.readFile(fixtureURL, 'utf8');

// This function is serialized into the SAME module scope as main + fixture.
// Probes wrap public renderer/controller methods for one finite step at a time.
function installDomeMotion() {
  const dome = hall.dome, gl = renderer.getContext();
  const worlds = ['FOREST3D', 'OCEAN3D', 'CLOUDS3D', 'PEAKS3D'];
  const targets = new Map(), textures = new Map(), targetIds = new WeakMap();
  let serial = 0, transition = null, nextTargetId = 1, lastRow = null;
  // Three r186 RenderTarget has no uuid. Texture UUIDs alone cannot distinguish
  // a target object replacement that happens to retain the same texture.
  const targetKey = rt => {
    if (!rt) return null;
    if (!targetIds.has(rt)) targetIds.set(rt, `target-${nextTargetId++}`);
    return targetIds.get(rt);
  };
  const overlay = () => dome.mesh.children.find(o => o.isMesh && o.material?.uniforms?.uOverlay?.value === 1);
  const state = () => ({ target: targetKey(renderer.getRenderTarget()), face: renderer.getActiveCubeFace(),
    mip: renderer.getActiveMipmapLevel(), xr: renderer.xr.enabled,
    viewport: Array.from(gl.getParameter(gl.VIEWPORT) || []), scissor: Array.from(gl.getParameter(gl.SCISSOR_BOX) || []),
    scissorTest: gl.isEnabled(gl.SCISSOR_TEST) });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const readQuality = () => ({ quality, settingsQuality: settings.quality, renderScale, pixelRatio: renderer.getPixelRatio() });
  const snapshot = () => ({
    current: dome.current, visible: dome.mesh.visible, overlayVisible: overlay()?.visible ?? null,
    a: dome.uniforms.uA.value, b: dome.uniforms.uB.value, mix: dome.uniforms.uMix.value,
    reveal: dome.uniforms.uReveal.value, domeTime: dome.uniforms.uTime.value,
    live: dome.uniforms.uLive.value, musicTime: benchT, wallTime: wallT, ...readQuality(),
    camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov,
      projectionMatrix: camera.projectionMatrix.toArray() },
    slots: ['A', 'B'].map(slot => {
      const texture = dome.uniforms[`uCube${slot}`].value;
      return { slot, worldId: dome.uniforms[`uCube${slot}Id`].value, texture: texture?.uuid ?? null,
        target: texture ? textures.get(texture.uuid) ?? null : null };
    }),
  });
  // Read-only demand estimate from the served face-mask sampling geometry.
  // It checks first-use render requests, not actual proxy draws or fresh texels.
  function demandedFaces() {
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const centre = new THREE.Vector3(SP.C.x, SP.C.y, SP.C.z);
    const offset = origin.clone().sub(centre), ray = new THREE.Vector3(), hit = new THREE.Vector3();
    const cc = offset.lengthSq() - SP.R * SP.R;
    let mask = 0;
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 10; x++) {
      ray.set(x / 5 - 1, y / 4 - 1, .5).unproject(camera).sub(origin).normalize();
      const b = offset.dot(ray), disc = b * b - cc;
      if (disc < 0) continue;
      const distance = -b + Math.sqrt(disc);
      if (distance <= 0) continue;
      hit.copy(origin).addScaledVector(ray, distance);
      if (hit.y - SP.EDGE.k * hit.z - SP.EDGE.d < -.5) continue;
      hit.sub(dome.uniforms.uView.value);
      const lengths = [Math.abs(hit.x), Math.abs(hit.y), Math.abs(hit.z)], limit = Math.max(...lengths) * .8;
      if (lengths[0] >= limit) mask |= hit.x > 0 ? 1 : 2;
      if (lengths[1] >= limit) mask |= hit.y > 0 ? 4 : 8;
      if (lengths[2] >= limit) mask |= hit.z > 0 ? 16 : 32;
    }
    return Array.from({ length: 6 }, (_, i) => i).filter(i => i !== 3 && mask & (1 << i));
  }
  function clearWorlds() {
    window.__bench.scenario('rotate'); benchRotate = false;
    // ARCH requests no worlds: use the real controller to release slot ownership.
    // No renderer settings, private slots or product face caches are overwritten.
    dome.drawWorlds();
    for (const rt of targets.values()) { rt.world = null; rt.lastT = null; rt.faces = {}; }
  }
  function recordUpdateRequest(rt, scene, face, row, returnedNormally) {
    const u = scene.children.find(o => o.material?.uniforms?.uWorld)?.material.uniforms;
    const world = Number.isInteger(u?.uWorld.value) ? u.uWorld.value : null;
    const t = u?.uT.value ?? null;
    const key = targetKey(rt);
    let record = targets.get(key);
    if (!record) {
      record = { target: key, texture: rt.texture.uuid, width: rt.width, height: rt.height, world: null, lastT: null, epoch: 0, faces: {} };
      targets.set(key, record); textures.set(rt.texture.uuid, key);
    }
    if (record.world !== world || (t !== null && record.lastT !== null && t < record.lastT - 1e-9)) {
      record.epoch++; record.faces = {};
    }
    record.world = world; record.lastT = t; record.width = rt.width; record.height = rt.height;
    const request = { target: key, texture: rt.texture.uuid, face, world, worldName: worlds[world] ?? null,
      width: rt.width, height: rt.height, elapsedWorldTime: t, globalWorldTime: u?.uTime.value ?? null,
      epoch: record.epoch, returnedNormally };
    row.cubeUpdateRequests.push(request);
    if (returnedNormally) record.faces[face] = { world, epoch: record.epoch, serial: row.serial,
      elapsedWorldTime: t, globalWorldTime: u?.uTime.value ?? null };
  }
  function probe(freezeDome = false) {
    const row = lastRow = { serial: serial++, status: 'RUNNING', input: snapshot(), cubeUpdateRequests: [], worldCalls: [], failures: [], exceptions: [] };
    const render0 = renderer.render, worlds0 = dome.drawWorlds, update0 = dome.update;
    const renderHook = function(scene, cam, ...rest) {
      const rt = renderer.getRenderTarget(), face = renderer.getActiveCubeFace();
      let returnedNormally = false;
      try { const value = render0.call(this, scene, cam, ...rest); returnedNormally = true; return value; }
      finally { if (rt?.isWebGLCubeRenderTarget) recordUpdateRequest(rt, scene, face, row, returnedNormally); }
    };
    const worldHook = function(...args) {
      const call = { before: state() }; row.worldCalls.push(call);
      try { return worlds0.apply(this, args); }
      catch (error) { call.exception = { message: error.message, stack: error.stack }; throw error; }
      finally { call.after = state(); call.restored = same(call.before, call.after); }
    };
    const updateHook = function(_dt, ...args) { return update0.call(this, 0, ...args); };
    let began = false;
    try {
      window.__bench.beginDomeWarmup(); began = true;
      renderer.render = renderHook; dome.drawWorlds = worldHook;
      if (freezeDome) dome.update = updateHook;
      row.sample = { ...window.__bench.step(true), ...readQuality() };
    } catch (error) { row.exceptions.push({ message: error.message, stack: error.stack }); }
    finally {
      row.hooks = { rendererOwned: renderer.render === renderHook, worldsOwned: dome.drawWorlds === worldHook,
        updateOwned: dome.update === (freezeDome ? updateHook : update0) };
      // Preserve any unexpected replacement instead of silently overwriting it.
      if (row.hooks.rendererOwned) renderer.render = render0;
      if (row.hooks.worldsOwned) dome.drawWorlds = worlds0;
      if (freezeDome && row.hooks.updateOwned) dome.update = update0;
      row.hooks.restored = renderer.render === render0 && dome.drawWorlds === worlds0 && dome.update === update0;
      if (began) {
        try { row.domeReadiness = window.__bench.endDomeWarmup(); }
        catch (error) { row.exceptions.push({ message: error.message, stack: error.stack }); }
      }
    }
    row.output = snapshot(); row.demandedFaces = demandedFaces(); row.stateAfter = state();
    row.glErrorAfterInspection = gl.getError(); row.contextLost = gl.isContextLost();
    row.faceRequestCoverage = row.output.slots.filter(slot => slot.worldId >= 16).flatMap(slot => {
      const rt = targets.get(slot.target);
      return row.demandedFaces.map(face => ({ slot: slot.slot, target: slot.target, worldId: slot.worldId, face,
        lastUpdateRequest: rt?.faces[face] ?? null, valid: rt?.faces[face]?.world === slot.worldId - 16 && rt.faces[face].epoch === rt.epoch }));
    });
    if (!row.hooks.restored || Object.values(row.hooks).some(value => value === false)) row.failures.push('Probe hook ownership/restoration failed.');
    if (!row.worldCalls.length || row.worldCalls.some(call => !call.restored)) row.failures.push('drawWorlds renderer target/face/mip/XR/viewport/scissor restoration failed or was not observed.');
    if (row.domeReadiness?.status !== 'VERIFIED') row.failures.push('Dome main-camera draw/program readiness was not verified.');
    if (row.sample?.glError || row.sample?.contextLost || row.glErrorAfterInspection || row.contextLost) row.failures.push('WebGL error/context loss.');
    if (row.faceRequestCoverage.some(face => !face.valid)) row.failures.push('A demanded cube face has no observed normally returned renderer.render request for the assigned world/epoch.');
    if (row.cubeUpdateRequests.some(request => request.world === null || request.face === 3)) row.failures.push('Unexpected cube update world or face.');
    if (targets.size > 2) row.failures.push('More than two cube render targets observed.');
    if (Math.abs(row.output.wallTime - row.input.wallTime - 1 / 60) > 1e-8) row.failures.push('Main animation dt was not exactly 1/60 second.');
    row.status = row.failures.length || row.exceptions.length ? 'FAIL' : 'PASS';
    return row;
  }
  window.__domeMotion = {
    readQuality,
    prepareRotation() {
      clearWorlds(); window.__bench.scenario('forest'); benchRotate = true; benchIndex = 0;
      transition = null; return snapshot();
    },
    rotationStep(index) {
      // Reuse the fixture's yaw/pitch/x-motion expression, including its .24 factor.
      benchIndex = index * (2 * Math.PI / 27) / .24;
      const row = probe(); row.rotation = { index, nominalYawRadians: index * 2 * Math.PI / 27, fixedDt: 1 / 60 };
      if (row.output.current !== 'FOREST3D' || row.output.a !== 16 || row.output.mix !== 0 || row.output.overlayVisible !== false) row.failures.push('Rotation is not a settled full FOREST3D world.');
      if (!same(row.output.slots.filter(slot => slot.worldId >= 16).map(slot => slot.worldId), [16])) row.failures.push('Rotation has no unique FOREST3D cube slot.');
      row.status = row.failures.length || row.exceptions.length ? 'FAIL' : 'PASS'; return row;
    },
    prepareTransition(kind) {
      clearWorlds();
      if (kind === 'crossfade') window.__bench.scenario('forest');
      benchRotate = false; benchIndex = 0; benchT = 25; wallT = 20;
      const from = kind === 'reveal' ? 'ARCH' : 'FOREST3D', to = kind === 'reveal' ? 'FOREST3D' : 'PEAKS3D';
      dome.go(to, { dur: 4, reveal: kind === 'reveal' }); dome.update(0); dome.uniforms.uTime.value = 20;
      transition = { kind, from, to, elapsed: 0, duration: 4 }; return { ...transition, state: snapshot() };
    },
    transitionStep(fraction) {
      if (!transition || fraction * 4 < transition.elapsed) throw new Error('Transition checkpoints must be monotonic.');
      const elapsed = fraction * 4;
      dome.update(elapsed - transition.elapsed); transition.elapsed = elapsed;
      benchT = 25 + elapsed; wallT = 20 + elapsed - 1 / 60;
      // This one frame uses the exact sampled dome time. Other main animation
      // still advances 1/60; this is not an uninterrupted 4-second simulation.
      const row = probe(true); row.transition = { ...transition, fraction };
      const fromId = transition.from === 'ARCH' ? 0 : 16, toId = transition.to === 'FOREST3D' ? 16 : 19;
      const mix = fraction === 1 ? 0 : fraction < .5 ? 2 * fraction * fraction : 1 - (-2 * fraction + 2) ** 2 / 2;
      const expected = { a: fraction === 1 ? toId : fromId, b: toId, mix,
        reveal: fraction === 1 ? 0 : Number(transition.kind === 'reveal'), overlayVisible: fraction > 0 && fraction < 1 };
      row.expected = expected;
      for (const [key, value] of Object.entries(expected)) {
        if (typeof value === 'number' ? Math.abs(row.output[key] - value) > 1e-8 : row.output[key] !== value) row.failures.push(`Transition ${key} differs from the exact sampled state.`);
      }
      const expectedWorldIds = fraction === 1 || transition.kind === 'reveal' ? [toId] : [fromId, toId];
      const actualWorldIds = row.output.slots.filter(slot => slot.worldId >= 16).map(slot => slot.worldId).sort((a, b) => a - b);
      if (!same(expectedWorldIds, actualWorldIds)) row.failures.push('Active cube slot world IDs differ from the transition endpoints.');
      if (row.output.current !== transition.to || Math.abs(row.output.domeTime - (20 + elapsed)) > 1e-8) row.failures.push('Transition world/time differs from the controlled checkpoint.');
      row.status = row.failures.length || row.exceptions.length ? 'FAIL' : 'PASS'; return row;
    },
    inventory() { return [...targets.values()].map(record => ({ ...record })); },
    lastStep() { return lastRow; },
  };
}
const suffix = `\n;(${installDomeMotion.toString()})();\n`;
const toolSources = async () => ({ collector: sha256(await fs.readFile(new URL(import.meta.url))),
  fixture: sha256(await fs.readFile(fixtureURL)), helper: sha256(await fs.readFile(new URL('./browser.mjs', import.meta.url))),
  referenceFullFrame: sha256(await fs.readFile(new URL('./full-frame.mjs', import.meta.url))), suffix: sha256(suffix) });
const stem = `${label}-dome-motion-sphere-${quality}-desktop`, filename = `${stem}.json`;
const result = { schema: 2, suite: 'sphere-dome-motion-controlled', status: 'RUNNING', label, revision: cfg.revision,
  baseURL: cfg.baseURL, venue: 'sphere', device: 'desktop', quality, viewport: [size.width, size.height], devicePixelRatio: size.dpr,
  startedAt: new Date().toISOString(), toolSources: await toolSources(), warmupFrames, screenshots, requestedQuality,
  policy: { rotationFrames: 28, animationDt: 1 / 60, yawSpanRadians: 2 * Math.PI, transitionSeconds: 4, checkpoints: [0, .25, .5, .75, 1], checkpointPasses: 4,
    fixture: 'Unchanged full-frame fixture; Beethoven, seed 417, fill .8, real visuals, disabled note scheduler, synthetic music clock; full desktop only.',
    temporalScope: '28 fixed rotation steps plus five sampled transition times; not continuous real-time playback or a complete 4-second viewing test.',
    checkpointPolicy: 'Four passes at each exact dome/music/camera time exercise update requests for both slots at medium every=2 alternating cadence. Preserve all passes, capture the fourth; normal return does not prove fresh pixels.',
    timing: 'completeMs includes renderer probes/state reads and readPixels; diagnostics only, never FPS or an uninstrumented A/B performance claim.',
    faceScope: 'Observed cube renderer.render requests/normal returns plus the product-equivalent 11x9 rule for first-use request coverage. Not proof of actual proxy mesh draws, world program readiness, fresh/visible pixels, or minimal masks. No private slot access or VRAM inference. Product intentionally excludes -Y.',
    quality: 'Node-requested preset, renderScale=1, expected renderer pixelRatio and cube size are checked against meta, every warmup sample, and every motion sample/input/output; page lexical quality is observation only.',
    restoration: 'Checks the state actually encountered by drawWorlds and temporary probe hooks; does not inject renderer exceptions or nondefault target/XR state.' },
  initialReadiness: { status: 'NOT_RUN' }, rotation: { status: 'NOT_RUN', samples: [] },
  transitions: Object.fromEntries(['reveal', 'crossfade'].map(kind => [kind, { status: 'NOT_RUN', samples: [] }])),
  screenshotsSaved: [], failures: [], sourceConsistency: 'NOT_RUN' };
await fs.mkdir(cfg.outputDir, { recursive: true });
await fs.writeFile(path.join(cfg.outputDir, filename), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
const persist = () => save(cfg, filename, result);
let timedOut = false;
async function bounded(promise, stage, timeoutMs = cfg.timeoutMs) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => {
    timedOut = true; reject(new Error(`${stage}: timeout ${timeoutMs} ms exceeded.`));
  }, timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
let session;
async function captureSources() {
  const hashes = await sourceHashes(session.page, cfg.baseURL);
  for (const name of ['js/scene/sphereplan.js', 'vendor/three/three.core.js', 'vendor/three/three.module.js']) {
    const response = await session.page.request.get(new URL(name, cfg.baseURL).href);
    hashes[name] = response.ok() ? { sha256: sha256(await response.body()) } : { httpStatus: response.status() };
  }
  for (const [name, value] of Object.entries(hashes)) if (name !== 'js/quality.js') assert.match(value.sha256 || '', /^[a-f0-9]{64}$/, `Missing source: ${name}`);
  return hashes;
}
async function screenshot(name) {
  if (!screenshots) return;
  const file = `${stem}-${name}.png`;
  const bytes = await bounded(session.page.locator('#stage canvas').screenshot(), `screenshot ${name}`);
  await fs.writeFile(path.join(cfg.outputDir, file), bytes, { flag: 'wx' });
  result.screenshotsSaved.push({ name, file, bytes: bytes.length, sha256: sha256(bytes) });
}
function assertRequestedQuality(observed, stage) {
  assert.ok(observed, `${stage}: quality observation is missing.`);
  const check = observed.requestedQualityCheck = { stage, status: 'RUNNING', expected: requestedQuality };
  try {
    assert.equal(observed.quality, requestedQuality.quality, `${stage}: active preset differs from the Node request.`);
    assert.equal(observed.settingsQuality, requestedQuality.settingsQuality, `${stage}: manual setting differs from the Node request.`);
    assert.equal(observed.renderScale, requestedQuality.renderScale, `${stage}: renderScale changed.`);
    assert.ok(Number.isFinite(observed.pixelRatio) && Math.abs(observed.pixelRatio - requestedQuality.pixelRatio) < 1e-9,
      `${stage}: pixelRatio ${observed.pixelRatio} differs from requested profile ${requestedQuality.pixelRatio}.`);
    check.status = 'PASS';
  } catch (error) { check.status = 'FAIL'; check.failure = error.message; throw error; }
}
const accept = row => {
  try {
    for (const key of ['input', 'sample', 'output']) assertRequestedQuality(row[key], `step ${row.serial} ${key}`);
    for (const request of row.cubeUpdateRequests) assert.ok(request.width === requestedQuality.cubeSize && request.height === requestedQuality.cubeSize,
      `step ${row.serial}: cube request dimensions differ from Node-requested ${requestedQuality.cubeSize}.`);
  } catch (error) { row.status = 'FAIL'; row.failures.push(error.message); throw error; }
  assert.equal(row.status, 'PASS', [...row.failures, ...row.exceptions.map(e => e.message)].join(' '));
};
try {
  // Keep ownership of a launching browser: racing launch itself can orphan a
  // browser that resolves after the timeout. Playwright bounds its own launch.
  session = await openPage(cfg, 'desktop', size);
  const { page } = session; result.environment = session.environment; result.diagnostics = session.diagnostics;
  result.sourceHashes = await bounded(captureSources(), 'source before');
  await page.addInitScript(({ quality }) => {
    function rng(seed) { return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }; }
    Math.random = rng(417); window.__uuidRandom = rng(874); window.__resetRandom = () => { Math.random = rng(417); };
    localStorage.setItem('fp-settings', JSON.stringify({ quality, audience: true }));
    const native = window.requestAnimationFrame.bind(window); window.__nativeRAF = native;
    window.requestAnimationFrame = callback => callback.name === 'frame' ? (window.__benchFrame = callback, 0) : native(callback);
    window.__fpMaxDt = 1 / 60;
  }, { quality });
  await page.route('**/vendor/three/three.core.js', async route => {
    try {
      const response = await route.fetch(), body = await response.text();
      const match = body.match(/function generateUUID\(\) \{[\s\S]*?\n\}/);
      if (!match?.[0].includes('Math.random()')) throw new Error('Three UUID fixture location changed.');
      await route.fulfill({ response, body: body.replace(match[0], match[0].replaceAll('Math.random()', 'window.__uuidRandom()')) });
    } catch (error) { session.diagnostics.pageErrors.push(`UUID fixture: ${error.message}`); await route.abort(); }
  });
  await page.route('**/js/main.js', async route => {
    try {
      const response = await route.fetch(), body = await response.text();
      if (!body.includes('function frame()') || !body.includes('window.__fp =')) throw new Error('Unexpected main.js fixture boundary.');
      result.injectedMain = { originalSha256: sha256(body), fixtureSha256: sha256(fixture), suffixSha256: sha256(suffix), combinedSha256: sha256(`${body}\n${fixture}${suffix}`) };
      await route.fulfill({ response, body: `${body}\n${fixture}${suffix}` });
    } catch (error) { session.diagnostics.pageErrors.push(`main fixture: ${error.message}`); await route.abort(); }
  });
  await page.goto(appURL(cfg.baseURL, 'sphere'), { waitUntil: 'domcontentloaded' });
  result.initialReadiness = { status: 'WAITING', policy: 'Existing UI readiness and dome visibility, never forced visible.' };
  await page.waitForFunction(() => window.__domeMotion && window.__bench && window.__fp?.hall.dome?.mesh.visible === true &&
    document.getElementById('enterBtn')?.disabled === false, null, { polling: 100 });
  Object.assign(result.initialReadiness, await bounded(page.evaluate(() => ({ status: 'READY', uiReady: !document.getElementById('enterBtn').disabled, domeVisible: window.__fp.hall.dome.mesh.visible })), 'initial readiness snapshot'));
  result.fixture = await bounded(page.evaluate(() => window.__bench.setup()), 'fixture setup');
  assert.equal(result.fixture.lite, false, 'This suite requires the full desktop 3D path.');
  await page.addStyleTag({ content: 'body > :not(#stage) { visibility: hidden !important; }' });
  result.meta = await bounded(page.evaluate(() => ({ ...window.__bench.meta(), ...window.__domeMotion.readQuality() })), 'renderer meta');
  assertRequestedQuality(result.meta, 'meta');
  await persist(); console.log(JSON.stringify({ label, quality, stage: 'ready', fixture: result.fixture, meta: result.meta }));
  await bounded(page.evaluate(() => { window.__bench.scenario('crossfade'); window.__bench.beginDomeWarmup(); }), 'prepare warmup crossfade');
  result.warmupSamples = [];
  try {
    for (let i = 0; i < warmupFrames; i++) {
      const sample = await bounded(page.evaluate(() => ({ ...window.__bench.step(true), ...window.__domeMotion.readQuality() })), `warmup ${i}`);
      result.warmupSamples.push(sample);
      assertRequestedQuality(sample, `warmup ${i}`);
      assert.ok(!sample.glError && !sample.contextLost, 'WebGL error/context loss during warmup.');
    }
  }
  finally { result.warmupReadiness = await bounded(page.evaluate(() => window.__bench.endDomeWarmup()), 'warmup readiness'); }
  assert.equal(result.warmupReadiness.status, 'VERIFIED', JSON.stringify(result.warmupReadiness.failures));
  result.rotation = { status: 'PREPARING', samples: [] };
  result.rotation.initial = await bounded(page.evaluate(() => window.__domeMotion.prepareRotation()), 'prepare rotation');
  assertRequestedQuality(result.rotation.initial, 'prepare rotation');
  result.rotation.status = 'RUNNING';
  for (let i = 0; i < 28; i++) {
    const row = await bounded(page.evaluate(i => window.__domeMotion.rotationStep(i), i), `rotation ${i}`);
    result.rotation.samples.push(row); await persist(); accept(row);
    if ([0, 7, 14, 21, 27].includes(i)) {
      await screenshot(`rotation-${String(i).padStart(2, '0')}`);
      console.log(JSON.stringify({ label, quality, stage: 'rotation', index: i, demandedFaces: row.demandedFaces, cubeUpdateRequests: row.cubeUpdateRequests.length }));
    }
  }
  const initialFaces = new Set(result.rotation.samples[0].demandedFaces);
  const union = [...new Set(result.rotation.samples.flatMap(row => row.demandedFaces))].sort();
  result.rotation.faceCoverage = { initial: [...initialFaces], union, newlyDemanded: union.filter(face => !initialFaces.has(face)) };
  assert.ok(result.rotation.faceCoverage.newlyDemanded.length > 0, 'Rotation did not exercise any newly demanded cube face.');
  result.rotation.status = 'PASS';
  for (const kind of ['reveal', 'crossfade']) {
    const run = result.transitions[kind] = { status: 'PREPARING', samples: [], checkpoints: [] };
    run.initial = await bounded(page.evaluate(kind => window.__domeMotion.prepareTransition(kind), kind), `prepare ${kind}`);
    assertRequestedQuality(run.initial.state, `prepare ${kind}`);
    run.status = 'RUNNING';
    for (const fraction of [0, .25, .5, .75, 1]) {
      const checkpoint = { fraction, status: 'RUNNING', sampleIndices: [] }; run.checkpoints.push(checkpoint);
      for (let repeat = 0; repeat < 4; repeat++) {
        const row = await bounded(page.evaluate(fraction => window.__domeMotion.transitionStep(fraction), fraction), `${kind} ${fraction} pass ${repeat}`);
        row.checkpointPass = repeat; checkpoint.sampleIndices.push(run.samples.length);
        run.samples.push(row); await persist(); accept(row);
      }
      const last = run.samples.at(-1);
      checkpoint.bothSlotsRequestedAtSampledTime = last.faceRequestCoverage.every(face => Math.abs(face.lastUpdateRequest.globalWorldTime - last.output.domeTime) < 1e-8);
      assert.ok(checkpoint.bothSlotsRequestedAtSampledTime, 'Four checkpoint passes did not observe normally returned update requests for every demanded active-world face at the sampled time.');
      checkpoint.status = 'PASS'; await screenshot(`${kind}-${Math.round(fraction * 100)}`);
      console.log(JSON.stringify({ label, quality, stage: kind, fraction, status: checkpoint.status }));
    }
    run.status = 'PASS';
  }
  result.targetInventory = await bounded(page.evaluate(() => window.__domeMotion.inventory()), 'cube target inventory');
  assert.equal(result.targetInventory.length, 2, 'Crossfade must have observed exactly two reusable cube targets.');
  assert.equal(result.injectedMain.originalSha256, result.sourceHashes['js/main.js'].sha256, 'Served main differs from the injected original.');
} catch (error) {
  if (error.name === 'TimeoutError') timedOut = true;
  result.failures.push({ message: error.message, stack: error.stack });
  if (result.initialReadiness.status === 'WAITING') result.initialReadiness.status = 'FAIL';
  if (['RUNNING', 'PREPARING'].includes(result.rotation.status)) result.rotation.status = 'FAIL';
  for (const run of Object.values(result.transitions)) {
    if (['RUNNING', 'PREPARING'].includes(run.status)) run.status = 'FAIL';
    for (const checkpoint of run.checkpoints || []) if (checkpoint.status === 'RUNNING') checkpoint.status = 'FAIL';
  }
  if (session && !timedOut) { try { await screenshot('failure'); } catch (failure) { result.failures.push({ stage: 'failure screenshot', message: failure.message }); } }
} finally {
  if (session) {
    try { if (!timedOut) {
      result.finalProbe = await bounded(session.page.evaluate(() => window.__domeMotion ? {
        inventory: window.__domeMotion.inventory(), lastStep: window.__domeMotion.lastStep(),
      } : { status: 'NOT_INSTALLED' }), 'final probe snapshot', Math.min(cfg.timeoutMs, 10000));
    } else result.finalProbe = { status: 'UNAVAILABLE_AFTER_TIMEOUT', interpretation: 'Pending page evaluation may not have finished restoring its hooks; browser is closed below.' };
    } catch (error) { result.failures.push({ stage: 'final probe snapshot', message: error.message }); }
    try {
      result.sourceHashesAfter = await bounded(captureSources(), 'source after', Math.min(cfg.timeoutMs, 15000));
      result.sourceConsistency = JSON.stringify(result.sourceHashes) === JSON.stringify(result.sourceHashesAfter) ? 'PASS' : 'FAIL';
      if (result.sourceConsistency !== 'PASS') result.failures.push({ stage: 'source consistency', message: 'Served source changed during the run.' });
    } catch (error) { result.sourceConsistency = 'UNVERIFIED'; result.failures.push({ stage: 'source after', message: error.message }); }
    result.browserClose = { status: 'RUNNING', timeoutMs: Math.min(cfg.timeoutMs, 10000) };
    // Save preceding evidence before close: a stalled transport must not keep
    // the only failure record in memory while the process waits to terminate.
    if (result.failures.length) result.status = 'FAIL';
    await persist();
    try {
      await bounded(session.browser.close(), 'browser close', result.browserClose.timeoutMs);
      result.browserClose.status = 'CLOSED';
    } catch (error) {
      result.browserClose.status = 'FAIL'; result.browserClose.terminationConfirmed = false;
      result.failures.push({ stage: 'browser close', message: error.message });
    }
  }
  try {
    result.toolSourcesAfter = await toolSources();
    if (JSON.stringify(result.toolSources) !== JSON.stringify(result.toolSourcesAfter)) result.failures.push({ stage: 'tool consistency', message: 'Collector/fixture/helper changed during the run.' });
  } catch (error) { result.failures.push({ stage: 'tool consistency', message: error.message }); }
  if (session && (diagnosticsFailed(session.diagnostics) || session.diagnostics.failedRequests.length)) result.failures.push({ stage: 'browser diagnostics', message: 'See preserved page/console/request diagnostics.' });
  result.status = result.failures.length || result.sourceConsistency !== 'PASS' ? 'FAIL' : 'PASS';
  result.timedOut = timedOut; result.finishedAt = new Date().toISOString(); await persist();
  console.log(JSON.stringify({ suite: result.suite, label, quality, status: result.status, output: path.join(cfg.outputDir, filename), failures: result.failures }));
}
// A failed close can leave Playwright transport handles alive. Evidence has
// been awaited on disk above; stop this Node process without claiming that an
// unresponsive browser was successfully terminated.
if (result.browserClose?.status === 'FAIL') process.exit(1);
if (result.status !== 'PASS') process.exitCode = 1;
