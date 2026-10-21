"""Keep the a41 scenario matrix but compare the new main and its integration."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parent.parent
old_plan = root / 'qa-a41/render-plan.json'
original = old_plan.read_bytes()
plan = json.loads(original)
for job in plan:
    job['runner'] = 'qa-3f/run-portable.mjs'
    baseline = job['args'][0].startswith('baseline')
    job['env']['BASE_URL'] = 'http://127.0.0.1:8084' if baseline else 'http://127.0.0.1:8085'
    job['env']['REVISION'] = '3f1655b0c035a630adbcfbf19582dd9363386f34' if baseline else '3f-integrated-candidate'
    job['env']['OUTPUT_DIR'] = str(root / 'qa-3f/render')
out = root / 'qa-3f/render-plan.json'
if out.exists():
    raise ValueError('Refuse to replace an existing execution plan')
out.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + '\n')
record = {
    'basis': 'qa-a41/render-plan.json',
    'basisSha256': hashlib.sha256(original).hexdigest(),
    'newPlanSha256': hashlib.sha256(out.read_bytes()).hexdigest(),
    'jobs': len(plan),
    'changes': ['baseline/candidate localhost ports', 'revision labels', 'output directory', 'Use qa-3f/run-portable.mjs to execute the frozen bench-source snapshot'],
    'unchanged': ['scenario order', 'sample count', 'warmup count', 'viewport', 'quality', 'mode', 'seed'],
    'note': 'The 3f fixture must separately exclude recital stage seats from the audience, record new scene state and reject sleeping/hidden pages. The a41 raw evidence is retained under its original baseline and original fixture hash. This file is a plan, not a test result.',
}
(root / 'qa-3f/render-plan-provenance.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(record, ensure_ascii=False))
