import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Socket, accept, isAllowedOrigin } from '../server/ws.js';
import { clientIp, sanitizeCmd, sanitizeState } from '../server/rooms.js';
import { connectRoom, maskedFrame } from './network/helpers.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class MockWire extends EventEmitter {
  writableLength = 0;
  writes = [];
  destroyed = false;
  setNoDelay() {}
  write(data) {
    this.writes.push(typeof data === 'string' ? data : Buffer.from(data));
    return true;
  }
  end(data) {
    if (data) this.write(data);
  }
  destroy() {
    this.destroyed = true;
    this.emit('close');
  }
}

function makeUpgradeReq(headers = {}) {
  return {
    method: 'GET',
    headers: {
      host: 'localhost:8080',
      upgrade: 'websocket',
      connection: 'Upgrade',
      'sec-websocket-version': '13',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      ...headers,
    },
  };
}

async function startServerProcess(extraEnv = {}) {
  const child = spawn(process.execPath, [path.join(ROOT_DIR, 'server.js')], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '0',
      QUIET: '1',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out starting server.js\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, 8000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server.js exited early (${code})\nstderr: ${stderr}`));
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const match = /http:\/\/localhost:(\d+)/.exec(stdout);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
  });

  const stop = () => new Promise((resolve) => {
    if (child.exitCode !== null) { resolve(); return; }
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 4000);
    killTimer.unref();
    child.once('exit', () => { clearTimeout(killTimer); resolve(); });
    child.kill('SIGTERM');
  });

  return { child, port, stop, getStderr: () => stderr };
}

function rawHttpRequest(port, rawLines) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: '127.0.0.1', port });
    const chunks = [];
    sock.on('error', reject);
    sock.on('connect', () => {
      sock.write(rawLines.join('\r\n') + '\r\n\r\n');
    });
    sock.on('data', (chunk) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const headerEnd = buf.indexOf('\r\n\r\n');
      if (headerEnd >= 0) {
        sock.destroy();
        resolve(buf.toString('utf8', 0, headerEnd));
      }
    });
    sock.on('end', () => {
      const buf = Buffer.concat(chunks);
      resolve(buf.toString('utf8'));
    });
  });
}

function httpGet(port, urlPath, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('WebSocket Origin validation blocks cross-site and null origins while honoring ALLOWED_ORIGINS', () => {
  assert.equal(isAllowedOrigin(makeUpgradeReq({ origin: 'http://localhost:8080' })), true);
  assert.equal(isAllowedOrigin(makeUpgradeReq({ origin: 'HTTP://LocalHost:8080' })), true);
  assert.equal(isAllowedOrigin(makeUpgradeReq({ origin: 'https://evil.example' })), false);
  assert.equal(isAllowedOrigin(makeUpgradeReq({ origin: 'null' })), false);
  assert.equal(isAllowedOrigin(makeUpgradeReq({ origin: 'file:///tmp/index.html' })), false);
  assert.equal(
    isAllowedOrigin(makeUpgradeReq({ origin: 'https://forest.example' }), {
      allowedOrigins: 'https://forest.example, http://127.0.0.1:9000',
    }),
    true,
  );
  assert.equal(isAllowedOrigin(makeUpgradeReq({}), { requireOrigin: false }), true);
  assert.equal(isAllowedOrigin(makeUpgradeReq({}), { requireOrigin: true }), false);

  const evilWire = new MockWire();
  assert.equal(accept(makeUpgradeReq({ origin: 'https://evil.example' }), evilWire), null);
  assert.match(String(evilWire.writes[0]), /^HTTP\/1\.1 403 Forbidden/);

  const nullWire = new MockWire();
  assert.equal(accept(makeUpgradeReq({ origin: 'null' }), nullWire), null);
  assert.match(String(nullWire.writes[0]), /^HTTP\/1\.1 403 Forbidden/);

  const okWire = new MockWire();
  const ws = accept(makeUpgradeReq({ origin: 'http://localhost:8080' }), okWire);
  assert.ok(ws);
  assert.equal(ws.deferBacklogClose, true);
  okWire.destroy();
});

test('Socket with deferBacklogClose defers onclose callback via microtask during broadcast', async () => {
  const wire = new MockWire();
  const ws = new Socket(wire, { deferBacklogClose: true });
  let closedCount = 0;
  ws.onclose = () => { closedCount += 1; };
  wire.writableLength = 256 * 1024;
  ws.send({ t: 'pose', p: { x: 1 } });
  ws.send({ t: 'pose', p: { x: 2 } });
  // Must not fire synchronously inside the caller's iteration frame
  assert.equal(closedCount, 0);
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(closedCount, 1);
  assert.equal(ws.open, false);
});

test('clientIp ignores spoofed X-Forwarded-For unless TRUST_PROXY hop count is configured', () => {
  const req = {
    headers: { 'x-forwarded-for': '1.2.3.4, 198.51.100.7, 10.0.0.2' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert.equal(clientIp(req, undefined), '127.0.0.1');
  assert.equal(clientIp(req, '0'), '127.0.0.1');
  assert.equal(clientIp(req, '1'), '10.0.0.2');
  assert.equal(clientIp(req, 'true'), '10.0.0.2');
  assert.equal(clientIp(req, '2'), '198.51.100.7');
  assert.equal(clientIp(req, '5'), '1.2.3.4');
});

test('sanitizeState and sanitizeCmd enforce schema whitelists and strip control characters', () => {
  assert.equal(sanitizeState(null), null);
  assert.equal(sanitizeState([]), null);
  assert.equal(sanitizeState({ on: 12345 }), null);
  assert.equal(sanitizeState({ i: -1 }), null);
  assert.equal(sanitizeState({ i: 1.5 }), null);
  assert.equal(sanitizeState({ pos: Number.NaN }), null);
  assert.equal(sanitizeState({ ev: { c: [], n: [], u: 10 } }), null);

  const validState = sanitizeState({
    started: true,
    playing: true,
    encore: false,
    i: 3,
    pos: 42.5,
    at: 1700000000000,
    title: '베토벤\u0000 교향곡\u202e',
    phase: 'playing',
    on: ['vn1:0', 'fl:1', 'bad space!', 99],
    ev: { c: [0, 2, 5], n: [1, 0, 2], u: 1700000005000 },
    injected: { evil: true },
  });
  assert.deepEqual(validState, {
    started: true,
    playing: true,
    encore: false,
    i: 3,
    pos: 42.5,
    at: 1700000000000,
    title: '베토벤 교향곡',
    phase: 'playing',
    on: ['vn1:0', 'fl:1'],
    ev: { c: [0, 2, 5], n: [1, 0, 2], u: 1700000005000 },
  });

  assert.equal(sanitizeCmd(null), null);
  assert.equal(sanitizeCmd({ c: 'eval', code: 'alert(1)' }), null);
  assert.equal(sanitizeCmd({ c: 'run', i: -5 }), null);
  assert.equal(sanitizeCmd({ c: 'encore', cands: [1, 2, 3, 4], until: 100 }), null);
  assert.deepEqual(
    sanitizeCmd({ c: 'run', i: 4, quick: 1, skipStageTransitions: 0, ritual: true, encore: true, extra: 'ignored' }),
    { c: 'run', i: 4, quick: true, skipStageTransitions: false, ritual: true, encore: true },
  );
});

test('HTTP security headers, malformed URL rejection, 405 handling, and room lifecycle ops', async (t) => {
  const srv = await startServerProcess({
    ROOMS_PER_IP: '2',
    WS_JOIN_TIMEOUT_MS: '140',
    WS_BYE_CLOSE_MS: '100',
    HOST_RELAY_REFILL_MS: '120',
  });
  t.after(() => srv.stop());

  // 1. Security headers on index and API
  const indexRes = await httpGet(srv.port, '/');
  assert.equal(indexRes.status, 200);
  assert.equal(indexRes.headers['x-content-type-options'], 'nosniff');
  assert.equal(indexRes.headers['x-frame-options'], 'DENY');
  assert.equal(indexRes.headers['referrer-policy'], 'same-origin');
  assert.match(String(indexRes.headers['permissions-policy']), /camera=\(\)/);
  assert.match(String(indexRes.headers['content-security-policy']), /worker-src 'self' blob:/);

  // 2. Reject protocol-relative //evil.example URLs with 400
  const doubleSlashHead = await rawHttpRequest(srv.port, [
    'GET //evil.example/ HTTP/1.1',
    'Host: localhost',
    'Connection: close',
  ]);
  assert.match(doubleSlashHead, /^HTTP\/1\.1 400 /);

  // 3. 405 Method Not Allowed closes connection cleanly with security headers
  const postRes = await httpGet(srv.port, '/api/rooms', { method: 'POST' });
  assert.equal(postRes.status, 405);
  assert.equal(postRes.headers.allow, 'GET, HEAD');
  assert.equal(postRes.headers.connection, 'close');
  assert.equal(postRes.headers['x-frame-options'], 'DENY');

  // 4. Cross-origin WS upgrade receives 403 Forbidden
  const badWsHead = await rawHttpRequest(srv.port, [
    'GET /ws HTTP/1.1',
    `Host: 127.0.0.1:${srv.port}`,
    'Origin: https://evil.example',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Version: 13',
    `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}`,
  ]);
  assert.match(badWsHead, /^HTTP\/1\.1 403 Forbidden/);

  // 5. Unjoined WS connection is automatically closed with 1008 after WS_JOIN_TIMEOUT_MS
  const idlePeer = await connectRoom(srv.port);
  const idleClose = await idlePeer.closed;
  assert.equal(idleClose.code, 1008);

  // 6. Explicit bye immediately reclaims empty room (no ROOMS_PER_IP=2 exhaustion across 4 cycles)
  //    and closes lingering socket after WS_BYE_CLOSE_MS
  for (let round = 0; round < 4; round++) {
    const host = await connectRoom(srv.port, {
      t: 'create',
      name: `방장${round}`,
      avatar: 'bear',
      title: `방${round}`,
      venue: 'hall',
      cid: `cid_host_round_${round}`,
    });
    const joined = await host.next((m) => m.t === 'joined');
    assert.ok(joined.room.code);
    host.send({ t: 'bye' });
    const byeClosed = await host.closed;
    assert.equal(byeClosed.code, 1000);
  }

  // 7. Vote clamping (k <= 2), sanitized publicRooms piece title, and host relay burst throttle
  const host = await connectRoom(srv.port, {
    t: 'create',
    name: '호스트',
    avatar: 'fox',
    title: '검증방',
    pub: true,
    venue: 'hall',
    cid: 'cid_host_active_01',
  });
  const hostJoined = await host.next((m) => m.t === 'joined');
  const code = hostJoined.room.code;

  const guest = await connectRoom(srv.port, {
    t: 'join',
    name: '게스트',
    avatar: 'rabbit',
    code,
    venue: 'hall',
    cid: 'cid_guest_active_01',
  });
  await guest.next((m) => m.t === 'joined');
  await host.next((m) => m.t === 'member');

  // Guest sends out-of-range vote k=99 -> clamped to 2
  guest.send({ t: 'vote', k: 99 });
  const voteMsg = await host.next((m) => m.t === 'vote');
  assert.equal(voteMsg.k, 2);

  // Host sends malformed state -> dropped; then bursts 12 valid states -> throttled to <= 7
  host.send({ t: 'state', s: { on: 'not-an-array' } });
  for (let idx = 0; idx < 12; idx++) {
    host.send({
      t: 'state',
      s: { started: true, playing: true, i: idx, title: `곡\u0007제목-${idx}` },
    });
  }
  await new Promise((r) => setTimeout(r, 60));
  guest.send({ t: 'ping', c: 777 });
  await guest.next((m) => m.t === 'pong' && m.c === 777);

  // Check publicRooms cleaned piece title
  const roomsRes = await httpGet(srv.port, '/api/rooms');
  assert.equal(roomsRes.status, 200);
  const roomList = JSON.parse(roomsRes.body);
  const listed = roomList.find((r) => r.code === code);
  assert.ok(listed);
  assert.equal(listed.piece.includes('\u0007'), false);
  assert.match(listed.piece, /^곡제목-\d+$/);

  guest.send({ t: 'bye' });
  await guest.closed;
  host.send({ t: 'bye' });
  await host.closed;
});

test('Docker packaging files define .dockerignore exclusions and container HEALTHCHECK', async () => {
  const dockerfile = await fs.readFile(path.join(ROOT_DIR, 'Dockerfile'), 'utf8');
  const dockerignore = await fs.readFile(path.join(ROOT_DIR, '.dockerignore'), 'utf8');
  assert.match(dockerfile, /HEALTHCHECK\b/);
  for (const pattern of ['.git', 'node_modules', 'work', 'tools', 'tests']) {
    assert.ok(dockerignore.includes(pattern), `.dockerignore should exclude ${pattern}`);
  }
});
