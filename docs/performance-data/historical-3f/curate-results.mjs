// Final evidence packaging only. This never launches a benchmark or decodes an image.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { isDeepStrictEqual, promisify } from 'node:util';
import assert from 'node:assert/strict';

const self = fileURLToPath(import.meta.url);
const options = {};
const allowed = new Set(['qa-root', 'workspace-root', 'repo-root', 'tools-root', 'provenance-root', 'runtime-root', 'output']);
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--help') {
    console.log('node qa-3f/curate-results.mjs [--qa-root DIR] [--workspace-root DIR] [--repo-root DIR] [--tools-root DIR] [--provenance-root DIR] [--runtime-root DIR] [--output DIR]\n최종 측정이 끝난 뒤 실행해. 기본 qa-root는 이 스크립트 폴더, workspace-root는 그 부모, repo-root는 workspace/forest-integration-3f야. 제품을 원래 checkout으로 옮겼으면 --repo-root로 지정해. tools-root는 compare.mjs 등이 있는 bench 폴더이며 기본 workspace/forest-philharmonic/tools/bench야. provenance-root는 기존 provenance 폴더(있을 때), runtime-root는 /tmp/forest-qa-runtime, output은 repo/docs/performance-data/latest-3f야.\n기존 비어 있지 않은 출력 폴더는 수정하지 않아. 원본을 bytecopy하고 SHA-256을 대조해. 실패·미실행·JSON 파싱 실패도 보존하고, STOP은 제외해. 제품 파일·초기 manifest·이미지는 수정하지 않아. 제품/도구 root와 최종 해시는 별도로 기록해.');
    process.exit(0);
  }
  assert.ok(arg.startsWith('--') && allowed.has(arg.slice(2)), `알 수 없는 인자: ${arg}`);
  assert.ok(process.argv[i + 1] && !process.argv[i + 1].startsWith('--'), `${arg} 경로가 필요해.`);
  assert.ok(options[arg.slice(2)] === undefined, `중복 인자: ${arg}`);
  options[arg.slice(2)] = process.argv[++i];
}
const qaRoot = path.resolve(options['qa-root'] || path.dirname(self));
const workspaceRoot = path.resolve(options['workspace-root'] || path.join(qaRoot, '..'));
const repoRoot = path.resolve(options['repo-root'] || path.join(workspaceRoot, 'forest-integration-3f'));
const toolsRoot = path.resolve(options['tools-root'] || path.join(workspaceRoot, 'forest-philharmonic/tools/bench'));
const provenanceRoot = path.resolve(options['provenance-root'] || path.join(workspaceRoot, 'forest-philharmonic/docs/performance-data/provenance'));
const runtimeRoot = path.resolve(options['runtime-root'] || '/tmp/forest-qa-runtime');
const outputRoot = path.resolve(options.output || path.join(repoRoot, 'docs/performance-data/latest-3f'));
const runFile = promisify(execFile);
const slash = value => value.split(path.sep).join('/');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};
assert.ok(!inside(qaRoot, outputRoot) && !inside(outputRoot, qaRoot), 'qa 원본과 출력 폴더가 겹치면 안 돼.');
assert.ok(!inside(outputRoot, repoRoot) && !inside(outputRoot, runtimeRoot), '출력 폴더가 소스 루트를 포함하면 안 돼.');
assert.ok(!inside(toolsRoot, outputRoot) && !inside(outputRoot, toolsRoot), '도구 원본과 출력 폴더가 겹치면 안 돼.');
assert.ok(!inside(provenanceRoot, outputRoot) && !inside(outputRoot, provenanceRoot), 'provenance 원본과 출력 폴더가 겹치면 안 돼.');
const existing = await fs.readdir(outputRoot).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
assert.equal(existing.length, 0, '출력 폴더가 비어 있지 않아. 기존 증거를 덮어쓰지 말고 새 --output을 지정해.');

