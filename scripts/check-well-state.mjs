import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { wellCoefficients, wellDensity, wellEigenfunction } from '../lib/quantum.ts';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === './quantum' && context.parentURL?.endsWith('/well-state.ts') ? './quantum.ts' : specifier, context);
} });
const { customWellCoefficients, wellDensityCeiling, parseWellModes } = await import('../lib/well-state.ts');
const close = (a, b, label, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} versus ${b}`);
const integral = f => {
  const intervals = 2000, h = 1 / intervals;
  let sum = f(0) + f(1);
  for (let j = 1; j < intervals; j++) sum += (j % 2 ? 4 : 2) * f(j * h);
  return sum * h / 3;
};
const pair = customWellCoefficients([{ n: 1, amplitude: 1, phase: 0 }, { n: 2, amplitude: 1, phase: 0 }]);
for (let i = 0; i <= 100; i++) close(wellDensity(pair, i / 100, .3), wellDensity(wellCoefficients('low-pair'), i / 100, .3), 'Preset preserved');
const phased = customWellCoefficients([{ n: 1, amplitude: 1, phase: 0 }, { n: 2, amplitude: .7, phase: 90 }]);
const noPhase = customWellCoefficients([{ n: 1, amplitude: 1, phase: 0 }, { n: 2, amplitude: .7, phase: 0 }]);
for (let i = 0; i <= 100; i++) close(wellDensity(phased, i / 100, 0), wellDensity(noPhase, i / 100, -Math.PI / 6), 'Relative phase correctly shifts interference');
const general = customWellCoefficients(Array.from({ length: 10 }, (_, j) => ({ n: j + 1, amplitude: (j + 1) / 10, phase: (j - 4) * 36 })));
const tiny = customWellCoefficients([{ n: 1, amplitude: 1e-200, phase: 90 }, { n: 2, amplitude: 2e-200, phase: -90 }]);
for (const coefficients of [pair, phased, general, tiny]) {
  close(coefficients.reduce((sum, c) => sum + c.re ** 2 + c.im ** 2, 0), 1, 'Coefficients normalized');
  for (const width of [.5, 1, 2.3, 4]) {
    const basis = Array.from({ length: 241 }, (_, j) => coefficients.map(c => wellEigenfunction(c.n, j / 240, width)));
    const ceiling = wellDensityCeiling(coefficients, basis);
    for (const time of [0, .1, .47, 1.1, 2.7, 2 * Math.PI]) {
      // u=x/a: physical density integrates over a du, not du alone.
      close(integral(u => wellDensity(coefficients, u, time, width)), 1, 'Normalized probability in x/a');
      close(wellDensity(coefficients, 0, time, width), 0, 'Left wall');
      close(wellDensity(coefficients, 1, time, width), 0, 'Right wall');
      for (let j = 0; j <= 240; j++) assert.ok(wellDensity(coefficients, j / 240, time, width) / width <= ceiling + 1e-12, 'Phase-independent frame contains curve');
    }
  }
}
assert.deepEqual(parseWellModes([{ n: 1, amplitude: 1 }]), [{ n: 1, amplitude: 1, phase: 0 }]);
for (const modes of [[], [{ n: 1, amplitude: 0, phase: 0 }], [{ n: 11, amplitude: 1, phase: 0 }], [{ n: 1, amplitude: -1, phase: 0 }], [{ n: 1, amplitude: 1, phase: 181 }], [{ n: 1, amplitude: NaN, phase: 0 }], [{ n: 1, amplitude: 1, phase: Infinity }], [{ n: 1, amplitude: 1, phase: 0 }, { n: 1, amplitude: 1, phase: 90 }]]) assert.throws(() => customWellCoefficients(modes));
for (const modes of [null, {}, [null], [{ n: '1', amplitude: 1 }], [{ n: 1, amplitude: '1' }]]) assert.throws(() => parseWellModes(modes));
console.log('Infinite well: custom amplitudes/phases, stable normalization, dimensionless abscissa, hard walls and phase-independent density bounds pass.');
