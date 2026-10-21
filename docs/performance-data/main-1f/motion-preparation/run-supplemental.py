"""Run predeclared follow-ups after every earlier browser queue has ended.

This launcher never changes a collector, a plan, a product, or a result status.
Plans and collector bytes are frozen at launcher startup and checked again
before launching each batch. A changed input stops this queue explicitly.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import sys
import time

root = Path('/workspace/scratch/296fafc0af7f')
base = root / 'verification/main-1f'
repo = root / 'forest-philharmonic'
out = base / 'supplemental-queue.json'
if out.exists():
    raise FileExistsError('Use a new queue record; do not replace prior evidence.')
now = lambda: datetime.now(timezone.utc).isoformat()
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
sequence = [
    ('low-reverse-plan.json', 'fixed-low-reverse', 4),
    ('mobile-reverse-plan.json', 'fixed-mobile-reverse', 8),
    ('dome-motion-plan.json', 'dome-motion', 4),
]
inputs = {}
for name, _, _ in sequence:
    plan = base / name
    inputs[str(plan)] = digest(plan)
    for item in json.loads(plan.read_bytes()):
        source = repo / item['script']
        inputs[str(source)] = digest(source)
record = {
    'schema': 1,
    'startedAt': now(),
    'status': 'WAITING_FOR_BASELINE_FOLLOWUP',
    'scriptSha256': digest(Path(__file__)),
    'inputHashesAtStartup': inputs,
    'method': 'Serial low/mobile reverse-order repeats and controlled full-3D motion diagnostics after the fixed, cadence, runtime, functional recheck, GPU, and baseline transport queues. All original runs, including regressions and failures, remain available.',
    'jobs': [],
}

def save():
    temporary = out.with_suffix('.tmp')
    temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(out)

save()
started = time.monotonic()
gate_file = base / 'baseline-followup-queue.json'
while True:
    if time.monotonic() - started > 8 * 3600:
        record.update(status='GATE_TIMEOUT', finishedAt=now())
        save()
        sys.exit(2)
    try:
        gate = json.loads(gate_file.read_bytes())
        if gate.get('status') in ['COMPLETE', 'COMPLETE_WITH_FAILURES']:
            break
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    time.sleep(10)
record['gate'] = {'path': str(gate_file), 'sha256': digest(gate_file), 'status': gate['status']}
record['status'] = 'RUNNING'
save()
for plan_name, folder, end in sequence:
    changed = [name for name, expected in inputs.items() if digest(Path(name)) != expected]
    if changed:
        record.update(status='STOPPED_INPUT_CHANGED', changedInputs=changed, finishedAt=now())
        save()
        sys.exit(2)
    command = ['python3', str(base.parent / 'run-isolated-plan.py'), str(base / plan_name),
               '--output', str(base / folder), '--start', '0', '--end', str(end)]
    # The new diagnostic stops at the first failure for inspection. In
    # particular, an unconfirmed browser close must not overlap another run.
    if folder != 'dome-motion':
        command.append('--continue-on-failure')
    job = {'plan': plan_name, 'output': folder, 'start': 0, 'end': end,
           'command': command, 'status': 'RUNNING', 'startedAt': now()}
    record['jobs'].append(job)
    save()
    print(json.dumps(job), flush=True)
    result = subprocess.run(command, cwd=repo)
    job.update(exitCode=result.returncode, status='PASS' if result.returncode == 0 else 'FAIL', finishedAt=now())
    save()
    print(json.dumps(job), flush=True)
record.update(status='COMPLETE_WITH_FAILURES' if any(job['exitCode'] for job in record['jobs']) else 'COMPLETE', finishedAt=now())
save()
print(json.dumps({'status': record['status'], 'record': str(out)}), flush=True)
