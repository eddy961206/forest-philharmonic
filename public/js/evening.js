// The shape of an evening: how each kind of piece begins and ends, the
// spotlight for a recital, and the leaf programme you take home - what you
// heard, where you sat, who was with you. Nothing here draws much: the light
// is the stage's own key light turned and narrowed, the programme is a page.
import * as THREE from 'three';
import { SECTIONS, sectionCenter, CAST } from './layout.js';

// ------------------------------------------------------------- the grammar
// solo      one player, a recital: no tuning, the key light gathers on them,
//           a held silence after a quiet ending, no lasers and no confetti
// chamber   a few players without a conductor: rise and bow together
// orchestra conducted, or many: the oboe's A, the conductor, the full show
export function ensembleOf(piece, roster) {
  const n = roster.size;
  if (n <= 1) return 'solo';
  if (!piece?.conducted && n <= 8) return 'chamber';
  return 'orchestra';
}

// hush: seconds of stillness before the first note (only at the evening's
// big moments - the start, after the interval, the encore); after: seconds
// of silence held after a quiet ending, before anyone claps
export const GRAMMAR = {
  solo: { hush: 2.4, after: 1.9, house: 0.05, lasers: false, confetti: false },
  chamber: { hush: 1.8, after: 1.2, house: 0.1, lasers: false, confetti: false },
  orchestra: { hush: 2.6, after: 0.6, house: 0.12, lasers: true, confetti: true },
};

// ------------------------------------------------------------ the spotlight
// The venue's key light gathers on a soloist while the fills, the back light
// and the room's reflections fall away: only the angle, the softness, the
// aim and strengths change - never the number of lights, so no shader is
// ever rebuilt.
export class Spotlight {
  constructor(lights, scene) {
    this.key = lights.key;
    this.scene = scene;
    this.env0 = scene.environmentIntensity;
    this.fills = [...(lights.fills || []), ...(lights.rim ? [lights.rim] : [])];
    this.a0 = this.key.angle;
    this.p0 = this.key.penumbra;
    this.t0 = this.key.target.position.clone();
    this.f0 = this.fills.map((f) => f.intensity);
    this.aim = this.t0.clone();
    this.k = 0;
    this.want = 0;
  }

  // pos: a point on the stage, or null for the whole stage again
  set(pos) {
    if (pos) { this.aim.set(pos.x, pos.y, pos.z); this.want = 1; } else this.want = 0;
  }

  update(dt) {
    if (this.k === this.want && (this.k === 0 || this._at)) return;
    this.k += (this.want - this.k) * Math.min(1, dt * 1.1);
    if (Math.abs(this.k - this.want) < 0.002) this.k = this.want;
    const k = this.k;
    this.key.angle = this.a0 + (0.17 - this.a0) * k;
    this.key.penumbra = this.p0 + (0.95 - this.p0) * k;
    this.key.target.position.lerpVectors(this.t0, this.aim, k);
    this.key.target.updateMatrixWorld();
    this.fills.forEach((f, i) => { f.intensity = this.f0[i] * (1 - 0.78 * k); });
    this.scene.environmentIntensity = this.env0 * (1 - 0.62 * k);
    this._at = this.k === this.want;
  }
}

// where the players of a roster are (their middle), for the spotlight
export function rosterCentre(roster) {
  const p = new THREE.Vector3();
  let n = 0;
  for (const key of roster) {
    const [sid, ci] = key.split(':');
    const c = SECTIONS[sid]?.chairs[Number(ci)];
    if (!c) continue;
    // the piano: light the keyboard and the player, not the bench
    p.x += c.x + (sid === 'piano' ? 0.55 : 0);
    p.y += c.y;
    p.z += c.z;
    n++;
  }
  return n ? p.multiplyScalar(1 / n) : null;
}

// ------------------------------------------------------- the leaf programme
const WORLD_KO = {
  ARCH: '돔의 아치', STARS: '별밤', AURORA: '오로라', MOON: '달빛', FOREST: '숲', OCEAN: '바다', SUNSET: '노을',
  CATHEDRAL: '대성당', GOLD: '황금빛', FIREWORKS: '불꽃놀이', RAIN: '비', SNOW: '눈', SPRING: '봄', DECO: '아르데코',
  NEBULA: '성운', VOYAGE: '우주 항해', FOREST3D: '오래된 숲', OCEAN3D: '다시마 숲 바닷속', CLOUDS3D: '노을 구름바다', PEAKS3D: '오로라 설산',
};
export const SPECIES_KO = {
  rabbit: '토끼', cat: '고양이', squirrel: '다람쥐', fox: '여우', sheep: '양', mouse: '생쥐', raccoon: '너구리', deer: '사슴',
  bear: '곰', panda: '판다', hedgehog: '고슴도치', koala: '코알라', lion: '사자', dog: '강아지', owl: '부엉이',
};
const LEAF_KEY = 'fp-leaves';
const LEAF_MAX = 20;

