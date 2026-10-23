import test from 'node:test';
import assert from 'node:assert/strict';
import { CinemaProgram } from '../public/js/scene/cinema-program.js';
import { Director } from '../public/js/scene/director.js';
const track = (section, chairs, notes = [0, 300, 60, 90]) => ({ section, chairs, notes });

test('camera covers eligible sections and individual chairs without energy starving quieter players', () => {
  const p = { tracks: [track('vn1'), track('fl', [0], [0, 300, 72, 30]), track('tb', [1])] };
  const c = new CinemaProgram(), shots = Array.from({ length: 18 }, (_, i) => c.choose(p, i));
  const sections = Object.fromEntries(['vn1', 'fl', 'tb'].map(id => [id, shots.filter(s => s.sid === id).length]));
  assert.deepEqual(sections, { vn1: 6, fl: 6, tb: 6 });
  assert.deepEqual(shots.filter(s => s.sid === 'vn1').map(s => s.ci), [0, 1, 2, 0, 1, 2]);
  assert(shots.filter(s => s.sid === 'tb').every(s => s.ci === 1));
});
test('camera includes sustained notes and imminent entrances, excludes silence, zero velocity and unknown rigs', () => {
  const c = new CinemaProgram();
  const p = { tracks: [track('fl', [0], [0, 10, 60, 70]), track('tb', [0], [9, 1, 70, 90]), track('ob', [0], [0, 100, 60, 0]), track('unknown', [0])] };
  assert.deepEqual(c.active(p, 8).map(x => x.sid).sort(), ['fl', 'tb']);
  assert.equal(c.choose(p, 20), null);
  assert.equal(c.active(p, 10.34).length, 2);
  assert.equal(c.active(p, 10.36).length, 0);
});
test('selection fairness resets when seeking backwards or changing piece', () => {
  const c = new CinemaProgram(), p = { tracks: [track('vn1')] };
  assert.equal(c.choose(p, 20).ci, 0); assert.equal(c.choose(p, 30).ci, 1);
  assert.equal(c.choose(p, 0).ci, 0);
  assert.equal(c.choose({ tracks: [track('vn1')] }, 40).ci, 0);
});
test('cinema edits alternate space, performers, audience angles and conductor with bounded holds', () => {
  const director = { cine: {} }, piece = { conducted: true, tracks: [track('vn1'), track('fl', [0])] };
  const perf = { piece, playing: true };
  const shots = Array.from({ length: 14 }, (_, i) => Director.prototype._pickShot.call(director, { perf, time: i * 10, phase: 'playing', obstacles: [] }));
  for (const s of shots) {
    assert(s.hold >= 8 && s.hold <= 12);
    assert([...s.pos.toArray(), ...s.look.toArray(), s.fov].every(Number.isFinite));
  }
  assert.equal(shots.filter(s => s.kind === 'section').length, 8);
  assert.equal(shots.filter(s => s.kind === 'audience').length, 2);
  assert.equal(shots.filter(s => s.kind === 'conductor').length, 2);
  assert(shots.filter(s => s.kind === 'section').every(s => ['vn1', 'fl'].includes(s.sid)));
});

test('a solo performer receives different repeat views even with a constant random source', () => {
  const random = Math.random; Math.random = () => 0;
  try {
    const director = { cine: {} }, perf = { playing: true, piece: { conducted: false, tracks: [track('piano', [0])] } };
    const shots = Array.from({ length: 14 }, (_, i) => Director.prototype._pickShot.call(director, { perf, time: i * 10, phase: 'playing', obstacles: [] })).filter(s => s.sid);
    assert(shots.length >= 8);
    assert(shots.every(s => s.sid === 'piano'));
    for (let i = 1; i < shots.length; i++) assert.notEqual(shots[i].angle, shots[i - 1].angle);
    assert(new Set(shots.map(s => s.pos.toArray().join(','))).size >= 2);
  } finally { Math.random = random; }
});

test('portrait framing raises performer views without changing landscape composition', () => {
  const random = Math.random; Math.random = () => 0;
  try {
    const perf = { playing: true, piece: { tracks: [track('vn1')] } };
    const shot = aspect => {
      const director = { cine: {}, camera: { aspect } };
      Director.prototype._pickShot.call(director, { perf, time: 0, phase: 'playing' });
      return Director.prototype._pickShot.call(director, { perf, time: 12, phase: 'playing' });
    };
    const landscape = shot(1.5), portrait = shot(.5);
    assert.equal(landscape.sid, portrait.sid);
    assert.ok(Math.abs(portrait.pos.y - landscape.pos.y - .65) < 1e-9);
    assert.equal(portrait.pos.x, landscape.pos.x);
    assert.equal(portrait.pos.z, landscape.pos.z);
  } finally { Math.random = random; }
});
