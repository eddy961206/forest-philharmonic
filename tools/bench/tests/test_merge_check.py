import copy
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

BENCH = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('assess_merge_check', BENCH / 'assess-merge-check.py')
ASSESS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ASSESS)


class PortablePlanTest(unittest.TestCase):
    def test_pinned_worktrees_abba_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repo = root / 'source'
            repo.mkdir()

            def git(*args):
                return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.DEVNULL).decode().strip()

            git('init')
            git('config', 'user.name', 'Fixture')
            git('config', 'user.email', 'fixture@example.invalid')
            git('config', 'core.autocrlf', 'false')
            (repo / 'public').mkdir()
            (repo / 'public/index.html').write_bytes(b'before\n')
            (repo / 'server.js').write_bytes(b'server\n')
            (repo / 'package.json').write_bytes(b'{}\n')
            script = repo / 'tools/bench/prepare-merge-check.py'
            script.parent.mkdir(parents=True)
            script.write_bytes((BENCH / script.name).read_bytes())
            git('add', '.')
            git('commit', '-m', 'baseline')
            baseline = git('rev-parse', 'HEAD')
            (repo / 'public/index.html').write_bytes(b'after\n')
            (repo / 'public/new-worker.js').write_bytes(b'worker\n')
            git('add', '.')
            git('commit', '-m', 'candidate')
            candidate = git('rev-parse', 'HEAD')
            playwright = root / 'runtime/playwright'
            playwright.mkdir(parents=True)
            output = root / 'check'
            command = [sys.executable, str(script), '--baseline-ref', baseline,
                       '--output', str(output), '--playwright', str(playwright)]
            run = subprocess.run(command, capture_output=True, text=True, timeout=60)
            self.assertEqual(run.returncode, 0, run.stderr)
            manifest = json.loads((output / 'source-manifest.json').read_text(encoding='utf-8'))
            self.assertEqual((manifest['baseline'], manifest['candidate']), (baseline, candidate))
            worker = next(f for f in manifest['files'] if f['path'] == 'public/new-worker.js')
            self.assertIsNone(worker['baselineSha256'])
            self.assertEqual(worker['candidateSha256'], hashlib.sha256(b'worker\n').hexdigest())
            self.assertTrue(any(f['path'] == 'server.js' for f in manifest['files']))
            plan = json.loads((output / 'plan.json').read_text(encoding='utf-8'))
            self.assertEqual(len(plan), 16)
            self.assertEqual([job['args'][0] for job in plan[:4]],
                             ['baseline-r1a', 'candidate-r1a', 'candidate-r1b', 'baseline-r1b'])
            self.assertEqual(plan[4]['args'][-1], 'wide,forest')
            for job in plan:
                self.assertEqual(job['env']['MODE'], 'cadence')
                self.assertEqual(job['env']['WARMUP'], '60')
                self.assertEqual(job['env']['SAMPLES'], '600')
                self.assertEqual(job['env']['REQUIRE_HARDWARE'], '1')
                self.assertEqual(job['env']['CHROME_ARGS'], '[]')
            original = (output / 'plan.json').read_bytes()
            rerun = subprocess.run(command, capture_output=True, timeout=60)
            self.assertNotEqual(rerun.returncode, 0)
            self.assertEqual((output / 'plan.json').read_bytes(), original)
            small = subprocess.run([*command, '--samples', '4'], capture_output=True, timeout=60)
            self.assertNotEqual(small.returncode, 0)


