'use client';

import { ScientificPlot } from '@/components/scientific-plot';
import { Math as Formula } from '@/components/math';
import { energyGuides } from '@/lib/energy-display';
import { clipEnergyGuides } from '@/lib/plot-geometry';

export function EnergyLevels({ energies, selected, firstIndex = 0, indexSymbol = 'n', unit, label, potentialBox = false, boxTilt = 0 }: {
  energies: readonly number[]; selected: number | readonly number[]; firstIndex?: number; indexSymbol?: string; unit: string; label: string;
  potentialBox?: boolean; boxTilt?: number;
}) {
  const low = Math.min(0, ...energies, potentialBox ? -Math.abs(boxTilt) / 2 : 0), high = Math.max(0, ...energies, potentialBox ? Math.abs(boxTilt) / 2 : 0);
  const padding = Math.max((high - low) * .06, 1e-6);
  const guides = energyGuides(energies, selected, firstIndex);
  const visibleGuides = potentialBox
    ? clipEnergyGuides(guides, [{ x: 0, y: -boxTilt / 2 }, { x: 1, y: boxTilt / 2 }])
    : guides;
  return <section className="energy-levels" aria-label={label}>
    <p className="eyebrow">Niveaux d’énergie</p>
    <div className="plot-shell"><ScientificPlot ariaLabel={potentialBox ? `${label}, confinés entre les parois x/a égal à 0 et 1` : label} xDomain={potentialBox ? [-.12, 1.12] : [0, 1]} yDomain={[low - padding, high + padding]}
      xTicks={potentialBox ? [0, .25, .5, .75, 1] : []} xLabel={potentialBox ? '$x/a$' : ''} yLabel={unit}
      series={potentialBox ? [{ values: [{ x: 0, y: high + padding }, { x: 0, y: -boxTilt / 2 }, { x: 1, y: boxTilt / 2 }, { x: 1, y: high + padding }], tone: 'ink', width: 3 }] : []}
      bands={potentialBox ? [{ from: -.12, to: 0, tone: 'ink', fadeToward: 'right', opacity: .2 }, { from: 1, to: 1.12, tone: 'ink', fadeToward: 'left', opacity: .2 }] : []}
      verticalLines={potentialBox ? [{ value: 0, width: 0, label: String.raw`$V\to\infty$`, labelAbove: true }, { value: 1, width: 0, label: String.raw`$V\to\infty$`, labelAbove: true }] : []}
      horizontalLines={visibleGuides} /></div>
    <p className="scale-note">Niveaux <Formula>{`$${indexSymbol}=${firstIndex},\\ldots,${firstIndex + energies.length - 1}$`}</Formula> en pointillés ; {typeof selected === 'number' ? 'niveau sélectionné' : 'niveaux occupés'} en vert. {potentialBox ? 'Les pointillés s’arrêtent aux parois ou aux intersections avec le potentiel. ' : ''}Échelle identique pour tous les niveaux à paramètres fixés.</p>
  </section>;
}
