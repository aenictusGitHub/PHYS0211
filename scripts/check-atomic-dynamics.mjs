import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { angularWave, hydrogenWave, radialDistribution, angularDensity, radialExtent } from '../lib/atomic.ts';
import { harmonicEigenfunction } from '../lib/quantum.ts';
import { solveDoubleWell } from '../lib/double-well.ts';
import { eigenstateDomain, energyGuides } from '../lib/energy-display.ts';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(['./playback', './rotor-resolution'].includes(specifier) ? `${specifier}.ts` : specifier === './atomic' && context.parentURL?.endsWith('/atomic-dynamics.ts') ? './atomic.ts' : specifier, context);
} });
const { parseAtomicExperiment } = await import('../lib/atomic-command.ts');
const { ROTOR_PRESETS, HYDROGEN_PRESETS, relativeFactors, evolveSamples, basisDensityCeiling, polarSuperposition, radialSuperposition } = await import('../lib/atomic-dynamics.ts');
const close = (a, b, eps, name) => assert.ok(Math.abs(a - b) < eps, `${name}: ${a} versus ${b}`);
function integral(f, upper, intervals = 4000) {
  const h = upper / intervals;
  let sum = f(0) + f(upper);
  for (let i = 1; i < intervals; i++) sum += (i % 2 ? 4 : 2) * f(h * i);
  return sum * h / 3;
}
const phases = [0, .41, Math.PI / 2, Math.PI, 2 * Math.PI];
for (const preset of ROTOR_PRESETS) for (const phase of phases) {
  close(integral(theta => polarSuperposition(preset.terms, theta, phase), Math.PI), 1, 1e-9, 'Rotor norm');
  for (const theta of [.2, .8, 1.4, 2.6]) {
    let marginal = 0;
    const factors = relativeFactors(2, phase);
    for (let j = 0; j < 48; j++) {
      let re = 0, im = 0;
      preset.terms.forEach((term, k) => {
        const y = angularWave(term.l, term.m, theta, 2 * Math.PI * j / 48);
        re += y.re * factors[k].re - y.im * factors[k].im;
        im += y.re * factors[k].im + y.im * factors[k].re;
      });
      marginal += (re * re + im * im) * 2 * Math.PI / 48 * Math.sin(theta);
    }
    close(polarSuperposition(preset.terms, theta, phase), marginal, 1e-12, 'Exact azimuthal marginal');
  }
}
close(integral(theta => Math.cos(theta) * polarSuperposition(ROTOR_PRESETS[0].terms, theta, 0), Math.PI), 1 / Math.sqrt(3), 1e-9, 'Polar expectation');
close(integral(theta => Math.cos(theta) * polarSuperposition(ROTOR_PRESETS[0].terms, theta, Math.PI), Math.PI), -1 / Math.sqrt(3), 1e-9, 'Polar reversal');

for (const preset of HYDROGEN_PRESETS) for (const phase of phases) {
  const upper = radialExtent(Math.max(...preset.terms.map(term => term.n)));
  close(integral(r => radialSuperposition(preset.terms, r, phase), upper, 10000), 1, 2e-8, 'Hydrogen superposition norm');
  for (let r = 0; r < 100; r += .025) assert.ok(radialSuperposition(preset.terms, r, phase) < .6, 'Fixed radial frame contains evolving states');
}
close(integral(r => r * radialSuperposition(HYDROGEN_PRESETS[0].terms, r, 0), 100, 10000), 3.75 - 64 / (81 * Math.SQRT2), 2e-8, 'Breathing mean radius');
close(integral(r => r * radialSuperposition(HYDROGEN_PRESETS[0].terms, r, Math.PI), 100, 10000), 3.75 + 64 / (81 * Math.SQRT2), 2e-8, 'Breathing mean radius at half period');

