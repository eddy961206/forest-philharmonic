import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { HALL_SETLIST, SPHERE_SETLIST } from '../public/js/programs.js';
import { SECTIONS } from '../public/js/layout.js';

const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root)));

test('82 scores have unique venue assignments, metadata, notes and sample files', async () => {
  const [index, catalog, manifest] = await Promise.all([
    json('public/music/index.json'), json('tools/repertoire.json'), json('public/samples/manifest.json'),
  ]);
  assert.equal(HALL_SETLIST.length, 41);
  assert.equal(SPHERE_SETLIST.length, 41);
  assert.equal(index.length, 82);
  assert.equal(catalog.filter(p => !p.replacesExisting).length, 30);
  assert.equal(catalog.filter(p => p.replacesExisting).length, 1);
  const ids = [...HALL_SETLIST, ...SPHERE_SETLIST];
  assert.equal(new Set(ids).size, 82);
  assert.deepEqual(new Set(index.map(p => p.id)), new Set(ids));
  assert.equal(catalog.filter(p => p.venue === 'hall' && !p.replacesExisting).length, 15);
  assert.equal(catalog.filter(p => p.venue === 'sphere' && !p.replacesExisting).length, 15);
  const catalogIds = new Set(catalog.map(p => p.id));
  assert.equal(catalogIds.size, 31);
  for (const spec of catalog) {
    const file = await readFile(new URL(`tools/scores/${spec.file}`, root));
    assert.equal(createHash('sha256').update(file).digest('hex'), spec.source.sha256, spec.id);
    assert.ok(spec.source.url && spec.source.license, spec.id);
    assert.ok(spec.source.licenseUrl || spec.source.license === 'NOASSERTION', spec.id);
    assert.ok((spec.venue === 'hall' ? HALL_SETLIST : SPHERE_SETLIST).includes(spec.id), spec.id);
  }
  for (const item of index) {
    const piece = await json(`public/music/${item.id}.json`);
    assert.equal(piece.id, item.id);
    assert.ok(piece.duration > 0 && Number.isFinite(piece.duration), item.id);
    assert.ok(piece.tracks.length > 0 && piece.beats.length > 0, item.id);
    assert.equal(piece.duration, item.duration, item.id);
    for (const tr of piece.tracks) {
      assert.ok(SECTIONS[tr.section], `${item.id}: ${tr.section}`);
      assert.ok(manifest[tr.inst] && Object.keys(manifest[tr.inst]).length, `${item.id}: ${tr.inst}`);
      assert.ok(tr.notes.length > 0 && tr.notes.length % 4 === 0, `${item.id}: note layout`);
      let previous = -1;
      for (let i = 0; i < tr.notes.length; i += 4) {
        const [on, dur, midi, vel] = tr.notes.slice(i, i + 4);
        assert.ok(Number.isFinite(on) && on >= previous && on >= 0, `${item.id}: onset`);
        assert.ok(Number.isFinite(dur) && dur > 0 && on + dur <= piece.duration + 0.01, `${item.id}: duration`);
        assert.ok(Number.isInteger(midi) && midi >= 0 && midi <= 127, `${item.id}: pitch`);
        assert.ok(Number.isFinite(vel) && vel >= 0 && vel <= 127, `${item.id}: velocity`);
        previous = on;
      }
    }
  }
  for (const [inst, samples] of Object.entries(manifest)) {
    for (const note of Object.keys(samples)) {
      const file = await stat(new URL(`public/samples/${inst}/${note}.mp3`, root));
      assert.ok(file.size > 100, `${inst}/${note}.mp3`);
    }
  }
});
