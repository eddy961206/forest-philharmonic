#!/usr/bin/env python3
"""독립 worktree 두 개와 직렬 실제 GPU A/B/B/A 계획을 만들어. 브라우저는 열지 않아."""

import argparse
import hashlib
import io
import json
import math
import subprocess
import tarfile
from pathlib import Path

BASELINE = 'e741811d1d7a040afcdd3a8230465980c64f82fc'
PRODUCT_ROOTS = ('public', 'server', 'server.js', 'package.json', 'package-lock.json')


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], check=True,
                          capture_output=True, timeout=120).stdout


def digest(value):
    return hashlib.sha256(value).hexdigest()


def write_json(path, value):
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def product_hashes(repo, revision, tree):
    """Git 객체의 제품 바이트와 실제 worktree를 대조해. CRLF 변환도 감지해."""
    available = git(repo, 'ls-tree', '--name-only', revision).decode().splitlines()
    paths = [name for name in PRODUCT_ROOTS if name in available]
    data = git(repo, 'archive', '--format=tar', revision, '--', *paths)
    hashes = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        for item in archive:
            if item.isdir():
                continue
            if not item.isfile() or '..' in Path(item.name).parts:
                raise ValueError('제품에 일반 파일이 아닌 항목이 있어: ' + item.name)
            expected = digest(archive.extractfile(item).read())
            if digest((tree / item.name).read_bytes()) != expected:
                raise ValueError('Git 원본과 worktree 바이트가 달라: ' + item.name)
            hashes[item.name] = expected
    return hashes


