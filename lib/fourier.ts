import type { ExperimentCommand } from '../components/lab-types';

// SI: exact Planck constant and CODATA 2022 electron mass.
// https://physics.nist.gov/cuu/pdf/wall_2022.pdf
export const FOURIER_HBAR = 6.62607015e-34 / (2 * Math.PI);
export const FOURIER_MASS = 9.1093837139e-31;
export const FOURIER_LENGTH_UNIT = 1e-9; // nm
export const FOURIER_MOMENTUM_UNIT = 1e-25; // kg m / s
export const FOURIER_TIME_UNIT = 1e-15; // fs
export const FOURIER_P_SCALE = FOURIER_HBAR / (FOURIER_LENGTH_UNIT * FOURIER_MOMENTUM_UNIT);
export const FOURIER_T_SCALE = FOURIER_MASS * FOURIER_LENGTH_UNIT ** 2 / (FOURIER_HBAR * FOURIER_TIME_UNIT);

// Graph coordinates and preparation controls: X=x/ell, P=p*ell/hbar,
// with the fixed ell=1 nm. Time remains in fs. The kernel amplitudes include
// the Jacobian: |Psi(X)|²=ell|psi(x)|² and |Phi(P)|²=(hbar/ell)|phi(p)|².
export function evolveFourierDisplay(config: FourierConfig, timeFs: number) {
  return evolveFourier(config, timeFs / FOURIER_T_SCALE);
}
export function fourierValueDisplay(coordinate: number, space: 'position' | 'momentum', config: FourierConfig, timeFs = 0) {
  return fourierValue(coordinate, space, config, timeFs / FOURIER_T_SCALE);
}

// SI adapters retained for dimensional calculations and verification:
// coordinates/configuration in nm, 10^-25 kg m/s, and fs.
const toKernel = (config: FourierConfig) => ({ ...config, momentum: config.momentum / FOURIER_P_SCALE });
export function evolveFourierSI(config: FourierConfig, time: number): FourierConfig {
  const evolved = evolveFourier(toKernel(config), time / FOURIER_T_SCALE);
  return { ...evolved, momentum: config.momentum };
}
export function fourierMomentsSI(config: FourierConfig) {
  const moments = fourierMoments(toKernel(config));
  return { ...moments, p: moments.p * FOURIER_P_SCALE, dp: moments.dp * FOURIER_P_SCALE,
    product: moments.product * FOURIER_HBAR, covariance: moments.covariance * FOURIER_HBAR };
}
export function fourierValueSI(coordinate: number, space: 'position' | 'momentum', config: FourierConfig, time = 0) {
  const scale = space === 'position' ? 1 : FOURIER_P_SCALE;
  const value = fourierValue(coordinate / scale, space, toKernel(config), time / FOURIER_T_SCALE);
  // The Jacobian preserves unit area in each displayed coordinate. Thus the
  // plotted densities are in nm^-1 and (10^-25 kg m/s)^-1, respectively.
  return { real: value.real / Math.sqrt(scale), imaginary: value.imaginary / Math.sqrt(scale), density: value.density / scale };
}
export function fourierYMaxSI(space: 'position' | 'momentum', view: 'density' | 'complex', config: FourierConfig) {
  if (config.shape === 'oscillator') return fourierYMax(space, view, toKernel(config)) / (space === 'position' ? 1 : FOURIER_P_SCALE ** (view === 'density' ? 1 : .5));
  const delta = space === 'position' ? config.sigma : fourierMomentsSI(config).dp;
  const peak = config.shape && config.shape !== 'gaussian'
    ? fourierValueSI(space === 'position' ? config.center : config.momentum, space, config).density
    : 1 / (Math.sqrt(2 * Math.PI) * delta);
  const baseline = view === 'density' ? space === 'position' ? .9 : 1.8 : space === 'position' ? 1 : 1.4;
  return Math.max(baseline, Math.ceil(1.1 * (view === 'density' ? peak : Math.sqrt(peak)) * 10) / 10);
}


