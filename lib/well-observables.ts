import type { Coefficient } from './quantum';

export type WellMomentPair = { gap: number; re: number; im: number; position: number; momentumImaginary: number };
export type WellMomentModel = { center: number; pairs: WellMomentPair[]; momentumBound: number; maxFrequency: number };

/** Exact matrix elements in the sine basis, for u=x/a and q=pa/ℏ. */
export function prepareWellMoments(coefficients: readonly Coefficient[]): WellMomentModel {
  const pairs: WellMomentPair[] = [];
  let norm = 0, momentumBound = 0, maxFrequency = 0;
  coefficients.forEach((c, i) => {
    norm += c.re ** 2 + c.im ** 2;
    coefficients.slice(i + 1).forEach(d => {
      if ((c.n + d.n) % 2 === 0) return;
      const re = c.re * d.re + c.im * d.im, im = c.re * d.im - c.im * d.re;
      if (re === 0 && im === 0) return;
      const gap = c.n ** 2 - d.n ** 2;
      const position = -8 * c.n * d.n / (Math.PI ** 2 * gap ** 2);
      const momentumImaginary = -4 * c.n * d.n / gap;
      pairs.push({ gap, re, im, position, momentumImaginary });
      momentumBound += 2 * Math.abs(momentumImaginary) * Math.hypot(re, im);
      maxFrequency = Math.max(maxFrequency, Math.abs(gap));
    });
  });
  return { center: norm / 2, pairs, momentumBound, maxFrequency };
}

export function wellMomentsAt(model: WellMomentModel, time: number) {
  let position = model.center, momentum = 0;
  for (const pair of model.pairs) {
    const c = Math.cos(pair.gap * time), s = Math.sin(pair.gap * time);
    position += 2 * pair.position * (pair.re * c - pair.im * s);
    momentum -= 2 * pair.momentumImaginary * (pair.re * s + pair.im * c);
  }
  return { position, momentum };
}

/** Sample the exact means; an optional cap bounds the display cost of tiny high-energy tails. */
export function wellMomentHistory(model: WellMomentModel, endTime = 2 * Math.PI, maxIntervals = Infinity) {
  const intervals = Math.min(maxIntervals, Math.max(360, Math.ceil(24 * model.maxFrequency * endTime / (2 * Math.PI))));
  return Array.from({ length: intervals + 1 }, (_, j) => {
    const time = j * endTime / intervals;
    return { time, ...wellMomentsAt(model, time) };
  });
}
