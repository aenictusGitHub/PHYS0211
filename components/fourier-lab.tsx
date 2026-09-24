'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Math as Formula } from '@/components/math';
import { QuantumParameter } from '@/components/quantum-parameter';
import { CompactStepper } from '@/components/compact-stepper';
import { PlaybackControls } from '@/components/playback-controls';
import { useLabPlayback } from '@/components/use-lab-playback';
import { ScientificPlot, type PlotSeries } from '@/components/scientific-plot';
import type { ExperimentCommand } from '@/components/lab-types';
import { FOURIER_DEFAULTS, FOURIER_SIGMA_MIN, FOURIER_SIGMA_MAX, FOURIER_CENTER_LIMIT, FOURIER_MOMENTUM_LIMIT, FOURIER_FINAL_TIME_MAX, FOURIER_WINDOW_DEFAULT, FOURIER_MOMENTUM_WINDOW_DEFAULT, fourierDomains, type FourierConfig } from '@/lib/fourier';
import { FOURIER_MODE_MAX, FOURIER_T_SCALE, evolveFourierDisplay as evolveFourier, fourierValueDisplay as fourierValue, fourierMoments, fourierYMax } from '@/lib/fourier';

const fixed = (value: number) => (Math.abs(value) < .0005 ? 0 : value).toFixed(3);

