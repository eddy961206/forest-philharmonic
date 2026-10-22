#!/usr/bin/env node
// CPU-only comparison of two checked-out dome controllers. No WebGL/GPU/FPS.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`CPU-only dome visibility comparison (mock renderer; no GPU timing or FPS).

node --experimental-loader ./tests/helpers/three-loader.mjs tools/bench/dome-visibility.mjs \\
  --baseline /path/to/baseline-worktree [--candidate /path/to/candidate-worktree] \\
  [--iterations 20000] [--rounds 5] [--out /path/to/result.json]

Use detached worktrees pinned to explicit commits. Both trees must contain the
same vendored Three files as this tool. Results contain source SHA-256 values.
The default candidate is this tool's worktree. Stationary and moving camera
workloads alternate execution order; cube-face requests must match first.`);
  process.exit(0);
}
const options = { candidate: root, iterations: 20000, rounds: 5 };
for (let i = 0; i < args.length; i += 2) {
  const flag = args[i];
  if (!['--baseline', '--candidate', '--iterations', '--rounds', '--out'].includes(flag) || !args[i + 1]) {
    throw new Error(`Unknown or incomplete option: ${flag}. See --help.`);
  }
  options[flag.slice(2)] = args[i + 1];
}
if (!options.baseline) throw new Error('--baseline is required. See --help.');
for (const name of ['iterations', 'rounds']) {
  options[name] = Number(options[name]);
  if (!Number.isSafeInteger(options[name]) || options[name] < 1) throw new Error(`--${name} must be a positive integer.`);
}
if (options.iterations > 1000000 || options.rounds > 30) throw new Error('Use at most 1,000,000 iterations and 30 rounds.');
options.baseline = path.resolve(options.baseline);
options.candidate = path.resolve(options.candidate);
const sha256 = async (base, file) => createHash('sha256').update(await readFile(path.join(base, file))).digest('hex');
const vendors = ['public/vendor/three/three.module.js', 'public/vendor/three/three.core.js'];
const files = [
  'public/js/scene/domeshow.js', 'public/js/scene/dome3d.js', 'public/js/scene/sphereplan.js',
  'public/js/scene/venue.js', 'public/js/scene/hallplan.js', 'public/js/layout.js', ...vendors,
];
const sources = {};
for (const version of ['baseline', 'candidate']) {
  sources[version] = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await sha256(options[version], file)])));
  for (const file of vendors) assert.equal(sources[version][file], await sha256(root, file), `${version} must use the same Three vendor as the loader`);
}
globalThis.location = { search: '?venue=sphere' };
const THREE = await import('three');
const load = (base) => import(pathToFileURL(path.join(base, 'public/js/scene/domeshow.js')).href);
const [before, after] = await Promise.all([load(options.baseline), load(options.candidate)]);

function fixture(build) {
  let target = null;
  let face = 0;
  let mip = 0;
  let count = 0;
  let checksum = 0;
  let mask = 0;
  const renderer = {
    coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: false },
    getRenderTarget: () => target, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    setRenderTarget(next, cubeFace = 0, level = 0) { target = next; face = cubeFace; mip = level; },
    render() { count++; checksum += 1 << face; mask |= 1 << face; },
  };
  const dome = build({ renderer, quality: 'high' });
  const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 260);
  dome.setViewers([{ cam: camera }]);
  dome.go('FOREST3D', { dur: 0.01 });
  dome.update(1);
  return { dome, camera, resetMask() { mask = 0; }, get mask() { return mask; }, get count() { return count; }, get checksum() { return checksum; } };
}
const a = fixture(before.buildDome);
const b = fixture(after.buildDome);
// Compare each requested face mask before timing; equal aggregate counts alone
// could conceal different per-frame visibility or different camera coverage.
for (let i = 0; i < 360; i++) {
  for (const f of [a, b]) {
    f.camera.position.set(Math.sin(i * 0.1) * 18, 1.6 + (i % 4) * 10, 45);
    f.camera.rotation.set((i % 9 - 4) * 0.2, i * Math.PI / 180, 0, 'YXZ');
    f.camera.fov = 24 + (i % 4) * 24;
    f.camera.aspect = i % 2 ? 390 / 844 : 16 / 9;
    f.camera.updateProjectionMatrix();
    f.resetMask();
    f.dome.drawWorlds();
  }
  assert.equal(a.mask, b.mask, `cube-face request mismatch at probe ${i}`);
}
function resetPose(f) {
  f.camera.position.set(0, 1.6, 45);
  f.camera.rotation.order = 'YXZ';
  f.camera.lookAt(0, 8, -20);
  f.camera.fov = 64;
  f.camera.aspect = 16 / 9;
  f.camera.updateProjectionMatrix();
}
function run(f, mode, iterations) {
  const count = f.count;
  const checksum = f.checksum;
  const started = performance.now();
  for (let i = 0; i < iterations; i++) {
    if (mode === 'moving') f.camera.rotation.y = i * 0.001;
    f.dome.drawWorlds();
  }
  return { elapsedMs: performance.now() - started, cubeFaceRequests: f.count - count, faceChecksum: f.checksum - checksum };
}
const median = (values) => {
  const sorted = [...values].sort((x, y) => x - y);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const workloads = [];
for (const mode of ['stationary', 'moving']) {
  resetPose(a);
  resetPose(b);
  run(a, mode, 3000);
  run(b, mode, 3000);
  const rounds = [];
  for (let round = 0; round < options.rounds; round++) {
    const result = { order: round % 2 ? 'candidate-baseline' : 'baseline-candidate' };
    for (const version of result.order.split('-')) result[version] = run(version === 'baseline' ? a : b, mode, options.iterations);
    assert.equal(result.baseline.cubeFaceRequests, result.candidate.cubeFaceRequests, `${mode}: cube-face counts differ`);
    assert.equal(result.baseline.faceChecksum, result.candidate.faceChecksum, `${mode}: cube-face checksums differ`);
    rounds.push(result);
  }
  workloads.push({ mode, rounds, medianBatchMs: {
    baseline: median(rounds.map((r) => r.baseline.elapsedMs)),
    candidate: median(rounds.map((r) => r.candidate.elapsedMs)),
  } });
}
const result = {
  kind: 'cpu-only-mock-renderer',
  limitation: 'Measures controller/visibility JS and a mock render call. No WebGL, GPU, pixel comparison, application FPS or real-device improvement is measured.',
  node: process.versions.node, platform: process.platform, arch: process.arch,
  options, sourceSha256: sources, verifiedPerFrameMasks: 360, workloads,
};
const json = `${JSON.stringify(result, null, 2)}\n`;
if (options.out) {
  await mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
  await writeFile(options.out, json, { flag: 'wx' });
}
console.log(json);
