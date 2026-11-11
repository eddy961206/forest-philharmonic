import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { HALL_SETLIST, SPHERE_SETLIST, OUTDOOR_SETLIST, SETLISTS } from '../public/js/programs.js';
import { VENUES } from '../public/js/scene/venue.js';
import { SECTIONS } from '../public/js/layout.js';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root)));

test('every selectable venue has a nonempty program and outdoor scores resolve to the real catalog', async () => {
  const index = await json('public/music/index.json');
  const scores = new Map(index.map(piece => [piece.id, piece]));
  assert.deepEqual(Object.keys(SETLISTS).sort(), Object.keys(VENUES).sort());
  assert.equal(SETLISTS.outdoor, OUTDOOR_SETLIST);
  assert.notEqual(OUTDOOR_SETLIST, HALL_SETLIST);
  assert.notEqual(OUTDOOR_SETLIST, SPHERE_SETLIST);
  const assigned = new Map();
  for (const [venue, program] of Object.entries(SETLISTS)) {
    assert.ok(program.length > 0, venue);
    assert.equal(new Set(program).size, program.length, `${venue}: duplicate score`);
    for (const id of program) {
      assert.ok(!assigned.has(id), `${id}: shared by ${assigned.get(id)} and ${venue}`);
      assigned.set(id, venue);
      assert.ok(scores.has(id), `${venue}: ${id} absent from catalog`);
      const piece = await json(`public/music/${id}.json`);
      assert.equal(piece.id, id);
      assert.ok(piece.duration > 0 && piece.tracks.some(track => track.notes.length > 0), `${venue}: ${id} empty score`);
    }
  }
});

const VALID_MOODS = new Set(['calm', 'lively', 'grand']);
const UNPITCHED = new Set(['snare', 'bassDrum', 'cymbals', 'triangle', 'tambourine', 'tom']);

