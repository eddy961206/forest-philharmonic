// File-only comparison. This never launches a browser or requests app assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`node tools/bench/compare-loading.mjs before.json after.json [output.json]
고정 군중 loading 결과 한 쌍을 비교해. 전후/cold/warm의 seed·관객 수·점유 좌석
hash와 샘플·화면·폰트·브라우저 조건을 확인하고, 불일치면 FAIL/exit 1을 남겨.
시간은 조건당 한 번의 관측이야. 통과해도 반복 실험의 인과 개선율은 아니야.
controlledMainFixture 바이트는 QA main 응답이며 원본 main.js 전송량이 아니야.
브라우저·네트워크를 실행하지 않는 파일 비교 도구야.`);
  process.exit(0);
}
if (args.length < 2 || args.length > 3) throw new Error('Expected before.json after.json [output.json]');
const [beforePath, afterPath] = args.map(value => path.resolve(value));
const rawBefore = await fs.readFile(beforePath);
const rawAfter = await fs.readFile(afterPath);
const before = JSON.parse(rawBefore), after = JSON.parse(rawAfter);
const output = args[2] ? path.resolve(args[2]) : path.join(path.dirname(afterPath), `loading-comparison-${after.venue}-${after.device}.json`);
if ([beforePath, afterPath].includes(output)) throw new Error('Comparison output must not overwrite either input');
const digest = value => createHash('sha256').update(value).digest('hex');
const report = {
  schema: 1, suite: 'loading-fixed-audience-comparison', recordedAt: new Date().toISOString(), passed: false,
  inputs: {
    before: { file: beforePath, sha256: digest(rawBefore), revision: before.revision },
    after: { file: afterPath, sha256: digest(rawAfter), revision: after.revision },
  },
  method: 'File-only equality checks on two completed fixed-audience loading observations. Cold/warm and baseline/candidate must share audience seed/count/sorted occupied-seat fingerprint. The same sample, viewport, preset, font and browser conditions are required. Main fixture identity bytes and hashes remain separate from original asset transfers.',
  limitations: [
    'One cold and one warm observation per revision. Timing deltas are observations, not a statistically established causal improvement or a physical-device FPS claim.',
    'Only solo-audience RNG is isolated. Global procedural randomness and generated impulse-response samples are not made byte-identical.',
    'controlledMainFixture reports a rewritten, identity-encoded QA response; it is not the original main.js response transfer size.',
    'Cold means a fresh browser HTTP cache. Upstream Node/OS caches may be warm. Main rAF is held, so this is controlled startup rather than normal interactive readiness.',
  ],
  checks: [], observations: {},
};
const equal = (name, left, right) => report.checks.push({ name, passed: isDeepStrictEqual(left, right), before: left ?? null, after: right ?? null });
const required = (name, value) => report.checks.push({ name, passed: value === true });
const change = (left, right) => ({ before: left, after: right, delta: right - left, percent: left === 0 ? null : (right - left) / left * 100 });
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isMetric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

try {
  for (const [side, data] of [['before', before], ['after', after]]) {
    required(`${side}:completed`, data.passed === true && !data.error);
    required(`${side}:audience-seed`, Number.isInteger(data.fixture?.audienceSeed));
    required(`${side}:collector-provenance`, isHash(data.fixture?.collectorSha256) && isHash(data.fixture?.proxySha256) && isHash(data.fixture?.browserHelperSha256));
    for (const field of ['sampleCountsEqual', 'samplePcmBytesEqual', 'scoreEqual', 'audienceCountEqual', 'occupiedCountEqual', 'occupiedSortedFingerprintEqual', 'mainFixtureStable'])
      required(`${side}:cold-warm:${field}`, data.comparison?.[field] === true);
    const cold = data.runs?.cold, warm = data.runs?.warm;
    if (!cold || !warm) throw new Error(`${side}: missing cold/warm observations`);
    equal(`${side}:cold-warm:audience`, cold.state.audienceFingerprint, warm.state.audienceFingerprint);
    required(`${side}:warm-mp3-cache`, warm.summary.samples.cacheHits > 0 || warm.resourceSummary.samples.zeroTransferEntries > 0);
    for (const name of ['cold', 'warm']) {
      const run = data.runs[name], fixture = run.mainFixture;
      required(`${side}:${name}:fixed-main`, fixture?.audienceSeed === data.fixture.audienceSeed && fixture?.replacements === 1 && fixture?.contentEncoding === 'identity' && fixture?.cacheControl === 'no-cache');
      required(`${side}:${name}:main-hashes`, isHash(fixture?.originalSha256) && isHash(fixture?.servedSha256) && fixture.originalSha256 !== fixture.servedSha256);
      required(`${side}:${name}:audience-enabled`, run.state.audienceFingerprint?.count > 0 && run.state.audienceFingerprint?.occupiedCount > 0 && isHash(run.state.audienceFingerprint?.occupiedSortedSha256));
      required(`${side}:${name}:fixture-transfer-separated`, run.summary.controlledMainFixture?.requests > 0 && run.resourceSummary.controlledMainFixture?.resources > 0);
      for (const [metric, value] of Object.entries({
        readyMs: run.readyMs,
        bootLongTaskCount: run.bootLongTasks?.count,
        bootLongTaskTotalMs: run.bootLongTasks?.totalMs,
        bootLongTaskMaxMs: run.bootLongTasks?.maxMs,
        sampleResponseEncodedBytes: run.summary.samples?.responseEncodedBytes,
        controlledMainFixtureResponseEncodedBytes: run.summary.controlledMainFixture?.responseEncodedBytes,
      })) required(`${side}:${name}:finite-nonnegative:${metric}`, isMetric(value));
    }
  }

  for (const field of ['venue', 'device', 'quality', 'fontMode']) equal(`pair:${field}`, before[field], after[field]);
  equal('pair:audience-seed', before.fixture.audienceSeed, after.fixture.audienceSeed);
  equal('pair:collector-sha', before.fixture.collectorSha256, after.fixture.collectorSha256);
  equal('pair:proxy-sha', before.fixture.proxySha256, after.fixture.proxySha256);
  equal('pair:browser-helper-sha', before.fixture.browserHelperSha256, after.fixture.browserHelperSha256);
  equal('pair:font-css-sha', before.proxy.fontCssSha256, after.proxy.fontCssSha256);
  for (const field of ['browserVersion', 'platform', 'architecture', 'chromeArgs', 'softwareRequested', 'headless'])
    equal(`pair:environment:${field}`, before.environment[field], after.environment[field]);

  const stateFields = ['viewport', 'devicePixelRatio', 'rendererPixelRatio', 'renderer', 'quality', 'lite', 'sampleRate', 'sampleCount', 'samplePcmBytes', 'applausePcmBytes', 'applause', 'piece', 'pieceDuration', 'notes', 'audience', 'audienceFingerprint'];
  for (const name of ['cold', 'warm']) {
    const left = before.runs[name], right = after.runs[name];
    for (const field of stateFields) equal(`pair:${name}:${field}`, left.state[field], right.state[field]);
    report.observations[name] = {
      readyMs: change(left.readyMs, right.readyMs),
      bootLongTaskCount: change(left.bootLongTasks.count, right.bootLongTasks.count),
      bootLongTaskTotalMs: change(left.bootLongTasks.totalMs, right.bootLongTasks.totalMs),
      bootLongTaskMaxMs: change(left.bootLongTasks.maxMs, right.bootLongTasks.maxMs),
      sampleResponseEncodedBytes: change(left.summary.samples.responseEncodedBytes, right.summary.samples.responseEncodedBytes),
      controlledMainFixtureResponseEncodedBytes: change(left.summary.controlledMainFixture.responseEncodedBytes, right.summary.controlledMainFixture.responseEncodedBytes),
      audience: { before: left.state.audienceFingerprint, after: right.state.audienceFingerprint },
      mainFixture: { before: left.mainFixture, after: right.mainFixture },
    };
  }
  report.passed = report.checks.every(check => check.passed);
} catch (error) {
  report.error = { message: error.message, stack: error.stack };
}
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
const failedChecks = report.checks.filter(check => !check.passed).map(check => check.name);
console.log(JSON.stringify({ output, passed: report.passed, checks: report.checks.length, failedChecks, error: report.error?.message }));
if (!report.passed) process.exitCode = 1;
