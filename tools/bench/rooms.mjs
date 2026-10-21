// Execute serially with other GPU measurements. Two real pages share one
// explicit browser context; room actions use the real UI and localhost only.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config, launchBrowser, configureFonts, viewport } from './browser.mjs';
import { loopbackURL } from './loading-proxy.mjs';

const [label = 'current', venue = 'hall', mode = 'cross'] = process.argv.slice(2);
assert.ok(['hall', 'sphere'].includes(venue));
assert.ok(['core', 'cross'].includes(mode));
const cfg = config(label);
const origin = loopbackURL(cfg.baseURL).origin;
await fs.mkdir(cfg.outputDir, { recursive: true });
const output = path.join(cfg.outputDir, `rooms-${label}-${venue}-${mode}.json`);
const browser = await launchBrowser(cfg);
const size = viewport('desktop', { width: 960, height: 640 });
const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr });
const pages = [];
const errors = [];
const warnings = [];
const result = {
  measuredAt: new Date().toISOString(), origin, label, revision: cfg.revision, browserVersion: browser.version(), venue, mode, fontMode: cfg.fontMode,
  method: 'Actual local browser UI in two tabs of one explicit BrowserContext. Private test room only. Native main frame callback is captured and invoked solely for two final canvas checks; UI, WebSocket and Web Audio timers run normally. Low preset, crowd/effects/broadcast off and volume zero isolate the room interface. Before clicking the real start button, the host stage is snapped to the current score roster to skip the entrance/change animation; older builds without snapRoster retain their original all-player snap. The guest uses the original room playback synchronization, and roster-aware builds verify that both actual stage rosters agree. This is functional room/UI QA, not visual-quality, FPS, sound-quality or device timing measurement. cross mode additionally uses the real venue selector, an invitation to the wrong venue, automatic venue redirect and rejoining through the invitation button.',
  checks: {}, errors, warnings, passed: false,
};
const status = stage => console.log(JSON.stringify({ venue, mode, stage }));
async function makePage(label) {
  const page = await context.newPage();
  page.setDefaultTimeout(cfg.timeoutMs);
  page.on('pageerror', error => errors.push({ label, message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ label, message: message.text() });
    else if (message.type() === 'warning') warnings.push({ label, message: message.text() });
  });
  await configureFonts(page, cfg);
  await page.route(`${origin}/favicon.ico`, route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    let seed = 417;
    Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    localStorage.setItem('fp-settings', JSON.stringify({ quality: 'low', volume: 0, audience: false, fx: false, lasers: false, screen: false, notes: false }));
    const native = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = fn => fn.name === 'frame' ? (window.__benchFrame = fn, 0) : native(fn);
  });
  pages.push({ page, label });
  return page;
}
async function ready(page) {
  await page.waitForFunction(() => !!window.__fp && !document.getElementById('enterBtn').disabled, null, { timeout: cfg.timeoutMs, polling: 100 });
  await page.waitForFunction(() => !document.getElementById('lbOnline').hidden, null, { polling: 100 });
}
async function entered(page) {
  await page.waitForFunction(() => !document.getElementById('splash') && !!window.__fp.room?.room, null, { polling: 100 });
}
async function controls(page) {
  return page.evaluate(() => ({
    id: window.__fp.room.id, host: window.__fp.room.host, isHost: window.__fp.room.isHost,
    startDisabled: document.getElementById('startBtn').disabled,
    playDisabled: document.getElementById('btnPlay').disabled,
    nextDisabled: document.getElementById('btnNext').disabled,
    seekDisabled: document.getElementById('seek').getAttribute('aria-disabled'),
    roomTitle: document.getElementById('roomChipTitle').textContent,
    count: document.getElementById('roomChipCount').textContent,
  }));
}
async function frame(page) {
  await page.bringToFront();
  await page.waitForFunction(() => !document.hidden, null, { polling: 100 });
  return page.evaluate(() => {
    window.__benchFrame();
    const renderer = window.__fp.renderer;
    const gl = renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, glError: gl.getError(), capturedFrame: typeof window.__benchFrame === 'function' };
  });
}

