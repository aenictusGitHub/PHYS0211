import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FOURIER_DEFAULTS as base, evolveFourier, fourierValue as wave, fourierMoments as moments, fourierDomains as domains, fourierYMax, parseFourier } from '../lib/fourier.ts';
import { FOURIER_HBAR as hbar, FOURIER_MASS as electronMass, FOURIER_LENGTH_UNIT as xu, FOURIER_MOMENTUM_UNIT as pu, FOURIER_TIME_UNIT as tu, evolveFourierSI, fourierMomentsSI, fourierValueSI } from '../lib/fourier.ts';
import { FOURIER_P_SCALE, evolveFourierDisplay, fourierValueDisplay } from '../lib/fourier.ts';
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
// Harmonic-basis preparation: all pure states, interference, Fourier phases,
// covariance and exact FREE evolution (not exp[-i(n+1/2) omega t]).
const oscillatorPreparations = [
  ...Array.from({ length: 6 }, (_, n) => [{ n, amplitude: 1, phase: 0 }]),
  [{ n: 0, amplitude: 1, phase: 0 }, { n: 1, amplitude: 1, phase: 90 }],
  [{ n: 0, amplitude: .8, phase: 20 }, { n: 1, amplitude: .6, phase: -70 }, { n: 2, amplitude: .7, phase: -30 }, { n: 5, amplitude: .4, phase: 110 }],
];
for (const modes of oscillatorPreparations) for (const b of [.2, 1, 5]) for (const time of [0, .6, 2.315]) {
  const config = { ...base, shape: 'oscillator', sigma: b, center: .4, momentum: -.7, modes };
  const m = moments(evolveFourier(config, time));
  assert.ok(m.product >= .5 - 1e-10);
  if (modes.length === 1 && time === 0) near(m.product, modes[0].n + .5);
  for (const space of ['position', 'momentum']) {
    const mean = space === 'position' ? m.x : m.p, delta = space === 'position' ? m.dx : m.dp;
    const dx = 24 * delta / 3000;
    let norm = 0, first = 0, second = 0;
    for (let i = 0; i < 3000; i++) {
      const q = mean - 12 * delta + (i + .5) * dx, value = wave(q, space, config, time);
      norm += value.density * dx; first += q * value.density * dx; second += q ** 2 * value.density * dx;
      assert.ok(value.density < fourierYMax(space, 'density', config) + 1e-10);
    }
    near(norm, 1, 1e-8); near(first, mean, 1e-8); near(second - first ** 2, delta ** 2, 1e-7);
  }
}
const superposition = { ...base, shape: 'oscillator', sigma: .8, center: .7, momentum: .4, modes: oscillatorPreparations.at(-1) };
for (const time of [0, .8]) for (const x of [-1, .3, 2]) {
  let re = 0, im = 0;
  const step = 32 / 12000;
  for (let j = 0; j < 12000; j++) {
    const p = -16 + (j + .5) * step, value = wave(p, 'momentum', superposition, time);
    re += (value.real * Math.cos(p * x) - value.imaginary * Math.sin(p * x)) * step / Math.sqrt(2 * Math.PI);
    im += (value.real * Math.sin(p * x) + value.imaginary * Math.cos(p * x)) * step / Math.sqrt(2 * Math.PI);
  }
  const value = wave(x, 'position', superposition, time);
  near(value.real, re, 1e-9); near(value.imaginary, im, 1e-9);
}
for (let n = 0; n <= 5; n++) {
  const selected = parseFourier({ lab: 'fourier', fourierNumber: n });
  assert.equal(selected.fourierShape, 'oscillator');
  assert.equal(selected.fourierNumber, n);
}
for (const n of [-1, 6, .5, NaN, Infinity, '2']) assert.throws(() => parseFourier({ lab: 'fourier', fourierNumber: n }));
assert.throws(() => parseFourier({ lab: 'fourier', fourierNumber: 1, fourierShape: 'gaussian' }));
assert.throws(() => parseFourier({ lab: 'fourier', fourierNumber: 1, fourierChirpEnabled: true }));
const excited = { ...base, shape: 'oscillator', sigma: 1 };
near(moments(excited).product, 1.5, 1e-12);
near(wave(0, 'position', excited).density, 0, 1e-12);
assert.equal(parseFourier({ lab: 'fourier', fourierShape: 'oscillator' }).fourierShape, 'oscillator');
assert.throws(() => parseFourier({ lab: 'fourier', fourierModes: [{ n: 0, amplitude: 1 }] }));
assert.throws(() => parseFourier({ lab: 'fourier', fourierShape: 'oscillator', fourierChirpEnabled: true }));

