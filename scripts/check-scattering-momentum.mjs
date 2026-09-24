import assert from 'node:assert/strict';
import {
  ScatteringSolver, SCATTERING_DEFAULT, SAMPLE_P, DP, DX, GRID_SIZE, FRAME_COUNT,
  computeScatteringTimeline, sampleTimeline, sampleMomentumTimeline, uniformFieldMomentumValues, momentumExpectation,
} from '../lib/scattering.ts';

const close = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} vs ${b}`);
const integrate = points => points.slice(1).reduce((sum, p, j) => sum + (p.x - points[j].x) * (p.y + points[j].y) / 2, 0);

for (const sigma of [2, 3, 5]) for (const momentum of [.75, 2, 4]) {
  const config = { ...SCATTERING_DEFAULT, sigma, momentum };
  const solver = new ScatteringSolver(config);
  const originalRe = solver.re.slice(), originalIm = solver.im.slice();
  const density = solver.momentumDensity();
  assert.deepEqual(solver.re, originalRe, 'Fourier display must not mutate the state');
  assert.deepEqual(solver.im, originalIm);
  close(density.reduce((sum, y) => sum + y * DP, 0), 1, 1e-7, 'Momentum normalization');
  close(density.reduce((sum, y, j) => sum + SAMPLE_P[j] * y * DP, 0), momentum, 1e-6, 'Momentum sign and mean');
  close(density.reduce((sum, y, j) => sum + (SAMPLE_P[j] - momentum) ** 2 * y * DP, 0), 1 / (4 * sigma ** 2), 1e-7, 'Momentum variance');
  for (let j = 0; j < density.length; j++) {
    const expected = Math.sqrt(2 / Math.PI) * sigma * Math.exp(-2 * sigma ** 2 * (SAMPLE_P[j] - momentum) ** 2);
    close(density[j], expected, 2e-7, 'Initial Gaussian spectrum');
  }
}

// Even when the position view crops the outgoing packet, its spectrum retains norm 1.
const free = new ScatteringSolver({ ...SCATTERING_DEFAULT, height: 0 });
const initial = free.momentumDensity();
free.step(Math.round(48 / free.dt));
const outgoing = free.momentumDensity();
for (let j = 0; j < outgoing.length; j++) close(outgoing[j], initial[j], 1e-7, 'Free momentum density is time independent');
close(outgoing.reduce((sum, y) => sum + y * DP, 0),
  free.re.reduce((sum, re, j) => sum + (re ** 2 + free.im[j] ** 2) * DX, 0), 1e-7, 'Parseval over full grid');

for (const potential of ['free', 'gravity']) {
  const config = { ...SCATTERING_DEFAULT, potential, gravity: .5 };
  const timeline = computeScatteringTimeline(config, undefined, 120);
  for (const time of [0, 3.17, 120]) {
    const values = sampleMomentumTimeline(timeline, time);
    const mean = config.momentum - (potential === 'gravity' ? .5 * time : 0);
    close(integrate(values), 1, 1e-7, 'Exact uniform-field momentum norm');
    close(integrate(values.map(p => ({ x: p.x, y: p.y * p.x }))), mean, 1e-6, 'Uniform-field momentum mean');
    close(integrate(values.map(p => ({ x: p.x, y: p.y * (p.x - mean) ** 2 }))), 1 / (4 * config.sigma ** 2), 1e-7, 'Constant momentum width');
    assert.deepEqual(values, uniformFieldMomentumValues(config, time));
    close(momentumExpectation(values), mean, 1e-7, 'Guide follows the momentum expectation');
  }
}

const timeline = computeScatteringTimeline(SCATTERING_DEFAULT);
assert.equal(timeline.momentumDensities.length, FRAME_COUNT * GRID_SIZE);
for (const fraction of [0, .137, .5, .891, 1]) {
  const values = sampleMomentumTimeline(timeline, fraction * timeline.duration);
  close(integrate(values), 1, 1e-7, 'Interpolated momentum density remains normalized');
  assert.ok(values.every(p => Number.isFinite(p.y) && p.y >= 0 && p.y <= timeline.maxMomentumDensity + 1e-6));
}
const end = sampleMomentumTimeline(timeline, timeline.duration);
close(momentumExpectation(end), integrate(end.map(point => ({ x: point.x, y: point.x * point.y }))), 1e-7, 'Mean-momentum guide uses the whole reflected/transmitted distribution');
assert.ok(momentumExpectation(end) < 0, 'Dominant reflection moves the mean into negative momenta');
close(momentumExpectation(sampleMomentumTimeline(timeline, 0)), SCATTERING_DEFAULT.momentum, 1e-7, 'Incident mean matches k0');
const spatial = sampleTimeline(timeline, timeline.duration);
close(end.filter(p => p.x < 0).reduce((sum, p) => sum + p.y * DP, 0), spatial.left, .004, 'Reflected packet has negative momentum');
close(end.filter(p => p.x > 0).reduce((sum, p) => sum + p.y * DP, 0), spatial.right, .004, 'Transmitted packet has positive momentum');
assert.deepEqual(sampleMomentumTimeline(timeline, -1), sampleMomentumTimeline(timeline, 0));
assert.deepEqual(sampleMomentumTimeline(timeline, timeline.duration + 1), end);
console.log('Scattering momentum: full-state FFT, Parseval, Gaussian width/sign, free invariance, gravity, interpolation and reflected/transmitted fractions pass.');
