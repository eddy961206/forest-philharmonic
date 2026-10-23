"""Recompute descriptive results from the committed raw samples (stdlib only)."""
import json
import statistics as stats
from pathlib import Path
root = Path(__file__).resolve().parents[2] / 'docs/evidence/quality-preserving-optimization'
def mean(a): return stats.mean(a)
def summary(rows):
    result = {}
    for mode in ['original', 'batched']:
        selected = [r for r in rows if r['mode'] == mode and not r['warmup']]
        result[mode] = {key: mean([mean(r[key]) for r in selected]) for key in ['frames', 'submit', 'calls']}
        result[mode]['late'] = sum(r['late'] for r in selected)
        result[mode]['underruns'] = sum(r['statsEnd']['underrunEvents'] - r['statsStart']['underrunEvents'] for r in selected)
    result['changePercent'] = {key: 100 * (result['batched'][key] / result['original'][key] - 1) for key in ['frames', 'submit', 'calls']}
    return result
out = {'paired': {venue:summary(json.loads((root / f'paired-{venue}.json').read_text())) for venue in ['hall', 'sphere']}}
out['freshPages'] = {}
for venue, prefix in [('hall', 'fresh-'), ('sphere', '')]:
    out['freshPages'][venue] = {}
    for run in ['a1', 'b1', 'b2', 'a2']:
        d = json.loads((root / f'{prefix}{run}-{venue}.json').read_text())
        out['freshPages'][venue][run] = d['summary']
out['visual'] = {venue:json.loads((root / f'equivalence-{venue}.json').read_text()) for venue in ['hall', 'sphere']}
(root / 'summary.json').write_text(json.dumps(out, indent=2) + '\n')
print(json.dumps(out['paired'], indent=2))
