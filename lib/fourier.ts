import type { ExperimentCommand } from '../components/lab-types';

export type FourierConfig = { sigma: number; center: number; momentum: number; chirp: number };
export const FOURIER_DEFAULTS: FourierConfig = { sigma: 1, center: 0, momentum: 0, chirp: 0 };
export const FOURIER_SIGMA_MIN = .2;
export const FOURIER_SIGMA_MAX = 5;
export const FOURIER_CENTER_LIMIT = 8;
export const FOURIER_BOUNDS = { fourierSigma: [FOURIER_SIGMA_MIN, FOURIER_SIGMA_MAX], fourierCenter: [-FOURIER_CENTER_LIMIT, FOURIER_CENTER_LIMIT], fourierMomentum: [-FOURIER_CENTER_LIMIT, FOURIER_CENTER_LIMIT], fourierChirp: [-2, 2] } as const;

/** Normalized analytic Fourier pair, hbar=1, with convention
 * phi(p)=(2 pi)^(-1/2) integral psi(x) exp(-i p x) dx.
 * The quadratic phase changes momentum spread, not the position density. */
export function fourierValue(coordinate: number, space: 'position' | 'momentum', config: FourierConfig) {
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

export function fourierMoments(config: FourierConfig) {
  const dx = config.sigma, dp = Math.hypot(1, config.chirp) / (2 * config.sigma);
  return { x: config.center, p: config.momentum, dx, dp, product: dx * dp, covariance: config.chirp / 2 };
}

export function fourierDomains(config: FourierConfig) {
  // Keep comparison axes fixed for the standard presets; extend only for
  // broader tails. Reserve the full translation range so dragging never zooms.
  const positionExtent = Math.ceil(FOURIER_CENTER_LIMIT + 5 * Math.max(2, config.sigma));
  const momentumExtent = Math.ceil(FOURIER_CENTER_LIMIT + 5 * Math.max(1, fourierMoments(config).dp));
  return { position: [-positionExtent, positionExtent] as [number, number], momentum: [-momentumExtent, momentumExtent] as [number, number] };
}

export function fourierYMax(space: 'position' | 'momentum', view: 'density' | 'complex', config: FourierConfig) {
  const delta = space === 'position' ? config.sigma : fourierMoments(config).dp;
  const peak = 1 / (Math.sqrt(2 * Math.PI) * delta);
  const baseline = view === 'density' ? space === 'position' ? .9 : 1.8 : space === 'position' ? 1 : 1.4;
  return Math.max(baseline, Math.ceil(1.1 * (view === 'density' ? peak : Math.sqrt(peak)) * 10) / 10);
}

export function parseFourier(data: Record<string, unknown>): Omit<ExperimentCommand, 'id'> {
  if (data.lab !== 'fourier') throw new Error('Laboratoire fourier attendu.');
  const allowed = ['lab', ...Object.keys(FOURIER_BOUNDS), 'fourierView'];
  for (const key of Object.keys(data)) if (!allowed.includes(key)) throw new Error(`${key} n’est pas utilisé par le laboratoire de Fourier.`);
  for (const [key, [min, max]] of Object.entries(FOURIER_BOUNDS)) {
    const value = data[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new Error(`${key} doit être compris entre ${min} et ${max}.`);
  }
  if (data.fourierView !== undefined && data.fourierView !== 'density' && data.fourierView !== 'complex') throw new Error('fourierView doit valoir density ou complex.');
  return { ...data, lab: 'fourier' } as Omit<ExperimentCommand, 'id'>;
}
