import type { ExperimentCommand } from '../components/lab-types';

export type FourierConfig = { sigma: number; center: number; momentum: number; chirp: number };
export const FOURIER_DEFAULTS: FourierConfig = { sigma: 1, center: 0, momentum: 0, chirp: 0 };
export const FOURIER_SIGMA_MIN = .2;
export const FOURIER_SIGMA_MAX = 5;
export const FOURIER_CENTER_LIMIT = 8;
export const FOURIER_FINAL_TIME_MAX = 20;
export const FOURIER_WINDOW_DEFAULT = 35;
export const FOURIER_BOUNDS = { fourierSigma: [FOURIER_SIGMA_MIN, FOURIER_SIGMA_MAX], fourierCenter: [-FOURIER_CENTER_LIMIT, FOURIER_CENTER_LIMIT], fourierMomentum: [-FOURIER_CENTER_LIMIT, FOURIER_CENTER_LIMIT], fourierChirp: [-2, 2] } as const;

/** Normalized analytic Fourier pair, hbar=1, with convention
 * phi(p)=(2 pi)^(-1/2) integral psi(x) exp(-i p x) dx.
 * The quadratic phase changes momentum spread, not the position density. */
export function fourierValue(coordinate: number, space: 'position' | 'momentum', config: FourierConfig, time = 0): { real: number; imaginary: number; density: number } {
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
  const tau = time / (2 * config.sigma ** 2);
  return { ...config, center: config.center + config.momentum * time,
    sigma: config.sigma * Math.hypot(1 + config.chirp * tau, tau),
    chirp: config.chirp + (1 + config.chirp ** 2) * tau };
}

export function fourierMoments(config: FourierConfig) {
  const dx = config.sigma, dp = Math.hypot(1, config.chirp) / (2 * config.sigma);
  return { x: config.center, p: config.momentum, dx, dp, product: dx * dp, covariance: config.chirp / 2 };
}

export function fourierDomains(_config: FourierConfig, positionExtent = FOURIER_WINDOW_DEFAULT) {
  // Only the explicit viewport setting changes the position window.
  return { position: [-positionExtent, positionExtent] as [number, number], momentum: [-40, 40] as [number, number] };
}

export function fourierYMax(space: 'position' | 'momentum', view: 'density' | 'complex', config: FourierConfig) {
  const delta = space === 'position' ? config.sigma : fourierMoments(config).dp;
  const peak = 1 / (Math.sqrt(2 * Math.PI) * delta);
  const baseline = view === 'density' ? space === 'position' ? .9 : 1.8 : space === 'position' ? 1 : 1.4;
  return Math.max(baseline, Math.ceil(1.1 * (view === 'density' ? peak : Math.sqrt(peak)) * 10) / 10);
}

export function parseFourier(data: Record<string, unknown>): Omit<ExperimentCommand, 'id'> {
  if (data.lab !== 'fourier') throw new Error('Laboratoire fourier attendu.');
  const allowed = ['lab', ...Object.keys(FOURIER_BOUNDS), 'fourierView', 'fourierChirpEnabled', 'fourierWindow', 'mode', 'time', 'finalTime', 'playbackSpeed'];
  for (const key of Object.keys(data)) if (!allowed.includes(key)) throw new Error(`${key} n’est pas utilisé par le laboratoire de Fourier.`);
  for (const [key, [min, max]] of Object.entries(FOURIER_BOUNDS)) {
    const value = data[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new Error(`${key} doit être compris entre ${min} et ${max}.`);
  }
  if (data.fourierView !== undefined && data.fourierView !== 'density' && data.fourierView !== 'complex') throw new Error('fourierView doit valoir density ou complex.');
  if (data.fourierChirpEnabled !== undefined && typeof data.fourierChirpEnabled !== 'boolean') throw new Error('fourierChirpEnabled doit être booléen.');
  if (data.mode !== undefined && data.mode !== 'stationary' && data.mode !== 'evolution') throw new Error('Mode de Fourier invalide.');
  for (const [key, min, max] of [['time', 0, FOURIER_FINAL_TIME_MAX], ['finalTime', .1, FOURIER_FINAL_TIME_MAX], ['playbackSpeed', .25, 4], ['fourierWindow', 5, 400]] as const) {
    const value = data[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new Error(`${key} doit être compris entre ${min} et ${max}.`);
  }
  if (typeof data.time === 'number' && typeof data.finalTime === 'number' && data.time > data.finalTime) throw new Error('time doit être inférieur ou égal à finalTime.');
  return { ...data, lab: 'fourier', ...(data.fourierChirp !== undefined && data.fourierChirpEnabled === undefined ? { fourierChirpEnabled: true } : {}) } as Omit<ExperimentCommand, 'id'>;
}
