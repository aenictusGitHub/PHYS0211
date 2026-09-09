import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANHARMONIC_LIMIT, OSCILLATOR_BASIS_SIZE, solveAnharmonicOscillator,
  quarticElement, oscillatorBasis, coherentSuperposition, boundCoherentPoint, oscillatorHamiltonianElement,
  rescaleOscillatorCoefficients, oscillatorBasisSize,
  projectOscillatorState, evolveAnharmonicState, oscillatorMeanPosition,
} from '../lib/anharmonic-oscillator.ts';

const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const norm = c => c.reduce((sum, p) => sum + p.re ** 2 + p.im ** 2, 0);
const distance = (a, b) => Math.sqrt(b.reduce((sum, c, n) => sum + (c.re - (a[n]?.re ?? 0)) ** 2 + (c.im - (a[n]?.im ?? 0)) ** 2, 0));
const packet = (re, im = 0, amplitude = 1, phase = 0) => ({ re, im, amplitude, phase });

const harmonic = solveAnharmonicOscillator(0);
harmonic.energies.forEach((e, n) => near(e, n + .5));
harmonic.states.forEach((state, n) => state.forEach((v, j) => near(v, j === n ? 1 : 0)));
const weak = solveAnharmonicOscillator(1e-6);
for (let n = 0; n < 9; n++) near((weak.energies[n] - n - .5) / 1e-6, quarticElement(n, n), .006);
const spectrum = solveAnharmonicOscillator(ANHARMONIC_LIMIT);
for (let n = 0; n < 9; n++) {
  assert.ok(spectrum.energies[n] > n + .5);
  const state = spectrum.states[n];
  for (let j = 0; j < state.length; j++) if (n % 2 !== j % 2) near(state[j], 0);
  for (let m = 0; m < 9; m++) near(state.reduce((sum, v, j) => sum + v * spectrum.states[m][j], 0), n === m ? 1 : 0);
  const residual = state.map((v, i) => state.reduce((sum, c, j) => sum + oscillatorHamiltonianElement(i, j, ANHARMONIC_LIMIT, spectrum.frequency) * c, 0) - spectrum.energies[n] * v);
  assert.ok(Math.hypot(...residual) < 1e-9);
}

// Integrate independently on the spatial grid, including off-diagonal ξ⁴ elements.
for (const [n, m] of [[0, 0], [0, 2], [0, 4], [3, 3], [2, 4], [0, 1]]) {
  let integral = 0;
  for (let j = 0; j <= 2000; j++) { const x = -10 + j * .01, basis = oscillatorBasis(x, 9); integral += basis[n] * basis[m] * x ** 4 * .01; }
  near(integral, quarticElement(n, m));
}

const states = [
  [packet(2.5)], [packet(0, 2.5)], [packet(1.5, 2)],
  [packet(2), packet(-2, 0, 2, .7)],
  [packet(2.5), packet(2.4, 0, 1, Math.PI)],
];
const reference = solveAnharmonicOscillator(ANHARMONIC_LIMIT, spectrum.states.length + 96);
for (let n = 0; n < 9; n++) near(spectrum.energies[n], reference.energies[n]);
for (const packets of states) {
  const initial = coherentSuperposition(packets), projected = projectOscillatorState(spectrum, initial);
  near(norm(initial), 1); near(norm(projected), 1);
  const scaledInitial = rescaleOscillatorCoefficients(initial, spectrum.frequency, spectrum.states.length);
  assert.ok(distance(evolveAnharmonicState(spectrum, projected, 0), scaledInitial) < 1e-10, 'Changing the potential preserves the prepared state at t=0');
  const referenceInitial = projectOscillatorState(reference, initial);
  const energy = projected.reduce((sum, c, n) => sum + spectrum.energies[n] * (c.re ** 2 + c.im ** 2), 0);
  for (const time of [1, 2 * Math.PI, 20 * Math.PI]) {
    const frame = evolveAnharmonicState(spectrum, projected, time);
    near(norm(frame), 1);
    const again = projectOscillatorState(spectrum, frame, spectrum.frequency);
    near(again.reduce((sum, c, n) => sum + spectrum.energies[n] * (c.re ** 2 + c.im ** 2), 0), energy, 1e-9);
    assert.ok(distance(frame, evolveAnharmonicState(reference, referenceInitial, time)) < .001, 'Basis convergence through maximum playback time');
  }
}

