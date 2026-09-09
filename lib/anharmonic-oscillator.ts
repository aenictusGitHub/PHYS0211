import type { Coefficient } from './quantum';

export const OSCILLATOR_BASIS_SIZE = 192;
export const ANHARMONIC_LIMIT = 1;
export const COHERENT_RADIUS = 2.5;
export const MAX_COHERENT_STATES = 6;
export type CoherentPacket = { re: number; im: number; amplitude: number; phase: number };
export type OscillatorSpectrum = { strength: number; frequency: number; energies: number[]; states: number[][] };

/** Normalized Hermite functions, evaluated by a stable three-term recurrence. */
export function oscillatorBasis(x: number, size = OSCILLATOR_BASIS_SIZE, frequency = 1) {
  x *= Math.sqrt(frequency);
  const values = new Array<number>(size);
  values[0] = (frequency / Math.PI) ** .25 * Math.exp(-x * x / 2);
  if (size > 1) values[1] = Math.SQRT2 * x * values[0];
  for (let n = 1; n < size - 1; n++) values[n + 1] = Math.sqrt(2 / (n + 1)) * x * values[n] - Math.sqrt(n / (n + 1)) * values[n - 1];
  return values;
}

/** Exact matrix elements of ξ⁴, before truncation (not the fourth power of a truncated ξ). */
export function quarticElement(i: number, j: number) {
  const n = Math.min(i, j), gap = Math.abs(i - j);
  if (gap === 0) return .75 * (2 * n * n + 2 * n + 1);
  if (gap === 2) return (2 * n + 3) / 2 * Math.sqrt((n + 1) * (n + 2));
  if (gap === 4) return .25 * Math.sqrt((n + 1) * (n + 2) * (n + 3) * (n + 4));
  return 0;
}

/** The physical frequency is unchanged; only the numerical Hermite basis is squeezed.
 * More momentum resolution is needed after a broad packet falls into a steep potential.
 */
export function oscillatorBasisFrequency(strength: number) { return Math.sqrt(1 + 72 * strength); }
export function oscillatorBasisSize(strength: number) { return strength <= .05 ? 192 : strength <= .25 ? 256 : strength <= .5 ? 384 : 448; }

export function oscillatorHamiltonianElement(i: number, j: number, strength: number, frequency: number) {
  const n = Math.min(i, j), gap = Math.abs(i - j);
  const quadratic = gap === 0 ? (n + .5) * (frequency + 1 / frequency) / 2
    : gap === 2 ? (1 / frequency - frequency) * Math.sqrt((n + 1) * (n + 2)) / 4 : 0;
  return quadratic + strength * quarticElement(i, j) / frequency ** 2;
}

/** Rayleigh–Ritz Hamiltonian H/(ℏω) = pξ²/2 + ξ²/2 + λξ⁴, cyclic Jacobi eigensolver. */
export function solveAnharmonicOscillator(strength: number, size = oscillatorBasisSize(strength)): OscillatorSpectrum {
  if (!Number.isFinite(strength) || strength < 0 || strength > ANHARMONIC_LIMIT || !Number.isInteger(size) || size < 16 || size > 576) throw new Error('Paramètres anharmoniques invalides.');
  const frequency = oscillatorBasisFrequency(strength);
  // Even and odd states decouple exactly; diagonalizing the two blocks reduces
  // latency and memory without altering any matrix element or eigenvalue.
  const levels = [0, 1].flatMap(parity => {
    const indices = Array.from({ length: Math.ceil((size - parity) / 2) }, (_, i) => 2 * i + parity);
    const matrix = indices.map(i => indices.map(j => oscillatorHamiltonianElement(i, j, strength, frequency)));
    return diagonalizeOscillatorBlock(matrix).map(level => ({ energy: level.energy,
      state: Array.from({ length: size }, (_, i) => i % 2 === parity ? level.state[(i - parity) / 2] : 0),
    }));
  }).sort((a, b) => a.energy - b.energy);
  return { strength, frequency, energies: levels.map(level => level.energy), states: levels.map((level, rank) => {
    const sign = level.state[rank] < 0 ? -1 : 1;
    return level.state.map(value => sign * value);
  }) };
}

function diagonalizeOscillatorBlock(matrix: number[][]) {
  const size = matrix.length;
  const vectors = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j): number => i === j ? 1 : 0));
  let converged = false;
  for (let sweep = 0; sweep < 50; sweep++) {
    let largest = 0;
    for (let p = 0; p < size - 1; p++) for (let q = p + 1; q < size; q++) {
      const off = matrix[p][q];
      largest = Math.max(largest, Math.abs(off));
      if (Math.abs(off) < 1e-13) continue;
      const tau = (matrix[q][q] - matrix[p][p]) / (2 * off);
      const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.hypot(1, tau));
      const c = 1 / Math.hypot(1, t), s = t * c;
      matrix[p][p] -= t * off;
      matrix[q][q] += t * off;
      matrix[p][q] = matrix[q][p] = 0;
      for (let k = 0; k < size; k++) {
        if (k !== p && k !== q) {
          const a = matrix[k][p], b = matrix[k][q];
          matrix[k][p] = matrix[p][k] = c * a - s * b;
          matrix[k][q] = matrix[q][k] = s * a + c * b;
        }
        const a = vectors[k][p], b = vectors[k][q];
        vectors[k][p] = c * a - s * b;
        vectors[k][q] = s * a + c * b;
      }
    }
    if (largest < 1e-12) { converged = true; break; }
  }
  if (!converged) throw new Error('La diagonalisation de l’oscillateur n’a pas convergé.');
  const order = Array.from({ length: size }, (_, i) => i).sort((a, b) => matrix[a][a] - matrix[b][b]);
  return order.map(i => ({ energy: matrix[i][i], state: vectors.map(row => row[i]) }));
}

