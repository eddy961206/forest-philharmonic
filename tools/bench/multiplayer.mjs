// Isolated localhost QA: starts the real server on an OS-assigned loopback port.
// Requires Node with global WebSocket (Node 22+; validated with Node 24).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { config } from './browser.mjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const [label = 'current'] = process.argv.slice(2);
const cfg = config(label);
const repo = path.resolve(process.env.REPO_DIR || fileURLToPath(new URL('../../', import.meta.url)));
await fs.mkdir(cfg.outputDir, { recursive: true });
const output = path.join(cfg.outputDir, 'multiplayer-' + label + '.json');
if (typeof WebSocket !== 'function') throw new Error('This QA runner requires Node 22+ global WebSocket');
const { RoomClient, listRooms } = await import(pathToFileURL(path.join(repo, 'public/js/net/room.js')));
const sha = data => createHash('sha256').update(data).digest('hex');
const result = {
  measuredAt: new Date().toISOString(), node: process.version, repo, label, revision: cfg.revision,
  method: 'Functional tests of real server.js/server/rooms.js/server/ws.js and real browser RoomClient using Node WebSocket. Temporary rooms and messages exist only in a new process bound to 127.0.0.1 on an OS-assigned port. No production host, existing server or real users are contacted. This is protocol/static-serving QA, not rendered UI, audio-device synchronization or load/performance benchmarking.',
  cases: [], sources: {},
};
for (const file of ['server.js', 'server/rooms.js', 'server/ws.js', 'public/js/net/room.js', 'public/js/audio/crowd-loader.js', 'public/js/audio/crowd-worker.js']) result.sources[file] = sha(await fs.readFile(path.join(repo, file)));

const originalFetch = globalThis.fetch;
const originalLocation = globalThis.location;
const clients = [];
let child;
let serverErrors = '';
let origin;
let exitCode = 0;
let barrierNumber = 0;
const within = (promise, ms, message) => {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};
async function check(name, fn) {
  try { await fn(); result.cases.push({ name, passed: true }); }
  catch (error) { result.cases.push({ name, passed: false, error: error.message }); throw error; }
}
function client(label) {
  const peer = new RoomClient();
  peer.qa = { label, messages: [], joinedFirst: [], listeners: new Set() };
  peer.on('joined', (_message, first) => peer.qa.joinedFirst.push(first));
  const original = peer._message.bind(peer);
  peer._message = message => {
    original(message);
    peer.qa.messages.push(message);
    for (const listener of [...peer.qa.listeners]) listener(message);
  };
  peer.wait = (predicate, after = 0) => {
    const found = peer.qa.messages.slice(after).find(predicate);
    if (found) return Promise.resolve(found);
    let listener;
    return within(new Promise(resolve => {
      listener = message => { if (predicate(message)) { peer.qa.listeners.delete(listener); resolve(message); } };
      peer.qa.listeners.add(listener);
    }), 8000, `Timed out waiting for ${label}`).finally(() => peer.qa.listeners.delete(listener));
  };
  clients.push(peer);
  return peer;
}
async function barrier(peer) {
  const after = peer.qa.messages.length;
  // Fractional timestamp distinguishes the test barrier from automatic pings
  // without breaking RoomClient's numeric clock estimator.
  const c = Date.now() - 10 + (++barrierNumber % 512) / 1024;
  peer._send({ t: 'ping', c });
  return peer.wait(message => message.t === 'pong' && message.c === c, after);
}
async function leave(peer) {
  const ws = peer.ws;
  if (!ws || ws.readyState === 3) { peer.leave(); return; }
  const closed = within(new Promise(resolve => ws.addEventListener('close', resolve, { once: true })), 3000, `Close timeout: ${peer.qa.label}`);
  peer.leave();
  await closed;
}

