// Choosing the piece to play. Fetching and preparing a score is one thing:
// asked for again while it is on the way, it is the same download (a guest
// told "B" every few seconds waits for one B, not for a new one each time),
// and a failure is not kept - the next ask tries again. Making it the
// transport's piece is another, and only the latest choice may do that.
// Every choice counts, going back to the piece already loaded too: a slow
// download of a piece nobody wants any more never replaces the one here.

export class PieceChooser {
  // fetch(id) -> the score; prepare(score) -> ready to play, touching nothing
  // (Performance.prepare); apply(prepared) -> the transport's piece now;
  // loaded() -> the transport's piece
  constructor({ fetch, prepare, apply, loaded }) {
    Object.assign(this, { _fetch: fetch, _prepare: prepare, _apply: apply, _loaded: loaded });
    this.gen = 0; // one more for each choice
    this.wanted = null; // the id of the latest choice while it is on the way
    this._pending = new Map(); // id -> the prepared score on its way
  }

  // the prepared score `id` (one download while it is on the way)
  prepare(id) {
    let p = this._pending.get(id);
    if (!p) {
      p = Promise.resolve(id).then(this._fetch).then(this._prepare);
      this._pending.set(id, p);
      // (settled: gone - a failure is asked for afresh. Only our own entry:
      // never a newer one for the same piece)
      const drop = () => { if (this._pending.get(id) === p) this._pending.delete(id); };
      p.then(drop, drop);
    }
    return p;
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
      prep = await this.prepare(id);
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
