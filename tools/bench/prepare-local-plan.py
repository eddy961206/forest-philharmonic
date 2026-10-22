#!/usr/bin/env python3
"""고정 e741/6c 렌더 계획을 로컬 PC 경로로 변환해. 브라우저는 실행하지 않아."""

import argparse
import hashlib
import json
import math
import re
from pathlib import Path


REVISIONS = {
    'baseline': 'e741811d1d7a040afcdd3a8230465980c64f82fc',
    'candidate': '6c7817218814f00631089eb2c6f150d68190980f',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def write_json(path, value):
    with path.open('w', encoding='utf-8', newline='\n') as handle:
        handle.write(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument('--root', type=Path, required=True,
                        help='source/reference/candidate/collector/evidence가 있는 폴더')
    result.add_argument('--output', type=Path, required=True,
                        help='새 계획과 manifest를 만들 폴더. 기존 폴더는 덮어쓰지 않아.')
    result.add_argument('--plan', type=Path,
                        help='변환할 렌더 계획. 기본값: ROOT/evidence/high-plan.json')
    result.add_argument('--chrome', type=Path, help='Chrome/Edge 실행 파일. 기본값: Playwright Chromium')
    result.add_argument('--mode', choices=['sync', 'cadence'], default='sync')
    result.add_argument('--samples', type=int,
                        help='표본 수. sync는 원본을 유지하고 cadence는 기본 120이야.')
    result.add_argument('--warmup', type=int, help='생략하면 각 job의 원본 값을 유지해.')
    result.add_argument('--width', type=int, help='생략하면 각 job의 원본 viewport 너비를 유지해.')
    result.add_argument('--height', type=int, help='생략하면 각 job의 원본 viewport 높이를 유지해.')
    result.add_argument('--dpr', type=float, help='생략하면 각 job의 원본 DPR을 유지해.')
    return result


def prepare(args):
    root, output = args.root.resolve(), args.output.resolve()
    evidence = root / 'evidence'
    manifest_path = evidence / 'measurement-manifest.json'
    plan_path = args.plan.resolve() if args.plan else evidence / 'high-plan.json'
    manifest, plan = read_json(manifest_path), read_json(plan_path)
    # 원본 launch 기록을 읽지만 클라우드의 소프트웨어 옵션은 PC에 적용하지 않아.
    read_json(evidence / 'chromium.json')
    require(isinstance(plan, list) and bool(plan), '계획은 비어 있지 않은 job 배열이어야 해.')
    for side, revision in REVISIONS.items():
        require(manifest[side] == revision, f'{side}: 원본 manifest의 제품 버전이 달라.')
    for name, expected_sha in manifest['collectors'].items():
        require(Path(name).name == name and '\\' not in name, f'잘못된 도구 경로: {name}')
        require(sha(root / 'collector/tools/bench' / name) == expected_sha,
                f'고정 수집 도구가 달라: {name}')
    paths = sorted(set(manifest['source']['baseline']) | set(manifest['source']['candidate']))
    files = []
    for name in paths:
        require(name.startswith('public/') and '..' not in Path(name).parts and '\\' not in name,
                f'잘못된 제품 경로: {name}')
        row = {'path': name}
        for side, tree in [('baseline', 'reference'), ('candidate', 'candidate')]:
            value = manifest['source'][side].get(name)
            local = root / tree / name
            if value is None:
                require(not local.exists(), f'{side}: 없어야 할 파일이 있어: {name}')
            else:
                require(isinstance(value, str) and re.fullmatch('[a-f0-9]{64}', value),
                        f'{side}: 잘못된 SHA-256: {name}')
                require(sha(local) == value, f'{side}: 제품 파일이 달라: {name}')
            row[side + 'Sha256'] = value
        files.append(row)
    if args.chrome is not None:
        require(args.chrome.is_file(), 'Chrome/Edge 실행 파일이 없어.')
    for job in plan:
        require(job['script'] == 'tools/bench/full-frame.mjs',
                f"렌더 계획이 아니야: {job['id']}")
        side = job['args'][0].split('-', 1)[0]
        require(side in REVISIONS, f"잘못된 A/B 라벨: {job['id']}")
        env = job['env']
        require(env['REVISION'] == REVISIONS[side], f"제품 버전이 달라: {job['id']}")
        # 혼합 desktop/mobile 계획의 화면 크기를 통일해 버리지 않아.
        values = {}
        for key, option, fallback, number in [
            ('WIDTH', args.width, 640, int), ('HEIGHT', args.height, 360, int),
            ('DPR', args.dpr, 1, float), ('WARMUP', args.warmup, 2, int),
        ]:
            value = number(env.get(key, fallback) if option is None else option)
            require(math.isfinite(value) and value > 0, f'{job["id"]}: {key}는 양수여야 해.')
            values[key] = str(value)
        samples = args.samples
        if samples is None:
            samples = 120 if args.mode == 'cadence' else int(env.get('SAMPLES', 4))
        require(samples > 0, f'{job["id"]}: SAMPLES는 양수여야 해.')
        job['id'] = 'pc-' + args.mode + '-' + job['id']
        job['timeoutSeconds'] = 360 if args.mode == 'sync' else 600
        env.pop('OUTPUT_DIR', None)
        env.update({
            'PLAYWRIGHT_MODULE': str(root / 'tools-runtime/node_modules/playwright'),
            'CHROME_EXECUTABLE': str(args.chrome.resolve()) if args.chrome else '',
            'CHROME_ARGS': '[]', 'SOFTWARE_RENDERER': '0', 'HEADLESS': '0',
            'FONT_MODE': 'system', 'FONT_ROOT': '', 'MODE': args.mode,
            **values, 'SAMPLES': str(samples), 'SCREENSHOTS': '1', 'TIMEOUT_MS': '180000',
            'BASE_URL': 'http://127.0.0.1:' + ('8381' if side == 'baseline' else '8382'),
        })
    source_manifest = {
        **REVISIONS, 'files': files,
        'originManifestSha256': sha(manifest_path), 'originPlanSha256': sha(plan_path),
        'originPlanPath': str(plan_path), 'preparerSha256': sha(Path(__file__)),
        'note': 'PC plan derived from the recorded e741/6c comparison; not a new product revision',
    }
    output.mkdir(parents=True, exist_ok=False)
    write_json(output / 'plan.json', plan)
    write_json(output / 'source-manifest.json', source_manifest)
    return output


def main():
    print(prepare(parser().parse_args()))


if __name__ == '__main__':
    main()
