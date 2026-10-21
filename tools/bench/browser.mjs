// Browser-only development tooling. Nothing here is imported by the app.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function choice(value, allowed, name) {
  if (!allowed.includes(value)) throw new Error(`${name}: ${allowed.join(', ')} 중 하나를 골라 줘.`);
  return value;
}

export function integer(value, name, fallback) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${name}: 1 이상의 정수가 필요해.`);
  return n;
}

export function config(label) {
  if (!/^[a-zA-Z0-9._-]+$/.test(label)) throw new Error('label에는 영문, 숫자, 점, 밑줄, 하이픈만 써 줘.');
  const baseURL = new URL(process.env.BASE_URL || 'http://127.0.0.1:8080/');
  if (!['http:', 'https:'].includes(baseURL.protocol)) throw new Error('BASE_URL은 HTTP(S) 주소여야 해.');
  const chromeArgs = JSON.parse(process.env.CHROME_ARGS || '[]');
  if (!Array.isArray(chromeArgs) || chromeArgs.some(x => typeof x !== 'string')) throw new Error('CHROME_ARGS는 문자열 배열인 JSON이어야 해.');
  const software = process.env.SOFTWARE_RENDERER === '1';
  if (software) chromeArgs.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  const fontMode = choice(process.env.FONT_MODE || (process.env.FONT_ROOT ? 'local' : 'system'), ['local', 'system', 'network'], 'FONT_MODE');
  if (fontMode === 'local' && !process.env.FONT_ROOT) throw new Error('FONT_MODE=local이면 FONT_ROOT도 필요해.');
  return {
    label, baseURL: baseURL.href, revision: process.env.REVISION || 'unspecified',
    outputDir: path.resolve(process.env.OUTPUT_DIR || 'bench-results'),
    timeoutMs: integer(process.env.TIMEOUT_MS, 'TIMEOUT_MS', 180000),
    playwrightModule: process.env.PLAYWRIGHT_MODULE || 'playwright',
    chromeExecutable: process.env.CHROME_EXECUTABLE || null,
    chromeArgs, softwareRequested: software, headless: process.env.HEADLESS !== '0',
    fontMode, fontRoot: process.env.FONT_ROOT ? path.resolve(process.env.FONT_ROOT) : null,
    screenshots: process.env.SCREENSHOTS === '1',
  };
}

export function viewport(device, defaults) {
  const dpr = Number(process.env.DPR || (device === 'mobile' ? 2 : 1));
  if (!Number.isFinite(dpr) || dpr <= 0) throw new Error('DPR은 양수여야 해.');
  return {
    width: integer(process.env.WIDTH, 'WIDTH', defaults.width),
    height: integer(process.env.HEIGHT, 'HEIGHT', defaults.height), dpr,
  };
}

export function appURL(baseURL, venue) {
  const url = new URL(baseURL);
  url.searchParams.set('venue', venue);
  return url.href;
}

export async function configureFonts(page, cfg) {
  if (cfg.fontMode === 'network') return;
  if (cfg.fontMode === 'system') {
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    return;
  }
  let css = '';
  for (const [family, weights] of [['gowun-batang', [400, 700]], ['ibm-plex-sans-kr', [400, 500, 600]]]) {
    for (const weight of weights) {
      const prefix = new URL(`__bench_fonts/${family}/`, cfg.baseURL).href;
      css += (await fs.readFile(path.join(cfg.fontRoot, family, `${weight}.css`), 'utf8')).replaceAll('./files/', prefix);
    }
  }
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: css }));
  await page.route('**/__bench_fonts/**', route => {
    const tail = new URL(route.request().url()).pathname.split('/__bench_fonts/')[1];
    const [family, filename, extra] = (tail || '').split('/');
    if (extra || !['gowun-batang', 'ibm-plex-sans-kr'].includes(family) || !/^[a-zA-Z0-9_.-]+\.woff2?$/.test(filename || '')) return route.abort();
    return route.fulfill({
      path: path.join(cfg.fontRoot, family, 'files', filename),
      contentType: filename.endsWith('.woff2') ? 'font/woff2' : 'font/woff',
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
}

function loadPlaywright(cfg) {
  const specifier = cfg.playwrightModule.startsWith('.') ? path.resolve(cfg.playwrightModule) : cfg.playwrightModule;
  let playwright;
  try { playwright = require(specifier); }
  catch (cause) { throw new Error('Playwright를 찾지 못했어. PLAYWRIGHT_MODULE에 별도로 설치한 playwright 패키지 경로를 지정해 줘.', { cause }); }
  return { playwright, specifier };
}

export function launchBrowser(cfg) {
  const { playwright } = loadPlaywright(cfg);
  return playwright.chromium.launch({
    headless: cfg.headless, args: cfg.chromeArgs,
    ...(cfg.chromeExecutable ? { executablePath: cfg.chromeExecutable } : {}),
  });
}

export async function openPage(cfg, device, size) {
  const browser = await launchBrowser(cfg);
  try {
    const mobile = device === 'mobile';
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr,
      ...(mobile ? {
        isMobile: true, hasTouch: true,
        userAgent: `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Mobile Safari/537.36`,
      } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(cfg.timeoutMs);
    page.setDefaultNavigationTimeout(cfg.timeoutMs);
    const cdp = await page.context().newCDPSession(page);
    if (mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const diagnostics = { pageErrors: [], consoleErrors: [], warnings: [], failedRequests: [] };
    page.on('pageerror', e => diagnostics.pageErrors.push(e.message));
    page.on('console', m => {
      if (m.type() === 'error') diagnostics.consoleErrors.push(m.text());
      else if (m.type() === 'warning') diagnostics.warnings.push(m.text());
    });
    page.on('requestfailed', r => diagnostics.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
    await configureFonts(page, cfg);
    let playwrightVersion = null;
    try {
      const { specifier } = loadPlaywright(cfg);
      playwrightVersion = JSON.parse(await fs.readFile(path.join(path.dirname(require.resolve(specifier)), 'package.json'), 'utf8')).version;
    } catch { /* package layout may differ */ }
    return {
      browser, context, page, cdp, diagnostics,
      environment: {
        browserVersion: browser.version(), playwrightVersion,
        platform: process.platform, architecture: process.arch,
        softwareRequested: cfg.softwareRequested, chromeArgs: cfg.chromeArgs,
        fontMode: cfg.fontMode, headless: cfg.headless,
      },
    };
  } catch (error) { await browser.close(); throw error; }
}

// REVISION is an operator-supplied label. These hashes separately record the
// bytes actually served; requesting them does not alter either checkout.
export async function sourceHashes(page, baseURL) {
  const names = ['js/main.js', 'js/scene/hall.js', 'js/scene/seats.js', 'js/scene/audience.js', 'js/scene/sphere.js', 'js/scene/dome3d.js', 'js/scene/domeshow.js'];
  return Object.fromEntries(await Promise.all(names.map(async name => {
    const response = await page.request.get(new URL(name, baseURL).href);
    return [name, response.ok() ? { sha256: sha256(await response.body()) } : { httpStatus: response.status() }];
  })));
}

export function summarize(samples, metric) {
  const values = samples.map(s => s[metric]);
  if (!values.length || values.some(x => !Number.isFinite(x) || x < 0)) throw new Error(`잘못된 ${metric} 표본이 있어.`);
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = p => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  const avg = key => samples.reduce((sum, row) => sum + row[key], 0) / samples.length;
  const phases = {};
  for (const row of samples) for (const [key, value] of Object.entries(row.times || {})) phases[key] = (phases[key] || 0) + value / samples.length;
  return {
    timing: { metric, meanMs: values.reduce((sum, value) => sum + value, 0) / values.length, p50Ms: quantile(0.5), p95Ms: quantile(0.95), p99Ms: quantile(0.99) },
    meanCalls: avg('calls'), meanTriangles: avg('triangles'), phaseMeanMs: phases,
  };
}

export async function save(cfg, filename, result) {
  await fs.mkdir(cfg.outputDir, { recursive: true });
  await fs.writeFile(path.join(cfg.outputDir, filename), JSON.stringify(result, null, 2) + '\n');
}

export function diagnosticsFailed(diagnostics) {
  return diagnostics.pageErrors.length > 0 || diagnostics.consoleErrors.length > 0;
}
