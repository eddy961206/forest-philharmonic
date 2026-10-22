#!/usr/bin/env python3
"""고정 e741/6c 런타임 계획을 로컬 PC 경로로 변환해. 브라우저는 실행하지 않아."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


REFS = {
    'reference': 'e741811d1d7a040afcdd3a8230465980c64f82fc',
    'candidate': '6c7817218814f00631089eb2c6f150d68190980f',
    'collector-runtime': '7b07e15',
}
PLAN_NAMES = ['runtime-core-plan.json', 'runtime-app-plan.json', 'cadence-plan.json']


def git(tree, *args):
    return subprocess.check_output(['git', '-C', str(tree), *args], text=True).strip()


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
                        help='source/reference/candidate/collector-runtime이 있는 폴더')
    result.add_argument('--input', type=Path, required=True, help='원본 runtime 계획 세 개가 있는 폴더')
    result.add_argument('--output', type=Path, required=True, help='계획을 만들 새 폴더. 덮어쓰지 않아.')
    result.add_argument('--chrome', type=Path, help='Chrome/Edge 실행 파일. 기본값: Playwright Chromium')
    return result


def prepare(args):
    root, source, output = args.root.resolve(), args.input.resolve(), args.output.resolve()
    heads = {}
    for tree, ref in REFS.items():
        folder = root / tree
        expected = git(root / 'source', 'rev-parse', ref + '^{commit}')
        heads[tree] = git(folder, 'rev-parse', 'HEAD')
        require(heads[tree] == expected, f'{tree}: 고정 커밋과 달라.')
        require(not git(folder, 'status', '--porcelain'), f'{tree}: worktree에 변경이 있어.')
    playwright = root / 'tools-runtime/node_modules/playwright'
    require((playwright / 'package.json').is_file(), 'Playwright 설치가 없어.')
    require(read_json(playwright / 'package.json')['version'] == '1.62.1',
            'Playwright 1.62.1을 사용해.')
    if args.chrome is not None:
        require(args.chrome.is_file(), 'Chrome/Edge 실행 파일이 없어.')
    collector = root / 'collector-runtime/tools/bench'
    tool_hashes = {path.name: sha(path) for path in sorted(collector.iterdir())
                   if path.is_file() and path.suffix in {'.js', '.mjs', '.py'}}
    plans, inputs = {}, {}
    for name in PLAN_NAMES:
        original = source / name
        jobs = read_json(original)
        require(isinstance(jobs, list) and bool(jobs), f'{name}: 비어 있지 않은 job 배열이어야 해.')
        inputs[name] = {'file': str(original), 'sha256': sha(original), 'jobs': len(jobs)}
        for job in jobs:
            env = job['env']
            revision = env['REVISION']
            require(revision in [REFS['reference'], REFS['candidate']],
                    f"제품 버전이 달라: {job['id']}")
            side = 'reference' if revision == REFS['reference'] else 'candidate'
            script = job['script']
            require(script.startswith('tools/bench/') and '..' not in Path(script).parts
                    and '\\' not in script, f'잘못된 도구 경로: {script}')
            require((root / 'collector-runtime' / script).is_file(), f'도구 파일이 없어: {script}')
            for key in ['OUTPUT_DIR', 'REPO_DIR']:
                env.pop(key, None)
            env.update({
                'PLAYWRIGHT_MODULE': str(playwright), 'SOFTWARE_RENDERER': '0',
                'CHROME_EXECUTABLE': str(args.chrome.resolve()) if args.chrome else '',
                'CHROME_ARGS': '[]', 'HEADLESS': '0', 'FONT_MODE': 'system', 'FONT_ROOT': '',
                'BASE_URL': 'http://127.0.0.1:' + ('8381' if side == 'reference' else '8382'),
            })
            if script.endswith('/multiplayer.mjs'):
                # 별도 임시 서버와 RoomClient는 수집기가 아닌 고정 제품에서 읽어.
                env['REPO_DIR'] = str(root / side)
            if script.endswith('/functional.mjs'):
                env['SCOPE'] = 'full'
        plans[name] = jobs
    output.mkdir(parents=True, exist_ok=False)
    for name, jobs in plans.items():
        write_json(output / name, jobs)
    record = {
        'heads': heads, 'inputs': inputs, 'collectorSha256': tool_hashes,
        'preparerSha256': sha(Path(__file__)),
        'environment': {'headed': True, 'fontMode': 'system', 'softwareRequested': False},
        'plans': {name: sha(output / name) for name in plans},
    }
    write_json(output / 'local-runtime-manifest.json', record)
    return {'output': str(output), 'heads': heads, 'plans': inputs}


def main():
    print(json.dumps(prepare(parser().parse_args()), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
