'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { type ExperimentCommand } from '@/components/lab-types';
import { Math as Formula } from '@/components/math';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { DISPLAY_SCALE_MAX, DISPLAY_SCALE_MIN, TAU_MAX, sliderValue } from '@/lib/quantum';
import {
  DOUBLE_WELL_DEFAULT, DOUBLE_WELL_LIMITS, DOUBLE_WELL_STATES, DOUBLE_WELL_EXTENT, DOUBLE_WELL_INTERVALS,
  doubleWellFrame, solveDoubleWell, type DoubleWellConfig, type DoubleWellSide,
} from '@/lib/double-well';

function numberTex(value: number) {
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
    const [mantissa, exponent] = value.toExponential(2).split('e');
    return `${mantissa.replace('.', '{,}')}\\times10^{${Number(exponent)}}`;
  }
  return value.toFixed(value < 0.1 ? 4 : 3).replace('.', '{,}');
}

function Parameter({ id, label, symbol, value, min, max, step, onChange }: {
  id: string; label: string; symbol: string; value: number; min: number; max: number;
  step: number; onChange: (value: number) => void;
}) {
  return <div className="control-block">
    <div className="control-heading">
      <label htmlFor={id}>{label} <Formula>{symbol}</Formula></label>
      <output>{value.toLocaleString('fr-BE', { maximumFractionDigits: 2 })}</output>
    </div>
    <Slider id={id} min={min} max={max} step={step} value={[value]}
      onValueChange={next => onChange(sliderValue(next, value))} aria-label={`${label} — double puits`} />
    <div className="range-labels" aria-hidden="true"><span>{min.toLocaleString('fr-BE')}</span><span>{max.toLocaleString('fr-BE')}</span></div>
  </div>;
}

