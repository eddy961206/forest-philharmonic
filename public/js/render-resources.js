// The vendored BloomPass does not release its high-pass material. Keep the
// supplement here so preset changes and context loss use the same cleanup.
const releasedComposers = new WeakSet();
export function disposeComposer(composer) {
  if (!composer || releasedComposers.has(composer)) return;
  releasedComposers.add(composer);
  for (const pass of composer.passes) {
    pass.materialHighPassFilter?.dispose();
    pass.dispose?.();
  }
  composer.dispose();
}

// Re-clicking the selected preset must not reset adaptive resolution or
// reallocate render targets. A different persisted choice still applies.
export const sameQualitySetting = (settings, key, value) => key === 'quality' && settings.quality === value;
