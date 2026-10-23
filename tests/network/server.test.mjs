import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { connectRoom } from './helpers.mjs';

let child;
let port;
const peers = [];
before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', QUIET: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      const match = /http:\/\/localhost:(\d+)/.exec(output);
      if (match) { port = Number(match[1]); clearTimeout(timer); resolve(); }
    });
  });
});
after(async () => {
  for (const peer of peers) peer.close();
  if (child && child.exitCode === null) {
    await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  }
});
async function peer(first) { const p = await connectRoom(port, first); peers.push(p); return p; }
function request(path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.once('error', reject);
      res.once('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.once('error', reject);
    req.end();
  });
}

test('gzip negotiation and conditional requests keep representation validators distinct', async () => {
  const identity = await request('/js/net/room.js', { 'Accept-Encoding': 'gzip;q=0, *;q=1' });
  assert.equal(identity.status, 200);
  assert.equal(identity.headers['content-encoding'], undefined);
  assert.equal(identity.headers.vary, 'Accept-Encoding');
  const gzip = await request('/js/net/room.js', { 'Accept-Encoding': 'gzip' });
  assert.equal(gzip.headers['content-encoding'], 'gzip');
  assert.notEqual(identity.headers.etag, gzip.headers.etag);
  assert.deepEqual(gunzipSync(gzip.body), identity.body);
  const wrongVariant = await request('/js/net/room.js', { 'Accept-Encoding': 'gzip', 'If-None-Match': identity.headers.etag });
  assert.equal(wrongVariant.status, 200);
  const cached = await request('/js/net/room.js', { 'Accept-Encoding': 'gzip', 'If-None-Match': `"other", W/${gzip.headers.etag}` });
  assert.equal(cached.status, 304);
  assert.equal(cached.headers.vary, 'Accept-Encoding');
  assert.equal(cached.headers['content-encoding'], 'gzip');
  assert.equal(cached.body.length, 0);
});

test('cold concurrent gzip requests agree with an identity download', async () => {
  // Keep this asset distinct from earlier requests so the concurrent calls
  // exercise a new compression promise rather than only a warm cache hit.
  const asset = '/js/programs.js';
  const [identity, ...compressed] = await Promise.all([
    request(asset),
    ...Array.from({ length: 5 }, () => request(asset, { 'Accept-Encoding': 'gzip' })),
  ]);
  for (const response of compressed) assert.deepEqual(gunzipSync(response.body), identity.body);
});

test('byte ranges preserve offsets, support If-Range, and reject empty suffixes', async () => {
  const identity = await request('/js/net/room.js');
  const partial = await request('/js/net/room.js', { Range: 'bytes=10-29', 'Accept-Encoding': 'gzip' });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers['content-encoding'], undefined);
  assert.deepEqual(partial.body, identity.body.subarray(10, 30));
  const suffix = await request('/js/net/room.js', { Range: 'bytes=-10' });
  assert.deepEqual(suffix.body, identity.body.subarray(-10));
  const changed = await request('/js/net/room.js', { Range: 'bytes=10-29', 'If-Range': '"stale"' });
  assert.equal(changed.status, 200);
  assert.deepEqual(changed.body, identity.body);
  const same = await request('/js/net/room.js', { Range: 'bytes=10-29', 'If-Range': identity.headers.etag });
  assert.equal(same.status, 206);
  const invalid = await request('/js/net/room.js', { Range: 'bytes=-0' });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers['content-range'], `bytes */${identity.body.length}`);
  const malformed = await request('/js/net/room.js', { Range: 'bytes=1-2garbage' });
  assert.equal(malformed.status, 200);
});

test('HEAD and malformed paths complete without bodies or a server crash', async () => {
  const head = await request('/js/net/room.js', { 'Accept-Encoding': 'gzip' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers['content-length']) > 0);
  assert.equal(head.body.length, 0);
  assert.equal((await request('/%E0%A4%A')).status, 400);
  assert.equal((await request('/%00')).status, 400);
  assert.equal((await request('/api/rooms')).status, 200);
});

test('a frame sent with the upgrade is not lost', async () => {
  const host = await peer({ t: 'create', cid: 'pipeline-tab', name: '곰', cap: 2 });
  const joined = await host.next(m => m.t === 'joined');
  assert.equal(joined.you, joined.host);
  host.send({ t: 'bye' });
  host.close();
});

