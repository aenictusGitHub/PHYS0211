import { normalizeCoefficients, type Coefficient } from './quantum';

export const WELL_CUSTOM_MODE_COUNT = 10;
export type WellModeInput = { n: number; amplitude: number; phase: number };

// Text inputs avoid the browser's automatic French number localization.
export function dotDecimalText(value: string): string {
  return value.replaceAll(',', '.');
}

export function parseDecimalInput(value: string): number {
  const text = dotDecimalText(value).trim();
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) ? Number(text) : NaN;
}

export function parseWellModes(input: unknown): WellModeInput[] {
  if (!Array.isArray(input)) throw new Error('wellModes doit être une liste de modes.');
  const modes = input.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Chaque mode doit préciser n, amplitude et phase.');
    return { n: value.n, amplitude: value.amplitude, phase: value.phase ?? 0 } as WellModeInput;
  });
  customWellCoefficients(modes);
  return modes;
}

/** Relative amplitudes and phases in degrees; the zero vector is not a state. */
export function customWellCoefficients(modes: readonly WellModeInput[]): Coefficient[] {
  if (modes.length < 1 || modes.length > WELL_CUSTOM_MODE_COUNT) throw new Error('Choisissez entre 1 et 10 modes.');
  const seen = new Set<number>();
  const coefficients = modes.map(({ n, amplitude, phase }) => {
    if (!Number.isInteger(n) || n < 1 || n > WELL_CUSTOM_MODE_COUNT || seen.has(n)) throw new Error('Chaque mode n doit être unique et compris entre 1 et 10.');
    seen.add(n);
    if (!Number.isFinite(amplitude) || amplitude < 0 || amplitude > 1) throw new Error('Les amplitudes doivent être comprises entre 0 et 1.');
    if (!Number.isFinite(phase) || phase < -180 || phase > 180) throw new Error('Les phases doivent être comprises entre -180° et 180°.');
    const angle = phase * Math.PI / 180;
    return { n, re: amplitude * Math.cos(angle), im: amplitude * Math.sin(angle) };
  }).filter(c => c.re !== 0 || c.im !== 0);
  if (!coefficients.length) throw new Error('Au moins une amplitude doit être non nulle. L’état précédent reste affiché.');
  const maximum = Math.max(...coefficients.map(c => Math.hypot(c.re, c.im)));
  return normalizeCoefficients(coefficients.map(c => ({ n: c.n, re: c.re / maximum, im: c.im / maximum })));
}

/** Triangle-inequality bound: valid for every phase, not only sampled times. */
export function wellDensityCeiling(coefficients: readonly Coefficient[], basis: readonly (readonly number[])[]): number {
  return Math.max(0, ...basis.map(row => row.reduce((sum, phi, i) => sum + Math.hypot(coefficients[i].re, coefficients[i].im) * Math.abs(phi), 0) ** 2));
}
