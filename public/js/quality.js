// Automatic quality uses real frame intervals, independently of the clamped
// animation clock. Manual presets never call this controller.
const LEVELS = ['low', 'medium', 'high'];
const round = (v) => Math.round(v * 100) / 100;

export class AdaptiveQuality {
  constructor({ quality = 'high', scale = 1, maxQuality = 'high', pixelRatios = {} } = {}) {
    this.maxLevel = LEVELS.indexOf(maxQuality);
    this.pixelRatios = pixelRatios;
    this.reset(quality, scale);
  }

  reset(quality = this.quality, scale = 1) {
    this.quality = quality;
    this.scale = scale;
    this.samples = [];
    this.elapsed = 0;
    this.slow = 0;
    this.fast = 0;
    this.cooldown = 6000; // ignore entry, resume and shader warm-up
  }

  // Returns only a change. A single hitch cannot trigger a downgrade, and
  // sustained spare capacity is required before attempting a recovery.
  sample(frameMs) {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return null;
    this.samples.push(frameMs);
    this.elapsed += frameMs;
    if (this.elapsed < 3000) return null;
    const elapsed = this.elapsed;
    const mean = elapsed / this.samples.length;
    this.samples.sort((a, b) => a - b);
    const p90 = this.samples[Math.ceil(this.samples.length * 0.9) - 1];
    this.samples.length = 0;
    this.elapsed = 0;
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - elapsed);
      return null;
    }
    const cost = Math.max(mean, p90);
    // Preserve a useful 30 FPS path at the lightest preset. Faster devices
    // keep running at their display refresh rate; this does not cap FPS.
    const slowLimit = this.quality === 'low' ? 1000 / 28 : 1000 / 44;
    const fastLimit = this.quality === 'low' ? 1000 / 45 : 1000 / 55;
    this.slow = cost > slowLimit ? this.slow + 1 : 0;
    this.fast = cost < fastLimit ? this.fast + 1 : 0;
    let level = LEVELS.indexOf(this.quality);
    let scale = this.scale;
    let reason;
    if (this.slow >= 2) {
      reason = 'load';
      // Severe overload should not spend a minute probing small pixel steps.
      if (level > 0 && (cost > 80 || scale <= 0.6)) level--;
      else if (scale > 0.6) scale = Math.max(0.6, round(scale - (cost > 50 ? 0.2 : 0.1)));
    } else if (this.fast >= 5) {
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
    this.quality = quality;
    this.scale = scale;
    this.slow = 0;
    this.fast = 0;
    this.cooldown = 6000;
    return { quality, scale, reason, meanMs: mean, p90Ms: p90 };
  }
}
