// What the commit history promises, checked end to end in a real browser:
// every piece in every venue's programme sounds (offline render of the real
// engine), the live sound is heard and follows mute, applause and the foyer
// wall, each venue is drawn (not a black or flat frame), and the visitor's
// features work - the square's booth and gate, sitting, a musician in focus
// with solo listening, the recital's stage seats, the Bremen miniature, the
// leaf programme, the room of quiet contemplation, chat in a room, and every
// display switch.
// Complements verify:app (the evening's flow) and the QA scripts beside it.
//   APP_PORT=8096 CDP_PORT=9225 QA_OUT=work/features npm run verify:features
//   PARTS=audio,venues,square,sayu,room ... a part of it
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { p, outputDir } from './quality-optimization-common.mjs';
import { motionSource } from './motion-source.mjs';

const base = `http://127.0.0.1:${process.env.APP_PORT || 8096}`;
const parts = (process.env.PARTS || 'audio,venues,square,sayu,room').split(',');
const browser = await p.connect({ browserURL: `http://127.0.0.1:${process.env.CDP_PORT || 9225}`, defaultViewport: null });
const report = { source: motionSource(), at: new Date().toISOString(), parts, checks: [], errors: [], status: 'fail',
  limitations: ['Desktop Chrome only.', 'Offline renders are excerpts, not whole pieces.', 'Loudness thresholds show sound is there, not that it is beautiful; listen to the WAVs and look at the PNGs.'] };
const contexts = [];
const check = (name, data) => { report.checks.push({ name, ...data }); console.log(name, JSON.stringify(data)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(label) {
  const context = await browser.createBrowserContext();
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(`${label}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${label}: ${m.text()}`); });
  await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
  return page;
}
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, { timeout, polling: 100 }, arg);
async function venuePage(venue, label = venue) {
  const page = await newPage(label);
  await page.goto(`${base}/?venue=${venue}&lobby`, { waitUntil: 'domcontentloaded' });
  await until(page, () => window.__fp && !document.querySelector('#enterBtn').disabled, null, 120000);
  await page.evaluate(() => {
    __fp.ui.onSetting('gap', 2); __fp.ui.onSetting('interval', 0);
    // the level heard, measured on the engine's own output tap
    window.__level = async (ms = 1500) => {
      const a = __fp.engine.analyser, buf = new Float32Array(a.fftSize);
      let sum = 0, n = 0, peak = 0;
      for (const end = performance.now() + ms; performance.now() < end;) {
        a.getFloatTimeDomainData(buf);
        for (const v of buf) { sum += v * v; n++; peak = Math.max(peak, Math.abs(v)); }
        await new Promise((r) => setTimeout(r, 50));
      }
      return { rms: +Math.sqrt(sum / n).toFixed(5), peak: +peak.toFixed(4) };
    };
    // what the visitor's camera sees, drawn once more off screen and measured
    window.__frame = async () => {
      const THREE = await import('three');
      const r = __fp.renderer, W = 160, H = 110, rt = new THREE.WebGLRenderTarget(W, H);
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      r.setRenderTarget(rt); r.render(__fp.scene, __fp.camera); r.setRenderTarget(null);
      const px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, px); rt.dispose();
      let sum = 0, sq = 0; const n = W * H;
      for (let i = 0; i < px.length; i += 4) { const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; sum += l; sq += l * l; }
      const mean = sum / n;
      return { mean: +mean.toFixed(1), std: +Math.sqrt(Math.max(0, sq / n - mean * mean)).toFixed(1), calls: __fp.stats.calls };
    };
  });
  return page;
}
const assertFrame = (name, f) => assert.ok(f.mean > 8 && f.std > 6, `${name}: a black or flat frame ${JSON.stringify(f)}`);

