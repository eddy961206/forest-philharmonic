// Plaza -> real ticket purchase -> venue admission -> return to plaza.
// Run serially with other browser tests. This is functional QA, not an FPS test.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config, diagnosticsFailed, openPage, save, sha256, sourceHashes, viewport } from './browser.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`node tools/bench/plaza.mjs [hall|sphere] [desktop|mobile]
기본값은 두 공연장 × desktop/mobile을 순서대로 검사해.
광장 첫 화면 → 매표소 → 공연장/혼자 보기 선택 → 이름/결제 연출 → 발권 →
입구까지 이동 → 실제 표 검사/입장 버튼 → 공연장 WebGL → 광장 복귀를 확인해.
새 main 1f의 매표소 background inert/Tab, 이름 입력 중 Escape 취소·재개,
표 stub 실제 탭, 페이지 이동 간 저장 표 동일성과 복귀 후 표 반납도 검사해.
CSS/index/tickets/plazaWorld를 포함한 실제 제공 소스를 실행 전후 해시로 남겨.
이 추가 HTTP 요청은 로딩 시간 측정에 사용할 수 없어.
NAVIGATION=ui(기본)는 키보드/엄지스틱, canvas 클릭/터치와 드래그로 이동해.
NAVIGATION=placement는 매표소·입구 앞 위치만 명시적 fixture로 배치해.
후자는 이동/충돌의 실제 UI 성공으로 계산하지 않고 결과에 별도로 표시해.
두 모드 모두 발권·공연장 입장·복귀는 실제 UI로 실행해.
환경: BASE_URL, REVISION, LABEL, OUTPUT_DIR, PLAYWRIGHT_MODULE,
CHROME_EXECUTABLE, CHROME_ARGS, SOFTWARE_RENDERER=0|1, FONT_MODE, FONT_ROOT,
HEADLESS=0, WIDTH, HEIGHT, DPR, TIMEOUT_MS, SCREENSHOTS=0.
공연장은 수동 low/관객 기본값으로 열어. 광장 렌더 품질은 앱 기본값이야.
주 렌더 루프와 오디오 시계를 바꾸지 않아. 모바일은 viewport/UA/touch 에뮬레이션이야.
FPS·장시간 음질·실기기 발열·단체석 발권·BFCache·저장소 차단·전체 키보드
포커스 순환은 이 검사 범위가 아니야. 미도달 검사는 NOT_RUN으로 남겨.
--help는 브라우저를 실행하지 않아.`);
  process.exit(0);
}
assert.ok(args.length <= 2, 'Expected [hall|sphere] [desktop|mobile]');
if (args[0]) assert.ok(['hall', 'sphere'].includes(args[0]), 'Unknown venue');
if (args[1]) assert.ok(['desktop', 'mobile'].includes(args[1]), 'Unknown device');
const navigation = process.env.NAVIGATION || 'ui';
assert.ok(['ui', 'placement'].includes(navigation), 'NAVIGATION must be ui or placement');
const cfg = config(process.env.LABEL || 'plaza');
const entry = new URL(cfg.baseURL);
entry.search = ''; entry.hash = '';
const fixtureSourceSha256 = sha256(await fs.readFile(new URL(import.meta.url)));
const helperSourceSha256 = sha256(await fs.readFile(new URL('./browser.mjs', import.meta.url)));
const plazaSources = ['index.html', 'css/style.css', 'js/plaza.js', 'js/tickets.js', 'js/joystick.js', 'js/scene/plazaWorld.js', 'js/ui.js'];
const backgroundIds = ['pzQuick', 'pzStub', 'pzAct', 'pzMe'];
const regressionNames = ['boothDialogAndTab', 'escapeFromName', 'ticketStubInput', 'ticketPersistence', 'returnToPlaza', 'noTicketGuard'];
const cases = (args[0] ? [args[0]] : ['hall', 'sphere']).flatMap(venue =>
  (args[1] ? [args[1]] : ['desktop', 'mobile']).map(device => ({ venue, device })));
await fs.mkdir(cfg.outputDir, { recursive: true });
const summaryFilename = `${cfg.label}-plaza-summary.json`;
// Reserve the summary too: a reused LABEL must not replace an earlier run's
// summary after the per-case exclusive file creation has rejected it.
await fs.writeFile(path.join(cfg.outputDir, summaryFilename), JSON.stringify({
  schema: 2, suite: 'plaza-ticket-ui', status: 'RUNNING', navigation, revision: cfg.revision,
  fixtureSourceSha256, helperSourceSha256, results: [],
}, null, 2) + '\n', { flag: 'wx' });

async function captureSources(page) {
  const hashes = await sourceHashes(page, cfg.baseURL);
  for (const file of plazaSources) {
    const response = await page.request.get(new URL(file, cfg.baseURL).href);
    assert.ok(response.ok(), `Missing source: ${file}`);
    const bytes = await response.body();
    hashes[file] = { sha256: sha256(bytes), bytes: bytes.length, httpStatus: response.status() };
  }
  for (const [file, source] of Object.entries(hashes)) assert.match(source.sha256 || '', /^[a-f0-9]{64}$/, `Missing source hash: ${file}`);
  return hashes;
}

async function runCase({ venue, device }) {
  const mobile = device === 'mobile';
  const size = viewport(device, mobile ? { width: 390, height: 844 } : { width: 960, height: 540 });
  const stem = `${cfg.label}-plaza-${venue}-${device}`;
  const filename = `${stem}.json`;
  const report = {
    schema: 2, suite: 'plaza-ticket-ui', venue, device, navigation, status: 'RUNNING',
    label: cfg.label, revision: cfg.revision, url: entry.href,
    fixtureSourceSha256, helperSourceSha256, viewport: [size.width, size.height], devicePixelRatio: size.dpr,
    startedAt: new Date().toISOString(), checks: {}, fixtures: [], screenshots: [], navigationAttempts: [],
    regressions: Object.fromEntries(regressionNames.map(name => [name, { status: 'NOT_RUN' }])),
    sourceConsistency: { status: 'NOT_RUN' }, functionalStatus: 'NOT_RUN',
    sourceEvidencePolicy: 'Read-only HTTP body hashes before and after the functional flow, including CSS/index/tickets/plazaWorld. Extra requests make this unsuitable for initial-load timing.',
    method: 'Real purchase/admission/return UI and native app render loop. Read-only scene projection locates canvas targets. No performance or physical-mobile claim.',
    unchecked: ['multiplayer ticket purchase (rooms/protocol are separate)', 'long-duration audio', 'physical mobile, Safari, thermal and power behavior',
      'BFCache/browser-back restoration (return uses the app plaza button)', 'blocked storage/offline/slow rooms',
      'full keyboard focus cycle, focus return and screen-reader accessibility', 'landscape/orientation and multiple simultaneous pointers'],
  };
  // Do not replace an earlier failure or a completed run by accident.
  await fs.writeFile(path.join(cfg.outputDir, filename), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  let session;
  const persist = () => save(cfg, filename, report);
  const log = stage => console.log(JSON.stringify({ venue, device, stage, navigation }));
  const verify = async (name, action) => {
    const record = report.regressions[name];
    record.status = 'RUNNING';
    await persist();
    try { await action(record); record.status = 'PASS'; }
    catch (error) { record.status = 'FAIL'; record.failure = error.message; throw error; }
    finally { await persist(); }
  };
  try {
    session = await openPage(cfg, device, size);
    const { page } = session;
    report.environment = session.environment;
    report.diagnostics = session.diagnostics;
    report.sourceHashes = await captureSources(page);
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.addInitScript(() => {
      localStorage.setItem('fp-settings', JSON.stringify({ quality: 'low', audience: true }));
      window.__plazaQAContextLosses = [];
      document.addEventListener('webglcontextlost', event => window.__plazaQAContextLosses.push(event.statusMessage || 'context lost'), true);
    });
    const activate = locator => mobile ? locator.tap() : locator.click();
    const screenshot = async name => {
      if (process.env.SCREENSHOTS === '0') return;
      // plazaWorld repaints text textures when fonts settle. Wait for the
      // app's native frames, without issuing an extra WebGL render ourselves.
      const readiness = await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { fonts: document.fonts.status, visibility: document.visibilityState, nativeFrameCallbacks: 2 };
      });
      const file = `${stem}-${name}.png`;
      await page.screenshot({ path: path.join(cfg.outputDir, file), fullPage: false });
      report.screenshots.push({ name, file, url: page.url(), readiness });
      await persist();
    };
    const readPlaza = () => page.evaluate(() => {
      const plaza = window.__plaza, gl = plaza.renderer.getContext();
      return {
        identity: JSON.parse(localStorage.getItem('fp-identity') || 'null'),
        ticket: JSON.parse(sessionStorage.getItem('fp-ticket') || 'null'),
        lastTicket: JSON.parse(localStorage.getItem('fp-last-ticket') || 'null'),
        position: plaza.player.pos.toArray(), camera: plaza.camera.position.toArray(),
        calls: plaza.renderer.info.render.calls, triangles: plaza.renderer.info.render.triangles,
        glError: gl.getError(), contextLost: gl.isContextLost(),
        touch: { maxTouchPoints: navigator.maxTouchPoints, fine: matchMedia('(pointer: fine)').matches },
        visibility: document.visibilityState,
      };
    });
    const readyPlaza = async () => {
      await page.waitForFunction(() => !!window.__plaza && window.__plaza.renderer.info.render.calls > 0 && !document.getElementById('plaza').hidden,
        null, { polling: 100 });
      await page.locator('#pzLoading.done').waitFor({ state: 'attached' });
      assert.match(await page.title(), /숲속 공연 광장/);
      assert.ok(await page.locator('#plaza h1').isVisible(), 'The plaza heading is visible');
    };
    const readBooth = () => page.evaluate(ids => {
      const booth = document.getElementById('booth'), active = document.activeElement;
      return {
        hidden: booth.hidden, role: booth.getAttribute('role'), ariaModal: booth.getAttribute('aria-modal'),
        focus: { id: active?.id || null, tag: active?.tagName || null, inBooth: booth.contains(active) },
        background: ids.map(id => {
          const el = document.getElementById(id);
          return { id, exists: !!el, inert: !!el?.inert, hasInert: !!el?.hasAttribute('inert') };
        }),
      };
    }, backgroundIds);
    const assertBackground = (state, inert) => {
      for (const item of state.background) {
        assert.ok(item.exists, `The background element ${item.id} exists`);
        assert.equal(item.inert, inert, `${item.id}.inert is ${inert}`);
        assert.equal(item.hasInert, inert, `${item.id} inert attribute is ${inert}`);
      }
    };
    const chooseSolo = async () => {
      await page.locator(`.venue-card.${venue} button`).waitFor({ state: 'visible' });
      await activate(page.locator(`.venue-card.${venue} button`));
      await activate(page.locator('.mode-card[data-mode="solo"]'));
      await activate(page.locator('#toPay'));
      await page.locator('#bkName').waitFor({ state: 'visible' });
    };
    // Reading the built geometry locates an actual raycastable mesh. This
    // never invokes openBooth(), enterGate(), issueTicket(), or game controls.
    const projectTarget = async key => page.evaluate(async key => {
      const THREE = await import('three');
      const p = window.__plaza;
      const diagnostics = {
        player: p.player.pos.toArray(), camera: p.camera.position.toArray(),
        yaw: p.cam.yaw, pitch: p.cam.pitch, samples: 0,
        rejected: { clipped: 0, domCovered: 0, noPickableHit: 0, otherPickable: 0 },
      };
      const candidates = [];
      const vertex = new THREE.Vector3();
      const meshes = p.world.pickables[key] || [];
      for (let meshIndex = 0; meshIndex < meshes.length; meshIndex++) {
        const mesh = meshes[meshIndex];
        const position = mesh.geometry.getAttribute('position');
        const index = mesh.geometry.index;
        const triangles = Math.floor((index ? index.count : position.count) / 3);
        // An arch's bounding-box centre is empty space. Sample real triangle
        // interiors instead; no geometry, camera or game state is changed.
        const stride = Math.max(1, Math.ceil(triangles / 256));
        for (let triangle = 0; triangle < triangles; triangle += stride) {
          const world = new THREE.Vector3();
          for (let corner = 0; corner < 3; corner++) {
            const offset = triangle * 3 + corner;
            world.add(vertex.fromBufferAttribute(position, index ? index.getX(offset) : offset));
          }
          world.multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
          const ndc = world.clone().project(p.camera);
          const x = (ndc.x + 1) * innerWidth / 2, y = (1 - ndc.y) * innerHeight / 2;
          diagnostics.samples++;
          // Actual DOM hit-testing decides whether an overlay blocks the tap.
          // Do not discard a visible sign merely for being near the top edge.
          if (ndc.z < -1 || ndc.z > 1 || x < 8 || y < 8 || x >= innerWidth - 8 || y >= innerHeight - 8) {
            diagnostics.rejected.clipped++;
            continue;
          }
          candidates.push({ x, y, ndc, world, meshIndex, triangle, score: ndc.x ** 2 + ndc.y ** 2 });
        }
      }
      candidates.sort((a, b) => a.score - b.score);
      const ray = new THREE.Raycaster();
      for (const candidate of candidates) {
        const { x, y, ndc } = candidate;
        if (document.elementFromPoint(x, y) !== p.renderer.domElement) {
          diagnostics.rejected.domCovered++;
          continue;
        }
        ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), p.camera);
        let nearest = null;
        // Match plaza.js onTap(): the closest hit across all pickable groups.
        for (const [name, list] of Object.entries(p.world.pickables)) {
          const hit = ray.intersectObjects(list, false)[0];
          if (hit && (!nearest || hit.distance < nearest.distance)) nearest = { key: name, distance: hit.distance };
        }
        if (nearest?.key !== key) {
          diagnostics.rejected[nearest ? 'otherPickable' : 'noPickableHit']++;
          continue;
        }
        return { hit: { x, y, key, world: candidate.world.toArray(), meshIndex: candidate.meshIndex,
          triangle: candidate.triangle, targetMethod: 'triangle-centroid-and-native-pickable-raycast' }, diagnostics };
      }
      return { hit: null, diagnostics };
    }, key);
    const dragToward = async key => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const projection = await projectTarget(key);
        const record = { key, attempt, ...projection };
        report.navigationAttempts.push(record);
        if (projection.hit) return projection.hit;
        const delta = await page.evaluate(key => {
          const p = window.__plaza;
          const target = key === 'booth' ? p.PLAZA.booth : p.PLAZA.gates[key.split(':')[1]];
          const desired = Math.atan2(-(target.x - p.player.pos.x), -(target.z - p.player.pos.z));
          return Math.atan2(Math.sin(desired - p.cam.yaw), Math.cos(desired - p.cam.yaw));
        }, key);
        const box = await page.locator('#stage canvas').boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height * 0.55;
        const dx = Math.max(-box.width * 0.28, Math.min(box.width * 0.28, -delta / 0.006));
        record.steering = { deltaYaw: delta, dx, x, y };
        // plaza.js interprets a gesture shorter than 8 px as a tap. Avoid
        // accidental click-to-walk while waiting for camera interpolation.
        if (Math.abs(dx) >= 8) {
          if (mobile) {
            await session.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
            await session.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y }] });
            await session.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } else {
            await page.mouse.move(x, y); await page.mouse.down();
            await page.mouse.move(x + dx, y, { steps: 8 }); await page.mouse.up();
          }
        }
        // Native simulation/camera interpolation keeps running in this wait.
        await page.waitForTimeout(250);
      }
      throw new Error(`No unobscured canvas target for ${key}; use NAVIGATION=placement only as a separately labelled diagnostic`);
    };
    const tapCanvasTarget = async key => {
      const hit = await dragToward(key);
      if (mobile) await page.touchscreen.tap(hit.x, hit.y); else await page.mouse.click(hit.x, hit.y);
      return hit;
    };

    await page.goto(entry.href, { waitUntil: 'domcontentloaded' });
    await readyPlaza();
    report.checks.firstPage = await readPlaza();
    assert.ok(report.checks.firstPage.identity?.avatar, 'Random first-visit animal is persisted');
    assert.equal(report.checks.firstPage.ticket, null, 'Fresh context starts without a ticket');
    assert.equal(report.checks.firstPage.glError, 0); assert.equal(report.checks.firstPage.contextLost, false);
    assert.equal(requests.some(url => new URL(url).pathname.endsWith('/js/main.js')), false, 'The plaza did not load the concert runtime');
    if (mobile) assert.ok(await page.locator('#pzJoy').isVisible(), 'Touch joystick is available');
    await screenshot('first-page');
    log('plaza-ready');

    if (navigation === 'placement') {
      report.fixtures.push({ kind: 'position', location: 'booth', reason: 'Explicitly requested short functional fixture; walking/collision not validated' });
      await page.evaluate(() => {
        const p = window.__plaza;
        p.player.pos.set(p.PLAZA.window.x, 0, p.PLAZA.window.z + 1.2);
        p.player.vel.set(0, 0, 0); p.step(0);
      });
      await activate(page.locator('#pzAct'));
    } else {
      const before = await readPlaza();
      try {
        if (mobile) {
          const box = await page.locator('#pzJoy').boundingBox();
          assert.ok(box, 'The plaza thumb stick has a touch target');
          const x = box.x + box.width / 2, y = box.y + box.height / 2;
          await session.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          await session.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 36 }] });
        } else await page.keyboard.down('w');
        await page.locator('#pzAct').waitFor({ state: 'visible', timeout: cfg.timeoutMs });
      } finally {
        if (mobile) await session.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await page.keyboard.up('w');
      }
      const after = await readPlaza();
      assert.ok(before.position[2] - after.position[2] > 5, 'Actual input moved the player from spawn to the booth');
      report.checks.boothMovement = { input: mobile ? 'CDP thumb-stick touch' : 'W keyboard', before, after };
      await activate(page.locator('#pzAct'));
    }
    await page.locator('#booth').waitFor({ state: 'visible' });
    report.checks.atBooth = await readPlaza();
    report.checks.atBooth.window = await page.evaluate(() => ({ ...window.__plaza.PLAZA.window }));
    assert.ok(Math.hypot(report.checks.atBooth.position[0] - report.checks.atBooth.window.x,
      report.checks.atBooth.position[2] - report.checks.atBooth.window.z) < 2.1, 'Player arrived at the actual booth window');
    await verify('boothDialogAndTab', async record => {
      await page.waitForFunction(() => document.getElementById('booth').contains(document.activeElement), null, { polling: 100 });
      record.opened = await readBooth();
      assert.equal(record.opened.role, 'dialog');
      assert.equal(record.opened.ariaModal, 'true');
      assertBackground(record.opened, true);
      await page.keyboard.press('Tab');
      record.afterTab = await readBooth();
      assert.equal(record.afterTab.focus.inBooth, true, 'A real Tab from the initial dialog focus stays inside the booth');
      record.scope = 'One real Tab plus background inert state; not a full keyboard focus-cycle or screen-reader audit';
    });
    await chooseSolo();
    const chosenName = mobile ? 'QA 모바일 관객' : 'QA 데스크톱 관객';
    await page.locator('#bkName').fill(chosenName);
    await verify('escapeFromName', async record => {
      record.before = await readBooth();
      assert.equal(record.before.focus.id, 'bkName', 'The real name input is focused before Escape');
      await page.keyboard.press('Escape');
      await page.locator('#booth').waitFor({ state: 'hidden' });
      record.afterEscape = await readBooth();
      record.plazaAfterEscape = await readPlaza();
      assertBackground(record.afterEscape, false);
      assert.equal(record.plazaAfterEscape.ticket, null, 'Closing before payment does not issue a ticket');
      await page.locator('#pzAct').waitFor({ state: 'visible' });
      await activate(page.locator('#pzAct'));
      await page.locator('#booth').waitFor({ state: 'visible' });
      record.reopened = await readBooth();
      assertBackground(record.reopened, true);
      record.input = 'Real Escape while bkName is focused, followed by the real plaza action button';
    });
    await chooseSolo();
    await page.locator('#bkName').fill(chosenName);
    await activate(page.locator('#payBtn'));
    await page.locator('#boothTicket .ticket').waitFor({ state: 'visible' });
    report.checks.issued = await readPlaza();
    const ticket = report.checks.issued.ticket;
    assert.equal(ticket?.venue, venue); assert.equal(ticket?.mode, 'solo');
    assert.equal(ticket?.name, chosenName);
    assert.equal(ticket?.avatar, report.checks.firstPage.identity.avatar, 'Name editing preserves the animal');
    assert.equal(await page.locator('#boothTicket .t-title').textContent(), venue === 'hall' ? '숲속 필하모닉 홀' : '스피어');
    await screenshot('issued-ticket');
    await activate(page.locator('#boothDone'));
    await verify('ticketStubInput', async record => {
      await page.locator('#booth').waitFor({ state: 'hidden' });
      record.closed = await readBooth();
      assertBackground(record.closed, false);
      assert.ok(await page.locator('#pzStub').isVisible(), 'Issued ticket stub is carried in the plaza');
      record.targetBox = await page.locator('#pzStub').boundingBox();
      record.input = mobile ? 'Playwright native touch tap on the visible ticket stub' : 'Playwright mouse click on the visible ticket stub';
      await activate(page.locator('#pzStub'));
      await page.waitForFunction(no => {
        const toast = document.getElementById('pzToast');
        return !toast.hidden && toast.textContent.includes(no);
      }, ticket.no, { polling: 100 });
      record.toastText = await page.locator('#pzToast').innerText();
      record.plaza = await readPlaza();
      assert.deepEqual(record.plaza.ticket, ticket, 'Viewing the ticket stub does not replace the ticket');
    });
    log('ticket-issued');

    if (navigation === 'placement') {
      report.fixtures.push({ kind: 'position', location: `gate:${venue}`, reason: 'Explicit gate-boundary fixture; physical route not validated' });
      await page.evaluate(venue => {
        const p = window.__plaza, gate = p.PLAZA.gates[venue];
        p.player.pos.set(gate.x * 0.9, 0, gate.z * 0.9);
        p.player.vel.set(0, 0, 0); p.step(0);
      }, venue);
    } else report.checks.gateCanvasInput = await tapCanvasTarget(`gate:${venue}`);
    await page.waitForURL(url => url.searchParams.get('venue') === venue, { timeout: cfg.timeoutMs });
    await page.locator('#ticketCheck').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !!window.__fp && !document.getElementById('tcEnter').disabled,
      null, { polling: 100 });
    report.checks.admission = {
      url: page.url(), title: await page.title(), ticketText: await page.locator('#tcTicket').innerText(),
      stored: await page.evaluate(() => ({
        ticket: JSON.parse(sessionStorage.getItem('fp-ticket') || 'null'),
        identity: JSON.parse(localStorage.getItem('fp-identity') || 'null'),
        lastTicket: JSON.parse(localStorage.getItem('fp-last-ticket') || 'null'),
      })),
    };
    await verify('ticketPersistence', async record => {
      record.issued = ticket;
      record.admission = report.checks.admission.stored;
      record.scope = 'Real full-document plaza-to-venue navigation in the same tab; not storage-denied or browser-restart persistence';
      assert.deepEqual(record.admission.ticket, ticket, 'The same issued ticket survives the real gate navigation');
      assert.equal(record.admission.identity?.name, chosenName);
      assert.equal(record.admission.identity?.avatar, ticket.avatar);
      assert.equal(record.admission.lastTicket?.venue, venue);
      assert.equal(record.admission.lastTicket?.mode, 'solo');
    });
    assert.ok(report.checks.admission.ticketText.includes(chosenName));
    assert.equal(await page.locator('#lobby').isVisible(), false, 'A held ticket opens the ticket check');
    await screenshot('ticket-check');
    await activate(page.locator('#tcEnter'));
    await page.waitForFunction(() => !document.getElementById('splash') && window.__fp?.director.active && window.__fp.renderer.info.render.calls > 0,
      null, { polling: 100 });
    report.checks.concert = await page.evaluate(() => {
      const fp = window.__fp, gl = fp.renderer.getContext();
      return { url: location.href, directorMode: fp.director.mode, audioState: fp.engine.ctx?.state,
        ticket: JSON.parse(sessionStorage.getItem('fp-ticket') || 'null'),
        identity: JSON.parse(localStorage.getItem('fp-identity') || 'null'),
        calls: fp.renderer.info.render.calls, triangles: fp.renderer.info.render.triangles,
        hasDome: !!fp.hall.dome, glError: gl.getError(), contextLost: gl.isContextLost(),
        contextLosses: window.__plazaQAContextLosses };
    });
    assert.equal(report.checks.concert.directorMode, 'walk');
    assert.equal(report.checks.concert.audioState, 'running');
    assert.equal(report.checks.concert.hasDome, venue === 'sphere');
    assert.equal(report.checks.concert.identity.avatar, ticket.avatar);
    assert.deepEqual(report.checks.concert.ticket, ticket, 'Solo admission preserves the stored ticket');
    assert.equal(report.checks.concert.glError, 0); assert.equal(report.checks.concert.contextLost, false);
    assert.deepEqual(report.checks.concert.contextLosses, []);
    await screenshot('concert-entered');
    log('concert-entered');

    await verify('returnToPlaza', async record => {
      record.input = 'Actual concert program tab and plaza button; this is not browser Back/BFCache';
      await activate(page.locator('.tab-btn[data-panel="program"]'));
      await activate(page.locator('#plazaBtn'));
      await page.waitForURL(url => !url.searchParams.has('venue') && !url.searchParams.has('room'));
      await readyPlaza();
      report.checks.returned = await readPlaza();
      record.state = report.checks.returned;
      assert.equal(record.state.ticket, null, 'Returning to the plaza relinquishes the ticket');
      assert.equal(record.state.identity.avatar, ticket.avatar);
      assert.equal(record.state.identity.name, chosenName);
      assert.equal(record.state.glError, 0); assert.equal(record.state.contextLost, false);
      assert.equal(await page.locator('#pzStub').isVisible(), false);
      assert.equal(record.state.lastTicket?.venue, venue);
      assert.equal(record.state.lastTicket?.mode, 'solo');
      record.quickVisible = await page.locator('#pzQuick').isVisible();
      record.quickText = await page.locator('#pzQuickWhat').innerText();
      assert.equal(record.quickVisible, true, 'The remembered ticket shortcut is offered after returning');
      assert.ok(record.quickText.includes(venue === 'hall' ? '숲속 필하모닉 홀' : '스피어'));
    });
    await screenshot('returned-to-plaza');
    const withoutTicket = new URL(entry.href);
    withoutTicket.searchParams.set('venue', venue);
    await verify('noTicketGuard', async record => {
      record.requested = withoutTicket.href;
      await page.goto(withoutTicket.href, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(url => !url.searchParams.has('venue'));
      await readyPlaza();
      report.checks.ticketGuard = { requested: withoutTicket.href, returned: page.url(), state: await readPlaza() };
      record.navigation = report.checks.ticketGuard;
      assert.equal(record.navigation.state.ticket, null);
      assert.equal(record.navigation.state.identity.avatar, ticket.avatar);
    });
    assert.ok(Object.values(report.regressions).every(check => check.status === 'PASS'), 'All declared core regressions were actually reached and passed');
    report.functionalStatus = diagnosticsFailed(session.diagnostics) ? 'FAIL' : 'PASS';
    if (report.functionalStatus === 'FAIL') report.status = 'FAIL';
    // Overall PASS is only assigned after the final source-consistency check.
    await persist();
  } catch (error) {
    report.status = 'FAIL'; report.functionalStatus = 'FAIL'; report.failure = { message: error.message, stack: error.stack };
    if (session) {
      try {
        report.failureUrl = session.page.url();
        const file = `${stem}-failure.png`;
        await session.page.screenshot({ path: path.join(cfg.outputDir, file), timeout: 5000 });
        report.screenshots.push({ name: 'failure', file, url: report.failureUrl });
      } catch (secondary) { report.failureScreenshotError = secondary.message; }
    }
  } finally {
    if (session && report.sourceHashes) {
      try {
        report.sourceHashesAfter = await captureSources(session.page);
        const changed = [...new Set([...Object.keys(report.sourceHashes), ...Object.keys(report.sourceHashesAfter)])]
          .filter(file => report.sourceHashes[file]?.sha256 !== report.sourceHashesAfter[file]?.sha256);
        report.sourceConsistency = { status: changed.length ? 'FAIL' : 'PASS', changed };
        if (changed.length) {
          report.status = 'FAIL';
          report.sourceEvidenceFailure = `Served source changed during this case: ${changed.join(', ')}`;
        }
      } catch (error) {
        report.status = 'FAIL';
        report.sourceConsistency = { status: 'FAIL', error: error.message };
        report.sourceEvidenceFailure = error.message;
      }
    }
    if (report.status !== 'FAIL') report.status = report.functionalStatus === 'PASS' && report.sourceConsistency.status === 'PASS' ? 'PASS' : 'FAIL';
    report.finishedAt = new Date().toISOString();
    await persist();
    if (session) await session.browser.close();
  }
  log(report.status);
  return { venue, device, status: report.status, file: filename, failure: report.failure?.message || report.sourceEvidenceFailure };
}

const results = [];
for (const entry of cases) {
  try { results.push(await runCase(entry)); }
  catch (error) { results.push({ ...entry, status: 'FAIL', failure: error.message }); }
}
await save(cfg, summaryFilename, { schema: 2, suite: 'plaza-ticket-ui', status: results.every(result => result.status === 'PASS') ? 'PASS' : 'FAIL',
  navigation, revision: cfg.revision, fixtureSourceSha256, helperSourceSha256, results });
console.log(JSON.stringify({ results }));
if (results.some(result => result.status !== 'PASS')) process.exitCode = 1;
