// QA only. No Playwright routes: route interception disables Chromium's HTTP
// cache and would make a cold/warm comparison invalid.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { viewport } from './browser.mjs';

const FONT_FAMILIES = [['gowun-batang', [400, 700]], ['ibm-plex-sans-kr', [400, 500, 600]]];
const digest = value => createHash('sha256').update(value).digest('hex');

export function loopbackURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/') throw new Error('이 검사는 BASE_URL=http://127.0.0.1:포트/ 또는 http://localhost:포트/ 에서 실행해 줘.');
  return url;
}

export function browserOptions(device, version) {
  const size = viewport(device, device === 'mobile' ? { width: 390, height: 844 } : { width: 960, height: 540 });
  return {
    viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr,
    ...(device === 'mobile' ? { isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + version + ' Mobile Safari/537.36',
    } : {}),
  };
}

// Only loading opts into this fixture. Keep the crowd's own generator separate
// from Math.random: Three UUID allocations differ between the two revisions.
export function fixedAudienceMain(original, audienceSeed) {
  if (!Number.isInteger(audienceSeed) || audienceSeed < 0 || audienceSeed > 0xffffffff)
    throw new Error('audienceSeed must be a uint32 integer');
  const anchor = 'const rand = room ? seeded(room.seed) : Math.random;';
  const matches = original.split(anchor).length - 1;
  if (matches !== 1) throw new Error(`Fixed-audience main fixture requires exactly one solo crowd generator; found ${matches}`);
  const served = original.replace(anchor, `const rand = room ? seeded(room.seed) : seeded(${audienceSeed});`);
  return {
    served,
    metadata: {
      path: '/js/main.js', audienceSeed, replacements: matches,
      originalSha256: digest(original), servedSha256: digest(served),
      originalIdentityBytes: Buffer.byteLength(original), servedIdentityBytes: Buffer.byteLength(served),
      contentEncoding: 'identity', cacheControl: 'no-cache',
      etag: '"qa-' + digest(served) + '"',
      meaning: 'This main response is a QA fixture with one isolated solo-audience seed. Its transfer bytes are not the original main.js transfer bytes. Other JavaScript, vendor, music and MP3 responses remain pass-through.',
    },
  };
}

