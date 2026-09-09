/** Symmetric quartic double well, in units hbar = m = 1. */
export type DoubleWellConfig = { barrier: number; separation: number };
export type DoubleWellSide = 'left' | 'right';
export type DoubleWellInitialState = { lower: number; upperWeight: number; relativePhase: number };
export type DoubleWellSpectrum = {
  x: Float64Array;
  potential: Float64Array;
  energies: number[];
  states: Float64Array[];
  dx: number;
};

export const DOUBLE_WELL_DEFAULT: DoubleWellConfig = { barrier: 3, separation: 1.5 };
export const DOUBLE_WELL_LIMITS = { barrier: [0.5, 8], separation: [0.8, 2.5] } as const;
export const DOUBLE_WELL_STATES = 9;
export const DOUBLE_WELL_EXTENT = 8;
export const DOUBLE_WELL_INTERVALS = 1200;

export function doubleWellPotential(x: number, config: DoubleWellConfig) {
  return config.barrier * ((x / config.separation) ** 2 - 1) ** 2;
}

// Dirichlet finite differences on [-8, 8]. Bisection of the Sturm count
// isolates each eigenvalue without constructing a dense Hamiltonian.
export function solveDoubleWell(config: DoubleWellConfig, intervals = DOUBLE_WELL_INTERVALS): DoubleWellSpectrum {
  if (!Number.isFinite(config.barrier) || !Number.isFinite(config.separation)
    || config.barrier < 0.5 || config.barrier > 8 || config.separation < 0.8 || config.separation > 2.5) {
    throw new Error('Paramètres du double puits hors du domaine de calcul.');
  }
  if (!Number.isInteger(intervals) || intervals < 100 || intervals % 2 !== 0) {
    throw new Error('La grille doit avoir un nombre pair d’intervalles, supérieur ou égal à 100.');
  }
  const dx = 2 * DOUBLE_WELL_EXTENT / intervals;
  const size = intervals - 1;
  const x = Float64Array.from({ length: intervals + 1 }, (_, j) => -DOUBLE_WELL_EXTENT + j * dx);
  const potential = Float64Array.from(x, point => doubleWellPotential(point, config));
  const off = -0.5 / (dx * dx);
  const diagonal = Float64Array.from({ length: size }, (_, j) => -2 * off + potential[j + 1]);
  const countBelow = (energy: number) => {
    let pivot = diagonal[0] - energy;
    let count = pivot < 0 ? 1 : 0;
    for (let j = 1; j < size; j++) {
      if (Math.abs(pivot) < 1e-18) pivot = -1e-18;
      pivot = diagonal[j] - energy - off * off / pivot;
      if (pivot < 0) count++;
    }
    return count;
  };
  let upper = 16;
  while (countBelow(upper) < DOUBLE_WELL_STATES) upper *= 2;
  const energies: number[] = [];
  const vectors: Float64Array[] = [];
  for (let n = 0; n < DOUBLE_WELL_STATES; n++) {
    let low = 0, high = upper;
    for (let iteration = 0; iteration < 48; iteration++) {
      const middle = (low + high) / 2;
      if (countBelow(middle) <= n) low = middle;
      else high = middle;
    }
    const energy = (low + high) / 2;
    energies.push(energy);

    // Shifted inverse iteration. Enforcing parity prevents mixing of very
    // close symmetric/antisymmetric partners when the barrier is high.
    let vector = Float64Array.from({ length: size }, (_, j) => Math.sin((n + 1) * Math.PI * (j + 1) / intervals));
    const pivots = new Float64Array(size);
    const rhs = new Float64Array(size);
    const shift = energy + 1e-7;
    pivots[0] = diagonal[0] - shift;
    for (let j = 1; j < size; j++) pivots[j] = diagonal[j] - shift - off * off / pivots[j - 1];
    for (let iteration = 0; iteration < 6; iteration++) {
      rhs[0] = vector[0];
      for (let j = 1; j < size; j++) rhs[j] = vector[j] - off * rhs[j - 1] / pivots[j - 1];
      const next = new Float64Array(size);
      next[size - 1] = rhs[size - 1] / pivots[size - 1];
      for (let j = size - 2; j >= 0; j--) next[j] = (rhs[j] - off * next[j + 1]) / pivots[j];
      const parity = n % 2 === 0 ? 1 : -1;
      for (let j = 0; j <= Math.floor(size / 2); j++) {
        const opposite = size - 1 - j;
        const value = (next[j] + parity * next[opposite]) / 2;
        next[j] = value;
        next[opposite] = parity * value;
      }
      for (const previous of vectors) {
        let overlap = 0;
        for (let j = 0; j < size; j++) overlap += next[j] * previous[j] * dx;
        for (let j = 0; j < size; j++) next[j] -= overlap * previous[j];
      }
      let norm = 0;
      for (const value of next) norm += value * value * dx;
      const factor = 1 / Math.sqrt(norm);
      vector = Float64Array.from(next, value => value * factor);
    }
    // Positive at the strongest left-hand lobe: (phi_0 + phi_1)/sqrt(2)
    // is consequently concentrated on the left, for every barrier setting.
    let peak = 0;
    for (let j = 1; j < size / 2; j++) if (Math.abs(vector[j]) > Math.abs(vector[peak])) peak = j;
    if (vector[peak] < 0) vector = Float64Array.from(vector, value => -value);
    vectors.push(vector);
  }
  const states = vectors.map(vector => {
    const state = new Float64Array(intervals + 1);
    state.set(vector, 1);
    return state;
  });
  return { x, potential, energies, states, dx };
}

