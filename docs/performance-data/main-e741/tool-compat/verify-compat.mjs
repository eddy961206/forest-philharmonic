// The 21 offline cases originally executed inline while adapting e741 tooling.
// Uses archived source bytes and archived tools; never launches a browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { fixedAudienceMain, browserState } from './snapshots/loading-proxy.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, 'runs', new Date().toISOString().replaceAll(':', '-')));
await fs.mkdir(output, { recursive: false });
await fs.mkdir(path.join(output, 'generated'));
const digest = value => createHash('sha256').update(value).digest('hex');
const results = [];
const record = (name, details = {}) => { results.push({ name, status: 'PASS', ...details }); console.log(`PASS ${results.length}: ${name}`); };
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
for (const file of manifest.sourceCopies) assert.equal(digest(await fs.readFile(path.join(root, file.path))), file.sha256, file.path + ' archive hash');

for (const [name, kind] of [['legacy', 'legacy-solo-rand'], ['current', 'planned-house'], ['candidate', 'planned-house']]) {
  const source = await fs.readFile(path.join(root, 'sources', name + '-main.mjs'), 'utf8');
  for (const seed of [0, 417, 0xffffffff]) {
    const result = fixedAudienceMain(source, seed);
    assert.equal(result.metadata.anchorKind, kind);
    assert.equal(result.metadata.replacements, 1);
    assert.equal(result.metadata.originalSha256, digest(source));
    assert.equal(result.metadata.servedSha256, digest(result.served));
    assert.equal(result.metadata.originalIdentityBytes, Buffer.byteLength(source));
    assert.equal(result.metadata.servedIdentityBytes, Buffer.byteLength(result.served));
    assert.equal(result.metadata.etag, '"qa-' + digest(result.served) + '"');
    assert.equal(result.served.split(`room ? seeded(room.seed) : seeded(${seed})`).length - 1, 1);
    assert.equal(result.served.replace(`room ? seeded(room.seed) : seeded(${seed})`, 'room ? seeded(room.seed) : Math.random'), source);
    await fs.writeFile(path.join(output, 'generated', `${name}-${seed}.mjs`), result.served);
    record(`${name}: seed ${seed}, one change, reversible source, hashes, bytes, ETag`, { metadata: result.metadata });
  }
}
const legacy = 'const rand = room ? seeded(room.seed) : Math.random;';
const planned = 'housePlan = planHouse(hall.seats.filter((s) => !s.stage), room ? seeded(room.seed) : Math.random);';
for (const [name, source] of [['missing', ''], ['legacy duplicate', legacy + legacy], ['planned duplicate', planned + planned], ['mixed', legacy + planned]]) {
  assert.throws(() => fixedAudienceMain(source, 417), /exactly one/);
  record(`reject ${name} anchor`);
}
for (const seed of [-1, 0.5, 0x100000000, NaN, '417']) {
  assert.throws(() => fixedAudienceMain(legacy, seed), /uint32/);
  record(`reject seed ${String(seed)} (${typeof seed})`);
}
const gl = { getExtension: () => null };
const buffer = (length = 10, numberOfChannels = 2) => ({ length, numberOfChannels });
const profile = () => ({ close: buffer(), wash: buffer(20) });
globalThis.window = { __fp: {
  renderer: { getContext: () => gl, getPixelRatio: () => 1, info: { memory: { geometries: 2, textures: 3 } } },
  engine: { samples: { violin: { buf: new Map([[1, buffer(30)]]) } }, ctx: { sampleRate: 24000, state: 'running' } },
  perf: {}, settings: { quality: 'high' }, director: { occupied: new Set([3, 1]) },
} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Node offline stub', hardwareConcurrency: 1 } });
globalThis.innerWidth = 960; globalThis.innerHeight = 540; globalThis.devicePixelRatio = 1;
const page = { evaluate: (fn, arg) => fn(arg) };
window.__fp.engine._crowd = { welcome: buffer(), normal: [buffer(), buffer()], finale: buffer() };
assert.equal((await browserState(page)).applausePcmBytes, 320);
record('legacy applause PCM sums to 320 stub bytes');
window.__fp.engine._crowd = { welcome: profile(), normal: [profile(), profile()], finale: profile() };
const paired = await browserState(page);
assert.equal(paired.applausePcmBytes, 960);
assert.equal(paired.samplePcmBytes, 240);
record('paired applause PCM sums to 960 stub bytes; instrument PCM remains 240');
window.__fp.engine._crowd.welcome.wash = null;
await assert.rejects(() => browserState(page), /Unknown applause PCM layout/);
record('reject invalid half-pair PCM instead of reporting NaN');
assert.equal(results.length, 21);
await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({
  suite: 'tool-compat-e741', status: 'PASS', node: process.version, ranAt: new Date().toISOString(),
  browserLaunched: false, sourceManifest: '../manifest.json', cases: results,
}, null, 2) + '\n');
console.log(`PASS: ${results.length} cases. Generated fixtures: ${path.join(output, 'generated')}`);
