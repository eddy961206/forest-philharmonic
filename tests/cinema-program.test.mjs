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
    assert(new Set(shots.map(s => s.pos.toArray().join(','))).size >= 5);
    assert.equal(new Set(shots.filter(s => s.view).map(s => s.view)).size, 3);
    for (const shot of shots.filter(s => s.view)) {
      assert(shot.look.z > shot.pos.z);
      assert(shot.cut);
    }
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


test('sounding players precede silent release tails and imminent entrances', () => {
  const c = new CinemaProgram();
  const p = { tracks: [track('vn1', [0], [0, 10, 60, 100]), track('fl', [0], [9, 20, 72, 30]), track('tb', [0], [11, 5, 60, 100]), { ...track('ob', [0]), gain: 0 }] };
  assert.equal(c.choose(p, 10.2).sid, 'fl');
  assert(!c.active(p, 10.2).some(s => s.sid === 'ob'));
});

test('dense accompaniment cannot outvote a melodic line through note count', () => {
  const p = { tracks: [
    { ...track('vn1', [0], [0, 20, 72, 80]), gain: .8 },
    { ...track('piano', [0], [0, 20, 48, 100, 0, 20, 52, 100, 0, 20, 55, 100]), gain: .4 },
  ] };
  const c = new CinemaProgram();
  assert.equal(c.choose(p, 1).sid, 'vn1');
  assert.equal(c.choose(p, 2).sid, 'piano'); // quieter parts still get their turn
});

test('small ensembles and quiet portraits breathe for ten to twelve seconds', () => {
  const random = Math.random; Math.random = () => 0;
  try {
    for (const tracks of [[track('piano', [0])], ['vn1', 'fl', 'ob', 'vc'].map(id => track(id, [0], [0, 300, 60, 30]))]) {
      const director = { cine: {} }, perf = { playing: true, piece: { tracks, beats: [[11, 0], [22, 0]] } };
      const shots = Array.from({ length: 7 }, (_, i) => Director.prototype._pickShot.call(director, { perf, time: i * 11, phase: 'playing' }));
      assert(shots.some(s => s.kind === 'section'));
      assert(shots.every(s => s.hold >= 10 && s.hold <= 12));
    }
  } finally { Math.random = random; }
});

test('a clear starting position cannot drift into a nearby head', () => {
  const random = Math.random; Math.random = () => 0;
  try {
    const perf = { playing: true, piece: { tracks: [track('vn1', [0])] } };
    const pick = obstacles => {
      const director = { cine: {}, camera: { aspect: 1.5 } };
      Director.prototype._pickShot.call(director, { perf, time: 0, phase: 'playing' });
      return Director.prototype._pickShot.call(director, { perf, time: 12, phase: 'playing', obstacles });
    };
    const initial = pick([]);
    const head = initial.pos.clone().addScaledVector(initial.drift.clone().normalize(), initial.drift.length() + .8);
    assert(initial.pos.distanceTo(head) > .95);
    const protectedShot = pick([head]);
    assert(protectedShot.pos.distanceTo(initial.pos) < 1e-9);
    assert(protectedShot.drift.length() < initial.drift.length());
    for (const u of [0, .25, .5, .75, 1]) assert(protectedShot.pos.clone().addScaledVector(protectedShot.drift, u).distanceTo(head) >= .95);
  } finally { Math.random = random; }
});


test('rear compositions stay inside the stage shell and outside fixed instruments', async () => {
  const THREE = await import('three');
  const { insideShell, HALL } = await import('../public/js/scene/hallplan.js');
  const { SECTIONS } = await import('../public/js/layout.js');
  const random = Math.random; Math.random = () => 0;
  try {
    for (const sid of Object.keys(SECTIONS)) {
      const perf = { playing: true, piece: { tracks: [track(sid, [0], [0, 1000, 60, 90])] } };
      const director = { cine: {}, camera: { aspect: .5 } };
      const instrument = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshBasicMaterial());
      const chair = SECTIONS[sid].chairs[0];
      instrument.position.set(chair.x, chair.y + 1, chair.z - 2);
      const box = new THREE.Box3().setFromObject(instrument).expandByScalar(.25);
      const shots = Array.from({ length: 28 }, (_, i) => Director.prototype._pickShot.call(director,
        { perf, time: i * 10, phase: 'playing', cameraInstruments: [instrument] }));
      for (const shot of shots.filter(s => s.view)) {
        assert(shot.look.z > shot.pos.z, sid);
        for (const u of [0, .25, .5, .75, 1]) {
          const pos = shot.pos.clone().addScaledVector(shot.drift, u);
          assert(insideShell(pos.x, pos.z, .45), sid);
          assert(pos.z >= HALL.front + .65 && pos.y <= 6.8, sid);
          assert(!box.containsPoint(pos), sid);
        }
      }
    }
  } finally { Math.random = random; }
});
