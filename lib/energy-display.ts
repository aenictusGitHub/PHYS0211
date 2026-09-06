import type { GuideLine } from '../components/scientific-plot';

/** One common frame for every available eigenstate, in both display modes. */
export function eigenstateDomain(energies: readonly number[], states: readonly ArrayLike<number>[], scale: number, minimumTop = 0): [number, number] {
  let low = 0, high = minimumTop;
  for (let n = 0; n < energies.length; n++) {
    for (let j = 0; j < states[n].length; j++) {
      const phi = states[n][j];
      low = Math.min(low, energies[n] + scale * phi);
      high = Math.max(high, energies[n] + scale * phi, energies[n] + scale * phi * phi);
    }
  }
  const padding = Math.max(.35, (high - low) * .04);
  return [low < 0 ? low - padding : 0, high + padding];
}

export function energyGuides(energies: readonly number[], selected: number | readonly number[], firstIndex = 0): GuideLine[] {
  const selection = typeof selected === 'number' ? [selected] : selected;
  return energies.map((value, index) => ({ value, dashed: true,
    tone: selection.includes(index) ? 'teal' : 'muted', width: selection.includes(index) ? 2 : .85,
    // Close doublets cannot accommodate a label per level without overlap.
    label: index === selection[0] ? `$E_{${index + firstIndex}}$` : undefined,
  }));
}