class AssessmentTest(unittest.TestCase):
    def fixture(self):
        policy = {'blocks': 2, 'viewport': [1280, 720], 'dpr': 1,
                  'meanRegressionPercent': 5, 'p95RegressionPercent': 10,
                  'onePercentLowRegressionPercent': 10,
                  'requiredScenarios': ['hall/front', 'sphere/wide', 'sphere/forest']}
        summary = {'status': 'PASS', 'excluded': [], 'expectedJobs': 16, 'completedPairs': 8,
                   'provenance': {'manifestSha256': 'a' * 64}, 'comparisons': [], 'rows': [], 'jobs': []}
        for block in (1, 2):
            for venue in ('hall', 'sphere'):
                for side, pair in [('baseline', 'a'), ('candidate', 'a'), ('candidate', 'b'), ('baseline', 'b')]:
                    index = len(summary['jobs'])
                    summary['jobs'].append({'id': f'{side}-r{block}{pair}-{venue}', 'index': index, 'side': side, 'status': 'PASS',
                        'startedAt': f'2026-10-22T00:00:{index * 2:02d}+00:00',
                        'finishedAt': f'2026-10-22T00:00:{index * 2 + 1:02d}+00:00',
                        'validationContract': {'schema': 'merge-check-v1', 'hardware': True,
                            'fullLocalSources': True, 'fullPublicHttpSources': True, 'softwareRequested': False,
                            'manifestSha256': 'a' * 64, 'productFileCount': 2, 'publicFileCount': 1,
                            'renderer': 'ANGLE Intel Iris Xe'}})
                for pair in 'ab':
                    summary['comparisons'].append({'pairKey': f'-r{block}{pair}/{venue}/high/desktop/cadence',
                        'conditions': {'environment': {'browserVersion': 'fixture'},
                            'beforeMeta': {'renderer': 'ANGLE Intel Iris Xe'}, 'fixture': {'lite': False, 'crowd': 800},
                            'fixturePolicy': {'piece': 'beethoven-ode-to-joy', 'crowdFill': .8, 'crowdSeed': 417, 'randomSeed': 417}}})
        for name in policy['requiredScenarios']:
            venue, scene = name.split('/')
            position, target, world = ASSESS.SCENES[name]
            for repeat in ('r1a', 'r1b', 'r2a', 'r2b'):
                summary['rows'].append({'venue': venue, 'scenario': scene, 'repeat': repeat,
                    'pairKey': f'-{repeat}/{venue}/high/desktop/cadence', 'device': 'desktop',
                    'mode': 'raf-cadence', 'quality': 'high', 'samplesPerScenario': 600, 'warmupFrames': 60,
                    'viewport': [1280, 720], 'devicePixelRatio': 1, 'beforeRevision': 'old', 'afterRevision': 'new',
                    'scenarioState': {'camera': {'position': position, 'target': target, 'fov': 64},
                                      'musicTime': 25, 'world': world, 'broadcast': False, 'effectsPeak': False, 'effectsShow': False},
                    'changes': {key: {'percent': 0} for key in ('meanMs', 'p95Ms', 'onePercentLowRafFps')}})
        return summary, {'baseline': 'old', 'candidate': 'new', 'policy': policy,
                         'files': [{'path': 'public/index.html'}, {'path': 'server.js'}]}

    def test_good_results_and_isolated_vs_repeated_regressions(self):
        summary, manifest = self.fixture()
        self.assertEqual(ASSESS.assess(summary, manifest)['status'], 'CLEAR')
        summary['rows'][0]['changes']['meanMs']['percent'] = 7
        self.assertEqual(ASSESS.assess(summary, manifest)['status'], 'INCONCLUSIVE')
        for row in summary['rows'][:3]:
            row['changes']['meanMs']['percent'] = 7
        self.assertEqual(ASSESS.assess(summary, manifest)['status'], 'HOLD_REGRESSION')

    def test_missing_pair_and_different_product_are_rejected(self):
        summary, manifest = self.fixture()
        missing = copy.deepcopy(summary)
        missing['rows'].pop()
        with self.assertRaises(ValueError):
            ASSESS.assess(missing, manifest)
        summary['rows'][0]['afterRevision'] = 'unmeasured'
        with self.assertRaises(ValueError):
            ASSESS.assess(summary, manifest)

    def test_software_partial_hash_and_parallel_jobs_cannot_clear(self):
        for failure in ('software', 'partial', 'parallel', 'order'):
            with self.subTest(failure=failure):
                summary, manifest = self.fixture()
                if failure == 'software':
                    summary['jobs'][0]['validationContract']['renderer'] = 'ANGLE SwiftShader'
                elif failure == 'partial':
                    summary['jobs'][0]['validationContract']['fullPublicHttpSources'] = False
                elif failure == 'parallel':
                    summary['jobs'][1]['startedAt'] = summary['jobs'][0]['startedAt']
                else:
                    summary['jobs'][0], summary['jobs'][1] = summary['jobs'][1], summary['jobs'][0]
                with self.assertRaises(ValueError):
                    ASSESS.assess(summary, manifest)

    def test_mobile_lite_and_wrong_forest_cannot_clear(self):
        for failure in ('mobile', 'lite', 'forest'):
            with self.subTest(failure=failure):
                summary, manifest = self.fixture()
                if failure == 'mobile':
                    summary['rows'][0]['device'] = 'mobile'
                elif failure == 'lite':
                    summary['comparisons'][0]['conditions']['fixture']['lite'] = True
                else:
                    summary['rows'][-1]['scenarioState']['world'] = 'FOREST'
                with self.assertRaises(ValueError):
                    ASSESS.assess(summary, manifest)


if __name__ == '__main__':
    unittest.main()
