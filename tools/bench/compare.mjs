// 원시 JSON은 바꾸지 않고, 조건이 맞는 두 실행의 차이만 계산해.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { summarize } from './browser.mjs';

if (process.argv.includes('--help') || process.argv.length !== 4) {
  console.log('node tools/bench/compare.mjs before.json after.json\n이동형 schema 2끼리, 또는 기존 full-frame/venue JSON끼리만 비교해. 동기 완료 시간은 ms로 유지하고, 실제 rAF 간격에만 관찰 FPS를 계산해.');
  process.exit(process.argv.includes('--help') ? 0 : 1);
}
const paths = process.argv.slice(2);
const sources = await Promise.all(paths.map(p => fs.readFile(p, 'utf8').then(JSON.parse)));
const warnings = [];
function normalize(data) {
  if (data.schema === 2) {
    assert.ok(['venue-static', 'whole-frame-controlled'].includes(data.suite), '렌더 벤치마크 JSON만 비교할 수 있어.');
    assert.equal(data.status, 'PASS', '완료되지 않았거나 오류가 있는 실행은 비교하지 않아.');
    return { ...data, format: 'portable-v2', summaries: data.scenarios };
  }
  assert.equal((data.errors || []).length, 0, '기존 JSON에 오류가 기록돼 있어.');
  if (data.scenarios && typeof data.kind === 'string' && (data.kind.includes('controlled whole-app') || data.kind.startsWith('native rAF'))) {
    const cadence = data.kind.startsWith('native rAF');
    const metric = cadence ? 'cadenceMs' : 'completeMs';
    return {
      ...data, format: 'legacy-full-v1', suite: 'whole-frame-controlled',
      mode: cadence ? 'raf-cadence' : 'synchronous-completion',
      scenarioOrder: Object.keys(data.scenarios), viewport: data.meta?.viewport,
      summaries: Object.fromEntries(Object.entries(data.scenarios).map(([name, scenario]) => {
        assert.ok(scenario.samples?.length, `${name}: 원시 표본이 없어.`);
        assert.ok(scenario.samples.every(s => !s.glError && !s.contextLost), `${name}: WebGL 오류가 있어.`);
        const samples = scenario.samples.map(s => ({ ...s, [metric]: s.ms }));
        return [name, { ...scenario, samples, ...summarize(samples, metric) }];
      })),
    };
  }
  if (data.results && data.metadata) {
    return {
      ...data, format: 'legacy-venue-v1', suite: 'venue-static', mode: 'synchronous-completion',
      device: 'desktop', meta: data.metadata, scenarioOrder: Object.keys(data.results),
      samplesPerScenario: Object.values(data.results)[0]?.ms.length,
      summaries: Object.fromEntries(Object.entries(data.results).map(([name, result]) => {
        assert.equal(result.glError, 0, `${name}: WebGL 오류가 있어.`);
        const samples = result.ms.map(ms => ({ completeMs: ms, calls: result.calls, triangles: result.triangles }));
        return [name, { ...summarize(samples, 'completeMs'), samples }];
      })),
    };
  }
  throw new Error('알 수 없는 결과 형식이야. 원본 실행기와 범위를 먼저 확인해 줘.');
}
const [before, after] = sources.map(normalize);
for (const key of ['format', 'suite', 'mode', 'venue', 'quality', 'device', 'scenarioOrder', 'samplesPerScenario'])
  assert.deepEqual(before[key], after[key], `${key}가 달라서 비교를 중단했어.`);
