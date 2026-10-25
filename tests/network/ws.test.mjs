import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Socket, accept } from '../../server/ws.js';
import { maskedFrame } from './helpers.mjs';

class Wire extends EventEmitter {
  writableLength = 0;
  writes = [];
  setNoDelay() {}
  write(data) { this.writes.push(data); return true; }
  end(data) { if (data) this.write(data); }
  destroy() { this.destroyed = true; this.emit('close'); }
}
function peer(t) {
  const wire = new Wire();
  const ws = new Socket(wire);
  t.after(() => wire.destroy());
  return { wire, ws };
}
const closeCode = wire => wire.writes.at(-1)?.readUInt16BE(2);

test('fragmented JSON survives an interleaved ping and split TCP reads', t => {
  const { wire, ws } = peer(t);
  const messages = [];
  ws.onmessage = m => messages.push(m);
  const first = maskedFrame('{"t":', { fin: false });
  ws._data(first.subarray(0, 3));
  ws._data(first.subarray(3));
  ws._data(maskedFrame('hello', { op: 9 }));
  ws._data(maskedFrame('"ping"}', { op: 0 }));
  assert.deepEqual(messages, [{ t: 'ping' }]);
  assert.equal(wire.writes[0][0], 0x8a);
  assert.equal(ws.partBytes, 0);
});

test('invalid fragments and control frames close before reaching room state', async t => {
  for (const [name, frame] of [
    ['orphan continuation', maskedFrame('{}', { op: 0 })],
    ['fragmented ping', maskedFrame('', { op: 9, fin: false })],
    ['oversized ping', maskedFrame('x'.repeat(126), { op: 9 })],
    ['reserved bits', maskedFrame('{}', { rsv: 0x40 })],
    ['invalid close payload', maskedFrame(Buffer.from([0]), { op: 8 })],
  ]) await t.test(name, t => {
    const { wire, ws } = peer(t);
    ws._data(frame);
    assert.equal(ws.open, false);
    assert.equal(closeCode(wire), 1002);
  });
});

test('a new text message cannot interrupt an unfinished fragment', t => {
  const { wire, ws } = peer(t);
  ws._data(maskedFrame('{', { fin: false }));
  ws._data(maskedFrame('{}'));
  assert.equal(closeCode(wire), 1002);
});

test('empty fragments do not accumulate while fragmented UTF-8 still completes', t => {
  const { ws } = peer(t);
  const messages = [];
  ws.onmessage = message => messages.push(message);
  ws._data(maskedFrame('', { fin: false }));
  const empty = maskedFrame('', { op: 0, fin: false });
  for (let i = 0; i < 10000; i++) ws._data(empty);
  assert.equal(ws.open, true);
  assert.equal(ws.parts.length, 0);
  assert.equal(ws.partBytes, 0);

  const text = Buffer.from('{"text":"숲"}');
  // Split inside the Korean character, with empty fragments in between.
  const split = Buffer.byteLength('{"text":"') + 1;
  ws._data(maskedFrame(text.subarray(0, split), { op: 0, fin: false }));
  for (let i = 0; i < 10000; i++) ws._data(empty);
  assert.equal(ws.parts.length, 1);
  assert.equal(ws.partBytes, split);
  ws._data(maskedFrame(text.subarray(split), { op: 0, fin: false }));
  ws._data(maskedFrame('', { op: 0 }));
  assert.deepEqual(messages, [{ text: '숲' }]);
  assert.equal(ws.parts.length, 0);
  assert.equal(ws.partBytes, 0);
});

test('invalid UTF-8 and oversized fragmented messages are rejected', t => {
  const first = peer(t);
  first.ws._data(maskedFrame(Buffer.from([0xff])));
  assert.equal(closeCode(first.wire), 1007);
  const second = peer(t);
  second.ws._data(maskedFrame('x'.repeat(40000), { fin: false }));
  second.ws._data(maskedFrame('x'.repeat(40000), { op: 0 }));
  assert.equal(closeCode(second.wire), 1009);
  assert.equal(second.ws.parts.length, 0);
});

test('slow receivers are disconnected before their queued output grows', t => {
  const { wire, ws } = peer(t);
  let closes = 0;
  ws.onclose = () => closes++;
  wire.writableLength = 256 * 1024;
  ws.send({ t: 'pose', p: { x: 1 } });
  ws.send({ t: 'pose', p: { x: 2 } });
  assert.equal(wire.writes.length, 0);
  assert.equal(wire.destroyed, true);
  assert.equal(closes, 1);
});

test('upgrade validates the WebSocket version and 16-byte nonce', () => {
  const base = { method: 'GET', headers: { upgrade: 'websocket', connection: 'keep-alive, Upgrade', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' } };
  for (const headers of [
    { ...base.headers, 'sec-websocket-version': '12' },
    { ...base.headers, 'sec-websocket-key': 'bad' },
    { ...base.headers, connection: 'keep-alive' },
  ]) {
    const wire = new Wire();
    assert.equal(accept({ ...base, headers }, wire), null);
    assert.match(wire.writes[0], /400 Bad Request/);
  }
  const wire = new Wire();
  const ws = accept(base, wire);
  assert.ok(ws);
  assert.match(wire.writes[0], /s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/);
  wire.destroy();
});
