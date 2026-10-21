// The interval: life between the halves. Nothing new is built for it - the
// players who are off stage anyway step out: the first cellist (곰돌, a bear)
// practises a few bars of the coming half on an ottoman in the foyer, the
// violist (라쿤, a raccoon) slips into the seat you left. One sheet of paper
// on the foyer wall carries the musicians' news.
import * as THREE from 'three';
import { SECTIONS, CAST } from '../layout.js';
import { SPECIES_KO, josa } from '../evening.js';

// ------------------------------------------------------------- practising
// A phrase from a real part, played again and again the way people
// practise: through, a pause, the hard bars twice more, stopping short.
export class Practice {
  constructor(engine) {
    this.engine = engine;
    this.events = [];
    this.st = { active: [], strokes: 0, lastOn: -99, lastDur: 0, lastMidi: 50, lastVel: 64, nextOn: 99999, playing: false, energy: 0 };
    this.on = false;
    this._off = null;
  }

  // piece: a score with a cello part (or any part of `sid`); section: where it sounds from
  start(piece, { sid = 'vc', ci = 0, section = 'vc', inst = null, seed = 1 } = {}) {
    this.stop();
    const tr = piece?.tracks.find((t) => t.section === sid && (!t.chairs || t.chairs.includes(ci)));
    if (!tr) return false;
    const n = tr.notes;
    const notes = [];
    for (let i = 0; i < n.length; i += 4) notes.push([n[i], n[i + 1], n[i + 2], n[i + 3]]);
    if (notes.length < 6) return false;
    // the busiest dozen seconds of the part
    let best = 0;
    let bestN = 0;
    for (let i = 0; i < notes.length; i++) {
      let k = i;
      while (k < notes.length && notes[k][0] < notes[i][0] + 11) k++;
      if (k - i > bestN) { bestN = k - i; best = i; }
    }
    const t0 = notes[best][0];
    const phrase = notes.slice(best, best + bestN).map(([on, dur, midi, vel]) => [on - t0, Math.min(dur, 2.4), midi, vel]);
    const len = phrase[phrase.length - 1][0] + phrase[phrase.length - 1][1];
    let r = seed >>> 0;
    const rand = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    // takes, enough for the longest interval
    const ev = [];
    let at = 0.6;
    while (at < 360) {
      const kind = rand();
      if (kind < 0.55) {
        // through (sometimes stopping short)
        const stop = rand() < 0.3 ? len * (0.5 + rand() * 0.3) : len;
        for (const [on, dur, midi, vel] of phrase) if (on < stop) ev.push([at + on, dur, midi, vel]);
        at += stop + 2.5 + rand() * 3;
      } else {
        // the hard bars: the last third, twice, a little slower the first time
        const from = len * 0.62;
        for (const slow of [1.15, 1]) {
          for (const [on, dur, midi, vel] of phrase) if (on >= from) ev.push([at + (on - from) * slow, dur * slow, midi, vel]);
          at += (len - from) * slow + 1.2 + rand();
        }
        at += 2;
      }
    }
    this.events = ev;
    this.section = section;
    this.inst = inst || tr.inst;
    this.t0 = this.engine.now + 0.3;
    this.sched = 0;
    this.vis = 0;
    this.on = true;
    this._off = this.engine.onTick(() => this._schedule());
    return true;
  }

  stop() {
    this.on = false;
    if (this._off) this._off();
    this._off = null;
    this.st.playing = false;
    this.st.active = [];
  }

  get t() { return this.engine.now - this.t0; }

  _schedule() {
    if (!this.on) return;
    const e = this.engine;
    const horizon = this.t + 0.35;
    while (this.sched < this.events.length && this.events[this.sched][0] < horizon) {
      const [on, dur, midi, vel] = this.events[this.sched++];
      e.playNote({ section: this.section, inst: this.inst, midi, vel: vel * 0.9, when: this.t0 + on, dur, gain: 0.85 });
    }
  }

