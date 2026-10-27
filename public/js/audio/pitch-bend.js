// MIDI pitch-wheel curves, in score seconds and cents. Retain the current
// bend when seeking into a note, and carry it through sample crossfades.
export function bendAt(points, time) {
  let lo = 0, hi = points.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (points[m][0] <= time) lo = m + 1; else hi = m; }
  return { index: lo, value: lo ? points[lo - 1][1] : 0 };
}
export function schedulePitchBend(param, points, scoreOn, audioOn, duration) {
  if (!param || !points?.length) return;
  const { index, value } = bendAt(points, scoreOn);
  param.setValueAtTime(value, audioOn);
  for (let i = index; i < points.length && points[i][0] <= scoreOn + duration; i++) {
    // The MIDI event is authoritative; a tiny ramp avoids zipper noise.
    const t = audioOn + points[i][0] - scoreOn;
    const previous = i ? points[i - 1][1] : 0;
    param.setValueAtTime(previous, Math.max(audioOn, t - 0.004));
    param.linearRampToValueAtTime(points[i][1], t);
  }
}
