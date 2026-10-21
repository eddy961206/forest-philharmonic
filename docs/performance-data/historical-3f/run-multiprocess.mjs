// 3f rooms QA: the same frozen collector snapshot, with only the three
// process-policy removals used by the a41 two-tab check. This is still the
// packaged software-renderer environment, not a physical-PC GPU launch.
import { spawn } from 'node:child_process';
import path from 'node:path';
import binary from '/tmp/forest-qa-runtime/node_modules/@sparticuz/chromium/build/index.js';

const root = '/workspace/scratch/51e64c30577e';
const [script, ...args] = process.argv.slice(2);
if (!script?.startsWith('tools/bench/') || path.basename(script) !== script.slice('tools/bench/'.length)) {
  throw new Error('Expected a single tools/bench entry');
}
const entry = path.join(root, 'qa-3f/bench-source', path.basename(script));
const chromeArgs = binary.args
  .filter(arg => !['--single-process', '--in-process-gpu'].includes(arg))
  .flatMap(arg => {
    if (!arg.startsWith('--disable-features=')) return [arg];
    const features = arg.slice('--disable-features='.length).split(',')
      .filter(name => name !== 'AudioServiceOutOfProcess');
    return features.length ? ['--disable-features=' + features.join(',')] : [];
  });
const env = {
  ...process.env,
  PLAYWRIGHT_MODULE: '/tmp/forest-qa-runtime/node_modules/playwright',
  CHROME_EXECUTABLE: '/tmp/chromium', CHROME_ARGS: JSON.stringify(chromeArgs),
  SOFTWARE_RENDERER: '1', FONT_MODE: 'local',
  FONT_ROOT: '/tmp/forest-qa-runtime/node_modules/@fontsource',
  OUTPUT_DIR: process.env.OUTPUT_DIR || path.join(root, 'qa-3f/runtime-results'),
  REVISION: process.env.REVISION || '3f-integrated-candidate',
  BASE_URL: process.env.BASE_URL || 'http://127.0.0.1:8085',
};
const child = spawn(process.execPath, [entry, ...args], {
  cwd: path.join(root, 'forest-integration-3f'), env, stdio: 'inherit',
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
