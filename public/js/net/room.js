// Watching together: the connection to a room on the server (see
// server/rooms.js). Keeps a clock in step with the server so everyone hears
// the same bar at the same moment, and comes back by itself after a drop.

// this tab's own id: a reload, or a dropped line, comes back as the same
// person (their place in the room - and the show, for a host whose line
// dropped). Kept for the tab's life only, never shown to anyone.
function tabId() {
  const make = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('');
  try {
    let id = sessionStorage.getItem('fp-cid');
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id || '')) { id = make(); sessionStorage.setItem('fp-cid', id); }
    return id;
  } catch { return (tabId.mem ||= make()); }
}

// how long entering may take before we stop waiting (a server that never answers)
const ENTER_WAIT = 10000;

export async function listRooms() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch('api/rooms', { cache: 'no-store', signal: controller.signal });
    if (!r.ok) throw new Error('no server');
    const rooms = await r.json();
    if (!Array.isArray(rooms)) throw new Error('invalid room list');
    return rooms;
  } finally { clearTimeout(timer); }
}

export class RoomClient {
  constructor() {
    this.ws = null;
    this.id = 0;
    this.host = 0;
    this.room = null;
    this.members = new Map(); // id -> { id, name, avatar, p }
    this.offset = 0; // server clock - local clock (ms)
    this.bestRtt = Infinity;
    this.handlers = {};
    this.closedByUs = false;
    this._pingT = null;
    this._quickPings = new Set();
    this._epoch = 0;
  }

  on(t, fn) { (this.handlers[t] ||= []).push(fn); }
  _emit(t, ...a) { for (const f of this.handlers[t] || []) f(...a); }

  get isHost() { return this.id !== 0 && this.id === this.host; }
  get connected() { return this.ws?.readyState === 1; }
  // the server's clock, in seconds
  now() { return (Date.now() + this.offset) / 1000; }

