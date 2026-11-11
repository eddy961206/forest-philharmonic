// Rooms: people watch the concert together. The host (방장) runs the show
// and the server passes its state on; everyone else follows. Each member
// also shares where they stand or sit, and can chat.
//
// client -> server                       server -> client
//   create {name, avatar, title, cap, pub, venue, cid} joined {room, you, host, members, state, seed}
//   join   {name, avatar, code, cid, resume} member {m}  left {id}  host {id}
//   pose   {p}                             pose {id, p}
//   state  {s}        (host only)          state {s}
//   cmd    {c}        (host only)          cmd {c}
//   chat   {text}                          chat {id, name, text}
//   handoff {id}      (host only)
//   ping   {c}                             pong {c, s}
//   bye    {}         (leaving on purpose)  error {code, msg}
//   ready  {}         (in step with the show, after joining)
//
// Coming back: cid is a tab's own random id (kept for the tab's life). A
// member who drops and comes back with it gets their place back - their
// seniority, a seat even in a full room - and a host whose line dropped
// (resume: the same page, the show still running there) gets the show back
// if they return within HOST_GRACE. The host's own tab reloaded during the
// show comes in as a guest first; once it has caught up with the show (it
// says 'ready') the show is its again. With neither in HOST_GRACE the
// longest-staying member carries it on. An empty room waits ROOM_GRACE for its people (a reload,
// the invite already sent) before it closes.
import crypto from 'node:crypto';
import { accept, heartbeat } from './ws.js';

const MAX_ROOMS = 300;
const MAX_CAP = 50;
const ROOM_GRACE = 120000; // an empty room stays open this long
const HOST_GRACE = 45000; // a dropped host's show waits this long before it passes on (long enough for a slow reload)
const CATCH_UP = 20000; // (the host's page, reloaded during the show: this long to catch up before the show passes on regardless)
const PRESHOW_GRACE = 60000; // (before the show nothing waits on a host: a reloading host has time to come back)
const FOLLOW_GRACE = 2500; // (before the show: the host's own reloaded tab gets it back this soon after rejoining)
const BACK_GRACE = 120000; // a member who left keeps their place this long
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const HOST_RELAY_BURST = 6;

const maxPerIp = () => Math.max(1, Number(process.env.PER_IP || 64));
const maxRoomsPerIp = () => Math.max(1, Number(process.env.ROOMS_PER_IP || 24));
const joinTimeoutMs = () => Math.max(20, Number(process.env.WS_JOIN_TIMEOUT_MS || 15000));
const byeCloseMs = () => Math.max(20, Number(process.env.WS_BYE_CLOSE_MS || 2000));
const hostRelayRefillMs = () => Math.max(1, Number(process.env.HOST_RELAY_REFILL_MS || 100));

const rooms = new Map(); // code -> room
const sockets = new Set();
const perIp = new Map();
let nextId = 1;

// (invisible and direction-flipping characters go; the zero-width joiner stays: it
// holds emoji such as a family of three together)
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f\u200b\u200c\u200e\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '').trim().slice(0, max);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

// the buildings a room can be in (see public/js/scene/venue.js)
const VENUES = new Set(['hall', 'sphere', 'outdoor']);
const STATE_BOOL_KEYS = ['started', 'loading', 'playing', 'onstage', 'cond', 'skipStageTransitions', 'encore', 'shuffle', 'repeatOne'];

