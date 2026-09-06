import assert from 'node:assert/strict';
import { solveDoubleWell, doubleWellFrame, doubleWellPotential, DOUBLE_WELL_DEFAULT, DOUBLE_WELL_INTERVALS } from '../lib/double-well.ts';

const close = (actual, expected, tolerance, message) => assert.ok(
  Math.abs(actual - expected) < tolerance, `${message}: ${actual} versus ${expected}`,
);
const configs = [DOUBLE_WELL_DEFAULT,
  { barrier: .5, separation: .8 }, { barrier: 8, separation: .8 },
  { barrier: .5, separation: 2.5 }, { barrier: 8, separation: 2.5 },
];

for (const config of configs) {
  const started = performance.now();
  const spectrum = solveDoubleWell(config);
  const finer = solveDoubleWell(config, 2 * DOUBLE_WELL_INTERVALS);
  const { states, energies, dx, x, potential } = spectrum;
  close(doubleWellPotential(config.separation, config), 0, 1e-14, 'Minimum');
  close(doubleWellPotential(0, config), config.barrier, 1e-14, 'Barrier height');
  for (let n = 0; n < states.length; n++) {
    assert.ok(Number.isFinite(energies[n]) && energies[n] > 0, 'Finite positive energy');
    if (n > 0) assert.ok(energies[n] > energies[n - 1], 'Ordered nondegenerate spectrum');
    const phi = states[n];
    let norm = 0, residual = 0;
    for (let j = 1; j < x.length - 1; j++) {
      norm += phi[j] ** 2 * dx;
      const hphi = -(phi[j + 1] - 2 * phi[j] + phi[j - 1]) / (2 * dx ** 2) + potential[j] * phi[j];
      residual += (hphi - energies[n] * phi[j]) ** 2 * dx;
      close(phi[j], (n % 2 === 0 ? 1 : -1) * phi[x.length - j - 1], 1e-9, 'Parity');
    }
    close(norm, 1, 1e-10, 'Eigenstate normalization');
    const edgeProbability = phi.reduce((sum, value, j) => sum + (Math.abs(x[j]) > 7 ? value ** 2 * dx : 0), 0);
    close(edgeProbability, 0, 1e-8, 'Negligible boundary tails');
    close(Math.sqrt(residual), 0, 1e-7, 'Hamiltonian residual');
    close(energies[n] / finer.energies[n], 1, .002, 'Grid convergence');
    for (let m = 0; m < n; m++) {
      const overlap = phi.reduce((sum, value, j) => sum + value * states[m][j] * dx, 0);
      close(overlap, 0, 1e-10, 'Orthogonality');
    }
  }
  const gap = energies[1] - energies[0];
  const fineGap = finer.energies[1] - finer.energies[0];
  close(gap / fineGap, 1, .006, 'Tunneling splitting convergence');
  const initial = doubleWellFrame(spectrum, 0, 'left');
  const mirror = doubleWellFrame(spectrum, Math.PI, 'left');
  const returned = doubleWellFrame(spectrum, 2 * Math.PI, 'left');
  const rightInitial = doubleWellFrame(spectrum, 0, 'right');
  assert.ok(initial.left > initial.right, 'Left preparation is actually on the left');
  close(initial.left, mirror.right, 1e-10, 'Half-period transfer');
  close(initial.left, returned.left, 1e-10, 'Full-period revival');
  close(initial.left, rightInitial.right, 1e-10, 'Right preparation mirrors the left');
  for (const phase of [0, .137, Math.PI / 2, Math.PI, 5.713, 2 * Math.PI]) {
    const frame = doubleWellFrame(spectrum, phase, 'left');
    close(frame.left + frame.right, 1, 1e-10, 'Total probability');
    assert.ok(frame.density.every(value => value >= 0 && Number.isFinite(value)), 'Finite nonnegative density');
  }
  close(doubleWellFrame(spectrum, Math.PI / 2, 'left').left, .5, 1e-10, 'Quarter-period balance');
  console.log(`Vb=${config.barrier}, a=${config.separation}: E0=${energies[0].toFixed(6)}, gap=${gap.toExponential(5)}, initial left=${initial.left.toFixed(6)} (${Math.round(performance.now() - started)} ms)`);
}
assert.throws(() => solveDoubleWell({ barrier: -1, separation: 1 }));
assert.throws(() => solveDoubleWell({ barrier: 1, separation: Number.NaN }));
console.log('Normalization, parity, orthogonality, residuals, grid convergence and tunneling dynamics pass.');