  _open(entry) {
    return new Promise((resolve, reject) => {
      const url = new URL('ws', location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      entry.ws = ws;
      const fail = () => reject(new Error('연결할 수 없어요'));
      ws.onerror = fail;
      ws.onclose = fail; // (closed before it opened)
      ws.onopen = () => {
        if (this._entry !== entry || this.closedByUs) { this._closeLine(ws); fail(); return; }
        ws.onerror = null;
        this.ws = ws;
        this._opening = null;
        ws.onmessage = (e) => {
          // An event already queued by a retired connection must not overwrite
          // the replacement's host, clock, or room snapshot.
          if (this.ws !== ws || this.closedByUs) return;
          try { this._message(JSON.parse(e.data)); } catch (err) { console.error(err); }
        };
        ws.onclose = (event) => { if (this.ws === ws) this._closed(event?.code); }; // (an old line closing late is not news)
        resolve();
      };
      this._opening = ws;
    });
  }

  // create: { title, cap, pub }  or  join: { code }
  // resume: back from a dropped line on the same page (the show still runs here)
  async enter({ name, avatar, create = null, code = null, venue = 'hall', resume = false }) {
    this._cancelEntry(new Error('입장이 취소됐어요.'));
    if (!resume) { this._epoch++; clearTimeout(this._retryT); }
    this.me = { name, avatar, venue };
    this.closedByUs = false;
    const cid = tabId();
    // never wait for ever: no line, or a server that does not answer, is an error
    const entry = this._entry = { ws: this.ws };
    const late = new Promise((_, reject) => {
      entry.reject = reject;
      entry.timer = setTimeout(() => this._cancelEntry(new Error('방이 대답하지 않아요. 잠시 뒤에 다시 해 주세요.')), ENTER_WAIT);
    });
    try {
      if (!this.connected) await Promise.race([this._open(entry), late]);
      if (this._entry !== entry || this.closedByUs) throw new Error('입장이 취소됐어요.');
      return await Promise.race([late, new Promise((resolve, reject) => {
        this._pending = { resolve, reject, entry };
        if (create) this._send({ t: 'create', name, avatar, venue, cid, title: create.title, cap: create.cap, pub: create.pub });
        else this._send({ t: 'join', name, avatar, venue, cid, code, resume });
      })]);
    } catch (error) {
      if (this._entry === entry) this._cancelEntry(error);
      throw error;
    } finally {
      clearTimeout(entry.timer);
      if (this._entry === entry) this._entry = null;
      if (this._pending?.entry === entry) this._pending = null;
    }
  }

  _closeLine(ws) {
    if (!ws) return;
    ws.onopen = ws.onerror = ws.onclose = ws.onmessage = null;
    try { ws.close(); } catch { /* gone */ }
  }

  _cancelEntry(error) {
    const entry = this._entry;
    if (!entry) return;
    this._entry = null;
    clearTimeout(entry.timer);
    entry.reject(error);
    if (this._pending?.entry === entry) { this._pending.reject(error); this._pending = null; }
    if (this.ws === entry.ws) this.ws = null;
    if (this._opening === entry.ws) this._opening = null;
    this._closeLine(entry.ws);
  }

  _stopPings() {
    clearInterval(this._pingT);
    for (const timer of this._quickPings) clearTimeout(timer);
    this._quickPings.clear();
  }

  leave() {
    this.closedByUs = true;
    this._epoch++;
    clearTimeout(this._retryT);
    this._stopPings();
    clearTimeout(this._chatT);
    this._chatT = null;
    this._chatQ = [];
    this._send({ t: 'bye' }); // (on purpose: the show passes on at once)
    this._cancelEntry(new Error('입장이 취소됐어요.'));
    this._closeLine(this.ws);
    this._closeLine(this._opening);
    this.ws = null;
    this._opening = null;
    this.room = null;
    this.members.clear();
    this.id = 0;
  }

  _send(o, volatile = false) {
    if (!this.connected) return false;
    // Old poses have no value after a radio stall. Critical messages get a
    // little more room, then reconnect for a fresh state instead of piling up.
    if (this.ws.bufferedAmount > 256 * 1024) {
      this._closeLine(this.ws);
      this._closed();
      return false;
    }
    if (volatile && this.ws.bufferedAmount > 32 * 1024) return false;
    try { this.ws.send(JSON.stringify(o)); return true; }
    catch { this._closeLine(this.ws); this._closed(); return false; }
  }
  pose(p) { this._send({ t: 'pose', p }, true); }
  state(s) { if (this.isHost) this._send({ t: 'state', s }); }
  cmd(c) { if (this.isHost) this._send({ t: 'cmd', c }); }
  // the server takes a line every 0.8 s: a quicker one waits its turn here
  chat(text) {
    const wait = (this._chatAt || 0) + 850 - Date.now();
    if (wait <= 0 && !this._chatQ?.length) { this._chatAt = Date.now(); this._send({ t: 'chat', text }); return; }
    (this._chatQ ||= []).push(text);
    if (this._chatQ.length > 5) this._chatQ.shift();
    if (!this._chatT) this._chatT = setTimeout(() => this._chatNext(), Math.max(0, wait));
  }

  _chatNext() {
    this._chatT = null;
    const text = this._chatQ?.shift();
    if (text === undefined) return;
    this._chatAt = Date.now();
    this._send({ t: 'chat', text });
    if (this._chatQ.length) this._chatT = setTimeout(() => this._chatNext(), 850);
  }
  handoff(id) { if (this.isHost) this._send({ t: 'handoff', id }); }
  vote(k) { this._send({ t: 'vote', k }); } // the encore (the host counts)
  // in step with the show after joining (the host's own reloaded page gets the show back)
  ready() { this._send({ t: 'ready' }); }

  _ping() { this._send({ t: 'ping', c: Date.now() }); }

  _message(m) {
    switch (m.t) {
      case 'pong': {
        const now = Date.now();
        const rtt = now - m.c;
        // keep the estimate from the quickest round trip (least queueing);
        // let it age so a changed network is picked up
        this.bestRtt = Math.min(this.bestRtt * 1.05 + 1, rtt);
        if (rtt <= this.bestRtt + 1) this.offset = m.s - (m.c + rtt / 2);
        return;
      }
      case 'joined': {
        this.id = m.you;
        this.host = m.host;
        this.room = m.room;
        this.seed = m.seed;
        this.bestRtt = Infinity;
        this.offset = m.now - Date.now();
        this.members.clear();
        for (const mm of m.members) this.members.set(mm.id, mm);
        // a few quick pings settle the clock, then one every 10 s
        this._stopPings();
        for (let i = 0; i < 5; i++) {
          const timer = setTimeout(() => { this._quickPings.delete(timer); this._ping(); }, 50 + i * 250);
          this._quickPings.add(timer);
        }
        this._pingT = setInterval(() => this._ping(), 10000);
        const first = !this._joinedOnce;
        this._joinedOnce = true;
        if (this._pending) { this._pending.resolve(m); this._pending = null; }
        this._emit('joined', m, first);
        return;
      }
      case 'error':
        if (this._pending) { this._pending.reject(Object.assign(new Error(m.msg), { code: m.code, venue: m.venue })); this._pending = null; }
        else this._emit('error', m);
        return;
      case 'member':
        this.members.set(m.m.id, m.m);
        this._emit('member', m.m, !!m.back); // (back: the host's own page, reloaded)
        return;
      case 'left': {
        const who = this.members.get(m.id);
        this.members.delete(m.id);
        this._emit('left', m.id, who, !!m.wait); // (wait: the host's line dropped; the room waits for them)
        return;
      }
      case 'host':
        this.host = m.id;
        this._emit('host', m.id, !!m.back); // (back: the same host as before, on a new line)
        return;
      case 'pose': {
        const mm = this.members.get(m.id);
        if (mm) mm.p = m.p;
        this._emit('pose', m.id, m.p);
        return;
      }
      case 'state': this._emit('state', m.s); return;
      case 'cmd': this._emit('cmd', m.c); return;
      case 'chat': this._emit('chat', m); return;
      case 'vote': this._emit('vote', m.id, m.k); return;
      default:
    }
  }

  // a dropped connection: come back into the same room
  _closed(closeCode) {
    this._stopPings();
    clearTimeout(this._chatT);
    this._chatT = null;
    this._chatQ = [];
    this.ws = null;
    const error = closeCode === 4001
      ? Object.assign(new Error('다른 탭에서 연결되어 이 탭의 연결을 종료했어요.'), { code: 'replaced' })
      : new Error('연결이 끊겼어요. 다시 해 주세요.');
    // entering when the line went: that entrance fails (the caller decides)
    if (this._pending) { this._pending.reject(error); this._pending = null; return; }
    if (this.closedByUs || !this.room) return;
    if (closeCode === 4001) {
      this._epoch++;
      clearTimeout(this._retryT);
      this.room = null;
      this._emit('lost', error);
      return;
    }
    this._emit('disconnected');
    const code = this.room.code;
    const epoch = this._epoch;
    let tries = 0;
    const retry = async () => {
      if (this.closedByUs || this._epoch !== epoch) return;
      tries++;
      try {
        await this.enter({ ...this.me, code, resume: true });
        if (this.closedByUs || this._epoch !== epoch) return;
        this._emit('reconnected');
      } catch (e) {
        if (this.closedByUs || this._epoch !== epoch) return;
        if (e.code === 'notfound' || e.code === 'full' || e.code === 'replaced' || tries > 20) { this.room = null; this._emit('lost', e); return; }
        this._retryT = setTimeout(retry, Math.min(8000, 800 * tries));
      }
    };
    clearTimeout(this._retryT);
    this._retryT = setTimeout(retry, 600);
  }
}
