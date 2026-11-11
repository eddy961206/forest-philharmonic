import assert from 'node:assert/strict';
import test from 'node:test';
import { bendAt, schedulePitchBend } from '../public/js/audio/pitch-bend.js';

test('seek resumes the active wheel position and schedules later bends', () => {
  const points = [[0, 0], [1, 200], [2, -100], [3, 0]];
  assert.deepEqual(bendAt(points, 1.5), { index: 2, value: 200 });
  const calls = [];
  const param = {
    setValueAtTime: (value, time) => calls.push(['set', value, time]),
    linearRampToValueAtTime: (value, time) => calls.push(['ramp', value, time]),
  };
  schedulePitchBend(param, points, 1.5, 10, 1);
  assert.deepEqual(calls, [
    ['set', 200, 10], ['set', 200, 10.496], ['ramp', -100, 10.5],
  ]);
});

test('a new sample segment starts at the current pitch bend', () => {
  const points = [[0, 0], [1, 300], [2, 0]];
  const calls = [];
  schedulePitchBend({
    setValueAtTime: (value, time) => calls.push(['set', value, time]),
    linearRampToValueAtTime: (value, time) => calls.push(['ramp', value, time]),
  }, points, 1.4, 12, 0.8);
  assert.deepEqual(calls, [['set', 300, 12], ['set', 300, 12.596], ['ramp', 0, 12.6]]);
});

test('dense pitch-wheel events closer than 4 ms never schedule automation backward in time', () => {
  const points = [[0.01, 100], [0.012, 220], [0.013, -50]];
  const calls = [];
  schedulePitchBend({
    setValueAtTime: (value, time) => calls.push(['set', value, time]),
    linearRampToValueAtTime: (value, time) => calls.push(['ramp', value, time]),
  }, points, 0, 5, 0.1);
  for (let i = 1; i < calls.length; i++) {
    assert.ok(calls[i][2] >= calls[i - 1][2], `non-monotonic automation: ${calls[i - 1][2]} -> ${calls[i][2]}`);
  }
  assert.equal(calls.at(-1)[1], -50);
});
