'use client';

import { useMemo } from 'react';
import { Math as Formula } from '@/components/math';
import { ScientificPlot, type PlotSeries } from '@/components/scientific-plot';
import { TAU_MAX, type Coefficient } from '@/lib/quantum';
import { prepareWellMoments, wellMomentHistory, wellMomentsAt, type WellMomentModel } from '@/lib/well-observables';

const fixed = (value: number) => (Math.abs(value) < .0005 ? 0 : value).toFixed(3);

export function WellObservables({ coefficients, time, finalTime = TAU_MAX, momentModel, perturbed = false }: { coefficients: Coefficient[]; time: number; finalTime?: number; momentModel?: WellMomentModel; perturbed?: boolean }) {
  const model = useMemo(() => momentModel ?? prepareWellMoments(coefficients), [coefficients, momentModel]);
  const series = useMemo(() => {
    const history = wellMomentHistory(model, finalTime, perturbed ? 4096 : 16384);
    const layers = (quantity: 'position' | 'momentum', tone: PlotSeries['tone']): PlotSeries[] => {
      const values = history.map(p => ({ x: p.time, y: p[quantity] }));
      return [
        { values, tone, width: .9, opacity: .5 },
        { values, tone, width: 2.5, progressive: true },
      ];
    };
    return { position: layers('position', 'accent'), momentum: layers('momentum', 'teal') };
  }, [model, perturbed, finalTime]);
  const current = wellMomentsAt(model, time), momentumExtent = Math.max(1, model.momentumBound * 1.1);
  const cursor = [{ value: time, tone: 'ink' as const, dashed: true }];
  const timeLabel = perturbed ? String.raw`$\tau=E_{\mathrm{ref}}t/\hbar$` : String.raw`$\tau=E_1t/\hbar$`;
  return <section className="well-observables" aria-labelledby="well-observables-title">
    <h3 className="eyebrow" id="well-observables-title">Moyennes au cours du temps</h3>
    <div className="well-moment-panels">
      <div className="well-moment-panel"><div className="well-moment-heading"><span><i className="legend-swatch accent" aria-hidden="true" />Position moyenne</span><output><Formula>{String.raw`$\langle x\rangle/a=${fixed(current.position)}$`}</Formula></output></div>
        <div className="plot-shell"><ScientificPlot ariaLabel="Position moyenne dans le puits au cours du temps réduit : courbe complète en trait fin, progression en trait épais" xDomain={[0, finalTime]} yDomain={[0, 1]} xLabel={timeLabel} yLabel={String.raw`$\langle x\rangle/a$`} yTicks={[0, .25, .5, .75, 1]} series={series.position} progressX={time} verticalLines={cursor} horizontalLines={[{ value: .5, tone: 'muted', dashed: true }]} /></div>
      </div>
      <div className="well-moment-panel"><div className="well-moment-heading"><span><i className="legend-swatch teal" aria-hidden="true" />Impulsion moyenne</span><output><Formula>{String.raw`$a\langle p\rangle/\hbar=${fixed(current.momentum)}$`}</Formula></output></div>
        <div className="plot-shell"><ScientificPlot ariaLabel="Impulsion moyenne dans le puits au cours du temps réduit : courbe complète en trait fin, progression en trait épais" xDomain={[0, finalTime]} yDomain={[-momentumExtent, momentumExtent]} xLabel={timeLabel} yLabel={String.raw`$a\langle p\rangle/\hbar$`} series={series.momentum} progressX={time} verticalLines={cursor} horizontalLines={[{ value: 0, tone: 'muted', dashed: true }]} /></div>
      </div>
    </div>
    <p className="scale-note">Trait fin : courbe complète. Trait épais : évolution jusqu’au temps courant, repéré par le trait vertical. Les deux moyennes sont calculées à partir du même état quantique ; le facteur graphique <Formula>{'$s$'}</Formula> ne les modifie pas.</p>
    <details className="theory-notes"><summary>Définition des moyennes</summary><div className="theory-grid">
      <div><span>Position</span><Formula display>{String.raw`$\langle x\rangle=\int_0^a x\,|\psi|^2\,dx$`}</Formula></div>
      <div><span>Impulsion</span><Formula display>{String.raw`$\langle p\rangle=-i\hbar\int_0^a\psi^*\frac{\partial\psi}{\partial x}\,dx$`}</Formula></div>
    </div><p>Ici <Formula>{String.raw`$\psi=\psi(x,t)$`}</Formula>. Les éléments de matrice sont intégrés analytiquement dans la base des états propres.</p></details>
  </section>;
}
