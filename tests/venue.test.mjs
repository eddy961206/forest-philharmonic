import assert from 'node:assert/strict';
import test from 'node:test';

let sequence = 0;
async function venue(t, { query = '', stored = null, blocked = false } = {}) {
  const storage = new Map(stored ? [['fp-venue', stored]] : []);
  const values = {
    location: { search: query, href: `http://localhost/hall.html${query}` },
    localStorage: {
      getItem(key) { if (blocked) throw new Error('storage disabled'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw new Error('storage disabled'); storage.set(key, value); },
    },
  };
  for (const [key, value] of Object.entries(values)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    t.after(() => old ? Object.defineProperty(globalThis, key, old) : delete globalThis[key]);
  }
  return { module: await import(`../public/js/scene/venue.js?test=${++sequence}`), storage };
}

test('outdoor URL selection wins over a remembered venue and has its own labels', async t => {
  const { module: v } = await venue(t, { query: '?venue=outdoor', stored: 'sphere' });
  assert.equal(v.VENUE, 'outdoor');
  assert.equal(v.IS_SPHERE, false);
  assert.equal(v.IS_OUTDOOR, true);
  assert.equal(v.VENUES.outdoor.id, 'outdoor');
  for (const field of ['ko', 'short', 'title', 'intro']) assert.ok(v.VENUES.outdoor[field]?.trim(), field);
  assert.notEqual(v.VENUES.outdoor.ko, v.VENUES.hall.ko);
});

test('remembered outdoor selection is restored when the URL has no known venue', async t => {
  const { module: v } = await venue(t, { query: '?venue=unknown', stored: 'outdoor' });
  assert.equal(v.VENUE, 'outdoor');
});

test('storage failure still permits an explicit outdoor URL', async t => {
  const { module: v } = await venue(t, { query: '?venue=outdoor', blocked: true });
  assert.equal(v.VENUE, 'outdoor');
});

test('unknown venue and unavailable storage safely choose the hall', async t => {
  const { module: v } = await venue(t, { query: '?venue=unknown', blocked: true });
  assert.equal(v.VENUE, 'hall');
});

test('outdoor navigation saves selection, replaces room codes and opens its lobby', async t => {
  const { module: v, storage } = await venue(t, { query: '?venue=hall&room=OLD&quality=low' });
  v.goVenue('outdoor');
  let url = new URL(location.href);
  assert.equal(storage.get('fp-venue'), 'outdoor');
  assert.equal(url.searchParams.get('venue'), 'outdoor');
  assert.equal(url.searchParams.get('lobby'), '1');
  assert.equal(url.searchParams.has('room'), false);
  assert.equal(url.searchParams.get('quality'), 'low');
  v.goVenue('outdoor', { room: 'ABCDEF' });
  url = new URL(location.href);
  assert.equal(url.searchParams.get('room'), 'ABCDEF');
  const before = location.href;
  v.goVenue('unknown');
  assert.equal(location.href, before);
});
