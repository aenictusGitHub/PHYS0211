import { sphericalHarmonic } from './atomic';
import { diagonalizeRealSymmetric } from './anharmonic-oscillator';

export const ROTOR_FIELD_MAX = 10;
export type RotorCoefficient = { l: number; m: number; re: number; im: number };
export type RotorFieldBlock = { m: number; ells: number[]; energies: number[]; states: number[][] };
export type RotorFieldSpectrum = { strength: number; blocks: RotorFieldBlock[] };
export type RotorFieldPreparation = {
  sectors: { m: number; block: RotorFieldBlock; projected: { re: number; im: number }[] }[];
  basis: { l: number; m: number }[];
  bounds: number[];
  referenceEnergy: number;
};

/** <l,m|cos(theta)|l+1,m>, with normalized Condon–Shortley harmonics. */
export function rotorCosineCoupling(l: number, m: number) {
  return Math.sqrt(((l + 1) ** 2 - m * m) / ((2 * l + 1) * (2 * l + 3)));
}

/** H/B = L²/hbar² − lambda cos(theta). Each signed m is conserved.
 * l=0…24 converges the low states and the two prepared packets for lambda≤10.
 */
export function solveRotorField(strength: number, maxL = 24): RotorFieldSpectrum {
  if (!Number.isFinite(strength) || strength < 0 || strength > ROTOR_FIELD_MAX || !Number.isInteger(maxL) || maxL < 8 || maxL > 38) throw new Error('Paramètres du champ orientant invalides.');
  const blocks = Array.from({ length: 6 }, (_, m) => {
    const ells = Array.from({ length: maxL - m + 1 }, (_, i) => m + i);
    const matrix = ells.map(l => ells.map(j => l === j ? l * (l + 1) : Math.abs(l - j) === 1 ? -strength * rotorCosineCoupling(Math.min(l, j), m) : 0));
    const eigen = diagonalizeRealSymmetric(matrix);
    return { m, ells, energies: eigen.map(item => item.energy), states: eigen.map((item, rank) => {
      const sign = item.state[rank] < 0 ? -1 : 1;
      return item.state.map(value => value * sign);
    }) };
  });
  return { strength, blocks };
}

export function rotorFieldEigenstate(spectrum: RotorFieldSpectrum, l0: number, m: number): RotorCoefficient[] {
  const block = spectrum.blocks[Math.abs(m)], rank = l0 - Math.abs(m);
  if (!block || !Number.isInteger(rank) || !block.states[rank]) throw new Error('État du rotateur invalide.');
  return block.ells.map((l, i) => ({ l, m, re: block.states[rank][i], im: 0 }));
}

/** Preserve the prepared zero-field wavefunction at t=0; do not renormalize. */
export function prepareRotorField(spectrum: RotorFieldSpectrum, initial: readonly RotorCoefficient[]): RotorFieldPreparation {
  if (!initial.length || initial.some(c => !Number.isInteger(c.l) || !Number.isInteger(c.m) || Math.abs(c.m) > c.l || !spectrum.blocks[Math.abs(c.m)]?.ells.includes(c.l) || !Number.isFinite(c.re) || !Number.isFinite(c.im))) throw new Error('État initial du rotateur invalide.');
  const sectors = [...new Set(initial.map(c => c.m))].sort((a, b) => a - b).map(m => {
    const block = spectrum.blocks[Math.abs(m)], terms = initial.filter(c => c.m === m);
    return { m, block, projected: block.states.map(state => ({
      re: terms.reduce((sum, c) => sum + state[c.l - Math.abs(m)] * c.re, 0),
      im: terms.reduce((sum, c) => sum + state[c.l - Math.abs(m)] * c.im, 0),
    })) };
  });
  return {
    sectors, referenceEnergy: spectrum.blocks[0].energies[0],
    basis: sectors.flatMap(({ m, block }) => block.ells.map(l => ({ l, m }))),
    bounds: sectors.flatMap(({ block, projected }) => block.ells.map((_, i) => projected.reduce((sum, c, k) => sum + Math.hypot(c.re, c.im) * Math.abs(block.states[k][i]), 0))),
  };
}

/** phase = 2Bt/hbar, the same clock as the free rotor; omit one common phase. */
export function evolveRotorField(prepared: RotorFieldPreparation, phase: number): RotorCoefficient[] {
  return prepared.sectors.flatMap(({ m, block, projected }) => {
    const factors = projected.map((c, k) => {
      const angle = (block.energies[k] - prepared.referenceEnergy) * phase / 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return { re: c.re * cos + c.im * sin, im: c.im * cos - c.re * sin };
    });
    return block.ells.map((l, i) => ({ l, m,
      re: factors.reduce((sum, c, k) => sum + block.states[k][i] * c.re, 0),
      im: factors.reduce((sum, c, k) => sum + block.states[k][i] * c.im, 0),
    }));
  });
}

export function rotorMoments(coefficients: readonly RotorCoefficient[], strength: number) {
  let norm = 0, angularMomentum2 = 0, magnetic = 0, orientation = 0;
  const byState = new Map(coefficients.map(c => [`${c.l},${c.m}`, c]));
  for (const c of coefficients) {
    const weight = c.re ** 2 + c.im ** 2;
    norm += weight; angularMomentum2 += c.l * (c.l + 1) * weight; magnetic += c.m * weight;
    const next = byState.get(`${c.l + 1},${c.m}`);
    if (next) orientation += 2 * rotorCosineCoupling(c.l, c.m) * (c.re * next.re + c.im * next.im);
  }
  return { norm, angularMomentum2, magnetic, orientation, energy: angularMomentum2 - strength * orientation };
}

/** Exact azimuthal integration: different signed m sectors do not interfere. */
export function rotorPolarDensity(coefficients: readonly RotorCoefficient[], theta: number) {
  const sectors = new Map<number, { re: number; im: number }>();
  for (const c of coefficients) {
    const y = sphericalHarmonic(c.l, c.m, theta, 0).re;
    const sum = sectors.get(c.m) ?? { re: 0, im: 0 };
    sum.re += c.re * y; sum.im += c.im * y; sectors.set(c.m, sum);
  }
  return 2 * Math.PI * Math.sin(theta) * [...sectors.values()].reduce((sum, c) => sum + c.re ** 2 + c.im ** 2, 0);
}
