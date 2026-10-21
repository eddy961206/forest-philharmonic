// 원시 결과는 바꾸지 않고 저장소의 strict compare 도구로 전후 조건부터 확인해.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import assert from 'node:assert/strict';
const self = fileURLToPath(import.meta.url);
const options = {};
const allowed = new Set(['qa-root', 'tools-root', 'output-root']);
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--help') {
    console.log('node qa-3f/collect-summary.mjs [--qa-root DIR] [--tools-root DIR] [--output-root DIR]\n완료된 3f render-plan과 render/*.json만 파일로 검증·집계해. 브라우저나 이미지 도구를 실행하지 않아. tools-root는 compare.mjs/browser.mjs가 있는 bench 폴더야. 기본 qa-root/output-root는 이 스크립트 폴더, tools-root는 인접 forest-philharmonic/tools/bench야.\n초기 source-manifest.json과 실제 served source 해시를 대조해. 새 fixture의 eligibleAudienceSeats/recitalSeats, sample asleep=false와 visible 상태를 필수 확인해. 누락·실패·조건 불일치는 FAIL과 exit 1로 남겨. auto는 별도 관찰이며 동기 ms를 FPS로 바꾸지 않아.');
    process.exit(0);
  }
  assert.ok(arg.startsWith('--') && allowed.has(arg.slice(2)), `알 수 없는 인자: ${arg}`);
  assert.ok(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `${arg} 경로가 필요해.`);
  assert.ok(options[arg.slice(2)] === undefined, `중복 인자: ${arg}`);
  options[arg.slice(2)] = process.argv[++i];
}
const here = path.resolve(options['qa-root'] || path.dirname(self));
const input = path.join(here, 'render');
const outputRoot = path.resolve(options['output-root'] || here);
const output = path.join(outputRoot, 'comparisons');
const toolsRoot = path.resolve(options['tools-root'] || path.join(here, '../forest-philharmonic/tools/bench'));
const baseline = '3f1655b0c035a630adbcfbf19582dd9363386f34';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const shaPattern = /^[a-f0-9]{64}$/;
const inputRecords = new Map();
async function readJSON(file) {
  const bytes = await fs.readFile(file);
  inputRecords.set(file, { file: path.relative(here, file).split(path.sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) });
  return JSON.parse(bytes.toString('utf8'));
}
// compare.mjs is a CLI, with no exported comparison function. Run that exact
// module in an isolated Worker: this host's nested execFile(process.execPath)
// returned exit 0 and empty output even for a one-line stdout probe. Preserve
// the comparator's original assertions and wait for both output streams to end.
async function compareFiles(before, after) {
  const worker = new Worker(pathToFileURL(path.join(toolsRoot, 'compare.mjs')), {
    argv: [before, after], execArgv: [], stdout: true, stderr: true,
  });
  let stdout = '', stderr = '', timeout;
  const streamDone = (stream, append) => new Promise((resolve, reject) => {
    stream.setEncoding('utf8');
    stream.on('data', append);
    stream.once('end', resolve);
    stream.once('error', reject);
  });
  const exited = new Promise((resolve, reject) => {
    worker.once('error', reject);
    worker.once('exit', resolve);
  });
  try {
    const [code] = await Promise.race([
      Promise.all([
        exited,
        streamDone(worker.stdout, chunk => { stdout += chunk; }),
        streamDone(worker.stderr, chunk => { stderr += chunk; }),
      ]),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('strict compare가 30초 안에 끝나지 않았어.')), 30_000); }),
    ]);
    assert.equal(code, 0, `strict compare 실패: ${stderr.trim() || `exit ${code}`}`);
    assert.ok(stdout.trim(), 'strict compare의 JSON 출력이 비어 있어.');
    return JSON.parse(stdout);
  } finally {
    clearTimeout(timeout);
    await worker.terminate();
  }
}
async function collect() {
await fs.mkdir(output, { recursive: true });
const rows = [], adaptive = [], excluded = [];
let completedPairs = 0;
let fixtureSourceSha256 = null;
const provenance = {
  collector: { file: path.basename(self), sha256: sha256(await fs.readFile(self)) },
  comparator: { file: 'tools/bench/compare.mjs', sha256: sha256(await fs.readFile(path.join(toolsRoot, 'compare.mjs'))) },
  browserHelper: { file: 'tools/bench/browser.mjs', sha256: sha256(await fs.readFile(path.join(toolsRoot, 'browser.mjs'))) },
  note: '이 집계에 사용한 도구 해시야. raw의 수집기 버전을 소급 변경하지 않아.',
};
const sourceManifest = await readJSON(path.join(here, 'source-manifest.json'));
assert.equal(sourceManifest.baseline, baseline, '초기 source manifest 기준이 3f가 아니야.');
assert.ok(Array.isArray(sourceManifest.files) && sourceManifest.files.length > 0, '초기 source manifest 파일 목록이 없어.');
const sourceFiles = new Map(sourceManifest.files.map(record => [record.file, record]));
assert.equal(sourceFiles.size, sourceManifest.files.length, '초기 source manifest에 중복 파일 경로가 있어.');
const plan = await readJSON(path.join(here, 'render-plan.json'));
assert.ok(Array.isArray(plan) && plan.length > 0, '비어 있지 않은 render-plan이 필요해.');
const expected = new Map();
for (const job of plan) {
  assert.equal(job.script, 'tools/bench/full-frame.mjs', '이 집계기는 full-frame 계획만 처리해.');
  assert.ok(Array.isArray(job.args) && job.args.length >= 4 && job.env, 'job args/env 기록이 없어.');
  const [label, venue, quality, device] = job.args;
  const mode = job.env.MODE || 'sync';
  assert.ok(['sync', 'cadence'].includes(mode), `알 수 없는 측정 mode: ${mode}`);
  const name = `${label}-full-${venue}-${quality}-${device}-${mode}.json`;
  assert.ok(!expected.has(name), `계획의 결과 파일 이름 중복: ${name}`);
  expected.set(name, job);
}
const files = [...expected.keys()].filter(n => n.startsWith('baseline')).sort();
assert.ok(files.length > 0, '계획에 baseline 결과가 없어.');
for (const name of files) assert.ok(expected.has(name.replace(/^baseline/, 'after')), `계획의 후보 pair가 없어: ${name}`);
for (const name of expected.keys()) {
  assert.ok(name.startsWith('baseline') || name.startsWith('after'), `알 수 없는 계획 라벨: ${name}`);
  if (name.startsWith('after')) assert.ok(expected.has(name.replace(/^after/, 'baseline')), `계획의 기준 pair가 없어: ${name}`);
}
const present = await fs.readdir(input).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
for (const name of present.filter(n => n.endsWith('.json'))) {
  if (!expected.has(name)) excluded.push({ file: name, reason: 'render-plan에 없는 파일이라 집계하지 않음' });
}
const finite = (value, label) => {
  assert.ok(Number.isFinite(value) && value >= 0, `${label}: 0 이상의 유한한 수가 필요해.`);
  return value;
};
const optional = (value, label) => value == null ? null : finite(value, label);
const avg = values => {
  assert.ok(values.length > 0, '빈 표본의 평균은 계산하지 않아.');
  return finite(values.reduce((a, b) => a + b, 0) / values.length, '평균');
};
const percent = (before, after) => {
  if (before === 0) return null;
  const value = (after / before - 1) * 100;
  assert.ok(Number.isFinite(value), '변화율을 유한한 수로 계산할 수 없어.');
  return value;
};
function observed(samples, metric) {
  assert.ok(Array.isArray(samples) && samples.length > 0, '원시 표본이 비어 있어.');
  const values = samples.map(s => s[metric]);
  values.forEach(value => {
    finite(value, metric);
    if (metric === 'cadenceMs') assert.ok(value > 0, 'rAF 간격은 0보다 커야 해.');
  });
  for (const s of samples) for (const field of ['calls', 'triangles', 'submitMs']) finite(s[field], field);
  const sorted = [...values].sort((a, b) => a - b);
  const last = samples.at(-1);
  const heap = optional(last.heap, 'heap');
  return {
    n: values.length, meanMs: avg(values),
    p50Ms: sorted[Math.ceil(values.length * .5) - 1],
    p95Ms: sorted[Math.ceil(values.length * .95) - 1],
    p99Ms: sorted[Math.ceil(values.length * .99) - 1],
    ...(metric === 'cadenceMs' ? {
      observedRafFps: finite(1000 / avg(values), 'observedRafFps'),
      onePercentLowRafFps: values.length >= 100
        ? finite(1000 / avg(sorted.slice(-Math.ceil(values.length * .01))), 'onePercentLowRafFps') : null,
    } : {}),
    calls: avg(samples.map(s => s.calls)), triangles: avg(samples.map(s => s.triangles)),
    submitMs: avg(samples.map(s => s.submitMs)),
    lastHeapMiB: heap === null ? null : heap / (1024 * 1024),
    lastGeometries: optional(last.geometries, 'geometries'), lastTextures: optional(last.textures, 'textures'),
    firstQuality: samples[0].quality, finalQuality: last.quality,
    firstScale: samples[0].renderScale, finalScale: last.renderScale,
  };
}
function validate(data, job) {
  assert.equal(data.status, 'PASS', `완료 PASS 아님: ${data.status}`);
  assert.equal(data.schema, 2);
  assert.equal(data.suite, 'whole-frame-controlled');
  const [label, venue, quality, device, scenarioList] = job.args;
  for (const [key, value] of Object.entries({ label, venue, quality, device, revision: job.env.REVISION }))
    assert.equal(data[key], value, `계획과 ${key} 불일치`);
  assert.equal(new URL(data.baseURL).href, new URL(job.env.BASE_URL).href, '계획과 서버 주소가 달라.');
  assert.equal(data.mode, job.env.MODE === 'cadence' ? 'raf-cadence' : 'synchronous-completion');
  assert.equal(data.warmupFrames, Number(job.env.WARMUP));
  assert.equal(data.samplesPerScenario, Number(job.env.SAMPLES));
  assert.equal(data.screenshots, job.env.SCREENSHOTS === '1');
  assert.ok(Number.isSafeInteger(data.warmupFrames) && data.warmupFrames > 0);
  assert.ok(Number.isSafeInteger(data.samplesPerScenario) && data.samplesPerScenario > 0);
  assert.deepEqual(data.scenarioOrder, (scenarioList || 'front,wide').split(','));
  assert.ok(data.scenarioOrder.length > 0 && new Set(data.scenarioOrder).size === data.scenarioOrder.length);
  assert.deepEqual(Object.keys(data.scenarios), data.scenarioOrder, '누락/추가/순서가 다른 장면이 있어.');
  assert.deepEqual(data.diagnostics?.pageErrors, [], 'page 오류가 있어.');
  assert.deepEqual(data.diagnostics?.consoleErrors, [], 'console 오류가 있어.');
  assert.ok(Array.isArray(data.viewport) && data.viewport.length === 2 && data.viewport.every(n => Number.isSafeInteger(n) && n > 0), 'viewport 기록이 잘못됐어.');
  assert.ok(Number.isFinite(data.devicePixelRatio) && data.devicePixelRatio > 0, 'DPR 기록이 잘못됐어.');
  assert.deepEqual(data.meta?.viewport, data.viewport, '실제 viewport와 설정 기록이 달라.');
  assert.ok(Number.isFinite(data.meta?.pixelRatio) && data.meta.pixelRatio > 0, '실제 pixelRatio가 없어.');
  for (const key of ['browserVersion', 'playwrightVersion', 'platform', 'architecture', 'fontMode'])
    assert.ok(typeof data.environment?.[key] === 'string' && data.environment[key].length > 0, `environment.${key} 기록이 없어.`);
  for (const key of ['softwareRequested', 'headless']) assert.equal(typeof data.environment?.[key], 'boolean', `environment.${key} 기록이 없어.`);
  assert.ok(Array.isArray(data.environment?.chromeArgs) && data.environment.chromeArgs.every(arg => typeof arg === 'string'), '브라우저 플래그 기록이 없어.');
  assert.match(data.fixtureSourceSha256, shaPattern, 'fixture SHA-256이 없어.');
  for (const key of ['seats', 'crowd', 'eligibleAudienceSeats', 'recitalSeats'])
    assert.ok(Number.isSafeInteger(data.fixture?.[key]) && data.fixture[key] >= 0, `fixture.${key} 기록이 없어.`);
  assert.ok(data.fixture.eligibleAudienceSeats > 0 && data.fixture.recitalSeats > 0, '3f 관객/recital 좌석 분리 기록이 필요해.');
  assert.equal(data.fixture.seats, data.fixture.eligibleAudienceSeats + data.fixture.recitalSeats, '관객 대상+recital 좌석이 전체 좌석과 달라.');
  assert.ok(data.fixture.crowd <= data.fixture.eligibleAudienceSeats, '관객 수가 일반 좌석 수를 넘었어.');
  assert.equal(data.fixture.piece, 'beethoven-ode-to-joy');
  assert.equal(data.fixture.lite, device === 'mobile' || quality === 'low');
  for (const [key, value] of Object.entries({ crowdFill: .8, crowdSeed: 417, randomSeed: 417, uuidSeed: 874 }))
    assert.equal(data.fixturePolicy?.[key], value, `fixturePolicy.${key}가 달라.`);
  const sourceSide = label.startsWith('baseline') ? 'baselineSha256' : 'candidateSha256';
  const served = ['js/main.js', 'js/scene/hall.js', 'js/scene/seats.js', 'js/scene/audience.js', 'js/scene/sphere.js', 'js/scene/dome3d.js', 'js/scene/domeshow.js'];
  assert.deepEqual(Object.keys(data.sourceHashes || {}).sort(), [...served].sort(), '실제 served source 목록이 달라.');
  for (const file of served) {
    const expectedHash = sourceFiles.get(`public/${file}`)?.[sourceSide];
    assert.match(expectedHash, shaPattern, `초기 manifest의 ${sourceSide}가 없어: ${file}`);
    assert.match(data.sourceHashes[file]?.sha256, shaPattern, `served source 해시가 없어: ${file}`);
    assert.equal(data.sourceHashes[file].sha256, expectedHash, `초기 manifest와 served source가 달라: ${file}`);
  }
  const metric = data.mode === 'raf-cadence' ? 'cadenceMs' : 'completeMs';
  if (data.quality === 'auto') {
    assert.equal(data.mode, 'raf-cadence', 'auto는 외부 rAF 관찰만 집계해.');
    assert.equal(data.fixturePolicy?.animationDtCapSeconds, 0.05, 'auto의 정상 앱 dt 상한이 기록되지 않았어.');
  }
  for (const name of data.scenarioOrder) {
    const scenario = data.scenarios[name];
    assert.ok(scenario.scenario?.camera, `${name}: 카메라 조건 기록 없음`);
    assert.ok(Array.isArray(scenario.samples) && scenario.samples.length === data.samplesPerScenario, `${name}: 표본 수 불일치`);
    for (const s of scenario.samples) {
      assert.equal(s.glError, 0, `${name}: GL 오류`);
      assert.equal(s.contextLost, false, `${name}: context 유실`);
      assert.equal(s.asleep, false, `${name}: 깨어 있는 상태 기록이 없어.`);
      assert.equal(s.visibility, 'visible', `${name}: 비활성 탭 표본이야.`);
      assert.equal(s.completed, metric === 'completeMs', `${name}: GPU 완료 강제 여부가 측정 mode와 달라.`);
      assert.ok(['high', 'medium', 'low'].includes(s.quality), `${name}: 실제 품질 기록 없음`);
      assert.ok(Number.isFinite(s.renderScale) && s.renderScale > 0 && s.renderScale <= 1, `${name}: 실제 scale 기록 없음`);
      if (quality !== 'auto') {
        assert.equal(s.quality, quality, `${name}: 수동 프리셋이 바뀌었어.`);
        assert.equal(s.renderScale, 1, `${name}: 수동 scale이 1이 아니야.`);
      }
    }
    const stats = observed(scenario.samples, metric);
    assert.equal(scenario.timing?.metric, metric, `${name}: 시간 지표 불일치`);
    for (const key of ['meanMs', 'p50Ms', 'p95Ms', 'p99Ms']) assert.equal(scenario.timing[key], stats[key], `${name}: 원시 표본과 ${key} 불일치`);
    assert.equal(scenario.meanCalls, stats.calls, `${name}: 원시 표본과 calls 불일치`);
    assert.equal(scenario.meanTriangles, stats.triangles, `${name}: 원시 표본과 triangles 불일치`);
  }
}
for (const name of files) {
  const other = name.replace(/^baseline/, 'after');
  try {
    const a = await readJSON(path.join(input, name));
    const b = await readJSON(path.join(input, other));
    const pairRows = [], pairAdaptive = [];
    validate(a, expected.get(name)); validate(b, expected.get(other));
    assert.equal(a.revision, baseline, '3f 기준 결과가 아니야.');
    fixtureSourceSha256 ??= a.fixtureSourceSha256;
    assert.equal(a.fixtureSourceSha256, fixtureSourceSha256, '행렬 중간에 fixture 소스가 바뀌었어. 같은 결과 묶음으로 집계하지 않아.');
    // Product hashes/revision/baseURL intentionally differ; every fixture,
    // camera, renderer and launcher condition below must match for all pairs.
    for (const key of ['schema','suite','quality','mode','venue','device','fixture','fixturePolicy','fixtureSourceSha256','warmupFrames','samplesPerScenario','scenarioOrder','viewport','devicePixelRatio','environment','meta','screenshots','measurement'])
      assert.deepEqual(a[key], b[key], `pair 조건 불일치: ${key}`);
    for (const scenario of a.scenarioOrder)
      assert.deepEqual(a.scenarios[scenario].scenario, b.scenarios[scenario].scenario, `${scenario}: pair 장면 설정 불일치`);
    if (a.quality === 'auto') {
      for (const scenario of a.scenarioOrder)
        pairAdaptive.push({ beforeFile: name, afterFile: other, venue: a.venue, device: a.device, scenario,
          interpretation: '해상도·프리셋이 바뀌는 auto 관찰이야. 동일 화질 개선율이 아니야.',
          before: observed(a.scenarios[scenario].samples, 'cadenceMs'), after: observed(b.scenarios[scenario].samples, 'cadenceMs') });
    } else {
      const compared = await compareFiles(path.join(input,name), path.join(input,other));
      await fs.writeFile(path.join(output,name.replace(/^baseline/,'comparison')), JSON.stringify(compared,null,2)+'\n');
      for (const scenario of a.scenarioOrder) {
        const metric = a.mode === 'raf-cadence' ? 'cadenceMs' : 'completeMs';
        const before = observed(a.scenarios[scenario].samples,metric), after = observed(b.scenarios[scenario].samples,metric);
        pairRows.push({ beforeFile:name,afterFile:other,comparisonFile:name.replace(/^baseline/,'comparison'),
          label:a.label,venue:a.venue,quality:a.quality,device:a.device,mode:a.mode,scenario,warmup:a.warmupFrames,
          before,after,meanChangePercent:percent(before.meanMs,after.meanMs),
          callsChangePercent:percent(before.calls,after.calls),trianglesChangePercent:percent(before.triangles,after.triangles),
          fixture:a.fixture,camera:a.scenarios[scenario].scenario.camera,warnings:compared.warnings });
      }
    }
    rows.push(...pairRows); adaptive.push(...pairAdaptive);
    completedPairs++;
  } catch (error) {
    excluded.push({ before: name, after: other, reason: error.code === 'ENOENT' ? '계획된 결과 파일 없음' : error.message,
      ...(error.code ? { code: error.code } : {}), ...(error.path ? { path: error.path } : {}) });
  }
}
for (const [file, recorded] of inputRecords) {
  try {
    const bytes = await fs.readFile(file);
    assert.equal(bytes.length, recorded.bytes);
    assert.equal(sha256(bytes), recorded.sha256);
  } catch (error) { excluded.push({ file: recorded.file, reason: `집계 중 입력 변경/유실: ${error.message}` }); }
}
for (const [name, expectedHash] of [['compare.mjs', provenance.comparator.sha256], ['browser.mjs', provenance.browserHelper.sha256]]) {
  assert.equal(sha256(await fs.readFile(path.join(toolsRoot, name))), expectedHash, `집계 중 비교 도구가 바뀌었어: ${name}`);
}
const status = excluded.length === 0 && completedPairs === files.length && rows.length + adaptive.length > 0 ? 'PASS' : 'FAIL';
const summary = {
  baseline, status, expectedPairs: files.length, completedPairs,
  provenance: { ...provenance, fixtureSourceSha256 }, inputs: [...inputRecords.values()],
  definitions: {
    missing: '미측정 리소스와 100표본 미만의 1% Low는 null. 0분모 변화율도 null. CSV의 대응 칸은 비워 둬.',
    sync: '동기 완료 시간은 ms만 사용하고 FPS 필드를 만들지 않아.',
    raf: '평균 FPS는 1000 / 평균 rAF 간격. 1% Low는 n>=100일 때 느린 상위 ceil(n*.01) 간격 평균의 역수야.',
    adaptive: '자동 품질은 별도 관찰이며 고정 품질 rows/CSV와 동일 화질 개선율에 포함하지 않아.',
    incomplete: '계획 누락·실패·조건 불일치가 하나라도 있으면 전체 status FAIL과 exit 1. 완료 pair의 부분 집계는 남겨.',
    independence: '행·PNG 쌍·같은 실행 안의 표본은 독립 실험 수가 아니야. 최초/steady/repeat/smoke를 합쳐 승률이나 단일 효과 크기를 만들지 않아.',
    sourceVersion: '초기 source-manifest의 기준/후보 SHA를 실제 served sourceHashes와 대조해. 최종 큐레이션 해시는 이 raw 버전 기록을 대체하지 않아.',
  },
  rows, adaptive, excluded,
};
await fs.writeFile(path.join(outputRoot,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const columns=['venue','quality','device','mode','scenario','label','warmup','n','meanBeforeMs','meanAfterMs','meanChangePercent','p50BeforeMs','p50AfterMs','p95BeforeMs','p95AfterMs','p99BeforeMs','p99AfterMs','rafFpsBefore','rafFpsAfter','onePercentLowBefore','onePercentLowAfter','callsBefore','callsAfter','trianglesBefore','trianglesAfter','lastHeapBeforeMiB','lastHeapAfterMiB','lastTexturesBefore','lastTexturesAfter','lastGeometriesBefore','lastGeometriesAfter','beforeFile','afterFile'];
const csv=[columns.join(',')];
for(const r of rows){
  const a=r.before,b=r.after;
  csv.push([r.venue,r.quality,r.device,r.mode,r.scenario,r.label,r.warmup,a.n,a.meanMs,b.meanMs,r.meanChangePercent,a.p50Ms,b.p50Ms,a.p95Ms,b.p95Ms,a.p99Ms,b.p99Ms,a.observedRafFps,b.observedRafFps,a.onePercentLowRafFps,b.onePercentLowRafFps,a.calls,b.calls,a.triangles,b.triangles,a.lastHeapMiB,b.lastHeapMiB,a.lastTextures,b.lastTextures,a.lastGeometries,b.lastGeometries,r.beforeFile,r.afterFile].map(v=>v??'').join(','));
}
await fs.writeFile(path.join(outputRoot,'summary.csv'),csv.join('\n')+'\n');
console.log(JSON.stringify({status,expectedPairs:files.length,completedPairs,rows:rows.length,adaptive:adaptive.length,excluded}));
if (status !== 'PASS') process.exitCode = 1;
}
try { await collect(); }
catch (error) {
  const failure = {
    baseline, status: 'FAIL', expectedPairs: null, completedPairs: 0,
    rows: [], adaptive: [],
    excluded: [{ phase: 'collector-preflight-or-write', reason: error.message, ...(error.code ? { code: error.code } : {}) }],
    note: '집계 전제·도구·쓰기 오류야. 원시 결과는 수정하지 않았고 완전한 집계로 해석하면 안 돼.',
  };
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(path.join(outputRoot, 'summary.json'), JSON.stringify(failure, null, 2) + '\n');
  // A stale success CSV must not accompany a newly failed summary.
  await fs.writeFile(path.join(outputRoot, 'summary.csv'), 'status,reason\nFAIL,"집계 전제 또는 쓰기 오류: summary.json을 확인해"\n');
  console.error(JSON.stringify({ status: 'FAIL', reason: error.message }));
  process.exitCode = 1;
}
