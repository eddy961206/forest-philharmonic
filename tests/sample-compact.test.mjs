import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../public/js/audio/engine.js';
import { compactStereoFixture } from '../tools/bench/sample-preparation.mjs';

function buffer(channels, sampleRate) {
  return { sampleRate, length: channels[0].length, numberOfChannels: channels.length,
    getChannelData: index => channels[index] };
}
const ctx = { createBuffer: (channels, length, sampleRate) => buffer(Array.from({ length: channels }, () => new Float32Array(length)), sampleRate) };
const bytes = value => Buffer.from(value.getChannelData(0).buffer);

// Independent reference: the channel-major implementation at cabfe78.
// Keep this separate from both the product and experimental fused loops.
function originalCompact(input, meta, lite) {
  const sampleRate = input.sampleRate;
  const length = lite ? Math.min(input.length, Math.floor(((meta?.s || 0) + 4.5) * sampleRate)) : input.length;
  const output = ctx.createBuffer(1, length, sampleRate), samples = output.getChannelData(0);
  for (let channel = 0; channel < input.numberOfChannels; channel++) {
    const source = input.getChannelData(channel);
    for (let frame = 0; frame < length; frame++) samples[frame] += source[frame] / input.numberOfChannels;
  }
  if (length < input.length) {
    const fadeLength = Math.floor(.25 * sampleRate);
    for (let frame = 0; frame < fadeLength; frame++) samples[length - fadeLength + frame] *= 1 - frame / fadeLength;
  }
  return output;
}

function compareWithOriginal(input, meta, lite) {
  const expected = originalCompact(input, meta, lite);
  for (const [name, actual] of [
    ['product', AudioEngine.prototype._compact.call({ ctx, lite }, input, meta)],
    ['experiment', compactStereoFixture(ctx, input, meta, lite)],
  ]) {
    assert.equal(actual.length, expected.length, name);
    assert.equal(actual.sampleRate, expected.sampleRate, name);
    assert.equal(actual.numberOfChannels, expected.numberOfChannels, name);
    assert.deepEqual(bytes(actual), bytes(expected), name);
  }
}

test('stereo compact retains intermediate Float32 rounding and positive zero', () => {
  const input = buffer([new Float32Array([2 ** -149, -0]), new Float32Array([2 ** -149, -0])], 48000);
  for (const lite of [false, true]) {
    compareWithOriginal(input, {}, lite);
    const actual = AudioEngine.prototype._compact.call({ ctx, lite }, input, {});
    // Rounding each half separately yields +0. (L + R) / 2 would retain 2^-149.
    // Starting with +0 also makes the sum of two -0 inputs positive zero.
    assert.deepEqual(new Uint32Array(actual.getChannelData(0).buffer), new Uint32Array([0, 0]));
  }
});

test('compact preserves Float32 boundary values, signed zero and exceptional values', () => {
  const values = new Float32Array([0, -0, 1, -1, .1, -.1, Number.MIN_VALUE, 2 ** -149, -(2 ** -149),
    2 ** -126, -(2 ** -126), 3.4028234663852886e38, -3.4028234663852886e38, Infinity, -Infinity, NaN]);
  const left = new Float32Array(values.length ** 2), right = new Float32Array(left.length);
  let i = 0;
  for (const l of values) for (const r of values) { left[i] = l; right[i++] = r; }
  const input = buffer([left, right], 48000);
  compareWithOriginal(input, {}, false);
});

test('compact preserves mono/multichannel fallback and Lite truncation/fade', () => {
  for (const count of [1, 2, 3]) for (const lite of [false, true]) for (const sampleRate of [8, 24000]) {
    const length = sampleRate * 6;
    const channels = Array.from({ length: count }, (_, c) => Float32Array.from({ length }, (_, i) => Math.sin(i * .03 + c) * .1));
    const input = buffer(channels, sampleRate), meta = { s: .04 };
    compareWithOriginal(input, meta, lite);
  }
});
