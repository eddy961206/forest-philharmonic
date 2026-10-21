"""Run each actual node:test file directly and retain its individual TAP cases."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json
import re
import subprocess

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--repo', type=Path, default=root / 'forest-integration-3f')
parser.add_argument('--output', type=Path, default=root / 'qa-3f/node-tests/case-tap')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
if any(args.output.iterdir()):
    raise ValueError('Refuse to overwrite earlier test evidence')
results = []
for source in sorted((args.repo / 'tests').glob('*.test.mjs')):
    relative = source.relative_to(args.repo).as_posix()
    command = ['node', '--experimental-loader', './tests/helpers/three-loader.mjs', '--test-reporter=tap', relative]
    log = args.output / (source.stem + '.log')
    start = datetime.now(timezone.utc).isoformat()
    with log.open('wb') as output:
        result = subprocess.run(command, cwd=args.repo, stdout=output, stderr=subprocess.STDOUT)
    text = log.read_text()
    counts = {key: (int(match.group(1)) if (match := re.search(r'^# ' + key + r' (\d+)\s*$', text, re.M)) else None) for key in ['tests', 'pass', 'fail']}
    entry = {'file': relative, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'command': command, 'exitCode': result.returncode, 'startedAt': start, 'finishedAt': datetime.now(timezone.utc).isoformat(), 'log': log.name, **counts}
    results.append(entry)
    print(json.dumps(entry), flush=True)
record = {'baseline': '3f1655b0c035a630adbcfbf19582dd9363386f34', 'candidate': '3f-integrated-candidate', 'node': subprocess.check_output(['node', '--version'], text=True).strip(), 'results': results}
record['passed'] = all(e['exitCode'] == 0 and e['tests'] and e['tests'] == e['pass'] and e['fail'] == 0 for e in results)
record['total'] = {key: sum(e[key] or 0 for e in results) for key in ['tests', 'pass', 'fail']}
(args.output / 'results.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': record['passed'], 'files': len(results), 'total': record['total']}))
raise SystemExit(0 if record['passed'] else 1)
