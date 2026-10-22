#!/usr/bin/env python3
"""검증된 직렬 ABBA 집계에 보류 기준을 적용해. 실제 UI/청감 검사는 별도로 남겨."""

import argparse
import hashlib
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

SCENES = {
    'hall/front': ([0, 1.75, 5], [0, 2, -7], None),
    'sphere/wide': ([0, 44, 62], [0, 3, -6], 'ARCH'),
    'sphere/forest': ([0, 19, 34], [0, 3, -6], 'FOREST3D'),
}


def assess(summary, manifest):
    policy = manifest['policy']
    if policy['blocks'] < 2 or [policy[key] for key in ('meanRegressionPercent', 'p95RegressionPercent', 'onePercentLowRegressionPercent')] != [5, 10, 10]:
        raise ValueError('최소 2블록과 사전에 고정한 5/10/10% 보류 기준이 필요해.')
    if summary.get('status') != 'PASS' or summary.get('excluded'):
        raise ValueError('누락·실패·조건 불일치가 있는 집계는 병합 성능 판단에 쓸 수 없어.')
    if summary.get('expectedJobs') != policy['blocks'] * 8 or summary.get('completedPairs') != policy['blocks'] * 4:
        raise ValueError('계획된 모든 ABBA 반복이 필요해.')
    expected_jobs = [(f'{side}-r{block}{pair}-{venue}', side)
                     for block in range(1, policy['blocks'] + 1) for venue in ('hall', 'sphere')
                     for side, pair in [('baseline', 'a'), ('candidate', 'a'), ('candidate', 'b'), ('baseline', 'b')]]
    jobs = summary.get('jobs', [])
    if len(jobs) != len(expected_jobs):
        raise ValueError('모든 실제 실행의 검증 계약이 필요해.')
    previous_end = None
    for index, (job, (name, side)) in enumerate(zip(jobs, expected_jobs)):
        contract = job.get('validationContract', {})
        if (job.get('status') != 'PASS' or job.get('id') != name or job.get('side') != side or job.get('index') != index or
            contract.get('schema') != 'merge-check-v1' or
            any(contract.get(key) is not True for key in ('hardware', 'fullLocalSources', 'fullPublicHttpSources')) or
            contract.get('softwareRequested') is not False or
            contract.get('manifestSha256') != summary['provenance']['manifestSha256'] or
            contract.get('productFileCount') != len(manifest['files']) or
            contract.get('publicFileCount') != sum(f['path'].startswith('public/') for f in manifest['files'])):
            raise ValueError(f'{name}: 실제 GPU·전체 소스 해시·ABBA 실행 계약이 부족해.')
        renderer = contract.get('renderer') or ''
        if (re.search(r'swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|\bwarp\b', renderer, re.I) or
            not re.search(r'nvidia|geforce|quadro|radeon|\bamd\b|\bati\b|intel|apple|adreno|qualcomm|\bmali\b|\barm\b|powervr|imagination|broadcom', renderer, re.I)):
            raise ValueError(f'{name}: 물리 GPU를 확인하지 못했어.')
        started = datetime.fromisoformat(job['startedAt'].replace('Z', '+00:00'))
        finished = datetime.fromisoformat(job['finishedAt'].replace('Z', '+00:00'))
        if started.tzinfo is None or finished.tzinfo is None or finished < started or (previous_end and started < previous_end):
            raise ValueError(f'{name}: 실제 ABBA 실행 순서가 다르거나 GPU 실행이 겹쳤어.')
        previous_end = finished
    comparisons = summary['comparisons']
    if len(comparisons) != policy['blocks'] * 4:
        raise ValueError('전후 비교가 부족해.')
    by_pair = {comparison['pairKey']: comparison for comparison in comparisons}
    if len(by_pair) != len(comparisons):
        raise ValueError('전후 비교 쌍이 중복됐어.')
    environment = comparisons[0]['conditions']['environment']
    venue_fixtures = {}
    for comparison in comparisons:
        if comparison['conditions']['environment'] != environment:
            raise ValueError('반복 사이의 브라우저/실행 환경이 달라.')
        if comparison['conditions']['beforeMeta'] != comparisons[0]['conditions']['beforeMeta']:
            raise ValueError('반복 사이의 renderer/해상도/품질이 달라.')
        conditions = comparison['conditions']
        if conditions['fixture'].get('lite') is not False:
            raise ValueError('정식 desktop 장면을 Lite 대체 장면으로 비교할 수 없어.')
        for key, expected in {'piece': 'beethoven-ode-to-joy', 'crowdFill': .8, 'crowdSeed': 417, 'randomSeed': 417}.items():
            if conditions['fixturePolicy'].get(key) != expected:
                raise ValueError('고정 곡·관객 시드·점유 조건이 달라.')
        parts = comparison['pairKey'].split('/')
        if len(parts) != 5 or parts[1] not in ('hall', 'sphere') or parts[2:] != ['high', 'desktop', 'cadence']:
            raise ValueError('정식 desktop/high/cadence 비교 쌍이 아니야.')
        venue = parts[1]
        if venue in venue_fixtures and conditions['fixture'] != venue_fixtures[venue]:
            raise ValueError('반복 사이의 관객·재생 fixture가 달라.')
        venue_fixtures[venue] = conditions['fixture']
    groups = defaultdict(list)
    for row in summary['rows']:
        if (row['mode'] != 'raf-cadence' or row['quality'] != 'high' or row.get('device') != 'desktop' or
            row['samplesPerScenario'] < 600 or row['warmupFrames'] < 60 or
            row['viewport'] != policy['viewport'] or row['devicePixelRatio'] != policy['dpr']):
            raise ValueError('고정 품질·해상도·최소 표본 조건이 달라.')
        if row['beforeRevision'] != manifest['baseline'] or row['afterRevision'] != manifest['candidate']:
            raise ValueError('실제 비교 제품 커밋이 manifest와 달라.')
        name = row['venue'] + '/' + row['scenario']
        if name not in SCENES or row.get('pairKey') != f"-{row['repeat']}/{row['venue']}/high/desktop/cadence" or row['pairKey'] not in by_pair:
            raise ValueError('필수 장면의 실제 비교 쌍이 아니야.')
        position, target, world = SCENES[name]
        expected_state = {'camera': {'position': position, 'target': target, 'fov': 64}, 'musicTime': 25,
                          'world': world, 'broadcast': False, 'effectsPeak': False, 'effectsShow': False}
        if row['scenarioState'] != expected_state:
            raise ValueError(name + ': 실제 카메라·음악 시각·3D 세계가 계획과 달라.')
        groups[name].append(row)
    if set(groups) != set(policy['requiredScenarios']):
        raise ValueError('필수 장면이 누락됐거나 계획과 달라.')
    expected = {f'r{block}{pair}' for block in range(1, policy['blocks'] + 1) for pair in 'ab'}
    findings = []
    for name, rows in sorted(groups.items()):
        if len(rows) != len(expected) or {row['repeat'] for row in rows} != expected:
            raise ValueError(name + ': 양방향 독립 실행 쌍이 부족하거나 중복됐어.')
        metrics = {'meanMs': policy['meanRegressionPercent'], 'p95Ms': policy['p95RegressionPercent'],
                   'onePercentLowRafFps': policy['onePercentLowRegressionPercent']}
        bad = {}
        for metric, threshold in metrics.items():
            values = [row['changes'][metric]['percent'] for row in rows]
            if any(value is None for value in values):
                raise ValueError(name + ': 필요한 지표가 미측정이야.')
            bad[metric] = [row['repeat'] for row, value in zip(rows, values)
                           if (-value if metric == 'onePercentLowRafFps' else value) > threshold]
        # At least three of four pairs must repeat the deterioration to call it
        # a regression signal. Isolated exceedances stay inconclusive, not PASS.
        repeated = any(len(repeats) >= len(rows) * .75 for repeats in bad.values())
        state = 'HOLD_REGRESSION' if repeated else 'INCONCLUSIVE' if any(bad.values()) else 'CLEAR'
        findings.append({'scenario': name, 'status': state, 'exceedances': bad,
                         'pairs': [{'repeat': row['repeat'], 'meanMsPercent': row['changes']['meanMs']['percent'],
                                    'p95MsPercent': row['changes']['p95Ms']['percent'],
                                    'onePercentLowFpsPercent': row['changes']['onePercentLowRafFps']['percent']}
                                   for row in rows]})
    state = 'HOLD_REGRESSION' if any(f['status'] == 'HOLD_REGRESSION' for f in findings) else (
        'INCONCLUSIVE' if any(f['status'] == 'INCONCLUSIVE' for f in findings) else 'CLEAR')
    return {'status': state, 'baseline': manifest['baseline'], 'candidate': manifest['candidate'],
            'policy': policy, 'scenarios': findings,
            'meaning': 'CLEAR는 이 GPU·조건의 회귀 보류선 미초과야. 성능 향상/모든 기기/실제 음악/UI/자동 병합 승인이 아니야.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--summary', required=True, type=Path)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    summary_bytes, manifest_bytes = args.summary.read_bytes(), args.manifest.read_bytes()
    try:
        summary, manifest = json.loads(summary_bytes), json.loads(manifest_bytes)
        if summary['provenance']['manifestSha256'] != hashlib.sha256(manifest_bytes).hexdigest():
            raise ValueError('집계 때 사용한 manifest와 달라.')
        result = assess(summary, manifest)
    except (ValueError, KeyError, TypeError, IndexError) as error:
        result = {'status': 'INVALID', 'error': str(error)}
    result.update({'summarySha256': hashlib.sha256(summary_bytes).hexdigest(),
                   'manifestSha256': hashlib.sha256(manifest_bytes).hexdigest()})
    with args.output.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'status': result['status'], 'output': str(args.output)}, ensure_ascii=False))
    return 0 if result['status'] == 'CLEAR' else 1


if __name__ == '__main__':
    raise SystemExit(main())
