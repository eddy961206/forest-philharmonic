// A small WebSocket server (RFC 6455), enough for JSON messages between the
// browsers in a room: text frames, fragmentation, ping/pong, close. No
// dependencies.
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 64 * 1024;

export class Socket {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.parts = [];
    this.open = true;
    this.alive = true;
    this.onmessage = null;
    this.onclose = null;
    sock.setNoDelay(true);
    sock.on('data', (d) => this._data(d));
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
  }

  send(obj) {
    if (!this.open) return;
    const data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
    this._frame(0x1, data);
  }

  close(code = 1000) {
    if (!this.open) return;
    const b = Buffer.alloc(2);
    b.writeUInt16BE(code);
    this._frame(0x8, b);
    this.sock.end();
    this._closed();
  }

  ping() { if (this.open) this._frame(0x9, Buffer.alloc(0)); }

  _frame(op, data) {
    const n = data.length;
    let head;
    if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
    else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    head[0] = 0x80 | op;
    try { this.sock.write(Buffer.concat([head, data])); } catch { this._closed(); }
  }

  _data(d) {
    this.alive = true;
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) { this.close(1009); return; }
        len = Number(big);
        off = 10;
      }
      if (len > MAX_MESSAGE) { this.close(1009); return; }
      // browsers must mask what they send
      if (!masked) { this.close(1002); return; }
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);

      if (op === 0x8) { this.close(); return; }
      if (op === 0x9) { this._frame(0xa, payload); continue; }
      if (op === 0xa) { this.alive = true; continue; }
      if (op === 0x1 || op === 0x0) {
        this.parts.push(payload);
        const total = this.parts.reduce((a, p) => a + p.length, 0);
        if (total > MAX_MESSAGE) { this.close(1009); return; }
        if (!fin) continue;
        const text = Buffer.concat(this.parts).toString('utf8');
        this.parts = [];
        let msg;
        try { msg = JSON.parse(text); } catch { continue; }
        if (msg && typeof msg === 'object' && this.onmessage) this.onmessage(msg);
        continue;
      }
      // binary frames are not used
      this.close(1003);
      return;
    }
  }

  _closed() {
    if (!this.open) return;
    this.open = false;
    try { this.sock.destroy(); } catch { /* already gone */ }
    if (this.onclose) this.onclose();
  }
}

// Answer the HTTP upgrade; returns a Socket or null
export function accept(req, sock) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    sock.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const hash = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`,
    '', '',
  ].join('\r\n'));
  return new Socket(sock);
}

// drop connections that stop answering pings
export function heartbeat(list, ms = 25000) {
  return setInterval(() => {
    for (const s of list()) {
      if (!s.alive) { s.close(1001); continue; }
      s.alive = false;
      s.ping();
    }
  }, ms);
}