// ---------------------------------------------------------------- audio
async function audio() {
  const page = await newPage('audio');
  await page.goto(`${base}/music/index.json`); // (a same-origin page with nothing of the app in it)
  const bank = await page.evaluate(fs.readFileSync('tools/qa/render-repertoire.js', 'utf8'));
  assert.equal(bank.failures.length, 0, 'sample decode failures');
  const { setlists, index } = await page.evaluate(async () => {
    const { SETLISTS } = await import('/js/programs.js');
    return { setlists: SETLISTS, index: await (await fetch('/music/index.json')).json() };
  });
  const meta = new Map(index.map((m) => [m.id, m]));
  const results = [];
  for (const [venue, ids] of Object.entries(setlists)) {
    for (const id of ids) {
      assert.ok(meta.has(id), `${venue}: ${id} is in the programme but not in music/index.json`);
      const start = Math.min(20, meta.get(id).duration * 0.25);
      const r = await page.evaluate(({ id, start, venue }) => renderRepertoireExcerpt(id, start, 6, venue), { id, start, venue });
      await page.evaluate((id) => delete repertoireQA.buffers[id], id);
      results.push({ venue, id, peak: +r.peak.toFixed(4), rms: +r.rms.toFixed(5), notes: r.notes, clipped: r.clipped, nonfinite: r.nonfinite, error: r.error });
      assert.ok(r.notes > 0 && r.peak > 0.001, `${venue}/${id}: silence`);
      assert.equal(r.clipped, 0, `${venue}/${id}: clipping`);
      assert.equal(r.nonfinite, 0, `${venue}/${id}: non-finite samples`);
      assert.equal(r.error, null, `${venue}/${id}: ${r.error}`);
    }
  }
  fs.writeFileSync(`${outputDir}/audio-excerpts.json`, JSON.stringify(results, null, 2));
  const quietest = results.reduce((a, b) => (b.rms < a.rms ? b : a));
  check('audio-every-programme-piece', { pieces: results.length, venues: Object.fromEntries(Object.entries(setlists).map(([v, ids]) => [v, ids.length])), quietest: `${quietest.venue}/${quietest.id} rms ${quietest.rms}` });
  await page.close();
}

