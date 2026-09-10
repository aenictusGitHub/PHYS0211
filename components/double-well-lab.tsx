'use client';

import { useEffect, useMemo, useState } from 'react';
import { PlaybackControls, DisplayControls } from '@/components/playback-controls';
import { useLabPlayback } from '@/components/use-lab-playback';
import { type ExperimentCommand } from '@/components/lab-types';
import { Math as Formula } from '@/components/math';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { eigenstateDomain, energyGuides } from '@/lib/energy-display';
import { clipEnergyGuides } from '@/lib/plot-geometry';
import { TAU_MAX, sliderValue } from '@/lib/quantum';
import {
  DOUBLE_WELL_DEFAULT, DOUBLE_WELL_LIMITS, DOUBLE_WELL_STATES, DOUBLE_WELL_EXTENT, DOUBLE_WELL_INTERVALS,
  doubleWellFrame, doubleWellLeftPhase, solveDoubleWell, type DoubleWellConfig, type DoubleWellInitialState,
} from '@/lib/double-well';

function numberTex(value: number) {
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
    const [mantissa, exponent] = value.toExponential(2).split('e');
    return `${mantissa}\\times10^{${Number(exponent)}}`;
  }
  return value.toFixed(value < 0.1 ? 4 : 3);
}

function Parameter({ id, label, symbol, value, min, max, step, onChange }: {
  id: string; label: string; symbol: string; value: number; min: number; max: number;
  step: number; onChange: (value: number) => void;
}) {
  return <div className="control-block">
    <div className="control-heading">
      <label htmlFor={id}>{label} <Formula>{symbol}</Formula></label>
      <output>{value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 2 })}</output>
    </div>
    <Slider id={id} min={min} max={max} step={step} value={[value]}
      onValueChange={next => onChange(sliderValue(next, value))} aria-label={`${label} — double puits`} />
    <div className="range-labels" aria-hidden="true"><span>{min.toLocaleString('en-US', { useGrouping: false })}</span><span>{max.toLocaleString('en-US', { useGrouping: false })}</span></div>
  </div>;
}

