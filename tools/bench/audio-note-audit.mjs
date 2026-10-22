// QA only. Self-contained so Playwright can serialize it into the page.
// The factory changes no clock, score, scheduling, arguments or return values.
export function installAudioNoteAuditFactory() {
  window.__createAudioNoteAudit = (engine, perf, onNote) => {
    const originals = { note: engine.playNote, schedule: perf._schedule, held: perf._resumeHeld };
    if (typeof originals.note !== 'function' || typeof originals.schedule !== 'function')
      throw new Error('The audio audit requires the original playNote and _schedule methods');
    const descriptors = { note: Object.getOwnPropertyDescriptor(engine, 'playNote'),
      schedule: Object.getOwnPropertyDescriptor(perf, '_schedule'), held: Object.getOwnPropertyDescriptor(perf, '_resumeHeld') };
    const limit = 1000;
    const audit = { version: 2, heldSupported: typeof originals.held === 'function',
      scheduleCalls: 0, schedulerRequests: 0, heldRequests: 0, otherRequests: 0,
      heldCalls: [], invocationMismatches: [], observerErrors: [], droppedRecords: 0 };
    let scope = null, stopped = false, heldCallCount = 0;
    const append = (list, entry) => { if (list.length < limit) list.push(entry); else audit.droppedRecords++; };
    const errorRecord = error => append(audit.observerErrors, { message: String(error?.message || error) });
    const sourceNote = index => {
      if (!Number.isInteger(index) || index < 0 || index >= perf.evCount) return null;
      const k = index * 5, track = perf.piece?.tracks[perf.ev[k]];
      return track ? { index, on: perf.ev[k + 1], dur: perf.ev[k + 2], midi: perf.ev[k + 3], vel: perf.ev[k + 4],
        section: track.section, inst: track.inst, gain: track.gain ?? 1, layer: track.layer ?? null } : null;
    };
    const heldSources = pos => {
      const result = [];
      if (pos <= 0.05 || !perf.ev) return result;
      // Derive the continuation contract from the score, independently of the
      // implementation's maxDur/search shortcut. Include every eligible tone.
      for (let index = 0; index < perf.schedIdx; index++) {
        const note = sourceNote(index);
        if (note && note.on < pos - 0.001 && note.on + note.dur >= pos + 0.25) result.push(note);
      }
      return result;
    };
    const mismatch = (list, field, actual, expected) => { if (actual !== expected) list.push({ field, actual, expected }); };

    perf._schedule = function () {
      const previous = scope;
      const call = scope = { kind: 'scheduler', startIndex: this.schedIdx, requests: 0, piece: this.piece };
      audit.scheduleCalls++;
      try { return originals.schedule.apply(this, arguments); }
      finally {
        if (call.piece && call.piece === this.piece && Number.isInteger(call.startIndex)
          && this.schedIdx - call.startIndex !== call.requests) append(audit.invocationMismatches, {
          kind: 'scheduler', startIndex: call.startIndex, endIndex: this.schedIdx,
          requests: call.requests, advancedEvents: this.schedIdx - call.startIndex,
        });
        scope = previous;
      }
    };
    if (audit.heldSupported) perf._resumeHeld = function (pos) {
      const previous = scope;
      const call = { kind: 'held', id: ++heldCallCount, pos, startCtx: this.startCtx, requests: 0, expected: [] };
      try { call.expected = heldSources(pos); } catch (error) { errorRecord(error); }
      scope = call;
      try { return originals.held.apply(this, arguments); }
      catch (error) { call.error = String(error?.message || error); throw error; }
      finally {
        append(audit.heldCalls, { id: call.id, pos, startCtx: call.startCtx,
          expectedIndices: call.expected.map(note => note.index), expectedRequests: call.expected.length,
          observedRequests: call.requests, missingIndices: call.expected.slice(call.requests).map(note => note.index),
          extraRequests: Math.max(0, call.requests - call.expected.length), error: call.error ?? null });
        scope = previous;
      }
    };
    engine.playNote = function (args) {
      const current = scope, origin = current?.kind || 'other';
      const ordinal = current ? current.requests++ : null;
      audit[origin === 'scheduler' ? 'schedulerRequests' : origin === 'held' ? 'heldRequests' : 'otherRequests']++;
      const expectedIndex = origin === 'scheduler' ? current.startIndex + ordinal : current?.expected[ordinal]?.index;
      const original = origin === 'other' ? null : sourceNote(expectedIndex);
      const expectedDur = original ? (origin === 'held' ? original.on + original.dur - current.pos : original.dur) : null;
      const expectedSkip = original && origin === 'held' ? current.pos - original.on : 0;
      const actual = [args.section, args.inst, args.midi, args.dur, args.gain ?? 1, args.layer ?? null];
      const expected = original ? [original.section, original.inst, original.midi, expectedDur, original.gain, original.layer] : null;
      const mismatches = [];
      if (origin !== 'other') {
        if (!original) mismatches.push({ field: 'scoreIndex', actual: expectedIndex ?? null, expected: 'an eligible original score event' });
        else {
          ['section', 'inst', 'midi', 'dur', 'gain', 'layer'].forEach((field, index) => mismatch(mismatches, field, actual[index], expected[index]));
          mismatch(mismatches, 'skip', args.skip ?? 0, expectedSkip);
          if (origin === 'held') {
            mismatch(mismatches, 'when', args.when, current.startCtx);
            mismatch(mismatches, 'vel', args.vel, original.vel);
          } else mismatch(mismatches, 'schedulerIndex', perf.schedIdx - 1, expectedIndex);
        }
      }
      const note = { origin, heldCallId: origin === 'held' ? current.id : null,
        performanceNowMs: performance.now(), audioNow: this.ctx.currentTime,
        pieceId: perf.piece?.id ?? null, when: args.when, leadMs: (args.when - this.ctx.currentTime) * 1000,
        scoreIndex: expectedIndex ?? null, schedulerIndex: perf.schedIdx - 1,
        startPos: perf.startPos, startCtx: perf.startCtx, playing: perf.playing,
        actual, expected, original, skip: args.skip ?? 0, expectedSkip, velocity: args.vel,
        expectedWhen: origin === 'held' ? current.startCtx : null,
        mismatches, scoreMatch: origin === 'other' ? null : original !== null && mismatches.length === 0 };
      const before = this.voices.size;
      try { return originals.note.apply(this, arguments); }
      catch (error) { note.error = String(error?.message || error); throw error; }
      finally {
        note.voiceCreated = this.voices.size > before;
        try { onNote(note); } catch (error) { errorRecord(error); }
      }
    };
    const restore = (object, name, descriptor) => {
      if (descriptor) Object.defineProperty(object, name, descriptor); else delete object[name];
    };
    return {
      snapshot: () => ({ ...audit, heldCallCount, recordLimit: limit }),
      stop() {
        if (stopped) return;
        stopped = true;
        restore(engine, 'playNote', descriptors.note);
        restore(perf, '_schedule', descriptors.schedule);
        if (audit.heldSupported) restore(perf, '_resumeHeld', descriptors.held);
      },
    };
  };
}

