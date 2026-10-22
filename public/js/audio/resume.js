// The sound back after the browser took it away. A phone takes the audio
// context from a page in the background (iOS Safari: 'interrupted'; or
// 'suspended') and does not always give it back, while the transport still
// "plays" on a clock that has stopped. Three things are kept apart: what
// the listener wants (the music on - not paused, not asleep), what the
// context is doing, and the page's own sleep. Coming back to the page, the
// context's own change, a touch or a key, the media keys: all ask for the
// one same resume. Nothing is restarted - the transport keeps its clock and
// what it had scheduled, the volume, the mute and the sleep timer stay as
// they are. If the browser wants a touch first, a button says so (blocked).

// Wanted? gesture: asked from a touch or a key, where a browser lets the
// sound back - fine whenever we are inside and awake (a paused transport
// stays paused: only the context runs again). Otherwise only while there
// is music meant to be heard: playing, or the show going on between pieces
export function wantsSound({ inside, asleep, playing, between }, gesture = false) {
  if (!inside || asleep) return false;
  return gesture || playing || between;
}

export class SoundRecovery {
  // ctx() -> the audio context (or none yet); wanted(gesture) -> see
  // wantsSound; asleep() -> the page's sleep, which keeps the sound off;
  // blocked(on): the "sound back" button; recovered(): running again after
  // it was lost (a guest gets in step with the host again)
  constructor({ ctx, wanted, asleep = () => false, blocked = () => {}, recovered = () => {}, wait = 800 }) {
    Object.assign(this, { ctx, wanted, asleep, blocked, recovered, wait });
    this.lost = false; // the sound was wanted and the context was not running
    this._pending = null; // the resume on its way (one, however many ask)
    this._askedAt = 0;
    this._timer = 0;
    this._shown = false;
  }

  // Ask for the sound back, if it is wanted and gone. One resume shared by
  // all who ask - except from a touch or a key (gesture), where it is asked
  // again inside the gesture: the one a browser waits for; and fresh (back
  // to the page): not the one asked for in the background
  check({ gesture = false, fresh = gesture } = {}) {
    const ctx = this.ctx();
    if (!ctx || ctx.state === 'closed') return Promise.resolve(false);
    if (ctx.state === 'running') { this._back(); return Promise.resolve(true); }
    if (!this.wanted(gesture)) {
      // (paused, asleep, not in yet: as it is - and no button that would bring no music)
      this._button(false);
      return Promise.resolve(false);
    }
    if (this.wanted(false)) this.lost = true;
    // (one on its way: shared - unless it has had its time without an answer)
    if (this._pending && !fresh && performance.now() - this._askedAt < this.wait) return this._pending;
    this._askedAt = performance.now();
    let call;
    try { call = Promise.resolve(ctx.resume()); } catch (e) { call = Promise.reject(e); }
    const p = call.then(() => true, () => false).then(() => {
      if (this._pending === p) this._pending = null;
      return this._settle();
    });
    this._pending = p;
    // a resume that gets no answer soon (it waits for a touch): the button
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      if (this._pending === p && this.ctx()?.state !== 'running' && this.wanted(false)) this._button(true);
    }, this.wait);
    return p;
  }

  // the context changed by itself: the browser took the sound away (asked
  // back at once - a phone may allow it with the screen off, after a call)
  // or gave it back
  changed() {
    const state = this.ctx()?.state;
    if (state === 'running') { this._back(); return; }
    if (state === 'closed') return;
    this.check();
  }

  // a resume has answered
  _settle() {
    const ctx = this.ctx();
    if (ctx?.state !== 'running') {
      if (this.wanted(false)) this._button(true);
      return false;
    }
    // (asleep since it was asked for: a late answer does not wake the sound)
    if (this.asleep()) {
      try { ctx.suspend(); } catch { /* fine */ }
      return false;
    }
    this._back();
    return true;
  }

  // running: the button away, and a guest back in step (once per loss)
  _back() {
    clearTimeout(this._timer);
    this._button(false);
    if (!this.lost) return;
    this.lost = false;
    this.recovered();
  }

  _button(on) {
    if (on === this._shown) return;
    this._shown = on;
    this.blocked(on);
  }
}
