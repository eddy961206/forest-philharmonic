import net from 'node:net';
import crypto from 'node:crypto';

export function maskedFrame(payload, { op = 1, fin = true, rsv = 0 } = {}) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const width = data.length < 126 ? 2 : 4;
  const head = Buffer.alloc(width + 4);
  head[0] = (fin ? 0x80 : 0) | rsv | op;
  head[1] = 0x80 | (width === 2 ? data.length : 126);
  if (width === 4) head.writeUInt16BE(data.length, 2);
  const mask = Buffer.from([5, 17, 31, 53]);
  mask.copy(head, width);
  return Buffer.concat([head, Buffer.from(data.map((v, i) => v ^ mask[i & 3]))]);
}

export async function connectRoom(port, firstMessage) {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  let buffer = Buffer.alloc(0);
  let upgraded = false;
  const messages = [];
  const waiting = [];
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  socket.once('close', () => resolveClosed({ code: 1006 }));
  const push = message => {
    const index = waiting.findIndex(w => w.predicate(message));
    if (index >= 0) { const [w] = waiting.splice(index, 1); clearTimeout(w.timer); w.resolve(message); }
    else messages.push(message);
  };
  const next = (predicate = () => true) => {
    const index = messages.findIndex(predicate);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject };
      waiter.timer = setTimeout(() => { waiting.splice(waiting.indexOf(waiter), 1); reject(new Error('Timed out waiting for room message')); }, 5000);
      waiting.push(waiter);
    });
  };
  const opened = new Promise((resolve, reject) => {
    socket.on('error', reject);
    socket.on('connect', () => {
      const handshake = Buffer.from(`GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\n\r\n`);
      socket.write(firstMessage ? Buffer.concat([handshake, maskedFrame(firstMessage)]) : handshake);
    });
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        if (!buffer.toString('utf8', 0, end).startsWith('HTTP/1.1 101')) { reject(new Error(buffer.toString())); return; }
        buffer = buffer.subarray(end + 4);
        upgraded = true;
        resolve();
      }
      while (buffer.length >= 2) {
        const op = buffer[0] & 15;
        let len = buffer[1] & 127;
        let off = 2;
        if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buffer.length < 10) return; len = Number(buffer.readBigUInt64BE(2)); off = 10; }
        if (buffer.length < off + len) return;
        const data = buffer.subarray(off, off + len);
        buffer = buffer.subarray(off + len);
        if (op === 1) push(JSON.parse(data.toString()));
        else if (op === 9) socket.write(maskedFrame(data, { op: 10 }));
        else if (op === 8) resolveClosed({ code: data.length >= 2 ? data.readUInt16BE(0) : 1005 });
      }
    });
  });
  await opened;
  return {
    socket, next, closed,
    send(message) { socket.write(maskedFrame(message)); },
    close() {
      for (const w of waiting.splice(0)) { clearTimeout(w.timer); w.reject(new Error('Connection closed')); }
      socket.destroy();
    },
  };
}
