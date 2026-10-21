// File-only aggregation of run-plan.py full-frame results. Never launches a
// browser, rewrites raw results, or turns synchronous completion time into FPS.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const help = `node tools/bench/collect-plan.mjs --plan PLAN.json --root RUN_DIR --output SUMMARY_DIR [--manifest FILE]
run-plan.py의 출력 루트(RUN_DIR/logs, RUN_DIR/render)를 읽어 summary.json/summary.md를 만들어.
manifest 기본값은 RUN_DIR/source-manifest.json이야. 기존 원시 파일은 바꾸지 않아.
full-frame 계획의 baseline[-반복명]/candidate[-반복명]을 같은 반복·공연장·프리셋·기기·모드끼리 묶어.
실행 로그/계획/served source 전후/manifest/fixture·도구 해시와 실제 품질·해상도를 검증해.
실패·진행 중·누락·조건 불일치는 제외 사유를 남겨. 모두 완료·검증되었을 때만 exit 0이야.
sync는 ms로만 비교하고, cadence만 관찰 rAF FPS를 계산해. auto는 별도 적응형 관찰이야.
브라우저·GPU·이미지 비교를 실행하지 않아. --help도 파일을 만들지 않아.`;
const options = {};
const allowed = new Set(['plan', 'root', 'output', 'manifest']);
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--help') { console.log(help); process.exit(0); }
  const key = process.argv[i].replace(/^--/, '');
  assert.ok(process.argv[i].startsWith('--') && allowed.has(key), `알 수 없는 인자: ${process.argv[i]}`);
  assert.ok(!options[key] && process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `${key}: 경로를 한 번만 지정해 줘.`);
  options[key] = path.resolve(process.argv[++i]);
}
for (const key of ['plan', 'root', 'output']) assert.ok(options[key], `--${key}가 필요해.\n${help}`);
options.manifest ??= path.join(options.root, 'source-manifest.json');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const shaPattern = /^[a-f0-9]{64}$/;
const relative = file => path.relative(options.root, file).split(path.sep).join('/');
const finite = value => Number.isFinite(value) && value >= 0;
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const equal = (a, b, name) => assert.ok(isDeepStrictEqual(a, b), `${name} 불일치`);
const near = (a, b, name) => assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b)), `${name}: 원시 표본과 요약 불일치`);
const delta = (before, after) => before == null || after == null ? null : {
  before, after, difference: after - before, percent: before === 0 ? null : (after / before - 1) * 100,
};
const inputs = new Map();
async function read(file, stable = true) {
  const bytes = await fs.readFile(file);
  inputs.set(file, { file: relative(file), bytes: bytes.length, sha256: sha256(bytes), stable });
  return bytes;
}
const readJSON = async (file, stable = true) => JSON.parse((await read(file, stable)).toString('utf8'));
const insideRoot = value => {
  const file = path.resolve(options.root, value);
  assert.ok(file.startsWith(options.root + path.sep), `출력 루트를 벗어난 입력: ${value}`);
  return file;
};
const durationNames = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];
const requiredSources = ['js/boot.js', 'js/main.js', 'js/quality.js', 'js/scene/hall.js', 'js/scene/seats.js',
  'js/scene/audience.js', 'js/scene/screen.js', 'js/scene/sphere.js', 'js/scene/dome3d.js',
  'js/scene/domeshow.js', 'js/audio/engine.js', 'js/audio/performance.js'];

function describeJob(job, index) {
  assert.equal(job.script, 'tools/bench/full-frame.mjs', `${index}: full-frame 계획만 지원해.`);
  const [label = 'candidate', venue = 'hall', quality = 'high', device = 'desktop', names = 'front,wide'] = job.args || [];
  const match = /^(baseline|candidate)(.*)$/.exec(label);
  assert.ok(match, `${index}: baseline/candidate 라벨이 필요해: ${label}`);
  assert.ok(/^[a-zA-Z0-9_-]+$/.test(label), `${index}: 안전한 파일 라벨이 필요해.`);
  const mode = job.env?.MODE || 'sync';
  assert.ok(['hall', 'sphere'].includes(venue) && ['high', 'medium', 'low', 'auto'].includes(quality));
  assert.ok(['desktop', 'mobile'].includes(device) && ['sync', 'cadence'].includes(mode));
  const id = job.id || String(index);
  assert.ok(/^[a-zA-Z0-9_-]+$/.test(id), `${index}: 잘못된 job id`);
  const file = insideRoot(path.join(job.directory || 'render', `${label}-full-${venue}-${quality}-${device}-${mode}.json`));
  const logRecord = insideRoot(`logs/${String(index).padStart(3, '0')}-${id}.json`);
  const log = logRecord.replace(/\.json$/, '.log');
  return { job, index, id, label, side: match[1], repeat: match[2].replace(/^-/, '') || 'default',
    venue, quality, device, mode, names: names.split(','), file, logRecord, log,
    pairKey: [match[2] || 'default', venue, quality, device, mode].join('/') };
}

function statistics(scenario, mode) {
  const samples = scenario.samples, metric = mode === 'raf-cadence' ? 'cadenceMs' : 'completeMs';
  const intervals = samples.map(s => s[metric]), sorted = [...intervals].sort((a, b) => a - b);
  const quantile = p => sorted[Math.ceil(p * sorted.length) - 1];
  const optionalMean = key => samples.every(s => finite(s[key])) ? mean(samples.map(s => s[key])) : null;
  const first = samples[0], last = samples.at(-1);
  const phases = {};
  for (const key of new Set(samples.flatMap(s => Object.keys(s.times || {})))) {
    // A wrapped method not called in a frame contributes zero to that frame.
    phases[key] = mean(samples.map(s => s.times?.[key] ?? 0));
  }
  const before = Object.fromEntries((scenario.cdpMetricsBefore || []).map(m => [m.name, m.value]));
  const after = Object.fromEntries((scenario.cdpMetricsSnapshot || []).map(m => [m.name, m.value]));
  const cdpDurationDeltaMs = {};
  for (const key of [...durationNames, 'ThreadTime', 'ProcessTime'])
    cdpDurationDeltaMs[key] = finite(before[key]) && finite(after[key]) ? (after[key] - before[key]) * 1000 : null;
  const qualities = {}, scales = {};
  for (const sample of samples) {
    qualities[sample.quality] = (qualities[sample.quality] || 0) + 1;
    scales[sample.renderScale] = (scales[sample.renderScale] || 0) + 1;
  }
  return {
    n: samples.length, metric, meanMs: mean(intervals), p50Ms: quantile(.5), p95Ms: quantile(.95), p99Ms: quantile(.99),
    calls: mean(samples.map(s => s.calls)), triangles: mean(samples.map(s => s.triangles)),
    submitMs: optionalMean('submitMs'), completionWaitMs: optionalMean('completionWaitMs'), phaseMeanMs: phases,
    cdpDurationDeltaMs, cdpWindowMs: finite(before.Timestamp) && finite(after.Timestamp) ? (after.Timestamp - before.Timestamp) * 1000 : null,
    sampleHeapMeanMiB: samples.every(s => finite(s.heap)) ? mean(samples.map(s => s.heap)) / 2 ** 20 : null,
    sampleHeapLastMiB: finite(last.heap) ? last.heap / 2 ** 20 : null,
    cdpHeapBeforeMiB: finite(before.JSHeapUsedSize) ? before.JSHeapUsedSize / 2 ** 20 : null,
    cdpHeapAfterMiB: finite(after.JSHeapUsedSize) ? after.JSHeapUsedSize / 2 ** 20 : null,
    textures: { first: first.textures ?? null, last: last.textures ?? null, mean: optionalMean('textures') },
    geometries: { first: first.geometries ?? null, last: last.geometries ?? null, mean: optionalMean('geometries') },
    actualQuality: { first: first.quality, last: last.quality, counts: qualities },
    actualScale: { first: first.renderScale, last: last.renderScale, counts: scales },
    gpuFrameMs: null, gpuMemoryMiB: null,
    ...(metric === 'cadenceMs' ? { observedRafFps: 1000 / mean(intervals),
      onePercentLowRafFps: samples.length < 100 ? null : 1000 / mean(sorted.slice(-Math.ceil(samples.length * .01))),
      onePercentLowSampleCount: samples.length < 100 ? null : Math.ceil(samples.length * .01) } : {}),
  };
}

function validateRaw(data, spec, manifest, sourceFiles) {
  const env = spec.job.env || {};
  assert.equal(data.status, 'PASS', `raw 완료 PASS 아님: ${data.status}`);
  assert.equal(data.schema, 2); assert.equal(data.suite, 'whole-frame-controlled');
  for (const key of ['label', 'venue', 'quality', 'device']) equal(data[key], spec[key], key);
  assert.ok(typeof env.REVISION === 'string' && env.REVISION, '계획의 REVISION이 없어.');
  equal(data.revision, env.REVISION, '계획 revision');
  if (spec.side === 'baseline') equal(data.revision, manifest.baseline, 'manifest 기준 revision');
  assert.ok(env.BASE_URL, '계획의 BASE_URL이 없어.');
  equal(new URL(data.baseURL).href, new URL(env.BASE_URL).href, '계획 BASE_URL');
  equal(data.mode, spec.mode === 'cadence' ? 'raf-cadence' : 'synchronous-completion', 'mode');
  for (const [key, name] of [['SAMPLES', 'samplesPerScenario'], ['WARMUP', 'warmupFrames']]) {
    if (env[key] !== undefined) equal(data[name], Number(env[key]), `계획 ${key}`);
    assert.ok(Number.isSafeInteger(data[name]) && data[name] >= (key === 'SAMPLES' ? 1 : 0), `${name} 기록이 잘못됐어.`);
  }
  if (env.SCREENSHOTS !== undefined) equal(data.screenshots, String(env.SCREENSHOTS) === '1', '계획 SCREENSHOTS');
  equal(data.scenarioOrder, spec.names, 'scenarioOrder');
  assert.equal(new Set(spec.names).size, spec.names.length, '시나리오 중복');
  equal(Object.keys(data.scenarios), spec.names, '실제 시나리오 목록/순서');
  equal(data.diagnostics?.pageErrors, [], 'page errors'); equal(data.diagnostics?.consoleErrors, [], 'console errors');
  equal(data.diagnostics?.failedRequests, [], '실패한 네트워크 요청');
  assert.ok(Array.isArray(data.viewport) && data.viewport.length === 2 && data.viewport.every(n => Number.isSafeInteger(n) && n > 0), 'viewport 기록 없음');
  assert.ok(finite(data.devicePixelRatio) && data.devicePixelRatio > 0, 'DPR 기록 없음');
  equal(data.meta?.viewport, data.viewport, '실제 viewport');
  assert.ok(finite(data.meta?.pixelRatio) && data.meta.pixelRatio > 0, '실제 renderer pixelRatio 기록 없음');
  assert.ok(typeof data.meta.userAgent === 'string' && data.meta.userAgent, '실제 userAgent 기록 없음');
  assert.ok(data.meta.renderer === null || typeof data.meta.renderer === 'string', 'renderer 기록 없음');
  assert.equal(typeof data.meta.gpuTimer, 'boolean', 'GPU timer 지원 여부 기록 없음');
  for (const [key, actual] of [['WIDTH', data.viewport[0]], ['HEIGHT', data.viewport[1]], ['DPR', data.devicePixelRatio]])
    if (env[key] !== undefined) equal(actual, Number(env[key]), `계획 ${key}`);
  for (const key of ['browserVersion', 'playwrightVersion', 'platform', 'architecture', 'fontMode'])
    assert.ok(typeof data.environment?.[key] === 'string' && data.environment[key], `environment.${key} 기록 없음`);
  for (const key of ['softwareRequested', 'headless']) assert.equal(typeof data.environment?.[key], 'boolean', `environment.${key} 기록 없음`);
  assert.ok(Array.isArray(data.environment?.chromeArgs), 'chromeArgs 기록 없음');
  for (const key of ['fixtureSourceSha256', 'collectorSourceSha256', 'helperSourceSha256']) assert.match(data[key] || '', shaPattern, `${key} 기록 없음`);
  for (const key of ['seats', 'crowd', 'eligibleAudienceSeats', 'recitalSeats'])
    assert.ok(Number.isSafeInteger(data.fixture?.[key]) && data.fixture[key] >= 0, `fixture.${key} 기록 없음`);
  equal(data.fixture.seats, data.fixture.eligibleAudienceSeats + data.fixture.recitalSeats, '관객/무대 좌석 분리');
  for (const key of ['asleep', 'interval', 'recital', 'practice']) equal(data.fixture.sceneState?.[key], false, `fixture.sceneState.${key}`);
  equal(data.fixture.sceneState?.phase, 'playing', 'fixture phase');
  assert.ok(data.fixturePolicy && data.fixturePolicy.audio && data.fixturePolicy.piece, 'fixturePolicy 기록 없음');
  equal(data.fixture.piece, data.fixturePolicy.piece, 'fixture 곡');
  assert.ok(data.sourceHashes && data.sourceHashesAfter, 'served source 전후 해시 기록이 없어.');
  equal(data.sourceHashes, data.sourceHashesAfter, '측정 전후 served source');
  for (const file of requiredSources) assert.ok(Object.hasOwn(data.sourceHashes, file), `필수 served source 누락: ${file}`);
  for (const [file, actual] of Object.entries(data.sourceHashes)) {
    const record = sourceFiles.get(`public/${file}`);
    assert.ok(record, `manifest에 없는 served source: ${file}`);
    const expected = record[`${spec.side}Sha256`];
    if (expected === null) equal(actual, { httpStatus: 404 }, `${file}: manifest에 없는 파일의 404`);
    else {
      assert.match(expected || '', shaPattern, `${file}: manifest 해시 기록 없음`);
      equal(actual, { sha256: expected }, `${file}: manifest와 served bytes`);
    }
  }
  if (data.quality === 'auto') {
    equal(data.mode, 'raf-cadence', 'auto 관찰 mode');
    equal(data.fixturePolicy.animationDtCapSeconds, .05, 'auto dt cap');
  } else {
    equal(data.meta.quality, data.quality, '초기 실제 프리셋');
    equal(data.meta.renderScale, 1, '초기 실제 scale');
  }
  for (const [name, scenario] of Object.entries(data.scenarios)) {
    assert.ok(scenario.scenario?.camera, `${name}: 카메라 조건 누락`);
    assert.equal(scenario.samples?.length, data.samplesPerScenario, `${name}: 표본 수 불일치`);
    const metric = data.mode === 'raf-cadence' ? 'cadenceMs' : 'completeMs';
    for (const [index, s] of scenario.samples.entries()) {
      const at = `${name}[${index}]`;
      assert.ok(finite(s[metric]) && (metric !== 'cadenceMs' || s[metric] > 0), `${at}: 시간 표본 오류`);
      for (const key of ['calls', 'triangles', 'submitMs']) assert.ok(finite(s[key]), `${at}: ${key} 표본 오류`);
      for (const [key, value] of Object.entries(s.times || {})) assert.ok(finite(value), `${at}: 단계 ${key} 시간 오류`);
      for (const key of ['heap', 'textures', 'geometries']) assert.ok(s[key] == null || finite(s[key]), `${at}: ${key} 표본 오류`);
      equal(s.glError, 0, `${at} GL 오류`); equal(s.contextLost, false, `${at} context 유실`);
      equal(s.asleep, false, `${at} 수면`); equal(s.visibility, 'visible', `${at} 탭 가시성`);
      equal(s.completed, metric === 'completeMs', `${at} GPU 완료 강제 여부`);
      assert.ok(['high', 'medium', 'low'].includes(s.quality), `${at}: 실제 preset 기록 없음`);
      assert.ok(finite(s.renderScale) && s.renderScale > 0 && s.renderScale <= 1, `${at}: 실제 scale 기록 없음`);
      if (data.quality !== 'auto') { equal(s.quality, data.quality, `${at} 실제 preset`); equal(s.renderScale, 1, `${at} 실제 scale`); }
    }
    const stats = statistics(scenario, data.mode);
    equal(scenario.timing?.metric, metric, `${name} 시간 지표`);
    for (const key of ['meanMs', 'p50Ms', 'p95Ms', 'p99Ms']) near(scenario.timing[key], stats[key], `${name}.${key}`);
    near(scenario.meanCalls, stats.calls, `${name}.calls`); near(scenario.meanTriangles, stats.triangles, `${name}.triangles`);
    for (const key of durationNames) {
      const computed = stats.cdpDurationDeltaMs[key], stored = scenario.cdpDurationDeltaMs?.[key];
      assert.ok(computed === null || computed >= 0, `${name}.${key}: CDP 누적 시간 역행`);
      if (computed === null) equal(stored, null, `${name}.${key} 미측정값`);
      else near(stored, computed, `${name}.${key}`);
    }
  }
}

async function inspectJob(spec, planHash, manifest, sourceFiles) {
  const result = { id: spec.id, index: spec.index, side: spec.side, file: relative(spec.file), log: relative(spec.logRecord) };
  let record;
  try { record = await readJSON(spec.logRecord, false); }
  catch (error) { return { ...result, status: error.code === 'ENOENT' ? 'PENDING' : 'INVALID', reason: error.code === 'ENOENT' ? '계획된 실행 로그가 아직 없어.' : `로그를 읽지 못했어: ${error.message}` }; }
  if (record.status === 'RUNNING') return { ...result, status: 'RUNNING', reason: '실행 중인 결과는 집계하지 않아.' };
  if (record.status !== 'PASS' || record.exitCode !== 0) {
    let failure = null;
    try { failure = (await readJSON(spec.file, false)).failure || null; } catch { /* the process may have failed before writing raw JSON */ }
    return { ...result, status: 'FAILED', exitCode: record.exitCode ?? null, reason: 'run-plan 실행 실패', failure };
  }
  inputs.get(spec.logRecord).stable = true;
  try {
    equal(record.index, spec.index, '실행 index'); equal(record.job, spec.job, '실행 job');
    equal(record.planSha256, planHash, '실행 계획 SHA-256');
    equal(sha256(await read(spec.log)), record.logSha256, '실행 stdout/stderr SHA-256');
    const data = await readJSON(spec.file);
    equal(data.collectorSourceSha256, record.collectorSha256, '실행기 SHA-256');
    validateRaw(data, spec, manifest, sourceFiles);
    return { ...result, status: 'PASS', data, dependencies: [spec.file, spec.logRecord, spec.log],
      sourceCoverage: { verified: Object.keys(data.sourceHashes),
        notServedHashed: [...sourceFiles.keys()].filter(file => !Object.hasOwn(data.sourceHashes, file.replace(/^public\//, ''))) },
      warnings: data.diagnostics.warnings || [] };
  } catch (error) { return { ...result, status: 'INVALID', reason: error.message }; }
}

function comparePair(a, b, spec) {
  for (const key of ['schema', 'suite', 'quality', 'mode', 'venue', 'device', 'fixture', 'fixturePolicy',
    'fixtureSourceSha256', 'collectorSourceSha256', 'helperSourceSha256', 'warmupFrames', 'samplesPerScenario',
    'scenarioOrder', 'viewport', 'devicePixelRatio', 'environment', 'screenshots', 'measurement']) equal(a[key], b[key], `pair.${key}`);
  equal(Object.keys(a.sourceHashes).sort(), Object.keys(b.sourceHashes).sort(), 'pair.served source 목록');
  if (a.quality === 'auto') {
    for (const key of ['renderer', 'gpuTimer', 'viewport', 'hardwareConcurrency', 'userAgent']) equal(a.meta[key], b.meta[key], `pair.meta.${key}`);
  } else equal(a.meta, b.meta, 'pair.meta(실제 해상도 포함)');
  const rows = [];
  for (const name of a.scenarioOrder) {
    const sa = a.scenarios[name], sb = b.scenarios[name];
    equal(sa.scenario, sb.scenario, `${name}: 카메라·곡 시각·세계·중계·효과`);
    const before = statistics(sa, a.mode), after = statistics(sb, b.mode);
    const changes = {};
    for (const key of ['meanMs', 'p50Ms', 'p95Ms', 'p99Ms', 'calls', 'triangles', 'submitMs', 'completionWaitMs',
      'sampleHeapMeanMiB', 'sampleHeapLastMiB', 'cdpHeapBeforeMiB', 'cdpHeapAfterMiB']) changes[key] = delta(before[key], after[key]);
    changes.cdpDurationDeltaMs = Object.fromEntries(Object.keys(before.cdpDurationDeltaMs).map(key => [key, delta(before.cdpDurationDeltaMs[key], after.cdpDurationDeltaMs[key])]));
    changes.phaseMeanMs = Object.fromEntries([...new Set([...Object.keys(before.phaseMeanMs), ...Object.keys(after.phaseMeanMs)])]
      .map(key => [key, delta(before.phaseMeanMs[key] ?? null, after.phaseMeanMs[key] ?? null)]));
    if (a.mode === 'raf-cadence') for (const key of ['observedRafFps', 'onePercentLowRafFps']) changes[key] = delta(before[key], after[key]);
    rows.push({ pairKey: spec.pairKey, repeat: spec.repeat, venue: a.venue, quality: a.quality, device: a.device,
      mode: a.mode, scenario: name, category: a.quality === 'auto' ? 'adaptive-observation' : 'same-quality',
      beforeFile: relative(spec.baseline.file), afterFile: relative(spec.candidate.file),
      beforeRevision: a.revision, afterRevision: b.revision, viewport: a.viewport, devicePixelRatio: a.devicePixelRatio,
      samplesPerScenario: a.samplesPerScenario, warmupFrames: a.warmupFrames, scenarioState: sa.scenario,
      fixtureSourceSha256: a.fixtureSourceSha256, before, after, changes,
      direction: { meanTime: after.meanMs > before.meanMs ? 'worse' : after.meanMs < before.meanMs ? 'better' : 'equal',
        p95Time: after.p95Ms > before.p95Ms ? 'worse' : after.p95Ms < before.p95Ms ? 'better' : 'equal' } });
  }
  return rows;
}

const definitions = {
  sync: '전체 frame() + readPixels 완료 시간(ms). GPU 완료 대기·QA 오버헤드가 포함되며 실제 앱 FPS나 순수 GPU 시간이 아니야. sync에는 FPS 필드를 만들지 않아.',
  cadence: '통제된 native rAF callback 시작 간격. observedRafFps=1000/평균 간격. 1% Low는 n>=100일 때만 느린 상위 ceil(n*.01)개 간격 평균의 역수야.',
  fixture: '실제 음표 스케줄러가 꺼져 있고 음악 시각·카메라·관객 시드가 제어돼. 실제 오디오/입력 부하나 실기기 FPS를 증명하지 않아.',
  adaptive: 'auto는 프리셋·scale이 변할 수 있는 별도 관찰. 같은 화질 성능 개선율에 포함하지 않아.',
  cpu: 'CDP TaskDuration/ScriptDuration 등은 해당 장면 수집 창의 누적 카운터 차이(ms). TaskDuration은 동기 대기를 포함할 수 있어 CPU 점유율로 해석하지 않아. cadence는 N개 간격 수집에 N+1회 step을 실행해.',
  phases: 'sample.times의 호출 경과 시간 평균. renderSubmit/worlds/broadcast 등은 서로 중첩될 수 있어 합계가 CPU 프레임 시간이 아니야. 미호출 프레임은 0, 어느 한 실행에 단계 자체가 없으면 변화율은 null이야.',
  memory: 'performance.memory 표본과 CDP JSHeapUsedSize를 별도로 기록해. 서로 다른 JS heap 관찰값이며 GPU 메모리/오디오 버퍼 전체 사용량이 아니야. texture/geometry는 개수야.',
  gpu: 'GPU 타이머 extension 지원 여부만으로 GPU 프레임 시간을 측정했다고 간주하지 않아. GPU 시간/VRAM 사용량은 null(미측정)이야.',
  sources: 'manifest의 제공된 파일 SHA와 실제 served source 전후 SHA를 대조해. manifest에만 있고 served 해시가 없는 파일은 jobs.sourceCoverage.notServedHashed에 남겨. candidateParent는 후보 작업의 부모 커밋 표기이며 served 해시가 실제 측정 코드의 근거야.',
  quality: '동일 입력/프리셋/실제 scale/viewport/fixture 검증은 시각적 동등성의 필요조건이야. screenshot 육안/이미지 비교는 이 도구가 하지 않아.',
  repeat: '반복 a/b를 개별 행으로 보존해. 같은 실행의 장면/프레임을 독립 반복처럼 세거나 모든 행의 개선율을 평균하지 않아. 작은 n의 p95/p99는 최대 한 프레임에 좌우될 수 있어.',
  exclusions: '실패·진행 중·누락·조건 불일치 쌍은 제외 목록에 남겨. 악화된 유효 행은 숨기지 않아. 하나라도 제외되면 exit 1이며 완료된 유효 쌍의 부분 결과는 남겨.',
  missing: '미측정 값, 100표본 미만 1% Low, 0분모 변화율은 null/미측정으로 표시해. mobile은 브라우저 viewport/UA/touch 에뮬레이션이야.',
};
const esc = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const fmt = (value, digits = 2) => value == null ? '미측정' : Number(value).toFixed(digits);
const pair = (a, b, digits = 2) => `${fmt(a, digits)} → ${fmt(b, digits)}`;
const rowName = r => [r.venue, r.quality, r.device, r.repeat, r.scenario].join(' / ');
function markdown(summary) {
  const lines = ['# 렌더 계획 전후 비교', '', `상태: **${summary.status}** · 계획 ${summary.expectedJobs ?? 0}개 실행 · 유효 ${summary.completedPairs ?? 0}/${summary.expectedPairs ?? 0}쌍`, '',
    `생성 시각: ${summary.generatedAt}`, '', '## 해석과 측정 범위', ''];
  for (const text of Object.values(definitions)) lines.push(`- ${text}`);
  lines.push('', '## 동일 품질: 동기 완료 시간', '', '모든 화살표는 기준 → 후보야. 양수 시간 변화율은 악화, 음수는 개선이야. 반복 결과를 합치지 않았어.', '',
    '| 공연장 / 품질 / 기기 / 반복 / 장면 | n | 평균 ms | 변화 % | p95 ms | p99 ms | Draw Calls | Triangles |',
    '|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of summary.rows.filter(r => r.mode === 'synchronous-completion')) lines.push(`| ${esc(rowName(r))} | ${r.before.n} | ${pair(r.before.meanMs, r.after.meanMs)} | ${fmt(r.changes.meanMs.percent)} | ${pair(r.before.p95Ms, r.after.p95Ms)} | ${pair(r.before.p99Ms, r.after.p99Ms)} | ${pair(r.before.calls, r.after.calls, 1)} | ${pair(r.before.triangles, r.after.triangles, 0)} |`);
  lines.push('', '## 동일 품질: rAF cadence 관찰', '', '| 공연장 / 품질 / 기기 / 반복 / 장면 | n | 관찰 FPS | 1% Low FPS | 평균 간격 ms | p95 ms |', '|---|---:|---:|---:|---:|---:|');
  const cadence = summary.rows.filter(r => r.mode === 'raf-cadence');
  for (const r of cadence) lines.push(`| ${esc(rowName(r))} | ${r.before.n} | ${pair(r.before.observedRafFps, r.after.observedRafFps)} | ${pair(r.before.onePercentLowRafFps, r.after.onePercentLowRafFps)} | ${pair(r.before.meanMs, r.after.meanMs)} | ${pair(r.before.p95Ms, r.after.p95Ms)} |`);
  if (!cadence.length) lines.push('', '이 계획에서 완료·검증된 cadence 쌍이 없어.');
  lines.push('', '## 적응형 품질 관찰', '', '| 공연장 / 품질 / 기기 / 반복 / 장면 | 관찰 FPS | p95 ms | 실제 품질 표본 수 (기준 → 후보) | 실제 scale 표본 수 (기준 → 후보) |', '|---|---:|---:|---|---|');
  for (const r of summary.adaptive) lines.push(`| ${esc(rowName(r))} | ${pair(r.before.observedRafFps, r.after.observedRafFps)} | ${pair(r.before.p95Ms, r.after.p95Ms)} | ${esc(JSON.stringify(r.before.actualQuality.counts))} → ${esc(JSON.stringify(r.after.actualQuality.counts))} | ${esc(JSON.stringify(r.before.actualScale.counts))} → ${esc(JSON.stringify(r.after.actualScale.counts))} |`);
  if (!summary.adaptive.length) lines.push('', '이 계획에서 완료·검증된 auto 쌍이 없어.');
  lines.push('', '## 장면 수집 창의 CDP 시간과 JS 메모리', '', 'Task/Script는 장면 전체 누적 시간 차이야. 메모리는 각 수집 종료 시점 값이며 GC 차이가 포함될 수 있어. 단계별 호출 시간과 나머지 카운터는 summary.json에 모두 남겼어.', '',
    '| 공연장 / 품질 / 기기 / 반복 / 장면 / 모드 | CDP Task ms | CDP Script ms | CDP Heap MiB | sample Heap MiB | Textures | Geometries |', '|---|---:|---:|---:|---:|---:|---:|');
  for (const r of [...summary.rows, ...summary.adaptive]) lines.push(`| ${esc(rowName(r))} / ${r.mode} | ${pair(r.before.cdpDurationDeltaMs.TaskDuration, r.after.cdpDurationDeltaMs.TaskDuration)} | ${pair(r.before.cdpDurationDeltaMs.ScriptDuration, r.after.cdpDurationDeltaMs.ScriptDuration)} | ${pair(r.before.cdpHeapAfterMiB, r.after.cdpHeapAfterMiB)} | ${pair(r.before.sampleHeapLastMiB, r.after.sampleHeapLastMiB)} | ${pair(r.before.textures.last, r.after.textures.last, 0)} | ${pair(r.before.geometries.last, r.after.geometries.last, 0)} |`);
  lines.push('', '## 제외·미완료 목록', '', '| 쌍/입력 | 상태 | 이유 |', '|---|---|---|');
  for (const entry of summary.excluded) lines.push(`| ${esc(entry.pairKey || entry.file || entry.phase || '')} | ${entry.status || 'INVALID'} | ${esc(entry.reason)} |`);
  if (!summary.excluded.length) lines.push('| — | 없음 | 계획된 모든 쌍이 검증됐어. |');
  lines.push('', '## 재현과 원본 추적', '', '사용한 계획·manifest·원시 파일·실행 로그 SHA-256과 파일 경로는 summary.json의 provenance/inputs/jobs에 있어. 제외된 실패 원본도 수정하지 않았어.', '',
    `- 계획 SHA-256: ${summary.provenance?.planSha256 || '미기록'}`,
    `- manifest SHA-256: ${summary.provenance?.manifestSha256 || '미기록'}`,
    `- 집계기 SHA-256: ${summary.provenance?.collectorSha256 || '미기록'}`, '');
  return lines.join('\n');
}

async function collect() {
  const planBytes = await read(options.plan), plan = JSON.parse(planBytes);
  const manifest = await readJSON(options.manifest), planHash = sha256(planBytes);
  assert.ok(Array.isArray(plan) && plan.length, '비어 있지 않은 계획이 필요해.');
  assert.ok(manifest.baseline && Array.isArray(manifest.files) && manifest.files.length, 'source manifest 기록이 없어.');
  const sourceFiles = new Map(manifest.files.map(file => [file.path || file.file, file]));
  assert.equal(sourceFiles.size, manifest.files.length, 'manifest 경로 중복');
  const specs = plan.map(describeJob), groups = new Map(), files = new Set();
  for (const spec of specs) {
    assert.ok(!files.has(spec.file), `결과 파일 이름 중복: ${relative(spec.file)}`); files.add(spec.file);
    const group = groups.get(spec.pairKey) || { pairKey: spec.pairKey, repeat: spec.repeat };
    assert.ok(!group[spec.side], `${spec.pairKey}: ${spec.side} 중복`);
    group[spec.side] = spec; groups.set(spec.pairKey, group);
  }
  const summary = { schema: 1, suite: 'render-plan-comparison', generatedAt: new Date().toISOString(), status: 'RUNNING',
    expectedJobs: specs.length, expectedPairs: groups.size, completedPairs: 0,
    provenance: { plan: options.plan, root: options.root, manifest: options.manifest, planSha256: planHash,
      manifestSha256: inputs.get(options.manifest).sha256, collectorSha256: sha256(await fs.readFile(new URL(import.meta.url))),
      baseline: manifest.baseline, candidateParent: manifest.candidateParent ?? null, candidateChanges: manifest.candidateChanges ?? null },
    definitions, jobs: [], comparisons: [], rows: [], adaptive: [], excluded: [], unplannedFiles: [] };
  for (const directory of new Set(specs.map(spec => path.dirname(spec.file)))) {
    const names = await fs.readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of names.filter(name => name.endsWith('.json'))) {
      const file = path.join(directory, name);
      if (!files.has(file)) summary.unplannedFiles.push({ file: relative(file), reason: '지정한 계획에 없는 파일이라 읽거나 집계하지 않았어.' });
    }
  }
  const inspected = new Map();
  for (const spec of specs) {
    const result = await inspectJob(spec, planHash, manifest, sourceFiles);
    inspected.set(spec.index, result);
    const { data, dependencies, ...publicRecord } = result;
    summary.jobs.push(publicRecord);
  }
  for (const spec of groups.values()) {
    if (!spec.baseline || !spec.candidate) { summary.excluded.push({ pairKey: spec.pairKey, status: 'INVALID', reason: '계획에 기준/후보의 짝이 없어.' }); continue; }
    const a = inspected.get(spec.baseline.index), b = inspected.get(spec.candidate.index);
    if (a.status !== 'PASS' || b.status !== 'PASS') {
      summary.excluded.push({ pairKey: spec.pairKey, status: [a, b].some(x => ['FAILED', 'INVALID'].includes(x.status)) ? 'FAILED' : 'PENDING',
        reason: [a, b].filter(x => x.status !== 'PASS').map(x => `${x.id}: ${x.status} — ${x.reason}`).join('; '),
        beforeFile: a.file, afterFile: b.file });
      continue;
    }
    try {
      const rows = comparePair(a.data, b.data, spec);
      summary.comparisons.push({ pairKey: spec.pairKey, beforeFile: a.file, afterFile: b.file,
        dependencies: [...a.dependencies, ...b.dependencies].map(relative),
        sameQuality: a.data.quality !== 'auto', fixtureSourceSha256: a.data.fixtureSourceSha256,
        collectorSourceSha256: a.data.collectorSourceSha256, helperSourceSha256: a.data.helperSourceSha256,
        conditions: { environment: a.data.environment, viewport: a.data.viewport, devicePixelRatio: a.data.devicePixelRatio,
          beforeMeta: a.data.meta, afterMeta: b.data.meta, fixture: a.data.fixture,
          fixturePolicy: a.data.fixturePolicy, measurement: a.data.measurement } });
      (a.data.quality === 'auto' ? summary.adaptive : summary.rows).push(...rows);
    } catch (error) { summary.excluded.push({ pairKey: spec.pairKey, status: 'INVALID', reason: error.message, beforeFile: a.file, afterFile: b.file }); }
  }
  // A pair may match internally even when the runner was edited between pairs.
  // Keep such data in separate plans instead of mixing instrumentation versions.
  const mixedHashes = ['fixtureSourceSha256', 'collectorSourceSha256', 'helperSourceSha256']
    .filter(key => new Set(summary.comparisons.map(pair => pair[key])).size > 1);
  if (mixedHashes.length) {
    for (const pair of summary.comparisons) summary.excluded.push({ pairKey: pair.pairKey, status: 'INVALID',
      reason: `계획 안의 측정 도구 버전이 서로 달라: ${mixedHashes.join(', ')}. 도구 버전별 계획으로 나눠 줘.` });
    summary.comparisons = []; summary.rows = []; summary.adaptive = [];
  }
  const changed = [];
  for (const [file, record] of inputs) {
    if (!record.stable) continue;
    try { if (sha256(await fs.readFile(file)) !== record.sha256) changed.push(record.file); }
    catch { changed.push(record.file); }
  }
  if (changed.length) {
    const commonChanged = changed.some(file => [relative(options.plan), relative(options.manifest)].includes(file));
    const invalid = summary.comparisons.filter(pair => commonChanged || pair.dependencies.some(file => changed.includes(file)));
    for (const pair of invalid) summary.excluded.push({ pairKey: pair.pairKey, status: 'INVALID', reason: `집계 중 입력 변경/유실: ${changed.join(', ')}` });
    const keys = new Set(invalid.map(pair => pair.pairKey));
    for (const key of ['comparisons', 'rows', 'adaptive']) summary[key] = summary[key].filter(row => !keys.has(row.pairKey));
    if (!invalid.length) summary.excluded.push({ phase: 'input-stability', status: 'INVALID', reason: `집계 중 입력 변경/유실: ${changed.join(', ')}` });
  }
  summary.completedPairs = summary.comparisons.length;
  summary.inputs = [...inputs.values()];
  summary.status = summary.excluded.length ? summary.excluded.every(e => e.status === 'PENDING') ? 'INCOMPLETE' : 'FAIL' : 'PASS';
  return summary;
}

let summary;
try { summary = await collect(); }
catch (error) {
  summary = { schema: 1, suite: 'render-plan-comparison', status: 'FAIL', generatedAt: new Date().toISOString(),
    definitions, rows: [], adaptive: [], jobs: [], comparisons: [], inputs: [...inputs.values()],
    excluded: [{ phase: 'preflight', status: 'INVALID', reason: error.message }] };
}
await fs.mkdir(options.output, { recursive: true });
for (const name of ['summary.json', 'summary.md'])
  assert.ok(!inputs.has(path.join(options.output, name)), `요약 출력으로 원본 입력을 덮어쓸 수 없어: ${name}`);
await fs.writeFile(path.join(options.output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
await fs.writeFile(path.join(options.output, 'summary.md'), markdown(summary));
console.log(JSON.stringify({ status: summary.status, expectedPairs: summary.expectedPairs, completedPairs: summary.completedPairs,
  rows: summary.rows.length, adaptive: summary.adaptive.length, excluded: summary.excluded.length, output: options.output }));
if (summary.status !== 'PASS') process.exitCode = 1;
