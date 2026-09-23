import assert from 'node:assert/strict';
import {
  ScatteringSolver, SCATTERING_DEFAULT, SCATTERING_PRESETS, GRID_SIZE, DOMAIN_LENGTH, DX,
  PACKET_CENTER, SCATTERING_DT, scatteringDuration, computeScatteringTimeline, sampleTimeline,
  potentialAt, interactionEdge, scatteringPotentialProfile,
} from '../lib/scattering.ts';

function close(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} versus ${expected}`);
}

const freeConfig = { ...SCATTERING_DEFAULT, height: 0 };
const free = new ScatteringSolver(freeConfig);
free.step(400);
let norm = 0, mean = 0, second = 0, densityError = 0;
const t = 400 * free.dt;
const expectedMean = PACKET_CENTER + freeConfig.momentum * t;
const expectedVariance = freeConfig.sigma ** 2 + t ** 2 / (4 * freeConfig.sigma ** 2);
for (let j = 0; j < GRID_SIZE; j++) {
  const x = -DOMAIN_LENGTH / 2 + (j + .5) * DX;
  const density = free.re[j] ** 2 + free.im[j] ** 2;
  const expected = Math.exp(-((x - expectedMean) ** 2) / (2 * expectedVariance)) / Math.sqrt(2 * Math.PI * expectedVariance);
  norm += density * DX;
  mean += x * density * DX;
  second += x * x * density * DX;
  densityError += Math.abs(density - expected) * DX;
}
close(norm, 1, 1e-10, 'Free packet norm');
close(mean, expectedMean, 1e-8, 'Free packet group velocity');
close(second - mean ** 2, expectedVariance, 1e-7, 'Free packet spreading');
close(densityError, 0, 1e-8, 'Free Gaussian analytic density');
console.log('Free Gaussian: norm, velocity, dispersion and analytic density pass.');

const gaussianWell = { ...SCATTERING_DEFAULT, potential: 'gaussian-well', height: 3, width: 2 };
assert.equal(potentialAt(0, gaussianWell), -3);
assert.equal(interactionEdge(gaussianWell), 3);
for (const x of [0, .25, 1, 2, 5]) {
  assert.equal(potentialAt(x, gaussianWell), potentialAt(-x, gaussianWell), 'Gaussian well is even');
  assert.equal(potentialAt(x, gaussianWell), -potentialAt(x, { ...gaussianWell, potential: 'gaussian' }));
}
assert.ok(scatteringPotentialProfile(gaussianWell).every(({ x, y }) => y === potentialAt(x, gaussianWell)));
const wellSolver = new ScatteringSolver(gaussianWell);
wellSolver.step(Math.round(scatteringDuration(gaussianWell) / wellSolver.dt));
const wellResult = wellSolver.snapshot();
close(wellResult.norm, 1, 1e-9, 'Gaussian well: norm conservation after scattering');
close(wellResult.left + wellResult.center + wellResult.right, 1, 1e-9, 'Gaussian well: probability partition');
assert.ok(wellResult.center < .02 && wellResult.right > .9, 'Smooth shallow well transmits this incident packet');
console.log('Gaussian well: attractive profile, symmetry, probability conservation and propagation pass.');

// Exact stationary transmission averaged over the incident Gaussian spectrum.
function expectedTransmission(config) {
  const v = config.potential === 'well' ? -config.height : config.height;
  let integral = 0;
  const dk = .002;
  for (let k = dk / 2; k < 8; k += dk) {
    const e = k * k / 2;
    const gap = e - v;
    let transmission;
    if (Math.abs(gap) < 1e-9) transmission = 1 / (1 + v * v * config.width ** 2 / (2 * e));
    else {
      const phase = Math.sqrt(2 * Math.abs(gap)) * config.width;
      const oscillation = gap > 0 ? Math.sin(phase) : Math.sinh(phase);
      transmission = 1 / (1 + v * v * oscillation ** 2 / (4 * e * Math.abs(gap)));
    }
    integral += transmission * Math.sqrt(2 / Math.PI) * config.sigma
      * Math.exp(-2 * config.sigma ** 2 * (k - config.momentum) ** 2) * dk;
  }
  return integral;
}

for (const [name, config] of Object.entries({
  ...SCATTERING_PRESETS,
  well: { ...SCATTERING_DEFAULT, potential: 'well', height: 3, width: 2 },
})) {
  const dt = SCATTERING_DT;
  const solver = new ScatteringSolver(config, dt);
  solver.step(Math.round(scatteringDuration(config) / dt));
  const result = solver.snapshot();
  const expected = expectedTransmission(config);
  close(result.norm, 1, 1e-9, `${name}: norm conservation`);
  close(result.right, expected, .004, `${name}: Gaussian-averaged transmission`);
  if (name === 'reflection') close(result.right, expected, 1e-6, 'Opaque barrier: no spurious transmitted channel');
  assert.ok(result.center < .02, `${name}: packets have separated`);
  console.log(`${name}: T = ${result.right.toFixed(5)}, analytic average = ${expected.toFixed(5)}, norm = ${result.norm.toFixed(12)}`);
}

const started = performance.now();
const timeline = computeScatteringTimeline(SCATTERING_DEFAULT);
for (const fraction of [0, .239, .5, .719, 1]) {
  const frame = sampleTimeline(timeline, fraction * timeline.duration);
  close(frame.left + frame.center + frame.right, 1, 1e-9, 'Interpolated probabilities');
  assert.ok(frame.density.every(value => value >= 0 && Number.isFinite(value)), 'Finite nonnegative density');
}
console.log(`Timeline: interpolation and endpoint checks pass (${Math.round(performance.now() - started)} ms).`);
