"""Run an explicitly recorded QA plan serially and preserve logs/exit status.

Browser dependencies and launch options come from the caller's environment.
Use --start/--end to resume a subset without replacing an earlier result.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json
import os
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('plan', type=Path)
parser.add_argument('--output', required=True, type=Path)
parser.add_argument('--start', type=int, default=0)
parser.add_argument('--end', type=int)
parser.add_argument('--continue-on-failure', action='store_true')
args = parser.parse_args()
plan_bytes = args.plan.read_bytes()
plan = json.loads(plan_bytes)
root = Path(__file__).resolve().parents[2]
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
(output / 'logs').mkdir(exist_ok=True)
now = lambda: datetime.now(timezone.utc).isoformat()
failed = False
for index, job in enumerate(plan):
    if index < args.start or (args.end is not None and index >= args.end):
        continue
    script = root / job['script']
    if script.parent != root / 'tools/bench' or not script.is_file():
        raise ValueError('Plan entries must select a tools/bench file')
    label = job.get('id', str(index))
    if any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in label):
        raise ValueError('Invalid job id')
    record_path = output / 'logs' / f'{index:03d}-{label}.json'
    log_path = output / 'logs' / f'{index:03d}-{label}.log'
    if record_path.exists() or log_path.exists():
        raise FileExistsError('Use a new output folder or resume past completed jobs')
    env = os.environ.copy()
    env.update({str(k): str(v) for k, v in job.get('env', {}).items()})
    env['OUTPUT_DIR'] = str(output / job.get('directory', 'render'))
    command = ['node', str(script), *job.get('args', [])]
    record = {'index': index, 'job': job, 'command': command, 'startedAt': now(),
              'planSha256': hashlib.sha256(plan_bytes).hexdigest(),
              'collectorSha256': hashlib.sha256(script.read_bytes()).hexdigest(), 'status': 'RUNNING'}
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'job': label, 'index': index, 'of': len(plan), 'status': 'RUNNING'}, ensure_ascii=False), flush=True)
    with log_path.open('wb') as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    record.update({'exitCode': result.returncode, 'finishedAt': now(),
                   'status': 'PASS' if result.returncode == 0 else 'FAIL',
                   'logSha256': hashlib.sha256(log_path.read_bytes()).hexdigest()})
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'job': label, 'index': index, 'status': record['status'], 'exitCode': result.returncode}, ensure_ascii=False), flush=True)
    if result.returncode:
        failed = True
        if not args.continue_on_failure:
            break
sys.exit(1 if failed else 0)
