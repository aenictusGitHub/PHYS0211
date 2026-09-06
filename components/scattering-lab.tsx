'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

import { type ExperimentCommand } from '@/components/lab-types';
import { Math as Formula } from '@/components/math';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import ScatteringWorker from '../lib/scattering.worker?worker';
import { sliderValue } from '@/lib/quantum';
import {
  SCATTERING_DEFAULT, SCATTERING_PRESETS, SAMPLE_X, ScatteringSolver,
  incidentEnergy, interactionEdge, potentialAt, sampleTimeline, scatteringDuration,
  type PotentialKind, type ScatteringConfig, type ScatteringTimeline,
} from '@/lib/scattering';

function Parameter({ id, label, symbol, value, min, max, step, onChange }: {
  id: string; label: string; symbol: string; value: number; min: number; max: number;
  step: number; onChange: (value: number) => void;
}) {
  return (
    <div className="control-block">
      <div className="control-heading">
        <label htmlFor={id}>{label} <Formula>{symbol}</Formula></label>
        <output>{value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 2 })}</output>
      </div>
      <Slider id={id} min={min} max={max} step={step} value={[value]}
        onValueChange={next => onChange(sliderValue(next, value))} aria-label={label} />
      <div className="range-labels" aria-hidden="true"><span>{min.toLocaleString('en-US', { useGrouping: false })}</span><span>{max.toLocaleString('en-US', { useGrouping: false })}</span></div>
    </div>
  );
}

function PotentialIcon({ kind }: { kind: PotentialKind }) {
  return <svg viewBox="0 0 44 22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d={kind === 'gaussian' ? 'M1 19C13 19 14 3 22 3S31 19 43 19' : kind === 'well' ? 'M1 4H14V19H30V4H43' : 'M1 19H14V4H30V19H43'} />
  </svg>;
}

