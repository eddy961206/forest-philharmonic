// Enumerate maintained tests explicitly: Node's unrestricted discovery also
// executes historical *.test.mjs evidence under docs/. No shell glob is needed,
// so the same command works with Windows cmd.exe, PowerShell and POSIX shells.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(filename);
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [filename] : [];
  }).sort();
}

const files = testFiles(path.join(root, 'tests'));
if (files.length === 0) throw new Error('No maintained tests found in tests/.');
const child = spawn(process.execPath, [
  '--experimental-loader', new URL('../tests/helpers/three-loader.mjs', import.meta.url).href,
  '--test', ...process.argv.slice(2), ...files,
], { cwd: root, stdio: 'inherit' });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); });