try {
  const host = await makePage('host');
  const guest = await makePage('guest');
  await host.goto(`${origin}/?venue=${venue}`, { waitUntil: 'domcontentloaded' });
  await ready(host);
  status('host-ready');
  await host.locator('#lbName').fill('QA HOST');
  await host.locator('#lbTitle').fill('LOCAL PRIVATE UI QA');
  await host.locator('#lbCap').fill('3');
  await host.locator('#lbVis button[data-pub="0"]').click();
  assert.equal(await host.locator('#lbVis button[data-pub="0"]').getAttribute('aria-pressed'), 'true');
  await host.locator('#lbCreate').click();
  await entered(host);
  const room = await host.evaluate(() => ({ ...window.__fp.room.room, seed: window.__fp.room.seed }));
  assert.equal(room.venue, venue);
  assert.equal(room.pub, false);
  assert.equal((await host.evaluate(async () => (await fetch('api/rooms')).json())).some(entry => entry.code === room.code), false);
  result.checks.privateRoom = room;
  status('private-room-created');

  await guest.goto(`${origin}/?venue=${venue}&room=${room.code}`, { waitUntil: 'domcontentloaded' });
  await ready(guest);
  if (mode === 'cross') {
    const other = venue === 'hall' ? 'sphere' : 'hall';
    await Promise.all([
      guest.waitForURL(url => url.searchParams.get('venue') === other && url.searchParams.get('room') === room.code),
      guest.locator(`#lbVenue button[data-venue="${other}"]`).click(),
    ]);
    await ready(guest);
    assert.equal(await guest.locator(`#lbVenue button[data-venue="${other}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await guest.locator('#lbInviteCode').textContent(), room.code);
    await guest.locator('#lbName').fill('QA GUEST');
    await Promise.all([
      guest.waitForURL(url => url.searchParams.get('venue') === venue && url.searchParams.get('room') === room.code),
      guest.locator('#lbInviteGo').click(),
    ]);
    await ready(guest);
    assert.equal(await guest.locator(`#lbVenue button[data-venue="${venue}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await guest.locator('#lbInviteCode').textContent(), room.code);
    result.checks.venueSelectorAndRedirect = { selectedOther: other, returnedVenue: venue, invitationPreserved: true, finalUrl: guest.url() };
    status('venue-selector-and-invite-redirect');
  }
  await guest.locator('#lbName').fill('QA GUEST');
  await guest.locator('#lbInviteGo').click();
  await entered(guest);
  await host.waitForFunction(() => window.__fp.room.members.size === 2, null, { polling: 100 });
  assert.equal(await guest.evaluate(() => window.__fp.room.seed), room.seed);
  const hostBefore = await controls(host);
  const guestBefore = await controls(guest);
  assert.equal(hostBefore.isHost, true);
  assert.equal(hostBefore.playDisabled, false);
  assert.equal(hostBefore.startDisabled, false);
  assert.equal(guestBefore.isHost, false);
  assert.equal(guestBefore.playDisabled, true);
  assert.equal(guestBefore.startDisabled, true);
  assert.equal(guestBefore.nextDisabled, true);
  assert.equal(guestBefore.seekDisabled, 'true');
  assert.equal(hostBefore.count, '2/3');
  assert.equal(guestBefore.count, '2/3');
  result.checks.joinAndControls = { host: hostBefore, guest: guestBefore };
  status('guest-joined-controls-locked');

  // Hold only the host's entrance/change animation. Snapping all players on
  // roster-aware builds would leave unwanted exits waiting on the held rAF.
  // Do not snap the guest: its real applyPlayback must follow the host roster.
  result.checks.stageFixture = await host.evaluate(async () => {
    const { stage, perf } = window.__fp;
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
    if (rosterAware && JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Host score roster fixture did not match the stage');
    const plan = rosterAware ? stage.plan(keys) : null;
    if (plan && (plan.exits.length || plan.enters.length)) throw new Error('Host score roster fixture still requires a walking transition');
    return { mode: rosterAware ? 'current-piece-roster' : 'legacy-all-players', piece: perf.piece.id, expected, actual };
  });
  await host.locator('#startBtn').click();
  await host.waitForFunction(() => window.__fp.perf.playing, null, { polling: 100, timeout: 30000 });
  await guest.waitForFunction(() => window.__fp.perf.playing, null, { polling: 100, timeout: 30000 });
  const hostPiece = await host.evaluate(() => window.__fp.perf.piece.id);
  assert.equal(await guest.evaluate(() => window.__fp.perf.piece.id), hostPiece);
  if (result.checks.stageFixture.mode === 'current-piece-roster') {
    const rosters = {};
    for (const { page, label } of pages) rosters[label] = await page.evaluate(() => [...window.__fp.stage.onstageKeys()].sort());
    assert.deepEqual(rosters.host, result.checks.stageFixture.expected, 'Host roster matches its current score');
    assert.deepEqual(rosters.guest, rosters.host, 'Guest playback synchronizes the actual host roster');
    result.checks.playbackRosters = rosters;
  }
  await host.locator('#btnPlay').click();
  await guest.waitForFunction(() => !window.__fp.perf.playing, null, { polling: 100 });
  assert.equal(await host.evaluate(() => window.__fp.perf.playing), false);
  await host.locator('#btnPlay').click();
  await guest.waitForFunction(() => window.__fp.perf.playing, null, { polling: 100 });
  result.checks.startPauseResume = { piece: hostPiece, hostPhase: await host.evaluate(() => window.__fp.phase), guestPhase: await guest.evaluate(() => window.__fp.phase), hostAudioState: await host.evaluate(() => window.__fp.engine.ctx.state), guestAudioState: await guest.evaluate(() => window.__fp.engine.ctx.state) };
  status('real-start-pause-resume');

  await guest.bringToFront();
  await guest.evaluate(() => document.activeElement?.blur());
  await guest.keyboard.press('Enter');
  await guest.locator('#chatInput').waitFor({ state: 'visible' });
  const message = '로컬 UI 검사: 음악과 채팅 유지';
  await guest.locator('#chatInput').fill(message);
  await guest.locator('#chatInput').press('Enter');
  await host.waitForFunction(message => document.getElementById('chatLog').textContent.includes(message), message, { polling: 100 });
  await guest.waitForFunction(message => document.getElementById('chatLog').textContent.includes(message), message, { polling: 100 });
  result.checks.chat = { sentThroughForm: true, hostReceived: true, guestEchoed: true };
  status('chat-ui-delivered');

  await host.locator('#roomChip').click();
  await host.locator('#roomMembers li').filter({ hasText: 'QA GUEST' }).getByRole('button', { name: '방장 넘기기', exact: true }).click();
  await guest.waitForFunction(() => window.__fp.room.isHost && !document.getElementById('btnPlay').disabled, null, { polling: 100 });
  await host.waitForFunction(() => !window.__fp.room.isHost && document.getElementById('btnPlay').disabled, null, { polling: 100 });
  result.checks.handoff = { formerHost: await controls(host), newHost: await controls(guest) };
  assert.equal(result.checks.handoff.formerHost.seekDisabled, 'true');
  assert.equal(result.checks.handoff.newHost.seekDisabled, 'false');
  assert.equal(result.checks.handoff.newHost.nextDisabled, false);
  await guest.locator('#btnPlay').click();
  await host.waitForFunction(() => !window.__fp.perf.playing, null, { polling: 100 });
  result.checks.newHostPause = true;
  status('handoff-ui-updated');

  for (const { page, label } of pages) {
    result.checks[`${label}Frame`] = await frame(page);
    assert.equal(result.checks[`${label}Frame`].glError, 0);
    const screenshot = path.join(cfg.outputDir, `rooms-${cfg.label}-${venue}-${mode}-${label}.png`);
    if (cfg.screenshots) { await page.screenshot({ path: screenshot }); result.checks[`${label}Screenshot`] = screenshot; }
  }
  assert.deepEqual(errors, []);
  result.passed = true;
} catch (error) {
  result.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
  if (cfg.screenshots) for (const { page, label } of pages) await page.screenshot({ path: path.join(cfg.outputDir, `rooms-${cfg.label}-${venue}-${mode}-${label}-failure.png`) }).catch(() => {});
} finally {
  // Only the two pages created above own these connections. Do not touch any
  // existing server room or other user's session.
  for (const { page } of pages) await page.evaluate(() => window.__fp?.room?.leave()).catch(() => {});
  await browser.close();
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, passed: result.passed, checks: result.checks, error: result.error, errors, warnings }, null, 2));
}