export function boundCoherentPoint(re: number, im: number) {
  const factor = Math.min(1, COHERENT_RADIUS / Math.max(Math.hypot(re, im), 1e-15));
  return { re: re * factor, im: im * factor };
}

/** The coherent packets are NOT orthogonal: normalize only after summing amplitudes. */
export function coherentSuperposition(packets: readonly CoherentPacket[], size = OSCILLATOR_BASIS_SIZE): Coefficient[] {
  if (!packets.length || packets.length > MAX_COHERENT_STATES) throw new Error('Choisissez de un à six états cohérents.');
  const result = Array.from({ length: size }, (_, n) => ({ n, re: 0, im: 0 }));
  for (const packet of packets) {
    if (![packet.re, packet.im, packet.amplitude, packet.phase].every(Number.isFinite) || Math.hypot(packet.re, packet.im) > COHERENT_RADIUS + 1e-10 || packet.amplitude < 0 || packet.amplitude > 2) throw new Error('Paramètres des états cohérents invalides.');
    let re = Math.exp(-(packet.re ** 2 + packet.im ** 2) / 2), im = 0;
    const wr = packet.amplitude * Math.cos(packet.phase), wi = packet.amplitude * Math.sin(packet.phase);
    for (let n = 0; n < size; n++) {
      result[n].re += wr * re - wi * im;
      result[n].im += wr * im + wi * re;
      const next = (re * packet.re - im * packet.im) / Math.sqrt(n + 1);
      im = (re * packet.im + im * packet.re) / Math.sqrt(n + 1);
      re = next;
    }
  }
  const norm = Math.sqrt(result.reduce((sum, c) => sum + c.re ** 2 + c.im ** 2, 0));
  if (norm < 1e-8) throw new Error('La superposition s’annule. Modifiez une amplitude, une phase ou un point.');
  return result.map(c => ({ n: c.n, re: c.re / norm, im: c.im / norm }));
}

/** Project the prepared wavefunction on a squeezed Hermite basis by converged
 * trapezoidal quadrature on the real axis. Direct evaluation avoids the cancellation
 * instability of high-order squeeze-matrix recurrences at large frequency ratios.
 * No renormalization is applied, so truncation error remains measurable.
 */
export function rescaleOscillatorCoefficients(initial: readonly Coefficient[], frequency: number, size: number): Coefficient[] {
  const result = Array.from({ length: size }, (_, n) => ({ n, re: 0, im: 0 }));
  const occupied = initial.filter(c => Math.hypot(c.re, c.im) > 1e-18);
  if (frequency === 1) {
    for (const c of occupied) if (c.n < size) result[c.n] = { ...c };
    return result;
  }
  const highest = Math.max(0, ...occupied.map(c => c.n));
  const extent = Math.max(12, Math.sqrt(2 * (highest + 1)) + 6);
  const intervals = Math.ceil(2 * extent * Math.sqrt(Math.max(1, frequency)) / .02);
  const dx = 2 * extent / intervals;
  for (let j = 0; j <= intervals; j++) {
    const x = -extent + j * dx;
    const original = oscillatorBasis(x, highest + 1);
    let re = 0, im = 0;
    for (const c of occupied) { re += c.re * original[c.n]; im += c.im * original[c.n]; }
    if (Math.hypot(re, im) < 1e-18) continue;
    const basis = oscillatorBasis(x, size, frequency);
    const weight = j === 0 || j === intervals ? dx / 2 : dx;
    for (let n = 0; n < size; n++) {
      result[n].re += weight * re * basis[n];
      result[n].im += weight * im * basis[n];
    }
  }
  return result;
}
export function projectOscillatorState(spectrum: OscillatorSpectrum, initial: readonly Coefficient[], initialFrequency = 1) {
  const prepared = rescaleOscillatorCoefficients(initial, spectrum.frequency / initialFrequency, spectrum.states.length);
  return spectrum.states.map((state, n) => ({ n,
    re: prepared.reduce((sum, c) => sum + state[c.n] * c.re, 0),
    im: prepared.reduce((sum, c) => sum + state[c.n] * c.im, 0),
  }));
}

/** Returned coefficients use spectrum.frequency, not necessarily the physical harmonic basis. */
export function evolveAnharmonicState(spectrum: OscillatorSpectrum, projected: readonly Coefficient[], time: number) {
  const evolved = projected.map(c => {
    const angle = spectrum.energies[c.n] * time, cos = Math.cos(angle), sin = Math.sin(angle);
    return { re: c.re * cos + c.im * sin, im: c.im * cos - c.re * sin };
  });
  return spectrum.energies.map((_, n) => ({ n,
    re: spectrum.states.reduce((sum, state, j) => sum + state[n] * evolved[j].re, 0),
    im: spectrum.states.reduce((sum, state, j) => sum + state[n] * evolved[j].im, 0),
  }));
}

export function oscillatorMeanPosition(coefficients: readonly Coefficient[], frequency = 1) {
  return coefficients.slice(0, -1).reduce((sum, c, n) => sum + Math.sqrt(2 * (n + 1) / frequency) * (c.re * coefficients[n + 1].re + c.im * coefficients[n + 1].im), 0);
}
