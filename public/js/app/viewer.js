// The visitor: how they look around, sit down, pick a musician, and the
// buttons that change what they see or hear.
import * as THREE from 'three';
import { SECTIONS, CHOIR_VOICES } from '../layout.js';
import { appleTouchFullscreen } from './lobby.js';

export function createViewer(app) {
  const { S, settings, ui, engine, camera, renderer, orchestra, hall, recital, director, isTouch, PIANIST } = app;

  ui.on('mode', (m) => {
    director.setMode(m);
    if (m === 'cinema') ui.toast('편하게 보기: 지금 선율을 이끄는 악기를 따라가요. 드래그하면 다시 직접 봐요.', 2800);
  });
  ui.on('sit', () => director.toggleSit());
  ui.on('dialogOpen', () => {
    const miniature = document.getElementById('bremen');
    if (miniature?.open) miniature.close();
    director.keys.clear();
    director.vel.set(0, 0, 0);
    director.releaseLock();
  });
  ui.on('jump', () => director.jump());
  ui.on('mute', () => {
    S.muted = !S.muted;
    engine.setVolume(S.muted ? 0 : settings.volume);
    ui.setMuted(S.muted);
    ui.toast(S.muted ? '음소거' : '소리 켬', 1200);
  });
  ui.on('fullscreen', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else {
      if (appleTouchFullscreen()) ui.toast('iPad에서는 아래로 쓸면 전체화면이 해제될 수 있어요. 일반 화면에서도 둘러볼 수 있어요.', 6500);
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  });
  ui.on('unfocus', () => {
    S.focused = null;
    engine.setFocus(null);
    ui.focus(null);
    director.setMode('walk');
  });
  ui.on('solo', (on) => engine.setFocus(on && S.focused ? S.focused.sid : null));

  // a recital: a seat on the stage, or the page turner's chair
  ui.on('stageSeat', (turner) => {
    if (!recital.on) return;
    const free = recital.seats.filter((s) => !!s.turner === turner && !director.occupied.has(s.index));
    if (!free.length) { ui.toast(turner ? '악보 넘김이 자리에 이미 누가 앉아 있어요.' : '무대 위 자리가 다 찼어요.', 2000); return; }
    S.focused = null;
    ui.focus(null);
    engine.setFocus(null);
    director.sitAt(free[0]);
    ui.toast(turner ? `${PIANIST.char.spec.name}의 악보 넘김이 자리예요. 연주에 맞춰 악보가 넘어가요.` : '무대 위 자리예요. 건반이 어깨 너머로 보여요.', 3000);
  });

  director.on((type, data) => {
    if (type === 'mode') ui.setMode(data);
    if (type === 'seat' && data?.index >= 0 && !data.stage) S.lastSeat = data;
    // no seat labels on screen; E (or a double-click) still sits you down.
    // Touch screens keep the plain "앉기" button - it is their only way to sit -
    // and, seated, the same button stands you up again
    if (type === 'nearSeat' && isTouch && director.mode !== 'seat') ui.prompt(data ? '앉기' : null, '앉기');
    if (type === 'mode' && isTouch) {
      if (data === 'seat') ui.prompt('일어서기', '일어서기');
      else ui.prompt(data === 'walk' && director.nearSeat ? '앉기' : null, '앉기');
    }
    if (type === 'pick') onPick(data);
    if (type === 'aim') ui.setAim(data);
    if (type === 'lock') ui.setLocked(data);
    if (type === 'looked') ui.hideLookHint();
    // a click (not a drag) on the hall captures the mouse for free looking
    // (not the second click of a double-click on 입장하기, falling through
    // the fading splash)
    if (type === 'clickView' && S.concertStarted && !isTouch && !document.getElementById('splash')) director.requestLock();
  });

  // -------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hitTest(x, y) {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    // only musicians who are actually on stage (not waiting behind the doors)
    const hits = raycaster.intersectObjects(orchestra.pickables.filter((o) => o.visible), true);
    // (the Sphere's seats come in sections: map back to the seat list)
    const seatHit = raycaster.intersectObject(hall.seatMesh, true)[0];
    let player = null;
    let dist = Infinity;
    if (hits.length) {
      let o = hits[0].object;
      while (o && !orchestra.pickables.includes(o)) o = o.parent;
      player = orchestra.players.find((p) => p.char.root === o) || (o === orchestra.conductor.char.root ? 'conductor' : null);
      dist = hits[0].distance;
    }
    if (seatHit && seatHit.distance < dist) return { seat: hall.seats[seatHit.object.userData.seatIdx?.[seatHit.instanceId] ?? seatHit.instanceId], dist: seatHit.distance };
    return { player, dist };
  }

  function describe(player) {
    if (player === 'conductor') return { name: '부엉 선생', role: '지휘자' };
    const spec = player.char.spec;
    const role = player.sid === 'choir' ? `합창단 ${CHOIR_VOICES[player.ci]}` : `${SECTIONS[player.sid].ko}${spec.title ? ` (${spec.title})` : ''}`;
    return { name: spec.name, role };
  }

  function onPick({ x, y }) {
    const h = hitTest(x, y);
    if (h.player && h.player !== 'conductor') {
      S.focused = h.player;
      director.focusPlayer(h.player);
      const d = describe(h.player);
      ui.focus(`${d.name}, ${d.role}`);
      engine.setFocus(null);
    } else if (h.seat) {
      if (director.occupied.has(h.seat.index)) {
        ui.toast(`${h.seat.label}에는 이미 관객이 앉아 있어요.`, 2200);
        return;
      }
      if (h.dist > 6) { ui.toast('좀 더 가까이 가서 앉아 보세요.', 1800); return; }
      S.focused = null;
      ui.focus(null);
      engine.setFocus(null);
      director.sitAt(h.seat);
    }
  }

  let hoverT = 0;
  function hover(x, y) {
    const h = hitTest(x, y);
    if (director.locked || director.aiming) {
      // what the crosshair rests on
      ui.target(h.player ? describe(h.player) : null);
      return;
    }
    hoverAt(h, x, y);
  }
  // (asleep or in a background tab nothing is seen: no aiming either)
  setInterval(() => { if ((director.locked || director.aiming) && S.concertStarted && !S.asleep && !document.hidden) hover(window.innerWidth / 2, window.innerHeight / 2); }, 160);
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (isTouch || director.locked || director.aiming) return;
    const now = performance.now();
    if (now - hoverT < 90 || e.buttons) return;
    hoverT = now;
    hover(e.clientX, e.clientY);
  });
  function hoverAt(h, x, y) {
    const e = { clientX: x, clientY: y };
    if (h.player) {
      ui.tooltip(describe(h.player), e.clientX, e.clientY);
      renderer.domElement.style.cursor = 'pointer';
    } else {
      ui.tooltip(null);
      renderer.domElement.style.cursor = '';
    }
  }
  renderer.domElement.addEventListener('pointerleave', () => ui.tooltip(null));

  return {};
}
