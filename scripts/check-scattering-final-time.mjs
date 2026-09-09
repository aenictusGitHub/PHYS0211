import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {
  SCATTERING_DEFAULT, SCATTERING_POTENTIALS, PROPAGATION_PRESETS,
  scatteringDuration, scatteringFinalTime, scatteringFinalTimeMax,
  computeScatteringTimeline, sampleTimeline, uniformFieldWavefunction,
  uniformFieldMoments, SAMPLE_X, DOMAIN_LENGTH,
} from '../lib/scattering.ts';

for (const potential of SCATTERING_POTENTIALS) {
  for (const momentum of [.75, 1, 2, 4]) {
    for (const sigma of [2, 3, 5]) {
      const config = { ...SCATTERING_DEFAULT, potential, momentum, sigma };
      const max = scatteringFinalTimeMax(config);
      assert.ok(max >= Math.round(scatteringDuration(config)), 'Default endpoint remains available');
      assert.equal(scatteringFinalTime(config), Math.round(scatteringDuration(config)));
      assert.equal(scatteringFinalTime(config, -2), 1);
      assert.equal(scatteringFinalTime(config, 1e5), max);
      assert.equal(scatteringFinalTime(config, NaN), scatteringFinalTime(config));
      assert.equal(scatteringFinalTime(config, 10), 10);
      if (potential === 'free' || potential === 'gravity') assert.equal(max, 120);
      else {
        const outgoing = uniformFieldMoments({ ...config, potential: 'free' }, max);
        assert.ok(outgoing.position + 4 * outgoing.sigma < DOMAIN_LENGTH / 2, 'Outgoing four-sigma envelope stays before periodic boundary');
      }
    }
  }
}

for (const config of Object.values(PROPAGATION_PRESETS)) {
  for (const finalTime of [5, 40, 120]) {
    const timeline = computeScatteringTimeline(config, undefined, finalTime);
    assert.equal(timeline.duration, finalTime);
    for (const time of [0, 4.7, finalTime, finalTime + 10]) {
      const frame = sampleTimeline(timeline, time);
      const evaluate = uniformFieldWavefunction(config, Math.min(time, finalTime));
      for (let j = 0; j < SAMPLE_X.length; j += 41) {
        const psi = evaluate(SAMPLE_X[j]);
        assert.ok(Math.abs(frame.density[j] - psi.re ** 2 - psi.im ** 2) < 3e-8);
      }
    }
  }
}

for (const finalTime of [5, 40]) {
  const timeline = computeScatteringTimeline(SCATTERING_DEFAULT, undefined, finalTime);
  assert.equal(timeline.duration, finalTime, 'Numerical solver actually computes the requested interval');
  for (const time of [0, finalTime / 2, finalTime]) {
    const frame = sampleTimeline(timeline, time);
    assert.ok(frame.density.every(value => Number.isFinite(value) && value >= 0));
    assert.ok(Math.abs(frame.left + frame.center + frame.right - 1) < 1e-8);
  }
  const end = sampleTimeline(timeline, finalTime);
  assert.deepEqual(sampleTimeline(timeline, finalTime + 1), end, 'Scrubbing clamps at the chosen endpoint');
  if (finalTime === 40) assert.ok(end.right > .3 && end.right < .35, 'Extended run retains the transmitted probability');
}
// The worker must forward the edited endpoint, not recompute the default one.
const workerSource = ts.transpileModule(readFileSync(new URL('../lib/scattering.worker.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const messages = [], worker = { postMessage(message) { messages.push(message); } };
let received;
new Function('require', 'exports', 'self', workerSource)(() => ({
  computeScatteringTimeline(config, onProgress, finalTime) {
    received = { config, finalTime };
    onProgress(.5);
    return computeScatteringTimeline(config, undefined, finalTime);
  },
}), {}, worker);
worker.onmessage({ data: { config: PROPAGATION_PRESETS.free, finalTime: 45 } });
assert.equal(received.finalTime, 45);
assert.deepEqual(received.config, PROPAGATION_PRESETS.free);
assert.equal(messages.at(-1).type, 'ready');
assert.equal(messages.at(-1).timeline.duration, 45);
console.log('Final time: configurable numerical/analytical duration, safe bounds, conservation, long-time solution and endpoint scrubbing pass.');
