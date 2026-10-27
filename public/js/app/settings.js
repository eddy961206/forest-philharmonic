// The visitor's preferences: kept on this device, older switches carried over.
import { normalizeDomeProjection } from '../scene/dome-projection.js';

export const DEFAULTS = {
  volume: 0.8, reverb: 0.45, quality: 'auto', shuffle: false, repeatOne: false,
  fixedEar: true, skipStageTransitions: false, applauseVol: 0.7, gap: 7, notes: true, glow: true, fireflies: true,
  fx: true, lasers: true, screen: true, interval: 3, domeProjection: 'immersive',
  // how full the house is, in per cent, for each venue: the Sphere seats
  // nearly fourteen thousand - a quarter of that is already a big crowd
  crowdHall: 45, crowdSphere: 25, crowdOutdoor: 55,
};

const KEY = 'fp-settings';

// qualities: the named presets a stored choice may be (besides auto/efficient)
export function loadSettings(storage, qualities) {
  const settings = { ...DEFAULTS };
  try { Object.assign(settings, JSON.parse(storage?.getItem(KEY) || '{}')); } catch { /* private mode */ }
  // (the old on/off switch for the audience: off is an empty house)
  if (settings.audience === false) { settings.crowdHall = 0; settings.crowdSphere = 0; settings.crowdOutdoor = 0; }
  delete settings.audience;
  // (the old on/off switch for the applause: off is none at all)
  if (settings.applause === false) settings.applauseVol = 0;
  delete settings.applause;
  settings.domeProjection = normalizeDomeProjection(settings.domeProjection);
  if (settings.quality !== 'auto' && settings.quality !== 'efficient' && !qualities.includes(settings.quality)) settings.quality = 'auto';
  return settings;
}

export function saveSettings(storage, settings) {
  try { storage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

// this venue's audience setting
export const crowdKey = ({ sphere, outdoor }) => (sphere ? 'crowdSphere' : outdoor ? 'crowdOutdoor' : 'crowdHall');
