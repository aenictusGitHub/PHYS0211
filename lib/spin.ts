import type { ExperimentCommand } from '../components/lab-types';
import { LAB_FINAL_TIME_MAX, parsePlaybackSettings } from './playback';

export type SpinAxis = 'x' | 'y' | 'z';
export type SpinField = SpinAxis | 'tilted';
export type Vector3 = [number, number, number];
export type Complex = { re: number; im: number };
export type Spinor = [Complex, Complex];
export const SPIN_TIME_MAX = 4 * Math.PI;
export const SPIN_PRESETS = [
  { id: 'spin-x-plus', label: '$+x$', theta: 90, phi: 0 },
  { id: 'spin-x-minus', label: '$-x$', theta: 90, phi: 180 },
  { id: 'spin-y-plus', label: '$+y$', theta: 90, phi: 90 },
  { id: 'spin-y-minus', label: '$-y$', theta: 90, phi: 270 },
  { id: 'spin-z-plus', label: '$+z$', theta: 0, phi: 0 },
  { id: 'spin-z-minus', label: '$-z$', theta: 180, phi: 0 },
] as const;

export function fieldVector(axis: SpinField): Vector3 {
  return axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : axis === 'z' ? [0, 0, 1] : [Math.SQRT1_2, 0, Math.SQRT1_2];
}

/** Angles in radians; phase is Ωt. Exact unitary evolution retains the global phase. */
export function evolveSpin(theta: number, phi: number, field: SpinField, phase: number): Spinor {
  const a = Math.cos(theta / 2), br = Math.sin(theta / 2) * Math.cos(phi), bi = Math.sin(theta / 2) * Math.sin(phi);
  const [x, y, z] = fieldVector(field), c = Math.cos(phase / 2), s = Math.sin(phase / 2);
  const qa = { re: z * a + x * br + y * bi, im: x * bi - y * br };
  const qb = { re: x * a - z * br, im: y * a - z * bi };
  return [{ re: c * a + s * qa.im, im: -s * qa.re }, { re: c * br + s * qb.im, im: c * bi - s * qb.re }];
}

export function blochVector([a, b]: Spinor): Vector3 {
  return [2 * (a.re * b.re + a.im * b.im), 2 * (a.re * b.im - a.im * b.re), a.re ** 2 + a.im ** 2 - b.re ** 2 - b.im ** 2];
}

export function probabilityPlus(vector: Vector3, axis: SpinAxis): number {
  return Math.max(0, Math.min(1, (1 + vector[{ x: 0, y: 1, z: 2 }[axis]]) / 2));
}

export function parseSpinExperiment(data: Record<string, unknown>): Omit<ExperimentCommand, 'id'> {
  const playback = parsePlaybackSettings(data);
  const bounds = { spinTheta: [0, 180], spinPhi: [0, 360], spinOmega: [.25, 3], time: [0, LAB_FINAL_TIME_MAX] } as const;
  for (const key of Object.keys(bounds) as Array<keyof typeof bounds>) {
    const v = data[key];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < bounds[key][0] || v > bounds[key][1])) throw new Error(`${key} doit être compris entre ${bounds[key][0]} et ${bounds[key][1]}.`);
  }
  if (data.spinField !== undefined && (typeof data.spinField !== 'string' || !['x', 'y', 'z', 'tilted'].includes(data.spinField))) throw new Error('spinField : x, y, z ou tilted.');
  if (data.spinMeasure !== undefined && (typeof data.spinMeasure !== 'string' || !['x', 'y', 'z'].includes(data.spinMeasure))) throw new Error('spinMeasure : x, y ou z.');
  if (data.preset !== undefined && !SPIN_PRESETS.some(p => p.id === data.preset)) throw new Error('État initial de spin inconnu.');
  if (data.mode !== undefined && data.mode !== 'evolution') throw new Error('Le spin utilise le mode evolution ; les états propres se préparent avec les directions ±x, ±y, ±z.');
  return { lab: 'spin', mode: 'evolution', spinTheta: data.spinTheta as number | undefined, spinPhi: data.spinPhi as number | undefined,
    spinOmega: data.spinOmega as number | undefined, spinField: data.spinField as SpinField | undefined, spinMeasure: data.spinMeasure as SpinAxis | undefined,
    preset: data.preset as string | undefined, time: data.time as number | undefined, ...playback };
}