def prepare(args):
    repo = args.repo.resolve()
    baseline = git(repo, 'rev-parse', '--verify', args.baseline_ref + '^{commit}').decode().strip()
    candidate = git(repo, 'rev-parse', '--verify', args.candidate_ref + '^{commit}').decode().strip()
    if baseline == candidate:
        raise ValueError('기준과 후보가 같은 커밋이야.')
    if args.blocks < 2 or args.samples < 600 or args.warmup < 60:
        raise ValueError('병합 판단 계획은 ABBA 2블록·600표본·60준비 프레임 이상으로 만들어.')
    for value in [args.width, args.height, args.dpr, args.job_timeout]:
        if not math.isfinite(value) or value <= 0:
            raise ValueError('해상도·DPR·시간 제한은 유한한 양수여야 해.')
    if args.chrome and not args.chrome.is_file():
        raise ValueError('Chrome/Edge 실행 파일을 찾지 못했어.')
    if not args.playwright.is_dir():
        raise ValueError('--playwright에 설치한 playwright 패키지 디렉터리를 지정해.')
    # 측정 도구도 후보의 고정 커밋을 사용해. 준비 스크립트만 새 버전으로 바꿔 실행하지 않아.
    own = Path(__file__).resolve()
    if own != repo / 'tools/bench/prepare-merge-check.py':
        raise ValueError('--repo는 이 준비 도구가 있는 저장소여야 해.')
    if own.read_bytes() != git(repo, 'show', candidate + ':tools/bench/prepare-merge-check.py'):
        raise ValueError('후보에 현재 준비 도구를 커밋한 뒤 다시 실행해.')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    revisions = {'baseline': baseline, 'candidate': candidate}
    products = {}
    for side, revision in revisions.items():
        tree = output / side
        # Windows에서도 HTTP 바이트와 Git 객체 해시가 같도록 이 checkout에만 적용해.
        git(repo, '-c', 'core.autocrlf=false', 'worktree', 'add', '--detach', str(tree), revision)
        products[side] = product_hashes(repo, revision, tree)
    files = [{'path': name, **{side + 'Sha256': products[side].get(name) for side in revisions}}
             for name in sorted(set(products['baseline']) | set(products['candidate']))]
    collector = output / 'candidate'
    tools_hashes = {str(p.relative_to(collector)).replace('\\', '/'): digest(p.read_bytes())
                   for p in sorted((collector / 'tools/bench').glob('*')) if p.is_file()}
    manifest = {**revisions, 'schema': 1, 'files': files, 'collectors': tools_hashes,
                'coverage': '모든 tracked public 파일과 server/, server.js, package 파일의 Git/worktree 바이트. 모든 public 응답도 각 실행 전후 대조.',
                'preparerSha256': digest(own.read_bytes()),
                'policy': {'blocks': args.blocks, 'samples': args.samples, 'warmup': args.warmup,
                           'viewport': [args.width, args.height], 'dpr': args.dpr,
                           'meanRegressionPercent': 5, 'p95RegressionPercent': 10,
                           'onePercentLowRegressionPercent': 10,
                           'requiredScenarios': ['hall/front', 'sphere/wide', 'sphere/forest'],
                           'note': '공학적 보류 기준이며 통계적 유의성·실제 출력 FPS의 증명은 아니야.'}}
    manifest_path = output / 'source-manifest.json'
    write_json(manifest_path, manifest)
    plan = []
    for block in range(1, args.blocks + 1):
        for venue, scenes in [('hall', 'front'), ('sphere', 'wide,forest')]:
            for side, pair in [('baseline', 'a'), ('candidate', 'a'), ('candidate', 'b'), ('baseline', 'b')]:
                label = f'{side}-r{block}{pair}'
                plan.append({
                    'id': f'{label}-{venue}', 'script': 'tools/bench/full-frame.mjs',
                    'args': [label, venue, 'high', 'desktop', scenes],
                    'timeoutSeconds': args.job_timeout,
                    'env': {'REVISION': revisions[side], 'MODE': 'cadence',
                            'SAMPLES': str(args.samples), 'WARMUP': str(args.warmup),
                            'WIDTH': str(args.width), 'HEIGHT': str(args.height), 'DPR': str(args.dpr),
                            'TIMEOUT_MS': str(int(args.job_timeout * 1000)), 'SCREENSHOTS': '1',
                            'BASE_URL': 'http://127.0.0.1:' + ('8381' if side == 'baseline' else '8382'),
                            'HEADLESS': '0', 'CHROME_ARGS': '[]', 'SOFTWARE_RENDERER': '0',
                            'REQUIRE_HARDWARE': '1', 'FONT_MODE': 'system', 'FONT_ROOT': '',
                            'CHROME_EXECUTABLE': str(args.chrome.resolve()) if args.chrome else '',
                            'PLAYWRIGHT_MODULE': str(args.playwright.resolve()),
                            'SOURCE_MANIFEST': str(manifest_path), 'SOURCE_SIDE': side,
                            'SOURCE_TREE': str(output / side)},
                })
    write_json(output / 'plan.json', plan)
    write_json(output / 'setup.json', {'baseline': baseline, 'candidate': candidate,
               'collector': str(collector), 'jobs': len(plan), 'jobTimeoutSeconds': args.job_timeout,
               'maximumJobBudgetMinutes': len(plan) * (args.job_timeout + 5) / 60,
               'planSha256': digest((output / 'plan.json').read_bytes()),
               'manifestSha256': digest(manifest_path.read_bytes())})
    return output


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    result.add_argument('--baseline-ref', default=BASELINE, help='원하면 fetch 후 origin/main 등으로 지정해. 전체 SHA로 고정돼.')
    result.add_argument('--candidate-ref', default='HEAD', help='검증할 커밋. 수정사항을 먼저 커밋해.')
    result.add_argument('--output', type=Path, required=True, help='새 폴더. 기존 출력은 덮어쓰지 않아.')
    result.add_argument('--playwright', type=Path, required=True, help='별도 설치한 node_modules/playwright 경로')
    result.add_argument('--chrome', type=Path, help='생략하면 Playwright Chromium. 실제 렌더러는 실행 때 검사해.')
    result.add_argument('--blocks', type=int, default=2)
    result.add_argument('--samples', type=int, default=600)
    result.add_argument('--warmup', type=int, default=60)
    result.add_argument('--width', type=int, default=1280)
    result.add_argument('--height', type=int, default=720)
    result.add_argument('--dpr', type=float, default=1)
    result.add_argument('--job-timeout', type=float, default=100,
                        help='실행별 초 단위 상한. 기본 16개 job의 총 예산 약 28분; 보통은 훨씬 빨리 끝나.')
    return result


if __name__ == '__main__':
    print(prepare(parser().parse_args()))