export function DoubleWellLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [config, setConfig] = useState<DoubleWellConfig>(DOUBLE_WELL_DEFAULT);
  const [mode, setMode] = useState<'stationary' | 'evolution'>('evolution');
  const [display, setDisplay] = useState<'wave' | 'density'>('wave');
  const [n, setN] = useState(0);
  const [side, setSide] = useState<DoubleWellSide>('left');
  const [scale, setScale] = useState(3);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const spectrum = useMemo(() => solveDoubleWell(config), [config]);
  const gap = spectrum.energies[1] - spectrum.energies[0];
  const period = TAU_MAX / gap;
  const meanEnergy = (spectrum.energies[0] + spectrum.energies[1]) / 2;
  const frame = useMemo(() => doubleWellFrame(spectrum, phase, side), [spectrum, phase, side]);

  useEffect(() => {
    if (command?.lab !== 'double-well') return;
    if (command.mode) setMode(command.mode);
    if (command.quantumNumber !== undefined) setN(command.quantumNumber);
    if (command.preset === 'left' || command.preset === 'right') setSide(command.preset);
    setConfig(current => ({
      barrier: command.barrier ?? current.barrier,
      separation: command.separation ?? current.separation,
    }));
    setPhase(command.time ?? 0);
    if (command.scale !== undefined) setScale(command.scale);
    setPlaying(false);
  }, [command]);

  useEffect(() => {
    if (!active || mode !== 'evolution' || !playing) return;
    let handle = 0, previous: number | undefined;
    const animate = (now: number) => {
      if (previous !== undefined) {
        const elapsed = Math.min(now - previous, 60) / 1000;
        setPhase(current => (current + elapsed * TAU_MAX / 12) % TAU_MAX);
      }
      previous = now;
      handle = window.requestAnimationFrame(animate);
    };
    handle = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(handle);
  }, [active, mode, playing]);

  const update = (patch: Partial<DoubleWellConfig>) => {
    setPlaying(false);
    setPhase(0);
    setConfig(current => ({ ...current, ...patch }));
  };
  const baseline = mode === 'stationary' ? spectrum.energies[n] : meanEnergy;
  const values = useMemo(() => Array.from(spectrum.x, (x, j) => ({ x, y: baseline + scale * (
    mode === 'evolution' ? frame.density[j]
      : display === 'wave' ? spectrum.states[n][j] : spectrum.states[n][j] ** 2
  ) })), [spectrum, baseline, scale, mode, frame, display, n]);
  const potentialValues = useMemo(() => Array.from(spectrum.x, (x, j) => ({ x, y: spectrum.potential[j] })), [spectrum]);
  const domain = useMemo(() => {
    let upper = Math.max(config.barrier * 1.3, baseline + 1), lower = 0;
    for (let j = 0; j < spectrum.x.length; j++) {
      // A phase-independent bound keeps axes still during the animation.
      const amplitude = mode === 'evolution'
        ? (Math.abs(spectrum.states[0][j]) + Math.abs(spectrum.states[1][j])) ** 2 / 2
        : display === 'wave' ? spectrum.states[n][j] : spectrum.states[n][j] ** 2;
      upper = Math.max(upper, baseline + scale * amplitude + 0.35);
      lower = Math.min(lower, baseline + scale * amplitude - 0.2);
    }
    const extent = Math.min(DOUBLE_WELL_EXTENT, Math.max(2.4, config.separation * Math.sqrt(1 + Math.sqrt(upper / config.barrier)) * 1.06));
    return { x: [-extent, extent] as [number, number], y: [lower, upper] as [number, number] };
  }, [baseline, config, display, mode, n, scale, spectrum]);
  const pct = (value: number) => `${(value * 100).toLocaleString('fr-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  const densityMode = mode === 'evolution' || display === 'density';

  return <section className="workspace double-well-workspace" aria-labelledby="double-well-title">
    <aside className="control-panel">
      <div>
        <p className="eyebrow">04</p>
        <h1 id="double-well-title">Double puits</h1>
        <p className="lede">Deux minima, une barrière centrale. Explorez les doublets d’énergie et le transfert de probabilité par effet tunnel.</p>
      </div>
      <div className="mode-switch" role="group" aria-label="Type d’exploration du double puits">
        <Button variant="ghost" className={mode === 'stationary' ? 'is-selected' : ''}
          onClick={() => { setMode('stationary'); setPlaying(false); }} aria-pressed={mode === 'stationary'}>États propres</Button>
        <Button variant="ghost" className={mode === 'evolution' ? 'is-selected' : ''}
          onClick={() => { setMode('evolution'); setPlaying(false); }} aria-pressed={mode === 'evolution'}>Évolution</Button>
      </div>
      <div className="equation-card">
        <span>Potentiel symétrique</span>
        <Formula display>{String.raw`$V(x)=V_b\left(\frac{x^2}{a^2}-1\right)^2$`}</Formula>
      </div>
      <div className="control-stack">
        <Parameter id="double-well-barrier" label="Barrière centrale" symbol="$V_b$" value={config.barrier}
          min={DOUBLE_WELL_LIMITS.barrier[0]} max={DOUBLE_WELL_LIMITS.barrier[1]} step={0.1} onChange={barrier => update({ barrier })} />
        <Parameter id="double-well-separation" label="Demi-écartement" symbol="$a$" value={config.separation}
          min={DOUBLE_WELL_LIMITS.separation[0]} max={DOUBLE_WELL_LIMITS.separation[1]} step={0.05} onChange={separation => update({ separation })} />
        <p className="scale-note">Minima en <Formula>{String.raw`$x=\pm a$`}</Formula>, où <Formula>{String.raw`$V=0$`}</Formula>. Unités réduites : <Formula>{String.raw`$\hbar=m=1$`}</Formula>.</p>
        {mode === 'stationary' ? <>
          <Parameter id="double-well-n" label="Nombre quantique" symbol="$n$" value={n} min={0} max={DOUBLE_WELL_STATES - 1} step={1} onChange={setN} />
          <div className="display-switch" role="group" aria-label="Grandeur représentée dans le double puits">
            <Button variant="outline" className={display === 'wave' ? 'is-selected' : ''} onClick={() => setDisplay('wave')} aria-pressed={display === 'wave'}><Formula>{String.raw`$\phi_n(x)$`}</Formula></Button>
            <Button variant="outline" className={display === 'density' ? 'is-selected' : ''} onClick={() => setDisplay('density')} aria-pressed={display === 'density'}><Formula>{String.raw`$|\phi_n(x)|^2$`}</Formula></Button>
          </div>
        </> : <>
          <div className="display-switch" role="group" aria-label="Localisation initiale du double puits">
            {(['left', 'right'] as const).map(value => <Button key={value} variant="outline"
              className={side === value ? 'is-selected' : ''} aria-pressed={side === value}
              onClick={() => { setSide(value); setPhase(0); setPlaying(false); }}>{value === 'left' ? 'À gauche' : 'À droite'}</Button>)}
          </div>
          <div className="equation-card"><span>Superposition initiale</span>
            <Formula display>{String.raw`$\psi(x,0)=\frac{\phi_0(x)${side === 'left' ? '+' : '-'}\phi_1(x)}{\sqrt{2}}$`}</Formula>
          </div>
        </>}
        <Parameter id="double-well-scale" label="Facteur d’affichage" symbol="$s$" value={scale}
          min={DISPLAY_SCALE_MIN} max={DISPLAY_SCALE_MAX} step={0.1} onChange={setScale} />
        <p className="scale-note">Le facteur <Formula>{'$s$'}</Formula> modifie uniquement la hauteur de la courbe, pas les probabilités ni les énergies.</p>
      </div>
      <dl className="measurements">
        {mode === 'stationary' ? <>
          <div><dt>Énergie</dt><dd><Formula>{`$E_${n}=${numberTex(spectrum.energies[n])}$`}</Formula></dd></div>
          <div><dt>Parité</dt><dd>{n % 2 === 0 ? 'paire' : 'impaire'}</dd></div>
        </> : <div><dt>Énergie moyenne</dt><dd><Formula>{String.raw`$\langle E\rangle=${numberTex(meanEnergy)}$`}</Formula></dd></div>}
        <div><dt>Écart du doublet</dt><dd><Formula>{String.raw`$\Delta E=${numberTex(gap)}$`}</Formula></dd></div>
        <div><dt>Période</dt><dd><Formula>{`$T=${numberTex(period)}$`}</Formula></dd></div>
      </dl>
    </aside>

    <div className="figure-panel">
      <div className="figure-heading">
        <div><p className="eyebrow">{mode === 'stationary' ? 'États du double puits' : 'Oscillations entre les puits'}</p>
          <h2><Formula>{mode === 'evolution' ? String.raw`$\langle E\rangle+s\,|\psi(x,t)|^2$`
            : densityMode ? String.raw`$E_${n}+s\,|\phi_${n}(x)|^2$` : String.raw`$E_${n}+s\,\phi_${n}(x)$`}</Formula></h2>
        </div>
        <div className="plot-legend" aria-label="Légende">
          <span><i className="legend-swatch accent" aria-hidden="true" />{densityMode ? 'densité de probabilité' : 'fonction propre'}</span>
          <span><i className="legend-swatch ink" aria-hidden="true" />potentiel</span>
        </div>
      </div>
      <div className="plot-shell">
        <ScientificPlot ariaLabel={`Double puits : ${mode === 'stationary' ? `état propre n égal à ${n}` : `densité de probabilité à t sur T égal à ${(phase / TAU_MAX).toFixed(2)}`}`}
          xDomain={domain.x} yDomain={domain.y} xTicks={[-config.separation, 0, config.separation]}
          xLabel="$x$" yLabel={mode === 'evolution' ? String.raw`$E+s\,|\psi|^2$` : densityMode ? String.raw`$E+s\,|\phi_n|^2$` : String.raw`$E+s\,\phi_n$`}
          series={[
            { values: potentialValues, tone: 'ink', width: 2, fillTo: 0, fillOpacity: 0.1 },
            { values, tone: 'accent', width: 2.8, fillTo: baseline, fillOpacity: 0.27 },
          ]}
          horizontalLines={[{ value: baseline, label: mode === 'stationary' ? `$E_${n}$` : String.raw`$\langle E\rangle$`, tone: 'teal', dashed: true }]}
          verticalLines={[{ value: 0, tone: 'muted', dashed: true }]} />
      </div>
      {mode === 'evolution' ? <>
        <div className="scattering-timeline">
          <div className="transport-controls">
            <Button onClick={() => setPlaying(current => !current)}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{playing ? 'Pause' : 'Animer'}</Button>
            <Button variant="outline" size="icon" aria-label="Réinitialiser le double puits" onClick={() => { setPhase(0); setPlaying(false); }}><RotateCcw aria-hidden="true" /></Button>
          </div>
          <div className="control-block">
            <div className="control-heading"><label htmlFor="double-well-time">Temps <Formula>{'$t/T$'}</Formula></label><output>{(phase / TAU_MAX).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</output></div>
            <Slider id="double-well-time" min={0} max={TAU_MAX} step={TAU_MAX / 200} value={[phase]} aria-label="Temps du double puits, fraction de la période" onValueChange={next => { setPhase(sliderValue(next, 0)); setPlaying(false); }} />
            <div className="range-labels" aria-hidden="true"><span>0</span><span><Formula>{'$T/2$'}</Formula></span><span><Formula>{'$T$'}</Formula></span></div>
          </div>
        </div>
        <p className="scale-note double-well-clock">Une période est parcourue en 12 secondes à l’écran. Sa durée physique <Formula>{'$T$'}</Formula> est affichée avec les paramètres, en unités réduites.</p>
        <dl className="probability-cards double-well-probabilities">
          <div className="probability-card"><dt>Puits gauche</dt><dd>{pct(frame.left)}</dd><small><Formula>{'$x<0$'}</Formula></small></div>
          <div className="probability-card is-right"><dt>Puits droit</dt><dd>{pct(frame.right)}</dd><small><Formula>{'$x>0$'}</Formula></small></div>
        </dl>
        <div className="probability-bar" role="img" aria-label={`Probabilité à gauche ${pct(frame.left)}, à droite ${pct(frame.right)}`}>
          <span style={{ width: `${100 * frame.left}%` }} /><span className="double-well-right" style={{ width: `${100 * frame.right}%` }} />
        </div>
      </> : null}
      <div className="insight-row double-well-insight"><span className="insight-index"><Formula>{mode === 'stationary' ? `$n=${n}$` : String.raw`$\Delta E$`}</Formula></span><p>
        {mode === 'stationary' ? <>L’état <Formula>{`$n=${n}$`}</Formula> est {n % 2 === 0 ? 'pair' : 'impair'} et possède {n} nœud{n > 1 ? 's' : ''}. Sa densité de probabilité est symétrique.</>
          : meanEnergy < config.barrier
            ? <>L’énergie moyenne est sous la barrière. La superposition évolue d’un puits vers l’autre ; un petit écart <Formula>{String.raw`$\Delta E=E_1-E_0$`}</Formula> correspond à une longue période.</>
            : <>La barrière est basse devant l’énergie moyenne : les deux états s’étendent sur les deux puits et la localisation initiale est moins marquée.</>}
      </p></div>
      <details className="theory-notes">
        <summary>Repères théoriques</summary>
        <div className="theory-grid">
          <div><span>Équation stationnaire</span><Formula display>{String.raw`$\begin{aligned}\hat H\phi_n&=E_n\phi_n,\\\hat H&=-\frac{\hbar^2}{2m}\frac{d^2}{dx^2}+V(x).\end{aligned}$`}</Formula></div>
          <div><span>Doublet fondamental</span><Formula display>{String.raw`$\begin{aligned}\phi_0(-x)&=\phi_0(x),\\\phi_1(-x)&=-\phi_1(x),\\\Delta E&=E_1-E_0.\end{aligned}$`}</Formula></div>
          <div><span>Évolution de la superposition</span><Formula display>{String.raw`$\begin{aligned}\psi(x,t)&=\frac{1}{\sqrt2}\bigl[\phi_0(x)e^{-iE_0t/\hbar}\\&\qquad\pm\phi_1(x)e^{-iE_1t/\hbar}\bigr],\\T&=\frac{2\pi\hbar}{\Delta E}.\end{aligned}$`}</Formula></div>
        </div>
        <p>Le signe choisit le côté initial. Après une demi-période, la densité devient son image miroir ; après une période, elle se reforme. Pour une barrière basse, le paquet n’est pas entièrement localisé dans un seul puits. Les probabilités affichées sont les intégrales de la densité sur chaque demi-axe.</p>
        <p>États propres calculés par différences finies sur <Formula>{`$[-${DOUBLE_WELL_EXTENT},${DOUBLE_WELL_EXTENT}]$`}</Formula> avec {DOUBLE_WELL_INTERVALS.toLocaleString('fr-BE')} intervalles et des bords où la fonction s’annule. Le potentiel est quartique ; seuls les deux premiers états entrent dans cette évolution. <a href="https://doi.org/10.1039/D0RA07292C" target="_blank" rel="noreferrer">Doublets et effet tunnel · RSC Advances</a>.</p>
      </details>
    </div>
  </section>;
}
