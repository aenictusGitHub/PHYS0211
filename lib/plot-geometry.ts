import type { GuideLine, PlotPoint } from '../components/scientific-plot';

/** Common energy axis with breathing room for both V(x) and state energies. */
export function potentialEnergyDomain(potential: readonly PlotPoint[], energies: readonly number[]): [number, number] {
  let low = 0, high = 0;
  for (const point of potential) { low = Math.min(low, point.y); high = Math.max(high, point.y); }
  for (const energy of energies) { low = Math.min(low, energy); high = Math.max(high, energy); }
  const padding = Math.max(.25, (high - low) * .1);
  return [low - padding, high + padding];
}

/** Keep energy guides only where E >= V(x), using the exact polyline drawn on
 * screen. Multiple allowed intervals stay disconnected (e.g. a double well).
 * Profiles must be ordered by x; repeated x coordinates are vertical walls.
 */
export function clipEnergyGuides(guides: readonly GuideLine[], potential: readonly PlotPoint[]): GuideLine[] {
  return guides.flatMap(guide => {
    const intervals: Array<[number, number]> = [];
    for (let i = 1; i < potential.length; i++) {
      const a = potential[i - 1], b = potential[i];
      if (b.x <= a.x || (a.y > guide.value && b.y > guide.value)) continue;
      let start = a.x, end = b.x;
      if (a.y > guide.value || b.y > guide.value) {
        const crossing = a.x + (guide.value - a.y) / (b.y - a.y) * (b.x - a.x);
        if (a.y > guide.value) start = crossing;
        else end = crossing;
      }
      if (guide.xRange) {
        start = Math.max(start, guide.xRange[0]);
        end = Math.min(end, guide.xRange[1]);
      }
      if (end <= start) continue;
      const last = intervals.at(-1);
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else intervals.push([start, end]);
    }
    return intervals.map((xRange, i) => ({
      ...guide,
      xRange,
      // A single annotation per level, outside the potential and wavefunction.
      label: i === intervals.length - 1 ? guide.label : undefined,
      labelOutside: true,
    }));
  });
}

/** Fraction of a fixed time window revealed by a moving cursor. */
export function revealFraction(value: number, domain: readonly [number, number]) {
  const span = domain[1] - domain[0];
  if (!(span > 0) || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, (value - domain[0]) / span));
}

/** Horizontal translation in data units, snapped to a control's step. */
export function dragPlotValue(startValue: number, pixelDelta: number, unitsPerPixel: number, min: number, max: number, step: number) {
  const value = startValue + pixelDelta * unitsPerPixel;
  return Number(Math.max(min, Math.min(max, Math.round(value / step) * step)).toFixed(10));
}
