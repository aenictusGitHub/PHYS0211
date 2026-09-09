import type { Coefficient } from './quantum';
import type { WellMomentModel, WellMomentPair } from './well-observables';

export const WELL_LINEAR_LIMIT = 20;
export const WELL_BASIS_SIZE = 40;

export type WellSpectrum = {
  strength: number;
  energies: number[];
  /** One real eigenvector per level, in the normalized unperturbed sine basis. */
  states: number[][];
};

/** Matrix elements of x/a. Centering the potential removes only an energy offset. */
export function wellPositionElement(n: number, m: number) {
  if (n === m) return .5;
  if ((n + m) % 2 === 0) return 0;
  return -8 * n * m / (Math.PI ** 2 * (n * n - m * m) ** 2);
}

/** H/E_ref = diag(n²) + λ(x/a − 1/2), with E_ref = π²ℏ²/(2ma²).
 * Cyclic Jacobi diagonalization retains Hermiticity and orthonormality, including
 * for strengths beyond the range of first-order perturbation theory.
 */
export function solveLinearWell(strength: number, size = WELL_BASIS_SIZE): WellSpectrum {
  if (!Number.isFinite(strength) || Math.abs(strength) > WELL_LINEAR_LIMIT || !Number.isInteger(size) || size < 10 || size > 100) {
    throw new Error('Paramètres du puits perturbé invalides.');
  }
  const matrix = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) =>
    i === j ? (i + 1) ** 2 : strength * wellPositionElement(i + 1, j + 1)));
  const vectors = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j): number => i === j ? 1 : 0));
  let converged = false;
  for (let sweep = 0; sweep < 40; sweep++) {
    let largest = 0;
    for (let p = 0; p < size - 1; p++) {
      for (let q = p + 1; q < size; q++) {
        const off = matrix[p][q];
        largest = Math.max(largest, Math.abs(off));
        if (Math.abs(off) < 1e-13) continue;
        const tau = (matrix[q][q] - matrix[p][p]) / (2 * off);
        const tangent = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.hypot(1, tau));
        const cosine = 1 / Math.hypot(1, tangent), sine = tangent * cosine;
        matrix[p][p] -= tangent * off;
        matrix[q][q] += tangent * off;
        matrix[p][q] = matrix[q][p] = 0;
        for (let k = 0; k < size; k++) {
          if (k !== p && k !== q) {
            const a = matrix[k][p], b = matrix[k][q];
            matrix[k][p] = matrix[p][k] = cosine * a - sine * b;
            matrix[k][q] = matrix[q][k] = sine * a + cosine * b;
          }
          const a = vectors[k][p], b = vectors[k][q];
          vectors[k][p] = cosine * a - sine * b;
          vectors[k][q] = sine * a + cosine * b;
        }
      }
    }
    if (largest < 1e-12) { converged = true; break; }
  }
  if (!converged) throw new Error('La diagonalisation du puits n’a pas convergé.');
  const order = Array.from({ length: size }, (_, i) => i).sort((a, b) => matrix[a][a] - matrix[b][b]);
  return {
    strength,
    energies: order.map(i => matrix[i][i]),
    states: order.map((i, rank) => {
      // Fix the otherwise arbitrary global sign, continuously from λ=0.
      const sign = vectors[rank][i] < 0 ? -1 : 1;
      return vectors.map(row => sign * row[i]);
    }),
  };
}

export function linearWellEigenfunction(state: readonly number[], u: number, width = 1) {
  if (u <= 0 || u >= 1) return 0;
  return Math.sqrt(2 / width) * state.reduce((sum, value, i) => sum + value * Math.sin((i + 1) * Math.PI * u), 0);
}

/** Preserve the specified initial wavefunction when the potential is changed. */
export function projectWellState(spectrum: WellSpectrum, initial: readonly Coefficient[]): Coefficient[] {
  return spectrum.states.map((state, i) => ({
    n: i + 1,
    re: initial.reduce((sum, c) => sum + state[c.n - 1] * c.re, 0),
    im: initial.reduce((sum, c) => sum + state[c.n - 1] * c.im, 0),
  }));
}

export function evolveWellState(coefficients: readonly Coefficient[], time: number, energies?: readonly number[]) {
  return coefficients.map(c => {
    const angle = (energies?.[c.n - 1] ?? c.n ** 2) * time;
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    return { n: c.n, re: c.re * cosine + c.im * sine, im: c.im * cosine - c.re * sine };
  });
}

/** Transform the analytic position and momentum matrices to the tilted basis. */
export function prepareLinearWellMoments(spectrum: WellSpectrum, projected: readonly Coefficient[]): WellMomentModel {
  const size = spectrum.states.length;
  const xTimesStates = spectrum.states.map(state => Array.from({ length: size }, (_, k) =>
    state.reduce((sum, value, j) => sum + wellPositionElement(k + 1, j + 1) * value, 0)));
  const pTimesStates = spectrum.states.map(state => Array.from({ length: size }, (_, k) =>
    state.reduce((sum, value, j) => sum + ((k + j) % 2 === 0 ? 0 : -4 * (k + 1) * (j + 1) / ((k + 1) ** 2 - (j + 1) ** 2)) * value, 0)));
  const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  let center = 0, momentumBound = 0, maxFrequency = 0;
  const pairs: WellMomentPair[] = [];
  projected.forEach((c, i) => {
    center += (c.re ** 2 + c.im ** 2) * dot(spectrum.states[i], xTimesStates[i]);
    projected.slice(i + 1).forEach((d, offset) => {
      const j = i + 1 + offset;
      const re = c.re * d.re + c.im * d.im, im = c.re * d.im - c.im * d.re;
      if (re === 0 && im === 0) return;
      const position = dot(spectrum.states[i], xTimesStates[j]);
      const momentumImaginary = dot(spectrum.states[i], pTimesStates[j]);
      const gap = spectrum.energies[i] - spectrum.energies[j];
      pairs.push({ gap, re, im, position, momentumImaginary });
      momentumBound += 2 * Math.abs(momentumImaginary) * Math.hypot(re, im);
      maxFrequency = Math.max(maxFrequency, Math.abs(gap));
    });
  });
  return { center, pairs, momentumBound, maxFrequency };
}
