import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  SCATTERING_DEFAULT, SCATTERING_PRESETS, PROPAGATION_PRESETS, FRAME_COUNT, PACKET_CENTER,
  SCATTERING_RESIDUAL_TOLERANCE, SCATTERING_STABILITY_TOLERANCE,
  automaticScatteringEndpoint, computeAutomaticScatteringTimeline,
  scatteringFinalTime, scatteringFinalTimeMax, interactionEdge, sampleTimeline,
} from '../lib/scattering.ts';

// A stable pre-collision plateau must never be accepted as an endpoint.
const duration = scatteringFinalTimeMax(SCATTERING_DEFAULT);
function fixture(probability) {
  return { duration, probabilities: Float64Array.from({ length: FRAME_COUNT * 3 }, (_, j) => probability(Math.floor(j / 3) * duration / (FRAME_COUNT - 1))[j % 3]) };
}
const during = fixture(t => t < 10 ? [1, 0, 0] : t < 30 ? [.5, .3, .2] : [.6, 0, .4]);
assert.ok(automaticScatteringEndpoint(SCATTERING_DEFAULT, during).time > 30);
const residual = automaticScatteringEndpoint(SCATTERING_DEFAULT, fixture(() => [.49, .02, .49]));
assert.deepEqual(residual, { time: duration, complete: false });
const oscillating = automaticScatteringEndpoint(SCATTERING_DEFAULT, fixture(t => [.5 + .01 * Math.sin(t), 0, .5 - .01 * Math.sin(t)]));
assert.equal(oscillating.complete, false, 'Small central population alone does not imply stable outgoing fractions');
const early = automaticScatteringEndpoint(SCATTERING_DEFAULT, fixture(() => [.6, 0, .4]));
assert.ok(early.time > (-PACKET_CENTER + interactionEdge(SCATTERING_DEFAULT)) / SCATTERING_DEFAULT.momentum + 2, 'Automatic end is never before the collision');

for (const config of Object.values(PROPAGATION_PRESETS)) {
  const timeline = computeAutomaticScatteringTimeline(config);
  assert.equal(timeline.duration, scatteringFinalTime(config));
  assert.equal(timeline.automaticFinalTime, timeline.duration);
  assert.equal(timeline.scatteringComplete, undefined, 'No fictitious collision in a uniform field');
}

const cases = {
  tunnel: SCATTERING_PRESETS.tunnel,
  transmission: SCATTERING_PRESETS.transmission,
  wideGaussian: { ...SCATTERING_DEFAULT, potential: 'gaussian', width: 6, momentum: .75, sigma: 2 },
  slowWell: { ...SCATTERING_DEFAULT, potential: 'well', width: 6, momentum: .75, sigma: 5 },
  nearBarrierTop: { ...SCATTERING_DEFAULT, height: 2, width: 6 },
};
for (const [name, config] of Object.entries(cases)) {
  const progress = [];
  const timeline = computeAutomaticScatteringTimeline(config, p => progress.push(p));
  const tf = timeline.automaticFinalTime;
  assert.ok(Number.isInteger(tf) && tf > -PACKET_CENTER / config.momentum && tf <= scatteringFinalTimeMax(config));
  assert.equal(timeline.duration, scatteringFinalTimeMax(config), 'Full safe history stays available for manual seeking');
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, i) => value >= 0 && value <= 1 && (i === 0 || value >= progress[i - 1])));
  const end = sampleTimeline(timeline, tf);
  assert.ok(Math.abs(end.left + end.center + end.right - 1) < 1e-8, 'Norm conserved');
  if (timeline.scatteringComplete) {
    assert.ok(end.center <= SCATTERING_RESIDUAL_TOLERANCE);
    const window = Math.max(2, 2 * config.sigma / config.momentum) + Math.max(1, config.sigma / config.momentum);
    for (let t = tf - window; t < tf; t += .2) {
      const before = sampleTimeline(timeline, t);
      assert.ok(Math.abs(end.left - before.left) <= SCATTERING_STABILITY_TOLERANCE);
      assert.ok(Math.abs(end.right - before.right) <= SCATTERING_STABILITY_TOLERANCE);
      assert.ok(before.center <= SCATTERING_RESIDUAL_TOLERANCE);
    }
    const later = sampleTimeline(timeline, Math.min(tf + 2, timeline.duration));
    assert.ok(Math.abs(later.right - end.right) < .002, 'Chosen endpoint is followed by stable transmission');
  } else assert.equal(tf, scatteringFinalTimeMax(config), 'Slow incomplete interactions respect the safe boundary');
  if (name === 'tunnel') assert.ok(end.right > .32 && end.right < .33);
  if (name === 'transmission') assert.ok(end.right > .95 && end.right < .96);
  console.log(`${name}: automatic tf=${tf}, separated=${timeline.scatteringComplete}, residual=${end.center.toExponential(2)}`);
}

// Verify automatic requests take the worker's automatic branch, not a fixed run.
const source = ts.transpileModule(readFileSync(new URL('../lib/scattering.worker.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const messages = [], worker = { postMessage(message) { messages.push(message); } };
let automaticCalls = 0;
new Function('require', 'exports', 'self', source)(() => ({
  computeAutomaticScatteringTimeline(config, onProgress) { automaticCalls++; return computeAutomaticScatteringTimeline(config, onProgress); },
  computeScatteringTimeline() { throw new Error('Unexpected manual calculation'); },
}), {}, worker);
for (const finalTime of [undefined, null]) worker.onmessage({ data: { config: PROPAGATION_PRESETS.free, finalTime } });
assert.equal(automaticCalls, 2);
assert.equal(messages.at(-1).type, 'ready');
assert.equal(messages.at(-1).timeline.automaticFinalTime, scatteringFinalTime(PROPAGATION_PRESETS.free));
console.log('Automatic time: separation, stability, post-collision guard, safe-limit fallback, free/gravity and worker routing pass.');