// One evening, as you lived it. Counted once a second (see tick) and kept
// on this device only.
export class Leaf {
  constructor(venue) {
    this.venue = venue;
    this.started = Date.now();
    this.pieces = []; // { title, composer }
    this.seats = new Map(); // seat label -> seconds while the music played
    this.near = new Map(); // section -> seconds close to it while it played
    this.levels = new Map(); // floor -> seconds
    this.cinema = 0;
    this.listened = 0;
    this.people = new Set();
    this.worlds = [];
    this._piece = { id: null, heard: 0 };
  }

  // ctx: { playing, piece, seat (label or null), level (floor name), ear ({x,y,z}), cinema, people: [names] }
  tick(ctx) {
    for (const n of ctx.people || []) this.people.add(n);
    if (!ctx.playing || !ctx.piece) return;
    this.listened++;
    if (this._piece.id !== ctx.piece.id) this._piece = { id: ctx.piece.id, heard: 0 };
    this._piece.heard++;
    if (ctx.seat) this.seats.set(ctx.seat, (this.seats.get(ctx.seat) || 0) + 1);
    if (ctx.level) this.levels.set(ctx.level, (this.levels.get(ctx.level) || 0) + 1);
    if (ctx.cinema) this.cinema++;
    // the nearest section within a few steps, among those playing
    let best = null;
    let bestD = 4.2;
    for (const sid of ctx.sections || []) {
      if (!SECTIONS[sid]) continue;
      const c = sectionCenter(sid);
      const d = Math.hypot(c.x - ctx.ear.x, c.y - ctx.ear.y, c.z - ctx.ear.z);
      if (d < bestD) { bestD = d; best = sid; }
    }
    if (best) this.near.set(best, (this.near.get(best) || 0) + 1);
  }

  // a piece is over: it counts if you heard most of it
  ended(piece, worlds = null) {
    if (!piece) return;
    const heard = this._piece.id === piece.id ? this._piece.heard : 0;
    this._piece = { id: null, heard: 0 };
    if (heard < Math.min(40, piece.duration * 0.5)) return;
    this.pieces.push({ title: piece.titleKo, composer: piece.composerKo });
    for (const w of worlds || []) {
      const ko = WORLD_KO[w];
      if (ko && !this.worlds.includes(ko)) this.worlds.push(ko);
    }
  }

  get worthKeeping() { return this.pieces.length > 0; }

  // the card's contents
  card() {
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    const seat = top(this.seats);
    const near = top(this.near);
    const level = top(this.levels);
    let line = '';
    if (near && near[1] > 45) {
      const sid = near[0];
      const who = CAST[sid]?.[0];
      line = `오늘은 ${SECTIONS[sid].ko}${who ? ` ${who.name}` : ''} 곁에서 오래 머물렀어요.`;
    } else if (this.cinema > this.listened * 0.6 && this.listened > 60) {
      line = '오늘은 편하게 보기로 무대를 따라다니며 들었어요.';
    } else if (level && level[0] === '4층' && level[1] > 60) {
      line = '오늘은 가장 높은 4층에서 홀 전체를 내려다봤어요.';
    } else if (seat && seat[1] > 60) {
      line = `오늘은 ${seat[0]}에서 들었어요.`;
    } else if (this.listened > 0) {
      line = '오늘은 이곳저곳을 거닐며 들었어요.';
    }
    const d = new Date(this.started);
    return {
      date: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`,
      night: d.getHours() >= 18 || d.getHours() < 5 ? '밤' : d.getHours() < 12 ? '아침' : '낮',
      venue: this.venue,
      pieces: this.pieces.slice(),
      seat: seat && seat[1] > 20 ? seat[0] : null,
      line,
      people: [...this.people].slice(0, 8),
      worlds: this.worlds.slice(0, 4),
      minutes: Math.round(this.listened / 60),
      at: this.started,
    };
  }

  // keep it (once per evening; a later save of the same evening replaces it)
  save() {
    if (!this.worthKeeping) return;
    const list = Leaf.history().filter((c) => c.at !== this.started);
    list.unshift(this.card());
    try { localStorage.setItem(LEAF_KEY, JSON.stringify(list.slice(0, LEAF_MAX))); } catch { /* private mode */ }
  }

  static history() {
    try { return JSON.parse(localStorage.getItem(LEAF_KEY) || '[]').filter((c) => c && c.at); } catch { return []; }
  }
}