test('all scores have venue assignments, normalized metadata, playable ranges, and smooth sample gains', async () => {
  const [index, catalog, manifest] = await Promise.all([
    json('public/music/index.json'), json('tools/repertoire.json'), json('public/samples/manifest.json'),
  ]);
  for (const [venue, list] of Object.entries(SETLISTS)) {
    assert.ok(list.length > 0, `${venue}: empty setlist`);
  }
  const outdoorNew = catalog.filter(p => p.venue === 'outdoor');
  assert.deepEqual(new Set(outdoorNew.map(p => p.id)), new Set(OUTDOOR_SETLIST), 'every outdoor selection is an exclusive work');
  const indoor = new Set([...HALL_SETLIST, ...SPHERE_SETLIST]);
  assert.equal(indoor.size, HALL_SETLIST.length + SPHERE_SETLIST.length);
  for (const spec of outdoorNew) {
    assert.ok(!indoor.has(spec.id), `${spec.id} must not reuse an existing indoor piece`);
    assert.equal(spec.replacesExisting, undefined);
  }
  const ids = [...new Set(Object.values(SETLISTS).flat())];
  assert.equal(index.length, ids.length);
  assert.deepEqual(new Set(index.map(p => p.id)), new Set(ids));
  const catalogIds = new Set(catalog.map(p => p.id));
  assert.equal(catalogIds.size, catalog.length);
  for (const spec of catalog) {
    const file = await readFile(new URL(`tools/scores/${spec.file}`, root));
    assert.equal(createHash('sha256').update(file).digest('hex'), spec.source.sha256, spec.id);
    assert.ok(spec.source.url && spec.source.license, spec.id);
    assert.ok(spec.source.licenseUrl || spec.source.license === 'NOASSERTION', spec.id);
    assert.ok(SETLISTS[spec.venue]?.includes(spec.id), spec.id);
    assert.ok(VALID_MOODS.has(spec.mood), `${spec.id}: invalid catalog mood ${spec.mood}`);
  }
  const sampleBounds = Object.fromEntries(
    Object.entries(manifest).map(([inst, samples]) => {
      const midis = Object.keys(samples).map(Number).sort((a, b) => a - b);
      return [inst, [midis[0], midis[midis.length - 1]]];
    }),
  );
  const byId = new Map(index.map(p => [p.id, p]));
  for (const venue of ['hall', 'outdoor']) {
    const hasLullaby = SETLISTS[venue].some(id => {
      const p = byId.get(id);
      return p?.mood === 'calm' && p?.ensembleKo === '피아노';
    });
    assert.ok(hasLullaby, `${venue}: missing calm solo piano lullaby candidate`);
  }
  for (const item of index) {
    assert.ok(VALID_MOODS.has(item.mood), `${item.id}: invalid index mood ${item.mood}`);
    const piece = await json(`public/music/${item.id}.json`);
    assert.equal(piece.id, item.id);
    assert.equal(piece.mood, item.mood, `${item.id}: mood mismatch`);
    assert.equal(piece.ensembleKo, item.ensembleKo, `${item.id}: ensembleKo mismatch`);
    if (piece.tracks.every(t => t.inst === 'piano') && piece.tracks.length <= 2) {
      assert.equal(piece.ensembleKo, '피아노', `${item.id}: solo piano must use canonical ensembleKo`);
    }
    assert.ok(piece.duration > 0 && Number.isFinite(piece.duration), item.id);
    assert.ok(piece.tracks.length > 0 && piece.beats.length > 0, item.id);
    assert.equal(piece.duration, item.duration, item.id);
    for (const tr of piece.tracks) {
      assert.ok(SECTIONS[tr.section], `${item.id}: ${tr.section}`);
      if (tr.chairs) {
        for (const c of tr.chairs) {
          assert.ok(Number.isInteger(c) && c >= 0 && c < SECTIONS[tr.section].chairs.length, `${item.id}: invalid chair ${c} for ${tr.section}`);
        }
      }
      assert.ok(manifest[tr.inst] && Object.keys(manifest[tr.inst]).length, `${item.id}: ${tr.inst}`);
      assert.ok(tr.notes.length > 0 && tr.notes.length % 4 === 0, `${item.id}: note layout`);
      const [minSample, maxSample] = sampleBounds[tr.inst];
      let previous = -1;
      for (let i = 0; i < tr.notes.length; i += 4) {
        const [on, dur, midi, vel] = tr.notes.slice(i, i + 4);
        assert.ok(Number.isFinite(on) && on >= previous && on >= 0, `${item.id}: onset`);
        assert.ok(Number.isFinite(dur) && dur > 0 && on + dur <= piece.duration + 0.01, `${item.id}: duration`);
        assert.ok(Number.isInteger(midi) && midi >= 0 && midi <= 127, `${item.id}: pitch`);
        if (!UNPITCHED.has(tr.inst)) {
          assert.ok(
            midi >= minSample - 6 && midi <= maxSample + 6,
            `${item.id} (${tr.section}/${tr.inst}): midi ${midi} outside [${minSample - 6}..${maxSample + 6}]`,
          );
        }
        assert.ok(Number.isFinite(vel) && vel >= 5 && vel <= 127, `${item.id}: velocity ${vel}`);
        previous = on;
      }
    }
  }
  for (const [inst, samples] of Object.entries(manifest)) {
    const entries = Object.entries(samples).sort((a, b) => Number(a[0]) - Number(b[0]));
    for (let i = 0; i < entries.length; i++) {
      const [note, meta] = entries[i];
      assert.ok(meta.g > 0 && meta.g <= 6, `${inst}/${note}: invalid sample gain ${meta.g}`);
      if (i > 0) {
        const stepDb = Math.abs(20 * Math.log10(meta.g / entries[i - 1][1].g));
        assert.ok(stepDb <= 3.1, `${inst} ${entries[i - 1][0]}->${note}: gain step ${stepDb.toFixed(2)} dB > 3.1 dB`);
      }
      const file = await stat(new URL(`public/samples/${inst}/${note}.mp3`, root));
      assert.ok(file.size > 100, `${inst}/${note}.mp3`);
    }
  }
});