const omitted = [], missingOptional = [], queue = [], destinations = new Set();
async function walk(root, relative = '', origin = 'source') {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = path.join(relative, entry.name);
    if (entry.name === 'STOP') { omitted.push({ root: origin, path: slash(rel), reason: 'queue control file' }); continue; }
    if (entry.name.startsWith('.') || ['node_modules', '__pycache__'].includes(entry.name)) continue;
    assert.ok(!entry.isSymbolicLink(), `심볼릭 링크는 자동 복사하지 않아: ${origin}/${slash(rel)}`);
    if (entry.isDirectory()) files.push(...await walk(root, rel, origin));
    else if (entry.isFile()) files.push(rel);
    else throw new Error(`일반 파일이 아니야: ${origin}/${slash(rel)}`);
  }
  return files;
}
function enqueue(root, relative, target, origin, purpose) {
  const normalized = slash(target);
  assert.ok(inside(outputRoot, path.resolve(outputRoot, target)), `출력 경로 이탈: ${normalized}`);
  assert.ok(!destinations.has(normalized), `출력 경로 중복: ${normalized}`);
  destinations.add(normalized);
  queue.push({ absolute: path.join(root, relative), source: { root: origin, path: slash(relative) }, target: normalized, purpose });
}
async function optionalFile(root, relative, target, origin, purpose) {
  try {
    const stat = await fs.lstat(path.join(root, relative));
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `일반 파일이 아니야: ${origin}/${slash(relative)}`);
    enqueue(root, relative, target, origin, purpose);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    missingOptional.push({ root: origin, path: slash(relative) });
    return false;
  }
}

// Audit only the requested package manifests; do not copy npm credentials or node_modules.
function packageAudit(bytes, name) {
  const data = JSON.parse(bytes.toString('utf8'));
  const findings = [];
  let checkedUrls = 0;
  const secretKeys = new Set(['auth', 'authtoken', 'token', 'password', 'passwd', 'secret', 'credential', 'credentials', 'apikey', 'privatekey', 'accesstoken', 'refreshtoken']);
  function visit(value, parts = []) {
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (secretKeys.has(key.replace(/[-_]/g, '').toLowerCase())) findings.push({ path: [...parts, key].join('.'), reason: 'credential key' });
        visit(item, [...parts, key]);
      }
    } else if (typeof value === 'string') {
      if (value.includes('-----BEGIN ') && value.includes('PRIVATE KEY-----')) findings.push({ path: parts.join('.'), reason: 'private key' });
      if (/(?:ghp_|gho_|github_pat_|AKIA|ASIA)[A-Za-z0-9_]{12,}/.test(value)) findings.push({ path: parts.join('.'), reason: 'credential pattern' });
      if (/^https?:\/\//i.test(value)) {
        checkedUrls++;
        const url = new URL(value);
        if (url.username || url.password || [...url.searchParams.keys()].some(key => /token|key|secret|auth|credential|password/i.test(key)))
          findings.push({ path: parts.join('.'), reason: 'credential URL' });
      }
    }
  }
  visit(data);
  assert.equal(findings.length, 0, `${name}: 비밀 값으로 의심되는 항목이 있어. 원본을 바꾸지 말고 별도로 검토해: ${JSON.stringify(findings)}`);
  return { file: name, sha256: hash(bytes), bytes: bytes.length, checkedUrls, credentialFindings: findings, note: 'package JSON의 키·토큰 패턴·URL 사용자 정보/인증 query를 확인했어. npmrc·환경변수·node_modules는 복사하지 않아.' };
}
const dependencyAudit = [];
for (const name of ['package.json', 'package-lock.json']) {
  dependencyAudit.push(packageAudit(await fs.readFile(path.join(runtimeRoot, name)), name));
  enqueue(runtimeRoot, name, `runtime/${name}`, 'runtime', 'exact development dependency manifest');
}

for (const relative of await walk(qaRoot, '', 'qa-3f')) enqueue(qaRoot, relative, path.join('qa-3f', relative), 'qa-3f', 'original 3f evidence, including failures and unexecuted plans');
enqueue(path.dirname(self), path.basename(self), 'curation/curate-results.mjs', 'curation', 'exact curator that produced this archive');
enqueue(workspaceRoot, 'qa-v2/run-portable.mjs', 'qa-v2/run-portable.mjs', 'workspace', 'original container-specific launcher');
const environmentRecords = [];
for (const relative of ['qa/environment.json', 'qa/environment-info.json', 'qa/info.json', 'qa-v2/environment.json', 'qa-v2/environment-info.json', 'qa-v2/info.json', 'qa-v2/evidence-manifest.json']) {
  const target = `initial-environment/${relative}`;
  if (await optionalFile(workspaceRoot, relative, target, 'workspace', 'historical initial environment information; not a 3f performance result'))
    environmentRecords.push({ source: relative, target, scope: '최초 환경/이력 원본이야. ec5 등 이전 기준의 결과·소스 해시를 3f 측정으로 해석하지 마.' });
}
for (const relative of await walk(toolsRoot, '', 'benchmark-tools'))
  enqueue(toolsRoot, relative, path.join('repository/tools/bench', relative), 'benchmark-tools', 'tool source from separately configured bench directory at final curation');
