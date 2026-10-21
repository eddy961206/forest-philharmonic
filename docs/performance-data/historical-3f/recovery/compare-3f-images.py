#!/usr/bin/env python3
"""3f 원본 PNG를 고정된 compare-images.py로 비교하고 원본 해시를 남겨."""
import argparse
import contextlib
import hashlib
import io
import json
from pathlib import Path
import runpy
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--qa-root', type=Path, required=True)
    parser.add_argument('--output-root', type=Path, required=True)
    args = parser.parse_args()
    source = args.qa_root.resolve()
    target = args.output_root.resolve()
    assert source != target and source not in target.parents, '출력을 원본 안에 쓰면 안 돼.'
    target.mkdir(parents=True, exist_ok=True)
    compare = source / 'bench-source/compare-images.py'
    comparator = runpy.run_path(str(compare))['main']
    pairs = []
    for before in sorted((source / 'render').glob('baseline*.png')):
        after = before.with_name(before.name.replace('baseline', 'after', 1))
        assert after.is_file(), f'후보 PNG가 없어: {after.name}'
        name = before.stem.replace('baseline', 'comparison', 1) + '.json'
        sys.argv = [str(compare), str(before), str(after), '--output', str(target / name)]
        with contextlib.redirect_stdout(io.StringIO()):
            comparator()
        metrics = json.loads((target / name).read_text())
        pairs.append({
            'before': before.name, 'after': after.name, 'metrics': name,
            'automaticQuality': before.name.startswith('baseline-auto-'),
            'pngByteEqual': before.read_bytes() == after.read_bytes(),
            'rgbExact': metrics['changedPixelCount'] == 0,
            'mae': metrics['mae'], 'rmse': metrics['rmse'],
            'ssimUniform7': metrics['ssimUniform7'],
            'changedPixelPercent': metrics['changedPixelPercent'],
            'sha256': metrics['sha256'],
        })
    assert len(list((source / 'render').glob('after*.png'))) == len(pairs)
    manual = [p for p in pairs if not p['automaticQuality']]
    automatic = [p for p in pairs if p['automaticQuality']]
    summary = {
        'schema': 1,
        'baseline': '3f1655b0c035a630adbcfbf19582dd9363386f34',
        'candidateLabel': '3f-integrated-candidate',
        'sourceRootAtAnalysis': str(source),
        'comparator': {'file': 'bench-source/compare-images.py', 'sha256': hashlib.sha256(compare.read_bytes()).hexdigest()},
        'pairCount': len(pairs), 'manualPairCount': len(manual), 'automaticPairCount': len(automatic),
        'manualPngByteEqual': sum(p['pngByteEqual'] for p in manual),
        'manualRgbExact': sum(p['rgbExact'] for p in manual),
        'manualRgbDifferent': sum(not p['rgbExact'] for p in manual),
        'manualMinimumSsim': min(p['ssimUniform7'] for p in manual),
        'manualMaximumMae': max(p['mae'] for p in manual),
        'note': '수동 61쌍은 smoke·최초·steady·repeat 캡처를 포함해. 독립 실험 61개의 성공률이 아니야. auto 2쌍은 내부 해상도가 달라 별도 관찰이야. 지표 하나로 화질 PASS를 판정하지 않아.',
        'pairs': pairs,
    }
    (target / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k:v for k,v in summary.items() if k != 'pairs'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