export type FourierShape = 'gaussian' | 'exponential' | 'lorentzian' | 'oscillator';
export type FourierMode = { n: number; amplitude: number; phase: number };
export const FOURIER_MODE_MAX = 5;
export const FOURIER_MODES_DEFAULT: FourierMode[] = [{ n: 1, amplitude: 1, phase: 0 }];
export type FourierConfig = { sigma: number; center: number; momentum: number; chirp: number; shape?: FourierShape; modes?: FourierMode[]; initialSigma?: number; elapsed?: number };
export const FOURIER_DEFAULTS: FourierConfig = { sigma: 1, center: 0, momentum: 0, chirp: 0 };
export const FOURIER_SIGMA_MIN = .2;
export const FOURIER_SIGMA_MAX = 5;
export const FOURIER_CENTER_LIMIT = 400;
export const FOURIER_MOMENTUM_LIMIT = 100;
export const FOURIER_FINAL_TIME_MAX = 20;
export const FOURIER_WINDOW_DEFAULT = 35;
export const FOURIER_MOMENTUM_WINDOW_DEFAULT = 40;
export const FOURIER_BOUNDS = { fourierSigma: [FOURIER_SIGMA_MIN, FOURIER_SIGMA_MAX], fourierCenter: [-FOURIER_CENTER_LIMIT, FOURIER_CENTER_LIMIT], fourierMomentum: [-FOURIER_MOMENTUM_LIMIT, FOURIER_MOMENTUM_LIMIT], fourierChirp: [-2, 2] } as const;

export function fourierModeCoefficients(modes = FOURIER_MODES_DEFAULT) {
  const norm = Math.hypot(...modes.map(mode => mode.amplitude));
  if (!(norm > 0)) throw new Error('Au moins une amplitude doit être non nulle.');
  return Array.from({ length: FOURIER_MODE_MAX + 1 }, (_, n) => {
    const mode = modes.find(value => value.n === n);
    const amplitude = (mode?.amplitude ?? 0) / norm, phase = (mode?.phase ?? 0) * Math.PI / 180;
    return { real: amplitude * Math.cos(phase), imaginary: amplitude * Math.sin(phase) };
  });
}

// Normalized Hermite functions, stable recurrence rather than large polynomials.
function oscillatorBasis(u: number) {
  const values = [Math.PI ** -.25 * Math.exp(-u * u / 2)];
  values.push(Math.SQRT2 * u * values[0]);
  for (let n = 1; n < FOURIER_MODE_MAX; n++) values.push(Math.sqrt(2 / (n + 1)) * u * values[n] - Math.sqrt(n / (n + 1)) * values[n - 1]);
  return values;
}

function oscillatorWave(coordinate: number, space: 'position' | 'momentum', config: FourierConfig, time: number) {
  const b = config.sigma, tau = time / (b * b), stretch = Math.hypot(1, tau);
  const y = coordinate - config.center - config.momentum * time;
  const position = space === 'position';
  const basis = oscillatorBasis(position ? y / (b * stretch) : b * (coordinate - config.momentum));
  let real = 0, imaginary = 0;
  fourierModeCoefficients(config.modes).forEach((c, n) => {
    // Exact free propagation of each Hermite–Gaussian mode, not HO time phases.
    const phase = position ? -(n + .5) * Math.atan(tau) : -n * Math.PI / 2;
    real += basis[n] * (c.real * Math.cos(phase) - c.imaginary * Math.sin(phase));
    imaginary += basis[n] * (c.real * Math.sin(phase) + c.imaginary * Math.cos(phase));
  });
  const factor = position ? 1 / Math.sqrt(b * stretch) : Math.sqrt(b);
  const phase = position ? config.momentum * (coordinate - config.center) - config.momentum ** 2 * time / 2 + y * y * tau / (2 * b * b * (1 + tau * tau))
    : -coordinate * config.center - coordinate * coordinate * time / 2;
  const re = factor * (real * Math.cos(phase) - imaginary * Math.sin(phase));
  const im = factor * (real * Math.sin(phase) + imaginary * Math.cos(phase));
  return { real: re, imaginary: im, density: factor * factor * (real * real + imaginary * imaginary) };
}