// ---------------------------------------------------------------- venues
async function venue(name) {
  const page = await venuePage(name);
  await page.bringToFront();
  const splash = await page.evaluate(() => __frame());
  assertFrame(`${name}-splash`, splash);
  await page.evaluate(() => __fp.ui.emit('enter', { name: 'QA', avatar: 'bear', mode: 'solo' }));
  await until(page, () => __fp.director.active);
  await sleep(800);
  const inside = await page.evaluate(() => __frame());
  assertFrame(`${name}-arrival`, inside);
  await page.screenshot({ path: `${outputDir}/${name}-arrival.png` });
  // the walk-on: the tuning (with strings) or the welcome is heard before the music
  await page.evaluate(() => { window.__heard = []; __fp.startShow(); });
  await until(page, () => ['tuning', 'announce', 'hush'].includes(__fp.phase), null, 120000);
  const ceremony = await page.evaluate(async () => ({ phase: __fp.phase, ...(await __level(1200)) }));
  await until(page, () => __fp.perf.playing, null, 120000);
  await sleep(1500);
  const music = await page.evaluate(() => __level(2000));
  assert.ok(music.rms > 0.003, `${name}: the music is not heard ${JSON.stringify(music)}`);
  // mute, then the sound back
  await page.evaluate(() => __fp.ui.emit('mute'));
  await sleep(600);
  const muted = await page.evaluate(() => __level(800));
  await page.evaluate(() => __fp.ui.emit('mute'));
  await sleep(600);
  const unmuted = await page.evaluate(() => __level(1000));
  assert.ok(muted.peak < 0.002 && unmuted.rms > 0.002, `${name}: mute ${JSON.stringify({ muted, unmuted })}`);
  // the camera that follows the music
  await page.evaluate(() => __fp.ui.emit('mode', 'cinema'));
  await sleep(4000);
  const cinema = await page.evaluate(() => __frame());
  assertFrame(`${name}-cinema`, cinema);
  await page.screenshot({ path: `${outputDir}/${name}-cinema.png` });
  check(`${name}-seen-and-heard`, { splash, inside, cinema, ceremony, music, muted, unmuted });

  // a musician in focus - double-clicked on the screen - listened to alone
  await page.evaluate(() => __fp.ui.emit('mode', 'walk'));
  const aimed = await page.evaluate(async () => {
    const THREE = await import('three');
    const on = __fp.stage.onstageKeys();
    const p = __fp.orchestra.players.find((x) => on.has(`${x.sid}:${x.ci}`) && x.sid !== 'choir' && !x.fixedInstrument);
    const at = p.char.root.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.char.root.rotation.y);
    const feet = at.clone().addScaledVector(fwd, 2.2);
    __fp.director.placeAt({ x: feet.x, y: at.y, z: feet.z }, { x: at.x, y: at.y + 0.85 * p.char.scale, z: at.z });
    await new Promise((r) => setTimeout(r, 800));
    return { sid: p.sid, ci: p.ci };
  });
  await page.mouse.click(550, 380, { clickCount: 2 });
  await sleep(1200);
  const focus = await page.evaluate(async (aimed) => {
    const label = document.querySelector('#focus, .focus-chip, [id*=focus]')?.innerText || '';
    // (an idle node's AudioParam.value is not brought up to date: the level
    // each section was sent to is what is read back)
    const sections = Object.values(__fp.engine.sections);
    const sent = new Map();
    for (const s of sections) {
      const param = s.focus.gain, original = param.setTargetAtTime.bind(param);
      param.setTargetAtTime = (v, ...rest) => { sent.set(s.id, v); return original(v, ...rest); };
    }
    __fp.ui.emit('solo', true);
    const focusId = __fp.engine.focusId;
    const solo = Object.fromEntries(sent);
    __fp.ui.emit('solo', false);
    const back = Object.fromEntries(sent);
    __fp.ui.emit('unfocus');
    document.exitPointerLock?.();
    const others = sections.filter((s) => s.id !== focusId).map((s) => s.id);
    return { aimed: aimed.sid, focusId, label: label.slice(0, 40), kept: solo[focusId], othersLowered: others.filter((id) => solo[id] < 0.5).length, of: others.length,
      restored: sections.every((s) => back[s.id] === 1) };
  }, aimed);
  assert.ok(focus.focusId === focus.aimed && focus.othersLowered === focus.of && focus.kept > 0.9 && focus.restored, JSON.stringify(focus));
  check(`${name}-focus-solo`, focus);
  // sitting down in a free seat, and up again
  const sit = await page.evaluate(async () => {
    const d = __fp.director;
    const seat = __fp.hall.seats.find((s) => !s.stage && s.index >= 0 && !d.occupied.has(s.index));
    d.sitAt(seat);
    await new Promise((r) => setTimeout(r, 1500));
    const seated = { mode: d.mode, seat: d.seat?.label };
    __fp.ui.emit('sit');
    await new Promise((r) => setTimeout(r, 1200));
    return { ...seated, after: d.mode };
  });
  assert.equal(sit.mode, 'seat');
  check(`${name}-sit-stand`, sit);
  // every display switch, on and off again, saved
  const switches = await page.evaluate(async () => {
    const keys = ['notes', 'glow', 'fireflies', 'fx', 'lasers', 'screen', 'fixedEar', 'skipStageTransitions', 'shuffle', 'repeatOne'];
    const out = {};
    for (const k of keys) {
      const was = __fp.settings[k];
      __fp.ui.onSetting(k, !was);
      await new Promise((r) => setTimeout(r, 150));
      const saved = JSON.parse(localStorage.getItem('fp-settings'))[k];
      __fp.ui.onSetting(k, was);
      out[k] = saved === !was;
    }
    for (const [k, v] of [['volume', 0.5], ['reverb', 0.2], ['applauseVol', 0.3], [Object.keys(__fp.settings).find((x) => x.startsWith('crowd') && location.search.includes(x.slice(5).toLowerCase())) || 'crowdHall', 20]]) {
      const was = __fp.settings[k]; __fp.ui.onSetting(k, v); out[k] = __fp.settings[k] === v; __fp.ui.onSetting(k, was);
    }
    await new Promise((r) => setTimeout(r, 400));
    return out;
  });
  assert.ok(Object.values(switches).every(Boolean), JSON.stringify(switches));
  check(`${name}-switches`, switches);
  // the applause after the last note
  await page.evaluate(() => __fp.ui.emit('seek', __fp.perf.duration - 1.2));
  await until(page, () => __fp.phase === 'applause', null, 10000);
  await sleep(900);
  const applause = await page.evaluate(() => __level(1500));
  assert.ok(applause.rms > 0.002, `${name}: no applause heard ${JSON.stringify(applause)}`);
  check(`${name}-applause-heard`, applause);
  // the leaf programme: nothing kept yet (no piece heard long enough) says so
  const leaf = await page.evaluate(async () => {
    const keep = __fp.leaf.worthKeeping;
    __fp.ui.emit('leaf');
    await new Promise((r) => setTimeout(r, 400));
    const el = document.getElementById('leaf');
    const out = { worthKeeping: keep, panel: !el.hidden, said: document.body.innerText.includes('한 곡을 끝까지 들으면') };
    document.getElementById('leafClose')?.click();
    return out;
  });
  assert.ok(leaf.worthKeeping ? leaf.panel : leaf.said, JSON.stringify(leaf));
  check(`${name}-leaf-empty`, leaf);
  if (name === 'hall') await hallOnly(page);
  await page.evaluate(() => __fp.perf.pause());
  await page.close();
}

