'use client';

import { useMemo } from 'react';
import { Math as Formula } from '@/components/math';
import { ScientificPlot, type PlotSeries } from '@/components/scientific-plot';
import type { Coefficient } from '@/lib/quantum';
import type { OscillatorSpectrum } from '@/lib/anharmonic-oscillator';
import { prepareOscillatorMoments, oscillatorMomentsAt, oscillatorMomentHistory } from '@/lib/oscillator-observables';

const fixed = (value: number) => (Math.abs(value) < .0005 ? 0 : value).toFixed(3);

export function OscillatorObservables({ spectrum, projected, time, finalTime }: {
  spectrum: OscillatorSpectrum; projected: Coefficient[]; time: number; finalTime: number;
}) {
  const model = useMemo(() => prepareOscillatorMoments(spectrum, projected), [spectrum, projected]);
  const series = useMemo(() => {
    const history = oscillatorMomentHistory(model, finalTime);
    const layers = (quantity: 'position' | 'momentum', tone: PlotSeries['tone']): PlotSeries[] => {
      const values = history.map(point => ({ x: point.time, y: point[quantity] }));
      return [{ values, tone, width: .9, opacity: .5 }, { values, tone, width: 2.5, progressive: true }];
    };
    return { position: layers('position', 'accent'), momentum: layers('momentum', 'teal') };
  }, [model, finalTime]);
  const current = oscillatorMomentsAt(model, time);
  const cursor = [{ value: time, tone: 'ink' as const, dashed: true }];
  const zero = [{ value: 0, tone: 'muted' as const, dashed: true }];
  const panels = [
    { key: 'position' as const, title: 'Position moyenne', symbol: String.raw`\langle x\rangle/x_0`, bound: model.positionBound, tone: 'accent' },
    { key: 'momentum' as const, title: 'Impulsion moyenne', symbol: String.raw`x_0\langle p\rangle/\hbar`, bound: model.momentumBound, tone: 'teal' },
  ];
  return <section className="well-observables oscillator-observables" aria-labelledby="oscillator-observables-title">
    <h3 className="eyebrow" id="oscillator-observables-title">Moyennes au cours du temps</h3>
    <div className="well-moment-panels">{panels.map(panel => {
      const extent = Math.max(1, 1.1 * panel.bound);
      return <div className="well-moment-panel" key={panel.key}>
        <div className="well-moment-heading"><span><i className={`legend-swatch ${panel.tone}`} aria-hidden="true" />{panel.title}</span>
          <output><Formula>{`$${panel.symbol}=${fixed(current[panel.key])}$`}</Formula></output></div>
        <div className="plot-shell"><ScientificPlot
          ariaLabel={`${panel.title} de l’oscillateur au cours du temps réduit : courbe complète en trait fin, progression en trait épais`}
          xDomain={[0, finalTime]} yDomain={[-extent, extent]} xLabel={String.raw`$\tau=\omega t$`} yLabel={`$${panel.symbol}$`}
          series={series[panel.key]} progressX={time} verticalLines={cursor} horizontalLines={zero} /></div>
      </div>;
    })}</div>
    <p className="scale-note">Trait fin : courbe complète. Trait épais : évolution jusqu’au temps courant, repéré par le trait vertical. Les moyennes suivent le même état que la densité, y compris avec la perturbation anharmonique. Le facteur graphique <Formula>{'$s$'}</Formula> ne les modifie pas.</p>
    <details className="theory-notes"><summary>Définition des moyennes</summary><div className="theory-grid">
      <div><span>Position</span><Formula display>{String.raw`$\langle x\rangle=\int_{-\infty}^{\infty}x\,|\psi(x,t)|^2\,dx$`}</Formula></div>
      <div><span>Impulsion</span><Formula display>{String.raw`$\langle p\rangle=-i\hbar\int_{-\infty}^{\infty}\psi^*(x,t)\,\frac{\partial\psi(x,t)}{\partial x}\,dx$`}</Formula></div>
    </div><p>Les axes utilisent <Formula>{String.raw`$x_0=\sqrt{\hbar/(m\omega)}$`}</Formula> et <Formula>{String.raw`$\tau=\omega t$`}</Formula>. Les éléments de matrice sont calculés dans la base utilisée pour l’évolution quantique.</p></details>
  </section>;
}
