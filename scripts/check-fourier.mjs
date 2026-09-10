import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FOURIER_DEFAULTS as base, fourierValue as wave, fourierMoments as moments, fourierDomains as domains, fourierYMax, parseFourier } from '../lib/fourier.ts';
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
for (const sigma of [.2, .5, 1, 2, 5]) for (const chirp of [-2, 0, 2]) {
  const config = { sigma, chirp, center: 1.3, momentum: -1.2 }, m = moments(config);
  near(m.product, Math.hypot(1, chirp) / 2);
  assert.ok(m.product >= .5);
  for (const space of ['position', 'momentum']) {
    const center = space === 'position' ? m.x : m.p, delta = space === 'position' ? m.dx : m.dp;
    const n = 4000, dx = 18 * delta / n;
    let norm = 0, mean = 0, second = 0;
    for (let i = 0; i < n; i++) {
      const x = center - 9 * delta + (i + .5) * dx, value = wave(x, space, config);
      near(value.real ** 2 + value.imaginary ** 2, value.density);
      norm += value.density * dx; mean += x * value.density * dx; second += x ** 2 * value.density * dx;
    }
    near(norm, 1); near(mean, center); near(Math.sqrt(second - mean ** 2), delta);
  }
  // Independent numerical Fourier integral checks amplitudes, phase, sign and normalization.
  for (const p of [m.p - 2 * m.dp, m.p, m.p + 1.5 * m.dp]) {
    const n = 6000, dx = 18 * sigma / n;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const x = m.x - 9 * sigma + (i + .5) * dx, psi = wave(x, 'position', config);
      re += (psi.real * Math.cos(p * x) + psi.imaginary * Math.sin(p * x)) * dx / Math.sqrt(2 * Math.PI);
      im += (psi.imaginary * Math.cos(p * x) - psi.real * Math.sin(p * x)) * dx / Math.sqrt(2 * Math.PI);
    }
    const phi = wave(p, 'momentum', config);
    near(re, phi.real, 1e-8); near(im, phi.imaginary, 1e-8);
  }
}
for (const x of [-2, 0, 1, 3]) near(wave(x, 'position', base).density, wave(x, 'position', { ...base, chirp: 2 }).density);
// The physical interpretation follows from the current, not a classical
// simultaneous assignment of position and momentum. Check the phase gradient
// and its symmetrized covariance independently from the stated formulas.
for (const chirp of [-2, 0, 2]) {
  const config = { ...base, chirp, center: .8, momentum: 1.3 }, epsilon = 1e-5;
  let covariance = 0;
  for (let i = 0; i < 2000; i++) {
    const x = config.center - 9 + (i + .5) * 18 / 2000;
    const psi = wave(x, 'position', config), plus = wave(x + epsilon, 'position', config), minus = wave(x - epsilon, 'position', config);
    const current = (psi.real * (plus.imaginary - minus.imaginary) - psi.imaginary * (plus.real - minus.real)) / (2 * epsilon);
    covariance += (x - config.center) * (current - config.momentum * psi.density) * 18 / 2000;
    if (Math.abs(x - config.center) < 2) near(current / psi.density, config.momentum + chirp * (x - config.center) / 2, 2e-8);
  }
  near(covariance, chirp / 2, 2e-8);
}
const sigma0 = .8, mass = 1.7;
for (const t of [-1, 0, 1]) {
  const c = t / (2 * mass * sigma0 ** 2);
  const expanded = moments({ ...base, sigma: sigma0 * Math.hypot(1, c), chirp: c });
  near(expanded.dp, 1 / (2 * sigma0)); // momentum spread is conserved in free flight
  near(2 * expanded.covariance / mass, t / (2 * mass ** 2 * sigma0 ** 2));
}
near(moments({ ...base, sigma: .5 }).dp, 2 * moments(base).dp);
near(moments({ ...base, center: 2, momentum: 2 }).product, moments(base).product);
assert.deepEqual(domains({ ...base, sigma: .5 }), domains({ ...base, sigma: 2 }), 'Changing width must not zoom away its visible effect');
for (const config of [{ ...base, sigma: .2, chirp: 2, center: 8, momentum: -8 }, { ...base, sigma: 5, center: -8, momentum: 8 }]) {
  const m = moments(config), axes = domains(config);
  assert.ok(axes.position[0] <= m.x - 5 * m.dx && axes.position[1] >= m.x + 5 * m.dx);
  assert.ok(axes.momentum[0] <= m.p - 5 * m.dp && axes.momentum[1] >= m.p + 5 * m.dp);
  assert.deepEqual(axes, domains({ ...config, center: 0, momentum: 0 }), 'Dragging cannot change the coordinate scale');
  for (const space of ['position', 'momentum']) for (const view of ['density', 'complex']) {
    const density = wave(space === 'position' ? m.x : m.p, space, config).density;
    assert.ok(fourierYMax(space, view, config) > (view === 'density' ? density : Math.sqrt(density)), 'Peaks fit even at the new width limits');
  }
}
for (const sigma of [.2, 5]) assert.equal(parseFourier({ lab: 'fourier', fourierSigma: sigma }).fourierSigma, sigma);
assert.equal(parseFourier({ lab: 'fourier', fourierSigma: 1.2, fourierView: 'complex' }).fourierSigma, 1.2);
for (const bad of [{ fourierSigma: 0 }, { fourierSigma: .19 }, { fourierSigma: 5.1 }, { fourierSigma: NaN }, { fourierChirp: 3 }, { fourierCenter: -9 }, { fourierMomentum: '1' }, { fourierView: 'bad' }, { time: 1 }, { scale: 2 }]) assert.throws(() => parseFourier({ lab: 'fourier', ...bad }));
const app = readFileSync(new URL('../components/quantum-lab.tsx', import.meta.url), 'utf8');
assert.match(app, /useState<Lab>\('fourier'\)/);
assert.ok(app.indexOf('<span>01</span> Incertitude') < app.indexOf('<span>02</span> Diffusion'));
assert.deepEqual([...app.matchAll(/<span>(0\d)<\/span>/g)].map(m => m[1]), ['01', '02', '03', '04', '05', '06', '07', '08', '09']);
console.log('Fourier: independently integrated complex transform, normalization, means, variances, uncertainty, fixed comparison axes, input bounds and nine-lab ordering pass.');