try {
  const adapter = `import http from 'node:http';
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      this.once('listening', () => process.send({ address: this.address() }));
      return listen.apply(this, args);
    };
    await import(${JSON.stringify(pathToFileURL(path.join(repo, 'server.js')).href)});`;
  child = spawn(process.execPath, ['--input-type=module', '-e', adapter], {
    cwd: repo, env: { ...process.env, HOST: '127.0.0.1', PORT: '0', QUIET: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout.resume();
  child.stderr.on('data', chunk => { serverErrors += chunk.toString(); });
  const address = await within(new Promise((resolve, reject) => {
    child.once('message', message => resolve(message.address));
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Local server exited before listening: ${code}`)));
  }), 8000, 'Local server did not start');
  assert.equal(address.address, '127.0.0.1');
  origin = `http://127.0.0.1:${address.port}/`;
  result.origin = origin;
  globalThis.location = new URL(origin);
  globalThis.fetch = (input, options) => originalFetch(new URL(input, origin), options);

  await check('worker, loader and original synthesis modules retain correct JavaScript MIME, contents and revalidation', async () => {
    for (const file of ['crowd-worker.js', 'crowd-loader.js', 'crowd.js']) {
      const url = `js/audio/${file}`;
      const response = await fetch(url, { headers: { 'Accept-Encoding': 'identity' } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^text\/javascript/);
      assert.equal(response.headers.get('cache-control'), 'no-cache');
      assert.equal(sha(Buffer.from(await response.arrayBuffer())), sha(await fs.readFile(path.join(repo, 'public', url))));
      const cached = await fetch(url, { headers: { 'If-None-Match': response.headers.get('etag') } });
      assert.equal(cached.status, 304);
      assert.equal((await cached.arrayBuffer()).byteLength, 0);
    }
    const gz = await fetch('js/audio/crowd-worker.js', { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(gz.headers.get('content-encoding'), 'gzip');
    assert.equal(sha(Buffer.from(await gz.arrayBuffer())), sha(await fs.readFile(path.join(repo, 'public/js/audio/crowd-worker.js'))));
  });

  await check('sample caching and byte ranges preserve exact encoded audio bytes', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(repo, 'public/samples/manifest.json')));
    const [instrument, notes] = Object.entries(manifest)[0];
    const midi = Object.keys(notes)[0];
    const url = `samples/${instrument}/${midi}.mp3`;
    const expected = await fs.readFile(path.join(repo, 'public', url));
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('cache-control'), 'public, max-age=604800');
    assert.equal(Number(head.headers.get('content-length')), expected.length);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    const part = await fetch(url, { headers: { Range: 'bytes=0-31' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 0-31/${expected.length}`);
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), expected.subarray(0, 32));
    result.sampleRangeAsset = url;
  });

  const host = client('hall-host');
  let created;
  await check('create a public Hall room, host identity, seed and fresh room listing', async () => {
    created = await host.enter({ name: 'QA HOST', avatar: 'owl', venue: 'hall', create: { title: 'LOCAL QA ONLY', cap: 3, pub: true } });
    assert.equal(host.isHost, true);
    assert.equal(host.room.venue, 'hall');
    assert.match(host.room.code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.ok(Number.isInteger(host.seed) && host.seed >= 0 && host.seed <= 0xffffffff);
    assert.equal(created.members.length, 1);
    const rooms = await listRooms();
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].code, host.room.code);
    assert.equal(rooms[0].cap, 3);
    const response = await fetch('api/rooms');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await response.arrayBuffer();
  });

  await check('joining the other venue returns the correct venue instead of changing rooms', async () => {
    const wrong = client('wrong-venue');
    await assert.rejects(wrong.enter({ name: 'QA WRONG', avatar: 'bear', venue: 'sphere', code: host.room.code }), error => error.code === 'venue' && error.venue === 'hall');
    assert.equal(wrong.room, null);
    assert.equal(host.members.size, 1);
    await leave(wrong);
  });

  const guest = client('hall-guest');
  await check('a Hall guest joins with identical seed and member identity', async () => {
    const joined = await guest.enter({ name: 'QA GUEST', avatar: 'rabbit', venue: 'hall', code: host.room.code.toLowerCase() });
    await host.wait(message => message.t === 'member' && message.m.id === guest.id);
    assert.equal(guest.seed, host.seed);
    assert.equal(guest.host, host.id);
    assert.equal(guest.isHost, false);
    assert.equal(joined.state, null);
    assert.equal(guest.members.size, 2);
    assert.equal(host.members.size, 2);
  });

  let snapshot = { started: true, i: 1, title: 'LOCAL QA SCORE', phase: 'playing', playing: true, pos: 12.34, at: host.now(), onstage: ['vn1'], cond: true };
  await check('host state and commands reach guests without changing the snapshot payload', async () => {
    host.state(snapshot);
    assert.deepEqual((await guest.wait(message => message.t === 'state')).s, snapshot);
    const command = { k: 'seek', pos: 24.5, at: host.now() };
    host.cmd(command);
    assert.deepEqual((await guest.wait(message => message.t === 'cmd')).c, command);
    assert.equal(host.qa.messages.some(message => message.t === 'state'), false);
  });

  await check('the server rejects forged guest state, commands and host handoff', async () => {
    const hostAfter = host.qa.messages.length;
    const guestAfter = guest.qa.messages.length;
    guest._send({ t: 'state', s: { title: 'FORGED' } });
    guest._send({ t: 'cmd', c: { forged: true } });
    guest._send({ t: 'handoff', id: guest.id });
    await barrier(guest);
    snapshot = { ...snapshot, qa: 'authorization-barrier' };
    host.state(snapshot);
    await guest.wait(message => message.t === 'state' && message.s.qa === snapshot.qa, guestAfter);
    assert.equal(host.host, host.id);
    assert.equal(guest.host, host.id);
    assert.equal(host.qa.messages.slice(hostAfter).some(message => message.t === 'state' || message.t === 'cmd' || message.t === 'host'), false);
  });

  const late = client('hall-late-guest');
  await check('a late guest receives the complete playing snapshot and a full room rejects more members', async () => {
    const joined = await late.enter({ name: 'QA LATE', avatar: 'cat', venue: 'hall', code: host.room.code });
    assert.deepEqual(joined.state, snapshot);
    assert.equal(late.seed, host.seed);
    await host.wait(message => message.t === 'member' && message.m.id === late.id);
    const full = client('full-room');
    await assert.rejects(full.enter({ name: 'QA FULL', avatar: 'bear', venue: 'hall', code: host.room.code }), error => error.code === 'full');
    await leave(full);
    assert.equal((await listRooms())[0].count, 3);
  });

  await check('clock ping echoes the timestamp and RoomClient maintains a finite server clock estimate', async () => {
    const pong = await barrier(guest);
    assert.ok(Number.isFinite(pong.s));
    assert.ok(Number.isFinite(guest.offset));
    assert.ok(Number.isFinite(guest.bestRtt));
    assert.ok(Math.abs(guest.now() - Date.now() / 1000) < 3);
  });

  await check('pose broadcast clamps coordinates, preserves seat zero and throttles duplicate updates', async () => {
    const after = host.qa.messages.length;
    guest.pose({ x: 999, y: -999, z: -999, r: 50, s: 0, m: true });
    guest.pose({ x: 1, y: 1, z: 1, r: 1, s: 4 });
    const pose = await host.wait(message => message.t === 'pose' && message.id === guest.id, after);
    assert.deepEqual(pose.p, { x: 200, y: -50, z: -200, r: 10, s: 0, m: 1 });
    await barrier(guest);
    const marker = { qa: 'pose-barrier' };
    host.cmd(marker);
    await late.wait(message => message.t === 'cmd' && message.c.qa === marker.qa);
    assert.equal(host.qa.messages.slice(after).filter(message => message.t === 'pose' && message.id === guest.id).length, 1);
    assert.deepEqual(host.members.get(guest.id).p, pose.p);
  });

  await check('local chat is sanitized, echoed to its sender and rate limited', async () => {
    const after = host.qa.messages.length;
    const raw = `  안녕\u0000\u200b${'x'.repeat(160)}  `;
    const expected = `안녕${'x'.repeat(160)}`.slice(0, 140);
    guest.chat(raw);
    guest.chat('SHOULD BE THROTTLED');
    assert.equal((await host.wait(message => message.t === 'chat', after)).text, expected);
    assert.equal((await guest.wait(message => message.t === 'chat')).text, expected);
    await barrier(guest);
    host.cmd({ qa: 'chat-barrier' });
    await late.wait(message => message.t === 'cmd' && message.c.qa === 'chat-barrier');
    assert.equal(host.qa.messages.slice(after).filter(message => message.t === 'chat').length, 1);
  });

  await check('host handoff changes authorization and host departure restores the oldest member', async () => {
    host.handoff(guest.id);
    await host.wait(message => message.t === 'host' && message.id === guest.id);
    await guest.wait(message => message.t === 'host' && message.id === guest.id);
    assert.equal(guest.isHost, true);
    assert.equal(host.isHost, false);
    const after = late.qa.messages.length;
    host._send({ t: 'state', s: { title: 'FORMER HOST FORGED' } });
    await barrier(host);
    snapshot = { ...snapshot, qa: 'new-host-state' };
    guest.state(snapshot);
    await late.wait(message => message.t === 'state' && message.s.qa === snapshot.qa, after);
    assert.equal(late.qa.messages.slice(after).some(message => message.t === 'state' && message.s.title === 'FORMER HOST FORGED'), false);
    const hostAfter = host.qa.messages.length;
    await leave(guest);
    await host.wait(message => message.t === 'host' && message.id === host.id, hostAfter);
    assert.equal(host.isHost, true);
  });

  await check('RoomClient automatically rejoins after a local socket drop with preserved seed and snapshot', async () => {
    const oldId = late.id;
    let resolveReconnected;
    const reconnected = new Promise(resolve => { resolveReconnected = resolve; });
    late.on('reconnected', resolveReconnected);
    const after = late.qa.messages.length;
    late.ws.close(4000, 'LOCAL QA disconnect');
    await within(reconnected, 8000, 'RoomClient did not reconnect');
    const joined = await late.wait(message => message.t === 'joined', after);
    assert.notEqual(late.id, oldId);
    assert.equal(late.seed, host.seed);
    assert.deepEqual(joined.state, snapshot);
    assert.deepEqual(late.qa.joinedFirst, [true, false]);
    await host.wait(message => message.t === 'member' && message.m.id === late.id);
    assert.equal(host.members.has(oldId), false);
    assert.equal(host.members.has(late.id), true);
  });

  const sphere = client('private-sphere-host');
  await check('a private Sphere room stays out of the Hall room list and broadcasts remain isolated', async () => {
    await sphere.enter({ name: 'QA SPHERE', avatar: 'fox', venue: 'sphere', create: { title: 'LOCAL PRIVATE QA', cap: 3, pub: false } });
    assert.equal(sphere.room.venue, 'sphere');
    assert.equal((await listRooms()).some(room => room.code === sphere.room.code), false);
    const hostAfter = host.qa.messages.length;
    const sphereAfter = sphere.qa.messages.length;
    sphere.chat('LOCAL SPHERE TEST');
    await sphere.wait(message => message.t === 'chat', sphereAfter);
    host.cmd({ qa: 'room-isolation' });
    await late.wait(message => message.t === 'cmd' && message.c.qa === 'room-isolation');
    await barrier(sphere);
    assert.equal(host.qa.messages.slice(hostAfter).some(message => message.t === 'chat'), false);
    assert.equal(sphere.qa.messages.slice(sphereAfter).some(message => message.t === 'cmd'), false);
    const wrong = client('private-wrong-venue');
    await assert.rejects(wrong.enter({ name: 'QA OTHER', avatar: 'bear', venue: 'hall', code: sphere.room.code }), error => error.code === 'venue' && error.venue === 'sphere');
    await assert.rejects(wrong.enter({ name: 'QA MISSING', avatar: 'bear', venue: 'hall', code: '000000' }), error => error.code === 'notfound');
    await leave(wrong);
  });

  await check('empty rooms disappear and their codes cannot be rejoined', async () => {
    const removedHall = host.room.code;
    const removedSphere = sphere.room.code;
    await leave(late);
    await leave(host);
    await leave(sphere);
    assert.deepEqual(await listRooms(), []);
    const absent = client('deleted-rooms');
    for (const [code, venue] of [[removedHall, 'hall'], [removedSphere, 'sphere']]) {
      await assert.rejects(absent.enter({ name: 'QA ABSENT', avatar: 'bear', venue, code }), error => error.code === 'notfound');
    }
    await leave(absent);
  });
} catch (error) {
  exitCode = 1;
  result.error = { message: error.message, stack: error.stack };
} finally {
  await Promise.allSettled(clients.map(leave));
  globalThis.fetch = originalFetch;
  if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation;
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    try { await within(exited, 3000, 'Local server shutdown timed out'); }
    catch { child.kill('SIGKILL'); }
  }
  result.serverErrors = serverErrors;
  result.messages = clients.map(peer => ({ label: peer.qa.label, joinedFirst: peer.qa.joinedFirst, messages: peer.qa.messages }));
  result.passed = exitCode === 0;
  await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, passed: result.passed, cases: result.cases, error: result.error, serverErrors }, null, 2));
  process.exitCode = exitCode;
}
