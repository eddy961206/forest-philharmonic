// A setting changed in the settings panel: saved, then applied where it
// belongs (the sound, the picture, the house, the room).
import { IS_OUTDOOR } from '../scene/venue.js';
import { normalizeDomeProjection } from '../scene/dome-projection.js';
import { sameQualitySetting } from '../render-resources.js';
import { saveSettings } from './settings.js';

export function createPreferences(app) {
  const { S, settings, storage, CROWD, ui, engine, perf, hall, effects, screen, graphics } = app;
  const hostOnly = () => app.sync.hostOnly();
  const sendCmd = (c) => app.sync.sendCmd(c);

  let crowdTimer = 0;
  function onSetting(key, value) {
    if (sameQualitySetting(settings, key, value)) return;
    if (key === 'skipStageTransitions' && hostOnly()) return;
    if (key === 'domeProjection') value = normalizeDomeProjection(value);
    settings[key] = value;
    saveSettings(storage(), settings);
    if (key === 'skipStageTransitions') { app.sync.syncStageTransitions(); sendCmd({ c: 'stageTransitions', skip: !!value }); }
    if (key === 'volume') { S.muted = false; ui.setMuted(false); engine.setVolume(value); }
    if (key === 'reverb') engine.setReverb(value);
    if (key === 'applauseVol') engine.setApplause(value);
    if (key === 'quality') {
      graphics.chooseQuality(value);
      app.concert.fxFor(perf.piece);
      ui.setFps(app.loop.stats.fps, value === 'efficient' ? 'efficient' : graphics.quality);
    }
    if (key === 'domeProjection') hall.dome?.setProjection(value);
    if (key === 'fireflies') effects.setCounts(value);
    if (key === 'screen') screen.setEnabled(value && !IS_OUTDOOR);
    const fx = app.fx;
    if (key === 'lasers' && !value && fx) { fx.lasers.set(false); fx.wash.set(false); }
    if (key === 'lasers') hall.setBeams?.(value && !graphics.efficient()); // (the Sphere's moving heads)
    // the audience slider: the crowd is rebuilt once the slider rests for a
    // moment, not on every step of a drag
    if (key === CROWD) {
      clearTimeout(crowdTimer);
      crowdTimer = setTimeout(() => app.house.seatAudience(), 180);
    }
  }

  return { onSetting };
}
