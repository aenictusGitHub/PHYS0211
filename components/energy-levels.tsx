'use client';

import { ScientificPlot } from '@/components/scientific-plot';
import { Math as Formula } from '@/components/math';
import { energyGuides } from '@/lib/energy-display';

export function EnergyLevels({ energies, selected, firstIndex = 0, indexSymbol = 'n', unit, label }: {
  energies: readonly number[]; selected: number | readonly number[]; firstIndex?: number; indexSymbol?: string; unit: string; label: string;
}) {
  const low = Math.min(0, ...energies), high = Math.max(0, ...energies);
  const padding = Math.max((high - low) * .06, 1e-6);
  return <section className="energy-levels" aria-label={label}>
    <p className="eyebrow">Niveaux d’énergie</p>
    <div className="plot-shell"><ScientificPlot ariaLabel={label} xDomain={[0, 1]} yDomain={[low - padding, high + padding]}
      xTicks={[]} xLabel="" yLabel={unit} series={[]} horizontalLines={energyGuides(energies, selected, firstIndex)} /></div>
    <p className="scale-note">Niveaux <Formula>{`$${indexSymbol}=${firstIndex},\\ldots,${firstIndex + energies.length - 1}$`}</Formula> en pointillés ; {typeof selected === 'number' ? 'niveau sélectionné' : 'niveaux occupés'} en vert. Échelle identique pour tous les niveaux à paramètres fixés.</p>
  </section>;
}