export function DoubleWellLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [config, setConfig] = useState<DoubleWellConfig>(DOUBLE_WELL_DEFAULT);
  const [mode, setMode] = useState<'stationary' | 'evolution'>('evolution');
  const [display, setDisplay] = useState<'wave' | 'density'>('wave');
  const [n, setN] = useState(0);
  const [initial, setInitial] = useState<DoubleWellInitialState>({ lower: 0, upperWeight: .5, relativePhase: 0 });
  const [scale, setScale] = useState(3);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const clock = useLabPlayback({ active, enabled: mode === 'evolution', time: phase, setTime: setPhase, playing, setPlaying, defaultFinalTime: TAU_MAX, rate: TAU_MAX / 12, command: command?.lab === 'double-well' ? command : null });
  const spectrum = useMemo(() => solveDoubleWell(config), [config]);
  const lower = mode === 'stationary' ? 0 : initial.lower;
  const gap = spectrum.energies[lower + 1] - spectrum.energies[lower];
  const period = TAU_MAX / gap;
  const frame = useMemo(() => doubleWellFrame(spectrum, phase, initial), [spectrum, phase, initial]);
  const meanEnergy = frame.meanEnergy;

  useEffect(() => {
    if (command?.lab !== 'double-well') return;
    if (command.mode) setMode(command.mode);
    if (command.quantumNumber !== undefined) setN(command.quantumNumber);
    if (command.preset === 'left' || command.preset === 'right') setInitial({ lower: 0, upperWeight: .5, relativePhase: command.preset === 'left' ? 0 : Math.PI });
    setConfig(current => ({
      barrier: command.barrier ?? current.barrier,
      separation: command.separation ?? current.separation,
    }));
    setPhase(command.time ?? 0);
    if (command.scale !== undefined) setScale(command.scale);
    setPlaying(false);
  }, [command]);


  const update = (patch: Partial<DoubleWellConfig>) => {
    setPlaying(false);
    setPhase(0);
    setConfig(current => ({ ...current, ...patch }));
  };
  const prepare = (patch: Partial<DoubleWellInitialState>) => {
    setPlaying(false); setPhase(0); setInitial(current => ({ ...current, ...patch }));
  };
  const leftPhase = doubleWellLeftPhase(spectrum, initial.lower);
  const preparations = [
    { label: 'À gauche', weight: .5, phase: leftPhase },
    { label: 'À droite', weight: .5, phase: leftPhase === 0 ? Math.PI : 0 },
    { label: 'En quadrature', weight: .5, phase: Math.PI / 2 },
    { label: `État n = ${initial.lower}`, quantumNumber: initial.lower, weight: 0, phase: 0 },
    { label: `État n = ${initial.lower + 1}`, quantumNumber: initial.lower + 1, weight: 1, phase: 0 },
  ];
  const baseline = mode === 'stationary' ? spectrum.energies[n] : meanEnergy;
  const values = useMemo(() => Array.from(spectrum.x, (x, j) => ({ x, y: baseline + scale * (
    mode === 'evolution' ? frame.density[j]
      : display === 'wave' ? spectrum.states[n][j] : spectrum.states[n][j] ** 2
  ) })), [spectrum, baseline, scale, mode, frame, display, n]);
  const potentialValues = useMemo(() => Array.from(spectrum.x, (x, j) => ({ x, y: spectrum.potential[j] })), [spectrum]);
  const domain = useMemo(() => {
    let lower: number, upper: number;
    if (mode === 'stationary') {
      [lower, upper] = eigenstateDomain(spectrum.energies, spectrum.states, scale, config.barrier * 1.3);
    } else {
      upper = Math.max(config.barrier * 1.3, meanEnergy + 1); lower = 0;
      for (let j = 0; j < spectrum.x.length; j++) {
        // A phase-independent bound keeps axes still during the animation.
        const amplitude = (Math.sqrt(1 - initial.upperWeight) * Math.abs(spectrum.states[initial.lower][j]) + Math.sqrt(initial.upperWeight) * Math.abs(spectrum.states[initial.lower + 1][j])) ** 2;
        upper = Math.max(upper, meanEnergy + scale * amplitude + 0.35);
        lower = Math.min(lower, meanEnergy + scale * amplitude - 0.2);
      }
    }
    const extent = Math.min(DOUBLE_WELL_EXTENT, Math.max(2.4, config.separation * Math.sqrt(1 + Math.sqrt(upper / config.barrier)) * 1.06));
    return { x: [-extent, extent] as [number, number], y: [lower, upper] as [number, number] };
  }, [config, meanEnergy, mode, scale, spectrum, initial]);
  const pct = (value: number) => `${(value * 100).toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  const densityMode = mode === 'evolution' || display === 'density';

  return <section className="workspace double-well-workspace" aria-labelledby="double-well-title">
    <aside className="control-panel">
      <div>
        <p className="eyebrow">05</p>
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
          <div className="control-block">
            <p className="control-heading">États du doublet</p>
            <div className="preset-grid preset-grid-four" role="group" aria-label="Doublet de la superposition initiale">
              {[0, 2, 4, 6].map(value => <Button key={value} variant="outline" className={initial.lower === value ? 'is-selected' : ''}
                aria-pressed={initial.lower === value} onClick={() => prepare({ lower: value })}>
                <Formula>{`$${value} + ${value + 1}$`}</Formula>
              </Button>)}
            </div>
          </div>
          <div className="preset-grid preset-grid-four" role="group" aria-label="État initial du double puits">
            {preparations.map(item => {
              const selected = initial.upperWeight === item.weight && (item.weight === 0 || item.weight === 1 || Math.abs(initial.relativePhase - item.phase) < 1e-10);
              return <Button key={item.label} variant="outline" className={selected ? 'is-selected' : ''} aria-pressed={selected} aria-label={item.label}
                onClick={() => prepare({ upperWeight: item.weight, relativePhase: item.phase })}>{item.quantumNumber !== undefined ? <>État <Formula>{`$n=${item.quantumNumber}$`}</Formula></> : item.label}</Button>;
            })}
          </div>
          <div className="equation-card"><span>Superposition initiale</span>
            <Formula display>{String.raw`$\psi(x,0)=\sqrt{1-p}\,\phi_{${initial.lower}}(x)+e^{i\delta}\,\sqrt{p}\,\phi_{${initial.lower + 1}}(x)$`}</Formula>
          </div>
          <Parameter id="double-well-population" label={`Population du niveau ${initial.lower + 1}`} symbol="$p$" value={initial.upperWeight}
            min={0} max={1} step={.05} onChange={upperWeight => prepare({ upperWeight })} />
          <Parameter id="double-well-relative-phase" label="Phase relative (°)" symbol={String.raw`$\delta$`} value={initial.relativePhase * 180 / Math.PI}
            min={-180} max={180} step={5} onChange={degrees => prepare({ relativePhase: degrees * Math.PI / 180 })} />
          <p className="scale-note">Les populations valent <Formula>{'$1-p$'}</Formula> et <Formula>{'$p$'}</Formula>. La normalisation reste égale à 1. Toute nouvelle préparation remet le temps à zéro.</p>
        </>}

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
          horizontalLines={mode === 'stationary' ? clipEnergyGuides(energyGuides(spectrum.energies, n), potentialValues) : [{ value: baseline, label: String.raw`$\langle E\rangle$`, tone: 'teal', dashed: true, labelOutside: true }]}
          verticalLines={[{ value: 0, tone: 'muted', dashed: true }]} />
      </div>
      {mode === 'stationary' ? <DisplayControls id="double-well" stationary scale={scale} onScaleChange={setScale} /> : null}
      {mode === 'stationary' ? <p className="scale-note">Échelles communes aux neuf états à potentiel et facteur <Formula>{'$s$'}</Formula> fixés. Tous les niveaux sont en pointillés ; le niveau sélectionné est en vert. Les doublets très proches peuvent se confondre à cette échelle.</p> : null}
      {mode === 'evolution' ? <>
        <PlaybackControls id="double-well" clock={clock} scale={scale} onScaleChange={setScale}
          timeSymbol="$t/T$" finalSymbol="$t_f/T$" timeUnit={TAU_MAX}
          note={<>À vitesse ×1, une période est parcourue en 12 secondes à l’écran. La période physique <Formula>$T$</Formula> est indiquée avec les paramètres.</>} />

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
          : initial.upperWeight === 0 || initial.upperWeight === 1
            ? <>Un seul état propre est occupé : sa densité reste constante. Seule la phase globale évolue. La période indiquée est celle du doublet choisi.</>
          : meanEnergy < config.barrier
            ? <>L’énergie moyenne est sous la barrière. Les interférences transfèrent de la probabilité entre les puits ; un petit écart <Formula>{String.raw`$\Delta E=E_{${initial.lower + 1}}-E_{${initial.lower}}$`}</Formula> correspond à une longue période.</>
            : <>La barrière est basse devant l’énergie moyenne : les deux états s’étendent sur les deux puits et la localisation initiale est moins marquée.</>}
      </p></div>
      <details className="theory-notes">
        <summary>Repères théoriques</summary>
        <div className="theory-grid">
          <div><span>Équation stationnaire</span><Formula display>{String.raw`$\begin{aligned}H\phi_n&=E_n\phi_n,\\H&=-\frac{\hbar^2}{2m}\frac{d^2}{dx^2}+V(x).\end{aligned}$`}</Formula></div>
          <div><span>Doublet choisi</span><Formula display>{String.raw`$\begin{aligned}n_a&=2j,\quad n_b=2j+1,\\\Delta E&=E_{n_b}-E_{n_a},\\T&=\frac{2\pi\hbar}{\Delta E}.\end{aligned}$`}</Formula></div>
          <div><span>Évolution de la superposition</span><Formula display>{String.raw`$\begin{aligned}\psi(x,t)&=\sqrt{1-p}\,\phi_{n_a}(x)\,e^{-iE_{n_a}t/\hbar}+e^{i\delta}\,\sqrt{p}\,\phi_{n_b}(x)\,e^{-iE_{n_b}t/\hbar},\\\langle E\rangle&=(1-p)E_{n_a}+pE_{n_b}.\end{aligned}$`}</Formula></div>
        </div>
        <p>Le poids et la phase relative règlent les interférences. Après une demi-période, la densité devient son image miroir ; après une période, elle se reforme. « À gauche » et « À droite » maximisent la localisation dans le doublet choisi, sans garantir une localisation complète, en particulier au-dessus de la barrière. Les probabilités affichées sont les intégrales de la densité sur chaque demi-axe.</p>
        <p>États propres calculés par différences finies sur <Formula>{`$[-${DOUBLE_WELL_EXTENT},${DOUBLE_WELL_EXTENT}]$`}</Formula> avec {DOUBLE_WELL_INTERVALS.toLocaleString('en-US', { useGrouping: false })} intervalles et des bords où la fonction s’annule. Le potentiel est quartique ; l’évolution utilise les deux états du doublet sélectionné.</p>
      </details>
    </div>
  </section>;
}
