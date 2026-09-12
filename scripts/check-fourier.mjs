import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FOURIER_DEFAULTS as base, evolveFourier, fourierValue as wave, fourierMoments as moments, fourierDomains as domains, fourierYMax, parseFourier } from '../lib/fourier.ts';
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
// Free evolution: conserved momentum distribution, Ehrenfest motion, focusing,
// and an independently integrated transform including the global phase.
for (const chirp of [-2, 0, 2]) for (const t of [0, .5, 3]) {
  const initial = { sigma: .8, center: -.7, momentum: 1.2, chirp };
  const evolved = evolveFourier(initial, t), m = moments(evolved), start = moments(initial);
  near(m.x, initial.center + initial.momentum * t);
  near(m.dx ** 2, initial.sigma ** 2 + chirp * t + start.dp ** 2 * t ** 2);
  near(m.dp, start.dp); near(m.covariance, start.covariance + start.dp ** 2 * t);
  assert.deepEqual(domains(evolved), domains(initial));
  for (const p of [start.p - start.dp, start.p, start.p + 1.5 * start.dp]) {
    const n = 12000, dx = 18 * m.dx / n;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const x = m.x - 9 * m.dx + (i + .5) * dx, psi = wave(x, 'position', initial, t);
      re += (psi.real * Math.cos(p * x) + psi.imaginary * Math.sin(p * x)) * dx / Math.sqrt(2 * Math.PI);
      im += (psi.imaginary * Math.cos(p * x) - psi.real * Math.sin(p * x)) * dx / Math.sqrt(2 * Math.PI);
    }
    const phi = wave(p, 'momentum', initial, t);
    near(re, phi.real, 1e-8); near(im, phi.imaginary, 1e-8);
    near(phi.density, wave(p, 'momentum', initial).density);
  }
  // i dψ/dt = -1/2 d²ψ/dx², independently differentiated.
  for (const x of [m.x - m.dx, m.x, m.x + m.dx]) {
    const h = 1e-4, psi = wave(x, 'position', initial, t);
    const xp = wave(x + h, 'position', initial, t), xm = wave(x - h, 'position', initial, t);
    const tp = wave(x, 'position', initial, t + h), tm = wave(x, 'position', initial, t - h);
    near(-(tp.imaginary - tm.imaginary) / (2 * h), -.5 * (xp.real - 2 * psi.real + xm.real) / h ** 2, 2e-6);
    near((tp.real - tm.real) / (2 * h), -.5 * (xp.imaginary - 2 * psi.imaginary + xm.imaginary) / h ** 2, 2e-6);
  }
}
const focus = evolveFourier({ ...base, chirp: -1 }, 1);
near(focus.sigma, Math.sqrt(.5)); near(focus.chirp, 0);
for (const sigma of [.2, .5, 1, 2, 5]) for (const chirp of [-2, 0, 2]) for (const time of [0, 1, 20]) {
  assert.deepEqual(domains(evolveFourier({ ...base, sigma, chirp, momentum: 8 }, time)), domains(base), 'No automatic horizontal zoom');
}
assert.deepEqual(domains(base, 100), { position: [-100, 100], momentum: [-40, 40] });
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
assert.equal(parseFourier({ lab: 'fourier', time: 1, mode: 'evolution', finalTime: 4 }).time, 1);
assert.equal(parseFourier({ lab: 'fourier', fourierChirp: 1 }).fourierChirpEnabled, true);
assert.equal(parseFourier({ lab: 'fourier', fourierChirp: 1, fourierChirpEnabled: false }).fourierChirpEnabled, false);
for (const bad of [{ fourierSigma: 0 }, { fourierSigma: .19 }, { fourierSigma: 5.1 }, { fourierSigma: NaN }, { fourierChirp: 3 }, { fourierCenter: -9 }, { fourierMomentum: '1' }, { fourierView: 'bad' }, { time: -1 }, { time: 21 }, { finalTime: 21 }, { time: 3, finalTime: 2 }, { fourierChirpEnabled: 'true' }, { fourierWindow: 0 }, { fourierWindow: 401 }, { playbackSpeed: 5 }, { mode: 'bad' }, { scale: 2 }]) assert.throws(() => parseFourier({ lab: 'fourier', ...bad }));
const app = readFileSync(new URL('../components/quantum-lab.tsx', import.meta.url), 'utf8');
assert.match(app, /useState<Lab>\('fourier'\)/);
assert.match(app, /<span>01<\/span><span>Fonctions d’ondes en <Formula>\$x\$<\/Formula> et <Formula>\$p\$<\/Formula>/);
assert.ok(app.indexOf('<span>01</span>') < app.indexOf('<span>02</span> Diffusion'));
assert.deepEqual([...app.matchAll(/<span>(0\d)<\/span>/g)].map(m => m[1]), ['01', '02', '03', '04', '05', '06', '07', '08', '09']);
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
assert.match(css, /\.sg-setup-bar\s*\{[^}]*max-width:\s*1440px;[^}]*margin:\s*16px auto 0;/, 'Stern–Gerlach setup is centered at the same width as the laboratory');
console.log('Fourier: complex transform, normalization, means, variances, free Schrödinger evolution, focusing, fixed axes, bounds and nine-lab ordering pass; SG setup width constrained.');
