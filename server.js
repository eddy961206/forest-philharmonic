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
const gzCache = new Map(); // path -> { mtime, gz, etag }

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
    let rel = decodeURIComponent(url.pathname);
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
      res.writeHead(301, { Location: `${url.pathname.replace(/\/?$/, '/')}` }).end();
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': type,
      ETag: etag,
      'Last-Modified': stat.mtime.toUTCString(),
      // audio + vendored libraries rarely change; app code revalidates
      'Cache-Control': ext === '.mp3' || rel.startsWith('/vendor/') ? 'public, max-age=604800' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      log(req, 304);
      return;
    }

    // gzip text assets (cached in memory)
    const ae = req.headers['accept-encoding'] || '';
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(ae)) {
      let c = gzCache.get(file);
      if (!c || c.mtime !== stat.mtimeMs) {
        const raw = await fsp.readFile(file);
        c = { mtime: stat.mtimeMs, gz: zlib.gzipSync(raw, { level: 6 }) };
        gzCache.set(file, c);
      }
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = c.gz.length;
      headers.Vary = 'Accept-Encoding';
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : c.gz);
      log(req, 200, c.gz.length);
      return;
    }

    // byte ranges (media scrubbing)
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
      start = Math.max(0, start);
      end = Math.min(stat.size - 1, end);
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file, { start, end }).pipe(res);
      log(req, 206, end - start + 1);
      return;
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
    log(req, 200, stat.size);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500).end();
  }
});

attachRooms(server);

server.listen(PORT, HOST, () => {
  const lines = [`\n  🌲🎻  숲속 필하모닉이 열렸어요\n`, `  이 컴퓨터:     http://localhost:${PORT}`];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) lines.push(`  같은 와이파이: http://${ni.address}:${PORT}`);
    }
  }
  lines.push('\n  끄려면 Ctrl + C\n');
  console.log(lines.join('\n'));
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
