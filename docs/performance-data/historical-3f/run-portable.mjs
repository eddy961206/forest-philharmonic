// 3f execution uses a frozen QA source snapshot; do not modify a41 tools mid-run.
import { spawn } from 'node:child_process';
import path from 'node:path';
import binary from '/tmp/forest-qa-runtime/node_modules/@sparticuz/chromium/build/index.js';
const root = '/workspace/scratch/51e64c30577e';
const [script, ...args] = process.argv.slice(2);
if (!script.startsWith('tools/bench/') || path.basename(script) !== script.slice('tools/bench/'.length)) throw new Error('Expected a single tools/bench entry');
const entry = path.join(root, 'qa-3f/bench-source', path.basename(script));
const env = {
  ...process.env,
  PLAYWRIGHT_MODULE: '/tmp/forest-qa-runtime/node_modules/playwright',
  CHROME_EXECUTABLE: '/tmp/chromium', CHROME_ARGS: JSON.stringify(binary.args),
  SOFTWARE_RENDERER: '1', FONT_MODE: 'local', FONT_ROOT: '/tmp/forest-qa-runtime/node_modules/@fontsource',
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(root, 'qa-3f/render'),
  REVISION: process.env.REVISION || '3f-integrated-candidate',
  BASE_URL: process.env.BASE_URL || 'http://127.0.0.1:8085',
};
const child = spawn(process.execPath, [entry, ...args], { cwd: path.join(root, 'forest-integration-3f'), env, stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
