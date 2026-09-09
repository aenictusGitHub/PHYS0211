import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { solveLinearWell, wellPositionElement, linearWellEigenfunction, projectWellState, evolveWellState, prepareLinearWellMoments } from '../lib/well-linear.ts';
import { wellCoefficients, normalizeCoefficients, wellEigenfunction } from '../lib/quantum.ts';
import { prepareWellMoments, wellMomentsAt, wellMomentHistory } from '../lib/well-observables.ts';

const close = (a, b, label, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b} (tol ${tolerance})`);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const weights = values => values.map(c => c.re ** 2 + c.im ** 2);
const reconstruct = (spectrum, evolved) => Array.from({ length: spectrum.states.length }, (_, k) => ({
  n: k + 1,
  re: evolved.reduce((sum, c, j) => sum + c.re * spectrum.states[j][k], 0),
  im: evolved.reduce((sum, c, j) => sum + c.im * spectrum.states[j][k], 0),
}));

const start = performance.now();
const flat = solveLinearWell(0);
for (let n = 1; n <= 8; n++) {
  close(flat.energies[n - 1], n * n, 'Unperturbed energy');
  for (const u of [0, .17, .31, .63, 1]) close(linearWellEigenfunction(flat.states[n - 1], u), wellEigenfunction(n, u), 'Unperturbed wavefunction');
}

const complexState = normalizeCoefficients(Array.from({ length: 10 }, (_, i) => ({ n: i + 1, re: Math.cos(.73 * i) / (i + 1), im: Math.sin(.37 * i) / (i + 1) })));
const initialStates = [wellCoefficients('low-pair'), wellCoefficients('high-pair'), wellCoefficients('parabola'), complexState];
for (const lambda of [-20, -6, -.1, 0, .1, 6, 20]) {
  const spectrum = solveLinearWell(lambda), larger = solveLinearWell(lambda, 64), mirrored = solveLinearWell(-lambda);
  for (let i = 0; i < spectrum.states.length; i++) {
    const state = spectrum.states[i];
    close(dot(state, state), 1, 'Normalized eigenvector');
    for (let j = 0; j < i; j++) close(dot(state, spectrum.states[j]), 0, 'Orthogonal eigenvectors');
    const residual = state.map((c, k) => ((k + 1) ** 2 - spectrum.energies[i]) * c + lambda * state.reduce((sum, d, j) => sum + (k === j ? 0 : wellPositionElement(k + 1, j + 1)) * d, 0));
    assert.ok(Math.max(...residual.map(Math.abs)) < 2e-10, 'Eigenvalue residual');
    close(spectrum.energies[i], mirrored.energies[i], 'Reflection leaves spectrum unchanged');
    if (i < 8) {
      close(spectrum.energies[i], larger.energies[i], '40/64-mode energy convergence', 2e-6);
      let previousSign = 0, nodes = 0;
      for (let j = 1; j < 1200; j++) {
        const u = j / 1200, phi = linearWellEigenfunction(state, u);
        close(phi ** 2, linearWellEigenfunction(mirrored.states[i], 1 - u) ** 2, 'Reflected probability density', 1e-8);
        if (Math.abs(phi) > 1e-8) { const sign = Math.sign(phi); if (previousSign && sign !== previousSign) nodes++; previousSign = sign; }
      }
      assert.equal(nodes, i, 'Correct number of internal nodes');
      close(linearWellEigenfunction(state, 0), 0, 'Left hard wall');
      close(linearWellEigenfunction(state, 1), 0, 'Right hard wall');
      // The moment builder accepts the full ordered spectral coefficient array.
      const eigenCoefficients = spectrum.states.map((_, j) => ({ n: j + 1, re: j === i ? 1 : 0, im: 0 }));
      const moments = prepareLinearWellMoments(spectrum, eigenCoefficients);
      close(wellMomentsAt(moments, .3).momentum, 0, 'Stationary state has zero mean momentum');
      assert.ok(wellMomentsAt(moments, .3).position > 0 && wellMomentsAt(moments, .3).position < 1);
    }
  }
  for (const initial of initialStates) {
    const projected = projectWellState(spectrum, initial), projectedLarge = projectWellState(larger, initial);
    close(weights(projected).reduce((a, b) => a + b), 1, 'Projection conserves norm');
    const initialPosition = wellMomentsAt(prepareWellMoments(initial), 0).position;
    const energy = weights(projected).reduce((sum, w, j) => sum + w * spectrum.energies[j], 0);
    const expectedEnergy = initial.reduce((sum, c) => sum + (c.re ** 2 + c.im ** 2) * c.n ** 2, 0) + lambda * (initialPosition - .5);
    close(energy, expectedEnergy, 'Energy contains the linear perturbation');
    const model = prepareLinearWellMoments(spectrum, projected), largerModel = prepareLinearWellMoments(larger, projectedLarge);
    for (const time of [0, .17, .83, 2.43, 2 * Math.PI]) {
      const evolved = evolveWellState(projected, time, spectrum.energies), sineCoefficients = reconstruct(spectrum, evolved);
      close(weights(evolved).reduce((a, b) => a + b), 1, 'Time evolution conserves norm');
      close(weights(evolved).reduce((sum, w, j) => sum + w * spectrum.energies[j], 0), energy, 'Time evolution conserves energy');
      const actual = wellMomentsAt(model, time), fromSines = wellMomentsAt(prepareWellMoments(sineCoefficients), 0), refined = wellMomentsAt(largerModel, time);
      close(actual.position, fromSines.position, 'Position uses the same evolved wavefunction');
      close(actual.momentum, fromSines.momentum, 'Momentum uses the same evolved wavefunction', 1e-8);
      close(actual.position, refined.position, 'Position basis convergence', 2e-6);
      close(actual.momentum, refined.momentum, 'Momentum basis convergence', 5e-5);
      const h = 1e-7, derivative = (wellMomentsAt(model, time + h).position - wellMomentsAt(model, time - h).position) / (2 * h);
      close(derivative, 2 * actual.momentum / Math.PI ** 2, 'Ehrenfest relation with the tilted well', 1e-6);
      for (const u of [0, .13, .27, .52, .78, 1]) {
        const at = sineCoefficients.reduce((sum, c) => ({ re: sum.re + c.re * wellEigenfunction(c.n, u), im: sum.im + c.im * wellEigenfunction(c.n, u) }), { re: 0, im: 0 });
        if (time === 0) {
          const expected = initial.reduce((sum, c) => ({ re: sum.re + c.re * wellEigenfunction(c.n, u), im: sum.im + c.im * wellEigenfunction(c.n, u) }), { re: 0, im: 0 });
          close(at.re, expected.re, 'Initial state unchanged, real part'); close(at.im, expected.im, 'Initial state unchanged, imaginary part');
        }
      }
    }
  }
}

const tilted = solveLinearWell(6), step = .0001, plus = solveLinearWell(6 + step), minus = solveLinearWell(6 - step);
for (let i = 0; i < 8; i++) {
  const state = tilted.states[i];
  const meanX = state.reduce((sum, c, n) => sum + c * state.reduce((s, d, m) => s + d * wellPositionElement(n + 1, m + 1), 0), 0);
  close((plus.energies[i] - minus.energies[i]) / (2 * step), meanX - .5, 'Hellmann–Feynman sign and units', 2e-8);
}
for (const initial of initialStates) {
  const unperturbedModel = prepareWellMoments(initial), projected = projectWellState(flat, initial), model = prepareLinearWellMoments(flat, projected);
  for (const time of [0, .6, 2.4]) {
    close(wellMomentsAt(model, time).position, wellMomentsAt(unperturbedModel, time).position, 'Off-state position regression');
    close(wellMomentsAt(model, time).momentum, wellMomentsAt(unperturbedModel, time).momentum, 'Off-state momentum regression');
  }
}
const model = prepareLinearWellMoments(tilted, projectWellState(tilted, initialStates[0]));
const history = wellMomentHistory(model, 2 * Math.PI, 4096);
assert.equal(history.length, 4097);
assert.ok(Math.abs(history[0].position - history.at(-1).position) > .001, 'No artificial 2π revival');
assert.ok(history.every(p => p.position >= 0 && p.position <= 1 && Number.isFinite(p.momentum)));
for (const invalid of [NaN, Infinity, -21, 21]) assert.throws(() => solveLinearWell(invalid));
console.log(`Linear well: spectra, nodes, boundaries, 40/64-mode convergence, normalization, energy conservation, unchanged initial states, moments, Ehrenfest, Hellmann–Feynman and unperturbed regressions pass (${((performance.now() - start) / 1000).toFixed(2)} s).`);