// Driver-side summary. Retain every raw note in the report; mismatches are
// counted by origin instead of dropping the newly supported held-note path.
export function summarizeAudioNoteAudit(notes, audit, hash) {
  const scheduled = notes.filter(note => note.origin === 'scheduler');
  const held = notes.filter(note => note.origin === 'held');
  const other = notes.filter(note => note.origin === 'other');
  const unknownMusic = other.filter(note => note.playing);
  const segments = new Map();
  for (const note of scheduled) {
    const key = `${note.pieceId}:${note.startPos}@${note.startCtx}`;
    if (!segments.has(key)) segments.set(key, []);
    segments.get(key).push(note);
  }
  const segmentSummary = [...segments].map(([key, rows]) => ({
    pieceAndStartPosAndContext: key, startPosAndContext: `${rows[0].startPos}@${rows[0].startCtx}`, count: rows.length,
    firstScoreIndex: rows[0].scoreIndex, lastScoreIndex: rows.at(-1).scoreIndex,
    consecutiveScoreIndices: rows.every((row, i) => i === 0 || row.scoreIndex === rows[i - 1].scoreIndex + 1),
    sequenceSha256: hash(JSON.stringify(rows.map(note => [note.scoreIndex, ...note.actual]))),
  }));
  const schedulerMismatches = scheduled.filter(note => note.scoreMatch !== true).length;
  const heldMismatches = held.filter(note => note.scoreMatch !== true).length;
  const heldCalls = audit?.heldCalls || [];
  const summary = {
    auditVersion: audit?.version ?? null, recordedRequests: notes.length,
    scheduledRequests: scheduled.length, heldRequests: held.length,
    otherRequests: other.length, otherRequestsWhilePlaying: unknownMusic.length,
    lateRequests: notes.filter(note => note.leadMs < 0).length,
    thrownErrors: notes.filter(note => note.error).length,
    requestedScoreOrderSha256: hash(JSON.stringify(scheduled.map(note => [note.scoreIndex, ...note.actual]))),
    schedulerScoreMismatches: schedulerMismatches, heldScoreMismatches: heldMismatches,
    scoreMismatches: schedulerMismatches + heldMismatches + unknownMusic.length,
    segments: segmentSummary,
    held: {
      supported: audit?.heldSupported ?? null, calls: audit?.heldCallCount ?? null,
      expectedRequests: heldCalls.reduce((sum, call) => sum + call.expectedRequests, 0),
      observedRequests: held.length,
      missingRequests: heldCalls.reduce((sum, call) => sum + call.missingIndices.length, 0),
      extraRequests: heldCalls.reduce((sum, call) => sum + call.extraRequests, 0),
      requestOrderSha256: hash(JSON.stringify(held.map(note => [note.scoreIndex, ...note.actual, note.skip, note.velocity]))),
      meaning: audit?.heldSupported ? 'Score continuations checked for original event, remaining duration, skip, velocity, start time and complete call cardinality.' : 'This product has no _resumeHeld method; held-note behavior was not exercised.',
    },
    rawEvidence: 'observation.notes contains each origin, original score event, actual/expected arguments and mismatch fields; observation.noteAudit contains held calls and invocation mismatches.',
  };
  const checks = {
    scheduledRequestsMatchScore: schedulerMismatches === 0,
    scheduledIndicesConsecutiveWithinTransportSegment: segmentSummary.every(segment => segment.consecutiveScoreIndices),
    scheduledInvocationCountsMatchScoreAdvance: !!audit && audit.invocationMismatches.length === 0,
    heldRequestsMatchScore: heldMismatches === 0,
    heldCallsComplete: !!audit && heldCalls.every(call => call.expectedRequests === call.observedRequests && !call.error),
    observedRequestCountsMatchAudit: !!audit && scheduled.length === audit.schedulerRequests
      && held.length === audit.heldRequests && other.length === audit.otherRequests,
    noUnattributedMusicRequests: unknownMusic.length === 0,
    noteAuditCompletedWithoutErrors: !!audit && audit.observerErrors.length === 0 && audit.droppedRecords === 0,
    noObservedNoteErrors: summary.thrownErrors === 0,
  };
  return { summary, checks };
}
