import assert from 'node:assert/strict';
import { advancePlaybackTime, PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX, NORMAL_PLAYBACK_SECONDS } from '../lib/playback.ts';
import { PROPAGATION_PRESETS, SCATTERING_PRESETS, scatteringDuration } from '../lib/scattering.ts';

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} versus ${expected}`);
for (const config of [...Object.values(PROPAGATION_PRESETS), ...Object.values(SCATTERING_PRESETS)]) {
  const duration = scatteringDuration(config);
  for (const speed of [PLAYBACK_SPEED_MIN, .5, 1, 2, PLAYBACK_SPEED_MAX]) {
    let time = 0;
    for (let frame = 0; frame < 60; frame++) time = advancePlaybackTime(time, 1 / 60, duration, speed);
    close(time, duration / NORMAL_PLAYBACK_SECONDS * speed, 'One wall-clock second at the selected rate');
    const seconds = NORMAL_PLAYBACK_SECONDS / speed;
    time = 0;
    for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) time = advancePlaybackTime(time, 1 / 60, duration, speed);
    close(time, duration, 'Each speed reaches the same physical endpoint');
    close(advancePlaybackTime(duration, .016, duration, speed), duration, 'No overshoot or wrap at the end');
  }
  let time = duration * .3;
  time = advancePlaybackTime(time, .02, duration, .5);
  time = advancePlaybackTime(time, .02, duration, 4);
  close(time, duration * .3 + .09 * duration / NORMAL_PLAYBACK_SECONDS, 'Live speed changes preserve the current position');
  close(advancePlaybackTime(time, 0, duration, 2), time, 'No elapsed time means no change');
  close(advancePlaybackTime(time, -1, duration, 2), time, 'Backward clock jumps do not rewind');
  close(advancePlaybackTime(0, 500, duration, 1), .05 * duration / NORMAL_PLAYBACK_SECONDS, 'Returning from a background tab does not skip the animation');
  close(advancePlaybackTime(0, .02, duration), .02 * duration / 16, 'Default rate preserves the previous playback duration');
}
const referenceDuration = 28;
for (const endpoint of [14, 28, 40, 80]) {
  close(advancePlaybackTime(0, .02, endpoint, 1, referenceDuration), .02 * referenceDuration / 16, 'Changing the endpoint does not change the reading speed');
  close(advancePlaybackTime(endpoint - .001, .02, endpoint, 4, referenceDuration), endpoint, 'Playback stops at the custom endpoint');
}
console.log('Playback speed: x0.25–x4, live changes, independent final time, replay endpoint and background-tab gaps pass.');