async function hallOnly(page) {
  // the foyer hears the hall through its doors
  await until(page, () => __fp.perf.playing, null, 60000).catch(async () => { await page.evaluate(() => __fp.ui.emit('toggle')); await until(page, () => __fp.perf.playing, null, 30000); });
  const wall = await page.evaluate(async () => {
    const { hallOpenness } = await import('/js/scene/hallplan.js');
    const d = __fp.director; d.setMode('walk');
    __fp.ui.onSetting('fixedEar', false);
    d.placeAt({ x: 0, y: 0, z: 40 }, { x: 0, y: 1.6, z: 30 });
    await new Promise((r) => setTimeout(r, 1500));
    const foyer = { open: +hallOpenness(d.pos.x, d.pos.y, d.pos.z).toFixed(2), ...(await __level(1500)) };
    const seat = __fp.hall.seats.find((s) => s.level === '1층' && s.row === 'H' && !d.occupied.has(s.index));
    d.sitAt(seat);
    await new Promise((r) => setTimeout(r, 2000));
    const stalls = { open: +hallOpenness(d.pos.x, d.pos.y, d.pos.z).toFixed(2), ...(await __level(1500)) };
    __fp.ui.onSetting('fixedEar', true);
    return { foyer, stalls };
  });
  assert.ok(wall.foyer.open < 0.6 && wall.stalls.open > 0.9, JSON.stringify(wall));
  check('hall-foyer-through-the-wall', wall);
  // a piano recital: a chair on the stage, the page turner's chair
  const recital = await page.evaluate(async () => {
    const i = [...document.querySelectorAll('#program li, .program li')].findIndex((li) => li.textContent.includes('월광'));
    __fp.ui.emit('select', i);
    const t0 = performance.now();
    while (!(__fp.recital.on && __fp.perf.playing) && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 200));
    const on = __fp.recital.on;
    __fp.ui.emit('stageSeat', false);
    await new Promise((r) => setTimeout(r, 1500));
    const stage = !!__fp.director.seat?.stage;
    __fp.ui.emit('stageSeat', true);
    await new Promise((r) => setTimeout(r, 1500));
    return { piece: __fp.perf.piece.id, recital: on, stageSeat: stage, turner: !!__fp.director.seat?.turner };
  });
  assert.ok(recital.recital && recital.stageSeat && recital.turner, JSON.stringify(recital));
  await page.screenshot({ path: `${outputDir}/hall-page-turner.png` });
  check('hall-recital-seats', recital);
  // the Bremen night guests: four taps on the trail in the programme panel
  await page.evaluate(() => { if (document.getElementById('panel').hidden) document.querySelector('[data-panel=program]').click(); });
  await sleep(400);
  for (let i = 0; i < 4; i++) { await page.click('#bremenTrail'); await sleep(250); }
  await until(page, () => __fp.bremen.active, null, 5000);
  await sleep(1500);
  const bremen = await page.evaluate(() => ({ open: __fp.bremen.active, voices: __fp.bremen.voices, concertPaused: !__fp.perf.playing }));
  await page.screenshot({ path: `${outputDir}/bremen.png` });
  await page.click('.bremen-close');
  await sleep(800);
  bremen.closed = await page.evaluate(() => !__fp.bremen.active);
  bremen.concertResumed = await page.evaluate(() => __fp.perf.playing);
  assert.ok(bremen.open && bremen.voices > 0 && bremen.concertPaused && bremen.closed && bremen.concertResumed, JSON.stringify(bremen));
  check('hall-bremen', bremen);
  // the leaf programme keeps a piece heard long enough (the shortest one, played)
  const leaf = await page.evaluate(async () => {
    const lis = [...document.querySelectorAll('#program li, .program li')];
    const { SETLISTS } = await import('/js/programs.js');
    const index = await (await fetch('/music/index.json')).json();
    const list = SETLISTS.hall.map((id) => index.find((m) => m.id === id));
    const short = list.reduce((a, b) => (b.duration < a.duration ? b : a));
    __fp.ui.emit('select', list.indexOf(short));
    const t0 = performance.now();
    while (!(__fp.perf.playing && __fp.perf.piece?.id === short.id) && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => setTimeout(r, (Math.min(40, short.duration * 0.5) + 3) * 1000));
    __fp.ui.emit('seek', __fp.perf.duration - 1);
    while (__fp.phase !== 'applause' && performance.now() - t0 < 90000) await new Promise((r) => setTimeout(r, 200));
    __fp.ui.emit('leaf');
    await new Promise((r) => setTimeout(r, 500));
    const el = document.getElementById('leaf');
    const out = { piece: short.titleKo, seconds: short.duration, panel: !el.hidden, listed: document.getElementById('leafPieces').innerText.includes(short.titleKo) };
    return { ...out, rows: lis.length };
  });
  await page.screenshot({ path: `${outputDir}/hall-leaf.png` });
  await page.evaluate(() => document.getElementById('leafClose')?.click());
  assert.ok(leaf.panel && leaf.listed, JSON.stringify(leaf));
  check('hall-leaf-kept', leaf);
}

