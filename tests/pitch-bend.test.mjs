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