export function clientIp(req, trustProxy = process.env.TRUST_PROXY) {
  const hops = trustProxy === 'true' ? 1 : Math.floor(Number(trustProxy));
  if (Number.isFinite(hops) && hops > 0) {
    const chain = String(req.headers?.['x-forwarded-for'] || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (chain.length > 0) return chain[Math.max(0, chain.length - hops)];
  }
  return req.socket?.remoteAddress || '?';
}

export function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const key of STATE_BOOL_KEYS) {
    if (Object.hasOwn(raw, key) && raw[key] !== undefined) out[key] = Boolean(raw[key]);
  }
  for (const key of ['i', 'inext']) {
    if (Object.hasOwn(raw, key) && raw[key] !== undefined) {
      if (!Number.isInteger(raw[key]) || raw[key] < 0 || raw[key] > 999) return null;
      out[key] = raw[key];
    }
  }
  if (Object.hasOwn(raw, 'pos') && raw.pos !== undefined) {
    if (typeof raw.pos !== 'number' || !Number.isFinite(raw.pos)) return null;
    out.pos = num(raw.pos, 0, 86400);
  }
  for (const key of ['at', 'iu']) {
    if (Object.hasOwn(raw, key) && raw[key] !== undefined) {
      if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) return null;
      out[key] = num(raw[key], -1e15, 1e15);
    }
  }
  for (const key of ['gap', 'interval']) {
    if (Object.hasOwn(raw, key) && raw[key] !== undefined) {
      if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) return null;
      out[key] = num(raw[key], 0, 3600);
    }
  }
  if (Object.hasOwn(raw, 'title') && raw.title !== undefined) out.title = clean(raw.title, 80);
  if (Object.hasOwn(raw, 'phase') && raw.phase !== undefined) out.phase = clean(raw.phase, 24);
  if (Object.hasOwn(raw, 'on') && raw.on !== undefined) {
    if (!Array.isArray(raw.on) || raw.on.length > 128) return null;
    out.on = raw.on
      .filter((item) => typeof item === 'string')
      .map((item) => clean(item, 24))
      .filter((item) => /^[A-Za-z0-9:_-]{1,24}$/.test(item));
  }
  if (Object.hasOwn(raw, 'ev') && raw.ev !== undefined) {
    const ev = raw.ev;
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return null;
    if (!Array.isArray(ev.c) || ev.c.length === 0 || ev.c.length > 3) return null;
    if (!ev.c.every((idx) => Number.isInteger(idx) && idx >= 0 && idx <= 999)) return null;
    if (!Array.isArray(ev.n) || ev.n.length > 3) return null;
    if (!ev.n.every((cnt) => Number.isInteger(cnt) && cnt >= 0 && cnt <= 10000)) return null;
    if (typeof ev.u !== 'number' || !Number.isFinite(ev.u)) return null;
    out.ev = { c: [...ev.c], n: [...ev.n], u: ev.u };
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function sanitizeCmd(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  switch (raw.c) {
    case 'stageTransitions':
      return { c: 'stageTransitions', skip: Boolean(raw.skip) };
    case 'run': {
      if (!Number.isInteger(raw.i) || raw.i < 0 || raw.i > 999) return null;
      const out = {
        c: 'run',
        i: raw.i,
        quick: Boolean(raw.quick),
        skipStageTransitions: Boolean(raw.skipStageTransitions),
        ritual: Boolean(raw.ritual),
      };
      if (Object.hasOwn(raw, 'encore') && raw.encore !== undefined) out.encore = Boolean(raw.encore);
      return out;
    }
    case 'play':
    case 'pause': {
      const out = { c: raw.c };
      if (Object.hasOwn(raw, 'i') && raw.i !== undefined) {
        if (!Number.isInteger(raw.i) || raw.i < 0 || raw.i > 999) return null;
        out.i = raw.i;
      }
      if (Object.hasOwn(raw, 'pos') && raw.pos !== undefined) {
        if (typeof raw.pos !== 'number' || !Number.isFinite(raw.pos)) return null;
        out.pos = num(raw.pos, 0, 86400);
      }
      if (Object.hasOwn(raw, 'at') && raw.at !== undefined) {
        if (typeof raw.at !== 'number' || !Number.isFinite(raw.at)) return null;
        out.at = num(raw.at, -1e15, 1e15);
      }
      return out;
    }
    case 'stay':
      if (!Number.isInteger(raw.i) || raw.i < 0 || raw.i > 999) return null;
      return { c: 'stay', i: raw.i };
    case 'encore':
      if (!Array.isArray(raw.cands) || raw.cands.length === 0 || raw.cands.length > 3) return null;
      if (!raw.cands.every((idx) => Number.isInteger(idx) && idx >= 0 && idx <= 999)) return null;
      if (typeof raw.until !== 'number' || !Number.isFinite(raw.until)) return null;
      return { c: 'encore', cands: [...raw.cands], until: raw.until };
    case 'interval':
      if (!Number.isInteger(raw.i) || raw.i < 0 || raw.i > 999) return null;
      if (typeof raw.until !== 'number' || !Number.isFinite(raw.until)) return null;
      return { c: 'interval', i: raw.i, until: raw.until };
    case 'away':
      return { c: 'away', on: Boolean(raw.on) };
    case 'exit':
      return { c: 'exit' };
    default:
      return null;
  }
}

function allowHostRelay(m, kind, now) {
  const buckets = (m.relayBuckets ??= {});
  const refill = hostRelayRefillMs();
  const bucket = (buckets[kind] ??= { tokens: HOST_RELAY_BURST, at: now });
  const elapsed = Math.max(0, now - bucket.at);
  bucket.tokens = Math.min(HOST_RELAY_BURST, bucket.tokens + elapsed / refill);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

function newCode() {
  for (;;) {
    let c = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) c += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    if (!rooms.has(c)) return c;
  }
}

const info = (m) => ({ id: m.id, name: m.name, avatar: m.avatar, p: m.pose, since: m.since });

function broadcast(room, msg, except = null) {
  const s = JSON.stringify(msg);
  for (const m of [...room.members.values()]) if (m !== except) m.sock.send(s);
}

export function publicRooms() {
  return [...rooms.values()]
    .filter((r) => r.pub && r.members.size) // (an empty room waiting for its people is not on show)
    .map((r) => ({ code: r.code, title: r.title, count: r.members.size, cap: r.cap, venue: r.venue, playing: !!r.state?.playing, piece: r.state?.started ? clean(r.state.title, 80) : '' }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);
}

// bye: left on purpose (the show passes on at once); otherwise the line
// dropped or the page reloaded, and the host gets a moment to come back
// one room by its code: the booth asks before it sells a friend's ticket
// (which building, and is there a seat) - null if there is no such room
export function roomLookup(code) {
  const r = rooms.get(String(code || '').toUpperCase());
  return r ? { code: r.code, venue: r.venue, full: r.members.size + held(r) >= r.cap } : null;
}

// places kept for members whose line dropped (they count as taken for newcomers)
function held(room, now = Date.now()) {
  let n = 0;
  for (const b of room.back.values()) if (now - b.at < BACK_GRACE && !room.members.has(b.id)) n++;
  return n;
}

function leave(m, bye = false) {
  const room = m.room;
  if (!room) return;
  m.room = null;
  room.members.delete(m.id);
  room.votes.delete(m.id);
  // (a dropped line keeps its place; a goodbye gives it up)
  if (m.cid && !bye) room.back.set(m.cid, { id: m.id, since: m.since, at: Date.now() });
  if (!room.members.size) {
    clearTimeout(room.awayT);
    if (bye && !held(room)) {
      rooms.delete(room.code);
      return;
    }
    // empty: it waits a while for its people (see the sweep in attachRooms)
    room.emptyAt = Date.now();
    return;
  }
  // (the host's line dropped: the room waits for them, and says so)
  const awaited = room.host === m.id && !bye && !!m.cid;
  broadcast(room, awaited ? { t: 'left', id: m.id, wait: true } : { t: 'left', id: m.id });
  if (room.host !== m.id) return;
  clearTimeout(room.awayT);
  if (bye || !m.cid) { promote(room); return; }
  room.awayT = setTimeout(() => { if (!room.members.has(room.host)) promote(room); }, room.state?.started ? HOST_GRACE : PRESHOW_GRACE);
}

// the host's own tab, back on a new line, carries the show on - else the
// longest-staying member takes it over (one still catching up with the show
// only when there is nobody else)
function promote(room) {
  const all = [...room.members.values()].sort((a, b) => a.since - b.since);
  const mine = all.find((x) => x.cid && x.cid === room.hostCid);
  const next = (mine && !mine.behind ? mine : null) || all.find((x) => !x.behind) || mine || all[0];
  if (next) setHost(room, next);
}

function setHost(room, m) {
  clearTimeout(room.awayT);
  // (the same tab as before, on a new line: the room hears "back", not "new")
  const back = !!m.cid && m.cid === room.hostCid && room.host !== m.id;
  m.behind = false;
  room.host = m.id;
  room.hostCid = m.cid;
  broadcast(room, back ? { t: 'host', id: m.id, back: true } : { t: 'host', id: m.id });
  // the lanterns already up go to whoever counts them now
  for (const [id, k] of room.votes) if (id !== m.id) m.sock.send({ t: 'vote', id, k });
}

function enter(m, room, resume = false) {
  clearTimeout(m.joinT);
  m.joinT = null;
  const now = Date.now();
  // coming back (same tab): the same id and seniority as before
  const back = m.cid ? room.back.get(m.cid) : null;
  room.back.delete(m.cid);
  if (back && now - back.at < BACK_GRACE) {
    m.since = back.since;
    // (a reloaded page is not the show's host straight away: it follows first)
    if (!room.members.has(back.id) && (resume || back.id !== room.host)) m.id = back.id;
  } else m.since = now;
  const empty = !room.members.size;
  const hostAway = !empty && !room.members.has(room.host);
  m.room = room;
  room.members.set(m.id, m);
  let hostBack = false;
  let gotShow = false;
  let ownPage = false; // the host's own tab back (a dropped line, or reloaded: then it follows first)
  if (empty) {
    // A sole host reconnecting still has the running show on its page. Keep
    // its snapshot for guests arriving before that page publishes again.
    const continuing = resume && m.cid && m.cid === room.hostCid && back && now - back.at < BACK_GRACE;
    room.emptyAt = 0;
    room.host = m.id;
    room.hostCid = m.cid;
    if (!continuing) room.state = null;
    room.votes.clear();
  } else if (hostAway && resume && m.cid && m.cid === room.hostCid) {
    // the host's line dropped and came back: the show is theirs again
    clearTimeout(room.awayT);
    hostBack = room.host !== m.id;
    room.host = m.id;
    gotShow = true;
    ownPage = true;
  } else if (hostAway && m.cid && m.cid === room.hostCid && !room.state?.started) {
    // the host's own page, reloaded before the show: it joins as a guest, then
    // gets the show back soon (promote finds it by its cid)
    ownPage = true;
    clearTimeout(room.awayT);
    room.awayT = setTimeout(() => { if (!room.members.has(room.host)) promote(room); }, FOLLOW_GRACE);
  } else if (hostAway && m.cid && m.cid === room.hostCid) {
    // ... reloaded during the show: it follows the show first and gets it back
    // as soon as it is in step (its 'ready'); nobody else is given it meanwhile
    ownPage = true;
    m.behind = true;
    clearTimeout(room.awayT);
    room.awayT = setTimeout(() => { if (!room.members.has(room.host)) promote(room); }, CATCH_UP);
  }
  m.sock.send({
    t: 'joined',
    room: { code: room.code, title: room.title, cap: room.cap, pub: room.pub, venue: room.venue },
    you: m.id,
    host: room.host,
    members: [...room.members.values()].map(info),
    state: room.state,
    seed: room.seed,
    now: Date.now(),
  });
  broadcast(room, ownPage ? { t: 'member', m: info(m), back: true } : { t: 'member', m: info(m) }, m);
  if (hostBack) broadcast(room, { t: 'host', id: m.id, back: true }, m);
  // (the lanterns raised while the host was away)
  if (gotShow) for (const [id, k] of room.votes) if (id !== m.id) m.sock.send({ t: 'vote', id, k });
}

function onMessage(m, msg) {
  const now = Date.now();
  switch (msg.t) {
    case 'ping':
      m.sock.send({ t: 'pong', c: msg.c, s: now });
      return;
    case 'create':
    case 'join': {
      if (m.room || m.done) return; // (a line that said goodbye does not come back in)
      m.name = clean(msg.name, 16) || '이름 없는 동물';
      m.avatar = /^[a-z]{2,12}$/.test(msg.avatar) ? msg.avatar : 'bear';
      m.cid = typeof msg.cid === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(msg.cid) ? msg.cid : '';
      if (msg.t === 'create') {
        let mine = 0; for (const r of rooms.values()) if (r.ip === m.ip) mine++;
        if (rooms.size >= MAX_ROOMS || mine >= maxRoomsPerIp()) { m.sock.send({ t: 'error', code: 'busy', msg: '지금은 방이 너무 많아요. 잠시 뒤에 다시 해 주세요.' }); return; }
        const cap = Math.round(num(msg.cap, 1, MAX_CAP)) || MAX_CAP;
        const room = { ip: m.ip, code: newCode(), title: clean(msg.title, 30) || `${m.name}의 공연`, cap, pub: msg.pub !== false, venue: VENUES.has(msg.venue) ? msg.venue : 'hall', host: m.id, hostCid: m.cid, members: new Map(), state: null, seed: crypto.randomBytes(4).readUInt32BE(0), created: now, emptyAt: 0, awayT: null, votes: new Map(), back: new Map() };
        rooms.set(room.code, room);
        enter(m, room);
      } else {
        const room = rooms.get(clean(msg.code, 8).toUpperCase());
        if (!room) { m.sock.send({ t: 'error', code: 'notfound', msg: '그 방을 찾지 못했어요. 방이 닫혔거나 코드가 달라요.' }); return; }
        // Validate the destination before retiring a tab's previous connection.
        if ((VENUES.has(msg.venue) ? msg.venue : 'hall') !== room.venue) { m.sock.send({ t: 'error', code: 'venue', venue: room.venue, msg: '다른 공연장의 방이에요. 그 공연장으로 옮겨 갈게요.' }); return; }
        // A radio switch can open the replacement before TCP notices the old
        // connection died. The same tab keeps one member and its reserved seat.
        if (m.cid) for (const old of [...room.members.values()]) {
          // A duplicated browser tab inherits sessionStorage too. Tell the old
          // tab to stop reconnecting, rather than having both tabs evict each other.
          if (old.cid === m.cid) { old.sock.close(4001); break; }
        }
        // (someone coming back has their place kept, even in a full room)
        const back = m.cid && room.back.get(m.cid);
        const kept = !!(back && now - back.at < BACK_GRACE && !room.members.has(back.id));
        if (room.members.size + held(room, now) - (kept ? 1 : 0) >= room.cap) { m.sock.send({ t: 'error', code: 'full', msg: `방이 가득 찼어요 (${room.cap}명).` }); return; }
        enter(m, room, msg.resume === true);
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
      const serialized = JSON.stringify(msg.s ?? null);
      if (serialized.length > 4096) return;
      const safe = sanitizeState(msg.s);
      if (!safe || !allowHostRelay(m, 'state', now)) return;
      room.state = safe;
      broadcast(room, { t: 'state', s: safe }, m);
      return;
    }
    case 'cmd': {
      if (!isHost) return;
      if (JSON.stringify(msg.c ?? null).length > 2048) return;
      const safe = sanitizeCmd(msg.c);
      if (!safe || !allowHostRelay(m, 'cmd', now)) return;
      if (safe.c === 'encore') room.votes.clear(); // (a new vote: no lanterns up yet)
      broadcast(room, { t: 'cmd', c: safe }, m);
      return;
    }
    case 'chat': {
      const text = clean(msg.text, 140);
      if (!text) return;
      // a message every 0.8 s at most
      // (the client waits its turn; one that does not is told, not ignored)
      if (now - m.lastChat < 800) { m.sock.send({ t: 'error', code: 'slow', msg: '조금 천천히 보내 주세요.' }); return; }
      m.lastChat = now;
      broadcast(room, { t: 'chat', id: m.id, name: m.name, text });
      return;
    }
    case 'vote': {
      // the encore: one lantern each, told to the host only (who counts)
      if (now - (m.lastVote || 0) < 250) return;
      m.lastVote = now;
      const k = Math.round(num(msg.k, -1, 2));
      // kept here too: a new host (or one back from a dropped line) is told them
      if (k >= 0) room.votes.set(m.id, k); else room.votes.delete(m.id);
      const host = room.members.get(room.host);
      if (host && host !== m) host.sock.send({ t: 'vote', id: m.id, k });
      return;
    }
    case 'ready': {
      // the host's own page, back during the show, has caught up: the show is its again
      if (m.behind && m.cid === room.hostCid && !room.members.has(room.host)) setHost(room, m);
      m.behind = false;
      return;
    }
    case 'handoff': {
      if (!isHost || !room.members.has(msg.id)) return;
      setHost(room, room.members.get(msg.id));
      return;
    }
    case 'bye':
      leave(m, true);
      m.done = true; // (the client closes its line after a goodbye)
      clearTimeout(m.byeT);
      m.byeT = setTimeout(() => { if (m.sock.open) m.sock.close(1000); }, byeCloseMs());
      m.byeT.unref();
      return;
    default:
  }
}

// attach to an http.Server: WebSocket at /ws
export function attachRooms(server) {
  server.on('upgrade', (req, sock, head) => {
    if (!req.url || !req.url.startsWith('/') || req.url.startsWith('//')) { sock.destroy(); return; }
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { sock.destroy(); return; }
    if (url.pathname !== '/ws') { sock.destroy(); return; }
    const ip = clientIp(req);
    if ((perIp.get(ip) || 0) >= maxPerIp()) { sock.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return; }
    const ws = accept(req, sock);
    if (!ws) return;
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    sockets.add(ws);
    const m = { id: nextId++, sock: ws, name: '', avatar: 'bear', pose: null, room: null, lastPose: 0, lastChat: 0, since: Date.now(), cid: '', ip, joinT: null, byeT: null };
    m.joinT = setTimeout(() => {
      if (!m.room && ws.open) ws.close(1008);
    }, joinTimeoutMs());
    m.joinT.unref();
    ws.onmessage = (msg) => { try { onMessage(m, msg); } catch (e) { console.error(e); } };
    ws.onclose = () => {
      clearTimeout(m.joinT);
      clearTimeout(m.byeT);
      m.joinT = null;
      m.byeT = null;
      sockets.delete(ws);
      const n = (perIp.get(ip) || 1) - 1;
      if (n <= 0) perIp.delete(ip); else perIp.set(ip, n);
      leave(m);
    };
    // Node may already have read the first frame together with the upgrade.
    if (head.length) ws._data(head);
  });
  const pingTimer = heartbeat(() => sockets);
  // empty rooms nobody came back to close; old places are forgotten
  const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const r of rooms.values()) {
      if (r.emptyAt && now - r.emptyAt > ROOM_GRACE) { rooms.delete(r.code); continue; }
      for (const [cid, b] of r.back) if (now - b.at > BACK_GRACE) r.back.delete(cid);
    }
  }, 10000).unref();
  const dispose = () => {
    clearInterval(pingTimer);
    clearInterval(sweepTimer);
    for (const ws of [...sockets]) ws.close(1001);
    for (const room of rooms.values()) clearTimeout(room.awayT);
    rooms.clear();
  };
  server.once('close', dispose);
  return dispose;
}
