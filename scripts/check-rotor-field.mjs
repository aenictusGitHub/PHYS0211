import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(['./atomic', './anharmonic-oscillator'].includes(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { solveRotorField, rotorCosineCoupling, rotorFieldEigenstate, prepareRotorField, evolveRotorField, rotorMoments, rotorPolarDensity } = await import('../lib/rotor-field.ts');
const { ROTOR_PRESETS, polarSuperposition, basisDensityCeiling, combineSamples } = await import('../lib/atomic-dynamics.ts');
const { sphericalHarmonic } = await import('../lib/atomic.ts');
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const integral = (fn, n = 1200) => {
  let sum = fn(0) + fn(Math.PI);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * fn(i * Math.PI / n);
  return sum * Math.PI / (3 * n);
};
const initialOf = preset => preset.terms.map(c => ({ l: c.l, m: c.m, re: 1 / Math.sqrt(2), im: 0 }));
for (const value of [-1, NaN, 11, Infinity]) assert.throws(() => solveRotorField(value));
const free = solveRotorField(0);
free.blocks.forEach(block => block.energies.forEach((e, i) => near(e, block.ells[i] * (block.ells[i] + 1))));
for (const preset of ROTOR_PRESETS) {
  const prepared = prepareRotorField(free, initialOf(preset));
  for (const t of [0, .5, Math.PI, 2 * Math.PI]) for (const theta of [.2, .7, 1.5, 2.9]) near(rotorPolarDensity(evolveRotorField(prepared, t), theta), polarSuperposition(preset.terms, theta, t));
}
const weak = solveRotorField(.001), weakGround = rotorFieldEigenstate(weak, 0, 0);
near(weak.blocks[0].energies[0], -(.001 ** 2) / 6, 1e-13);
near(rotorMoments(weakGround, .001).orientation, .001 / 3, 1e-10);
let maximumPolarDensity = 0;
for (const strength of [.1, 1, 2, 5, 10]) {
  const spectrum = solveRotorField(strength), reference = solveRotorField(strength, 32);
  assert.ok(spectrum.blocks[0].energies[0] < 0);
  for (let m = 0; m <= 5; m++) for (let l0 = m; l0 <= 5; l0++) {
    const block = spectrum.blocks[m], k = l0 - m, u = block.states[k];
    near(block.energies[k], reference.blocks[m].energies[k]);
    for (let q = 0; q < block.states.length; q++) near(u.reduce((sum, c, i) => sum + c * block.states[q][i], 0), k === q ? 1 : 0);
    for (let i = 0; i < u.length; i++) {
      const l = block.ells[i];
      const hu = l * (l + 1) * u[i] - strength * ((i > 0 ? rotorCosineCoupling(l - 1, m) * u[i - 1] : 0) + (i < u.length - 1 ? rotorCosineCoupling(l, m) * u[i + 1] : 0));
      near(hu, block.energies[k] * u[i]);
    }
    const wave = rotorFieldEigenstate(spectrum, l0, m), opposite = rotorFieldEigenstate(spectrum, l0, -m);
    const moments = rotorMoments(wave, strength);
    near(moments.norm, 1); near(moments.magnetic, m); near(moments.energy, block.energies[k]);
    near(integral(theta => rotorPolarDensity(wave, theta)), 1, 2e-8);
    near(integral(theta => Math.cos(theta) * rotorPolarDensity(wave, theta)), moments.orientation, 2e-8);
    for (let j = 0; j <= 180; j++) {
      const theta = j * Math.PI / 180, value = rotorPolarDensity(wave, theta);
      maximumPolarDensity = Math.max(maximumPolarDensity, value);
      near(value, rotorPolarDensity(opposite, theta));
    }
  }
  for (const preset of ROTOR_PRESETS) {
    const initial = initialOf(preset), prepared = prepareRotorField(spectrum, initial), ref = prepareRotorField(reference, initial);
    const before = rotorMoments(initial, strength), initialMap = new Map(initial.map(c => [`${c.l},${c.m}`, c]));
    const basis = prepared.basis.map(c => {
      const y = Array.from({ length: 37 }, (_, j) => sphericalHarmonic(c.l, c.m, j * Math.PI / 36, j * .7));
      return { real: Float64Array.from(y, v => v.re), imaginary: Float64Array.from(y, v => v.im) };
    });
    const ceiling = basisDensityCeiling(basis, prepared.bounds);
    for (const t of [0, .7, Math.PI, 2 * Math.PI, 20 * Math.PI]) {
      const wave = evolveRotorField(prepared, t), moments = rotorMoments(wave, strength);
      near(moments.norm, 1); near(moments.magnetic, before.magnetic); near(moments.energy, before.energy);
      near(integral(theta => rotorPolarDensity(wave, theta)), 1, 2e-8);
      const refWave = new Map(evolveRotorField(ref, t).map(c => [`${c.l},${c.m}`, c]));
      wave.forEach((c, i) => {
        assert.ok(Math.hypot(c.re, c.im) <= prepared.bounds[i] + 1e-12);
        const r = refWave.get(`${c.l},${c.m}`); near(c.re, r.re); near(c.im, r.im);
        if (t === 0) { near(c.re, initialMap.get(`${c.l},${c.m}`)?.re ?? 0); near(c.im, 0); }
      });
      const samples = combineSamples(basis, wave);
      samples.real.forEach((re, i) => assert.ok(re * re + samples.imaginary[i] ** 2 <= ceiling + 1e-12));
      for (let j = 0; j <= 180; j++) maximumPolarDensity = Math.max(maximumPolarDensity, rotorPolarDensity(wave, j * Math.PI / 180));
    }
    assert.ok(Math.abs(rotorMoments(evolveRotorField(prepared, .7), strength).orientation - before.orientation) > .001, 'The field changes orientation');
  }
}
assert.ok(maximumPolarDensity < 4, `Fixed polar frame contains all tested states: ${maximumPolarDensity}`);
console.log(`Rotor field: zero-field recovery, weak-field shift, eigen residuals, normalization, m/energy conservation, initial-state continuity, basis convergence and fixed surface bounds pass (polar peak ${maximumPolarDensity.toFixed(3)}).`);