// ---------------------------------------------------------------- square
async function square() {
  const page = await newPage('square');
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await until(page, () => window.__plaza, null, 60000);
  await sleep(1500);
  await page.screenshot({ path: `${outputDir}/square.png` });
  await page.evaluate(() => __plaza.openBooth());
  await until(page, () => !document.getElementById('booth').hidden, null, 5000);
  // a solo seat at the hall, chosen and paid for at the counter by clicks
  await page.click('#venueCards .venue-card.hall .btn-enter');
  await page.click('.mode-card[data-mode=solo]');
  await page.click('#toPay');
  await until(page, () => !document.getElementById('payBtn').disabled && document.getElementById('payBtn').offsetParent, null, 5000);
  await page.click('#payBtn');
  await until(page, () => !!__plaza.ticket, null, 10000);
  const ticket = await page.evaluate(() => ({ venue: __plaza.ticket.venue, mode: __plaza.ticket.mode, no: __plaza.ticket.no }));
  await page.screenshot({ path: `${outputDir}/square-ticket.png` });
  // through the gate into that building, the usher reads the ticket
  await page.evaluate((v) => __plaza.enterGate(v), ticket.venue);
  await page.waitForFunction(() => location.search.includes('venue='), { timeout: 20000 });
  await until(page, () => window.__fp && !document.getElementById('tcEnter')?.disabled, null, 120000);
  await page.click('#tcEnter');
  await until(page, () => __fp.director.active, null, 15000);
  const inside = await page.evaluate(() => ({ venue: new URLSearchParams(location.search).get('venue'), active: __fp.director.active }));
  assert.equal(inside.venue, ticket.venue);
  check('square-booth-gate-usher', { ticket, inside });
  await page.close();
}

