// Cross-platform puppeteer-core loader and output-directory resolver for QA tools.
// Handles Windows APPDATA/npm global installs without failing on bare `npm` spawn.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CDP_PORT = 9225;
export const DEFAULT_APP_PORT = 8096;

export function cdpBrowserUrl(port = process.env.CDP_PORT || DEFAULT_CDP_PORT) {
  return `http://127.0.0.1:${Number(port) || DEFAULT_CDP_PORT}`;
}

function globalNpmRoot() {
  if (process.platform === 'win32') {
    return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm root -g'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  }
  return execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
}

export function loadPuppeteer(metaUrl = import.meta.url) {
  const require = createRequire(metaUrl);
  if (process.env.PUPPETEER_PATH) return require(process.env.PUPPETEER_PATH);
  try {
    return require('puppeteer-core');
  } catch {
    // Fall through to Windows/global search paths.
  }
  const candidates = [];
  if (process.platform === 'win32') {
    if (process.env.APPDATA) {
      candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'puppeteer-core'));
    }
    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx', 'puppeteer-core'));
    }
    candidates.push(path.join(path.dirname(process.execPath), 'node_modules', 'puppeteer-core'));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate);
  }
  return require(path.join(globalNpmRoot(), 'puppeteer-core'));
}

export function resolveOutputDir(defaultSubdir = 'quality-optimization') {
  const out = path.resolve(process.env.QA_OUT || path.join('work', defaultSubdir));
  fs.mkdirSync(out, { recursive: true });
  return out;
}
