import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const repo = fileURLToPath(new URL('../..', import.meta.url));

const REVISION_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// Pin tracked browser HTML, CSS, and JS modules so baseline comparisons cannot
// accidentally pair older scripts with newer DOM/CSS markup or helpers.
export async function useBrowserRevision(page, revision) {
  const commit = execFileSync('git', ['rev-parse', revision], { cwd: repo, encoding: 'utf8' }).trim();
  const files = new Set(
    execFileSync('git', ['ls-tree', '-r', '--name-only', commit, 'public/js', 'public/css', 'public/index.html'], {
      cwd: repo,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)
  );
  const cache = new Map();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let pathname = new URL(request.url()).pathname;
    if (pathname === '/') pathname = '/index.html';
    const file = 'public' + pathname;
    if (!files.has(file)) {
      request.continue();
      return;
    }
    if (!cache.has(file)) cache.set(file, execFileSync('git', ['show', `${commit}:${file}`], { cwd: repo }));
    const ext = path.extname(file).toLowerCase();
    request.respond({
      status: 200,
      contentType: REVISION_MIME[ext] || 'application/octet-stream',
      body: cache.get(file),
    });
  });
  return { baselineCommit: commit };
}

export function motionSource() {
  const hash = createHash('sha256');
  let files = 0;
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.name.endsWith('.js')) {
        hash.update(path.relative(repo, filename).split(path.sep).join('/'));
        hash.update(fs.readFileSync(filename));
        files++;
      }
    }
  }
  visit(path.join(repo, 'public/js'));
  return {
    baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
    sourceSHA256: hash.digest('hex'),
    files,
  };
}

// Verification also depends on scores, server, vendor libraries, contracts and tests.
export function motionInputs() {
  const hash = createHash('sha256');
  let files = 0;
  function visit(relative) {
    const filename = path.join(repo, relative);
    if (!fs.existsSync(filename)) return;
    const stat = fs.statSync(filename);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) visit(path.join(relative, name));
    } else if (/\.(js|mjs|json|yml|html|css)$/.test(filename)) {
      hash.update(relative.split(path.sep).join('/'));
      hash.update('\0');
      hash.update(fs.readFileSync(filename));
      hash.update('\0');
      files++;
    }
  }
  for (const relative of [
    'public/index.html',
    'public/css',
    'public/js',
    'public/vendor',
    'public/music',
    'server.js',
    'server',
    'tools/qa',
    'tests',
    'tools/test.mjs',
    'package.json',
    '.github/workflows/ci.yml',
  ]) {
    visit(relative);
  }
  return { sha256: hash.digest('hex'), files };
}