test('replacing a lingering host connection preserves a full room and show', async () => {
  const host = await peer({ t: 'create', cid: 'same-host-tab', name: '곰', cap: 2, venue: 'hall' });
  const created = await host.next(m => m.t === 'joined');
  const guest = await peer({ t: 'join', cid: 'guest-tab-123', name: '여우', code: created.room.code, venue: 'hall' });
  await guest.next(m => m.t === 'joined');
  host.send({ t: 'state', s: { started: true, playing: true, pos: 42, title: '검증 곡' } });
  await guest.next(m => m.t === 'state');
  const replacement = await peer({ t: 'join', cid: 'same-host-tab', name: '곰', code: created.room.code, venue: 'hall', resume: true });
  const joined = await replacement.next(m => m.t === 'joined' || m.t === 'error');
  assert.equal(joined.t, 'joined');
  assert.equal(joined.you, created.you);
  assert.equal(joined.host, created.host);
  assert.equal(joined.members.length, 2);
  assert.equal(joined.state.pos, 42);
  assert.equal((await host.closed).code, 4001);
  replacement.send({ t: 'cmd', c: { c: 'pause' } });
  const cmd = await guest.next(m => m.t === 'cmd');
  assert.equal(cmd.c.c, 'pause');
  guest.send({ t: 'state', s: { pos: 999 } });
  guest.send({ t: 'ping', c: 1 });
  await guest.next(m => m.t === 'pong');
  const list = JSON.parse((await request('/api/rooms')).body);
  assert.equal(list.find(r => r.code === created.room.code).count, 2);
  replacement.send({ t: 'bye' });
  const promoted = await guest.next(m => m.t === 'host');
  assert.notEqual(promoted.id, created.host);
  replacement.close();
  guest.send({ t: 'bye' });
  guest.close();
  host.close();
});

test('venue mismatch does not evict the tab that is still in the correct venue', async () => {
  const host = await peer({ t: 'create', cid: 'venue-host-tab', name: '곰', cap: 1, venue: 'sphere' });
  const created = await host.next(m => m.t === 'joined');
  const wrong = await peer({ t: 'join', cid: 'venue-host-tab', code: created.room.code, venue: 'hall', resume: true });
  const error = await wrong.next(m => m.t === 'error');
  assert.equal(error.code, 'venue');
  host.send({ t: 'ping', c: 55 });
  assert.equal((await host.next(m => m.t === 'pong')).c, 55);
  wrong.close();
  host.send({ t: 'bye' });
  host.close();
});

test('outdoor rooms retain their venue through listing, joining, state and host resume', async () => {
  const host = await peer({ t: 'create', cid: 'outdoor-host-tab', name: '곰', title: '야외 연주', cap: 2, venue: 'outdoor' });
  const created = await host.next(m => m.t === 'joined' || m.t === 'error');
  assert.equal(created.t, 'joined');
  assert.equal(created.room.venue, 'outdoor');
  const list = JSON.parse((await request('/api/rooms')).body);
  assert.equal(list.find(room => room.code === created.room.code)?.venue, 'outdoor');
  const guest = await peer({ t: 'join', cid: 'outdoor-guest-tab', name: '여우', code: created.room.code, venue: 'outdoor' });
  const joined = await guest.next(m => m.t === 'joined' || m.t === 'error');
  assert.equal(joined.t, 'joined');
  assert.equal(joined.room.venue, 'outdoor');
  host.send({ t: 'state', s: { started: true, playing: true, pos: 15, title: '야외 연주' } });
  assert.equal((await guest.next(m => m.t === 'state')).s.pos, 15);
  const wrong = await peer({ t: 'join', cid: 'outdoor-wrong-tab', code: created.room.code, venue: 'hall' });
  assert.equal((await wrong.next(m => m.t === 'error')).code, 'venue');
  const resumed = await peer({ t: 'join', cid: 'outdoor-host-tab', code: created.room.code, venue: 'outdoor', resume: true });
  const restored = await resumed.next(m => m.t === 'joined' || m.t === 'error');
  assert.equal(restored.t, 'joined');
  assert.equal(restored.you, created.you);
  assert.equal(restored.room.venue, 'outdoor');
  assert.equal(restored.state.pos, 15);
  assert.equal(restored.members.length, 2);
  resumed.send({ t: 'bye' });
  guest.send({ t: 'bye' });
  for (const socket of [host, guest, wrong, resumed]) socket.close();
});
