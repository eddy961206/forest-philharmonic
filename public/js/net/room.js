// Watching together: the connection to a room on the server (see
// server/rooms.js). Keeps a clock in step with the server so everyone hears
// the same bar at the same moment, and comes back by itself after a drop.

export async function listRooms() {
  const r = await fetch('api/rooms', { cache: 'no-store' });
  if (!r.ok) throw new Error('no server');
  return r.json();
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
  }

  on(t, fn) { (this.handlers[t] ||= []).push(fn); }
  _emit(t, ...a) { for (const f of this.handlers[t] || []) f(...a); }

  get isHost() { return this.id !== 0 && this.id === this.host; }
  get connected() { return this.ws?.readyState === 1; }
  // the server's clock, in seconds
  now() { return (Date.now() + this.offset) / 1000; }

  _open() {
    return new Promise((resolve, reject) => {
      const url = new URL('ws', location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      const fail = () => reject(new Error('연결할 수 없어요'));
      ws.onerror = fail;
      ws.onopen = () => {
        ws.onerror = null;
        this.ws = ws;
        ws.onmessage = (e) => { try { this._message(JSON.parse(e.data)); } catch (err) { console.error(err); } };
        ws.onclose = () => this._closed();
        resolve();
      };
    });
  }

  // create: { title, cap, pub }  or  join: { code }
  async enter({ name, avatar, create = null, code = null }) {
    this.me = { name, avatar };
    this.closedByUs = false;
    if (!this.connected) await this._open();
    return new Promise((resolve, reject) => {
      this._pending = { resolve, reject };
      if (create) this._send({ t: 'create', name, avatar, title: create.title, cap: create.cap, pub: create.pub });
      else this._send({ t: 'join', name, avatar, code });
    });
  }

  leave() {
    this.closedByUs = true;
    clearInterval(this._pingT);
    try { this.ws?.close(); } catch { /* gone */ }
    this.ws = null;
    this.room = null;
    this.members.clear();
    this.id = 0;
  }

  _send(o) { if (this.connected) this.ws.send(JSON.stringify(o)); }
  pose(p) { this._send({ t: 'pose', p }); }
  state(s) { if (this.isHost) this._send({ t: 'state', s }); }
  cmd(c) { if (this.isHost) this._send({ t: 'cmd', c }); }
  chat(text) { this._send({ t: 'chat', text }); }
  handoff(id) { if (this.isHost) this._send({ t: 'handoff', id }); }

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
        this.offset = m.now - Date.now();
        this.members.clear();
        for (const mm of m.members) this.members.set(mm.id, mm);
        // a few quick pings settle the clock, then one every 10 s
        clearInterval(this._pingT);
        for (let i = 0; i < 5; i++) setTimeout(() => this._ping(), 50 + i * 250);
        this._pingT = setInterval(() => this._ping(), 10000);
        const first = !this._joinedOnce;
        this._joinedOnce = true;
        if (this._pending) { this._pending.resolve(m); this._pending = null; }
        this._emit('joined', m, first);
        return;
      }
      case 'error':
        if (this._pending) { this._pending.reject(Object.assign(new Error(m.msg), { code: m.code })); this._pending = null; }
        else this._emit('error', m);
        return;
      case 'member':
        this.members.set(m.m.id, m.m);
        this._emit('member', m.m);
        return;
      case 'left': {
        const who = this.members.get(m.id);
        this.members.delete(m.id);
        this._emit('left', m.id, who);
        return;
      }
      case 'host':
        this.host = m.id;
        this._emit('host', m.id);
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
      default:
    }
  }

  // a dropped connection: come back into the same room
  _closed() {
    clearInterval(this._pingT);
    this.ws = null;
    if (this.closedByUs || !this.room) return;
    this._emit('disconnected');
    const code = this.room.code;
    let tries = 0;
    const retry = async () => {
      if (this.closedByUs) return;
      tries++;
      try {
        await this.enter({ ...this.me, code });
        this._emit('reconnected');
      } catch (e) {
        if (e.code === 'notfound' || e.code === 'full' || tries > 20) { this.room = null; this._emit('lost', e); return; }
        setTimeout(retry, Math.min(8000, 800 * tries));
      }
    };
    setTimeout(retry, 600);
  }
}