for (const preset of HYDROGEN_PRESETS) {
  const samples = preset.terms.map(term => {
    const length = Math.max(...preset.terms.map(term => term.n)) ** 2 / 5;
    const values = Array.from({ length: 200 }, (_, j) => hydrogenWave(term, (.3 + j / 15) * length, .8 * length, 1.1 * length));
    return { real: Float64Array.from(values, v => v.re), imaginary: Float64Array.from(values, v => v.im) };
  });
  const ceiling = basisDensityCeiling(samples), initial = evolveSamples(samples, 0), end = evolveSamples(samples, 2 * Math.PI);
  let change = 0;
  const half = evolveSamples(samples, Math.PI);
  for (const phase of phases) {
    const frame = evolveSamples(samples, phase);
    for (let i = 0; i < frame.real.length; i++) assert.ok(frame.real[i] ** 2 + frame.imaginary[i] ** 2 <= ceiling + 1e-14, 'Fixed density reference bounds all phases');
  }
  for (let i = 0; i < initial.real.length; i++) {
    close(initial.real[i], end.real[i], 1e-14, 'Periodic real wave');
    close(initial.imaginary[i], end.imaginary[i], 1e-14, 'Periodic imaginary wave');
    change += Math.abs(initial.real[i] ** 2 + initial.imaginary[i] ** 2 - half.real[i] ** 2 - half.imaginary[i] ** 2);
  }
  const reference = initial.real.reduce((sum, value, i) => sum + value * value + initial.imaginary[i] ** 2, 0);
  assert.ok(change > .01 * reference && reference > 0, 'Every preset changes the spatial density');
}
for (let n = 1; n <= 5; n++) for (let l = 0; l < n; l++) for (let r = 0; r < 150; r += .1) assert.ok(radialDistribution(n, l, r) < .6);
for (let l = 0; l <= 5; l++) for (let m = -l; m <= l; m++) for (let j = 0; j <= 400; j++) {
  const theta = Math.PI * j / 400;
  assert.ok(2 * Math.PI * Math.sin(theta) * angularDensity(l, m, theta) < 2, 'Fixed polar frame contains all states');
}
const oscillator = Array.from({ length: 9 }, (_, n) => Float64Array.from({ length: 401 }, (_, j) => harmonicEigenfunction(n, -4 + 8 * j / 400)));
const oscillatorEnergies = oscillator.map((_, n) => n + .5);
const spectra = [{ states: oscillator, energies: oscillatorEnergies }, solveDoubleWell({ barrier: 3, separation: 1.5 }), solveDoubleWell({ barrier: 8, separation: .8 })];
for (const spectrum of spectra) for (const scale of [.5, 1, 3, 20]) {
  const domain = eigenstateDomain(spectrum.energies, spectrum.states, scale, 9);
  for (let n = 0; n < spectrum.states.length; n++) {
    for (const phi of spectrum.states[n]) for (const value of [phi, phi * phi]) {
      const y = spectrum.energies[n] + scale * value;
      assert.ok(y >= domain[0] && y <= domain[1], 'One common frame contains every n and both display modes');
    }
    const guides = energyGuides(spectrum.energies, n);
    assert.equal(guides.length, spectrum.energies.length);
    assert.ok(guides.every(line => line.dashed));
    assert.equal(guides[n].tone, 'teal');
  }
}
assert.equal(parseAtomicExperiment({ lab: 'rotor', preset: 'rotor-rotation', time: Math.PI }).mode, 'evolution');
assert.equal(parseAtomicExperiment({ lab: 'hydrogen', mode: 'evolution', preset: 'hydrogen-dipole' }).preset, 'hydrogen-dipole');
assert.throws(() => parseAtomicExperiment({ lab: 'hydrogen', mode: 'evolution', preset: 'rotor-polar' }));
assert.throws(() => parseAtomicExperiment({ lab: 'rotor', mode: 'evolution', time: -1 }));
console.log('Dynamics: norms, marginals, periods, visible interference, phase-independent bounds and commands pass.');
console.log('Common eigenstate scales contain every selected n; all energy levels are dashed.');