function oscillatorMoments(config: FourierConfig) {
  const c = fourierModeCoefficients(config.modes), b = config.initialSigma ?? config.sigma, time = config.elapsed ?? 0;
  let occupation = 0, ar = 0, ai = 0, a2r = 0, a2i = 0;
  c.forEach((v, n) => {
    occupation += n * (v.real ** 2 + v.imaginary ** 2);
    for (const d of [1, 2]) if (n >= d) {
      const left = c[n - d], weight = d === 1 ? Math.sqrt(n) : Math.sqrt(n * (n - 1));
      const re = weight * (left.real * v.real + left.imaginary * v.imaginary);
      const im = weight * (left.real * v.imaginary - left.imaginary * v.real);
      if (d === 1) { ar += re; ai += im; } else { a2r += re; a2i += im; }
    }
  });
  const offsetX = Math.SQRT2 * b * ar, offsetP = Math.SQRT2 * ai / b;
  const vx = b * b * (occupation + .5 + a2r) - offsetX ** 2;
  const vp = (occupation + .5 - a2r) / (b * b) - offsetP ** 2;
  const cov = a2i - offsetX * offsetP;
  const dx = Math.sqrt(Math.max(0, vx + 2 * time * cov + time * time * vp)), dp = Math.sqrt(Math.max(0, vp));
  return { x: config.center + offsetX + time * (config.momentum + offsetP), p: config.momentum + offsetP,
    dx, dp, product: dx * dp, covariance: cov + time * vp };
}

// Invert the analytic momentum amplitude after its exact free-particle phase.
// Work in the comoving frame: large x0/p0 never waste grid resolution.
// Cache one frame, not one transform per plotted point. The padded numerical
// domain is independent of both display windows; moments remain analytic.
let envelopeCache: { key: string; length: number; real: Float64Array; imaginary: Float64Array } | undefined;
function evolvedEnvelope(x: number, sigma: number, shape: FourierShape, time: number) {
  const key = `${shape}:${sigma}:${time}`;
  if (envelopeCache?.key !== key) {
    const length = Math.max(256 * sigma, 64 * Math.abs(time) / sigma);
    const n = 2 ** Math.ceil(Math.log2(Math.max(16384, length * 64 / sigma)));
    const real = new Float64Array(n), imaginary = new Float64Array(n);
    const a = shape === 'exponential' ? Math.SQRT2 * sigma : sigma;
    for (let i = 0; i < n; i++) {
      const q = 2 * Math.PI * (i < n / 2 ? i : i - n) / length;
      const amplitude = shape === 'exponential' ? Math.sqrt(2 * a / Math.PI) / (1 + (a * q) ** 2) : Math.sqrt(a) * Math.exp(-a * Math.abs(q));
      const phase = -q * q * time / 2;
      real[i] = amplitude * Math.cos(phase) * Math.sqrt(2 * Math.PI) / length;
      imaginary[i] = amplitude * Math.sin(phase) * Math.sqrt(2 * Math.PI) / length;
    }
    // Radix-2 inverse FFT, without the 1/N factor (included above via Δq).
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]]; }
    }
    for (let size = 2; size <= n; size *= 2) {
      const angle = 2 * Math.PI / size, cr = Math.cos(angle), ci = Math.sin(angle);
      for (let start = 0; start < n; start += size) {
        let wr = 1, wi = 0;
        for (let j = 0; j < size / 2; j++) {
          const lo = start + j, hi = lo + size / 2;
          const re = wr * real[hi] - wi * imaginary[hi], im = wr * imaginary[hi] + wi * real[hi];
          real[hi] = real[lo] - re; imaginary[hi] = imaginary[lo] - im;
          real[lo] += re; imaginary[lo] += im;
          const next = wr * cr - wi * ci; wi = wr * ci + wi * cr; wr = next;
        }
      }
    }
    envelopeCache = { key, length, real, imaginary };
  }
  const { length, real, imaginary } = envelopeCache;
  if (Math.abs(x) >= length / 2) return { real: 0, imaginary: 0 };
  const index = ((x / length + 1) % 1) * real.length, lo = Math.floor(index), hi = (lo + 1) % real.length, f = index - lo;
  return { real: real[lo] * (1 - f) + real[hi] * f, imaginary: imaginary[lo] * (1 - f) + imaginary[hi] * f };
}

/** Normalized Fourier pairs, hbar=1, with convention
 * phi(p)=(2 pi)^(-1/2) integral psi(x) exp(-i p x) dx.
 * Quadratic phase is supported by the Gaussian family only. */
