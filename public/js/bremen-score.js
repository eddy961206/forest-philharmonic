// An original miniature, "A place for four", written for this Easter egg.
// No external recording, score or additional sample download.
export const BREMEN_BEAT = 60 / 112;
export const BREMEN_DURATION = 48 * BREMEN_BEAT + 1.2;
export const BREMEN_PLAYERS = [
  { name: '당나귀', inst: 'tuba', role: '든든한 튜바', pan: -.45 },
  { name: '강아지', inst: 'clarinet', role: '다정한 클라리넷', pan: -.15 },
  { name: '고양이', inst: 'pizzicato', role: '톡톡, 피치카토', pan: .2 },
  { name: '수탉', inst: 'trumpet', role: '반짝이는 트럼펫', pan: .45 },
];

export function bremenScore() {
  const notes = [];
  const chords = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48],
    [48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48],
    [48, 52, 55], [41, 45, 48], [43, 47, 50], [48, 52, 55]];
  const melody = [[72, 76, 79, 76], [74, 71, 67, 71], [72, 76, 81, 79], [77, 76, 72, 69],
    [72, 76, 79, 84], [81, 77, 76, 72], [74, 71, 67, 74], [76, 74, 72, 72]];
  const add = (player, beat, midi, length, velocity) => notes.push({ player, midi,
    at: beat * BREMEN_BEAT, dur: length * BREMEN_BEAT, velocity });
  for (let bar = 0; bar < 12; bar++) {
    const c = chords[bar], b = bar * 4, last = bar === 11;
    add(0, b, c[0] - 12, last ? 3.8 : 1.65, .66);
    if (!last) add(0, b + 2, c[2] - 12, 1.65, .55);
    if (bar >= 1) {
      add(1, b + .04, c[1] + 12, last ? 3.7 : 1.5, .48);
      if (!last) add(1, b + 2.04, c[2] + 12, 1.5, .44);
    }
    if (bar >= 2) for (let beat = 0; beat < (last ? 1 : 4); beat++) {
      add(2, b + beat + .08, c[beat % 3] + 12, .65, .7);
    }
    if (bar >= 3) {
      const line = bar === 3 ? [67, 69, 71, 72] : melody[bar - 4];
      for (let beat = 0; beat < 4; beat++) {
        if (last && beat === 3) continue;
        add(3, b + beat + .015, line[beat], last && beat === 2 ? 1.8 : .76, .5 + (beat === 0 ? .08 : 0));
      }
    }
  }
  return notes.sort((a, b) => a.at - b.at || a.player - b.player);
}

// A small state machine shared by pointer and keyboard activation.
export function createBremenTrail(unlocked = false) {
  let steps = 0, previous = -Infinity;
  return { tap(now) {
    if (unlocked) return 4;
    if (now - previous > 6000) steps = 0;
    previous = now;
    if (++steps === 4) unlocked = true;
    return steps;
  } };
}
