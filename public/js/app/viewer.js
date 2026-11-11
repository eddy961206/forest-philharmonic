// The visitor: how they look around, sit down, pick a musician, and the
// buttons that change what they see or hear.
import * as THREE from 'three';
import { SECTIONS, CHOIR_VOICES } from '../layout.js';
import { IS_HALL } from '../scene/venue.js';
import { HALL } from '../scene/hallplan.js';
import { appleTouchFullscreen } from './lobby.js';

export function createViewer(app) {
  const { S, settings, ui, engine, camera, renderer, orchestra, hall, recital, director, PIANIST } = app;
  const touchOn = () => Boolean(app.isTouch);
  let prevFocus = null;
  let applyingFocus = false;
  let hasSatOnce = false;
  let keyMoved = false;
  let mouseUsed = false;
  let lockHintShown = false;

  function clearFocusState() {
    if (!S.focused) return;
    S.focused = null;
    prevFocus = null;
    engine.setFocus(null);
    ui.focus(null);
    syncStageTargets();
  }

  function focusTarget(target) {
    if (!target) return;
    if (!S.focused) {
      prevFocus = {
        mode: director.mode,
        seat: director.seat?.index >= 0 ? director.seat : (director.mode === 'cinema' ? director.returnTo?.seat || null : null),
      };
    }
    applyingFocus = true;
    try {
      if (target === 'conductor') {
        S.focused = 'conductor';
        director.focusConductor(orchestra.conductor);
        engine.setFocus(null);
        ui.focus('부엉 선생, 지휘자 · 전체 균형 청취', { canSolo: false });
      } else {
        S.focused = target;
        director.focusPlayer(target);
        const d = describe(target);
        engine.setFocus(null);
        ui.focus(`${d.name}, ${d.role}`, { canSolo: true });
      }
    } finally {
      applyingFocus = false;
    }
    syncStageTargets();
  }

  function onstageTargets() {
    const list = [];
    if (orchestra.conductor?.char?.root?.visible) list.push('conductor');
    const seen = new Set();
    for (const p of orchestra.players) {
      if (!p.char.root.visible || seen.has(p.sid)) continue;
      seen.add(p.sid);
      list.push(p);
    }
    return list;
  }

  function syncStageTargets() {
    if (!ui.setStageTargets) return;
    const items = onstageTargets().map((t) => (
      t === 'conductor'
        ? { id: 'conductor', label: '지휘대 (부엉 선생)' }
        : { id: t.sid, label: SECTIONS[t.sid]?.ko || t.sid }
    ));
    const activeId = S.focused === 'conductor' ? 'conductor' : S.focused?.sid || null;
    ui.setStageTargets(items, activeId);
  }

  ui.on('mode', (m) => {
    clearFocusState();
    director.setMode(m);
    if (m === 'cinema') ui.toast('편하게 보기: 지금 선율을 이끄는 악기를 따라가요. 드래그하면 다시 직접 봐요.', 2800);
  });
  ui.on('sit', () => {
    if (S.focused) {
      ui.emit('unfocus');
      return;
    }
    director.toggleSit();
  });
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
    const restore = prevFocus;
    clearFocusState();
    if (restore?.mode === 'seat' && restore.seat && !restore.seat.off && !director.occupied.has(restore.seat.index)) {
      director.sitAt(restore.seat);
    } else if (restore?.mode === 'cinema') {
      if (restore.seat && !restore.seat.off && !director.occupied.has(restore.seat.index) && director.returnTo) {
        director.returnTo.seat = restore.seat;
      }
      director.setMode('cinema');
    } else {
      director.setMode('walk');
    }
  });
  ui.on('solo', (on) => engine.setFocus(on && S.focused && S.focused !== 'conductor' ? S.focused.sid : null));
  ui.on('panelOpen', (which) => { if (which === 'program') syncStageTargets(); });
  ui.on('focusSection', (id) => {
    if (!id) { ui.emit('unfocus'); return; }
    const list = onstageTargets();
    const found = id === 'conductor' ? list.find((x) => x === 'conductor') : list.find((x) => x !== 'conductor' && x.sid === id);
    if (!found) { ui.toast('지금 무대 위에 나와 있는 파트가 아니에요.', 1800); return; }
    if ((id === 'conductor' && S.focused === 'conductor') || (S.focused && S.focused !== 'conductor' && S.focused.sid === id)) {
      ui.emit('unfocus');
      return;
    }
    focusTarget(found);
  });
  ui.on('cycleFocus', (dir) => {
    const list = onstageTargets();
    if (!list.length) { ui.toast('지금 무대 위에 나와 있는 단원이 없어요.', 1800); return; }
    const cur = S.focused === 'conductor'
      ? list.indexOf('conductor')
      : list.findIndex((x) => x !== 'conductor' && x.sid === S.focused?.sid);
    const nextIdx = cur < 0 ? (dir >= 0 ? 0 : list.length - 1) : (cur + dir + list.length) % list.length;
    focusTarget(list[nextIdx]);
  });

  // a recital: a seat on the stage, or the page turner's chair
  ui.on('stageSeat', (turner) => {
    if (!recital.on) return;
    const free = recital.seats.filter((s) => !!s.turner === turner && !director.occupied.has(s.index));
    if (!free.length) { ui.toast(turner ? '악보 넘김이 자리에 이미 누가 앉아 있어요.' : '무대 위 자리가 다 찼어요.', 2000); return; }
    clearFocusState();
    director.sitAt(free[0]);
    ui.toast(turner ? `${PIANIST.char.spec.name}의 악보 넘김이 자리예요. 연주에 맞춰 악보가 넘어가요.` : '무대 위 자리예요. 건반이 어깨 너머로 보여요.', 3000);
  });

  const showDesktopPrompt = () => !hasSatOnce || (keyMoved && !mouseUsed);
  function syncSeatPrompt() {
    if (touchOn()) {
      if (director.mode === 'seat') ui.prompt('일어서기', '일어서기');
      else ui.prompt(director.mode === 'walk' && director.nearSeat ? '앉기' : null, '앉기');
    } else if (director.mode === 'walk' && director.nearSeat && showDesktopPrompt()) {
      ui.prompt('앉기', '앉기');
    } else {
      ui.prompt(null);
    }
  }
  ui.on('touchChange', () => syncSeatPrompt());

  director.on((type, data) => {
    if (type === 'mode') {
      if (!applyingFocus && data !== 'seat' && S.focused) clearFocusState();
      ui.setMode(data);
      syncSeatPrompt();
    }
    if (type === 'seat' && data?.index >= 0) {
      if (!applyingFocus && S.focused) clearFocusState();
      if (!data.stage) {
        S.lastSeat = data;
        hasSatOnce = true;
      }
      syncSeatPrompt();
    }
    if (type === 'keyMove') {
      keyMoved = true;
      syncSeatPrompt();
    }
    if (type === 'unfocusKey') ui.emit('unfocus');
    if (type === 'nearSeat' && director.mode !== 'seat') syncSeatPrompt();
    if (type === 'pick') onPick(data);
    if (type === 'keyInteract') onPick({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    if (type === 'aim') {
      if (data && !touchOn() && !mouseUsed) { mouseUsed = true; syncSeatPrompt(); }
      ui.setAim(data);
    }
    if (type === 'lock') {
      if (data && !touchOn() && !mouseUsed) { mouseUsed = true; syncSeatPrompt(); }
      ui.setLocked(data);
      if (data && !lockHintShown && !touchOn()) {
        lockHintShown = true;
        ui.toast('마우스로 둘러봐요 · 커서 보기는 Esc · 좌석·단원은 더블클릭', 3200);
      }
    }
    if (type === 'looked') {
      if (!touchOn() && !mouseUsed) { mouseUsed = true; syncSeatPrompt(); }
      ui.hideLookHint();
    }
    // a click (not a drag) on the hall captures the mouse for free looking
    // (not the second click of a double-click on 입장하기, falling through
    // the fading splash)
    if (type === 'clickView' && S.concertStarted && !touchOn() && !document.getElementById('splash')) director.requestLock();
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
    if (h.player) {
      focusTarget(h.player);
    } else if (h.seat) {
      if (director.occupied.has(h.seat.index)) {
        ui.toast(`${h.seat.label}에는 이미 관객이 앉아 있어요.`, 2200);
        return;
      }
      if (h.dist > 6) { ui.toast('좀 더 가까이 가서 앉아 보세요.', 1800); return; }
      clearFocusState();
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
  const pollTimer = setInterval(() => {
    if (IS_HALL && !S.concertStarted && director.active) {
      ui.setFoyerHint?.(director.pos.z > HALL.back + 0.5);
    }
    if (!document.getElementById('panel')?.hidden && !document.getElementById('programBody')?.hidden) {
      syncStageTargets();
    }
    if ((director.locked || director.aiming) && S.concertStarted && !S.asleep && !document.hidden) {
      hover(window.innerWidth / 2, window.innerHeight / 2);
    }
  }, 160);
  pollTimer?.unref?.();
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!touchOn() && e.pointerType !== 'touch' && !mouseUsed) {
      mouseUsed = true;
      syncSeatPrompt();
    }
    if (touchOn() || director.locked || director.aiming) return;
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

  return { dispose() { clearInterval(pollTimer); } };
}
