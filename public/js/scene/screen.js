// The big screen behind the choir: a live "broadcast" of the concert from
// its own camera (TV-style cuts and slow pushes), with lower-third captions
// that name the piece and composer the way a televised concert does.
import * as THREE from 'three';
import { PODIUM, STAGE_Y, SECTIONS, sectionCenter } from '../layout.js';
import { HALL } from './hall.js';
import { M } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const W = 1024;
const H = 576;
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

// headless: no screen in the room - only the picture and captions, for a
// venue that shows them elsewhere (the Sphere's dome); before / after run
// round the broadcast render (to keep the picture from filming itself)
export function buildScreen(scene, renderer, { lite = false, headless = false, before = null, after = null } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const sw = 11.6;
  const sh = sw * (H / W);
  const cx = 0;
  const cy = 7.75 + sh / 2; // above the shell, below the great window
  const cz = HALL.front + 0.42; // in front of the window frame

  // bezel + the live picture + a transparent caption layer in front of it
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.5, sh + 0.5, 0.25), M.blackMatte());
  bezel.position.set(cx, cy, cz - 0.15);
  if (!headless) group.add(bezel);
  // phones: a small picture, refreshed now and then
  const rt = lite ? new THREE.WebGLRenderTarget(384, 216) : new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false }));
  pic.position.set(cx, cy, cz);
  if (!headless) group.add(pic);
  // gilt frame round the bezel
  const fr = [];
  for (const [w, h, x, y] of [[sw + 0.8, 0.14, 0, sh / 2 + 0.32], [sw + 0.8, 0.14, 0, -sh / 2 - 0.32], [0.14, sh + 0.78, sw / 2 + 0.33, 0], [0.14, sh + 0.78, -sw / 2 - 0.33, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), M.gilt());
    m.position.set(cx + x, cy + y, cz - 0.05);
    if (!headless) group.add(m);
  }

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const capTex = new THREE.CanvasTexture(cv);
  capTex.colorSpace = THREE.SRGBColorSpace;
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: capTex, transparent: true, toneMapped: false, depthWrite: false }));
  cap.position.set(cx, cy, cz + 0.02);
  if (!headless) group.add(cap);

  // broadcast camera
  const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 160);
  const state = { shot: null, t: 0, hold: 0, from: null, to: null, cutT: 0, lastKind: '' };
  let frame = 0;
  let captionState = { text: null, since: -99, mode: 'none' };
  let lastCapKey = '';

  function pickShot(ctx) {
    const { perf, time } = ctx;
    const piece = perf.piece;
    const dom = piece && perf.playing ? perf.dominantSection(time + 1.5, 6) : null;
    const r = Math.random();
    const wide = [
      { kind: 'wide', pos: V(0, 5.2, 16), look: V(0, STAGE_Y + 1.3, -5), fov: 38, drift: V(0, -0.3, -2.5) },
      { kind: 'wide2', pos: V(-10, 8.5, 20), look: V(0, STAGE_Y + 1, -5), fov: 36, drift: V(2.5, 0, 0) },
      { kind: 'wide3', pos: V(9, 6.4, 8), look: V(-0.5, STAGE_Y + 1, -5.5), fov: 42, drift: V(0, 0, 2.5) },
      { kind: 'crane', pos: V(0, 11.5, 4), look: V(0, STAGE_Y, -5), fov: 48, drift: V(0, -1.5, -2) },
      { kind: 'audience', pos: V(1.5, STAGE_Y + 2.1, -3.5), look: V(0, 2.5, 14), fov: 44, drift: V(-1.5, 0, 0) },
    ];
    let shot;
    if (!piece || !perf.playing || r < 0.3 || (state.lastKind === 'section' && r < 0.45)) {
      shot = wide[Math.floor(Math.random() * wide.length)];
    } else if (piece.conducted && r < 0.42 && state.lastKind !== 'conductor') {
      shot = Math.random() < 0.5
        ? { kind: 'conductor', pos: V(1.6, STAGE_Y + 1.95, -6.4), look: V(PODIUM.x, STAGE_Y + 1.6, PODIUM.z), fov: 30, drift: V(-1, 0, 0) }
        : { kind: 'conductor', pos: V(-0.4, STAGE_Y + 2.2, 2.6), look: V(0, STAGE_Y + 1.4, PODIUM.z), fov: 36, drift: V(0.8, 0, -0.6) };
    } else if (dom) {
      const sc = sectionCenter(dom);
      const look = V(sc.x, sc.y + 0.2, sc.z);
      const toAud = V(-sc.x * 0.3, 0, 1).normalize();
      const side = Math.random() < 0.5 ? -1 : 1;
      const lateral = V(toAud.z, 0, -toAud.x).multiplyScalar(side);
      let dist = 2.4 + Math.random() * 1.6;
      if (dom === 'piano') {
        const pp = SECTIONS.piano.chairs[0];
        shot = { kind: 'section', pos: V(pp.x + 1.1, pp.y + 1.5, pp.z + 0.9), look: V(pp.x + 0.5, pp.y + 0.75, pp.z), fov: 34, drift: V(0.4, 0, -0.5) };
      } else if (dom === 'choir') {
        shot = { kind: 'section', pos: V(side * 3, STAGE_Y + 2.6, -5.5), look: V(0, STAGE_Y + 2.7, -11.5), fov: 36, drift: V(-side * 1.5, 0, 0) };
      } else {
        if (sc.z < -6) dist += 1.4;
        const pos = look.clone().addScaledVector(toAud, dist).addScaledVector(lateral, 1.1).add(V(0, 0.5, 0));
        shot = { kind: 'section', pos, look, fov: 32 + Math.random() * 8, drift: lateral.clone().multiplyScalar(-0.8) };
      }
    } else shot = wide[0];
    shot.hold = 7 + Math.random() * 7;
    return shot;
  }

  // Captions kept to the essentials: the title as a piece begins, and
  // what comes next during the break. No badges, no countdowns.
  function drawCaption(ctx, now) {
    const piece = ctx.perf.piece;
    let mode = 'none';
    let key = '';
    if (ctx.phase === 'intermission' && ctx.nextPiece) { mode = 'next'; key = `next:${ctx.nextPiece.id}`; }
    else if (piece && ctx.perf.playing && ctx.time < 10) { mode = 'title'; key = `title:${piece.id}`; }
    if (key !== lastCapKey) {
      lastCapKey = key;
      captionState = { mode, since: now };
    }
    const age = now - captionState.since;
    const alpha = Math.min(1, age * 1.5) * (mode === 'title' ? Math.min(1, Math.max(0, (10 - ctx.time) / 1.2)) : 1);
    g.clearRect(0, 0, W, H);
    if (mode === 'none' || alpha <= 0) { capTex.needsUpdate = true; return; }
    g.globalAlpha = alpha;
    const vg = g.createLinearGradient(0, H * 0.62, 0, H);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = vg;
    g.fillRect(0, H * 0.62, W, H * 0.38);
    const x = 64;
    const y = H - 112;
    const slide = (1 - ease(Math.min(1, age * 1.4))) * 40;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    if (mode === 'title' && piece) {
      g.fillStyle = '#e6c07b';
      g.fillRect(x - slide, y - 2, 4, 76);
      g.font = '500 20px "IBM Plex Sans KR", sans-serif';
      g.fillText(`${piece.composerKo} · ${piece.year}`, x + 20 - slide, y + 14);
      g.fillStyle = '#fff';
      g.font = '700 32px "Gowun Batang", serif';
      g.fillText(fit(piece.titleKo, 820, g), x + 20 - slide, y + 52);
    } else if (mode === 'next' && ctx.nextPiece) {
      g.fillStyle = '#e6c07b';
      g.fillRect(x - slide, y - 2, 4, 76);
      g.font = '500 20px "IBM Plex Sans KR", sans-serif';
      g.fillText('다음 곡', x + 20 - slide, y + 14);
      g.fillStyle = '#fff';
      g.font = '700 30px "Gowun Batang", serif';
      g.fillText(fit(`${ctx.nextPiece.composerKo} — ${ctx.nextPiece.titleKo}`, 820, g), x + 20 - slide, y + 52);
    }
    g.globalAlpha = 1;
    capTex.needsUpdate = true;
  }

  function fit(text, maxW, ctx2) {
    let t = text;
    while (ctx2.measureText(t).width > maxW && t.length > 4) t = `${t.slice(0, -2)}…`;
    return t;
  }

  return {
    group, cam, texture: rt.texture, capTex,
    // every call advances the broadcast; renders every `every` frames
    update(dt, ctx, every = 2) {
      frame++;
      const now = performance.now() / 1000;
      state.t += dt;
      if (!state.shot || state.t > state.hold) {
        const s = pickShot(ctx);
        state.from = state.shot;
        state.shot = s;
        state.lastKind = s.kind;
        state.t = 0;
        state.hold = s.hold;
        state.cut = state.from ? Math.random() < 0.65 : true; // TV: mostly hard cuts
        state.cutT = 0;
      }
      const s = state.shot;
      const x = state.t / state.hold;
      const pos = s.pos.clone().addScaledVector(s.drift, x);
      if (!state.cut && state.from && state.t < 2.2) {
        const k = ease(state.t / 2.2);
        const fp = state.from.pos.clone().addScaledVector(state.from.drift, 1);
        pos.lerpVectors(fp, pos, k);
        cam.fov = state.from.fov + (s.fov - state.from.fov) * k;
      } else cam.fov = s.fov;
      cam.position.copy(pos);
      cam.lookAt(s.look);
      cam.updateProjectionMatrix();
      if (frame % every === 0) {
        group.visible = false; // the screen must not film itself
        before?.();
        const prevRT = renderer.getRenderTarget();
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        renderer.setRenderTarget(prevRT);
        after?.();
        group.visible = true;
      }
      if (frame % 3 === 0) drawCaption(ctx, now);
    },
    setEnabled(on) { group.visible = on; },
  };
}
