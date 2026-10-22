import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


REPO = Path('/workspace/scratch/25707ad85ea4/forest-philharmonic')
DATA = REPO / 'docs/performance-data/main-e741'


def load(name):
    path = REPO / 'tools/bench' / (name + '.py')
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


local = load('prepare-local-plan')
runtime = load('prepare-runtime-plan')


def read(path):
    return json.loads(path.read_text())


class PrepareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.evidence = self.root / 'evidence'
        self.evidence.mkdir()
        self.inputs = {name: (DATA / name).read_bytes() for name in
                       ['high-plan.json', 'matrix-plan.json', 'special-plan.json'] + runtime.PLAN_NAMES}
        for name, raw in self.inputs.items():
            (self.evidence / name).write_bytes(raw)
        self.source_hashes = {}
        for side, tree in [('baseline', 'reference'), ('candidate', 'candidate')]:
            self.source_hashes[side] = {}
            names = ['public/js/main.js'] + (['public/js/quality.js'] if side == 'candidate' else [])
            for name in names:
                path = self.root / tree / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(side + ' ' + name)
                self.source_hashes[side][name] = local.sha(path)
        collector = self.root / 'collector/tools/bench'
        collector.mkdir(parents=True)
        (collector / 'full-frame.mjs').write_text('fixture only; not executable')
        manifest = dict(local.REVISIONS, source=self.source_hashes,
                        collectors={'full-frame.mjs': local.sha(collector / 'full-frame.mjs')})
        (self.evidence / 'measurement-manifest.json').write_text(json.dumps(manifest))
        (self.evidence / 'chromium.json').write_text('{}')
        runtime_collector = self.root / 'collector-runtime/tools/bench'
        runtime_collector.mkdir(parents=True)
        for name in runtime.PLAN_NAMES:
            for job in json.loads(self.inputs[name]):
                path = self.root / 'collector-runtime' / job['script']
                path.write_text('fixture only; not executable')
        package = self.root / 'tools-runtime/node_modules/playwright/package.json'
        package.parent.mkdir(parents=True)
        package.write_text('{"version":"1.62.1"}')

    def args(self, name='out', **overrides):
        args = local.parser().parse_args(['--root', str(self.root), '--output', str(self.root / name)])
        for key, value in overrides.items():
            setattr(args, key, value)
        return args

    def runtime_args(self, name='runtime-out', **overrides):
        args = runtime.parser().parse_args(['--root', str(self.root), '--input', str(self.evidence),
                                           '--output', str(self.root / name)])
        for key, value in overrides.items():
            setattr(args, key, value)
        return args

    def fake_git(self, tree, *args):
        refs = dict(runtime.REFS, **{'collector-runtime': '7b07e15' + '0' * 33})
        if args == ('status', '--porcelain'):
            return ''
        if args == ('rev-parse', 'HEAD'):
            return refs[Path(tree).name]
        if args[0] == 'rev-parse' and args[1].endswith('^{commit}'):
            ref = args[1][:-9]
            return refs['collector-runtime'] if ref == '7b07e15' else ref
        raise AssertionError(('unexpected Git query', tree, args))

    def test_default_high_and_manifest(self):
        out = local.prepare(self.args())
        original, converted = json.loads(self.inputs['high-plan.json']), read(out / 'plan.json')
        self.assertEqual(len(converted), 8)
        for a, b in zip(original, converted):
            self.assertEqual(a['args'], b['args'])
            self.assertEqual(b['id'], 'pc-sync-' + a['id'])
            self.assertEqual(a['env']['REVISION'], b['env']['REVISION'])
            self.assertEqual(b['env']['CHROME_EXECUTABLE'], '')
            self.assertEqual(b['env']['CHROME_ARGS'], '[]')
            self.assertEqual(b['env']['SOFTWARE_RENDERER'], '0')
        manifest = read(out / 'source-manifest.json')
        self.assertEqual(manifest['files'][1]['baselineSha256'], None)
        self.assertEqual(manifest['originPlanSha256'], hashlib.sha256(self.inputs['high-plan.json']).hexdigest())
        self.assertEqual(manifest['preparerSha256'], local.sha(Path(local.__file__)))
        self.assertEqual((self.evidence / 'high-plan.json').read_bytes(), self.inputs['high-plan.json'])

    def test_matrix_preserves_mobile_viewport_and_all_scenarios(self):
        out = local.prepare(self.args(plan=self.evidence / 'matrix-plan.json'))
        original, converted = json.loads(self.inputs['matrix-plan.json']), read(out / 'plan.json')
        self.assertEqual(len(converted), 20)
        mobile = 0
        for a, b in zip(original, converted):
            self.assertEqual(a['args'], b['args'])
            for key in ['WIDTH', 'HEIGHT', 'WARMUP', 'SAMPLES', 'REVISION']:
                self.assertEqual(a['env'][key], b['env'][key])
            self.assertEqual(float(a['env']['DPR']), float(b['env']['DPR']))
            if a['args'][3] == 'mobile':
                mobile += 1
                self.assertEqual((b['env']['WIDTH'], b['env']['HEIGHT']), ('390', '844'))
        self.assertGreater(mobile, 0)

    def test_special_plan_preserves_rotation_effects(self):
        out = local.prepare(self.args(plan=self.evidence / 'special-plan.json'))
        original, converted = json.loads(self.inputs['special-plan.json']), read(out / 'plan.json')
        self.assertEqual(len(converted), 4)
        self.assertEqual([job['args'] for job in converted], [job['args'] for job in original])
        self.assertTrue(any('rotate' in job['args'][-1].split(',') for job in converted))
        self.assertTrue(any('effects' in job['args'][-1] for job in converted))

    def test_explicit_dimensions_samples_browser(self):
        chrome = self.root / 'chrome'
        chrome.write_text('not executed')
        out = local.prepare(self.args(mode='cadence', samples=600, warmup=20,
                                      width=1280, height=720, dpr=2, chrome=chrome))
        for job in read(out / 'plan.json'):
            self.assertEqual(job['timeoutSeconds'], 600)
            env = job['env']
            self.assertEqual((env['SAMPLES'], env['WARMUP'], env['WIDTH'], env['HEIGHT'], env['DPR']),
                             ('600', '20', '1280', '720', '2.0'))
            self.assertEqual(env['CHROME_EXECUTABLE'], str(chrome))

    def test_changed_product_hash_rejected(self):
        (self.root / 'candidate/public/js/main.js').write_text('different')
        with self.assertRaisesRegex(ValueError, '제품 파일'):
            local.prepare(self.args())
        self.assertFalse((self.root / 'out').exists())

    def test_changed_collector_hash_rejected(self):
        (self.root / 'collector/tools/bench/full-frame.mjs').write_text('different')
        with self.assertRaisesRegex(ValueError, '수집 도구'):
            local.prepare(self.args())

    def test_wrong_plan_revision_rejected(self):
        plan = json.loads(self.inputs['matrix-plan.json'])
        plan[0]['env']['REVISION'] = 'not the pinned source'
        (self.evidence / 'matrix-plan.json').write_text(json.dumps(plan))
        with self.assertRaisesRegex(ValueError, '제품 버전'):
            local.prepare(self.args(plan=self.evidence / 'matrix-plan.json'))

    def test_existing_output_not_overwritten(self):
        args = self.args()
        out = local.prepare(args)
        previous = (out / 'plan.json').read_bytes()
        with self.assertRaises(FileExistsError):
            local.prepare(args)
        self.assertEqual((out / 'plan.json').read_bytes(), previous)

    def test_invalid_dimensions_rejected(self):
        for option in [{'width': 0}, {'dpr': float('nan')}, {'samples': 0}, {'warmup': -1}]:
            with self.subTest(option=option), self.assertRaises(ValueError):
                local.prepare(self.args(**option))

    def test_runtime_three_plans_preserve_timeouts_and_contract(self):
        with patch.object(runtime, 'git', side_effect=self.fake_git), patch.dict(os.environ, {'CHROME_EXECUTABLE': '/stale/path'}):
            result = runtime.prepare(self.runtime_args())
        out = Path(result['output'])
        self.assertEqual([result['plans'][name]['jobs'] for name in runtime.PLAN_NAMES], [6, 16, 12])
        for name in runtime.PLAN_NAMES:
            original, converted = json.loads(self.inputs[name]), read(out / name)
            for a, b in zip(original, converted):
                self.assertEqual(a['args'], b['args'])
                self.assertEqual(a['id'], b['id'])
                self.assertEqual(a['timeoutSeconds'], b['timeoutSeconds'])
                for key in ['TIMEOUT_MS', 'WIDTH', 'HEIGHT', 'SAMPLES', 'WARMUP', 'REVISION']:
                    self.assertEqual(a['env'][key], b['env'][key])
                self.assertEqual(b['env']['CHROME_EXECUTABLE'], '')
                self.assertEqual(b['env']['CHROME_ARGS'], '[]')
                self.assertEqual(b['env']['SOFTWARE_RENDERER'], '0')
                if b['script'].endswith('/multiplayer.mjs'):
                    self.assertEqual(b['env']['REPO_DIR'], str(self.root / 'candidate'))
                if b['script'].endswith('/functional.mjs'):
                    self.assertEqual(b['env']['SCOPE'], 'full')
            self.assertEqual((self.evidence / name).read_bytes(), self.inputs[name])
        self.assertEqual(set(job['env']['TIMEOUT_MS'] for job in read(out / 'cadence-plan.json')), {'120000'})
        record = read(out / 'local-runtime-manifest.json')
        for name, digest in record['plans'].items():
            self.assertEqual(runtime.sha(out / name), digest)

    def test_runtime_dirty_tree_rejected(self):
        def dirty(tree, *args):
            return ' M public/js/main.js' if args == ('status', '--porcelain') else self.fake_git(tree, *args)
        with patch.object(runtime, 'git', side_effect=dirty), self.assertRaisesRegex(ValueError, '변경'):
            runtime.prepare(self.runtime_args())

    def test_runtime_wrong_head_rejected(self):
        def wrong(tree, *args):
            return 'f' * 40 if args == ('rev-parse', 'HEAD') else self.fake_git(tree, *args)
        with patch.object(runtime, 'git', side_effect=wrong), self.assertRaisesRegex(ValueError, '고정 커밋'):
            runtime.prepare(self.runtime_args())

    def test_runtime_explicit_browser_and_output_protection(self):
        chrome = self.root / 'chrome.exe'
        chrome.write_text('not executed')
        args = self.runtime_args(chrome=chrome)
        with patch.object(runtime, 'git', side_effect=self.fake_git):
            result = runtime.prepare(args)
            with self.assertRaises(FileExistsError):
                runtime.prepare(args)
        for name in runtime.PLAN_NAMES:
            for job in read(Path(result['output']) / name):
                self.assertEqual(job['env']['CHROME_EXECUTABLE'], str(chrome))

    def test_cli_help_only(self):
        for module in [local, runtime]:
            completed = subprocess.run(['python3', module.__file__, '--help'], text=True,
                                       capture_output=True, check=True, timeout=5)
            self.assertIn('--chrome', completed.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