// ------------------------------------------------- the room of contemplation
async function sayu() {
  const page = await newPage('sayu');
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await until(page, () => window.__plaza, null, 60000);
  await page.evaluate(() => {
    // the level heard in the room, from its own tap
    window.__heard = async (ms = 1500) => {
      const a = __plaza.place?.heard;
      if (!a) return null;
      const buf = new Float32Array(a.fftSize);
      let sum = 0, n = 0;
      for (const end = performance.now() + ms; performance.now() < end;) {
        a.getFloatTimeDomainData(buf);
        for (const v of buf) { sum += v * v; n++; }
        await new Promise((r) => setTimeout(r, 50));
      }
      return +Math.sqrt(sum / n).toFixed(5);
    };
    // the picture, drawn once more off screen and measured
    window.__frame = async () => {
      const THREE = await import('three');
      const P = __plaza, r = P.renderer, W = 160, H = 110, rt = new THREE.WebGLRenderTarget(W, H);
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      r.setRenderTarget(rt); r.render(P.place ? P.place.scene : P.scene, P.camera); r.setRenderTarget(null);
      const px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, px); rt.dispose();
      let sum = 0, sq = 0; const n = W * H;
      for (let i = 0; i < px.length; i += 4) { const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; sum += l; sq += l * l; }
      const mean = sum / n;
      return { mean: +mean.toFixed(1), std: +Math.sqrt(Math.max(0, sq / n - mean * mean)).toFixed(1) };
    };
  });
  await sleep(1500);
  await page.keyboard.press('ShiftLeft'); // (a key: the square may make sound now)
  // the door: no ticket, you walk into it
  await page.evaluate(() => { const P = __plaza, g = P.PLAZA.sayu; P.player.pos.set(g.x * 0.6, 0, g.z * 0.6); const yaw = Math.atan2(g.x, g.z) + Math.PI; P.player.yaw = P.cam.yaw = yaw; });
  await sleep(1200);
  await page.screenshot({ path: `${outputDir}/sayu-door.png` });
  assert.equal(await page.evaluate(() => !!__plaza.ticket), false, 'no ticket in the paw');
  await page.evaluate(() => { const P = __plaza, g = P.PLAZA.sayu; P.player.pos.set(g.x * 0.86, 0, g.z * 0.86); });
  await until(page, () => __plaza.place && location.search === '?sayu', null, 15000);
  const arrive = await page.evaluate(() => ({ exposure: +__plaza.renderer.toneMappingExposure.toFixed(2), amb: +__plaza.sfx.amb.gain.value.toFixed(2) }));
  await sleep(2500);
  const film = await page.evaluate(() => __heard());
  // the eyes used to the dark, the figures cast, the room reached
  await page.evaluate(() => __plaza.place.room.ready);
  await sleep(5000);
  await page.evaluate(() => { const P = __plaza; P.player.pos.set(2.6, 0, 10.2); P.player.yaw = P.cam.yaw = 0.1; });
  await sleep(2500);
  await page.screenshot({ path: `${outputDir}/sayu-room.png` });
  const room = await page.evaluate(async () => ({
    exposure: +__plaza.renderer.toneMappingExposure.toFixed(2), frame: await __frame(), heard: await __heard(),
    figures: __plaza.place.room.statues.map((s) => ({ id: s.id, tris: s.mesh?.geometry.index.count / 3, scale: s.scale })),
    floorRise: +(__plaza.place.floorY(0, -3) - __plaza.place.floorY(0, 11)).toFixed(3),
  }));
  // stopping before them: F, your cheek on your paw, the screen emptied
  await page.evaluate(() => { const P = __plaza; P.player.pos.set(0.2, 0, -1.6); P.player.yaw = P.cam.yaw = 0; });
  await until(page, () => !document.getElementById('pzAct').hidden && document.getElementById('pzActText').textContent.includes('바라보기'), null, 5000);
  await page.keyboard.press('KeyF');
  await sleep(6000);
  await page.screenshot({ path: `${outputDir}/sayu-look.png` });
  const look = await page.evaluate(async () => {
    const ch = __plaza.player.char;
    ch.root.updateMatrixWorld(true);
    const paw = ch.arms.R.wrist.clone().applyMatrix4(ch.body.matrixWorld);
    const head = ch.head.getWorldPosition(paw.clone());
    // (the paw at the skull's surface: the head's radius and the paw's own size off its middle)
    return { still: document.getElementById('plaza').classList.contains('still'), looking: __plaza.place.looking, pawToHead: +paw.distanceTo(head).toFixed(3), reach: +ch.arms.R.targetError.toFixed(4), frame: await __frame() };
  });
  await page.keyboard.down('KeyW'); await sleep(400); await page.keyboard.up('KeyW');
  const moved = await page.evaluate(() => ({ looking: __plaza.place.looking, still: document.getElementById('plaza').classList.contains('still') }));
  // out by the corridor on the other side, back on the square
  await page.evaluate(() => { __plaza.player.pos.set(-4.4, 0, 29.9); });
  await until(page, () => !__plaza.place, null, 15000);
  await sleep(1500);
  const back = await page.evaluate(() => ({ url: location.search, exposure: __plaza.renderer.toneMappingExposure, amb: +__plaza.sfx.amb.gain.value.toFixed(2) }));
  assert.ok(arrive.exposure < 0.6 && room.exposure > 0.9, `the eyes adapt ${JSON.stringify([arrive, room.exposure])}`);
  assert.ok(film > 0.002 && room.heard > 0 && room.heard < film, `the film is heard, the room is quiet ${JSON.stringify([film, room.heard])}`);
  assert.ok(room.figures.every((f) => f.tris > 100000), JSON.stringify(room.figures));
  assert.ok(room.floorRise > 0.2 && room.floorRise < 0.3, `the floor's one degree ${room.floorRise}`);
  assertFrame('sayu-room', room.frame);
  assert.ok(look.still && look.looking && look.reach < 0.005 && look.pawToHead > 0.25 && look.pawToHead < 0.36, JSON.stringify(look));
  assertFrame('sayu-look', look.frame);
  assert.ok(!moved.looking && !moved.still, JSON.stringify(moved));
  assert.ok(back.url === '' && back.exposure === 1 && back.amb > 0.5, JSON.stringify(back));
  check('sayu-visit', { arrive, film, room, look, moved, back });
  await page.close();
}