assert.notEqual(before.quality, 'auto', '자동 품질은 프리셋/해상도가 바뀔 수 있어. 이 도구의 동일 화질 비교에서 제외해.');
for (const key of ['viewport', 'devicePixelRatio', 'warmupFrames', 'fixture', 'fixturePolicy', 'fixtureSourceSha256', 'screenshots']) {
  if (before[key] === undefined && after[key] === undefined) warnings.push(`${key}: 기존 JSON에 없어서 이 조건은 자동 검증하지 못했어.`);
  else assert.deepEqual(before[key], after[key], `${key}가 달라서 비교를 중단했어.`);
}
for (const key of ['renderer', 'pixelRatio', 'userAgent']) {
  if (before.meta?.[key] === undefined && after.meta?.[key] === undefined) warnings.push(`meta.${key}: 기록이 없어서 별도 확인이 필요해.`);
  else assert.deepEqual(before.meta?.[key], after.meta?.[key], `meta.${key}가 달라서 비교를 중단했어.`);
}
if (before.format === 'portable-v2') {
  for (const key of ['browserVersion', 'playwrightVersion', 'platform', 'architecture', 'softwareRequested', 'chromeArgs', 'fontMode', 'headless'])
    assert.deepEqual(before.environment?.[key], after.environment?.[key], `environment.${key}가 달라서 비교를 중단했어.`);
} else warnings.push('기존 실행기 결과에는 브라우저 바이너리/폰트/fixture 해시가 모두 기록돼 있지 않아. 원본 실행기와 환경 기록으로 보완해 줘.');
function delta(a, b) { return { before: a, after: b, difference: b - a, percent: a === 0 ? null : (b - a) / a * 100 }; }
function fpsDelta(a, b) {
  const change = delta(a, b);
  return { before: a, after: b, delta: change.difference, percent: change.percent };
}
function rafStats(samples) {
  // Legacy rAF samples.ms is normalized to cadenceMs above. Recompute from
  // raw intervals; ignore old throughputFps/onePercentLowFps summary fields.
  const intervals = samples.map(s => s.cadenceMs);
  assert.ok(intervals.length && intervals.every(ms => Number.isFinite(ms) && ms > 0), 'rAF 간격은 양수인 유한한 ms 표본이어야 해.');
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const n = intervals.length;
  const slowestSampleCount = n >= 100 ? Math.ceil(n * 0.01) : null;
  return {
    n, slowestSampleCount, observedRafFps: 1000 / mean(intervals),
    onePercentLowRafFps: slowestSampleCount === null ? null
      : 1000 / mean([...intervals].sort((a, b) => b - a).slice(0, slowestSampleCount)),
  };
}
const scenarios = {};
for (const name of before.scenarioOrder) {
  const a = before.summaries[name], b = after.summaries[name];
  assert.deepEqual(a.timing.metric, b.timing.metric, `${name}: 시간 지표가 달라.`);
  assert.equal(a.samples.length, before.samplesPerScenario, `${name}: before 표본 수가 달라.`);
  assert.equal(b.samples.length, after.samplesPerScenario, `${name}: after 표본 수가 달라.`);
  for (const key of ['scenario', 'camera']) assert.deepEqual(a[key], b[key], `${name}: ${key}가 달라.`);
  for (const s of [...a.samples, ...b.samples]) {
    assert.ok(!s.glError && !s.contextLost, `${name}: WebGL 오류가 있어.`);
    if (s.quality !== undefined) assert.equal(s.quality, before.quality, `${name}: 표본의 실제 프리셋이 달라.`);
    if (s.renderScale !== undefined) assert.equal(s.renderScale, 1, `${name}: 실제 renderScale이 1이 아니야.`);
  }
  scenarios[name] = {
    metric: a.timing.metric,
    meanMs: delta(a.timing.meanMs, b.timing.meanMs),
    p50Ms: delta(a.timing.p50Ms, b.timing.p50Ms),
    p95Ms: delta(a.timing.p95Ms, b.timing.p95Ms),
    calls: delta(a.meanCalls, b.meanCalls), triangles: delta(a.meanTriangles, b.meanTriangles),
  };
  if (before.mode === 'raf-cadence') {
    assert.equal(a.timing.metric, 'cadenceMs', 'rAF 모드는 실제 callback 간격 표본만 FPS로 계산해.');
    const rafA = rafStats(a.samples), rafB = rafStats(b.samples);
    Object.assign(scenarios[name], {
      observedRafFps: fpsDelta(rafA.observedRafFps, rafB.observedRafFps),
      onePercentLowRafFps: rafA.onePercentLowRafFps === null || rafB.onePercentLowRafFps === null
        ? null : fpsDelta(rafA.onePercentLowRafFps, rafB.onePercentLowRafFps),
      rafCadence: {
        n: { before: rafA.n, after: rafB.n },
        slowestSampleCount: { before: rafA.slowestSampleCount, after: rafB.slowestSampleCount },
        sourceInterval: before.format === 'legacy-full-v1' ? 'samples[].ms' : 'samples[].cadenceMs',
        definitions: {
          observedRafFps: '1000 / 전체 rAF 간격(ms)의 산술평균. 프레임별 FPS를 평균한 값이 아니야.',
          onePercentLowRafFps: '표본 n >= 100일 때 1000 / 느린 상위 ceil(n * 0.01)개 간격(ms)의 산술평균. 100개 미만이면 null이야.',
          delta: 'after - before, 단위는 FPS. percent는 before 대비 변화율이야.',
        },
        caveat: '외부 native rAF callback 간격의 관찰값이야. 시각 애니메이션과 음악 시각을 제어하고 실제 음표 스케줄러를 끈 fixture라 실제 오디오·입력 부하나 기기 FPS를 보장하지 않아. 100개 표본의 1% Low는 가장 느린 한 간격에 좌우돼.',
      },
    });
  }
}
console.log(JSON.stringify({
  files: paths, revisions: [before.revision || null, after.revision || null],
  suite: before.suite, mode: before.mode, venue: before.venue, quality: before.quality, device: before.device,
  scenarioOrder: before.scenarioOrder, samplesPerScenario: before.samplesPerScenario, warnings, scenarios,
  interpretation: '시간의 음수 변화는 이번 표본에서 짧아졌다는 뜻이야. 인과관계·실기기 FPS·최악 조건의 성능 보장은 아니야. 작은 차이는 반복 측정과 시각 확인을 함께 봐.',
}, null, 2));