  // what the player is doing now, for the rig (orchestra.update's practice)
  frame(key) {
    const t = this.t;
    const st = this.st;
    while (this.vis < this.events.length && this.events[this.vis][0] <= t) {
      const [on, dur, midi, vel] = this.events[this.vis++];
      st.active.push(on + dur);
      if (on - st.lastOn > 0.035) st.strokes++;
      st.lastOn = on;
      st.lastDur = dur;
      st.lastMidi = midi;
      st.lastVel = vel;
    }
    st.active = st.active.filter((off) => off > t);
    st.playing = st.active.length > 0;
    st.nextOn = this.vis < this.events.length ? this.events[this.vis][0] : 99999;
    st.energy += ((st.playing ? st.lastVel / 127 : 0) - st.energy) * 0.12;
    return { key, t, st };
  }
}

// ------------------------------------------------------------ the thief
// The seat you leave in the interval may not stay empty. Only on your
// screen; a cookie gets it back.
export class SeatThief {
  constructor(stage, key = 'va:0') {
    this.stage = stage;
    this.key = key;
    this.seat = null;
    this.w = null;
    this.leaving = 0;
  }

  get name() { const [sid, ci] = this.key.split(':'); return CAST[sid][Number(ci)].name; }
  get taken() { return this.w ? this.seat : null; }

  // the seat that was yours when the interval began (or null)
  arm(seat, chance) {
    this.clear();
    this.seat = seat && seat.index >= 0 && chance ? seat : null;
  }

  // you: { x, z } on the floor; away: far enough not to see it happen
  update(dt, you, away) {
    if (this.seat && !this.w && away && Math.hypot(you.x - this.seat.x, you.z - this.seat.z) > 7) {
      const s = this.seat;
      this.w = this.stage.borrow(this.key, { x: s.x, y: s.y, z: s.z }, s.yaw);
      if (!this.w) this.seat = null;
    }
    if (this.w && this.leaving > 0) {
      // up, a little bow, and away to the wings
      this.leaving += dt;
      const k = Math.min(1, this.leaving / 0.7);
      this.w.char.setStanding(k);
      this.w.char.body.rotation.x = -0.5 * Math.sin(Math.min(1, Math.max(0, (this.leaving - 0.7) / 0.9)) * Math.PI);
      if (this.leaving > 1.9) this.clear();
    }
    return !!this.w && !this.leaving && Math.hypot(you.x - this.seat.x, you.z - this.seat.z) < 1.8;
  }

  shoo() { if (this.w && !this.leaving) this.leaving = 0.001; }

  clear() {
    if (this.w) { this.w.char.body.rotation.x = 0; this.stage.giveBack(this.w); }
    this.w = null;
    this.seat = null;
    this.leaving = 0;
  }
}

// ---------------------------------------------------------- the news
// A few lines for the foyer's notice board, from tonight's programme and
// rosters. week: a number that changes once a week (the standing items).
const FACTS = [
  ['harp', '하프 사슴은 공연 전에 줄 마흔일곱 개를 하나하나 다 튕겨 본대요.'],
  ['timp', '팀파니 둥둥은 북 가죽에 귀를 대고 음을 맞춰요. 그래서 귀가 늘 반짝반짝해요.'],
  ['ob', '오보에 시바가 내는 A음에 모두가 음을 맞춰요. 시바는 그 순간을 제일 좋아한대요.'],
  ['cb', '콘트라베이스 큰곰은 악기를 등에 업고 숲을 건너 출근해요.'],
  ['fl', '플루트 하양은 연주 전에 꼭 따뜻한 물 한 모금을 마셔요.'],
  ['bn', '바순 밤송은 가시가 리드에 걸리지 않게 늘 조심조심 악기를 쥐어요.'],
  ['tp', '트럼펫 불꽃은 늘 객석 맨 뒷줄을 보고 불어요. 거기까지 닿아야 한대요.'],
  ['piano', '피아노 쇼팽은 공연이 끝나면 건반 하나하나에 인사를 하고 뚜껑을 닫아요.'],
  ['choir', '합창단 열두 명은 무대에 오르기 전에 다 같이 꼬리를 한 번씩 흔들어요.'],
  ['va', '비올라 라쿤은 빈 의자만 보면 앉아 보고 싶어 해요. 도토리 쿠키를 아주 좋아한대요.'],
];
const who = (sid, ci = 0) => {
  const c = CAST[sid]?.[ci];
  return c ? `${SECTIONS[sid].ko} ${c.name}(${SPECIES_KO[c.species] || c.species})` : SECTIONS[sid]?.ko || sid;
};

