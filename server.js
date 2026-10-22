#!/usr/bin/env node
// Forest Philharmonic server: static files, plus rooms for watching
// together (WebSocket at /ws, public room list at /api/rooms).
// No dependencies: Node 18+.
//   PORT=8080 HOST=0.0.0.0 node server.js
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { attachRooms, publicRooms, roomLookup } from './server/rooms.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.md']);
const gzip = promisify(zlib.gzip);
const gzCache = new Map(); // bounded LRU, sharing compression already in progress
const MAX_GZIP_CACHE = 16 * 1024 * 1024;
let gzipBytes = 0;

function acceptsGzip(header = '') {
  const encodings = new Map(header.toLowerCase().split(',').map(part => {
    const [name, ...params] = part.trim().split(';');
    const q = params.find(p => p.trim().startsWith('q='));
    return [name, q ? Number(q.trim().slice(2)) : 1];
  }));
  return (encodings.get('gzip') ?? encodings.get('*') ?? 0) > 0;
}

function compressed(file, stat) {
  let entry = gzCache.get(file);
  if (entry && entry.mtime === stat.mtimeMs && entry.size === stat.size) {
    gzCache.delete(file);
    gzCache.set(file, entry);
    return entry.promise;
  }
  if (entry?.gz) gzipBytes -= entry.gz.length;
  entry = { mtime: stat.mtimeMs, size: stat.size };
  entry.promise = fsp.readFile(file).then(raw => gzip(raw, { level: 6 })).then(gz => {
    if (gzCache.get(file) === entry) {
      entry.gz = gz;
      gzipBytes += gz.length;
      while (gzipBytes > MAX_GZIP_CACHE || gzCache.size > 128) {
        const key = gzCache.keys().next().value;
        gzipBytes -= gzCache.get(key).gz?.length || 0;
        gzCache.delete(key);
      }
    }
    return gz;
  }).catch(error => {
    if (gzCache.get(file) === entry) gzCache.delete(file);
    throw error;
  });
  gzCache.set(file, entry);
  return entry.promise;
}

function streamFile(file, res, options) {
  // Handles files removed after stat, and closes the disk stream when the
  // browser cancels a large sample download. No unhandled stream errors.
  pipeline(fs.createReadStream(file, options), res, () => {});
}

function log(req, status, bytes) {
  if (process.env.QUIET) return;
  const t = new Date().toISOString().slice(11, 19);
  console.log(`${t} ${status} ${req.method} ${req.url} ${bytes ?? ''}`);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/rooms/')) {
      const r = roomLookup(url.pathname.slice(11).replace(/[^A-Za-z0-9]/g, '').slice(0, 6));
      res.writeHead(r ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(r || { error: 'notfound' }));
      return;
    }
    if (url.pathname === '/api/rooms') {
      const body = JSON.stringify(publicRooms());
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
      return;
    }
    let rel;
    try { rel = decodeURIComponent(url.pathname); }
    catch { res.writeHead(400).end(); return; }
    if (rel.includes('\0')) { res.writeHead(400).end(); return; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
      res.writeHead(403).end();
      log(req, 403);
      return;
    }
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      log(req, 404);
      return;
    }
    if (stat.isDirectory()) {
      res.writeHead(301, { Location: `${url.pathname.replace(/\/?$/, '/')}${url.search}` }).end();
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    const identityTag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    let range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    const ifRange = req.headers['if-range'];
    if (range && ifRange && ifRange !== identityTag && !(Number.isFinite(Date.parse(ifRange)) && Math.floor(stat.mtimeMs / 1000) <= Date.parse(ifRange) / 1000)) range = null;
    const useGzip = !range && COMPRESSIBLE.has(ext) && acceptsGzip(req.headers['accept-encoding']);
    // Compressed bytes are a different representation and need their own
    // strong validator. Vary also belongs on identity and 304 responses.
    const etag = useGzip ? identityTag.replace(/"$/, '-gzip"') : identityTag;
    const headers = {
      'Content-Type': type,
      ETag: etag,
      'Last-Modified': stat.mtime.toUTCString(),
      // audio + vendored libraries rarely change; app code revalidates
      'Cache-Control': ext === '.mp3' || rel.startsWith('/vendor/') ? 'public, max-age=604800' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    };
    if (COMPRESSIBLE.has(ext)) headers.Vary = 'Accept-Encoding';
    if (useGzip) headers['Content-Encoding'] = 'gzip';
    if (req.headers['if-none-match']?.split(',').some(tag => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag)) {
      res.writeHead(304, headers).end();
      log(req, 304);
      return;
    }

    // Async compression keeps room messages moving on a cold asset request.
    if (useGzip) {
      const gz = await compressed(file, stat);
      headers['Content-Length'] = gz.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : gz);
      log(req, 200, gz.length);
      return;
    }

    // byte ranges (media scrubbing)
    if (range) {
      let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
      start = Math.max(0, start);
      end = Math.min(stat.size - 1, end);
      if ((!range[1] && !range[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') { res.end(); return; }
      streamFile(file, res, { start, end });
      log(req, 206, end - start + 1);
      return;
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    streamFile(file, res);
    log(req, 200, stat.size);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500).end();
    else res.destroy();
  }
});

const disposeRooms = attachRooms(server);

server.listen(PORT, HOST, () => {
  const port = server.address().port;
  const lines = [`\n  🌲🎻  숲속 필하모닉이 열렸어요\n`, `  이 컴퓨터:     http://localhost:${port}`];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) lines.push(`  같은 와이파이: http://${ni.address}:${port}`);
    }
  }
  lines.push('\n  끄려면 Ctrl + C\n');
  console.log(lines.join('\n'));
});

const shutdown = () => { disposeRooms(); server.close(() => process.exit(0)); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