try {
  for (const relative of await walk(provenanceRoot, '', 'historical-provenance'))
    enqueue(provenanceRoot, relative, path.join('historical-provenance', relative), 'historical-provenance', 'earlier collector corrections; not proof of the 3f measurement source');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  missingOptional.push({ root: 'historical-provenance', path: '.' });
}

// The initial manifest stays byte-for-byte intact. New final hashes are a separate file.
const initialBytes = await fs.readFile(path.join(qaRoot, 'source-manifest.json'));
const initial = JSON.parse(initialBytes.toString('utf8'));
assert.ok(Array.isArray(initial.files) && initial.files.length > 0, '초기 source manifest의 파일 목록이 없어.');
const initialFiles = new Map((initial.files || []).map(record => [record.file, record]));
assert.equal(initialFiles.size, initial.files.length, '초기 source manifest의 파일 경로가 중복됐어.');
assert.equal(initial.baseline, '3f1655b0c035a630adbcfbf19582dd9363386f34', '초기 source manifest의 기준이 3f가 아니야.');
const codeExtensions = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.glsl', '.py', '.ts', '.tsx', '.jsx', '.yml', '.yaml', '.toml']);
const finalFiles = [];
for (const [directory, group] of [['public', 'product'], ['server', 'product'], ['tests', 'test']]) {
  for (const relative of await walk(path.join(repoRoot, directory), '', 'repository')) {
    if (!codeExtensions.has(path.extname(relative))) continue;
    finalFiles.push({ file: slash(path.join(directory, relative)), group, source: { root: 'product-repository', path: slash(path.join(directory, relative)) } });
  }
}
for (const relative of await walk(toolsRoot, '', 'benchmark-tools')) {
  if (!codeExtensions.has(path.extname(relative))) continue;
  finalFiles.push({ file: slash(path.join('tools/bench', relative)), group: 'tool', source: { root: 'benchmark-tools', path: slash(relative) } });
}
for (const file of ['package.json', 'package-lock.json', 'server.js']) {
  try { await fs.access(path.join(repoRoot, file)); finalFiles.push({ file, group: 'product', source: { root: 'product-repository', path: file } }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
let repositoryState;
try {
  const head = await runFile('git', ['-C', repoRoot, 'rev-parse', 'HEAD']);
  const branch = await runFile('git', ['-C', repoRoot, 'branch', '--show-current']);
  const status = await runFile('git', ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=normal', '--', 'public', 'server', 'tests', 'server.js', 'package.json', 'package-lock.json']);
  assert.match(head.stdout.trim(), /^[a-f0-9]{40}$/, '제품 checkout HEAD를 확인하지 못했어.');
  repositoryState = { head: head.stdout.trim(), branch: branch.stdout.trim(), scopedWorkingTreeStatus: status.stdout.trim().split('\n').filter(Boolean), note: 'HEAD와 working tree는 구분해. 아래 SHA-256은 이 시점의 실제 파일 바이트야.' };
} catch (error) { repositoryState = { unavailable: error.message }; }

await fs.mkdir(outputRoot, { recursive: true });
const copied = [], parsed = new Map();
for (const item of queue.sort((a, b) => a.target.localeCompare(b.target))) {
  const before = await fs.readFile(item.absolute);
  const destination = path.join(outputRoot, item.target);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(item.absolute, destination, constants.COPYFILE_EXCL);
  const [after, target] = await Promise.all([fs.readFile(item.absolute), fs.readFile(destination)]);
  const sourceSha256 = hash(before), afterSha256 = hash(after), targetSha256 = hash(target);
  assert.equal(sourceSha256, afterSha256, `복사 도중 원본이 바뀌었어: ${item.source.root}/${item.source.path}`);
  assert.equal(sourceSha256, targetSha256, `복사 SHA-256 불일치: ${item.target}`);
  assert.equal(before.length, target.length, `복사 크기 불일치: ${item.target}`);
  copied.push({ source: item.source, target: item.target, purpose: item.purpose, sourceSha256, targetSha256, sourceBytes: before.length, targetBytes: target.length });
  if (path.extname(item.target) === '.json') {
    try { parsed.set(item.target, { value: JSON.parse(target.toString('utf8')) }); }
    catch (error) { parsed.set(item.target, { parseError: error.message }); }
  }
}
const copiedInitial = copied.find(record => record.target === 'qa-3f/source-manifest.json');
assert.equal(copiedInitial?.sourceSha256, hash(initialBytes), '초기 source manifest가 수집 중 바뀌었어.');
for (const audited of dependencyAudit) {
  const archived = copied.find(record => record.target === `runtime/${audited.file}`);
  assert.equal(archived?.sourceSha256, audited.sha256, `검사한 런타임 package가 복사 전에 바뀌었어: ${audited.file}`);
}
for (const record of finalFiles.sort((a, b) => a.file.localeCompare(b.file))) {
  const sourceRoot = record.source.root === 'benchmark-tools' ? toolsRoot : repoRoot;
  const bytes = await fs.readFile(path.join(sourceRoot, record.source.path));
  Object.assign(record, { bytes: bytes.length, sha256: hash(bytes), initialCandidateSha256: initialFiles.get(record.file)?.candidateSha256 || null });
  record.changedSinceInitial = record.initialCandidateSha256 === null ? null : record.sha256 !== record.initialCandidateSha256;
  const archived = copied.find(item => item.target === `repository/${record.file}`);
  if (archived) assert.equal(record.sha256, archived.sourceSha256, `도구가 수집 중 바뀌었어: ${record.file}`);
}
// Check again after the whole copy: a raw file copied early must not have
// changed while later files were being preserved. No image is decoded here.
for (const item of copied) {
  const queued = queue.find(entry => entry.target === item.target);
  const bytes = await fs.readFile(queued.absolute);
  assert.equal(bytes.length, item.sourceBytes, `수집 중 원본 크기가 바뀌었어: ${item.source.path}`);
  assert.equal(hash(bytes), item.sourceSha256, `수집 중 원본이 바뀌었어: ${item.source.path}`);
}

const add = (counts, key) => { counts[key] = (counts[key] || 0) + 1; };
const statusInventory = { documentStatusCounts: {}, nestedStatusOccurrenceCounts: {}, parseFailures: [], documents: [], note: 'status 필드의 기록 빈도야. 같은 실행이 원본·재검증·summary에 중복될 수 있어서 실행 개수나 성공률이 아니야. 실패/진행 중 상태를 바꾸지 않아.' };
function countStatus(value, counts) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.status === 'string') add(counts, value.status.toUpperCase());
  for (const child of Object.values(value)) if (child && typeof child === 'object') countStatus(child, counts);
}
for (const [target, document] of parsed) {
  if (!target.startsWith('qa-3f/')) continue;
  if (document.parseError) { statusInventory.parseFailures.push({ file: target, error: document.parseError, originalBytesPreserved: true }); continue; }
  const topLevelStatus = typeof document.value?.status === 'string' ? document.value.status : null;
  add(statusInventory.documentStatusCounts, topLevelStatus?.toUpperCase() || 'NO_TOP_LEVEL_STATUS');
  const nestedStatusOccurrences = {};
  countStatus(document.value, nestedStatusOccurrences);
  for (const [status, count] of Object.entries(nestedStatusOccurrences)) statusInventory.nestedStatusOccurrenceCounts[status] = (statusInventory.nestedStatusOccurrenceCounts[status] || 0) + count;
  statusInventory.documents.push({ file: target, topLevelStatus, nestedStatusOccurrences });
}
const planInventory = [];
for (const [file, document] of parsed) {
  if (!file.startsWith('qa-3f/') || !file.endsWith('-plan.json') || !Array.isArray(document.value)) continue;
  const prefix = path.basename(file).replace(/-plan\.json$/, '-status-');
  const statusFiles = [...parsed.entries()].filter(([name, data]) => path.dirname(name) === path.dirname(file) && path.basename(name).startsWith(prefix) && name.endsWith('.json') && Array.isArray(data.value));
  const jobs = document.value.map((job, index) => {
    const attempts = [];
    for (const [statusFile, data] of statusFiles) for (const entry of data.value) {
      if (entry.i !== index) continue;
      attempts.push({ statusFile, matchesCurrentPlan: isDeepStrictEqual(entry.job, job), code: entry.code ?? null, startedAt: entry.startedAt ?? null, finishedAt: entry.finishedAt ?? null });
    }
    const matching = attempts.filter(attempt => attempt.matchesCurrentPlan);
    return { index, script: job.script, args: job.args, recordedState: matching.length ? 'RECORDED_ATTEMPTS' : 'NO_MATCHING_RECORDED_ATTEMPT', exitZeroAttempts: matching.filter(attempt => attempt.code === 0).length, nonzeroExitAttempts: matching.filter(attempt => Number.isInteger(attempt.code) && attempt.code !== 0).length, attempts };
  });
  planInventory.push({ file, statusFiles: statusFiles.map(([name]) => name), plannedJobs: jobs.length, jobsWithNoMatchingRecordedAttempt: jobs.filter(job => job.recordedState === 'NO_MATCHING_RECORDED_ATTEMPT').length, jobs });
}

const createdAt = new Date().toISOString();
const generated = [];
async function generate(relative, body, purpose) {
  assert.ok(!destinations.has(relative), `생성 파일과 원본 경로 충돌: ${relative}`);
  await fs.writeFile(path.join(outputRoot, relative), body, { flag: 'wx' });
  const bytes = await fs.readFile(path.join(outputRoot, relative));
  const record = { file: relative, sha256: hash(bytes), bytes: bytes.length, purpose };
  generated.push(record);
  return record;
}
const sourceSnapshot = {
  schema: 1, createdAt, baseline: initial.baseline, repositoryState,
  sourceRoots: { product: 'repo-root', tools: 'tools-root (separately configured bench directory)', history: 'provenance-root' },
  initialSnapshot: { file: 'qa-3f/source-manifest.json', sha256: copiedInitial.sourceSha256, bytes: copiedInitial.sourceBytes, policy: '초기 스냅샷을 수정하지 않고 별도 파일에 최종 바이트 해시를 기록했어.' },
  scope: ['repo-root/public의 JS/JSON/HTML/CSS 등 코드 파일(벤더 코드 포함)', 'repo-root/server', 'tools-root의 benchmark 도구', 'repo-root/tests', 'package.json', 'package-lock.json(있을 때)', 'server.js'],
  limitation: '수집 시점의 working tree 해시야. 모든 이전 raw가 이 최종 도구 버전으로 실행됐다는 뜻은 아니야. 각 raw의 sourceHashes/fixtureSourceSha256과 보존한 교정 provenance를 함께 봐. 바이너리 제품 assets는 이 코드 manifest 범위에서 제외돼.',
  files: finalFiles,
};
await generate('final-source-manifest.json', json(sourceSnapshot), 'current product/tool/test source hashes; separate from initial immutable snapshot');
await generate('status-inventory.json', json({ createdAt, statusInventory, planInventory, note: '기록된 실패와 계획을 그대로 보존했어. NO_MATCHING_RECORDED_ATTEMPT는 일치하는 종료 기록을 못 찾았다는 뜻이며 실행 여부 자체를 추정하지 않아.' }), 'raw statuses and recorded/unrecorded plan attempts');
await generate('README.md', [
  '# 3f 측정 원본과 수집 이력', '',
  `기준 커밋은 ${initial.baseline}이야. 수집 시각은 ${createdAt}이고, 이 폴더는 새 3f 기준과 통합 후보의 원본 복사본이야. 이전 a41/ec5 측정은 별도 이력으로 유지하고 이 결과와 합쳐 해석하지 않아.`, '',
  '## 경로와 범위', '',
  '- `qa-3f/`: 원래 qa-3f 상대 경로를 유지한 JSON·PNG·로그·계획·runner·집계기야. 실패·재검증·미실행 계획도 보존했어. STOP 제어 파일은 제외하고 소스관리·의존성·캐시 디렉터리는 수집 범위 밖에 뒀어.',
  '- `qa-v2/run-portable.mjs`: 실제 수집에 사용한 환경 전용 런처야. 원본의 절대 경로와 플래그를 바꾸지 않았어.',
  '- `runtime/`: 실제 개발 런타임의 package.json과 package-lock.json 원본이야. 비밀 값 패턴과 인증 URL을 검사했고 npmrc·환경변수·node_modules는 포함하지 않았어.',
  '- `repository/tools/bench/`: 별도 --tools-root에서 가져온 최종 시점의 도구 소스야. 제품 worktree에 이 폴더가 없어도 수집할 수 있어. 실제 PC 재현은 저장소의 docs/reproduce-on-pc.md를 따라 경로·브라우저 조건을 지정해.',
  '- `historical-provenance/`: --provenance-root에서 가져온 이전 수집기와 수정 사유야. a41/ec5 이력이 들어 있어도 최신 3f의 실행 소스라는 뜻은 아니야.',
  '- `initial-environment/`: 발견한 최초 환경 정보의 원본이야. 이전 ec5 결과·소스 해시가 들어 있어도 3f 성능 결과로 해석하지 마.',
  '- `curation/curate-results.mjs`: 이 복사본을 만든 코드 자체야. 다른 PC에서는 --qa-root, --workspace-root, --repo-root, --tools-root, --provenance-root, --runtime-root, --output을 지정할 수 있어.', '',
  '## 무결성과 결과 해석', '',
  '`manifest.json`은 복사한 파일별 source/target SHA-256과 byte 수를 기록해. `checksums.sha256`은 복사본과 생성된 manifest·설명의 해시야. PNG는 디코딩·크기 변경·인코딩하지 않았어.', '',
  '초기 `qa-3f/source-manifest.json`은 바이트를 그대로 보존했어. `final-source-manifest.json`은 --repo-root 제품과 --tools-root 도구를 각각 읽은 최종 스냅샷이야. 통합 worktree에서 제품을 원래 checkout으로 옮겼다면 --repo-root를 명시해야 해. 최종 해시가 모든 이전 실행에 소급 적용되는 것은 아니야.', '',
  '`status-inventory.json`에서 PASS/FAIL/ERROR/RUNNING과 기록 없는 계획을 함께 봐. 복사 무결성 PASS는 기능·성능 측정 PASS가 아니야. 같은 실행의 원본·재검증·summary가 중복될 수 있어서 status 빈도를 실행 개수나 성공률로 해석하면 안 돼.', '',
  '실패 파일이나 파싱되지 않는 JSON도 삭제하거나 성공으로 바꾸지 않았어. 원본 byte를 유지하고 별도로 표시했어. 계획 파일에 있는데 종료 기록이 없으면 미실행으로 단정하지 않고 기록 없음으로 남겨.', '',
  '이 스크립트는 벤치마크를 실행하지 않아. 기존 비어 있지 않은 대상은 덮어쓰지 않으므로 다시 큐레이션할 때는 새 출력 폴더를 써.', '',
].join('\n'), 'scope and reproduction notes');
const manifest = {
  schema: 1, createdAt, baseline: initial.baseline, copyIntegrity: 'PASS',
  benchmarkResult: '별도 raw/status-inventory를 확인해. 복사 성공을 측정 성공으로 바꾸지 않아.',
  sources: { 'qa-3f': 'qa-root', workspace: 'workspace-root', 'product-repository': 'repo-root', 'benchmark-tools': 'tools-root', 'historical-provenance': 'provenance-root', runtime: 'runtime-root', curation: 'executed curator directory' },
  copiedFileCount: copied.length, copiedBytes: copied.reduce((sum, record) => sum + record.targetBytes, 0),
  dependencyAudit, environmentRecords, omitted, missingOptional,
  files: copied, generatedFiles: [...generated],
};
await generate('manifest.json', json(manifest), 'copy integrity and source/target mapping');
const checksums = [...copied.map(record => ({ file: record.target, sha256: record.targetSha256 })), ...generated]
  .sort((a, b) => a.file.localeCompare(b.file)).map(record => `${record.sha256}  ${record.file}`).join('\n') + '\n';
await fs.writeFile(path.join(outputRoot, 'checksums.sha256'), checksums, { flag: 'wx' });
console.log(JSON.stringify({ copyIntegrity: 'PASS', copiedFiles: copied.length, generatedFiles: generated.length + 1, copiedBytes: manifest.copiedBytes, statusCounts: statusInventory.documentStatusCounts, jsonParseFailures: statusInventory.parseFailures.length, plannedJobs: planInventory.reduce((sum, plan) => sum + plan.plannedJobs, 0), jobsWithNoMatchingRecordedAttempt: planInventory.reduce((sum, plan) => sum + plan.jobsWithNoMatchingRecordedAttempt, 0) }));
