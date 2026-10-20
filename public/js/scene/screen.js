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

export function buildScreen(scene, renderer) {
  const group = new THREE.Group();
  scene.add(group);
  const sw = 11.6;
  const sh = sw * (H / W);
  const cx = 0;
  const cy = 9.1 + sh / 2;
  const cz = HALL.front + 0.42; // in front of the window frame

  // bezel + the live picture + a transparent caption layer in front of it
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.5, sh + 0.5, 0.25), M.blackMatte());
  bezel.position.set(cx, cy, cz - 0.15);
  group.add(bezel);
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false }));
  pic.position.set(cx, cy, cz);
  group.add(pic);
  // a faint glow so the screen lights the choir a little
  const screenLight = new THREE.SpotLight('#cfd8ff', 0.6, 14, 0.9, 0.9, 1.2);
  screenLight.position.set(cx, cy, cz + 0.3);
  screenLight.target.position.set(0, STAGE_Y + 1.5, -9);
  group.add(screenLight, screenLight.target);

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const capTex = new THREE.CanvasTexture(cv);
  capTex.colorSpace = THREE.SRGBColorSpace;
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: capTex, transparent: true, toneMapped: false, depthWrite: false }));
  cap.position.set(cx, cy, cz + 0.02);
  group.add(cap);

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

  function drawCaption(ctx, now) {
    const piece = ctx.perf.piece;
    let mode = 'none';
    let key = '';
    if (ctx.phase === 'intermission' && ctx.nextPiece) { mode = 'next'; key = `next:${ctx.nextPiece.id}:${Math.floor(ctx.countdown || 0)}`; }
    else if (ctx.phase === 'applause') { mode = 'applause'; key = 'applause'; }
    else if (piece && ctx.perf.playing && (ctx.time < 9 || (ctx.time % 100) < 8)) { mode = 'title'; key = `title:${piece.id}:${ctx.time < 9 ? 0 : Math.floor(ctx.time / 100)}`; }
    else if (ctx.phase === 'entering') { mode = 'welcome'; key = 'welcome'; }
    if (key !== lastCapKey) {
      lastCapKey = key;
      captionState = { mode, since: now };
    }
    const age = now - captionState.since;
    const alpha = Math.min(1, age * 1.5);
    g.clearRect(0, 0, W, H);
    // letterbox vignette makes the picture read as a broadcast
    const vg = g.createLinearGradient(0, H * 0.7, 0, H);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, H * 0.7, W, H * 0.3);
    // live bug
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.roundRect(34, 30, 112, 38, 8);
    g.fill();
    g.fillStyle = (Math.floor(now * 1.2) % 2) ? '#ff4b4b' : '#ff8a8a';
    g.beginPath();
    g.arc(56, 49, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '600 20px "IBM Plex Sans KR", sans-serif';
    g.textBaseline = 'middle';
    g.fillText('LIVE', 72, 50);
    g.textAlign = 'right';
    g.font = '500 18px "IBM Plex Sans KR", sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('숲속 필하모닉', W - 36, 50);
    g.textAlign = 'left';
    if (mode === 'none') { capTex.needsUpdate = true; return; }
    g.globalAlpha = alpha;
    const x = 56;
    const y = H - 120;
    if (mode === 'title' && piece) {
      const slide = (1 - ease(Math.min(1, age * 1.4))) * 60;
      g.fillStyle = '#e6c07b';
      g.fillRect(x - slide, y - 4, 6, 92);
      g.fillStyle = 'rgba(8,12,10,0.72)';
      g.fillRect(x + 6 - slide, y - 4, 620, 92);
      g.fillStyle = '#e6c07b';
      g.font = '500 20px "IBM Plex Sans KR", sans-serif';
      g.fillText(`${piece.composerKo} · ${piece.composer} (${piece.year})`, x + 24 - slide, y + 18);
      g.fillStyle = '#fff';
      g.font = '700 30px "Gowun Batang", serif';
      g.fillText(fit(piece.titleKo, 580, g), x + 24 - slide, y + 58);
    } else if (mode === 'next' && ctx.nextPiece) {
      g.fillStyle = 'rgba(8,12,10,0.72)';
      g.fillRect(x, y - 4, 620, 92);
      g.fillStyle = '#86ad8f';
      g.font = '500 20px "IBM Plex Sans KR", sans-serif';
      g.fillText(`다음 곡  ·  ${ctx.countdown > 0 ? `${Math.ceil(ctx.countdown)}초 뒤` : '곧 시작'}`, x + 24, y + 18);
      g.fillStyle = '#fff';
      g.font = '700 28px "Gowun Batang", serif';
      g.fillText(fit(`${ctx.nextPiece.composerKo} — ${ctx.nextPiece.titleKo}`, 580, g), x + 24, y + 58);
    } else if (mode === 'applause') {
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.font = '700 54px "Gowun Batang", serif';
      g.shadowColor = 'rgba(0,0,0,0.6)';
      g.shadowBlur = 18;
      g.fillText('Bravo!', W / 2, H / 2 + Math.sin(now * 3) * 4);
      g.shadowBlur = 0;
      g.textAlign = 'left';
    } else if (mode === 'welcome') {
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.font = '700 40px "Gowun Batang", serif';
      g.fillText('숲속 필하모닉에 오신 것을 환영합니다', W / 2, H / 2 - 10);
      g.font = '400 22px "IBM Plex Sans KR", sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillText('연주자들이 자리에 앉는 중입니다', W / 2, H / 2 + 36);
      g.textAlign = 'left';
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
    group, cam,
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
        const prevRT = renderer.getRenderTarget();
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        renderer.setRenderTarget(prevRT);
        group.visible = true;
      }
      if (frame % 3 === 0) drawCaption(ctx, now);
    },
    setEnabled(on) { group.visible = on; },
  };
}
