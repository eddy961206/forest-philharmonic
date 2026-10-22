import importlib.util,json,os,signal,subprocess,sys,tempfile,time,unittest,shutil
from pathlib import Path
from unittest.mock import patch,Mock
SOURCE=Path(__file__).resolve().parents[3]/'tools/bench/run-plan.py'
spec=importlib.util.spec_from_file_location('runner',SOURCE); runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
class RunnerTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.root=self.base/'repo';(self.root/'tools/bench').mkdir(parents=True);shutil.copy2(SOURCE,self.root/'tools/bench/run-plan.py');self.bin=self.base/'bin';self.bin.mkdir();node=self.bin/'node';node.write_text('#!'+sys.executable+'\nimport os,sys\nos.execv(sys.executable,[sys.executable,*sys.argv[1:]])\n');node.chmod(0o755);self.env={**os.environ,'PATH':str(self.bin)+os.pathsep+os.environ.get('PATH','')};self.output=self.base/'output'
 def tearDown(self):self.tmp.cleanup()
 def fixture(self,name,body):
  (self.root/'tools/bench'/name).write_text(body);return {'id':name.replace('.mjs',''),'script':'tools/bench/'+name}
 def command(self,jobs,extra=()):
  self.plan=self.base/'plan.json';self.plan.write_text(json.dumps(jobs));return [sys.executable,str(self.root/'tools/bench/run-plan.py'),str(self.plan),'--output',str(self.output),'--heartbeat-seconds','.05','--job-timeout-seconds','.5','--terminate-grace-seconds','.1',*extra]
 def execute(self,command):return subprocess.run(command,env=self.env,capture_output=True,text=True,timeout=8)
 def test_timeout_descendants_continue_and_inventory(self):
  child_pid=self.base/'child.pid';child="import os,signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);open("+repr(str(child_pid))+",'w').write(str(os.getpid()));time.sleep(30)"
  jobs=[self.fixture('ok.mjs',"print('before timeout',flush=True)"),self.fixture('hang.mjs','import subprocess,sys,signal,time\nsignal.signal(signal.SIGTERM,signal.SIG_IGN)\nsubprocess.Popen([sys.executable,"-c",'+repr(child)+'])\ntime.sleep(30)'),self.fixture('after.mjs',"print('after timeout',flush=True)")]
  result=self.execute(self.command(jobs,['--continue-on-failure']));self.assertEqual(result.returncode,1,result.stderr);progress=json.loads((self.output/'progress.json').read_text());self.assertEqual([progress['jobs'][str(i)]['status'] for i in range(3)],['PASS','TIMEOUT','PASS']);self.assertIn('elapsedSeconds',result.stdout);self.assertTrue(child_pid.exists());pid=int(child_pid.read_text());stat=Path('/proc')/str(pid)/'stat';self.assertTrue(not stat.exists() or stat.read_text().split()[2]=='Z','grandchild still running');record=json.loads((self.output/'logs/001-hang.json').read_text());self.assertEqual(record['exitCode'],124);self.assertEqual(record['cleanupErrors'],[]);self.assertIsNotNone(record['finishedAt']);self.assertFalse(list(self.output.rglob('*.tmp')))
 def test_resume_retains_first_and_rejects_overwrite(self):
  jobs=[self.fixture('one.mjs',"print('one')"),self.fixture('two.mjs',"print('two')")];result=self.execute(self.command(jobs,['--end','1']));self.assertEqual(result.returncode,0,result.stderr);first=(self.output/'logs/000-one.json').read_bytes();result=self.execute(self.command(jobs,['--start','1']));self.assertEqual(result.returncode,0,result.stderr);self.assertEqual((self.output/'logs/000-one.json').read_bytes(),first);self.assertEqual(len(json.loads((self.output/'progress.json').read_text())['jobs']),2);result=self.execute(self.command(jobs));self.assertNotEqual(result.returncode,0);self.assertEqual((self.output/'logs/000-one.json').read_bytes(),first)
 def test_sigterm_closes_job(self):
  command=self.command([self.fixture('interrupt.mjs','import time\ntime.sleep(30)')],['--job-timeout-seconds','5']);process=subprocess.Popen(command,env=self.env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);record=self.output/'logs/000-interrupt.json';deadline=time.monotonic()+3
  while time.monotonic()<deadline:
   if record.exists() and 'lastHeartbeatAt' in json.loads(record.read_text()):break
   time.sleep(.02)
  process.send_signal(signal.SIGTERM);stdout,stderr=process.communicate(timeout=4);self.assertEqual(process.returncode,130,stderr);self.assertEqual(json.loads(record.read_text())['status'],'INTERRUPTED')
 def test_atomic_failure_keeps_previous_document(self):
  path=self.base/'record.json';runner.atomic_json(path,{'original':True})
  with patch.object(runner.os,'replace',side_effect=OSError('simulated replace failure')):
   with self.assertRaises(OSError):runner.atomic_json(path,{'replacement':True})
  self.assertEqual(json.loads(path.read_text()),{'original':True});self.assertFalse(list(self.base.glob('*.tmp')))
 def test_windows_cleanup_arguments_mock_only(self):
  process=Mock(pid=123);process.poll.return_value=0
  with patch.object(runner.os,'name','nt'),patch.object(runner.subprocess,'run',return_value=Mock(returncode=0)) as run:
   self.assertEqual(runner.stop_tree(process,.1),[]);self.assertEqual(run.call_args.args[0],['taskkill','/PID','123','/T','/F']);self.assertGreater(run.call_args.kwargs['timeout'],0)
 def test_invalid_timeout_is_rejected(self):
  for value in [0,-1,'nan','inf']:
   with self.assertRaises(Exception):runner.positive_seconds(value)
if __name__=='__main__':unittest.main(verbosity=2)