// Verify the changed numerical width does not squeeze the physical prepared state.
for (const frequency of [1.1, 3, spectrum.frequency]) {
  const initial = coherentSuperposition([packet(2.5)]);
  const scaled = rescaleOscillatorCoefficients(initial, frequency, spectrum.states.length);
  near(norm(scaled), 1);
  near(oscillatorMeanPosition(scaled, frequency), Math.SQRT2 * 2.5);
  for (const x of [-6, -2, 0, 1, 3.5, 5, 6]) {
    const phi = oscillatorBasis(x, scaled.length, frequency);
    const re = scaled.reduce((s, c, j) => s + c.re * phi[j], 0);
    near(re, Math.PI ** (-.25) * Math.exp(-((x - Math.SQRT2 * 2.5) ** 2) / 2), 1e-9);
  }
}

// Check both sides of every adaptive-size boundary, as well as weak/strong endpoints.
for (const strength of [.05, .06, .25, .26, .5, .51]) {
  const model = solveAnharmonicOscillator(strength), larger = solveAnharmonicOscillator(strength, oscillatorBasisSize(strength) + 96);
  const initial = coherentSuperposition(states.at(-1));
  const a = projectOscillatorState(model, initial), b = projectOscillatorState(larger, initial);
  assert.ok(distance(evolveAnharmonicState(model, a, 20 * Math.PI), evolveAnharmonicState(larger, b, 20 * Math.PI)) < .001, `Convergence at lambda=${strength}`);
}
for (const value of [-.01, 1.01, NaN, Infinity]) assert.throws(() => solveAnharmonicOscillator(value));
assert.equal(ANHARMONIC_LIMIT, 1);

const single = coherentSuperposition([packet(1.5, 2)]), projected = projectOscillatorState(harmonic, single);
for (const time of [0, .4, 2, 2 * Math.PI]) near(oscillatorMeanPosition(evolveAnharmonicState(harmonic, projected, time)), Math.SQRT2 * (1.5 * Math.cos(time) + 2 * Math.sin(time)));
const plus = coherentSuperposition([packet(1), packet(-1)]), minus = coherentSuperposition([packet(1), packet(-1, 0, 1, Math.PI)]);
plus.forEach(c => { if (c.n % 2) near(Math.hypot(c.re, c.im), 0); });
minus.forEach(c => { if (!(c.n % 2)) near(Math.hypot(c.re, c.im), 0); });
assert.ok(distance(single, coherentSuperposition([packet(1.5, 2, .5), packet(1.5, 2, .5)])) < 1e-12);
assert.throws(() => coherentSuperposition([packet(1), packet(1, 0, 1, Math.PI)]), /annule/);
assert.throws(() => coherentSuperposition([packet(0, 0, 0)]), /annule/);
for (const invalid of [[], Array(7).fill(packet(0)), [packet(3)], [packet(NaN)], [packet(0, 0, -1)]]) assert.throws(() => coherentSuperposition(invalid));
near(Math.hypot(...Object.values(boundCoherentPoint(8, -6))), 2.5);

for (const file of ['atomic-clock', 'well-observables', 'scattering-lab', 'spin-lab', 'rotor-lab', 'double-well-lab', 'hydrogen-lab', 'harmonic-lab', 'infinite-well-lab']) {
  assert.doesNotMatch(readFileSync(new URL(`../components/${file}.tsx`, import.meta.url), 'utf8'), /href=["']https?:/);
}
console.log(`Oscillator: lambda 0–${ANHARMONIC_LIMIT}, adaptive ${OSCILLATOR_BASIS_SIZE}–${spectrum.states.length} states, squeezed-basis projection, parity, normalization, energy conservation and long-time convergence pass. Theory references removed.`);
