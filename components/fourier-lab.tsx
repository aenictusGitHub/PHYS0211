'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Math as Formula } from '@/components/math';
import { QuantumParameter } from '@/components/quantum-parameter';
import { CompactStepper } from '@/components/compact-stepper';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { PlaybackControls } from '@/components/playback-controls';
import { useLabPlayback } from '@/components/use-lab-playback';
import { ScientificPlot, type PlotSeries } from '@/components/scientific-plot';
import type { ExperimentCommand } from '@/components/lab-types';
import { FOURIER_DEFAULTS, FOURIER_SIGMA_MIN, FOURIER_SIGMA_MAX, FOURIER_CENTER_LIMIT, FOURIER_MOMENTUM_LIMIT, FOURIER_FINAL_TIME_MAX, FOURIER_WINDOW_DEFAULT, FOURIER_MOMENTUM_WINDOW_DEFAULT, fourierDomains, type FourierConfig } from '@/lib/fourier';
import { FOURIER_T_SCALE, evolveFourierDisplay as evolveFourier, fourierValueDisplay as fourierValue, fourierMoments, fourierYMax } from '@/lib/fourier';

const fixed = (value: number) => (Math.abs(value) < .0005 ? 0 : value).toFixed(3);

export function FourierLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [config, setConfig] = useState<FourierConfig>(FOURIER_DEFAULTS);
  const [view, setView] = useState<'density' | 'complex'>('density');
  const [chirpEnabled, setChirpEnabled] = useState(false);
  const [mode, setMode] = useState<'stationary' | 'evolution'>('stationary');
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const [positionWindow, setPositionWindow] = useState(FOURIER_WINDOW_DEFAULT);
  const [momentumWindow, setMomentumWindow] = useState(FOURIER_MOMENTUM_WINDOW_DEFAULT);
  const ownCommand = command?.lab === 'fourier' ? command : null;
  const clock = useLabPlayback({ active, enabled: mode === 'evolution', time, setTime, playing, setPlaying, defaultFinalTime: 6, rate: .5, command: ownCommand });
  const resetTime = () => { setTime(0); setPlaying(false); };
  const change = (patch: Partial<FourierConfig>) => { setConfig(value => ({ ...value, ...patch })); resetTime(); };
  useEffect(() => {
    if (command?.lab !== 'fourier') return;
    setConfig(value => ({ shape: command.fourierShape ?? value.shape, sigma: command.fourierSigma ?? value.sigma, center: command.fourierCenter ?? value.center,
      momentum: command.fourierMomentum ?? value.momentum, chirp: command.fourierChirp ?? value.chirp }));
    if (command.fourierView) setView(command.fourierView);
    if (command.fourierChirpEnabled !== undefined || command.fourierChirp !== undefined) setChirpEnabled(command.fourierChirpEnabled ?? true);
    if (command.fourierWindow !== undefined) setPositionWindow(command.fourierWindow);
    if (command.fourierMomentumWindow !== undefined) setMomentumWindow(command.fourierMomentumWindow);
    if (command.mode) setMode(command.mode);
    else if (command.time !== undefined) setMode('evolution');
    setTime(command.time ?? 0); setPlaying(false);
  }, [command]);
  const gaussian = !config.shape || config.shape === 'gaussian';
  const harmonic = config.shape === 'oscillator';
  const hasChirp = gaussian && chirpEnabled;
  const initial = { ...config, chirp: hasChirp ? config.chirp : 0 };
  const displayTime = mode === 'evolution' ? time : 0;
  const current = evolveFourier(initial, displayTime);
  const moments = fourierMoments(current), domains = fourierDomains(initial, positionWindow, momentumWindow);
  const windowControl = <>
    <CompactStepper id="fourier-window" label={<>Fenêtre <Formula>{String.raw`$x/\ell$`}</Formula> : ±</>} value={positionWindow} min={5} max={400} step={5} onChange={setPositionWindow} description="Demi-largeur sans dimension en x/ℓ. Seul ce réglage change l’échelle horizontale en position." />
    <CompactStepper id="fourier-momentum-window" label={<>Fenêtre <Formula>{String.raw`$p\ell/\hbar$`}</Formula> : ±</>} value={momentumWindow} min={1} max={100} step={1} onChange={setMomentumWindow} description="Demi-largeur sans dimension en pℓ/ℏ, de 1 à 100, par défaut 40. Modifie seulement l’affichage." />
  </>;
  const plots = useMemo(() => (['position', 'momentum'] as const).map(space => {
    const domain = fourierDomains(initial, positionWindow, momentumWindow)[space];
    const position = space === 'position', delta = position ? moments.dx : moments.dp;
    const center = position ? moments.x : moments.p;
    // Resolve the occupied region even in a very wide viewport, without
    // spending animation frames sampling empty tails or changing either axis.
    const left = Math.max(domain[0], center - (gaussian ? 8 : 16) * delta), right = Math.min(domain[1], center + (gaussian ? 8 : 16) * delta);
    const phaseSlope = (x: number) => harmonic ? position ? initial.momentum + (x - initial.center - initial.momentum * displayTime / FOURIER_T_SCALE) * (displayTime / FOURIER_T_SCALE) / (initial.sigma ** 4 + (displayTime / FOURIER_T_SCALE) ** 2) : -initial.center - x * displayTime / FOURIER_T_SCALE : position ? initial.momentum + current.chirp * (x - current.center) / (2 * current.sigma ** 2)
      : -initial.center - 2 * initial.sigma ** 2 * initial.chirp * (x - initial.momentum) / (1 + initial.chirp ** 2) - x * displayTime / FOURIER_T_SCALE;
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
  }), [config, chirpEnabled, view, displayTime, positionWindow, momentumWindow]);
  return <section className="workspace fourier-workspace" aria-labelledby="fourier-title">
    <aside className="control-panel">
      <div><p className="eyebrow">01</p><h1 id="fourier-title">Fonctions d’ondes en <Formula>$x$</Formula> et <Formula>$p$</Formula></h1><p className="lede">Un même état quantique, deux représentations. Resserrez le paquet en position et observez son spectre en impulsion.</p></div>
      <div className="mode-switch" role="group" aria-label="Mode du laboratoire Fourier">
        <Button variant="ghost" aria-pressed={mode === 'stationary'} className={mode === 'stationary' ? 'is-selected' : ''} onClick={() => { setMode('stationary'); resetTime(); }}>État initial</Button>
        <Button variant="ghost" aria-pressed={mode === 'evolution'} className={mode === 'evolution' ? 'is-selected' : ''} onClick={() => setMode('evolution')}>Évolution libre</Button>
      </div>
      <div className="control-stack">
        <p className="control-caption">Forme initiale en position</p>
        <div className="preset-grid fourier-shapes" role="group" aria-label="Forme initiale de la fonction d’onde">{([
          ['gaussian', 'Gaussienne'], ['exponential', 'Exponentielle décroissante'], ['lorentzian', 'Lorentzienne'], ['oscillator', 'Oscillateur : 1er état excité'],
        ] as const).map(([shape, label]) => <Button key={shape} variant="outline" aria-pressed={(config.shape ?? 'gaussian') === shape} className={(config.shape ?? 'gaussian') === shape ? 'is-selected' : ''} onClick={() => { change({ shape }); setChirpEnabled(false); }}>{label}</Button>)}</div>
        <QuantumParameter id="fourier-sigma" label={harmonic ? 'Longueur de l’oscillateur' : 'Largeur en position'} symbol={harmonic ? String.raw`$b/\ell$` : String.raw`$\sigma_0/\ell$`} value={config.sigma} min={FOURIER_SIGMA_MIN} max={FOURIER_SIGMA_MAX} step={.05} onChange={sigma => change({ sigma })} />
        <div className="preset-grid" role="group" aria-label="Largeur du paquet">{[{ label: 'Étroit', sigma: .5 }, { label: 'Standard', sigma: 1 }, { label: 'Large', sigma: 2 }].map(preset => <Button key={preset.label} variant="outline" aria-pressed={config.sigma === preset.sigma} className={config.sigma === preset.sigma ? 'is-selected' : ''} onClick={() => change({ sigma: preset.sigma })}>{preset.label}</Button>)}</div>
      </div>
      {gaussian ? <div className="well-perturbation">
        <div className="well-perturbation-heading"><label htmlFor="fourier-chirp-enabled">Phase quadratique <Formula>$c$</Formula></label><Switch id="fourier-chirp-enabled" checked={chirpEnabled} onCheckedChange={enabled => { setChirpEnabled(enabled); resetTime(); }} /></div>
        <p className="scale-note">Ajoute une phase quadratique à l’état initial. L’évolution libre reste disponible lorsque cette option est désactivée.</p>
        {hasChirp ? <div className="control-block fourier-chirp-control">
        <CompactStepper id="fourier-chirp-value" label={<>Phase quadratique <Formula>$c$</Formula></>} value={config.chirp} min={-2} max={2} step={.01}
          onChange={chirp => change({ chirp })} description="Paramètre c, de −2 à 2. Valeur initiale : 0. Saisissez une valeur puis validez avec Entrée, ou utilisez les petites flèches." />
        <Slider id="fourier-chirp" aria-label="Phase quadratique c" min={-2} max={2} step={.01} value={[config.chirp]}
          onValueChange={next => change({ chirp: Array.isArray(next) ? next[0] : next })} />
        <div className="range-labels" aria-hidden="true"><span>−2</span><span>2</span></div>
        <p className="scale-note"><Formula>$c$</Formula> mesure une corrélation position–impulsion, appelée « chirp » spatial : le gradient de phase varie à travers le paquet. Il peut décrire un paquet en expansion ou préparé pour se focaliser.</p>
      </div> : null}</div> : <p className="scale-note">La phase quadratique optionnelle est réservée à la gaussienne. Les translations et l’évolution libre restent disponibles pour cette forme.</p>}
      <div className="equation-card fourier-initial-state"><span>État initial normalisé</span>
        {harmonic ? <>
          <div className="fourier-state-representation"><p className="control-caption">En position</p>
            <Formula display>{String.raw`$\psi(x,0)=\frac{e^{ip_0(x-x_0)/\hbar}}{\sqrt b}h_1\!\left(\frac{x-x_0}{b}\right)$`}</Formula>
          </div>
          <div className="fourier-state-representation"><p className="control-caption">En impulsion</p>
            <Formula display>{String.raw`$\widetilde\psi(p,0)=-i\sqrt{\frac b\hbar}\,e^{-ipx_0/\hbar}h_1\!\left(\frac{b(p-p_0)}{\hbar}\right)$`}</Formula>
          </div>
          <Formula display>{String.raw`$h_1(u)=\frac{\sqrt{2}\,u}{\pi^{1/4}}e^{-u^2/2}$`}</Formula>
          <Formula display>{String.raw`$b=\sqrt{\frac{\hbar}{m\omega}}$`}</Formula>
          <p className="scale-note">Premier état excité de l’oscillateur harmonique, préparé à l’instant initial. Dans « Évolution libre », le piège est retiré : <Formula>$V=0$</Formula>, et non un potentiel harmonique.</p>
        </> : !gaussian ? <>
          <p className="scale-note">Exponentielle symétrique et amplitude lorentzienne forment une paire de Fourier. La densité est le carré du module de ces amplitudes.</p>
          <Formula display>{config.shape === 'exponential' ? String.raw`$a=\sqrt{2}\,\sigma_0$` : String.raw`$a=\sigma_0$`}</Formula>
          <div className="fourier-state-representation"><p className="control-caption">En position</p>
            <Formula display>{config.shape === 'exponential' ? String.raw`$\psi(x,0)=\frac{e^{-|x-x_0|/a}}{\sqrt a}\,e^{ip_0(x-x_0)/\hbar}$` : String.raw`$\psi(x,0)=\sqrt{\frac{2}{\pi a}}\,\frac{e^{ip_0(x-x_0)/\hbar}}{1+[(x-x_0)/a]^2}$`}</Formula>
          </div>
          <div className="fourier-state-representation"><p className="control-caption">En impulsion</p>
            <Formula display>{config.shape === 'exponential' ? String.raw`$\widetilde\psi(p,0)=\sqrt{\frac{2a}{\pi\hbar}}\,\frac{e^{-ipx_0/\hbar}}{1+[a(p-p_0)/\hbar]^2}$` : String.raw`$\widetilde\psi(p,0)=\sqrt{\frac a\hbar}\,e^{-a|p-p_0|/\hbar}\,e^{-ipx_0/\hbar}$`}</Formula>
          </div>
        </> : <>
        <div className="fourier-state-representation">
          <p className="control-caption">En position</p>
          <Formula display>{String.raw`$\psi(x,0)=\frac{e^{-\frac{(x-x_0)^2}{4\sigma_0^2}}\,e^{i\Phi(x)}}{(2\pi\sigma_0^2)^{1/4}}$`}</Formula>
          <Formula display>{hasChirp ? String.raw`$\Phi(x)=\frac{p_0(x-x_0)}{\hbar}+\frac{c(0)(x-x_0)^2}{4\sigma_0^2}$` : String.raw`$\Phi(x)=\frac{p_0(x-x_0)}{\hbar}$`}</Formula>
        </div>
        <div className="fourier-state-representation">
          <p className="control-caption">En impulsion</p>
          <Formula display>{chirpEnabled
            ? String.raw`$\widetilde\psi(p,0)=N_p\,e^{-\frac{\sigma_0^2(p-p_0)^2}{\hbar^2[1-i c(0)]}-\frac{ipx_0}{\hbar}}$`
            : String.raw`$\widetilde\psi(p,0)=N_p\,e^{-\frac{\sigma_0^2(p-p_0)^2}{\hbar^2}-\frac{ipx_0}{\hbar}}$`}</Formula>
          <Formula display>{chirpEnabled
            ? String.raw`$N_p=\frac{(2\sigma_0^2/\pi\hbar^2)^{1/4}}{\sqrt{1-i c(0)}}$`
            : String.raw`$N_p=\left(\frac{2\sigma_0^2}{\pi\hbar^2}\right)^{1/4}$`}</Formula>
        </div>
        </>}
        <p className="scale-note">Formules en SI : <Formula>$x$</Formula> en mètres, <Formula>$p$</Formula> en <Formula>{String.raw`$\mathrm{kg\,m\,s^{-1}}$`}</Formula>, <Formula>$t$</Formula> en secondes. Les réglages décrivent l’état à <Formula>$t=0$</Formula>.</p>
        <p className="scale-note">Graphes et réglages en grandeurs sans dimension : <Formula>{String.raw`$x/\ell$`}</Formula>, <Formula>{String.raw`$p\ell/\hbar$`}</Formula> et <Formula>{harmonic ? String.raw`$b/\ell$` : String.raw`$\sigma_0/\ell$`}</Formula>, avec <Formula>{String.raw`$\ell=1\,\mathrm{nm}$`}</Formula> fixe. Le temps reste en <Formula>{String.raw`$\mathrm{fs}=10^{-15}\,\mathrm s$`}</Formula>.</p>
        <p className="scale-note">Particule simulée : électron, <Formula>{String.raw`$m=m_e\simeq9.1094\times10^{-31}\,\mathrm{kg}$`}</Formula>. <Formula>{String.raw`$\hbar\simeq1.0546\times10^{-34}\,\mathrm{J\,s}$`}</Formula>.</p>
      </div>
      <details className="theory-notes fourier-phase"><summary>Translations</summary><div className="control-stack">
        <QuantumParameter id="fourier-center" label={'Position moyenne'} symbol={String.raw`$x_0/\ell$`} value={config.center} min={-FOURIER_CENTER_LIMIT} max={FOURIER_CENTER_LIMIT} step={.1} onChange={center => change({ center })} />
        <QuantumParameter id="fourier-momentum" label={'Impulsion moyenne'} symbol={String.raw`$p_0\ell/\hbar$`} value={config.momentum} min={-FOURIER_MOMENTUM_LIMIT} max={FOURIER_MOMENTUM_LIMIT} step={.1} onChange={momentum => change({ momentum })} />
        <p className="scale-note">Ces deux réglages sont sans dimension.</p>
      </div></details>
      <Button variant="outline" onClick={() => { setConfig(FOURIER_DEFAULTS); setChirpEnabled(false); setView('density'); resetTime(); }}>Réinitialiser le paquet</Button>
    </aside>
    <div className="figure-panel">
      <div className="figure-heading"><div><p className="eyebrow">Position ↔ impulsion</p><h2>Une paire de Fourier</h2></div><span className="figure-tag"><Formula>{String.raw`$\int |\psi|^2\,dx=\int|\widetilde\psi|^2\,dp=1$`}</Formula></span></div>
      <div className="display-switch fourier-view" role="group" aria-label="Représentation de l’état"><Button variant="outline" aria-pressed={view === 'density'} className={view === 'density' ? 'is-selected' : ''} onClick={() => setView('density')}>Densités de probabilité</Button><Button variant="outline" aria-pressed={view === 'complex'} className={view === 'complex' ? 'is-selected' : ''} onClick={() => setView('complex')}>Parties réelle et imaginaire</Button></div>
      {view === 'complex' ? <div className="plot-legend"><span><i className="legend-swatch" />partie réelle</span><span><i className="legend-swatch teal dashed" />partie imaginaire</span></div> : null}
      {mode === 'evolution' ? <PlaybackControls id="fourier" clock={clock} displayControl={windowControl} finalMin={.1} finalMax={FOURIER_FINAL_TIME_MAX} timeSymbol={String.raw`$t\ (\mathrm{fs})$`} finalSymbol={String.raw`$t_f\ (\mathrm{fs})$`}
        note={<>Évolution libre d’un électron : <Formula>$V=0$</Formula>, <Formula>$m=m_e$</Formula>. Le temps est en femtosecondes. La densité en impulsion reste constante. Modifier l’état initial remet le temps à zéro.</>} /> : <div className="fourier-initial-window">{windowControl}</div>}
      <p className="scale-note">Axes sans dimension : <Formula>{String.raw`$x/\ell$`}</Formula> et <Formula>{String.raw`$p\ell/\hbar$`}</Formula>, avec <Formula>{String.raw`$\ell=1\,\mathrm{nm}$`}</Formula> fixe, indépendant de la largeur et du temps.</p>
      <p className="scale-note">À <Formula>$t=0$</Formula>, faites glisser horizontalement sur un graphe pour déplacer sa moyenne sur toute la fenêtre visible. Augmentez « Fenêtre <Formula>{String.raw`$x/\ell$`}</Formula> » ou « Fenêtre <Formula>{String.raw`$p\ell/\hbar$`}</Formula> » pour aller plus loin. Au clavier : flèches ← →, ou Maj + flèche. Revenez à l’état initial pour modifier le paquet par glissement.</p>
      <div className="fourier-plots">{plots.map(({ space, series }) => {
        const position = space === 'position', mean = position ? moments.x : moments.p, delta = position ? moments.dx : moments.dp;
        const ymax = fourierYMax(space, view, position ? { ...initial, sigma: initial.sigma / Math.hypot(1, initial.chirp) } : initial);
        return <div className="fourier-plot" key={space}><h3>{position ? 'Position' : 'Impulsion'} <Formula>{position ? '$x$' : '$p$'}</Formula></h3>
          <div className="plot-shell"><ScientificPlot ariaLabel={position ? 'Distribution en position et largeur Δx' : 'Transformée de Fourier en impulsion et largeur Δp'}
            xDomain={domains[space]} yDomain={[view === 'density' ? 0 : -ymax, ymax]} xLabel={position ? String.raw`$x/\ell$` : String.raw`$p\ell/\hbar$`} yLabel={view === 'density' ? position ? String.raw`$\ell\,|\psi(x)|^2$` : String.raw`$\frac{\hbar}{\ell}|\widetilde\psi(p)|^2$` : position ? String.raw`$\sqrt{\ell}\,\psi(x)$` : String.raw`$\sqrt{\hbar/\ell}\,\widetilde\psi(p)$`}
            series={series} bands={[{ from: mean - delta, to: mean + delta, tone: position ? 'accent' : 'teal', opacity: .15 }]}
            xDrag={displayTime === 0 ? { value: mean, min: domains[space][0], max: domains[space][1], step: .1, label: position ? 'Déplacer la position moyenne du paquet' : 'Déplacer l’impulsion moyenne du paquet', onChange: value => change(position ? { center: Math.max(-FOURIER_CENTER_LIMIT, Math.min(FOURIER_CENTER_LIMIT, config.center + value - mean)) } : { momentum: Math.max(-FOURIER_MOMENTUM_LIMIT, Math.min(FOURIER_MOMENTUM_LIMIT, config.momentum + value - mean)) }) } : undefined}
            verticalLines={[{ value: mean, tone: 'ink', dashed: false }, { value: mean - delta, tone: 'muted' }, { value: mean + delta, tone: 'muted' }]} horizontalLines={view === 'complex' ? [{ value: 0, tone: 'muted' }] : []} /></div>
          <p className="fourier-width"><Formula>{position ? String.raw`$\Delta x/\ell=$` : String.raw`$\Delta p\,\ell/\hbar=$`}</Formula> <output>{fixed(delta)}</output></p>
          <p className="scale-note fourier-axis-unit">{view === 'density' ? 'Densité sans dimension, normalisée pour la coordonnée de cet axe.' : 'Amplitude sans dimension, dans la même normalisation que la densité.'}</p>
        </div>;
      })}</div>
      <p className="scale-note">Les bandes couvrent <Formula>{String.raw`$(\langle x\rangle\pm\Delta x)/\ell$`}</Formula> et <Formula>{String.raw`$(\langle p\rangle\pm\Delta p)\ell/\hbar$`}</Formula>{gaussian ? ', soit environ 68.3 % de chaque distribution gaussienne.' : '. La fraction de probabilité dans ces bandes dépend de la forme et du temps ; elle ne vaut pas nécessairement 68.3 %.'} Les axes horizontaux restent fixes quand la largeur, la phase ou le temps changent. Les commandes « Fenêtre <Formula>{String.raw`$x/\ell$`}</Formula> » et « Fenêtre <Formula>{String.raw`$p\ell/\hbar$`}</Formula> » règlent indépendamment les deux fenêtres d’affichage.</p>
      {Math.abs(moments.x) + 4 * moments.dx > positionWindow ? <p className="scale-note fourier-window-note" role="status">Une partie du paquet sort de la fenêtre affichée. Il continue son évolution sans réflexion ; augmentez « Fenêtre <Formula>{String.raw`$x/\ell$`}</Formula> » pour le voir davantage.</p> : null}
      {Math.abs(moments.p) + 4 * moments.dp > momentumWindow ? <p className="scale-note fourier-window-note" role="status">Une partie de la distribution en impulsion sort de la fenêtre affichée. Augmentez « Fenêtre <Formula>{String.raw`$p\ell/\hbar$`}</Formula> » pour la voir davantage.</p> : null}
      <div className="fourier-uncertainty" aria-live="off"><div><p className="control-caption">Relation d’incertitude</p><Formula display>{String.raw`$\Delta x\,\Delta p\geq\frac{\hbar}{2}$`}</Formula></div><div><span>Produit actuel</span><p><Formula>{String.raw`$${fixed(moments.product)}\,\hbar$`}</Formula></p><span>Minimum : <Formula>{String.raw`$0.500\,\hbar$`}</Formula></span></div></div>
      <p className="fourier-explanation">{harmonic ? <>Le premier état excité <Formula>$n=1$</Formula> présente un nœud au centre du paquet. Son produit d’incertitude initial vaut <Formula>{String.raw`$\Delta x(0)\,\Delta p(0)=3\hbar/2$`}</Formula>. Après retrait du piège, le paquet évolue librement.</> : !gaussian ? <>Ces deux formes ont initialement <Formula>{String.raw`$\Delta x\,\Delta p=\hbar/\sqrt{2}\simeq0.707\,\hbar$`}</Formula>, strictement au-dessus du minimum de Heisenberg. En évolution libre, la dispersion en impulsion reste constante et celle en position augmente.</> : Math.abs(current.chirp) < 1e-10 ? <>Le paquet atteint le minimum <Formula>{String.raw`$\hbar/2$`}</Formula>. Diviser <Formula>{String.raw`$\Delta x$`}</Formula> par deux multiplie <Formula>{String.raw`$\Delta p$`}</Formula> par deux : le produit reste inchangé.</> : hasChirp ? <>La phase quadratique crée une corrélation entre position et impulsion : <Formula>{String.raw`$\Delta x\,\Delta p=\frac{\hbar}{2}\sqrt{1+c^2}>\frac{\hbar}{2}$`}</Formula>. À largeur identique, cette phase ne modifie pas la densité en position.</> : <>En évolution libre, le paquet s’élargit en position tandis que sa distribution en impulsion reste inchangée. Le produit <Formula>{String.raw`$\Delta x\,\Delta p$`}</Formula> augmente donc à partir de sa valeur initiale minimale <Formula>{String.raw`$\hbar/2$`}</Formula>.</>}</p>
      <dl className="measurements"><div><dt>Position moyenne</dt><dd><Formula>{String.raw`$\langle x\rangle/\ell=$`}</Formula><output>{fixed(moments.x)}</output></dd></div><div><dt>Impulsion moyenne</dt><dd><Formula>{String.raw`$\langle p\rangle\ell/\hbar=$`}</Formula><output>{fixed(moments.p)}</output></dd></div>{hasChirp && mode === 'evolution' ? <div><dt>Phase quadratique actuelle</dt><dd><Formula>$c(t)=$</Formula><output>{fixed(current.chirp)}</output></dd></div> : null}</dl>
      {hasChirp ? <section className="fourier-physical-note" aria-labelledby="fourier-c-meaning">
        <h3 id="fourier-c-meaning">Sens physique du paramètre <Formula>$c$</Formula></h3>
        <p>La pente de la phase définit une impulsion locale, liée au courant de probabilité :</p>
        <Formula display>{String.raw`$p_{\mathrm{loc}}(x)=\hbar\frac{\partial\Phi}{\partial x}=p_0+\frac{\hbar c}{2\sigma^2}(x-x_0)$`}</Formula>
        <p>Ce champ décrit le courant, pas une impulsion parfaitement déterminée pour chaque position. Le paramètre <Formula>$c$</Formula> est sans dimension ; il ne représente pas la vitesse moyenne du paquet.</p>
        <ul>
          <li><Formula>$c&gt;0$</Formula> : le courant relatif au centre est dirigé vers l’extérieur ; le paquet s’élargirait en évolution libre.</li>
          <li><Formula>$c&lt;0$</Formula> : le courant relatif au centre est dirigé vers l’intérieur ; le paquet se resserrerait d’abord, puis s’élargirait après son point de focalisation.</li>
          <li><Formula>$c=0$</Formula> : il n’y a pas de corrélation position–impulsion. La largeur est momentanément minimale dans l’évolution libre, mais le paquet n’est pas stationnaire.</li>
        </ul>
        <p>Exemple : un paquet gaussien initialement sans chirp, libéré d’un piège, acquiert une phase quadratique pendant son expansion. Ici, changer <Formula>$c$</Formula> à largeur fixée compare différents états : ce n’est pas faire avancer le temps.</p>
      </section> : null}
      <details className="theory-notes"><summary>Repères théoriques</summary><div className="theory-grid">
        <div><span>Convention de Fourier</span><Formula display>{String.raw`$\widetilde\psi(p)=\frac{1}{\sqrt{2\pi\hbar}}\int_{-\infty}^{\infty}\psi(x)\,e^{-ipx/\hbar}\,dx$`}</Formula><p>La transformation porte sur l’amplitude complexe, pas sur la densité de probabilité. Les deux représentations décrivent le même état et ont une norme égale à 1.</p></div>
        <div><span>Mesurer une dispersion</span>
          <p>Pour un état normalisé, à l’instant considéré :</p>
          <Formula display>{String.raw`$\langle x\rangle=\int_{-\infty}^{\infty}x\,|\psi(x)|^2\,dx$`}</Formula>
          <Formula display>{String.raw`$\langle x^2\rangle=\int_{-\infty}^{\infty}x^2\,|\psi(x)|^2\,dx$`}</Formula>
          <Formula display>{String.raw`$\langle p\rangle=\int_{-\infty}^{\infty}p\,|\widetilde\psi(p)|^2\,dp$`}</Formula>
          <Formula display>{String.raw`$\langle p^2\rangle=\int_{-\infty}^{\infty}p^2\,|\widetilde\psi(p)|^2\,dp$`}</Formula>
          <Formula display>{String.raw`$\Delta x=\sqrt{\langle x^2\rangle-\langle x\rangle^2}$`}</Formula><Formula display>{String.raw`$\Delta p=\sqrt{\langle p^2\rangle-\langle p\rangle^2}$`}</Formula><p>Ce sont les dispersions des résultats de mesures sur des ensembles préparés dans le même état, pas des erreurs instrumentales.</p></div>
        {harmonic ? <div><span>Premier état excité de l’oscillateur</span><Formula display>{String.raw`$\Delta x(0)=b\sqrt{\tfrac32},\qquad\Delta p(0)=\frac{\hbar}{b}\sqrt{\tfrac32}$`}</Formula><p>La longueur <Formula>$b$</Formula> règle l’étendue de l’état <Formula>$n=1$</Formula>. Les translations <Formula>$x_0$</Formula> et <Formula>$p_0$</Formula> fixent les moyennes sans changer les dispersions.</p></div> : !gaussian ? <div><span>État initial</span><Formula display>{String.raw`$\Delta x(0)=\sigma_0,\qquad\Delta p(0)=\frac{\hbar}{\sqrt{2}\,\sigma_0}$`}</Formula><Formula display>{String.raw`$\Delta x(0)\,\Delta p(0)=\frac{\hbar}{\sqrt{2}}$`}</Formula><p>La largeur est l’écart-type de la densité, pour les trois formes. Une amplitude lorentzienne donne une densité lorentzienne au carré : ses deuxièmes moments sont finis. Les translations changent les moyennes, pas les dispersions.</p></div> : <div><span>État initial</span><Formula display>{String.raw`$\Delta x(0)=\sigma_0$`}</Formula><Formula display>{hasChirp ? String.raw`$\Delta p(0)=\frac{\hbar\sqrt{1+c(0)^2}}{2\sigma_0}$` : String.raw`$\Delta p(0)=\frac{\hbar}{2\sigma_0}$`}</Formula><p>Les translations <Formula>$x_0$</Formula> et <Formula>$p_0$</Formula> déplacent les moyennes sans modifier les dispersions. {hasChirp ? <>Le produit initial vaut <Formula>{String.raw`$\frac{\hbar}{2}\sqrt{1+c(0)^2}$`}</Formula> ; il atteint la borne de Heisenberg lorsque <Formula>$c(0)=0$</Formula>.</> : <>Cet état initial atteint la borne de Heisenberg ; la largeur en position augmente ensuite en évolution libre.</>}</p></div>}
        {hasChirp ? <><div><span>Avec une phase quadratique</span><Formula display>{String.raw`$\Delta p=\frac{\hbar\sqrt{1+c^2}}{2\sigma}$`}</Formula><p>Un paquet peut être gaussien et avoir un produit strictement supérieur à <Formula>{String.raw`$\hbar/2$`}</Formula>. Les courbes et les moments sont calculés à partir d’une paire de Fourier analytique normalisée.</p></div>
        <div><span>Corrélation et expansion</span><Formula display>{String.raw`$C_{xp}=\frac{\langle xp+px\rangle}{2}-\langle x\rangle\langle p\rangle$`}</Formula><Formula display>{String.raw`$C_{xp}=\frac{\hbar c}{2},\qquad\frac{d(\Delta x)^2}{dt}=\frac{\hbar c}{m}$`}</Formula><p>La seconde relation décrit la variation instantanée de la variance en évolution libre. Le signe de <Formula>$c$</Formula> distingue l’expansion de la contraction, même si les deux signes donnent la même densité en impulsion.</p></div>
        </> : null}
        <div><span>{hasChirp ? 'Évolution libre, avec ou sans chirp initial' : 'Évolution libre'}</span><Formula display>{harmonic ? String.raw`$(\Delta x)^2(t)=\frac32\left(b^2+\frac{\hbar^2t^2}{m^2b^2}\right)$` : !gaussian ? String.raw`$\sigma^2(t)=\sigma_0^2+\frac{\hbar^2t^2}{2m^2\sigma_0^2}$` : hasChirp ? String.raw`$\sigma^2(t)=\sigma_0^2+\frac{\hbar c(0)t}{m}+\frac{\hbar^2[1+c(0)^2]t^2}{4m^2\sigma_0^2}$` : String.raw`$\sigma^2(t)=\sigma_0^2+\frac{\hbar^2t^2}{4m^2\sigma_0^2}$`}</Formula><Formula display>{String.raw`$\widetilde\psi(p,t)=\widetilde\psi(p,0)\,e^{-ip^2t/(2m\hbar)}$`}</Formula><p>La position moyenne suit <Formula>{harmonic ? String.raw`$\langle x\rangle(t)=\langle x\rangle(0)+\frac{\langle p\rangle(0)t}{m}$` : String.raw`$\langle x\rangle(t)=x_0+\frac{p_0t}{m}$`}</Formula>. La distribution en impulsion est conservée ; seule sa phase évolue. {harmonic ? 'Les courbes et les moments sont calculés analytiquement après retrait du piège. Le paquet s’élargit en position ; il ne reste pas stationnaire comme dans un potentiel harmonique.' : gaussian ? 'Le calcul est analytique sur tout l’espace, sans parois aux bords du graphe.' : 'Les moments sont analytiques. La courbe en position est obtenue par inversion numérique de Fourier sur un domaine élargi, indépendant de la fenêtre affichée. La forme du paquet change pendant son expansion.'}</p></div>
        {hasChirp ? <div><span>Exemple : temps de vol libre</span><Formula display>{String.raw`$c(t)=\frac{\hbar t}{2m\sigma_0^2}$`}</Formula><Formula display>{String.raw`$\sigma(t)=\sigma_0\sqrt{1+c(t)^2}$`}</Formula><p>Ces expressions s’appliquent à un paquet gaussien libre de masse <Formula>$m$</Formula>, de largeur initiale <Formula>{String.raw`$\sigma_0$`}</Formula> et sans phase quadratique à <Formula>$t=0$</Formula>. Dans ce cas particulier, <Formula>$c$</Formula> est le temps écoulé exprimé en unités du temps de dispersion <Formula>{String.raw`$2m\sigma_0^2/\hbar$`}</Formula>.</p></div> : null}
      </div></details>
    </div>
  </section>;
}