// ---------------------------------------------------------------- room
async function room() {
  const host = await venuePage('outdoor', 'room-host');
  await host.evaluate(() => __fp.ui.emit('enter', { name: 'QA 방장', avatar: 'bear', mode: 'create', title: 'QA 대화', cap: 4, pub: false }));
  await until(host, () => (__fp.room?.isHost && __fp.director.active) || !__fp.room, null, 15000);
  assert.ok(await host.evaluate(() => !!__fp.room?.isHost), 'the room was not made (a fresh server clears earlier rooms)');
  const code = await host.evaluate(() => __fp.room.room.code);
  const guest = await venuePage('outdoor', 'room-guest');
  await guest.evaluate((code) => __fp.ui.emit('enter', { name: 'QA 손님', avatar: 'fox', mode: 'join', code }), code);
  await until(guest, () => __fp.room?.connected && __fp.director.active, null, 15000);
  await host.evaluate(() => __fp.ui.emit('chat', '숲속에서 만나요'));
  await until(guest, () => document.getElementById('chatLog').textContent.includes('QA 방장숲속에서 만나요'), null, 8000);
  // (and above the speaker's avatar, as a bubble)
  const bubble = await guest.evaluate(() => [...__fp.avatars.list.values()].some((a) => JSON.stringify(Object.keys(a)).includes('bubble') || a.say || a.bubble));
  const seen = await Promise.all([host, guest].map((q) => q.evaluate(() => ({ members: __fp.room.members.size, avatars: __fp.avatars.list.size }))));
  assert.ok(seen.every((s) => s.members === 2 && s.avatars === 1), JSON.stringify(seen));
  check('room-chat-avatars', { code, host: seen[0], guest: seen[1], bubble });
  // (the lobby fades for 1.3 s after the entrance, then is gone)
  await until(guest, () => !document.getElementById('splash'), null, 5000);
  await sleep(500);
  await guest.screenshot({ path: `${outputDir}/room-guest.png` });
  for (const q of [host, guest]) await q.evaluate(() => __fp.room?.leave());
}

try {
  if (parts.includes('audio')) await audio();
  if (parts.includes('venues')) for (const v of (process.env.VENUES || 'hall,sphere,outdoor').split(',')) await venue(v);
  if (parts.includes('square')) await square();
  if (parts.includes('sayu')) await sayu();
  if (parts.includes('room')) await room();
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.status = 'pass';
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(`${outputDir}/features.json`, JSON.stringify(report, null, 2));
  for (const context of contexts) await context.close().catch(() => {});
  await browser.disconnect();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, errors: report.errors.length, failure: report.failure?.split('\n')[0] }));
}