export function fourierValue(coordinate: number, space: 'position' | 'momentum', config: FourierConfig, time = 0): { real: number; imaginary: number; density: number } {
  if (config.shape === 'oscillator') return oscillatorWave(coordinate, space, config, time);
  if (config.shape && config.shape !== 'gaussian') {
    const { sigma, center, momentum, shape } = config;
    const a = shape === 'exponential' ? Math.SQRT2 * sigma : sigma;
    if (space === 'position' && time !== 0) {
      const u = coordinate - center - momentum * time;
      const envelope = evolvedEnvelope(u, sigma, shape, time);
      const phase = momentum * (coordinate - center) - momentum ** 2 * time / 2;
      const real = envelope.real * Math.cos(phase) - envelope.imaginary * Math.sin(phase);
      const imaginary = envelope.real * Math.sin(phase) + envelope.imaginary * Math.cos(phase);
      return { real, imaginary, density: real ** 2 + imaginary ** 2 };
    }
    const u = coordinate - center, q = coordinate - momentum;
    const amplitude = space === 'position'
      ? shape === 'exponential' ? Math.exp(-Math.abs(u) / a) / Math.sqrt(a) : Math.sqrt(2 / (Math.PI * a)) / (1 + (u / a) ** 2)
      : shape === 'exponential' ? Math.sqrt(2 * a / Math.PI) / (1 + (a * q) ** 2) : Math.sqrt(a) * Math.exp(-a * Math.abs(q));
    const phase = space === 'position' ? momentum * u : -coordinate * center - coordinate ** 2 * time / 2;
    return { real: amplitude * Math.cos(phase), imaginary: amplitude * Math.sin(phase), density: amplitude ** 2 };
  }
  if (time !== 0) {
    const value = fourierValue(coordinate, space, space === 'position' ? evolveFourier(config, time) : config);
    const tau = time / (2 * config.sigma ** 2);
    const phase = space === 'position' ? config.momentum ** 2 * time / 2 - .5 * Math.atan2(tau, 1 + config.chirp * tau) : -(coordinate ** 2) * time / 2;
    return { real: value.real * Math.cos(phase) - value.imaginary * Math.sin(phase), imaginary: value.real * Math.sin(phase) + value.imaginary * Math.cos(phase), density: value.density };
  }
  const { sigma, center, momentum, chirp } = config;
  let amplitude: number, phase: number;
  if (space === 'position') {
    const u = coordinate - center;
    amplitude = (2 * Math.PI * sigma ** 2) ** -.25 * Math.exp(-u * u / (4 * sigma ** 2));
    phase = momentum * u + chirp * u * u / (4 * sigma ** 2);
  } else {
    const v = coordinate - momentum, denominator = 1 + chirp ** 2;
    amplitude = (2 * sigma ** 2 / Math.PI / denominator) ** .25 * Math.exp(-(sigma ** 2) * v * v / denominator);
    phase = .5 * Math.atan(chirp) - sigma ** 2 * v * v * chirp / denominator - coordinate * center;
  }
  return { real: amplitude * Math.cos(phase), imaginary: amplitude * Math.sin(phase), density: amplitude ** 2 };
}

/** Exact free evolution, hbar=m=1, including a contracting initial chirp. */
export function evolveFourier(config: FourierConfig, time: number): FourierConfig {
  if (config.shape === 'oscillator') {
    const evolved = { ...config, initialSigma: config.sigma, elapsed: time, chirp: 0 };
    return { ...evolved, sigma: oscillatorMoments(evolved).dx };
  }
  if (config.shape && config.shape !== 'gaussian') return { ...config, initialSigma: config.sigma, elapsed: time,
    center: config.center + config.momentum * time, sigma: Math.hypot(config.sigma, time / (Math.SQRT2 * config.sigma)), chirp: 0 };
  const tau = time / (2 * config.sigma ** 2);
  return { ...config, center: config.center + config.momentum * time,
    sigma: config.sigma * Math.hypot(1 + config.chirp * tau, tau),
    chirp: config.chirp + (1 + config.chirp ** 2) * tau };
}

export function fourierMoments(config: FourierConfig) {
  if (config.shape === 'oscillator') return oscillatorMoments(config);
  if (config.shape && config.shape !== 'gaussian') {
    const dx = config.sigma, dp = 1 / (Math.SQRT2 * (config.initialSigma ?? config.sigma));
    return { x: config.center, p: config.momentum, dx, dp, product: dx * dp, covariance: (config.elapsed ?? 0) * dp ** 2 };
  }
  const dx = config.sigma, dp = Math.hypot(1, config.chirp) / (2 * config.sigma);
  return { x: config.center, p: config.momentum, dx, dp, product: dx * dp, covariance: config.chirp / 2 };
}

