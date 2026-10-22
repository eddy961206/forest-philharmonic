// Watching together, a guest's side of the music: the host's playback
// ({ i, playing, pos, at } on the room's clock - from a play/pause command
// or from a snapshot) made ours, and the end of the host's piece made ours
// too, by the one way for both: a host that has moved to the end of the
// piece, or is past it already (the bows, the gap), never leaves a guest
// playing on from where it was.

export const START_AHEAD = 0.12; // starting takes a moment: start a little ahead
export const END_MARGIN = 0.2; // the host this close to its piece's end, playing: it is over
// the host's phases after its piece has ended
export const BETWEEN = new Set(['afterglow', 'applause', 'intermission']);

// where the host is in its piece now
export const hostTime = (s, now) => s.pos + Math.max(0, now - s.at);

export class Follower {
  // perf: the transport. ensurePiece(i): true once piece i is ours (see
  // pieces.js). now(): the room's clock. stage(piece, s): the stage and the
  // lights as the host has them. started(piece): the music has just
  // started here. playing(on): the play button
  constructor({ perf, ensurePiece, now, stage = () => {}, started = () => {}, playing = () => {} }) {
    Object.assign(this, { perf, ensurePiece, now, stage, started, playing });
    this.tok = 0;
  }

  // what is on its way is out of date (the interval, the evening's end)
  cancel() {
    this.tok++;
  }

  // The host's playback, ours: true once in step. 'over': the host's piece
  // has ended by now - nothing is set up for it, the caller decides (in
  // late: between pieces; in step: end()). false: overtaken by a newer one.
  async apply(s) {
    const tok = ++this.tok;
    if (!(await this.ensurePiece(s.i)) || tok !== this.tok) return false;
    const perf = this.perf;
    const want = hostTime(s, this.now());
    // (paused near the end is paused: only the host playing there is the end)
    if (s.playing && want >= perf.duration - END_MARGIN) return 'over';
    this.stage(perf.piece, s);
    if (s.playing) {
      // what the host hears right now; a little ahead, since starting takes a moment
      if (!perf.playing) {
        perf.seek(want + START_AHEAD);
        perf.play();
        this.started(perf.piece);
      } else if (Math.abs(perf.time - want) > 0.35) {
        perf.seek(want + START_AHEAD);
      }
    } else {
      if (perf.playing) perf.pause();
      if (Math.abs(perf.pos - s.pos) > 0.05) perf.seek(s.pos);
    }
    this.playing(!!s.playing);
    return true;
  }

  // The host's piece has ended: so has ours - stopped, the applause and the
  // bows of perf.onEnd, once for this run of the piece (Performance.finish).
  // Never the next piece: that is the host's to start.
  end() {
    this.tok++;
    return this.perf.finish();
  }

  // a guest in step: a play/pause command and a snapshot in the playing
  // phase come the same way, the end of the piece with them
  async playback(s) {
    const r = await this.apply(s);
    if (r === 'over') this.end();
    return r;
  }

  // A snapshot between pieces - the host's piece over - while our run of
  // that piece still plays here: it ends here too. here: { index (our
  // piece's number), ceremony (a walk-on of ours under way: not a piece
  // playing on) }
  between(s, here) {
    if (!BETWEEN.has(s.phase) || s.loading || s.i !== here.index || here.ceremony || !this.perf.playing) return false;
    return this.end();
  }
}
