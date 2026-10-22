import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { hardwareRendererIssue, sha256, sourceHashes, verifySourceTree } from '../tools/bench/browser.mjs';

test('hardware gate rejects software and unknown renderers', () => {
  for (const renderer of [null, '', 'WebKit WebGL', 'ANGLE', 'ANGLE (Google, Vulkan SwiftShader Device (Subzero))',
    'Mesa llvmpipe (LLVM 19)', 'Microsoft Basic Render Driver', 'ANGLE (Microsoft, WARP)'])
    assert.ok(hardwareRendererIssue(renderer), String(renderer));
  for (const renderer of ['ANGLE (Intel, Intel(R) Iris Xe Graphics, D3D11)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)', 'AMD Radeon RX 7900 XTX',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070, OpenGL)']) assert.equal(hardwareRendererIssue(renderer), null);
});

test('full source contract catches non-core asset and local server drift', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'forest-source-contract-'));
  const keys = ['SOURCE_MANIFEST', 'SOURCE_SIDE', 'SOURCE_TREE', 'REVISION'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    await fs.mkdir(path.join(directory, 'public'));
    const files = { 'public/index.html': '<html>fixture</html>', 'public/worker.js': 'worker fixture', 'server.js': 'server fixture' };
    for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(directory, name), content);
    const manifest = {
      baseline: 'old', candidate: 'new',
      files: [...Object.entries(files).map(([name, content]) => ({ path: name, baselineSha256: sha256(content), candidateSha256: sha256(content) })),
        { path: 'public/absent.js', baselineSha256: null, candidateSha256: null }],
      collectors: { 'tools/bench/browser.mjs': sha256(await fs.readFile(new URL('../tools/bench/browser.mjs', import.meta.url))) },
    };
    const manifestPath = path.join(directory, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    Object.assign(process.env, { SOURCE_MANIFEST: manifestPath, SOURCE_SIDE: 'candidate', SOURCE_TREE: directory, REVISION: 'new' });
    assert.equal(Object.keys((await verifySourceTree()).files).length, 4);
    let corrupted = false, disposed = 0;
    const requested = [];
    const page = { request: { async get(url) {
      const name = new URL(url).pathname.slice(1);
      requested.push(name);
      const content = files['public/' + name];
      return { ok: () => content !== undefined, status: () => content === undefined ? 404 : 200,
        body: async () => Buffer.from(corrupted && name === 'worker.js' ? 'wrong worker' : content),
        dispose: async () => { disposed++; } };
    } } };
    const hashes = await sourceHashes(page, 'http://127.0.0.1:8382/');
    assert.deepEqual(requested.sort(), ['absent.js', 'index.html', 'worker.js']);
    assert.equal(hashes['worker.js'].sha256, sha256(files['public/worker.js']));
    assert.equal(disposed, 3);
    corrupted = true;
    await assert.rejects(sourceHashes(page, 'http://127.0.0.1:8382/'), /worker\.js/);
    await fs.writeFile(path.join(directory, 'server.js'), 'uncommitted server edit');
    await assert.rejects(verifySourceTree(), /server\.js/);
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await fs.rm(directory, { recursive: true, force: true });
  }
});
