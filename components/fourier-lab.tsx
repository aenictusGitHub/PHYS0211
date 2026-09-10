'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Math as Formula } from '@/components/math';
import { QuantumParameter } from '@/components/quantum-parameter';
import { CompactStepper } from '@/components/compact-stepper';
import { Slider } from '@/components/ui/slider';
import { ScientificPlot, type PlotSeries } from '@/components/scientific-plot';
import type { ExperimentCommand } from '@/components/lab-types';
import { FOURIER_DEFAULTS, FOURIER_SIGMA_MIN, FOURIER_SIGMA_MAX, FOURIER_CENTER_LIMIT, fourierValue, fourierMoments, fourierDomains, fourierYMax, type FourierConfig } from '@/lib/fourier';

const fixed = (value: number) => (Math.abs(value) < .0005 ? 0 : value).toFixed(3);

export function FourierLab({ command }: { command: ExperimentCommand | null }) {
  const [config, setConfig] = useState<FourierConfig>(FOURIER_DEFAULTS);
  const [view, setView] = useState<'density' | 'complex'>('density');
  const change = (patch: Partial<FourierConfig>) => setConfig(value => ({ ...value, ...patch }));
  useEffect(() => {
    if (command?.lab !== 'fourier') return;
    setConfig(value => ({ sigma: command.fourierSigma ?? value.sigma, center: command.fourierCenter ?? value.center,
      momentum: command.fourierMomentum ?? value.momentum, chirp: command.fourierChirp ?? value.chirp }));
    if (command.fourierView) setView(command.fourierView);
  }, [command]);
  const moments = fourierMoments(config), domains = fourierDomains(config);
  const plots = useMemo(() => (['position', 'momentum'] as const).map(space => {
    const domain = fourierDomains(config)[space];
    const samples = Array.from({ length: 2001 }, (_, i) => {
      const x = domain[0] + (domain[1] - domain[0]) * i / 2000;
      return { x, ...fourierValue(x, space, config) };
    });
    const series: PlotSeries[] = view === 'density'
      ? [{ values: samples.map(p => ({ x: p.x, y: p.density })), tone: space === 'position' ? 'accent' : 'teal', fillTo: 0, fillOpacity: .12 }]
      : [{ values: samples.map(p => ({ x: p.x, y: p.real })), tone: 'accent' }, { values: samples.map(p => ({ x: p.x, y: p.imaginary })), tone: 'teal', dashed: true }];
    return { space, series };
  }), [config, view]);
  return <section className="workspace fourier-workspace" aria-labelledby="fourier-title">
    <aside className="control-panel">
      <div><p className="eyebrow">01</p><h1 id="fourier-title">Incertitude et transformée de Fourier</h1><p className="lede">Un même état quantique, deux représentations. Resserrez le paquet en position et observez son spectre en impulsion.</p></div>
      <div className="control-stack">
        <QuantumParameter id="fourier-sigma" label="Largeur en position" symbol={String.raw`$\sigma=\Delta x$`} value={config.sigma} min={FOURIER_SIGMA_MIN} max={FOURIER_SIGMA_MAX} step={.05} onChange={sigma => change({ sigma })} />
        <div className="preset-grid" role="group" aria-label="Largeur du paquet gaussien">{[{ label: 'Étroit', sigma: .5 }, { label: 'Standard', sigma: 1 }, { label: 'Large', sigma: 2 }].map(preset => <Button key={preset.label} variant="outline" aria-pressed={config.sigma === preset.sigma} className={config.sigma === preset.sigma ? 'is-selected' : ''} onClick={() => change({ sigma: preset.sigma })}>{preset.label}</Button>)}</div>
      </div>
      <div className="control-block fourier-chirp-control">
        <CompactStepper id="fourier-chirp-value" label={<>Phase quadratique <Formula>$c$</Formula></>} value={config.chirp} min={-2} max={2} step={.01}
          onChange={chirp => change({ chirp })} description="Paramètre c, de −2 à 2. Valeur initiale : 0. Saisissez une valeur puis validez avec Entrée, ou utilisez les petites flèches." />
        <Slider id="fourier-chirp" aria-label="Phase quadratique c" min={-2} max={2} step={.01} value={[config.chirp]}
          onValueChange={next => change({ chirp: Array.isArray(next) ? next[0] : next })} />
        <div className="range-labels" aria-hidden="true"><span>−2</span><span>2</span></div>
        <p className="scale-note"><Formula>$c$</Formula> mesure une corrélation position–impulsion, appelée « chirp » spatial : le gradient de phase varie à travers le paquet. Il peut décrire un paquet en expansion ou préparé pour se focaliser.</p>
      </div>
      <div className="equation-card"><span>Paquet gaussien normalisé</span><Formula display>{String.raw`$\psi(x)=\frac{e^{-\frac{(x-x_0)^2}{4\sigma^2}}\,e^{i\Phi(x)}}{(2\pi\sigma^2)^{1/4}}$`}</Formula><Formula display>{String.raw`$\Phi(x)=p_0(x-x_0)+\frac{c(x-x_0)^2}{4\sigma^2}$`}</Formula><p className="scale-note">Unités réduites : <Formula>{String.raw`$\hbar=1$`}</Formula>. Le paramètre <Formula>$c$</Formula> vaut zéro par défaut.</p></div>
      <details className="theory-notes fourier-phase"><summary>Translations</summary><div className="control-stack">
        <QuantumParameter id="fourier-center" label="Position moyenne" symbol="$x_0$" value={config.center} min={-FOURIER_CENTER_LIMIT} max={FOURIER_CENTER_LIMIT} step={.1} onChange={center => change({ center })} />
        <QuantumParameter id="fourier-momentum" label="Impulsion moyenne" symbol="$p_0$" value={config.momentum} min={-FOURIER_CENTER_LIMIT} max={FOURIER_CENTER_LIMIT} step={.1} onChange={momentum => change({ momentum })} />
      </div></details>
      <Button variant="outline" onClick={() => { setConfig(FOURIER_DEFAULTS); setView('density'); }}>Réinitialiser le paquet</Button>
    </aside>
    <div className="figure-panel">
      <div className="figure-heading"><div><p className="eyebrow">Position ↔ impulsion</p><h2>Une paire de Fourier</h2></div><span className="figure-tag"><Formula>{String.raw`$\int |\psi|^2\,dx=\int|\widetilde\psi|^2\,dp=1$`}</Formula></span></div>
      <div className="display-switch fourier-view" role="group" aria-label="Représentation de l’état"><Button variant="outline" aria-pressed={view === 'density'} className={view === 'density' ? 'is-selected' : ''} onClick={() => setView('density')}>Densités de probabilité</Button><Button variant="outline" aria-pressed={view === 'complex'} className={view === 'complex' ? 'is-selected' : ''} onClick={() => setView('complex')}>Parties réelle et imaginaire</Button></div>
      {view === 'complex' ? <div className="plot-legend"><span><i className="legend-swatch" />partie réelle</span><span><i className="legend-swatch teal dashed" />partie imaginaire</span></div> : null}
      <p className="scale-note">Faites glisser horizontalement sur un graphe pour déplacer sa moyenne. Au clavier : flèches ← →, ou Maj + flèche pour un déplacement plus grand.</p>
      <div className="fourier-plots">{plots.map(({ space, series }) => {
        const position = space === 'position', mean = position ? moments.x : moments.p, delta = position ? moments.dx : moments.dp;
        const ymax = fourierYMax(space, view, config);
        return <div className="fourier-plot" key={space}><h3>{position ? 'Position' : 'Impulsion'} <Formula>{position ? '$x$' : '$p$'}</Formula></h3>
          <div className="plot-shell"><ScientificPlot ariaLabel={position ? 'Distribution en position et largeur Δx' : 'Transformée de Fourier en impulsion et largeur Δp'}
            xDomain={domains[space]} yDomain={[view === 'density' ? 0 : -ymax, ymax]} xLabel={position ? '$x$' : '$p$'} yLabel={view === 'density' ? position ? String.raw`$|\psi(x)|^2$` : String.raw`$|\widetilde\psi(p)|^2$` : position ? String.raw`$\psi(x)$` : String.raw`$\widetilde\psi(p)$`}
            series={series} bands={[{ from: mean - delta, to: mean + delta, tone: position ? 'accent' : 'teal', opacity: .15 }]}
            xDrag={{ value: mean, min: -FOURIER_CENTER_LIMIT, max: FOURIER_CENTER_LIMIT, step: .1, label: position ? 'Déplacer la position moyenne du paquet' : 'Déplacer l’impulsion moyenne du paquet', onChange: value => change(position ? { center: value } : { momentum: value }) }}
            verticalLines={[{ value: mean, tone: 'ink', dashed: false }, { value: mean - delta, tone: 'muted' }, { value: mean + delta, tone: 'muted' }]} horizontalLines={view === 'complex' ? [{ value: 0, tone: 'muted' }] : []} /></div>
          <p className="fourier-width"><Formula>{position ? String.raw`$\Delta x=$` : String.raw`$\Delta p=$`}</Formula> <output>{fixed(delta)}</output></p>
        </div>;
      })}</div>
      <p className="scale-note">Les bandes couvrent la moyenne ± un écart-type, soit environ 68.3 % de chaque distribution gaussienne. Les axes restent fixes pendant le déplacement du paquet. Pour comparer les largeurs, ils ne s’élargissent que si nécessaire pour contenir les distributions et leurs sommets.</p>
      <div className="fourier-uncertainty" aria-live="off"><div><p className="control-caption">Relation d’incertitude</p><Formula display>{String.raw`$\Delta x\,\Delta p\geq\frac{\hbar}{2}$`}</Formula></div><div><span>Produit actuel</span><p><output>{fixed(moments.product)}</output> <Formula>{String.raw`$\hbar$`}</Formula></p><span>Minimum : <Formula>{String.raw`$0.500\,\hbar$`}</Formula></span></div></div>
      <p className="fourier-explanation">{Math.abs(config.chirp) < 1e-10 ? <>Le paquet atteint le minimum <Formula>{String.raw`$\hbar/2$`}</Formula>. Diviser <Formula>$\Delta x$</Formula> par deux multiplie <Formula>$\Delta p$</Formula> par deux : le produit reste inchangé.</> : <>La phase quadratique crée une corrélation entre position et impulsion : <Formula>{String.raw`$\Delta x\,\Delta p=\frac{\hbar}{2}\sqrt{1+c^2}>\frac{\hbar}{2}$`}</Formula>. La densité en position reste pourtant identique à celle du paquet sans cette phase.</>}</p>
      <dl className="measurements"><div><dt>Position moyenne</dt><dd><Formula>{String.raw`$\langle x\rangle=$`}</Formula><output>{fixed(moments.x)}</output></dd></div><div><dt>Impulsion moyenne</dt><dd><Formula>{String.raw`$\langle p\rangle=$`}</Formula><output>{fixed(moments.p)}</output></dd></div></dl>
      <section className="fourier-physical-note" aria-labelledby="fourier-c-meaning">
        <h3 id="fourier-c-meaning">Sens physique du paramètre <Formula>$c$</Formula></h3>
        <p>La pente de la phase définit une impulsion locale, liée au courant de probabilité. Dans les unités du labo (<Formula>{String.raw`$\hbar=1$`}</Formula>) :</p>
        <Formula display>{String.raw`$p_{\mathrm{loc}}(x)=\frac{\partial\Phi}{\partial x}=p_0+\frac{c}{2\sigma^2}(x-x_0)$`}</Formula>
        <p>Ce champ décrit le courant, pas une impulsion parfaitement déterminée pour chaque position. Le paramètre <Formula>$c$</Formula> est sans dimension ; il ne représente pas la vitesse moyenne du paquet.</p>
        <ul>
          <li><Formula>$c&gt;0$</Formula> : le courant relatif au centre est dirigé vers l’extérieur ; le paquet s’élargirait en évolution libre.</li>
          <li><Formula>$c&lt;0$</Formula> : le courant relatif au centre est dirigé vers l’intérieur ; le paquet se resserrerait d’abord, puis s’élargirait après son point de focalisation.</li>
          <li><Formula>$c=0$</Formula> : il n’y a pas de corrélation position–impulsion. La largeur est momentanément minimale dans l’évolution libre, mais le paquet n’est pas stationnaire.</li>
        </ul>
        <p>Exemple : un paquet gaussien initialement sans chirp, libéré d’un piège, acquiert une phase quadratique pendant son expansion. Ici, changer <Formula>$c$</Formula> à largeur fixée compare différents états : ce n’est pas faire avancer le temps.</p>
      </section>
      <details className="theory-notes"><summary>Repères théoriques</summary><div className="theory-grid">
        <div><span>Convention de Fourier</span><Formula display>{String.raw`$\widetilde\psi(p)=\frac{1}{\sqrt{2\pi\hbar}}\int_{-\infty}^{\infty}\psi(x)\,e^{-ipx/\hbar}\,dx$`}</Formula><p>La transformation porte sur l’amplitude complexe, pas sur la densité de probabilité. Les deux représentations décrivent le même état et ont une norme égale à 1.</p></div>
        <div><span>Mesurer une dispersion</span><Formula display>{String.raw`$\Delta x=\sqrt{\langle x^2\rangle-\langle x\rangle^2}$`}</Formula><Formula display>{String.raw`$\Delta p=\sqrt{\langle p^2\rangle-\langle p\rangle^2}$`}</Formula><p>Ce sont les dispersions des résultats de mesures sur des ensembles préparés dans le même état, pas des erreurs instrumentales.</p></div>
        <div><span>Sans phase quadratique</span><Formula display>{String.raw`$\Delta x=\sigma,\qquad \Delta p=\frac{\hbar}{2\sigma}$`}</Formula><p>Les translations <Formula>$x_0$</Formula> et <Formula>$p_0$</Formula> déplacent les moyennes sans modifier les dispersions. La gaussienne sans corrélation atteint la borne de Heisenberg.</p></div>
        <div><span>Avec une phase quadratique</span><Formula display>{String.raw`$\Delta p=\frac{\hbar\sqrt{1+c^2}}{2\sigma}$`}</Formula><p>Un paquet peut être gaussien et avoir un produit strictement supérieur à <Formula>{String.raw`$\hbar/2$`}</Formula>. Les courbes et les moments sont calculés à partir d’une paire de Fourier analytique normalisée.</p></div>
        <div><span>Corrélation et expansion</span><Formula display>{String.raw`$C_{xp}=\frac{\langle xp+px\rangle}{2}-\langle x\rangle\langle p\rangle$`}</Formula><Formula display>{String.raw`$C_{xp}=\frac{\hbar c}{2},\qquad\frac{d(\Delta x)^2}{dt}=\frac{\hbar c}{m}$`}</Formula><p>On rétablit ici <Formula>{String.raw`$\hbar$`}</Formula>. La seconde relation décrit la variation instantanée de la variance en évolution libre. Le signe de <Formula>$c$</Formula> distingue l’expansion de la contraction, même si les deux signes donnent la même densité en impulsion.</p></div>
        <div><span>Exemple : temps de vol libre</span><Formula display>{String.raw`$c(t)=\frac{\hbar t}{2m\sigma_0^2}$`}</Formula><Formula display>{String.raw`$\sigma(t)=\sigma_0\sqrt{1+c(t)^2}$`}</Formula><p>Ces expressions s’appliquent à un paquet gaussien libre de masse <Formula>$m$</Formula>, de largeur initiale <Formula>$\sigma_0$</Formula> et sans phase quadratique à <Formula>$t=0$</Formula>. Dans ce cas particulier, <Formula>$c$</Formula> est le temps écoulé exprimé en unités du temps de dispersion <Formula>{String.raw`$2m\sigma_0^2/\hbar$`}</Formula>.</p></div>
      </div></details>
    </div>
  </section>;
}
