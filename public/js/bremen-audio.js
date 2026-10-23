import { BREMEN_PLAYERS, bremenScore } from './bremen-score.js';

// Uses the already decoded orchestra samples and the user's master volume.
// The short voices are scheduled once, on the audio clock, without a timer.
export function playBremen(engine) {
  const ctx = engine.ctx, bus = ctx.createGain(), voices = new Set();
  const t0 = ctx.currentTime + .08;
  bus.gain.value = 3;
  bus.connect(engine.master);
  const missing = [];
  const pan = BREMEN_PLAYERS.map(p => {
    const n = ctx.createStereoPanner(); n.pan.value = p.pan; n.connect(bus); return n;
  });
  for (const note of bremenScore()) {
    const player = BREMEN_PLAYERS[note.player], sample = engine._nearest(player.inst, note.midi);
    if (!sample) { if (!missing.includes(player.inst)) missing.push(player.inst); continue; }
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = sample.buf;
    const rate = Math.pow(2, (note.midi - sample.root) / 12);
    src.playbackRate.value = rate;
    const at = t0 + note.at, attack = player.inst === 'pizzicato' ? .006 : .04;
    const available = Math.max(.01, (sample.buf.duration - sample.meta.s) / rate);
    const duration = Math.min(note.dur, Math.max(.02, available - .08));
    const level = .32 * note.velocity * Math.min(4, sample.meta.g);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + Math.min(attack, duration / 2));
    gain.gain.setValueAtTime(level * .88, at + duration);
    gain.gain.linearRampToValueAtTime(0, at + duration + .08);
    src.connect(gain).connect(pan[note.player]);
    const voice = { src, gain }; voices.add(voice);
    src.onended = () => { src.disconnect(); gain.disconnect(); voices.delete(voice); };
    src.start(at, sample.meta.s); src.stop(at + duration + .1);
  }
  let stopped = false;
  return { start: t0, missing, get activeVoices() { return voices.size; }, stop() {
    if (stopped) return; stopped = true;
    for (const { src, gain } of voices) {
      src.onended = null;
      try { src.stop(); } catch { /* already ended */ }
      src.disconnect(); gain.disconnect();
    }
    voices.clear(); pan.forEach(n => n.disconnect()); bus.disconnect();
  } };
}
