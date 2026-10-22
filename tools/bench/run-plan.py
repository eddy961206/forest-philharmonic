"""Run a recorded QA plan serially with bounded jobs and durable progress.

Write directly to a persistent --output folder. Each closed job is retained even
if a later browser hangs. Use --start/--end to resume without replacing evidence.
Browser dependencies and launch options come from the caller's environment.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json
import math
import os
import signal
import subprocess
import sys
import tempfile
import time


def now():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, value):
    """Publish a complete JSON document on the same filesystem."""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix=path.name + '.', suffix='.tmp', delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def positive_seconds(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError('Seconds must be finite and greater than zero')
    return number


def stop_tree(process, grace_seconds):
    """Terminate the dedicated job group, including Chromium descendants."""
    errors = []
    if os.name == 'nt':
        try:
            result = subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    timeout=grace_seconds + 5)
            if result.returncode and process.poll() is None:
                errors.append('taskkill returned ' + str(result.returncode))
        except (OSError, subprocess.TimeoutExpired) as error:
            errors.append(str(error))
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            deadline = time.monotonic() + grace_seconds
            while time.monotonic() < deadline:
                process.poll()
                try:
                    os.killpg(process.pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(min(0.1, max(0, deadline - time.monotonic())))
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        except ProcessLookupError:
            pass
        except OSError as error:
            errors.append(str(error))
    try:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)
    except (OSError, subprocess.TimeoutExpired) as error:
        errors.append(str(error))
    return errors


def run_process(command, cwd, env, log, timeout_seconds, heartbeat_seconds,
                grace_seconds, heartbeat):
    started = time.monotonic()
    options = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
    process = subprocess.Popen(command, cwd=cwd, env=env, stdout=log,
                               stderr=subprocess.STDOUT, **options)
    deadline, next_heartbeat = started + timeout_seconds, started + heartbeat_seconds
    try:
        while True:
            code = process.poll()
            if code is not None:
                return {'status': 'PASS' if code == 0 else 'FAIL', 'exitCode': code}
            current = time.monotonic()
            remaining = deadline - current
            if remaining <= 0:
                cleanup = stop_tree(process, grace_seconds)
                return {'status': 'TIMEOUT', 'exitCode': 124, 'processExitCode': process.returncode,
                        'cleanupErrors': cleanup}
            try:
                code = process.wait(timeout=min(remaining, max(0.01, next_heartbeat - current)))
                return {'status': 'PASS' if code == 0 else 'FAIL', 'exitCode': code}
            except subprocess.TimeoutExpired:
                if time.monotonic() >= next_heartbeat:
                    heartbeat(time.monotonic() - started, process.pid)
                    next_heartbeat = time.monotonic() + heartbeat_seconds
    except KeyboardInterrupt:
        return {'status': 'INTERRUPTED', 'exitCode': 130,
                'cleanupErrors': stop_tree(process, grace_seconds)}
    except BaseException:
        stop_tree(process, grace_seconds)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--end', type=int)
    parser.add_argument('--continue-on-failure', action='store_true')
    parser.add_argument('--job-timeout-seconds', type=positive_seconds, default=600,
                        help='Whole subprocess deadline; per-job timeoutSeconds overrides this (default 600)')
    parser.add_argument('--heartbeat-seconds', type=positive_seconds, default=20)
    parser.add_argument('--terminate-grace-seconds', type=positive_seconds, default=5)
    args = parser.parse_args()
    plan_bytes = args.plan.read_bytes()
    plan = json.loads(plan_bytes)
    plan_sha = hashlib.sha256(plan_bytes).hexdigest()
    root = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    (output / 'logs').mkdir(parents=True, exist_ok=True)
    progress_path = output / 'progress.json'
    progress = json.loads(progress_path.read_text()) if progress_path.exists() else {'schema': 1, 'planSha256': plan_sha, 'jobs': {}}
    if progress.get('planSha256') != plan_sha:
        raise ValueError('Output belongs to a different plan; use a new output folder')
    progress['runnerSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    failed = False
    for index, job in enumerate(plan):
        if index < args.start or (args.end is not None and index >= args.end):
            continue
        script = (root / job['script']).resolve()
        if script.parent != root / 'tools/bench' or not script.is_file():
            raise ValueError('Plan entries must select a tools/bench file')
        label = job.get('id', str(index))
        if not label or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in label):
            raise ValueError('Invalid job id')
        timeout_seconds = positive_seconds(job.get('timeoutSeconds', args.job_timeout_seconds))
        record_path = output / 'logs' / f'{index:03d}-{label}.json'
        log_path = output / 'logs' / f'{index:03d}-{label}.log'
        if record_path.exists() or log_path.exists():
            raise FileExistsError('Use a new output folder or resume past completed jobs')
        env = os.environ.copy()
        env.update({str(k): str(v) for k, v in job.get('env', {}).items()})
        env['OUTPUT_DIR'] = str(output / job.get('directory', 'render'))
        command = ['node', str(script), *job.get('args', [])]
        record = {'index': index, 'job': job, 'command': command, 'startedAt': now(),
                  'planSha256': plan_sha, 'collectorSha256': hashlib.sha256(script.read_bytes()).hexdigest(),
                  'runnerSha256': progress['runnerSha256'], 'timeoutSeconds': timeout_seconds, 'status': 'RUNNING'}

        def publish():
            atomic_json(record_path, record)
            progress['updatedAt'] = now()
            progress['jobs'][str(index)] = {
                'status': record['status'], 'record': str(record_path.relative_to(output)),
                'recordSha256': hashlib.sha256(record_path.read_bytes()).hexdigest(),
                'log': str(log_path.relative_to(output)), 'logSha256': record.get('logSha256'),
                'finishedAt': record.get('finishedAt'), 'lastHeartbeatAt': record.get('lastHeartbeatAt')}
            atomic_json(progress_path, progress)

        def heartbeat(elapsed, pid):
            record.update({'lastHeartbeatAt': now(), 'elapsedSeconds': round(elapsed, 3), 'pid': pid})
            publish()
            print(json.dumps({'job': label, 'index': index, 'status': 'RUNNING',
                              'elapsedSeconds': record['elapsedSeconds'], 'pid': pid}), flush=True)

        publish()
        print(json.dumps({'job': label, 'index': index, 'of': len(plan), 'status': 'RUNNING'}, ensure_ascii=False), flush=True)
        with log_path.open('xb') as log:
            try:
                result = run_process(command, root, env, log, timeout_seconds,
                                     args.heartbeat_seconds, args.terminate_grace_seconds, heartbeat)
            except OSError as error:
                result = {'status': 'FAIL', 'exitCode': 127, 'launchError': str(error)}
        record.update(result)
        record.update({'finishedAt': now(), 'logSha256': hashlib.sha256(log_path.read_bytes()).hexdigest()})
        publish()
        print(json.dumps({'job': label, 'index': index, 'status': record['status'], 'exitCode': result['exitCode']}, ensure_ascii=False), flush=True)
        if result['status'] == 'INTERRUPTED':
            return 130
        if result['exitCode']:
            failed = True
            if not args.continue_on_failure:
                break
    return 1 if failed else 0


if __name__ == '__main__':
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    sys.exit(main())
