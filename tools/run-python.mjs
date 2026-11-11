#!/usr/bin/env node
// Cross-platform Python 3 launcher for npm scripts and QA tools.
// Probes real interpreter execution (skipping Windows Store python3 stubs) and
// enforces UTF-8 mode (-X utf8) regardless of the host locale.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const probeCode = 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)';

export function resolvePython() {
  const candidates = [];
  if (process.env.PYTHON) candidates.push([process.env.PYTHON]);
  if (process.platform === 'win32') {
    candidates.push(['python'], ['py', '-3'], ['python3']);
  } else {
    candidates.push(['python3'], ['python']);
  }
  for (const [cmd, ...prefix] of candidates) {
    const res = spawnSync(cmd, [...prefix, '-c', probeCode], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (!res.error && res.status === 0) return { cmd, prefix };
  }
  throw new Error(
    'Python 3.9+ interpreter not found. Install Python 3 or set the PYTHON environment variable.'
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node tools/run-python.mjs <script-or-flags> [...args]');
    process.exit(1);
  }
  const { cmd, prefix } = resolvePython();
  const child = spawn(cmd, [...prefix, '-X', 'utf8', ...args], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    },
  });
  child.once('error', (err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
}
