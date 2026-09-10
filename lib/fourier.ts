import type { ExperimentCommand } from '../components/lab-types';

export type FourierConfig = { sigma: number; center: number; momentum: number; chirp: number };
export const FOURIER_DEFAULTS: FourierConfig = { sigma: 1, center: 0, momentum: 0, chirp: 0 };
export const FOURIER_SIGMA_MIN = .5;
export const FOURIER_SIGMA_MAX = 2;
export const FOURIER_BOUNDS = { fourierSigma: [.5, 2], fourierCenter: [-2, 2], fourierMomentum: [-2, 2], fourierChirp: [-2, 2] } as const;

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
  // Reserve five standard deviations for EVERY allowed sigma: changing its
  // slider must not auto-zoom away the reciprocal change in widths.
  const momentumExtent = Math.ceil(2 + 5 * Math.hypot(1, config.chirp) / (2 * FOURIER_SIGMA_MIN));
  return { position: [-12, 12] as [number, number], momentum: [-momentumExtent, momentumExtent] as [number, number] };
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