export function FourierLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [config, setConfig] = useState<FourierConfig>(FOURIER_DEFAULTS);
  const [view, setView] = useState<'density' | 'complex'>('density');
  const [mode, setMode] = useState<'stationary' | 'evolution'>('stationary');
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const [positionWindow, setPositionWindow] = useState(FOURIER_WINDOW_DEFAULT);
  const [momentumWindow, setMomentumWindow] = useState(FOURIER_MOMENTUM_WINDOW_DEFAULT);
  const [verticalLimits, setVerticalLimits] = useState<Record<'density' | 'complex', { position: number | null; momentum: number | null }>>({ density: { position: null, momentum: null }, complex: { position: null, momentum: null } });
  const ownCommand = command?.lab === 'fourier' ? command : null;
  const clock = useLabPlayback({ active, enabled: mode === 'evolution', time, setTime, playing, setPlaying, defaultFinalTime: 6, rate: .5, command: ownCommand });
  const resetTime = () => { setTime(0); setPlaying(false); };
  const change = (patch: Partial<FourierConfig>) => { setConfig(value => ({ ...value, ...patch })); resetTime(); };
  useEffect(() => {
    if (command?.lab !== 'fourier') return;
    setConfig(value => ({ shape: command.fourierNumber !== undefined ? 'oscillator' : command.fourierShape ?? value.shape, modes: command.fourierNumber !== undefined ? [{ n: command.fourierNumber, amplitude: 1, phase: 0 }] : value.modes, sigma: command.fourierSigma ?? value.sigma, center: command.fourierCenter ?? value.center,
      momentum: command.fourierMomentum ?? value.momentum, chirp: 0 }));
    if (command.fourierView) setView(command.fourierView);
    if (command.fourierWindow !== undefined) setPositionWindow(command.fourierWindow);
    if (command.fourierMomentumWindow !== undefined) setMomentumWindow(command.fourierMomentumWindow);
    if (command.fourierPositionYMax !== undefined || command.fourierMomentumYMax !== undefined) {
      const targetView = command.fourierView ?? view;
      setVerticalLimits(limits => ({ ...limits, [targetView]: { position: command.fourierPositionYMax ?? limits[targetView].position, momentum: command.fourierMomentumYMax ?? limits[targetView].momentum } }));
    }
    if (command.mode) setMode(command.mode);
    else if (command.time !== undefined) setMode('evolution');
    setTime(command.time ?? 0); setPlaying(false);
  }, [command]);
  const gaussian = !config.shape || config.shape === 'gaussian';
  const harmonic = config.shape === 'oscillator';
  const oscillatorNumber = config.modes?.[0]?.n ?? 1;
  const initial = { ...config, chirp: 0 };
  const displayTime = mode === 'evolution' ? time : 0;
  const current = evolveFourier(initial, displayTime);
  const moments = fourierMoments(current), domains = fourierDomains(initial, positionWindow, momentumWindow);
  const yLimits = { position: verticalLimits[view].position ?? fourierYMax('position', view, initial), momentum: verticalLimits[view].momentum ?? fourierYMax('momentum', view, initial) };
  const setYLimit = (space: 'position' | 'momentum', value: number) => setVerticalLimits(limits => ({ ...limits, [view]: { ...limits[view], [space]: value } }));
  const windowControl = <div className="fourier-initial-window" role="group" aria-label="Échelles des axes">
    <CompactStepper id="fourier-window" label={<>Abscisse <Formula>{String.raw`$x/\ell$`}</Formula> : ±</>} value={positionWindow} min={5} max={400} step={5} onChange={setPositionWindow} description="Demi-largeur sans dimension en x/ℓ. Seul ce réglage change l’échelle horizontale en position." />
    <CompactStepper id="fourier-momentum-window" label={<>Abscisse <Formula>{String.raw`$p\ell/\hbar$`}</Formula> : ±</>} value={momentumWindow} min={1} max={100} step={1} onChange={setMomentumWindow} description="Demi-largeur sans dimension en pℓ/ℏ, de 1 à 100, par défaut 40. Modifie seulement l’affichage." />
    <CompactStepper id="fourier-position-ymax" label={<>Ordonnée {view === 'density' ? 'max.' : '±'} (<Formula>$x$</Formula>)</>} value={yLimits.position} min={.05} max={100} step={.05} onChange={value => setYLimit('position', value)} description="Limite verticale du graphe en position, sans dimension. De 0 à cette valeur pour la densité, ou de moins à plus cette valeur pour les parties réelle et imaginaire. Sans effet sur l’état ni le temps." />
    <CompactStepper id="fourier-momentum-ymax" label={<>Ordonnée {view === 'density' ? 'max.' : '±'} (<Formula>$p$</Formula>)</>} value={yLimits.momentum} min={.05} max={100} step={.05} onChange={value => setYLimit('momentum', value)} description="Limite verticale du graphe en impulsion, sans dimension. De 0 à cette valeur pour la densité, ou de moins à plus cette valeur pour les parties réelle et imaginaire. Sans effet sur l’état ni le temps." />
    <Button variant="outline" size="sm" onClick={() => setVerticalLimits(limits => ({ ...limits, [view]: { position: null, momentum: null } }))}>Ordonnées auto</Button>
  </div>;
  const plots = useMemo(() => (['position', 'momentum'] as const).map(space => {
    const domain = fourierDomains(initial, positionWindow, momentumWindow)[space];
    const position = space === 'position', delta = position ? moments.dx : moments.dp;
    const center = position ? moments.x : moments.p;
    // Resolve the occupied region even in a very wide viewport, without
    // spending animation frames sampling empty tails or changing either axis.
    const left = Math.max(domain[0], center - (gaussian ? 8 : 16) * delta), right = Math.min(domain[1], center + (gaussian ? 8 : 16) * delta);
    const phaseSlope = (x: number) => harmonic ? position ? initial.momentum + (x - initial.center - initial.momentum * displayTime / FOURIER_T_SCALE) * (displayTime / FOURIER_T_SCALE) / (initial.sigma ** 4 + (displayTime / FOURIER_T_SCALE) ** 2) : -initial.center - x * displayTime / FOURIER_T_SCALE : position ? initial.momentum + current.chirp * (x - current.center) / (2 * current.sigma ** 2)
      : -initial.center - x * displayTime / FOURIER_T_SCALE;
    const frequency = Math.max(Math.abs(phaseSlope(left)), Math.abs(phaseSlope(right)), !gaussian && position && displayTime > 0 ? 8 / initial.sigma : 0);
    const intervals = view === 'density' ? 512 : Math.min(80000, Math.max(512, Math.ceil((right - left) * frequency * 4 / Math.PI)));
    const sample = (x: number) => ({ x, ...fourierValue(x, space, initial, displayTime) });
    const samples = right > left ? Array.from({ length: intervals + 1 }, (_, i) => sample(i === intervals ? right : left + (right - left) * i / intervals)) : [];
    if (!samples.length || left > domain[0]) samples.unshift(sample(domain[0]));
    if (right < domain[1] || samples.length === 1) samples.push(sample(domain[1]));
    if (!gaussian) {
      // Resolve algebraic tails without joining the core directly to an edge.
      for (let i = 0; i <= 1024; i++) {
        const x = domain[0] + (domain[1] - domain[0]) * i / 1024;
        if (x < left || x > right) samples.push(sample(x));
      }
      if (center >= domain[0] && center <= domain[1]) samples.push(sample(center));
      samples.sort((a, b) => a.x - b.x);
    }
    const series: PlotSeries[] = view === 'density'
      ? [{ values: samples.map(p => ({ x: p.x, y: p.density })), tone: space === 'position' ? 'accent' : 'teal', fillTo: 0, fillOpacity: .12 }]
      : [{ values: samples.map(p => ({ x: p.x, y: p.real })), tone: 'accent' }, { values: samples.map(p => ({ x: p.x, y: p.imaginary })), tone: 'teal', dashed: true }];
    return { space, series };
  }), [config, view, displayTime, positionWindow, momentumWindow]);
  return <section className="workspace fourier-workspace" aria-labelledby="fourier-title">
    <aside className="control-panel">
      <div><p className="eyebrow">01</p><h1 id="fourier-title">Fonctions d’ondes en <Formula>$x$</Formula> et <Formula>$p$</Formula></h1><p className="lede">Un même état quantique, deux représentations.</p></div>
      <div className="mode-switch" role="group" aria-label="Mode du laboratoire Fourier">
        <Button variant="ghost" aria-pressed={mode === 'stationary'} className={mode === 'stationary' ? 'is-selected' : ''} onClick={() => { setMode('stationary'); resetTime(); }}>État initial</Button>
        <Button variant="ghost" aria-pressed={mode === 'evolution'} className={mode === 'evolution' ? 'is-selected' : ''} onClick={() => setMode('evolution')}>Évolution libre</Button>
      </div>
      <div className="control-stack">
        <p className="control-caption">Forme initiale en position</p>
        <div className="preset-grid fourier-shapes" role="group" aria-label="Forme initiale de la fonction d’onde">{([
          ['gaussian', 'Gaussienne'], ['exponential', 'Exponentielle décroissante'], ['lorentzian', 'Lorentzienne'], ['oscillator', 'Oscillateur : états propres'],
        ] as const).map(([shape, label]) => <Button key={shape} variant="outline" aria-pressed={(config.shape ?? 'gaussian') === shape} className={(config.shape ?? 'gaussian') === shape ? 'is-selected' : ''} onClick={() => { change({ shape }); }}>{label}</Button>)}</div>
        {harmonic ? <CompactStepper id="fourier-number" label={<>Nombre quantique <Formula>$n$</Formula></>} value={oscillatorNumber} min={0} max={FOURIER_MODE_MAX} step={1} onChange={n => change({ modes: [{ n, amplitude: 1, phase: 0 }] })} description="État propre de l’oscillateur : n de 0 à 5. Le changement d’état remet le temps à zéro." /> : null}
        <QuantumParameter id="fourier-sigma" label={harmonic ? 'Longueur de l’oscillateur' : 'Largeur en position'} symbol={harmonic ? String.raw`$b/\ell$` : String.raw`$\sigma_0/\ell$`} value={config.sigma} min={FOURIER_SIGMA_MIN} max={FOURIER_SIGMA_MAX} step={.05} onChange={sigma => change({ sigma })} />
        <div className="preset-grid" role="group" aria-label="Largeur du paquet">{[{ label: 'Étroit', sigma: .5 }, { label: 'Standard', sigma: 1 }, { label: 'Large', sigma: 2 }].map(preset => <Button key={preset.label} variant="outline" aria-pressed={config.sigma === preset.sigma} className={config.sigma === preset.sigma ? 'is-selected' : ''} onClick={() => change({ sigma: preset.sigma })}>{preset.label}</Button>)}</div>
      </div>
      <div className="equation-card fourier-initial-state"><span>État initial normalisé</span>
        {harmonic ? <>
          <div className="fourier-state-representation"><p className="control-caption">En position</p>
            <Formula display>{String.raw`$\psi(x,0)=\frac{e^{ip_0(x-x_0)/\hbar}}{\sqrt b}h_n\!\left(\frac{x-x_0}{b}\right)$`}</Formula>
          </div>
          <div className="fourier-state-representation"><p className="control-caption">En impulsion</p>
            <Formula display>{String.raw`$\overbar{\psi}(p,0)=(-i)^n\sqrt{\frac b\hbar}\,e^{-ipx_0/\hbar}h_n\!\left(\frac{b(p-p_0)}{\hbar}\right)$`}</Formula>
          </div>
          <Formula display>{String.raw`$h_n(u)=\frac{H_n(u)e^{-u^2/2}}{\pi^{1/4}\sqrt{2^n n!}}$`}</Formula>
          <Formula display>{String.raw`$b=\sqrt{\frac{\hbar}{m\omega}}$`}</Formula>
          <p className="scale-note">État propre <Formula>{`$n=${oscillatorNumber}$`}</Formula> de l’oscillateur harmonique, préparé à l’instant initial. Les <Formula>$H_n$</Formula> sont les polynômes d’Hermite.{mode === 'evolution' ? <> Dans « Évolution libre », le piège est retiré : <Formula>$V=0$</Formula>, et non un potentiel harmonique.</> : null}</p>
        </> : !gaussian ? <>
          <p className="scale-note">Exponentielle symétrique et amplitude lorentzienne forment une paire de Fourier. La densité est le carré du module de ces amplitudes.</p>
          <Formula display>{config.shape === 'exponential' ? String.raw`$a=\sqrt{2}\,\sigma_0$` : String.raw`$a=\sigma_0$`}</Formula>
          <div className="fourier-state-representation"><p className="control-caption">En position</p>
            <Formula display>{config.shape === 'exponential' ? String.raw`$\psi(x,0)=\frac{e^{-|x-x_0|/a}}{\sqrt a}\,e^{ip_0(x-x_0)/\hbar}$` : String.raw`$\psi(x,0)=\sqrt{\frac{2}{\pi a}}\,\frac{e^{ip_0(x-x_0)/\hbar}}{1+[(x-x_0)/a]^2}$`}</Formula>
          </div>
          <div className="fourier-state-representation"><p className="control-caption">En impulsion</p>
            <Formula display>{config.shape === 'exponential' ? String.raw`$\overbar{\psi}(p,0)=\sqrt{\frac{2a}{\pi\hbar}}\,\frac{e^{-ipx_0/\hbar}}{1+[a(p-p_0)/\hbar]^2}$` : String.raw`$\overbar{\psi}(p,0)=\sqrt{\frac a\hbar}\,e^{-a|p-p_0|/\hbar}\,e^{-ipx_0/\hbar}$`}</Formula>
          </div>
        </> : <>
        <div className="fourier-state-representation">
          <p className="control-caption">En position</p>
          <Formula display>{String.raw`$\psi(x,0)=\frac{e^{-\frac{(x-x_0)^2}{4\sigma_0^2}}\,e^{i\Phi(x)}}{(2\pi\sigma_0^2)^{1/4}}$`}</Formula>
          <Formula display>{String.raw`$\Phi(x)=\frac{p_0(x-x_0)}{\hbar}$`}</Formula>
        </div>
        <div className="fourier-state-representation">
          <p className="control-caption">En impulsion</p>
          <Formula display>{String.raw`$\overbar{\psi}(p,0)=N_p\,e^{-\frac{\sigma_0^2(p-p_0)^2}{\hbar^2}-\frac{ipx_0}{\hbar}}$`}</Formula>
          <Formula display>{String.raw`$N_p=\left(\frac{2\sigma_0^2}{\pi\hbar^2}\right)^{1/4}$`}</Formula>
        </div>
        </>}
        <p className="scale-note">Grandeurs sans dimension :<br />
          <Formula>{String.raw`$x/\ell$`}</Formula>, <Formula>{String.raw`$p\ell/\hbar$`}</Formula>, <Formula>{harmonic ? String.raw`$b/\ell$` : String.raw`$\sigma_0/\ell$`}</Formula>.
        </p>
        <ul className="scale-note fourier-unit-list">
          <li><Formula>{String.raw`$\ell=1\,\mathrm{nm}$`}</Formula></li>
          <li><Formula>{String.raw`$m=m_e\simeq9.109\times10^{-31}\,\mathrm{kg}$`}</Formula></li>
          <li><Formula>$t$</Formula> en <Formula>{String.raw`$\mathrm{fs}$`}</Formula></li>
        </ul>
      </div>
      <details className="theory-notes fourier-phase"><summary>Translations</summary><div className="control-stack">
        <QuantumParameter id="fourier-center" label={'Position moyenne'} symbol={String.raw`$x_0/\ell$`} value={config.center} min={-FOURIER_CENTER_LIMIT} max={FOURIER_CENTER_LIMIT} step={.1} onChange={center => change({ center })} />
        <QuantumParameter id="fourier-momentum" label={'Impulsion moyenne'} symbol={String.raw`$p_0\ell/\hbar$`} value={config.momentum} min={-FOURIER_MOMENTUM_LIMIT} max={FOURIER_MOMENTUM_LIMIT} step={.1} onChange={momentum => change({ momentum })} />
        <p className="scale-note">Ces deux réglages sont sans dimension.</p>
      </div></details>
      <Button variant="outline" onClick={() => { setConfig(FOURIER_DEFAULTS); setView('density'); resetTime(); }}>Réinitialiser le paquet</Button>
    </aside>
    <div className="figure-panel">
      <div className="figure-heading"><div><p className="eyebrow">Position ↔ impulsion</p><h2>Deux représentations reliées par la transformée de Fourier</h2></div><span className="figure-tag"><Formula>{String.raw`$\int|\psi(x)|^2\,dx=\int|\overbar{\psi}(p)|^2\,dp=1$`}</Formula></span></div>
      <div className="display-switch fourier-view" role="group" aria-label="Représentation de l’état"><Button variant="outline" aria-pressed={view === 'density'} className={view === 'density' ? 'is-selected' : ''} onClick={() => setView('density')}>Densités de probabilité</Button><Button variant="outline" aria-pressed={view === 'complex'} className={view === 'complex' ? 'is-selected' : ''} onClick={() => setView('complex')}>Parties réelle et imaginaire</Button></div>
      {view === 'complex' ? <div className="plot-legend"><span><i className="legend-swatch" />partie réelle</span><span><i className="legend-swatch teal dashed" />partie imaginaire</span></div> : null}
      {mode === 'evolution' ? <PlaybackControls id="fourier" clock={clock} displayControl={null} finalMin={.1} finalMax={FOURIER_FINAL_TIME_MAX} timeSymbol={String.raw`$t\ (\mathrm{fs})$`} finalSymbol={String.raw`$t_f\ (\mathrm{fs})$`}
        note={<>Évolution libre d’un électron : <Formula>$V=0$</Formula>, <Formula>$m=m_e$</Formula>. Le temps est en femtosecondes. La densité en impulsion reste constante.</>} /> : null}
      {windowControl}
      <div className="fourier-plots">{plots.map(({ space, series }) => {
        const position = space === 'position', mean = position ? moments.x : moments.p, delta = position ? moments.dx : moments.dp;
        const ymax = yLimits[space];
        return <div className="fourier-plot" key={space}><h3>{position ? 'Position' : 'Impulsion'} <Formula>{position ? '$x$' : '$p$'}</Formula></h3>
          <div className="plot-shell"><ScientificPlot ariaLabel={position ? 'Distribution en position et largeur Δx' : 'Transformée de Fourier en impulsion et largeur Δp'}
            xDomain={domains[space]} yDomain={[view === 'density' ? 0 : -ymax, ymax]} xLabel={position ? String.raw`$x/\ell$` : String.raw`$p\ell/\hbar$`} yLabel={view === 'density' ? position ? String.raw`$\ell\,|\psi(x)|^2$` : String.raw`$\frac{\hbar}{\ell}|\overbar{\psi}(p)|^2$` : position ? String.raw`$\sqrt{\ell}\,\psi(x)$` : String.raw`$\sqrt{\hbar/\ell}\,\overbar{\psi}(p)$`}
            series={series} bands={[{ from: mean - delta, to: mean + delta, tone: position ? 'accent' : 'teal', opacity: .15 }]}
            xDrag={displayTime === 0 ? { value: mean, min: domains[space][0], max: domains[space][1], step: .1, label: position ? 'Déplacer la position moyenne du paquet' : 'Déplacer l’impulsion moyenne du paquet', onChange: value => change(position ? { center: Math.max(-FOURIER_CENTER_LIMIT, Math.min(FOURIER_CENTER_LIMIT, config.center + value - mean)) } : { momentum: Math.max(-FOURIER_MOMENTUM_LIMIT, Math.min(FOURIER_MOMENTUM_LIMIT, config.momentum + value - mean)) }) } : undefined}
            verticalLines={[{ value: mean, tone: 'ink', dashed: false }, { value: mean - delta, tone: 'muted' }, { value: mean + delta, tone: 'muted' }]} horizontalLines={view === 'complex' ? [{ value: 0, tone: 'muted' }] : []} /></div>
          <p className="fourier-width"><Formula>{position ? String.raw`$\Delta x/\ell=$` : String.raw`$\Delta p\,\ell/\hbar=$`}</Formula> <output>{fixed(delta)}</output></p>
        </div>;
      })}</div>
      <p className="scale-note">Les bandes couvrent <Formula>{String.raw`$(\langle x\rangle\pm\Delta x)/\ell$`}</Formula> et <Formula>{String.raw`$(\langle p\rangle\pm\Delta p)\ell/\hbar$`}</Formula>{gaussian ? ', soit environ 68.3 % de chaque distribution gaussienne.' : '. La fraction de probabilité dans ces bandes dépend de la forme et du temps ; elle ne vaut pas nécessairement 68.3 %.'}</p>
      {Math.abs(moments.x) + 4 * moments.dx > positionWindow ? <p className="scale-note fourier-window-note" role="status">Une partie du paquet sort de la fenêtre affichée. Il continue son évolution sans réflexion ; augmentez « Abscisse <Formula>{String.raw`$x/\ell$`}</Formula> » pour le voir davantage.</p> : null}
      {Math.abs(moments.p) + 4 * moments.dp > momentumWindow ? <p className="scale-note fourier-window-note" role="status">Une partie de la distribution en impulsion sort de la fenêtre affichée. Augmentez « Abscisse <Formula>{String.raw`$p\ell/\hbar$`}</Formula> » pour la voir davantage.</p> : null}
      <div className="fourier-uncertainty" aria-live="off"><div><p className="control-caption">Relation d’incertitude</p><Formula display>{String.raw`$\Delta x\,\Delta p\geq\frac{\hbar}{2}$`}</Formula></div><div><span>Produit actuel</span><p><Formula>{String.raw`$${fixed(moments.product)}\,\hbar$`}</Formula></p><span>Minimum : <Formula>{String.raw`$0.500\,\hbar$`}</Formula></span></div></div>
      <p className="fourier-explanation">{harmonic ? <>L’état propre <Formula>{`$n=${oscillatorNumber}$`}</Formula> présente <Formula>$n$</Formula> nœuds en position et en impulsion. Son produit d’incertitude initial vaut <Formula>{String.raw`$\Delta x(0)\,\Delta p(0)=(n+\tfrac12)\hbar$`}</Formula>. Après retrait du piège, le paquet évolue librement.</> : !gaussian ? <>Ces deux formes ont initialement <Formula>{String.raw`$\Delta x\,\Delta p=\hbar/\sqrt{2}\simeq0.707\,\hbar$`}</Formula>, strictement au-dessus du minimum de Heisenberg. En évolution libre, la dispersion en impulsion reste constante et celle en position augmente.</> : Math.abs(current.chirp) < 1e-10 ? <>Le paquet atteint le minimum <Formula>{String.raw`$\hbar/2$`}</Formula>. Diviser <Formula>{String.raw`$\Delta x$`}</Formula> par deux multiplie <Formula>{String.raw`$\Delta p$`}</Formula> par deux : le produit reste inchangé.</> : <>En évolution libre, le paquet s’élargit en position tandis que sa distribution en impulsion reste inchangée. Le produit <Formula>{String.raw`$\Delta x\,\Delta p$`}</Formula> augmente donc à partir de sa valeur initiale minimale <Formula>{String.raw`$\hbar/2$`}</Formula>.</>}</p>
      <dl className="measurements"><div><dt>Position moyenne</dt><dd><Formula>{String.raw`$\langle x\rangle/\ell=$`}</Formula><output>{fixed(moments.x)}</output></dd></div><div><dt>Impulsion moyenne</dt><dd><Formula>{String.raw`$\langle p\rangle\ell/\hbar=$`}</Formula><output>{fixed(moments.p)}</output></dd></div></dl>
      <details className="theory-notes"><summary>Repères théoriques</summary><div className="theory-grid">
        <div><span>Convention de Fourier</span><Formula display>{String.raw`$\overbar{\psi}(p)=\frac{1}{\sqrt{2\pi\hbar}}\int_{-\infty}^{\infty}\psi(x)\,e^{-ipx/\hbar}\,dx$`}</Formula><p>La transformation porte sur l’amplitude complexe, pas sur la densité de probabilité. Les deux représentations décrivent le même état et ont une norme égale à 1.</p></div>
        <div><span>Mesurer une dispersion</span>
          <p>Pour un état normalisé, à l’instant considéré :</p>
          <Formula display>{String.raw`$\langle x\rangle=\int_{-\infty}^{\infty}x\,|\psi(x)|^2\,dx$`}</Formula>
          <Formula display>{String.raw`$\langle x^2\rangle=\int_{-\infty}^{\infty}x^2\,|\psi(x)|^2\,dx$`}</Formula>
          <Formula display>{String.raw`$\langle p\rangle=\int_{-\infty}^{\infty}p\,|\overbar{\psi}(p)|^2\,dp$`}</Formula>
          <Formula display>{String.raw`$\langle p^2\rangle=\int_{-\infty}^{\infty}p^2\,|\overbar{\psi}(p)|^2\,dp$`}</Formula>
          <Formula display>{String.raw`$\Delta x=\sqrt{\langle x^2\rangle-\langle x\rangle^2}$`}</Formula><Formula display>{String.raw`$\Delta p=\sqrt{\langle p^2\rangle-\langle p\rangle^2}$`}</Formula><p>Ce sont les dispersions des résultats de mesures sur des ensembles préparés dans le même état, pas des erreurs instrumentales.</p></div>
        {harmonic ? <div><span>État propre de l’oscillateur</span><Formula display>{String.raw`$\Delta x(0)=b\sqrt{n+\tfrac12},\qquad\Delta p(0)=\frac{\hbar}{b}\sqrt{n+\tfrac12}$`}</Formula><p>La longueur <Formula>$b$</Formula> règle l’étendue de l’état <Formula>$n$</Formula>. Les translations <Formula>$x_0$</Formula> et <Formula>$p_0$</Formula> fixent les moyennes sans changer les dispersions.</p></div> : !gaussian ? <div><span>État initial</span><Formula display>{String.raw`$\Delta x(0)=\sigma_0,\qquad\Delta p(0)=\frac{\hbar}{\sqrt{2}\,\sigma_0}$`}</Formula><Formula display>{String.raw`$\Delta x(0)\,\Delta p(0)=\frac{\hbar}{\sqrt{2}}$`}</Formula><p>La largeur est l’écart-type de la densité, pour les trois formes. Une amplitude lorentzienne donne une densité lorentzienne au carré : ses deuxièmes moments sont finis. Les translations changent les moyennes, pas les dispersions.</p></div> : <div><span>État initial</span><Formula display>{String.raw`$\Delta x(0)=\sigma_0$`}</Formula><Formula display>{String.raw`$\Delta p(0)=\frac{\hbar}{2\sigma_0}$`}</Formula><p>Les translations <Formula>$x_0$</Formula> et <Formula>$p_0$</Formula> déplacent les moyennes sans modifier les dispersions. Cet état initial atteint la borne de Heisenberg ; la largeur en position augmente ensuite en évolution libre.</p></div>}
        <div><span>Évolution libre</span><Formula display>{harmonic ? String.raw`$(\Delta x)^2(t)=(n+\tfrac12)\left(b^2+\frac{\hbar^2t^2}{m^2b^2}\right)$` : !gaussian ? String.raw`$\sigma^2(t)=\sigma_0^2+\frac{\hbar^2t^2}{2m^2\sigma_0^2}$` : String.raw`$\sigma^2(t)=\sigma_0^2+\frac{\hbar^2t^2}{4m^2\sigma_0^2}$`}</Formula><Formula display>{String.raw`$\overbar{\psi}(p,t)=\overbar{\psi}(p,0)\,e^{-ip^2t/(2m\hbar)}$`}</Formula><p>La position moyenne suit <Formula>{harmonic ? String.raw`$\langle x\rangle(t)=\langle x\rangle(0)+\frac{\langle p\rangle(0)t}{m}$` : String.raw`$\langle x\rangle(t)=x_0+\frac{p_0t}{m}$`}</Formula>. La distribution en impulsion est conservée ; seule sa phase évolue. {harmonic ? 'Les courbes et les moments sont calculés analytiquement après retrait du piège. Le paquet s’élargit en position ; il ne reste pas stationnaire comme dans un potentiel harmonique.' : gaussian ? 'Le calcul est analytique sur tout l’espace, sans parois aux bords du graphe.' : 'Les moments sont analytiques. La courbe en position est obtenue par inversion numérique de Fourier sur un domaine élargi, indépendant de la fenêtre affichée. La forme du paquet change pendant son expansion.'}</p></div>
      </div></details>
    </div>
  </section>;
}