export async function localAppProxy(cfg, { audienceSeed = null } = {}) {
  if (audienceSeed !== null && (!Number.isInteger(audienceSeed) || audienceSeed < 0 || audienceSeed > 0xffffffff))
    throw new Error('audienceSeed must be null or a uint32 integer');
  const upstreamURL = loopbackURL(cfg.baseURL);
  let css = '';
  if (cfg.fontMode === 'local') for (const [family, weights] of FONT_FAMILIES) {
    for (const weight of weights) css += (await fs.readFile(path.join(cfg.fontRoot, family, weight + '.css'), 'utf8')).replaceAll('./files/', '/__qa-fonts/' + family + '/');
  }
  const errors = [];
  const transactions = [];
  let mainFixture = null;
  const serve = (req, res, body, contentType, cacheControl) => {
    const etag = '"qa-' + digest(body) + '"';
    const headers = { 'Content-Type': contentType, 'Cache-Control': cacheControl, ETag: etag };
    if (req.headers['if-none-match'] === etag) return res.writeHead(304, headers).end();
    res.writeHead(200, { ...headers, 'Content-Length': Buffer.byteLength(body) });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') return res.writeHead(204).end();
      if (url.pathname === '/__qa-fonts.css') return serve(req, res, css, 'text/css; charset=utf-8', 'public, max-age=604800');
      if (url.pathname.startsWith('/__qa-fonts/')) {
        if (cfg.fontMode !== 'local') return res.writeHead(404).end();
        const match = /^\/__qa-fonts\/(gowun-batang|ibm-plex-sans-kr)\/([a-zA-Z0-9_-]+\.(?:woff2|woff))$/.exec(url.pathname);
        if (!match) return res.writeHead(404).end();
        const body = await fs.readFile(path.join(cfg.fontRoot, match[1], 'files', match[2]));
        return serve(req, res, body, match[2].endsWith('.woff2') ? 'font/woff2' : 'font/woff', 'public, max-age=604800');
      }
      const html = cfg.fontMode !== 'network' && (url.pathname === '/' || url.pathname === '/index.html');
      const controlledMain = audienceSeed !== null && url.pathname === '/js/main.js';
      const headers = { ...req.headers, host: upstreamURL.host };
      if (html || controlledMain) {
        // Request original identity bytes, then revalidate the rewritten
        // representation with its own stable QA ETag. No browser route/cache
        // interception is used; every other response remains pass-through.
        headers['accept-encoding'] = 'identity';
        delete headers['if-none-match'];
        delete headers['if-modified-since'];
      }
      const transaction = { path: req.url, method: req.method, at: Date.now() };
      transactions.push(transaction);
      const upstream = http.request({ hostname: upstreamURL.hostname, port: upstreamURL.port || 80, path: req.url, method: req.method, headers }, source => {
        transaction.status = source.statusCode;
        transaction.bytes = 0;
        if ((html || controlledMain) && source.statusCode === 200) {
          const chunks = [];
          source.on('data', chunk => { chunks.push(chunk); transaction.bytes += chunk.length; });
          source.on('end', () => {
            try {
              if (source.headers['content-encoding'] && source.headers['content-encoding'] !== 'identity')
                throw new Error(`Unexpected encoding for rewritten QA response: ${source.headers['content-encoding']}`);
              const original = Buffer.concat(chunks).toString('utf8');
              if (controlledMain) {
                const transformed = fixedAudienceMain(original, audienceSeed);
                if (mainFixture && mainFixture.originalSha256 !== transformed.metadata.originalSha256)
                  throw new Error('Upstream main.js changed between cold and warm navigation');
                mainFixture = transformed.metadata;
                transaction.mainFixture = { ...mainFixture };
                serve(req, res, transformed.served, source.headers['content-type'] || 'text/javascript; charset=utf-8', 'no-cache');
              } else {
                const rewritten = original.replace(/<link[^>]*rel="preconnect"[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/g, '').replace(/https:\/\/fonts\.googleapis\.com\/css2[^"\s]*/g, '/__qa-fonts.css');
                serve(req, res, rewritten, 'text/html; charset=utf-8', 'no-cache');
              }
            } catch (error) {
              errors.push(String(error));
              transaction.fixtureError = error.message;
              if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Local QA fixture rejected the source');
              else res.destroy(error);
            }
          });
        } else {
          res.writeHead(source.statusCode, source.headers);
          source.on('data', chunk => { transaction.bytes += chunk.length; });
          source.pipe(res);
        }
        source.on('error', error => { errors.push(String(error)); res.destroy(error); });
      });
      upstream.on('error', error => {
        errors.push(String(error));
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' }).end('Local QA upstream unavailable');
        else res.destroy(error);
      });
      req.pipe(upstream);
    } catch (error) {
      errors.push(String(error));
      if (!res.headersSent) res.writeHead(500).end(); else res.destroy(error);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    origin: 'http://127.0.0.1:' + server.address().port,
    upstream: upstreamURL.origin, fontMode: cfg.fontMode,
    fontCssSha256: digest(css), audienceSeed, errors, transactions,
    get mainFixture() { return mainFixture && { ...mainFixture }; },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}

// Keep the actual app modules and Web Audio work intact. Hold only the main
// scene rAF callback so software rasterization does not dominate boot/audio QA.
export async function installRuntimeProbe(page, quality) {
  await page.addInitScript(({ quality }) => {
    try { localStorage.setItem('fp-settings', JSON.stringify({ quality })); } catch { /* about:blank between cold and warm */ }
    const nativeRAF = requestAnimationFrame.bind(window);
    window.__qaNativeRAF = nativeRAF;
    window.requestAnimationFrame = fn => fn.name === 'frame' ? (window.__qaMainFrame = fn, 0) : nativeRAF(fn);
    const probe = window.__runtimeQA = { readyAt: null, longTasks: [], longTaskSupported: PerformanceObserver.supportedEntryTypes.includes('longtask') };
    performance.setResourceTimingBufferSize(6000);
    if (probe.longTaskSupported) {
      probe.longObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
      });
      probe.longObserver.observe({ type: 'longtask', buffered: true });
    }
    const mark = () => {
      const enter = document.getElementById('enterBtn');
      if (enter && !enter.disabled && probe.readyAt === null) {
        probe.readyAt = performance.now();
        performance.mark('qa-app-ready');
        probe.readyObserver.disconnect();
      }
    };
    probe.readyObserver = new MutationObserver(mark);
    probe.readyObserver.observe(document, { attributes: true, childList: true, subtree: true, attributeFilter: ['disabled'] });
  }, { quality });
}

export async function waitReady(page, timeout = 180000) {
  await page.waitForFunction(() => !!window.__fp && !document.getElementById('enterBtn').disabled, null, { timeout, polling: 100 });
}

export async function networkCollector(page, mobile = false) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable', { maxTotalBufferSize: 100000000, maxResourceBufferSize: 1000000 });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  if (mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  let entries = new Map();
  const get = id => {
    if (!entries.has(id)) entries.set(id, { id });
    return entries.get(id);
  };
  cdp.on('Network.requestWillBeSent', event => Object.assign(get(event.requestId), { url: event.request.url, method: event.request.method, type: event.type, requestedAt: event.timestamp }));
  cdp.on('Network.requestServedFromCache', event => { get(event.requestId).servedFromCache = true; });
  cdp.on('Network.responseReceived', event => {
    const response = event.response;
    Object.assign(get(event.requestId), { status: response.status, mimeType: response.mimeType, fromDiskCache: !!response.fromDiskCache, fromServiceWorker: !!response.fromServiceWorker, fromPrefetchCache: !!response.fromPrefetchCache, protocol: response.protocol });
  });
  cdp.on('Network.responseReceivedExtraInfo', event => { get(event.requestId).wireStatus = event.statusCode; });
  cdp.on('Network.loadingFinished', event => Object.assign(get(event.requestId), { completedAt: event.timestamp, encodedDataLength: event.encodedDataLength }));
  cdp.on('Network.loadingFailed', event => Object.assign(get(event.requestId), { failed: event.errorText, canceled: event.canceled }));
  return { cdp, reset() { entries = new Map(); }, entries() { return [...entries.values()]; } };
}

export function category(url, { controlledMain = false } = {}) {
  const pathname = new URL(url).pathname;
  if (controlledMain && pathname === '/js/main.js') return 'controlledMainFixture';
  if (pathname.startsWith('/__qa-fonts')) return 'controlledFonts';
  if (pathname.endsWith('.mp3')) return 'samples';
  if (pathname.startsWith('/vendor/')) return 'vendor';
  if (pathname.startsWith('/music/')) return 'music';
  if (pathname.startsWith('/js/')) return 'applicationJS';
  if (pathname.startsWith('/api/')) return 'api';
  return 'other';
}

export function networkSummary(entries, options = {}) {
  const summary = {};
  for (const entry of entries) {
    if (!entry.url?.startsWith('http')) continue;
    const name = category(entry.url, options);
    const row = summary[name] ||= { requests: 0, responseEncodedBytes: 0, cacheHits: 0, wire304: 0, failed: 0 };
    row.requests++;
    row.responseEncodedBytes += entry.encodedDataLength || 0;
    row.cacheHits += +(entry.servedFromCache || entry.fromDiskCache || entry.fromPrefetchCache || false);
    row.wire304 += +(entry.wireStatus === 304);
    row.failed += +!!entry.failed;
  }
  return summary;
}

export async function browserState(page, { audienceFingerprint = false } = {}) {
  const state = await page.evaluate(includeAudienceFingerprint => {
    const { renderer, engine, perf, settings, audience, director } = window.__fp;
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    let sampleCount = 0, samplePcmBytes = 0;
    for (const instrument of Object.values(engine.samples)) for (const buffer of instrument.buf.values()) { sampleCount++; samplePcmBytes += buffer.length * buffer.numberOfChannels * 4; }
    const crowd = engine._crowd;
    const crowdBuffers = crowd ? [crowd.welcome, ...crowd.normal, crowd.finale] : [];
    return {
      userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
      viewport: [innerWidth, innerHeight], devicePixelRatio, rendererPixelRatio: renderer.getPixelRatio(),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      quality: settings.quality, lite: engine.lite, sampleRate: engine.ctx.sampleRate,
      audioState: engine.ctx.state, baseLatency: engine.ctx.baseLatency, outputLatency: engine.ctx.outputLatency,
      sampleCount, samplePcmBytes, applausePcmBytes: crowdBuffers.reduce((sum, buffer) => sum + buffer.length * buffer.numberOfChannels * 4, 0),
      piece: perf.piece?.id, pieceDuration: perf.duration, notes: perf.evCount,
      audience: audience?.count, seat: director.seat?.index, mode: director.mode,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
      capturedMainFrame: typeof window.__qaMainFrame === 'function',
      ...(includeAudienceFingerprint ? { occupiedSeats: [...director.occupied].sort((a, b) => a - b) } : {}),
    };
  }, audienceFingerprint);
  if (audienceFingerprint) {
    const occupied = state.occupiedSeats;
    delete state.occupiedSeats;
    if (!occupied.every(index => Number.isInteger(index) && index >= 0)) throw new Error('Audience occupied seats must be nonnegative integer indices');
    state.audienceFingerprint = {
      count: state.audience ?? null,
      occupiedCount: occupied.length,
      occupiedSortedSha256: digest(JSON.stringify(occupied)),
      method: 'SHA-256 of UTF-8 JSON.stringify of numeric ascending director.occupied seat indices; captured after ready, with no local viewer seat or room participants.',
    };
  }
  return state;
}
