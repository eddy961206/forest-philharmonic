// Automatic quality uses real frame intervals, independently of the clamped
// animation clock. Manual presets never call this controller.
const LEVELS = ['low', 'medium', 'high'];
const round = (v) => Math.round(v * 100) / 100;

export class AdaptiveQuality {
  constructor({ quality = 'high', scale = 1, minQuality = 'low', maxQuality = 'high', pixelRatios = {}, nowMs = 0 } = {}) {
    this.minLevel = LEVELS.indexOf(minQuality);
    this.maxLevel = LEVELS.indexOf(maxQuality);
    this.pixelRatios = pixelRatios;
    this.reset(quality, scale, nowMs);
  }

  reset(quality = this.quality, scale = 1, nowMs = 0) {
    this.quality = quality;
    this.scale = scale;
    this.samples = [];
    this.clock = nowMs;
    this.raisedAt = -Infinity;
    this.raiseBlocked = false;
    this.holdUntil = nowMs;
    this.cooldown = 0;
    this.hold(6000); // ignore entry, resume and shader warm-up
  }

  // A ceremony, visibility change or shader rebuild is not a new device.
  // Discard transient samples without forgetting an unsuccessful recovery.
  hold(ms = 3500, nowMs = this.clock) {
    this.clock = Math.max(this.clock, nowMs);
    this.samples.length = 0;
    this.elapsed = 0;
    this.slow = 0;
    this.fast = 0;
    this.holdUntil = Math.max(this.holdUntil, this.clock + ms);
    this.cooldown = this.holdUntil - this.clock;
  }

  // Returns only a change. A single hitch cannot trigger a downgrade, and
  // sustained spare capacity is required before attempting a recovery.
  sample(frameMs, { allowPresetChange = true, allowRecovery = true, nowMs } = {}) {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return null;
    const wasHeld = this.clock < this.holdUntil;
    this.clock = Number.isFinite(nowMs) ? Math.max(this.clock, nowMs) : this.clock + frameMs;
    this.cooldown = Math.max(0, this.holdUntil - this.clock);
    // Discard a frame that straddled the end of a hold as well: its cost may
    // include the operation that requested the hold, before the deadline.
    if (wasHeld || this.cooldown > 0) return null;
    this.samples.push(frameMs);
    this.elapsed += frameMs;
    if (this.elapsed < 3000) return null;
    const elapsed = this.elapsed;
    const mean = elapsed / this.samples.length;
    this.samples.sort((a, b) => a - b);
    const p90 = this.samples[Math.ceil(this.samples.length * 0.9) - 1];
    this.samples.length = 0;
    this.elapsed = 0;
    const cost = Math.max(mean, p90);
    // Preserve a useful 30 FPS path at the lightest preset. Faster devices
    // keep running at their display refresh rate; this does not cap FPS.
    const slowLimit = this.quality === 'low' ? 1000 / 28 : 1000 / 44;
    const fastLimit = this.quality === 'low' ? 1000 / 45 : 1000 / 55;
    this.slow = cost > slowLimit ? Math.min(2, this.slow + 1) : 0;
    this.fast = cost < fastLimit ? Math.min(5, this.fast + 1) : 0;
    let level = LEVELS.indexOf(this.quality);
    let scale = this.scale;
    let reason;
    if (this.slow >= 2) {
      reason = 'load';
      // In a piece prefer changing pixel work; a material/preset rebuild is
      // allowed only between pieces, or below the upstream emergency 26 FPS.
      const canDropPreset = allowPresetChange || cost > 1000 / 26;
      if (level > this.minLevel && (cost > 80 || scale <= 0.6) && canDropPreset) level--;
      else if (scale > 0.6) scale = Math.max(0.6, round(scale - (cost > 50 ? 0.2 : 0.1)));
    } else if (this.fast >= 5 && allowRecovery && !this.raiseBlocked) {
      reason = 'recovery';
      if (scale < 1) scale = Math.min(1, round(scale + 0.1));
      else if (level < this.maxLevel) level++;
    }
    const quality = LEVELS[level];
    if (quality === this.quality && scale === this.scale) return null;
    if (quality !== this.quality) {
      const previousRatio = this.pixelRatios[this.quality] || 1;
      const nextRatio = this.pixelRatios[quality] || 1;
      // Changing a preset must not unexpectedly increase pixel work during
      // a downgrade. Recovery probes one tier at a time at the current DPR.
      const rescaled = this.scale * previousRatio / nextRatio;
      const quantized = reason === 'load' ? Math.floor(rescaled * 100) / 100 : round(rescaled);
      scale = Math.max(0.6, Math.min(1, quantized));
    }
    // A probe that cannot hold its resolution/preset should not keep trying
    // the same upgrade every quiet passage. A manual choice resets this lock.
    if (reason === 'load' && this.clock - this.raisedAt < 60000) this.raiseBlocked = true;
    if (reason === 'recovery') this.raisedAt = this.clock;
    this.quality = quality;
    this.scale = scale;
    this.hold(6000);
    return { quality, scale, reason, meanMs: mean, p90Ms: p90 };
  }
}