// evening: [{ meta, roster:Set, kind }] for the pieces still to come (the
// next half first); practiser: 'vc:0' or null
export function noticeLines({ coming = [], practiser = null, week = 0 }) {
  const out = [];
  const next = coming[0];
  if (next) {
    const n = next.roster.size;
    const how = next.kind === 'solo' ? `${who([...next.roster][0].split(':')[0])} 혼자 무대에 올라요` : next.kind === 'chamber' ? `${n}명이 함께 연주해요` : `부엉 선생님의 지휘로 ${n}명이 무대를 채워요`;
    out.push({ title: '2부 첫 곡', text: `「${next.meta.titleKo}」 — ${next.meta.composerKo}. ${how}.` });
  }
  const solos = coming.filter((c) => c.kind === 'solo').length;
  if (solos > 1) out.push({ title: '오늘의 독주', text: `남은 곡 가운데 ${solos}곡은 ${who('piano')}의 독주예요. 무대 위 조명이 피아노 한 대에만 모여요.` });
  if (coming.some((c) => [...c.roster].some((k) => k.startsWith('choir:')))) out.push({ title: '합창단', text: '합창단 열두 명이 2부에 다시 무대에 서요. 소프라노부터 베이스까지, 자리마다 다른 목소리가 들려요.' });
  if (practiser) {
    const [sid, ci] = practiser.split(':');
    const c = CAST[sid][Number(ci)];
    out.push({ title: '막간 연습', text: `${SECTIONS[sid].ko} ${josa(c.name, '이', '가')} 로비 소파에서 다음 곡을 연습하고 있어요. 지나가다 들어 보세요.` });
  }
  const pick = FACTS[week % FACTS.length];
  const pick2 = FACTS[(week * 7 + 3) % FACTS.length];
  out.push({ title: '단원 이야기', text: pick[1] });
  if (pick2 !== pick) out.push({ title: '단원 이야기', text: pick2[1] });
  return out;
}

// the board itself: one sheet on the foyer wall (one draw)
export function buildNoticeBoard(parent, pos, yaw = 0) {
  const W = 256;
  const H = 320;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#5a3a22';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#efe4c8';
  g.fillRect(12, 12, W - 24, H - 24);
  g.fillStyle = '#3b2a1a';
  g.font = '700 30px "Gowun Batang", serif';
  g.textAlign = 'center';
  g.fillText('숲속 소식', W / 2, 58);
  g.strokeStyle = 'rgba(60, 42, 26, 0.55)';
  g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const y = 92 + i * 22;
    g.beginPath();
    g.moveTo(34, y);
    g.lineTo(W - 34 - ((i * 37) % 60), y);
    g.stroke();
  }
  // a pinned leaf
  g.fillStyle = '#5f8f5c';
  g.beginPath();
  g.ellipse(W - 52, H - 52, 16, 28, 0.6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#b8322a';
  g.beginPath();
  g.arc(W / 2, 22, 6, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 1.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  mesh.position.copy(pos);
  mesh.rotation.y = yaw;
  mesh.name = 'noticeBoard';
  parent.add(mesh);
  return mesh;
}
