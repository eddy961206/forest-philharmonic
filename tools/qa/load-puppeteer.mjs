// Cross-platform puppeteer-core loader and output-directory resolver for QA tools.
// Handles Windows APPDATA/npm global installs without failing on bare `npm` spawn.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

function npxCandidates(npxRoot) {
  const found = [];
  if (!npxRoot || !fs.existsSync(npxRoot)) return found;
  found.push(path.join(npxRoot, 'puppeteer-core'));
  try {
    const entries = fs.readdirSync(npxRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        let mtimeMs = 0;
        try { mtimeMs = fs.statSync(path.join(npxRoot, entry.name)).mtimeMs; } catch { /* ignore */ }
        return { name: entry.name, mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const { name } of entries) {
      const pkgDir = path.join(npxRoot, name, 'node_modules', 'puppeteer-core');
      found.push(pkgDir);
      found.push(path.join(pkgDir, 'lib', 'esm', 'puppeteer', 'puppeteer-core.js'));
    }
  } catch {
    // Ignore unreadable cache directories.
  }
  return found;
}

function unwrapPuppeteer(mod) {
  return mod && typeof mod.connect === 'function' ? mod : mod?.default || mod;
}

export function loadPuppeteer(metaUrl = import.meta.url) {
  const require = createRequire(metaUrl);
  if (process.env.PUPPETEER_PATH) return unwrapPuppeteer(require(process.env.PUPPETEER_PATH));
  try {
    return unwrapPuppeteer(require('puppeteer-core'));
  } catch {
    // Fall through to Windows/npx/global search paths.
  }
  const candidates = [];
  if (process.platform === 'win32') {
    if (process.env.APPDATA) {
      candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'puppeteer-core'));
    }
    candidates.push(path.join(path.dirname(process.execPath), 'node_modules', 'puppeteer-core'));
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(...npxCandidates(path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx')));
  }
  if (process.env.npm_config_cache) {
    candidates.push(...npxCandidates(path.join(process.env.npm_config_cache, '_npx')));
  }
  candidates.push(...npxCandidates(path.join(os.homedir(), '.npm', '_npx')));
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return unwrapPuppeteer(require(candidate));
    } catch {
      // Try next candidate.
    }
  }
  return unwrapPuppeteer(require(path.join(globalNpmRoot(), 'puppeteer-core')));
}

export function resolveOutputDir(defaultSubdir = 'quality-optimization') {
  const out = path.resolve(process.env.QA_OUT || path.join('work', defaultSubdir));
  fs.mkdirSync(out, { recursive: true });
  return out;
}
