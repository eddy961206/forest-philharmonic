// Rooms: people watch the concert together. The host (방장) runs the show
// and the server passes its state on; everyone else follows. Each member
// also shares where they stand or sit, and can chat.
//
// client -> server                       server -> client
//   create {name, avatar, title, cap, pub} joined {room, you, host, members, state, seed}
//   join   {name, avatar, code}            member {m}  left {id}  host {id}
//   pose   {p}                             pose {id, p}
//   state  {s}        (host only)          state {s}
//   cmd    {c}        (host only)          cmd {c}
//   chat   {text}                          chat {id, name, text}
//   handoff {id}      (host only)
//   ping   {c}                             pong {c, s}
//                                          error {code, msg}
import crypto from 'node:crypto';
import { accept, heartbeat } from './ws.js';

const MAX_ROOMS = 300;
const MAX_CAP = 50;
const PER_IP = 12;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

const rooms = new Map(); // code -> room
const sockets = new Set();
const perIp = new Map();
let nextId = 1;

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, '').trim().slice(0, max);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

function newCode() {
  for (;;) {
    let c = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) c += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    if (!rooms.has(c)) return c;
  }
}

const info = (m) => ({ id: m.id, name: m.name, avatar: m.avatar, p: m.pose });

function broadcast(room, msg, except = null) {
  const s = JSON.stringify(msg);
  for (const m of room.members.values()) if (m !== except) m.sock.send(s);
}

export function publicRooms() {
  return [...rooms.values()]
    .filter((r) => r.pub)
    .map((r) => ({ code: r.code, title: r.title, count: r.members.size, cap: r.cap, playing: !!r.state?.playing, piece: r.state?.title || '' }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);
}

function leave(m) {
  const room = m.room;
  if (!room) return;
  m.room = null;
  room.members.delete(m.id);
  if (!room.members.size) { rooms.delete(room.code); return; }
  broadcast(room, { t: 'left', id: m.id });
  if (room.host === m.id) {
    // the longest-staying member takes over the show
    const next = [...room.members.values()].sort((a, b) => a.since - b.since)[0];
    room.host = next.id;
    broadcast(room, { t: 'host', id: next.id });
  }
}

function enter(m, room) {
  m.room = room;
  m.since = Date.now();
  room.members.set(m.id, m);
  m.sock.send({
    t: 'joined',
    room: { code: room.code, title: room.title, cap: room.cap, pub: room.pub },
    you: m.id,
    host: room.host,
    members: [...room.members.values()].map(info),
    state: room.state,
    seed: room.seed,
    now: Date.now(),
  });
  broadcast(room, { t: 'member', m: info(m) }, m);
}

function onMessage(m, msg) {
  const now = Date.now();
  switch (msg.t) {
    case 'ping':
      m.sock.send({ t: 'pong', c: msg.c, s: now });
      return;
    case 'create':
    case 'join': {
      if (m.room) return;
      m.name = clean(msg.name, 16) || '이름 없는 동물';
      m.avatar = /^[a-z]{2,12}$/.test(msg.avatar) ? msg.avatar : 'bear';
      if (msg.t === 'create') {
        if (rooms.size >= MAX_ROOMS) { m.sock.send({ t: 'error', code: 'busy', msg: '지금은 방이 너무 많아요. 잠시 뒤에 다시 해 주세요.' }); return; }
        const cap = Math.round(num(msg.cap, 1, MAX_CAP)) || MAX_CAP;
        const room = { code: newCode(), title: clean(msg.title, 30) || `${m.name}의 공연`, cap, pub: msg.pub !== false, host: m.id, members: new Map(), state: null, seed: crypto.randomBytes(4).readUInt32BE(0), created: now };
        rooms.set(room.code, room);
        enter(m, room);
      } else {
        const room = rooms.get(clean(msg.code, 8).toUpperCase());
        if (!room) { m.sock.send({ t: 'error', code: 'notfound', msg: '그런 방이 없어요. 코드를 다시 확인해 주세요.' }); return; }
        if (room.members.size >= room.cap) { m.sock.send({ t: 'error', code: 'full', msg: `방이 가득 찼어요 (${room.cap}명).` }); return; }
        enter(m, room);
      }
      return;
    }
  }
  const room = m.room;
  if (!room) return;
  const isHost = room.host === m.id;
  switch (msg.t) {
    case 'pose': {
      // at most ~15 updates a second
      if (now - m.lastPose < 60) return;
      m.lastPose = now;
      const p = msg.p || {};
      m.pose = { x: num(p.x, -200, 200), y: num(p.y, -50, 100), z: num(p.z, -200, 200), r: num(p.r, -10, 10), s: Math.round(num(p.s, -1, 100000)) || -1, m: p.m ? 1 : 0 };
      if (p.s === 0) m.pose.s = 0;
      broadcast(room, { t: 'pose', id: m.id, p: m.pose }, m);
      return;
    }
    case 'state': {
      if (!isHost) return;
      const s = JSON.stringify(msg.s ?? null);
      if (s.length > 4096) return;
      room.state = msg.s;
      broadcast(room, { t: 'state', s: msg.s }, m);
      return;
    }
    case 'cmd': {
      if (!isHost) return;
      if (JSON.stringify(msg.c ?? null).length > 2048) return;
      broadcast(room, { t: 'cmd', c: msg.c }, m);
      return;
    }
    case 'chat': {
      const text = clean(msg.text, 140);
      if (!text) return;
      // a message every 0.8 s at most
      if (now - m.lastChat < 800) return;
      m.lastChat = now;
      broadcast(room, { t: 'chat', id: m.id, name: m.name, text });
      return;
    }
    case 'handoff': {
      if (!isHost || !room.members.has(msg.id)) return;
      room.host = msg.id;
      broadcast(room, { t: 'host', id: msg.id });
      return;
    }
    default:
  }
}

// attach to an http.Server: WebSocket at /ws
export function attachRooms(server) {
  server.on('upgrade', (req, sock) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') { sock.destroy(); return; }
    const ip = req.socket.remoteAddress || '?';
    if ((perIp.get(ip) || 0) >= PER_IP) { sock.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return; }
    const ws = accept(req, sock);
    if (!ws) return;
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    sockets.add(ws);
    const m = { id: nextId++, sock: ws, name: '', avatar: 'bear', pose: null, room: null, lastPose: 0, lastChat: 0, since: Date.now() };
    ws.onmessage = (msg) => { try { onMessage(m, msg); } catch (e) { console.error(e); } };
    ws.onclose = () => {
      sockets.delete(ws);
      const n = (perIp.get(ip) || 1) - 1;
      if (n <= 0) perIp.delete(ip); else perIp.set(ip, n);
      leave(m);
    };
  });
  heartbeat(() => sockets);
}
