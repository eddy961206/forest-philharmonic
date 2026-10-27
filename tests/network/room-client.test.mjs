import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { RoomClient, listRooms } from '../../public/js/net/room.js';

function browser(t) {
  const timers = new Map();
  let now = 1000000;
  let sequence = 0;
  const sockets = [];
  const setTimer = (fn, delay, interval = 0) => {
    const id = ++sequence;
    timers.set(id, { fn, at: now + delay, interval });
    return id;
  };
  class WebSocket {
    readyState = 0;
    bufferedAmount = 0;
    sent = [];
    constructor() { sockets.push(this); }
    send(text) { if (this.readyState !== 1) throw new Error('closed'); this.sent.push(JSON.parse(text)); }
    open() { this.readyState = 1; this.onopen?.(); }
    receive(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  }
  const values = {
    WebSocket,
    crypto: webcrypto,
    sessionStorage: { getItem: () => 'tab-12345678', setItem() {} },
    location: { href: 'http://localhost/hall.html', protocol: 'http:' },
    setTimeout: (fn, delay = 0) => setTimer(fn, delay),
    setInterval: (fn, delay) => setTimer(fn, delay, delay),
    clearTimeout: id => timers.delete(id),
    clearInterval: id => timers.delete(id),
  };
  for (const [key, value] of Object.entries(values)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  t.mock.method(Date, 'now', () => now);
  return {
    sockets, timers,
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry;
        now = timer.at;
        if (timer.interval) timer.at += timer.interval;
        else timers.delete(id);
        timer.fn();
      }
      now = end;
    },
  };
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
async function join(client, env) {
  const entrance = client.enter({ name: '곰', avatar: 'bear', create: { title: '숲', cap: 2 } });
  const ws = env.sockets.at(-1);
  ws.open();
  await flush();
  ws.receive({ t: 'joined', you: 1, host: 1, room: { code: 'ABCDEF' }, seed: 5, members: [{ id: 1 }], now: Date.now() });
  await entrance;
  return ws;
}

test('leaving during connect cancels entry and ignores a late open', async t => {
  const env = browser(t);
  const client = new RoomClient();
  const entrance = client.enter({ code: 'ABCDEF' });
  const rejected = assert.rejects(entrance, /취소/);
  const ws = env.sockets[0];
  const lateOpen = ws.onopen;
  client.leave();
  ws.readyState = 1;
  lateOpen();
  await rejected;
  assert.equal(client.connected, false);
  assert.equal(ws.readyState, 3);
  assert.deepEqual(ws.sent, []);
  assert.equal(env.timers.size, 0);
});

test('entry timeout clears its pending response and socket', async t => {
  const env = browser(t);
  const client = new RoomClient();
  const entrance = client.enter({ code: 'ABCDEF' });
  const rejected = assert.rejects(entrance, /대답하지/);
  env.sockets[0].open();
  await flush();
  assert.ok(client._pending);
  env.tick(10000);
  await rejected;
  assert.equal(client._pending, null);
  assert.equal(client._entry, null);
  assert.equal(client.connected, false);
  assert.equal(env.timers.size, 0);
});

test('leaving during automatic reconnect cancels retries and queued chat', async t => {
  const env = browser(t);
  const client = new RoomClient();
  const ws = await join(client, env);
  let reconnected = 0;
  client.on('reconnected', () => reconnected++);
  client.chat('첫 문장');
  client.chat('전송 대기');
  ws.close();
  assert.deepEqual(client._chatQ, []);
  env.tick(600);
  const replacement = env.sockets[1];
  assert.ok(replacement);
  const lateOpen = replacement.onopen;
  client.leave();
  replacement.readyState = 1;
  lateOpen();
  await flush();
  env.tick(60000);
  await flush();
  assert.equal(env.sockets.length, 2);
  assert.equal(client.room, null);
  assert.equal(reconnected, 0);
  assert.equal(env.timers.size, 0);
});

test('a late close from an old socket does not start another retry loop', async t => {
  const env = browser(t);
  const client = new RoomClient();
  const ws = await join(client, env);
  const oldClose = ws.onclose;
  ws.close(1001);
  env.tick(600);
  const next = env.sockets[1];
  next.open();
  await flush();
  next.receive({ t: 'joined', you: 1, host: 1, room: { code: 'ABCDEF' }, seed: 5, members: [{ id: 1 }], now: Date.now() });
  await flush();
  oldClose();
  assert.equal(client.ws, next);
  assert.equal(client.connected, true);
  client.leave();
  assert.equal(env.timers.size, 0);
});

test('a connection replaced by a duplicate tab stops reconnecting', async t => {
  const env = browser(t);
  const client = new RoomClient();
  const ws = await join(client, env);
  const lost = [];
  let disconnected = 0;
  client.on('lost', error => lost.push(error));
  client.on('disconnected', () => disconnected++);
  ws.close(4001);
  env.tick(60000);
  await flush();
  assert.equal(lost.length, 1);
  assert.equal(lost[0].code, 'replaced');
  assert.match(lost[0].message, /다른 탭/);
  assert.equal(disconnected, 0);
  assert.equal(client.room, null);
  assert.equal(client.connected, false);
  assert.equal(env.sockets.length, 1);
  assert.equal(env.timers.size, 0);
});

test('a queued message from a retired socket cannot change the replacement room', async t => {
  const env = browser(t);
  const client = new RoomClient();
  const ws = await join(client, env);
  const oldMessage = ws.onmessage;
  ws.close();
  env.tick(600);
  const next = env.sockets[1];
  next.open();
  await flush();
  next.receive({ t: 'joined', you: 1, host: 2, room: { code: 'ABCDEF' }, seed: 5, members: [{ id: 1 }, { id: 2 }], now: Date.now() });
  await flush();
  let staleCommands = 0;
  client.on('cmd', () => staleCommands++);
  oldMessage({ data: JSON.stringify({ t: 'host', id: 99 }) });
  oldMessage({ data: JSON.stringify({ t: 'cmd', c: { c: 'pause' } }) });
  oldMessage({ data: JSON.stringify({ t: 'left', id: 2 }) });
  assert.equal(client.host, 2);
  assert.equal(client.members.has(2), true);
  assert.equal(staleCommands, 0);
  client.leave();
  assert.equal(env.timers.size, 0);
});

test('replacement during an automatic entrance stops the retry loop', async t => {
  const env = browser(t);
  const client = new RoomClient();
  const ws = await join(client, env);
  const lost = [];
  client.on('lost', error => lost.push(error));
  ws.close();
  env.tick(600);
  const next = env.sockets[1];
  next.open();
  await flush();
  next.close(4001);
  await flush();
  env.tick(60000);
  await flush();
  assert.equal(lost.length, 1);
  assert.equal(lost[0].code, 'replaced');
  assert.equal(client.room, null);
  assert.equal(env.sockets.length, 2);
  assert.equal(env.timers.size, 0);
});

test('stale poses are dropped under backpressure and a stuck queue reconnects', async t => {
  const env = browser(t);
  const client = new RoomClient();
  const ws = await join(client, env);
  const sent = ws.sent.length;
  ws.bufferedAmount = 40 * 1024;
  client.pose({ x: 1 });
  assert.equal(ws.sent.length, sent);
  client.state({ playing: true });
  assert.equal(ws.sent.at(-1).t, 'state');
  ws.bufferedAmount = 257 * 1024;
  client.pose({ x: 2 });
  assert.equal(client.connected, false);
  env.tick(600);
  assert.equal(env.sockets.length, 2);
  client.leave();
  await flush();
  assert.equal(env.timers.size, 0);
});

test('room list timeout aborts the underlying request', async t => {
  const env = browser(t);
  let aborted = false;
  t.mock.method(globalThis, 'fetch', (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  }));
  const request = listRooms();
  const rejected = assert.rejects(request, /aborted/);
  env.tick(5000);
  await rejected;
  assert.equal(aborted, true);
  assert.equal(env.timers.size, 0);
});
