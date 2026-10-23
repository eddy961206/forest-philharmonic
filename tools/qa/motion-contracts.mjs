// Fail closed when live content grows beyond the adapters this harness knows.
// Both current venues use StageManager and hallplan's musician stage. Audience
// geometry/lighting is intentionally outside this numerical pose contract.
import { densestEntry } from './motion-catalog.mjs';
export const VENUE_STAGE_CONTRACTS = { hall: 'shared-hall-stage', sphere: 'shared-hall-stage' };

export function motionCoverage(catalog, players, venueStages = VENUE_STAGE_CONTRACTS) {
  const failures = [], cases = [], seen = new Map();
  const venues = [...new Set(catalog.flatMap(entry => entry.venues))];
  for (const venue of venues) if (venueStages[venue] !== 'shared-hall-stage') {
    failures.push({ kind: 'missing-venue-stage-adapter', venue,
      action: 'Add and exercise the venue stage adapter in motion-contracts.mjs and audit-playing-motion.mjs.' });
  }
  for (const entry of catalog) {
    if (entry.id !== entry.piece.id || !(entry.piece.duration > 0)) failures.push({ kind: 'invalid-score', song: entry.id });
    for (const track of entry.piece.tracks) {
      const section = players.filter(p => p.sid === track.section);
      if (!section.length) failures.push({ kind: 'missing-section-rig', song: entry.id, sid: track.section });
      for (const ci of track.chairs || []) if (!section.some(p => p.ci === ci)) failures.push({ kind: 'missing-chair', song: entry.id, sid: track.section, ci });
      if (track.notes.length % 4) failures.push({ kind: 'invalid-note-stride', song: entry.id, sid: track.section });
      for (let i = 0; i < track.notes.length; i += 4) {
        if (!track.notes.slice(i, i + 4).every(Number.isFinite) || track.notes[i] < 0 || track.notes[i + 1] < 0) {
          failures.push({ kind: 'invalid-note', song: entry.id, sid: track.section, index: i }); break;
        }
      }
    }
  }
  // Auto-generate one active recording window per actual chair. A new player
  // must either have a score to exercise it or fail with an actionable gap.
  for (const player of players) {
    const id = `${player.sid}-${player.ci}`;
    if (seen.has(id)) failures.push({ kind: 'duplicate-chair', sid: player.sid, ci: player.ci });
    seen.set(id, true);
    let best;
    for (const entry of catalog) {
      const times = entry.piece.tracks.filter(t => t.section === player.sid && (!t.chairs || t.chairs.includes(player.ci)))
        .flatMap(t => Array.from({ length: t.notes.length / 4 }, (_, i) => t.notes[i * 4]));
      const window = densestEntry(times, 8);
      if (window.count && (!best || window.count > best.noteCount)) best = {
        id, song: entry.id, venue: entry.venues[0], sid: player.sid, ci: player.ci,
        rig: player.rigKind, start: window.start, seconds: 8, noteCount: window.count,
      };
    }
    if (best) cases.push(best);
    else failures.push({ kind: 'unexercised-chair', sid: player.sid, ci: player.ci, rig: player.rigKind,
      action: 'Register a score with notes for this chair; do not silently drop the player from coverage.' });
  }
  return { venues: venues.map(id => ({ id, stage: venueStages[id] ?? null })), chairs: players.length, cases, failures };
}

