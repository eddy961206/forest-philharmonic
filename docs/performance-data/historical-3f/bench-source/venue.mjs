// qa/render-benchmark.mjs의 이동 가능한 버전. 공연장 정적 렌더만 비교해.
import path from 'node:path';
import { appURL, choice, config, diagnosticsFailed, integer, openPage, save, sourceHashes, summarize, viewport } from './browser.mjs';

if (process.argv.includes('--help')) {
  console.log('node tools/bench/venue.mjs [label] [hall|sphere] [high|medium|low]\n환경: BASE_URL, REVISION, PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, OUTPUT_DIR, SOFTWARE_RENDERER=1, FONT_ROOT, WIDTH, HEIGHT, DPR, SAMPLES, WARMUP, SCREENSHOTS=1');
  process.exit(0);
}
const [label = 'candidate', venue = 'hall', quality = 'high'] = process.argv.slice(2);
choice(venue, ['hall', 'sphere'], 'venue');
choice(quality, ['high', 'medium', 'low'], 'quality');
const cfg = config(label);
const size = viewport('desktop', { width: 960, height: 540 });
const samplesPerScenario = integer(process.env.SAMPLES, 'SAMPLES', 5);
const warmupFrames = integer(process.env.WARMUP, 'WARMUP', 1);
const result = {
  schema: 2, suite: 'venue-static', mode: 'synchronous-completion', label,
  revision: cfg.revision, baseURL: cfg.baseURL, venue, quality, device: 'desktop',
  viewport: [size.width, size.height], devicePixelRatio: size.dpr, samplesPerScenario, warmupFrames,
  scenarioOrder: ['front', 'mid', 'wide'],
  screenshots: cfg.screenshots,
  fixture: {
    audience: false, fireflies: false, visibleRoot: 'hall.group only',
    mainAnimation: 'not executed', postProcessing: false,
    shadows: quality !== 'low', shadowRefresh: 'each measured render',
    cameraFov: 64, randomSeed: 417,
  },
  measurement: '직접 renderer.render + readPixels 완료 시간. 앱 FPS, 순수 GPU 시간, 전체 공연 프레임이 아니야.',
  scenarios: {}, status: 'RUNNING',
};
let session;
const filename = `${label}-venue-${venue}-${quality}.json`;
try {
  session = await openPage(cfg, 'desktop', size);
  const { page } = session;
  result.environment = session.environment;
  result.diagnostics = session.diagnostics;
  result.sourceHashes = await sourceHashes(page, cfg.baseURL);
  await page.addInitScript(({ quality }) => {
    let seed = 417;
    Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    localStorage.setItem('fp-settings', JSON.stringify({ quality, audience: false, fireflies: false }));
    // This scope freezes all rAF, including the establishing camera and UI.
    window.requestAnimationFrame = callback => { if (callback.name === 'frame') window.__benchFrame = callback; return 0; };
  }, { quality });
  await page.goto(appURL(cfg.baseURL, venue), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__fp && !document.getElementById('enterBtn').disabled, null, { polling: 100 });
  await page.addStyleTag({ content: 'body > :not(#stage) { visibility: hidden !important; }' });
  result.meta = await page.evaluate(() => {
    const { scene, renderer, hall } = window.__fp;
    for (const child of scene.children) if (child !== hall.group) child.visible = false;
    renderer.info.autoReset = false;
    renderer.shadowMap.autoUpdate = false;
    const gl = renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      pixelRatio: renderer.getPixelRatio(), seats: hall.seats.length,
      gpuTimerAvailable: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
    };
  });
  // 'wide' in the original hall-only runner is the foyer-facing pose. Keep
  // its exact coordinates; full-frame 'wide' uses a different camera.
  const poses = venue === 'hall' ? {
    front: [[0, 1.75, 5], [0, 2, -7]], mid: [[0, 4, 16], [0, 3, -6]], wide: [[0, 6, 40.4], [0, 6, 30]],
  } : {
    front: [[0, 1.75, 5], [0, 2, -7]], mid: [[0, 19, 34], [0, 3, -6]], wide: [[0, 44, 62], [0, 3, -6]],
  };
  for (const [name, pose] of Object.entries(poses)) {
    console.log(JSON.stringify({ label, suite: result.suite, venue, quality, scenario: name, stage: 'begin' }));
    const samples = await page.evaluate(({ pose, quality, warmupFrames, samplesPerScenario }) => {
      const { scene, camera, renderer, hall } = window.__fp;
      camera.fov = 64;
      camera.position.set(...pose[0]); camera.lookAt(...pose[1]); camera.updateProjectionMatrix();
      hall.updateLOD?.(camera.position);
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const render = () => {
        renderer.info.reset(); renderer.shadowMap.needsUpdate = quality !== 'low';
        const start = performance.now();
        renderer.render(scene, camera);
        const submitted = performance.now();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const done = performance.now();
        return {
          completeMs: done - start, submitMs: submitted - start, completionWaitMs: done - submitted,
          calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
          glError: gl.getError(), contextLost: gl.isContextLost(), pixel: [...pixel],
        };
      };
      for (let i = 0; i < warmupFrames; i++) render();
      return Array.from({ length: samplesPerScenario }, render);
    }, { pose, quality, warmupFrames, samplesPerScenario });
    result.scenarios[name] = { camera: { position: pose[0], target: pose[1], fov: 64 }, samples, ...summarize(samples, 'completeMs') };
    if (samples.some(s => s.glError || s.contextLost)) throw new Error(`${name}: WebGL 오류가 생겼어.`);
    await save(cfg, filename, result);
    if (cfg.screenshots) await page.locator('#stage canvas').screenshot({ path: path.join(cfg.outputDir, `${label}-venue-${venue}-${quality}-${name}.png`) });
    console.log(JSON.stringify({ label, name, ...result.scenarios[name].timing, calls: result.scenarios[name].meanCalls, triangles: result.scenarios[name].meanTriangles }));
  }
  result.status = diagnosticsFailed(session.diagnostics) ? 'FAIL' : 'PASS';
} catch (error) {
  result.status = 'FAIL'; result.failure = { message: error.message, stack: error.stack };
  console.error(error.message);
} finally {
  if (session) await session.browser.close();
  await save(cfg, filename, result);
}
if (result.status !== 'PASS') process.exitCode = 1;
