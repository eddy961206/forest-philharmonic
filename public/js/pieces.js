// Choosing the piece to play. Fetching and preparing a score is one thing:
// asked for again while it is on the way, it is the same download (a guest
// told "B" every few seconds waits for one B, not for a new one each time),
// and a failure is not kept - the next ask tries again. Making it the
// transport's piece is another, and only the latest choice may do that.
// Every choice counts, going back to the piece already loaded too: a slow
// download of a piece nobody wants any more never replaces the one here.

// Playback and the next-piece roster share a download. Keep only a few raw
// scores: browsing a long programme must not retain every large score forever.
// Rejections are removed so a temporary lost connection never poisons a roster.
export class ScoreLibrary {
  constructor(fetch, limit = 4) {
    this.fetch = fetch;
    this.limit = Math.max(1, limit);
    this.ready = new Map();
    this.pending = new Map();
  }

  get(id) {
    if (this.ready.has(id)) {
      const score = this.ready.get(id);
      this.ready.delete(id);
      this.ready.set(id, score);
      return Promise.resolve(score);
    }
    if (this.pending.has(id)) return this.pending.get(id);
    const request = Promise.resolve().then(() => this.fetch(id)).then(score => {
      this.ready.set(id, score);
      while (this.ready.size > this.limit) this.ready.delete(this.ready.keys().next().value);
      return score;
    });
    this.pending.set(id, request);
    const drop = () => { if (this.pending.get(id) === request) this.pending.delete(id); };
    request.then(drop, drop);
    return request;
  }
}

export class PieceChooser {
  // fetch(id) -> the score; prepare(score) -> ready to play, touching nothing
  // (Performance.prepare); apply(prepared) -> the transport's piece now;
  // loaded() -> the transport's piece
  constructor({ fetch, prepare, apply, loaded }) {
    Object.assign(this, { _fetch: fetch, _prepare: prepare, _apply: apply, _loaded: loaded });
    this.gen = 0; // one more for each choice
    this.wanted = null; // the id of the latest choice while it is on the way
    this._pending = new Map(); // id -> shared preparation request
  }

  // An explicit preload remains useful even when playback chooses another id.
  prepare(id) {
    return this._preparing(id, true);
  }

  _preparing(id, independent = false) {
    let request = this._pending.get(id);
    if (!request) {
      request = { independent, promise: null };
      const drop = () => { if (this._pending.get(id) === request) this._pending.delete(id); };
      request.promise = Promise.resolve(id).then(this._fetch).then(score => {
        // Check before the expensive score sort/dynamics analysis. Compare the
        // wanted id, not the first caller's generation: a later same-id choice
        // still owns this shared request. Explicit preloads are never cancelled.
        if (!request.independent && this.wanted !== id) {
          drop(); // a newly chosen id must not join an already discarded result
          return null;
        }
        return this._prepare(score);
      });
      this._pending.set(id, request);
      request.promise.then(drop, drop);
    } else if (independent) {
      request.independent = true;
    }
    return request.promise;
  }

  // Choose `id`: the piece once it is the transport's, or null if another
  // choice came meanwhile (it then changes nothing). Rejects when it could
  // not be loaded - only while it is still the latest choice: an old
  // failure never undoes a newer one.
  async choose(id) {
    const gen = ++this.gen;
    const here = this._loaded();
    if (here?.id === id) { this.wanted = null; return here; }
    this.wanted = id;
    let prep;
    try {
      prep = await this._preparing(id);
    } catch (e) {
      if (gen !== this.gen) return null;
      this.wanted = null;
      throw e;
    }
    if (gen !== this.gen) return null;
    this.wanted = null;
    return this._apply(prep);
  }

  // whether piece `id` is chosen and still on its way
  loading(id) {
    return this.wanted !== null && this.wanted === id;
  }
}

// What the room is told about the transport: a piece's number always with
// its own time and phase. While the piece chosen is still on its way the
// one loaded (the piece before) is not it: the new one, at its start, not
// playing yet - never its number with the time of the one before.
export function transportState({ chosen, loaded, phase, playing, time }) {
  if (chosen && loaded?.id === chosen.id) return { phase, playing, pos: time };
  return { phase: phase === 'playing' ? 'changing' : phase, playing: false, pos: 0, loading: true };
}
