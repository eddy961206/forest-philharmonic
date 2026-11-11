import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as THREE from 'three';
import { AVATARS } from '../public/js/scene/avatars.js';
import { buildCharacter, releaseCharacter } from '../public/js/scene/characters.js';
import { buildOrchestra } from '../public/js/scene/orchestra.js';
import { Performance } from '../public/js/audio/performance.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function countSceneGraph(root) {
  let nodes = 0;
  let meshes = 0;
  let triangles = 0;
  root.traverse((obj) => {
    nodes += 1;
    if (obj.isMesh && obj.geometry) {
      meshes += 1;
      const pos = obj.geometry.attributes?.position;
      if (pos) {
        for (let i = 0; i < pos.array.length; i++) {
          assert.ok(Number.isFinite(pos.array[i]), `Non-finite vertex coordinate in ${obj.name || obj.type}`);
        }
        const idx = obj.geometry.index;
        triangles += idx ? idx.count / 3 : pos.count / 3;
      }
    }
  });
  return { nodes, meshes, triangles };
}

test('all 15 animal species stay within per-character mesh and triangle budgets', () => {
  assert.ok(AVATARS.length >= 15, 'expected all 15 animal species in AVATARS');
  for (const avatar of AVATARS) {
    for (const outfit of ['tail', 'dress']) {
      const char = buildCharacter({
        species: avatar.id,
        fur: avatar.fur,
        outfit,
        standing: outfit === 'dress',
      });
      const stats = countSceneGraph(char.root);
      assert.ok(
        stats.meshes <= 48,
        `${avatar.id} (${outfit}) exceeded mesh budget: ${stats.meshes} > 48`,
      );
      assert.ok(
        stats.triangles <= 16000,
        `${avatar.id} (${outfit}) exceeded triangle budget: ${stats.triangles} > 16000`,
      );
      releaseCharacter(char);
    }
  }
});

test('orchestra update loop keeps finite world matrices and zero scene-graph growth across 60 frames', (t) => {
  const previousDocument = globalThis.document;
  t.after(() => { globalThis.document = previousDocument; });
  const context = new Proxy({}, {
    get: (_, key) => (key.startsWith('create') ? () => ({ addColorStop() {} }) : () => {}),
  });
  globalThis.document = { hidden: false, addEventListener() {}, createElement: () => ({ getContext: () => context }) };

  const scene = new THREE.Scene();
  const orchestra = buildOrchestra(scene, { brightFloor: true });
  const performance = new Performance({ onTick() {}, setTrim() {}, stopAll() {} });
  performance.use(performance.prepare({
    id: 'budget-fixture',
    duration: 5,
    tracks: [
      { section: 'vn1', inst: 'violin', notes: [0, 2, 69, 90, 2.2, 1.5, 72, 95] },
      { section: 'fl', inst: 'flute', notes: [0.5, 2, 76, 85] },
    ],
  }));
  performance._resetVisual(0);

  const firstEvents = performance.updateVisual(0);
  orchestra.update(0, 1 / 60, performance, { running: true, particles: true, glow: true, events: firstEvents });
  const baseline = countSceneGraph(scene);

  for (let step = 1; step <= 60; step++) {
    const time = step / 60;
    const events = performance.updateVisual(time);
    orchestra.update(time, 1 / 60, performance, { running: true, particles: true, glow: true, events });
  }
  scene.updateMatrixWorld(true);
  const after = countSceneGraph(scene);
  assert.equal(after.nodes, baseline.nodes, 'orchestra update must not leak scene nodes across frames');
  assert.equal(after.meshes, baseline.meshes, 'orchestra update must not leak meshes across frames');

  for (const player of orchestra.players) {
    for (const element of player.char.root.matrixWorld.elements) {
      assert.ok(Number.isFinite(element), `Non-finite world matrix on ${player.sid}:${player.ci}`);
    }
  }
});

test('sample manifest entries exist on disk with valid metadata within asset budget', async () => {
  const samplesDir = path.join(ROOT_DIR, 'public', 'samples');
  const manifestRaw = await fs.readFile(path.join(samplesDir, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);

  let sampleCount = 0;
  let totalBytes = 0;
  for (const [inst, notes] of Object.entries(manifest)) {
    for (const [midi, meta] of Object.entries(notes)) {
      sampleCount += 1;
      assert.ok(Number.isInteger(Number(midi)), `invalid MIDI key ${inst}:${midi}`);
      assert.ok(typeof meta.s === 'number' && Number.isFinite(meta.s) && meta.s >= 0, `invalid start offset ${inst}:${midi}`);
      assert.ok(typeof meta.g === 'number' && Number.isFinite(meta.g) && meta.g > 0 && meta.g <= 12, `invalid gain ${inst}:${midi}`);
      assert.ok(typeof meta.d === 'number' && Number.isFinite(meta.d) && meta.d > 0, `invalid duration ${inst}:${midi}`);

      const mp3Path = path.join(samplesDir, inst, `${midi}.mp3`);
      const stat = await fs.stat(mp3Path);
      assert.ok(stat.isFile() && stat.size > 0, `missing or empty sample ${inst}/${midi}.mp3`);
      totalBytes += stat.size;
    }
  }

  assert.ok(sampleCount > 0 && sampleCount <= 750, `unexpected sample count: ${sampleCount}`);
  assert.ok(totalBytes <= 25 * 1024 * 1024, `sample MP3 disk budget exceeded: ${totalBytes} bytes`);
});
