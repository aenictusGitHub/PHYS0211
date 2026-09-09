import type { Coefficient } from './quantum';
import type { OscillatorSpectrum } from './anharmonic-oscillator';

type MomentTerm = { gap: number; xCos: number; xSin: number; pCos: number; pSin: number };
export type OscillatorMomentModel = { terms: MomentTerm[]; positionBound: number; momentumBound: number; maxFrequency: number };

/** Matrix elements of ξ and q=x₀p/ℏ, in the same eigenbasis as the density.
 * The numerical basis frequency is not the physical ω defining τ=ωt.
 * Parity makes both diagonal expectations zero, with or without λξ⁴.
 */
export function prepareOscillatorMoments(spectrum: OscillatorSpectrum, projected: readonly Coefficient[]): OscillatorMomentModel {
  const byGap = new Map<number, MomentTerm>();
  const occupied = projected.filter(c => Math.hypot(c.re, c.im) > 1e-15);
  const parity = spectrum.states.map(state => state.findIndex(value => value !== 0) % 2);
  const size = spectrum.states.length, frequency = spectrum.frequency;
  const xWeights = Array.from({ length: size - 1 }, (_, n) => Math.sqrt((n + 1) / (2 * frequency)));
  for (let i = 0; i < occupied.length; i++) for (let j = i + 1; j < occupied.length; j++) {
    const a = occupied[i], b = occupied[j];
    if (parity[a.n] === parity[b.n]) continue;
    const u = spectrum.states[a.n], v = spectrum.states[b.n];
    let x = 0, pImaginary = 0;
    for (let n = 0; n < size - 1; n++) {
      const up = u[n] * v[n + 1], down = u[n + 1] * v[n];
      x += xWeights[n] * (up + down);
      pImaginary += frequency * xWeights[n] * (down - up);
    }
    const re = a.re * b.re + a.im * b.im, im = a.re * b.im - a.im * b.re;
    // Discard only sub-roundoff contributions, far below the three-digit UI.
    if (2 * Math.hypot(re, im) * (Math.abs(x) + Math.abs(pImaginary)) < 1e-14) continue;
    const gap = spectrum.energies[a.n] - spectrum.energies[b.n];
    const term = byGap.get(gap) ?? { gap, xCos: 0, xSin: 0, pCos: 0, pSin: 0 };
    term.xCos += 2 * x * re; term.xSin -= 2 * x * im;
    term.pCos -= 2 * pImaginary * im; term.pSin -= 2 * pImaginary * re;
    byGap.set(gap, term);
  }
  const terms = [...byGap.values()];
  return {
    terms,
    positionBound: terms.reduce((sum, term) => sum + Math.hypot(term.xCos, term.xSin), 0),
    momentumBound: terms.reduce((sum, term) => sum + Math.hypot(term.pCos, term.pSin), 0),
    maxFrequency: Math.max(0, ...terms.map(term => Math.abs(term.gap))),
  };
}

export function oscillatorMomentsAt(model: OscillatorMomentModel, time: number) {
  let position = 0, momentum = 0;
  for (const term of model.terms) {
    const c = Math.cos(term.gap * time), s = Math.sin(term.gap * time);
    position += term.xCos * c + term.xSin * s;
    momentum += term.pCos * c + term.pSin * s;
  }
  return { position, momentum };
}

/** Cacheable history, independent of the live clock and graphical scale s.
 * Trigonometric recurrences avoid a full state evolution at every sample;
 * periodic exact rephasing prevents accumulated rotation roundoff.
 */
export function oscillatorMomentHistory(model: OscillatorMomentModel, endTime: number, maxIntervals = 8192) {
  if (!Number.isFinite(endTime) || endTime < 0 || !Number.isInteger(maxIntervals) || maxIntervals < 1) throw new Error('Durée ou résolution invalide.');
  if (endTime === 0) return [{ time: 0, ...oscillatorMomentsAt(model, 0) }];
  const intervals = Math.min(maxIntervals, Math.max(360, Math.ceil(24 * model.maxFrequency * endTime / (2 * Math.PI))));
  const position = new Float64Array(intervals + 1), momentum = new Float64Array(intervals + 1);
  const dt = endTime / intervals;
  for (const term of model.terms) {
    const dc = Math.cos(term.gap * dt), ds = Math.sin(term.gap * dt);
    let c = 1, s = 0;
    for (let j = 0; j <= intervals; j++) {
      if (j % 256 === 0) { c = Math.cos(term.gap * j * dt); s = Math.sin(term.gap * j * dt); }
      position[j] += term.xCos * c + term.xSin * s;
      momentum[j] += term.pCos * c + term.pSin * s;
      const next = c * dc - s * ds;
      s = s * dc + c * ds; c = next;
    }
  }
  return Array.from(position, (x, j) => ({ time: j * dt, position: x, momentum: momentum[j] }));
}