// Fixed dimensionless axes describe the same physical state as the SI adapter,
// including amplitude Jacobians, nonzero mean momentum and free evolution.
for (const shape of ['gaussian', 'exponential', 'lorentzian']) for (const sigma of [.2, 1, 5]) for (const time of [0, 2]) {
  const display = { ...base, shape, sigma, center: 1.2, momentum: -2 };
  const physical = { ...display, momentum: display.momentum * FOURIER_P_SCALE };
  const evolved = evolveFourierDisplay(display, time), si = evolveFourierSI(physical, time);
  near(evolved.center, si.center); near(evolved.sigma, si.sigma);
  for (const space of ['position', 'momentum']) {
    const scale = space === 'position' ? 1 : FOURIER_P_SCALE;
    const expected = fourierValueSI(.4 * scale, space, physical, time);
    const value = fourierValueDisplay(.4, space, display, time);
    near(value.density, expected.density * scale);
    near(value.real, expected.real * Math.sqrt(scale));
    near(value.imaginary, expected.imaginary * Math.sqrt(scale));
  }
}
// Non-Gaussian amplitudes: normalization, Fourier phase and exact moments.
for (const shape of ['exponential', 'lorentzian']) {
  assert.equal(parseFourier({ lab: 'fourier', fourierShape: shape }).fourierShape, shape);
  assert.throws(() => parseFourier({ lab: 'fourier', fourierShape: shape, fourierChirpEnabled: true }));
  for (const sigma of [.2, 1, 5]) {
    const c = { ...base, shape, sigma, center: 1.3, momentum: -.8 };
    near(moments(c).product, 1 / Math.SQRT2);
    for (const time of [0, .7, 2.315]) {
      const measured = moments(evolveFourier(c, time));
      near(measured.dx ** 2, sigma ** 2 + time ** 2 / (2 * sigma ** 2));
      near(measured.dp, 1 / (Math.SQRT2 * sigma));
      const msi = fourierMomentsSI(evolveFourierSI(c, time));
      near(msi.dx ** 2, sigma ** 2 + (hbar * time * tu / (electronMass * xu ** 2)) ** 2 / (2 * sigma ** 2));
      for (const space of ['position', 'momentum']) {
        const mean = space === 'position' ? measured.x : measured.p;
        const delta = space === 'position' ? measured.dx : measured.dp;
        const step = 100 * delta / 16000;
        let norm = 0;
        for (let i = 0; i < 16000; i++) norm += wave(mean - 50 * delta + (i + .5) * step, space, c, time).density * step;
        near(norm, 1, .0003);
      }
      near(wave(.3, 'momentum', c, time).density, wave(.3, 'momentum', c).density);
    }
  }
  // Independent inverse Fourier quadrature, including translation and boost.
  const c = { ...base, shape, center: .4, momentum: .7 }, time = .6;
  for (const x of [-.7, .4, 1.1]) {
    const step = 120 / 120000;
    let re = 0, im = 0;
    for (let i = 0; i < 120000; i++) {
      const p = c.momentum - 60 + (i + .5) * step;
      const v = wave(p, 'momentum', c, time), phase = p * x;
      re += (v.real * Math.cos(phase) - v.imaginary * Math.sin(phase)) * step / Math.sqrt(2 * Math.PI);
      im += (v.real * Math.sin(phase) + v.imaginary * Math.cos(phase)) * step / Math.sqrt(2 * Math.PI);
    }
    const value = wave(x, 'position', c, time);
    near(value.real, re, .0001); near(value.imaginary, im, .0001);
  }
}
assert.throws(() => parseFourier({ lab: 'fourier', fourierShape: 'invalid' }));
// Check the SI adapter against dimensional formulas, not the reduced kernel.
for (const sigma of [.2, 1, 5]) for (const chirp of [-2, 0, 2]) for (const time of [0, 2, 20]) {
  const initial = { sigma, chirp, center: 1.3, momentum: -1.2 };
  const evolved = evolveFourierSI(initial, time), measured = fourierMomentsSI(evolved);
  const width = sigma * xu, t = time * tu, p0 = initial.momentum * pu;
  const variance = width ** 2 + hbar * chirp * t / electronMass + hbar ** 2 * (1 + chirp ** 2) * t ** 2 / (4 * electronMass ** 2 * width ** 2);
  near(evolved.center, initial.center + p0 * t / (electronMass * xu));
  near(evolved.sigma, Math.sqrt(variance) / xu);
  near(measured.dp, hbar * Math.hypot(1, chirp) / (2 * width * pu));
  near(measured.product / hbar, measured.dx * xu * measured.dp * pu / hbar);
  assert.ok(measured.product / hbar >= .5 - 1e-12);
  for (const space of ['position', 'momentum']) {
    const mean = space === 'position' ? measured.x : measured.p, delta = space === 'position' ? measured.dx : measured.dp;
    const step = 18 * delta / 2000;
    let norm = 0, first = 0, second = 0;
    for (let i = 0; i < 2000; i++) {
      const x = mean - 9 * delta + (i + .5) * step, value = fourierValueSI(x, space, initial, time);
      norm += value.density * step; first += x * value.density * step; second += x * x * value.density * step;
    }
    near(norm, 1); near(first, mean); near(second - first ** 2, delta ** 2, 1e-8);
  }
  const p = (initial.momentum + .3) * pu, d = 1 + chirp ** 2;
  const amplitude = (2 * width ** 2 / (Math.PI * hbar ** 2 * d)) ** .25 * Math.exp(-(width ** 2) * (p - p0) ** 2 / (hbar ** 2 * d)) * Math.sqrt(pu);
  const phase = .5 * Math.atan(chirp) - width ** 2 * (p - p0) ** 2 * chirp / (hbar ** 2 * d) - p * initial.center * xu / hbar - p * p * t / (2 * electronMass * hbar);
  const value = fourierValueSI(p / pu, 'momentum', initial, time);
  near(value.real, amplitude * Math.cos(phase)); near(value.imaginary, amplitude * Math.sin(phase));
}
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
assert.deepEqual(domains(base, 100, 3), { position: [-100, 100], momentum: [-3, 3] });
for (const extent of [1, 40, 100]) assert.equal(parseFourier({ lab: 'fourier', fourierMomentumWindow: extent }).fourierMomentumWindow, extent);
for (const extent of [0, 101, NaN, '5']) assert.throws(() => parseFourier({ lab: 'fourier', fourierMomentumWindow: extent }));
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
for (const center of [-400, -35, 35, 400]) assert.equal(parseFourier({ lab: 'fourier', fourierCenter: center }).fourierCenter, center);
for (const momentum of [-100, -40, 40, 100]) assert.equal(parseFourier({ lab: 'fourier', fourierMomentum: momentum }).fourierMomentum, momentum);
assert.equal(parseFourier({ lab: 'fourier', fourierSigma: 1.2, fourierView: 'complex' }).fourierSigma, 1.2);
assert.equal(parseFourier({ lab: 'fourier', time: 1, mode: 'evolution', finalTime: 4 }).time, 1);
for (const key of ['fourierPositionYMax', 'fourierMomentumYMax']) {
  for (const value of [.05, 1, 100]) assert.equal(parseFourier({ lab: 'fourier', [key]: value })[key], value);
  for (const value of [0, -.1, 100.1, NaN, Infinity, '1']) assert.throws(() => parseFourier({ lab: 'fourier', [key]: value }));
}
for (const bad of [{ fourierChirp: 0 }, { fourierChirp: 1 }, { fourierChirpEnabled: false }, { fourierChirpEnabled: true }, { fourierSigma: 0 }, { fourierSigma: .19 }, { fourierSigma: 5.1 }, { fourierSigma: NaN }, { fourierChirp: 3 }, { fourierCenter: -401 }, { fourierMomentum: 101 }, { fourierMomentum: '1' }, { fourierView: 'bad' }, { time: -1 }, { time: 21 }, { finalTime: 21 }, { time: 3, finalTime: 2 }, { fourierChirpEnabled: 'true' }, { fourierWindow: 0 }, { fourierWindow: 401 }, { playbackSpeed: 5 }, { mode: 'bad' }, { scale: 2 }]) assert.throws(() => parseFourier({ lab: 'fourier', ...bad }));
const app = readFileSync(new URL('../components/quantum-lab.tsx', import.meta.url), 'utf8');
assert.match(app, /useState<Lab>\('fourier'\)/);
assert.match(app, /<span>01<\/span><span>Fonctions d’ondes en <Formula>\$x\$<\/Formula> et <Formula>\$p\$<\/Formula>/);
assert.ok(app.indexOf('<span>01</span>') < app.indexOf('<span>02</span> Diffusion'));
assert.deepEqual([...app.matchAll(/<span>(0\d)<\/span>/g)].map(m => m[1]), ['01', '02', '03', '04', '05', '06', '07', '08', '09']);
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
assert.match(css, /\.sg-setup-bar\s*\{[^}]*max-width:\s*1440px;[^}]*margin:\s*16px auto 0;/, 'Stern–Gerlach setup is centered at the same width as the laboratory');
console.log('Fourier: complex transform, normalization, means, variances, free Schrödinger evolution, focusing, fixed axes, bounds and nine-lab ordering pass; SG setup width constrained.');
