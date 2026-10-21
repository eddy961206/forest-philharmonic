"""Prepare the 3f runtime matrix and local-file provenance; never launch a test."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
BASELINE = '3f1655b0c035a630adbcfbf19582dd9363386f34'
BASE_REPO = ROOT / 'forest-baseline-3f'
CANDIDATE = ROOT / 'forest-integration-3f'
RUNNER = 'qa-3f/run-portable.mjs'
MULTI_RUNNER = 'qa-3f/run-multiprocess.mjs'
OUT = HERE / 'runtime-results'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def relative(path):
    return str(path.relative_to(ROOT))


def file_record(path):
    data = path.read_bytes()
    return {'path': relative(path), 'bytes': len(data), 'sha256': digest(data)}


def write_json(path, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    # An intentional revision needs a new plan/provenance file. Never silently
    # replace a plan after it may have produced browser evidence.
    if path.exists():
        if path.read_bytes() != data:
            raise RuntimeError(f'Refusing to overwrite a different existing file: {path}')
    else:
        path.write_bytes(data)


def env_for(side, device='desktop', room=False):
    mobile = device == 'mobile'
    return {
        'OUTPUT_DIR': str(OUT),
        'BASE_URL': 'http://127.0.0.1:8084' if side == 'baseline' else 'http://127.0.0.1:8085',
        'REVISION': BASELINE if side == 'baseline' else '3f-integrated-candidate',
        'WIDTH': '390' if mobile else '960',
        'HEIGHT': '844' if mobile else ('640' if room else '540'),
        'DPR': '2' if mobile else '1',
        'HEADLESS': '1',
        'SCREENSHOTS': '0',
        'TIMEOUT_MS': '180000',
    }


groups = {'loading': [], 'audio': [], 'rooms': [], 'functional': [], 'protocol': []}
outputs = []


def append(group, ident, script, args, env, expected_outputs, runner=RUNNER):
    for output in expected_outputs:
        if output in outputs:
            raise RuntimeError(f'Duplicate output: {output}')
        if (ROOT / output).exists():
            raise RuntimeError(f'Expected fresh output already exists: {output}')
        outputs.append(output)
    groups[group].append({
        'id': ident,
        'runner': runner,
        'script': 'tools/bench/' + script,
        'args': args,
        'env': env,
        'expectedOutputs': expected_outputs,
    })


for venue in ['hall', 'sphere']:
    for device in ['desktop', 'mobile']:
        for side, label in [('baseline', 'baseline-3f-fixed'), ('candidate', 'after-3f-fixed')]:
            append('loading', f'loading-{side}-{venue}-{device}', 'loading.mjs',
                   [label, venue, device], env_for(side, device),
                   [f'qa-3f/runtime-results/loading-{label}-{venue}-{device}.json'])

# Match a41's six actual-audio scopes exactly: two A/B pairs plus two
# candidate-only combinations. Do not describe these as four paired cases.
audio_cases = [
    ('baseline', 'hall', 'desktop'), ('candidate', 'hall', 'desktop'),
    ('baseline', 'sphere', 'mobile'), ('candidate', 'sphere', 'mobile'),
    ('candidate', 'hall', 'mobile'), ('candidate', 'sphere', 'desktop'),
]
for side, venue, device in audio_cases:
    label = 'baseline-3f' if side == 'baseline' else 'after-3f'
    append('audio', f'audio-{side}-{venue}-{device}', 'audio-stability.mjs',
           [label, venue, device, '65'], env_for(side, device),
           [f'qa-3f/runtime-results/audio-stability-{label}-{venue}-{device}.json'])

for venue, mode in [('hall', 'cross'), ('sphere', 'core')]:
    label = '3f-current'
    append('rooms', f'rooms-{venue}-{mode}', 'rooms.mjs', [label, venue, mode],
           env_for('candidate', room=True),
           [f'qa-3f/runtime-results/rooms-{label}-{venue}-{mode}.json'], MULTI_RUNNER)

for venue in ['hall', 'sphere']:
    for device in ['desktop', 'mobile']:
        output_dir = HERE / 'functional-results' / f'{venue}-{device}'
        env = env_for('candidate', device)
        env.update({
            'OUTPUT_DIR': str(output_dir), 'LABEL': 'functional-3f',
            'SCOPE': 'full', 'CONTINUE_ON_TRANSPORT_FAIL': '1',
        })
        append('functional', f'functional-{venue}-{device}', 'functional.mjs',
               [venue, device], env, [
                   relative(output_dir / f'functional-3f-{venue}-{device}.json'),
                   relative(output_dir / 'functional-3f-summary.json'),
               ])

protocol_env = env_for('candidate')
# The snapshot is outside the repository. The collector's relative default
# would otherwise resolve to the scratch root instead of the product checkout.
protocol_env['REPO_DIR'] = str(CANDIDATE)
append('protocol', 'protocol-localhost-3f', 'multiplayer.mjs', ['3f-current'],
       protocol_env, ['qa-3f/runtime-results/multiplayer-3f-current.json'])

plan = [job for jobs in groups.values() for job in jobs]
assert len(plan) == 21
assert {key: len(value) for key, value in groups.items()} == {
    'loading': 8, 'audio': 6, 'rooms': 2, 'functional': 4, 'protocol': 1,
}

manifest_path = HERE / 'source-manifest.json'
manifest = json.loads(manifest_path.read_text())
assert manifest['baseline'] == BASELINE
actual_head = subprocess.check_output(['git', '-C', str(BASE_REPO), 'rev-parse', 'HEAD'], text=True).strip()
assert actual_head == BASELINE
source_proofs = []
for row in manifest['files']:
    rel = row['file']
    base_path, candidate_path = BASE_REPO / rel, CANDIDATE / rel
    base_data = base_path.read_bytes() if base_path.exists() else None
    candidate_data = candidate_path.read_bytes() if candidate_path.exists() else None
    base_sha = digest(base_data) if base_data is not None else None
    candidate_sha = digest(candidate_data) if candidate_data is not None else None
    assert base_sha == row['baselineSha256'], f'Baseline manifest drift: {rel}'
    assert candidate_sha == row['candidateSha256'], f'Candidate manifest drift: {rel}'
    git_data = None
    if row['baselineGitBlob']:
        git_data = subprocess.check_output(['git', '-C', str(BASE_REPO), 'show', f'{BASELINE}:{rel}'])
        assert digest(git_data) == base_sha, f'Baseline git/file drift: {rel}'
    source_proofs.append({
        'file': rel, 'baselineGitBlob': row['baselineGitBlob'],
        'baselineSha256': base_sha, 'candidateSha256': candidate_sha,
        'baselineWorktreeEqualsExactGitBlob': git_data == base_data if git_data is not None else None,
        'bothMatchSourceManifest': True,
    })

tool_proofs = []
for tool in sorted((HERE / 'bench-source').iterdir()):
    if not tool.is_file():
        continue
    original = ROOT / 'forest-philharmonic/tools/bench' / tool.name
    record = file_record(tool)
    record['a41FrozenToolPath'] = relative(original)
    record['a41FrozenToolSha256'] = digest(original.read_bytes())
    record['equalsA41FrozenTool'] = tool.read_bytes() == original.read_bytes()
    if tool.name != 'full-frame-fixture.js':
        assert record['equalsA41FrozenTool'], f'Unexpected runtime tool change: {tool.name}'
    tool_proofs.append(record)

anchor = 'const rand = room ? seeded(room.seed) : Math.random;'
loading_fixture = []
for side, repo in [('baseline', BASE_REPO), ('candidate', CANDIDATE)]:
    original = (repo / 'public/js/main.js').read_text()
    assert original.count(anchor) == 1
    served = original.replace(anchor, 'const rand = room ? seeded(room.seed) : seeded(417);')
    loading_fixture.append({
        'side': side, 'path': relative(repo / 'public/js/main.js'),
        'anchorMatches': 1, 'audienceSeed': 417,
        'originalSha256': digest(original.encode()), 'servedSha256': digest(served.encode()),
        'originalIdentityBytes': len(original.encode()), 'servedIdentityBytes': len(served.encode()),
        'scope': 'Static prediction of the exact loading-proxy transformation. Actual HTTP response/occupancy verification remains pending.',
    })

for group, jobs in groups.items():
    write_json(HERE / f'{group}-plan.json', jobs)
write_json(HERE / 'runtime-plan.json', plan)

proof = {
    'schema': 1,
    'preparedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'status': 'PREPARED_NOT_EXECUTED',
    'baseline': BASELINE,
    'baselineWorktree': relative(BASE_REPO),
    'baselineOrigin': 'http://127.0.0.1:8084',
    'candidate': '3f-integrated-candidate',
    'candidateWorktree': relative(CANDIDATE),
    'candidateOrigin': 'http://127.0.0.1:8085',
    'candidateIdentity': 'The local bytes in source-manifest.json; candidateParent is not a completed integration commit identifier.',
    'sourceManifest': file_record(manifest_path),
    'sourceProofs': source_proofs,
    'tools': tool_proofs,
    'executionFiles': [file_record(HERE / name) for name in [
        'run-portable.mjs', 'run-multiprocess.mjs', 'run-runtime-plan.mjs', 'make-runtime-plan.py',
    ]],
    'planFiles': [file_record(HERE / f'{name}-plan.json') for name in [*groups, 'runtime']],
    'basis': [file_record(ROOT / 'qa-a41' / name) for name in [
        'fixed-loading-plan.json', 'runtime-plan.json', 'run-multiprocess.mjs',
    ]],
    'groups': {key: len(value) for key, value in groups.items()},
    'totalJobs': len(plan),
    'combinedIndexRanges': {
        'loading': [0, 7], 'audio': [8, 13], 'rooms': [14, 15],
        'functional': [16, 19], 'protocol': [20, 20],
    },
    'outputs': outputs,
    'outputPathsUniqueAndAbsentAtPreparation': True,
    'loadingFixturePrediction': loading_fixture,
    'limitations': [
        'No browser, GPU, AudioContext, HTTP request or WebSocket test was executed while preparing this plan. File equality is not server-response verification.',
        'The complete baseline/candidate source manifest must still match at execution time. Individual collectors record only their documented subset of runtime/source data.',
        'Loading keeps isolated crowd seed 417 and cold/warm HTTP-cache checks. Four baseline/candidate occupancy fingerprints must be compared after collection; timing/heap are one observation per condition.',
        'Audio keeps a41 scope: baseline+candidate Hall desktop and Sphere mobile, plus candidate-only Hall mobile and Sphere desktop. Native audio clocks run for 65 seconds; visual update is 5 Hz and main rAF is held. Random crowd states are not matched, so timing/heap are not a CPU-performance A/B claim.',
        'Rooms use the a41 multiprocess flag removals; both tabs share an explicit BrowserContext. Original playback-state propagation checks do not prove device/audio-clock synchronization.',
        'Full functional continuation preserves the original 2-second resume failure, final FAIL and exit 1. It permits later checks only after the real pause action. The known a41 Hall desktop failure is historical, not a predicted 3f result.',
        'Protocol uses the actual 3f server and RoomClient in a new localhost process. Its 15 existing checks do not cover all newly added evening/voting features.',
        'SwiftShader, packaged Chromium flags and desktop/mobile emulation remain the container environment. These jobs do not demonstrate physical-GPU, physical-phone or speaker/headphone quality.',
        'The a41 runtime results remain a separate measured revision and must not be relabeled as 3f results.',
    ],
}
write_json(HERE / 'runtime-plan-provenance.json', proof)
print(json.dumps({
    'status': proof['status'], 'jobs': len(plan), 'groups': proof['groups'],
    'sourceFilesMatched': len(source_proofs), 'tools': len(tool_proofs),
    'runtimeToolsUnchangedFromA41': all(row['equalsA41FrozenTool'] for row in tool_proofs if not row['path'].endswith('/full-frame-fixture.js')),
    'outputsUnique': len(outputs),
    'provenance': str(HERE / 'runtime-plan-provenance.json'),
}, ensure_ascii=False, indent=2))