export function ScatteringLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [config, setConfig] = useState<ScatteringConfig>(SCATTERING_DEFAULT);
  const [scale, setScale] = useState(16);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [componentsOpen, setComponentsOpen] = useState(false);
  const [result, setResult] = useState<{ key: string; timeline: ScatteringTimeline } | null>(null);
  const key = JSON.stringify(config);
  const timeline = result?.key === key ? result.timeline : null;
  const duration = scatteringDuration(config);
  const initial = useMemo(() => new ScatteringSolver(config).snapshot(), [config]);
  const frame = useMemo(() => timeline ? sampleTimeline(timeline, time) : {
    ...initial,
    density: Float32Array.from(initial.re, (real, i) => real ** 2 + initial.im[i] ** 2),
  }, [initial, timeline, time]);

  useEffect(() => {
    if (!command || command.lab !== 'scattering') return;
    setPlaying(false);
    setConfig(current => {
      const preset = command.preset && command.preset in SCATTERING_PRESETS
        ? SCATTERING_PRESETS[command.preset as keyof typeof SCATTERING_PRESETS] : current;
      return {
        potential: command.potential ?? preset.potential,
        height: command.height ?? preset.height,
        width: command.width ?? preset.width,
        momentum: command.momentum ?? preset.momentum,
        sigma: command.sigma ?? preset.sigma,
      };
    });
    setTime(0);
    if (command.scale !== undefined) setScale(command.scale);
  }, [command]);

  useEffect(() => {
    if (command?.lab === 'scattering' && command.progress !== undefined && timeline) {
      setTime(command.progress * timeline.duration);
    }
  }, [command, timeline]);

  useEffect(() => {
    if (!active || timeline) return;
    let worker: Worker | undefined;
    setError(false);
    setProgress(0);
    // Debounce slider gestures; terminating the old worker cancels stale runs.
    const timeout = window.setTimeout(() => {
      try {
        worker = new ScatteringWorker();
        worker.onmessage = event => {
          if (event.data.type === 'progress') setProgress(event.data.progress);
          else if (event.data.type === 'ready') {
            setResult({ key, timeline: event.data.timeline as ScatteringTimeline });
            setProgress(1);
          } else setError(true);
        };
        worker.onerror = event => { console.error('Wavepacket worker failed', event.message); setError(true); };
        worker.postMessage(config);
      } catch (error) { console.error('Wavepacket worker could not start', error); setError(true); }
    }, 120);
    return () => { window.clearTimeout(timeout); worker?.terminate(); };
  }, [active, config, key, timeline, retry]);

  useEffect(() => {
    if (!active || !playing || !timeline) return;
    let handle = 0;
    let previous: number | undefined;
    const animate = (now: number) => {
      if (previous !== undefined) {
        const elapsed = Math.min(now - previous, 50) / 1000;
        setTime(current => Math.min(duration, current + elapsed * duration / 16));
      }
      previous = now;
      handle = window.requestAnimationFrame(animate);
    };
    handle = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(handle);
  }, [active, duration, playing, timeline]);

  useEffect(() => { if (time >= duration) setPlaying(false); }, [time, duration]);

  const update = (patch: Partial<ScatteringConfig>) => {
    setPlaying(false);
    setTime(0);
    setConfig(current => ({ ...current, ...patch }));
  };
  const energy = incidentEnergy(config);
  const edge = interactionEdge(config);
  const maxDensity = timeline?.maxDensity ?? 1 / (Math.sqrt(2 * Math.PI) * config.sigma);
  const yMax = Math.max(1, energy, config.potential === 'well' ? 0 : config.height, scale * maxDensity) * 1.16;
  const yMin = config.potential === 'well' ? -Math.max(0.3, config.height * 1.1) : 0;
  const densityValues = useMemo(() => Array.from(SAMPLE_X, (x, i) => ({ x, y: scale * frame.density[i] })), [frame, scale]);
  const potentialValues = useMemo(() => config.potential === 'gaussian'
    ? Array.from(SAMPLE_X, x => ({ x, y: potentialAt(x, config) }))
    : [
      { x: -64, y: 0 }, { x: -config.width / 2, y: 0 },
      { x: -config.width / 2, y: config.height * (config.potential === 'well' ? -1 : 1) },
      { x: config.width / 2, y: config.height * (config.potential === 'well' ? -1 : 1) },
      { x: config.width / 2, y: 0 }, { x: 64, y: 0 },
    ], [config]);
  const finished = time >= duration;
  const collisionTime = 24 / config.momentum;
  const stateLabel = error ? 'Calcul interrompu' : !timeline ? `Préparation · ${Math.round(progress * 100)} %`
    : finished ? 'Fin de l’évolution' : playing ? 'Évolution en cours' : time === 0 ? 'Paquet incident prêt' : 'En pause';
  const boundaryFormula = config.potential === 'gaussian' ? String.raw`$b=3a/2$` : String.raw`$b=a/2$`;
  const pct = (value: number) => `${(100 * value).toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  const potentialFormula = config.potential === 'gaussian' ? String.raw`$V(x)=V_0e^{-2x^2/a^2}$`
    : config.potential === 'well' ? String.raw`$V(x)=\begin{cases}-V_0,&|x|<a/2,\\0,&|x|\ge a/2.\end{cases}$`
    : String.raw`$V(x)=\begin{cases}V_0,&|x|<a/2,\\0,&|x|\ge a/2.\end{cases}$`;

  return (
    <section className="workspace" aria-labelledby="scattering-title">
      <aside className="control-panel scattering-controls">
        <div>
          <p className="eyebrow">03</p>
          <h1 id="scattering-title">Diffusion d’un paquet d’ondes</h1>
          <p className="lede">Un paquet incident rencontre un potentiel. Suivez sa réflexion, sa transmission et les interférences.</p>
        </div>
        <div className="potential-choices" role="group" aria-label="Forme du potentiel">
          {(['barrier', 'gaussian', 'well'] as const).map(kind => (
            <Button key={kind} variant="outline" className={config.potential === kind ? 'is-selected' : ''}
              aria-pressed={config.potential === kind} onClick={() => update({ potential: kind })}>
              <PotentialIcon kind={kind} />{kind === 'barrier' ? 'Barrière' : kind === 'gaussian' ? 'Gaussien' : 'Puits'}
            </Button>
          ))}
        </div>
        <div className="equation-card">
          <span>Potentiel</span><Formula display>{potentialFormula}</Formula>
        </div>
        <div className="control-stack">
          <Parameter id="scattering-height" label={config.potential === 'well' ? 'Profondeur' : 'Hauteur'} symbol={String.raw`$V_0$`}
            value={config.height} min={0} max={8} step={0.1} onChange={height => update({ height })} />
          <Parameter id="scattering-width" label="Largeur du potentiel" symbol="$a$"
            value={config.width} min={0.5} max={6} step={0.25} onChange={width => update({ width })} />
          <Parameter id="scattering-momentum" label="Nombre d’onde" symbol={String.raw`$k_0$`}
            value={config.momentum} min={1} max={4} step={0.1} onChange={momentum => update({ momentum })} />
          <Parameter id="scattering-sigma" label="Largeur du paquet" symbol={String.raw`$\sigma_x$`}
            value={config.sigma} min={2} max={5} step={0.25} onChange={sigma => update({ sigma })} />
          <Parameter id="scattering-scale" label="Facteur d’affichage" symbol="$s$"
            value={scale} min={0.5} max={20} step={0.5} onChange={setScale} />
        </div>
        <dl className="measurements">
          <div><dt>Énergie moyenne</dt><dd><Formula>{`$\\langle E\\rangle=${energy.toFixed(2)}$`}</Formula></dd></div>
          <div><dt>Centre initial</dt><dd><Formula>{String.raw`$x_i=-24$`}</Formula></dd></div>
          <div><dt>Unités réduites</dt><dd><Formula>{String.raw`$\hbar=m=1$`}</Formula></dd></div>
        </dl>
      </aside>

      <div className="figure-panel">
        <div className="figure-heading">
          <div><p className="eyebrow">Réflexion & transmission</p><h2><Formula>{String.raw`$s\,|\psi(x,t)|^2\quad\text{et}\quad V(x)$`}</Formula></h2></div>
          <div className="plot-legend" aria-label="Légende">
            <span><i className="legend-swatch accent" aria-hidden="true" />densité de probabilité</span>
            <span><i className="legend-swatch ink" aria-hidden="true" />potentiel</span>
            <span><i className="legend-swatch teal dashed" aria-hidden="true" /><Formula>{String.raw`$\langle E\rangle$`}</Formula></span>
          </div>
        </div>
        <div className="scattering-toolbar">
          <div className="scattering-presets" role="group" aria-label="Expériences de diffusion">
            {Object.entries(SCATTERING_PRESETS).map(([name, preset]) => (
              <Button key={name} variant="outline" className={key === JSON.stringify(preset) ? 'is-selected' : ''}
                aria-pressed={key === JSON.stringify(preset)} onClick={() => update(preset)}>
                {name === 'tunnel' ? 'Effet tunnel' : name === 'transmission' ? 'Transmission' : 'Réflexion'}
              </Button>
            ))}
          </div>
          <span className={`simulation-status${timeline ? '' : ' is-computing'}`} role="status">{stateLabel}</span>
        </div>
        {error ? <p role="alert">Le calcul n’a pas abouti. <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Réessayer</Button></p> : null}
        <div className="plot-shell">
          <ScientificPlot ariaLabel={`Diffusion du paquet au temps ${time.toFixed(2)} : densité de probabilité et potentiel ${config.potential}`}
            xDomain={[-64, 64]} yDomain={[yMin, yMax]} xTicks={[-60, -40, -20, 0, 20, 40, 60]}
            xLabel="$x$" yLabel={String.raw`$s\,|\psi|^2,\;V$`}
            series={[
              { values: potentialValues, tone: 'ink', fillTo: 0, fillOpacity: 0.16, width: 2 },
              { values: densityValues, tone: 'accent', fillTo: 0, fillOpacity: 0.3, width: 2.6 },
            ]}
            horizontalLines={[{ value: energy, label: String.raw`$\langle E\rangle$`, tone: 'teal' }]}
          />
        </div>
        <div className="scattering-timeline">
          <div className="transport-controls">
            <Button disabled={!timeline} onClick={() => {
              if (finished) setTime(0);
              setPlaying(value => !value);
            }}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{playing ? 'Pause' : finished ? 'Rejouer' : 'Animer'}</Button>
            <Button variant="outline" size="icon" aria-label="Revenir au paquet initial" onClick={() => { setPlaying(false); setTime(0); }}><RotateCcw aria-hidden="true" /></Button>
          </div>
          <div className="control-block">
            <div className="control-heading"><label htmlFor="scattering-time">Temps <Formula>$t$</Formula></label><output>{time.toFixed(2)}</output></div>
            <Slider id="scattering-time" min={0} max={duration} step={0.01} value={[time]} disabled={!timeline}
              aria-label="Temps de la diffusion" onValueChange={value => { setPlaying(false); setTime(sliderValue(value, 0)); }} />
            <div className="range-labels"><span>État initial</span><span>Après la rencontre</span></div>
          </div>
        </div>
        <dl className="probability-cards">
          <div className="probability-card"><dt>À gauche</dt><dd>{pct(frame.left)}</dd><small><Formula>{String.raw`$x<-b$`}</Formula></small></div>
          <div className="probability-card is-center"><dt>Dans la zone</dt><dd>{pct(frame.center)}</dd><small><Formula>{String.raw`$|x|\le b$`}</Formula></small></div>
          <div className="probability-card is-right"><dt>À droite</dt><dd>{pct(frame.right)}</dd><small><Formula>{String.raw`$x>b$`}</Formula></small></div>
        </dl>
        <p className="probability-note">Probabilités instantanées, avec <Formula>{boundaryFormula}</Formula>. Après séparation des paquets, gauche et droite donnent les fractions réfléchie et transmise.
          <span className="probability-bar" aria-hidden="true"><span style={{ width: `${frame.left * 100}%` }} /><span style={{ width: `${frame.center * 100}%` }} /><span style={{ width: `${frame.right * 100}%` }} /></span>
        </p>
        <div className="insight-row">
          <span className="insight-index"><Formula>{String.raw`$\psi$`}</Formula></span>
          <p>{config.height === 0 ? 'Sans potentiel, le paquet avance et s’étale librement.'
            : config.potential === 'well' ? 'Même un puits attractif peut réfléchir une partie du paquet : la réflexion est un phénomène ondulatoire.'
            : energy < config.height ? <>L’énergie moyenne est inférieure au sommet du potentiel. Une partie du paquet peut néanmoins traverser ; son spectre d’énergies intervient aussi dans la transmission.</>
            : 'Au-dessus du potentiel, la transmission domine généralement, mais une réflexion reste possible.'}
            {time > collisionTime && frame.center > .03 ? ' L’interaction est encore en cours.' : ''}</p>
        </div>
        <details className="scattering-components" onToggle={event => setComponentsOpen(event.currentTarget.open)}>
          <summary>Parties réelle et imaginaire de <Formula>{String.raw`$\psi$`}</Formula></summary>
          {componentsOpen ? <>
            <div className="plot-legend"><span><i className="legend-swatch accent" /><Formula>{String.raw`$\operatorname{Re}\psi$`}</Formula></span><span><i className="legend-swatch teal" /><Formula>{String.raw`$\operatorname{Im}\psi$`}</Formula></span></div>
            <div className="plot-shell"><ScientificPlot ariaLabel="Parties réelle et imaginaire du paquet d’ondes"
              xDomain={[-64, 64]} yDomain={[-(timeline?.maxAmplitude ?? .6) * 1.1, (timeline?.maxAmplitude ?? .6) * 1.1]}
              xTicks={[-60, -40, -20, 0, 20, 40, 60]} xLabel="$x$" yLabel={String.raw`$\psi(x,t)$`}
              series={[{ values: Array.from(SAMPLE_X, (x, i) => ({ x, y: frame.re[i] })), tone: 'accent', width: 1.6 }, { values: Array.from(SAMPLE_X, (x, i) => ({ x, y: frame.im[i] })), tone: 'teal', width: 1.6 }]}
              bands={[{ from: -edge, to: edge, tone: 'ink', opacity: .08 }]} />
            </div>
          </> : null}
        </details>
        <details className="theory-notes">
          <summary>Repères théoriques</summary>
          <div className="theory-grid">
            <div><span>Équation de Schrödinger</span><Formula display>{String.raw`$i\hbar\frac{\partial\psi}{\partial t}=\left[-\frac{\hbar^2}{2m}\frac{\partial^2}{\partial x^2}+V(x)\right]\psi$`}</Formula></div>
            <div><span>Paquet gaussien initial</span><Formula display>{String.raw`$\psi(x,0)=\frac{e^{-\frac{(x-x_i)^2}{4\sigma_x^2}}e^{ik_0x}}{(2\pi\sigma_x^2)^{1/4}}$`}</Formula></div>
            <div><span>Dispersion et énergie</span><Formula display>{String.raw`$\begin{aligned}\langle p\rangle&=\hbar k_0,\qquad\Delta p=\frac{\hbar}{2\sigma_x},\\ \langle E\rangle&=\frac{\hbar^2 k_0^2}{2m}+\frac{\hbar^2}{8m\sigma_x^2}.\end{aligned}$`}</Formula></div>
          </div>
          <p>Le paquet est normalisé : <Formula>{String.raw`$\int|\psi(x,t)|^2\,dx=1$`}</Formula>. Le facteur <Formula>$s$</Formula> agit uniquement sur la hauteur affichée de la densité. Les probabilités sont intégrées sur tout le domaine de calcul, y compris hors du cadre visible. Pour le potentiel gaussien, <Formula>{String.raw`$a=2\sigma_V$`}</Formula> et la zone centrale couvre trois écarts types de part et d’autre.</p>
          <p>Évolution par séparation symétrique des opérateurs cinétique et potentiel, sur une grille de 4 096 points. Les bords périodiques sont éloignés de la région de collision. <a href="https://chem542.class.uic.edu/split_operator/" target="_blank" rel="noreferrer">Méthode numérique · UIC</a></p>
        </details>
      </div>
    </section>
  );
}