export function fourierDomains(_config: FourierConfig, positionExtent = FOURIER_WINDOW_DEFAULT, momentumExtent = FOURIER_MOMENTUM_WINDOW_DEFAULT) {
  // Only the explicit viewport settings change either horizontal window.
  return { position: [-positionExtent, positionExtent] as [number, number], momentum: [-momentumExtent, momentumExtent] as [number, number] };
}

export function fourierYMax(space: 'position' | 'momentum', view: 'density' | 'complex', config: FourierConfig) {
  if (config.shape === 'oscillator') {
    // Cauchy–Schwarz bound over all active modes also covers their free phases.
    const coefficients = fourierModeCoefficients(config.modes);
    let bound = 0;
    for (let i = 0; i <= 256; i++) {
      const basis = oscillatorBasis(-8 + i / 16);
      bound = Math.max(bound, basis.reduce((sum, value, n) => sum + (Math.hypot(coefficients[n].real, coefficients[n].imaginary) > 0 ? value * value : 0), 0));
    }
    const peak = 1.05 * bound * (space === 'position' ? 1 / config.sigma : config.sigma);
    return Math.max(view === 'density' ? .9 : 1, 1.1 * (view === 'density' ? peak : Math.sqrt(peak)));
  }
  const delta = space === 'position' ? config.sigma : fourierMoments(config).dp;
  const peak = config.shape && config.shape !== 'gaussian'
    ? fourierValue(space === 'position' ? config.center : config.momentum, space, config).density
    : 1 / (Math.sqrt(2 * Math.PI) * delta);
  const baseline = view === 'density' ? space === 'position' ? .9 : 1.8 : space === 'position' ? 1 : 1.4;
  return Math.max(baseline, Math.ceil(1.1 * (view === 'density' ? peak : Math.sqrt(peak)) * 10) / 10);
}

export function parseFourier(data: Record<string, unknown>): Omit<ExperimentCommand, 'id'> {
  if (data.lab !== 'fourier') throw new Error('Laboratoire fourier attendu.');
  const allowed = ['lab', ...Object.keys(FOURIER_BOUNDS), 'fourierShape', 'fourierView', 'fourierChirpEnabled', 'fourierWindow', 'fourierMomentumWindow', 'mode', 'time', 'finalTime', 'playbackSpeed'];
  for (const key of Object.keys(data)) if (!allowed.includes(key)) throw new Error(`${key} n’est pas utilisé par le laboratoire de Fourier.`);
  for (const [key, [min, max]] of Object.entries(FOURIER_BOUNDS)) {
    const value = data[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new Error(`${key} doit être compris entre ${min} et ${max}.`);
  }
  if (data.fourierView !== undefined && data.fourierView !== 'density' && data.fourierView !== 'complex') throw new Error('fourierView doit valoir density ou complex.');
  if (data.fourierShape !== undefined && !['gaussian', 'exponential', 'lorentzian', 'oscillator'].includes(String(data.fourierShape))) throw new Error('Forme du paquet invalide.');
  if (data.fourierShape && data.fourierShape !== 'gaussian' && (data.fourierChirpEnabled === true || (data.fourierChirp !== undefined && data.fourierChirpEnabled !== false))) throw new Error('La phase quadratique est disponible pour la gaussienne uniquement.');
  if (data.fourierChirpEnabled !== undefined && typeof data.fourierChirpEnabled !== 'boolean') throw new Error('fourierChirpEnabled doit être booléen.');
  if (data.mode !== undefined && data.mode !== 'stationary' && data.mode !== 'evolution') throw new Error('Mode de Fourier invalide.');
  for (const [key, min, max] of [['time', 0, FOURIER_FINAL_TIME_MAX], ['finalTime', .1, FOURIER_FINAL_TIME_MAX], ['playbackSpeed', .25, 4], ['fourierWindow', 5, 400], ['fourierMomentumWindow', 1, 100]] as const) {
    const value = data[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new Error(`${key} doit être compris entre ${min} et ${max}.`);
  }
  if (typeof data.time === 'number' && typeof data.finalTime === 'number' && data.time > data.finalTime) throw new Error('time doit être inférieur ou égal à finalTime.');
  return { ...data, lab: 'fourier', ...(data.fourierChirp !== undefined && data.fourierChirpEnabled === undefined ? { fourierChirpEnabled: true } : {}) } as Omit<ExperimentCommand, 'id'>;
}
