// Serial queue only. Use a new output location/label for an intentional rerun;
// do not erase the first failing observation. This script never changes tools.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (!process.argv[2]) throw new Error('Expected a *-plan.json path and optional start index');
const planPath = path.resolve(process.argv[2]);
if (!planPath.endsWith('-plan.json')) throw new Error('Plan name must end in -plan.json');
const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
const first = Number(process.argv[3] || 0);
if (!Array.isArray(plan) || !Number.isSafeInteger(first) || first < 0 || first >= plan.length) {
  throw new Error('Plan must be an array and start index must name an existing job');
}
const statusPath = planPath.replace(/-plan\.json$/, `-status-${first}.json`);
const results = [];
for (let i = first; i < plan.length; i++) {
  const job = plan[i], startedAt = new Date().toISOString();
  if (!job.runner || !job.script || !Array.isArray(job.args)) throw new Error(`Incomplete job at index ${i}`);
  console.log(JSON.stringify({ queue: 'start', i, total: plan.length, job, startedAt }));
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [job.runner, job.script, ...job.args], {
      cwd: root, env: { ...process.env, ...job.env }, stdio: 'inherit',
    });
    child.on('error', reject); child.on('exit', resolve);
  });
  results.push({ i, job, code, startedAt, finishedAt: new Date().toISOString() });
  await fs.writeFile(statusPath, JSON.stringify(results, null, 2) + '\n');
  if (code !== 0) { process.exitCode = 1; break; }
  try { await fs.access(path.join(path.dirname(planPath), 'STOP')); break; } catch {}
}