const RULES = {
  'unreachable-contact': ['error', 'contactError', 'Adjust the grip, instrument placement or playing posture. Do not stretch bones.'],
  'bone-length': ['boneError', 'boneError', 'Preserve arm segment length in arm-ik.js.'],
  'pose-jump': ['step', 'continuousStep', 'Check seek reset, rest transitions and the elbow bend pole.'],
  'beater-head-intersection': ['clearance', null, 'Move the real grip/strike path clear of headVolumes. Keep the clearance threshold at 1.'],
  'beater-detached': ['gap', null, 'Parent the beater to the solved wrist and preserve handle contact.'],
  'elbow-limit': ['flex', null, 'Keep the solved elbow inside ARM_LIMITS.'],
  'unobserved-playing-chair': [null, null, 'Check the score chair assignment, note durations and sampled windows; this chair never played during the audit.'],
};
export function actionableFailures(audit) {
  const coverage = (audit.coverage?.failures || []).map(f => ({ ...f, reproduce: 'npm run verify:motion' }));
  const poses = [...(audit.rows || []), ...(audit.lifecycle ? [audit.lifecycle] : [])].flatMap(row => row.failures.map(f => {
    const [metric, limitKey, action] = Object.hasOwn(RULES, f.kind) ? RULES[f.kind] : [];
    const start = Math.max(0, f.windowStart ?? (f.time || 0) - .5);
    const record = row.id === 'stage-lifecycle'
      ? `npm run record:motion -- failure ${f.phase === 'exit' ? 'exit' : f.phase === 'enter' ? 'entry' : 'bow'}`
      : `npm run record:motion -- --song ${row.id} --venue ${row.venues[0]} --section ${f.sid} --chair ${f.ci ?? 0} --start ${start.toFixed(4)} --seconds 8 --label failure`;
    return { ...f, song: row.id, venues: row.venues, metric, value: metric ? f[metric] : undefined,
      limit: limitKey ? audit.limits[limitKey] : f.kind === 'beater-head-intersection' ? 1 : f.kind === 'beater-detached' ? .001 : undefined,
      action: action || 'Inspect the stage route or invalid pose in the named phase.',
      // Full seeded run reproduces history-dependent state. Browser preview is
      // a focused visual aid, not a promise to replay identical floating state.
      reproduce: 'npm run verify:motion', preview: record };
  }));
  return [...coverage, ...poses];
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.length > 0;
const isCount = value => Number.isSafeInteger(value) && value > 0;
const isFailures = value => Array.isArray(value) && value.every(f => isRecord(f) && isText(f.kind)
  && ['time', 'windowStart'].every(key => f[key] === undefined || Number.isFinite(f[key])));
function completeAudit(audit) {
  // Validate nested records before accessing them or formatting failure previews.
  // JSON may parse successfully while containing null rows or numeric strings.
  return isRecord(audit) && ['songs', 'cast', 'frames', 'armSamples'].every(key => isCount(audit[key]))
    && isRecord(audit.limits) && ['contactError', 'boneError', 'continuousStep'].every(key => Number.isFinite(audit.limits[key]) && audit.limits[key] > 0)
    && Array.isArray(audit.rows) && audit.rows.length === audit.songs
    && audit.rows.every(row => isRecord(row) && isText(row.id) && isCount(row.frames) && isFailures(row.failures)
      && Array.isArray(row.venues) && row.venues.length > 0 && row.venues.every(isText))
    && isRecord(audit.lifecycle) && audit.lifecycle.id === 'stage-lifecycle' && isCount(audit.lifecycle.frames) && isFailures(audit.lifecycle.failures)
    && isRecord(audit.coverage) && isFailures(audit.coverage.failures) && audit.coverage.chairs === audit.cast
    && Array.isArray(audit.coverage.cases) && audit.coverage.cases.every(isRecord)
    && Array.isArray(audit.coverage.venues) && audit.coverage.venues.every(venue => isRecord(venue) && isText(venue.id));
}

export function verificationSummary(audit, steps, inputs) {
  const complete = completeAudit(audit);
  const failures = complete ? actionableFailures(audit) : [];
  for (const step of steps) if (step.exitCode !== 0) failures.push({ kind: 'command-failed', command: step.command, exitCode: step.exitCode, log: step.log });
  if (!complete) failures.push({ kind: 'incomplete-audit-report', action: 'Read motion-audit.log. A missing, malformed or crashed audit never counts as a pass.' });
  return { schemaVersion: 1, createdAt: new Date().toISOString(), status: failures.length ? 'fail' : 'pass',
    inputs, steps, coverage: complete ? { songs: audit.songs, cast: audit.cast, rigs: audit.rigs, frames: audit.frames,
      armSamples: audit.armSamples, venues: audit.coverage?.venues, generatedRecordingCases: audit.coverage?.cases.length } : null,
    failures, scope: 'Sampled score windows and full stage lifecycle at synthetic 60 Hz; no GPU, audio, visual aesthetics or physical iPhone certification.' };
}
