// One entry point for AI and humans; no browser, global npm packages or Python.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { repo, motionInputs } from './motion-source.mjs';
import { verificationSummary } from './motion-contracts.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('npm run verify:motion -- [--out work/motion] [--skip-unit]\n--skip-unit is for CI only, after its separate npm test step.');
  process.exit(0);
}
let directory = 'work/motion';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1] && !args[i + 1].startsWith('--')) directory = args[++i];
  else if (args[i] !== '--skip-unit') throw Error(`Unknown or incomplete option: ${args[i]}`);
}
const out = path.resolve(directory), steps = [];
fs.mkdirSync(out, { recursive: true });
const auditFile = path.join(out, 'motion-audit.json');
fs.rmSync(auditFile, { force: true }); // never reuse a stale successful report
const inputs = motionInputs();
async function run(name, argv) {
  const filename = `${name}.log`, stream = fs.createWriteStream(path.join(out, filename));
  const start = Date.now();
  console.log(`Running ${name}...`);
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, argv, { cwd: repo, timeout: 420000 });
    child.stdout.pipe(stream, { end: false }); child.stderr.pipe(stream, { end: false });
    child.on('error', error => stream.write(`${error.stack}\n`));
    child.on('close', (code, signal) => resolve({ exitCode: code ?? 1, signal }));
  });
  await new Promise(resolve => stream.end(resolve));
  const step = { command: `node ${argv.join(' ')}`, log: filename, ...result, elapsedMs: Date.now() - start };
  steps.push(step); console.log(`${name}: ${step.exitCode === 0 ? 'PASS' : 'FAIL'} (${filename})`);
}
if (!args.includes('--skip-unit')) await run('unit-tests', ['tools/test.mjs', '--test-reporter=tap']);
await run('motion-audit', ['--experimental-loader', './tests/helpers/three-loader.mjs', 'tools/qa/audit-playing-motion.mjs', auditFile]);
let audit = null;
try { audit = JSON.parse(fs.readFileSync(auditFile, 'utf8')); } catch (error) { console.error(`No valid audit report: ${error.message}`); }
const summary = verificationSummary(audit, steps, inputs);
summary.unitTests = args.includes('--skip-unit') ? 'skipped-explicitly; check the separate CI test step' : 'included';
if (motionInputs().sha256 !== inputs.sha256) {
  summary.status = 'fail'; summary.failures.push({ kind: 'inputs-changed-during-verification', action: 'Rerun against an unchanged tree.' });
}
fs.writeFileSync(path.join(out, 'verification-summary.json'), JSON.stringify(summary, null, 2));
if (audit?.coverage) fs.writeFileSync(path.join(out, 'recording-plan.json'), JSON.stringify(audit.coverage.cases, null, 2));
const rows = ['# Motion verification', '', `Status: **${summary.status.toUpperCase()}**`, '', summary.scope, '',
  `Inputs SHA-256: \`${inputs.sha256}\``, '', '## Coverage', '', '```json', JSON.stringify(summary.coverage, null, 2), '```', '',
  '## Steps', '', ...steps.map(s => `- ${s.exitCode === 0 ? 'PASS' : 'FAIL'}: ${s.command} — [log](${s.log})`), '',
  '## Failures', '', summary.failures.length ? 'See [verification-summary.json](verification-summary.json) for metrics, limits, suggested fixes and reproduction commands.' : 'None in the automated scope.', '',
  '## Next action', '', summary.status === 'fail' ? 'Fix the reported cause and rerun `npm run verify:motion`. Do not increase tolerances to hide a failure.' : 'For mesh, rig or venue visual changes, record the affected generated cases. Ordinary score-only changes do not require individual screenshots.', '',
  `Record an automatically discovered chair: \`npm run record:motion -- --plan ${JSON.stringify(path.relative(repo,path.join(out,'recording-plan.json')))} --case vn1-0 --label review\`.`, '',
  `Full method and extension contracts: [motion-harness.md](${path.relative(out,path.join(repo,'docs/motion-harness.md')).split(path.sep).join('/')}).`, ''];
fs.writeFileSync(path.join(out, 'report.md'), rows.join('\n'));
console.log(`${summary.status.toUpperCase()}: ${path.join(out, 'verification-summary.json')}`);
if (summary.status !== 'pass') process.exitCode = 1;
