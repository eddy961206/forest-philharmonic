// The audience: tonight's crowd, and which seats are taken.
import { IS_SPHERE, IS_OUTDOOR } from '../scene/venue.js';
import { buildAudience, planHouse } from '../scene/audience.js';
import { DEFAULTS } from './settings.js';
import { seeded } from './state.js';

export function createHouse(app) {
  const { S, settings, CROWD, graphics, scene, camera, hall, ui, avatars, thief } = app;
  const { LITE } = graphics;

  // Tonight's crowd: who comes and in what order they arrive (see planHouse),
  // drawn once per visit - the audience slider only lets more or fewer of
  // them in, so the people already seated stay put while it moves.
  // Watching together, the evening comes from the room's seed and the seats
  // that count as taken are the venue's usual house (the default share), the
  // same on every screen whatever anyone's slider says: a smaller share
  // here only draws fewer of those guests (their seats stay taken, as on a
  // phone), and a larger one is not drawn beyond them - a guest drawn in a
  // seat someone else may sit in would end up in their lap.
  let housePlan = null;
  let housePlanFor = null;
  const share = () => Math.max(0, Math.min(100, Number(settings[CROWD]) || 0)) / 100;
  const reserve = () => (S.room ? DEFAULTS[CROWD] / 100 : null);

  function seatAudience() {
    const { director } = app;
    if (S.audience) { S.audience.dispose(); S.audience = null; }
    const want = share();
    const held = reserve();
    if (want > 0 || held) {
      // (a room's evening stays on after the room is left: the same guests)
      if (!housePlan || (S.room && housePlanFor !== S.room.seed)) {
        housePlan = planHouse(hall.seats.filter((s) => !s.stage), S.room ? seeded(S.room.seed) : Math.random);
        housePlanFor = S.room ? S.room.seed : null;
      }
      const exclude = new Set();
      if (director?.seat && director.seat.index >= 0) exclude.add(director.seat.index);
      // the Sphere: thousands of guests, drawn in full only near you
      const big = IS_SPHERE ? { detail: LITE ? 80 : 220, mid: LITE ? 0 : 900, cap: LITE ? 2500 : Infinity } : {};
      const audience = buildAudience(housePlan, { share: want, reserve: held, exclude, lite: LITE, casual: IS_OUTDOOR, ...big });
      S.audience = audience;
      audience.setBudget?.(graphics.efficient() ? 0.35 : 1);
      audience.updateLOD?.(camera.position, true);
      audience.group.visible = graphics.interiorShown;
      scene.add(audience.group);
      graphics.holdQuality();
    }
    showCount();
    refreshOccupied();
  }

  // the slider's label: how many came, and the room's cap on it
  function showCount() {
    const held = reserve();
    const A = S.audience;
    ui.setCrowdCount(A ? A.count : 0, held !== null && share() > held ? Math.round(held * 100) : 0, A ? A.drawn : 0);
  }

  function refreshOccupied() {
    const { director } = app;
    if (!director) return;
    const s = new Set(S.audience ? S.audience.occupied : []);
    for (const i of avatars.occupied()) s.add(i);
    if (thief?.taken) s.add(thief.taken.index);
    director.occupied = s;
  }

  return { seatAudience, showCount, refreshOccupied };
}