/** Relative phase giving constructive interference in the left half-space. */
export function doubleWellLeftPhase(spectrum: DoubleWellSpectrum, lower: number) {
  let overlap = 0;
  for (let j = 0; j < (spectrum.x.length - 1) / 2; j++) overlap += spectrum.states[lower][j] * spectrum.states[lower + 1][j];
  return overlap < 0 ? Math.PI : 0;
}

/** phase = (E_b - E_a)t/hbar. A global phase cancels from the density.
 * psi(0) = sqrt(1-p) phi_a + exp(i delta) sqrt(p) phi_b.
 */
export function doubleWellFrame(spectrum: DoubleWellSpectrum, phase: number, initial: DoubleWellSide | DoubleWellInitialState) {
  const { lower, upperWeight, relativePhase } = typeof initial === 'string'
    ? { lower: 0, upperWeight: .5, relativePhase: initial === 'left' ? 0 : Math.PI } : initial;
  if (!Number.isInteger(lower) || lower < 0 || lower % 2 !== 0 || lower + 1 >= spectrum.states.length
    || !Number.isFinite(upperWeight) || upperWeight < 0 || upperWeight > 1 || !Number.isFinite(relativePhase) || !Number.isFinite(phase)) {
    throw new Error('État initial du double puits invalide.');
  }
  const a = Math.sqrt(1 - upperWeight), b = Math.sqrt(upperWeight);
  const cosine = Math.cos(relativePhase - phase), sine = Math.sin(relativePhase - phase);
  const density = new Float64Array(spectrum.x.length);
  let left = 0, right = 0, meanX = 0;
  for (let j = 0; j < density.length; j++) {
    const re = a * spectrum.states[lower][j] + b * spectrum.states[lower + 1][j] * cosine;
    const im = b * spectrum.states[lower + 1][j] * sine;
    density[j] = re * re + im * im;
    const probability = density[j] * spectrum.dx;
    // Divide the sample exactly at the symmetry plane equally between halves.
    if (j < (density.length - 1) / 2) left += probability;
    else if (j > (density.length - 1) / 2) right += probability;
    else { left += probability / 2; right += probability / 2; }
    meanX += spectrum.x[j] * probability;
  }
  const meanEnergy = (1 - upperWeight) * spectrum.energies[lower] + upperWeight * spectrum.energies[lower + 1];
  return { density, left, right, meanX, meanEnergy };
}
