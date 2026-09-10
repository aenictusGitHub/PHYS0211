'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

import { type ExperimentCommand } from '@/components/lab-types';
import { Math as Formula } from '@/components/math';
import { DisplayControls } from '@/components/playback-controls';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import ScatteringWorker from '../lib/scattering.worker?worker';
import { sliderValue } from '@/lib/quantum';
import { advancePlaybackTime, PLAYBACK_SPEED_DEFAULT, PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX } from '@/lib/playback';
import {
  SCATTERING_DEFAULT, SCATTERING_POTENTIALS, SAMPLE_X, ScatteringSolver, GRAVITY_DEFAULT, GRAVITY_MAX,
  ALL_SCATTERING_PRESETS, scatteringConfigKey, isUniformField, gravitationalAcceleration, uniformFieldMoments,
  SCATTERING_MOMENTUM_MIN, SCATTERING_MOMENTUM_MAX, SCATTERING_MOMENTUM_STEP,
  SCATTERING_FINAL_TIME_MIN, scatteringFinalTime, scatteringFinalTimeMax,
  incidentEnergy, initialPotentialEnergy, interactionEdge, scatteringPotentialProfile, sampleTimeline, scatteringDuration,
  type PotentialKind, type ScatteringConfig, type ScatteringTimeline,
} from '@/lib/scattering';

function Parameter({ id, label, symbol, value, min, max, step, onChange, precision = 2 }: {
  id: string; label: string; symbol: string; value: number; min: number; max: number;
  step: number; onChange: (value: number) => void; precision?: number;
}) {
  return (
    <div className="control-block">
      <div className="control-heading">
        <label htmlFor={id}>{label} <Formula>{symbol}</Formula></label>
        <output>{value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: precision })}</output>
      </div>
      <Slider id={id} min={min} max={max} step={step} value={[value]}
        onValueChange={next => onChange(sliderValue(next, value))} aria-label={label} />
      <div className="range-labels" aria-hidden="true"><span>{min.toLocaleString('en-US', { useGrouping: false })}</span><span>{max.toLocaleString('en-US', { useGrouping: false })}</span></div>
    </div>
  );
}

function PotentialIcon({ kind }: { kind: PotentialKind }) {
  return <svg viewBox="0 0 44 22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d={kind === 'free' ? 'M1 18H43' : kind === 'gravity' ? 'M1 20L43 2' : kind === 'gaussian' ? 'M1 19C13 19 14 3 22 3S31 19 43 19' : kind === 'well' ? 'M1 4H14V19H30V4H43' : 'M1 19H14V4H30V19H43'} />
  </svg>;
}

export function ScatteringLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [config, setConfig] = useState<ScatteringConfig>(SCATTERING_DEFAULT);
  const [scale, setScale] = useState(16);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(PLAYBACK_SPEED_DEFAULT);
  const [finalTime, setFinalTime] = useState<{ key: string; value: number } | null>(null);
  const playbackSpeedRef = useRef(playbackSpeed);
  useEffect(() => { playbackSpeedRef.current = playbackSpeed; }, [playbackSpeed]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [componentsOpen, setComponentsOpen] = useState(false);
  const [configuredCommandId, setConfiguredCommandId] = useState<number | null>(null);
  const appliedProgressCommand = useRef<number | null>(null);
  const [result, setResult] = useState<{ key: string; timeline: ScatteringTimeline } | null>(null);
  const key = scatteringConfigKey(config);
  // A manual endpoint belongs only to the physical configuration that set it.
  const automatic = finalTime?.key !== key;
  const availableTimeline = result?.key === key ? result.timeline : null;
  const duration = automatic ? availableTimeline?.automaticFinalTime ?? scatteringFinalTime(config)
    : scatteringFinalTime(config, finalTime!.value);
  const maxFinalTime = scatteringFinalTimeMax(config);
  const referenceDuration = scatteringDuration(config);
  const timeline = availableTimeline && (automatic ? availableTimeline.automaticFinalTime !== undefined : availableTimeline.duration >= duration) ? availableTimeline : null;
  const initial = useMemo(() => new ScatteringSolver(config).snapshot(), [config]);
  const frame = useMemo(() => availableTimeline ? sampleTimeline(availableTimeline, time) : {
    ...initial,
    density: Float32Array.from(initial.re, (real, i) => real ** 2 + initial.im[i] ** 2),
  }, [initial, availableTimeline, time]);

  // Retained development tabs can still hold a potential that was removed.
  useEffect(() => {
    if (!SCATTERING_POTENTIALS.includes(config.potential)) {
      setPlaying(false); setTime(0); setConfig(SCATTERING_DEFAULT);
    }
  }, [config.potential]);

  useEffect(() => {
    if (!command || command.lab !== 'scattering') return;
    setPlaying(false);
    const preset = command.preset && Object.hasOwn(ALL_SCATTERING_PRESETS, command.preset)
      ? ALL_SCATTERING_PRESETS[command.preset as keyof typeof ALL_SCATTERING_PRESETS] : config;
    const nextConfig = {
      potential: command.potential ?? preset.potential,
      height: command.height ?? preset.height,
      width: command.width ?? preset.width,
      momentum: command.momentum ?? preset.momentum,
      sigma: command.sigma ?? preset.sigma,
      gravity: command.gravity ?? preset.gravity ?? GRAVITY_DEFAULT,
    };
    setConfig(nextConfig);
    setTime(0);
    if (command.scale !== undefined) setScale(command.scale);
    if (command.playbackSpeed !== undefined) setPlaybackSpeed(command.playbackSpeed);
    if (command.finalTime !== undefined) setFinalTime({ key: scatteringConfigKey(nextConfig), value: command.finalTime });
    else if (['preset', 'potential', 'height', 'width', 'momentum', 'sigma', 'gravity'].some(field => command[field as keyof ExperimentCommand] !== undefined)) setFinalTime(null);
    setConfiguredCommandId(command.id);
  }, [command]);

  useEffect(() => {
    if (command?.lab === 'scattering' && command.progress !== undefined && timeline
      && configuredCommandId === command.id && appliedProgressCommand.current !== command.id) {
      setTime(command.progress * duration);
      appliedProgressCommand.current = command.id;
    }
  }, [command, configuredCommandId, timeline, duration]);

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
        worker.postMessage({ config, finalTime: automatic ? null : duration });
      } catch (error) { console.error('Wavepacket worker could not start', error); setError(true); }
    }, 120);
    return () => { window.clearTimeout(timeout); worker?.terminate(); };
  }, [active, config, key, duration, automatic, timeline, retry]);

  useEffect(() => {
    if (!active || !playing || !timeline) return;
    let handle = 0;
    let previous: number | undefined;
    const animate = (now: number) => {
      if (previous !== undefined) {
        const elapsed = (now - previous) / 1000;
        setTime(current => advancePlaybackTime(current, elapsed, duration, playbackSpeedRef.current, referenceDuration));
      }
      previous = now;
      handle = window.requestAnimationFrame(animate);
    };
    handle = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(handle);
  }, [active, duration, referenceDuration, playing, timeline]);

  useEffect(() => { if (time >= duration) setPlaying(false); }, [time, duration]);

  const updateFinalTime = (value: number) => {
    const next = scatteringFinalTime(config, value);
    if (next === duration) return;
    setPlaying(false);
    setTime(current => Math.min(current, next));
    setFinalTime({ key, value: next });
  };

  const update = (patch: Partial<ScatteringConfig>) => {
    setPlaying(false);
    setTime(0);
    setFinalTime(null);
    setConfig(current => ({ ...current, ...patch }));
  };
  const restoreAutomaticTime = () => {
    setPlaying(false);
    setTime(0);
    setFinalTime(null);
  };
  const gravity = config.potential === 'gravity';
  const uniform = isUniformField(config);
  const g = gravitationalAcceleration(config);
  const coordinate = gravity ? 'z' : 'x';
  const moments = uniformFieldMoments(config, availableTimeline ? time : 0);
  const energy = useMemo(() => incidentEnergy(config) + initialPotentialEnergy(config), [config]);
  const edge = interactionEdge(config);
  const maxDensity = timeline?.maxDensity ?? 1 / (Math.sqrt(2 * Math.PI) * config.sigma);
  const yMax = Math.max(1, uniform ? 0 : energy, uniform || config.potential === 'well' ? 0 : config.height, scale * maxDensity) * 1.16;
  const yMin = config.potential === 'well' ? -Math.max(0.3, config.height * 1.1) : 0;
  const densityValues = useMemo(() => Array.from(SAMPLE_X, (x, i) => ({ x, y: scale * frame.density[i] })), [frame, scale]);
  const potentialValues = useMemo(() => scatteringPotentialProfile(config), [config]);
  const finished = time >= duration;
  const collisionTime = 24 / config.momentum;
  const stateLabel = error ? 'Calcul interrompu' : !timeline ? `Préparation · ${Math.round(progress * 100)} %`
    : finished ? 'Fin de la fenêtre' : playing ? 'Évolution en cours' : time === 0 ? 'Paquet incident prêt' : 'En pause';
  const boundaryFormula = config.potential === 'gaussian' ? String.raw`$b=3a/2$` : String.raw`$b=a/2$`;
  const pct = (value: number) => `${(100 * value).toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  const potentialFormula = gravity ? String.raw`$V(z)=mgz,\qquad F_z=-mg$`
    : config.potential === 'free' ? String.raw`$V(x)=0$`
    : config.potential === 'gaussian' ? String.raw`$V(x)=V_0\,e^{-2x^2/a^2}$`
    : config.potential === 'well' ? String.raw`$V(x)=\begin{cases}-V_0&\lvert x\rvert<a/2\\0&\lvert x\rvert\ge a/2\end{cases}$`
    : String.raw`$V(x)=\begin{cases}V_0&\lvert x\rvert<a/2\\0&\lvert x\rvert\ge a/2\end{cases}$`;

  return (
    <section className="workspace" aria-labelledby="scattering-title">
      <aside className="control-panel scattering-controls">
        <div>
          <p className="eyebrow">02</p>
          <h1 id="scattering-title">Diffusion d’un paquet d’ondes</h1>
          <p className="lede">Suivez l’étalement d’un paquet libre, sa chute dans un champ gravitationnel ou sa diffusion par un potentiel.</p>
        </div>
        <div className="potential-choices" role="group" aria-label="Forme du potentiel">
          {SCATTERING_POTENTIALS.map(kind => (
            <Button key={kind} variant="outline" className={config.potential === kind ? 'is-selected' : ''}
              aria-pressed={config.potential === kind} onClick={() => update({ potential: kind })}>
              <PotentialIcon kind={kind} />{kind === 'free' ? 'Évolution libre' : kind === 'gravity' ? 'Pesanteur' : kind === 'barrier' ? 'Barrière' : kind === 'gaussian' ? 'Gaussien' : 'Puits'}
            </Button>
          ))}
        </div>
        <div className="equation-card">
          <span>Potentiel</span><Formula display>{potentialFormula}</Formula>
        </div>
        <div className="control-stack">
          {!uniform ? <><Parameter id="scattering-height" label={config.potential === 'well' ? 'Profondeur' : 'Hauteur'} symbol={String.raw`$V_0$`}
            value={config.height} min={0} max={8} step={0.1} onChange={height => update({ height })} />
          <Parameter id="scattering-width" label="Largeur du potentiel" symbol="$a$"
            value={config.width} min={0.5} max={6} step={0.25} onChange={width => update({ width })} />
          </> : null}
          {gravity ? <>
            <Parameter id="scattering-gravity" label="Accélération gravitationnelle" symbol="$g$" value={g} min={0} max={GRAVITY_MAX} step={.01} onChange={gravity => update({ gravity })} />
            <p className="scale-note">Axe <Formula>{'$z$'}</Formula> vers le haut, sans sol ni paroi. <Formula>{'$g$'}</Formula> est exprimé en unités réduites ; <Formula>{'$g=0$'}</Formula> redonne l’évolution libre.</p>
          </> : null}
          <Parameter id="scattering-momentum" label="Nombre d’onde" symbol={String.raw`$k_0$`}
            value={config.momentum} min={SCATTERING_MOMENTUM_MIN} max={SCATTERING_MOMENTUM_MAX}
            step={SCATTERING_MOMENTUM_STEP} precision={5} onChange={momentum => update({ momentum })} />
          <Parameter id="scattering-sigma" label="Largeur initiale du paquet" symbol={gravity ? String.raw`$\sigma_z$` : String.raw`$\sigma_x$`}
            value={config.sigma} min={2} max={5} step={0.25} onChange={sigma => update({ sigma })} />
        </div>
        <dl className="measurements">
          <div><dt>Énergie moyenne</dt><dd><Formula>{`$\\langle E\\rangle=${energy.toFixed(2)}$`}</Formula></dd></div>
          <div><dt>Centre initial</dt><dd><Formula>{`$${coordinate}_i=-24$`}</Formula></dd></div>
          <div><dt>Unités réduites</dt><dd><Formula>{String.raw`$\hbar=m=1$`}</Formula></dd></div>
        </dl>
      </aside>

      <div className="figure-panel">
        <div className="figure-heading">
          <div><p className="eyebrow">{gravity ? 'Paquet dans un champ gravitationnel' : uniform ? 'Évolution libre' : 'Réflexion & transmission'}</p><h2><Formula>{uniform ? `$s\\,|\\psi(${coordinate},t)|^2$` : String.raw`$s\,|\psi(x,t)|^2\quad\text{et}\quad V(x)$`}</Formula></h2></div>
          <div className="plot-legend" aria-label="Légende">
            <span><i className="legend-swatch accent" aria-hidden="true" />densité de probabilité</span>
            {!gravity ? <span><i className="legend-swatch ink" aria-hidden="true" />potentiel</span> : null}
            <span><i className="legend-swatch teal dashed" aria-hidden="true" /><Formula>{uniform ? `$\\langle ${coordinate}\\rangle$` : String.raw`$\langle E\rangle$`}</Formula></span>
          </div>
        </div>
        <div className="scattering-toolbar">
          <div className="scattering-presets" role="group" aria-label="Expériences de diffusion">
            {Object.entries(ALL_SCATTERING_PRESETS).map(([name, preset]) => (
              <Button key={name} variant="outline" className={key === scatteringConfigKey(preset) ? 'is-selected' : ''}
                aria-pressed={key === scatteringConfigKey(preset)} onClick={() => update(preset)}>
                {name === 'free' ? 'Paquet libre' : name === 'gravity' ? 'Montée et chute' : name === 'tunnel' ? 'Effet tunnel' : name === 'transmission' ? 'Transmission' : 'Réflexion'}
              </Button>
            ))}
          </div>
          <span className={`simulation-status${timeline ? '' : ' is-computing'}`} role="status">{stateLabel}</span>
        </div>
        {error ? <p role="alert">Le calcul n’a pas abouti. <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Réessayer</Button></p> : null}
        <div className="plot-shell">
          <ScientificPlot ariaLabel={`Diffusion du paquet au temps ${time.toFixed(2)} : densité de probabilité et potentiel ${config.potential}`}
            xDomain={[-64, 64]} yDomain={[yMin, yMax]} xTicks={[-60, -40, -20, 0, 20, 40, 60]}
            xLabel={`$${coordinate}$`} yLabel={uniform ? String.raw`$s\,|\psi|^2$` : String.raw`$s\,|\psi|^2,\;V$`}
            series={gravity ? [{ values: densityValues, tone: 'accent', fillTo: 0, fillOpacity: .3, width: 2.6 }] : [
              { values: potentialValues, tone: 'ink', fillTo: 0, fillOpacity: 0.16, width: 2 },
              { values: densityValues, tone: 'accent', fillTo: 0, fillOpacity: 0.3, width: 2.6 },
            ]}
            horizontalLines={uniform ? [] : [{ value: energy, label: String.raw`$\langle E\rangle$`, tone: 'teal' }]}
            verticalLines={uniform ? [{ value: moments.position, tone: 'teal', dashed: true }] : []}
          />
        </div>
        {gravity ? <section className="scattering-gravity-potential" aria-label="Potentiel gravitationnel et énergie moyenne">
          <div className="plot-legend">
            <span><i className="legend-swatch ink" /><Formula>{'$V(z)=mgz$'}</Formula></span>
            <span><i className="legend-swatch teal dashed" /><Formula>{`$\\langle E\\rangle=${energy.toFixed(3)}$`}</Formula></span>
          </div>
          <div className="plot-shell"><ScientificPlot ariaLabel="Potentiel gravitationnel linéaire et énergie totale moyenne conservée"
            xDomain={[-64, 64]} yDomain={[Math.min(-64 * g, energy, 0) - .5, Math.max(64 * g, energy, 0) + .5]}
            xTicks={[-60, -40, -20, 0, 20, 40, 60]} xLabel="$z$" yLabel="$E,\;V$"
            series={[{ values: potentialValues, tone: 'ink', width: 2, fillTo: 0, fillOpacity: .12 }]}
            horizontalLines={[{ value: energy, label: String.raw`$\langle E\rangle$`, tone: 'teal', labelOutside: true }]}
            verticalLines={[{ value: moments.position, tone: 'teal', dashed: true }]} />
          </div>
        </section> : null}
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
            <div className="range-labels"><span>État initial</span><span>Temps final : {duration}{automatic ? ' · auto' : ''}</span></div>
          </div>
          <DisplayControls id="scattering" scale={scale} onScaleChange={setScale} playbackSpeed={playbackSpeed} onSpeedChange={setPlaybackSpeed}
            finalTime={duration} onFinalTimeChange={updateFinalTime} finalMin={SCATTERING_FINAL_TIME_MIN} finalMax={maxFinalTime} finalStep={1}
            finalDescription={`De ${SCATTERING_FINAL_TIME_MIN} à ${maxFinalTime}. Ajusté automatiquement après un changement de paramètres physiques ; une saisie passe en réglage manuel.`} />
          <p className="scale-note playback-note">
            {automatic ? uniform ? 'Durée automatique de propagation.' : !timeline ? 'Recherche d’un temps final après la diffusion…'
              : timeline.scatteringComplete ? 'Temps final automatique : paquets séparés et probabilités stabilisées.'
                : 'Limite de calcul atteinte : la séparation des paquets n’est pas encore complète.'
              : <>Temps final manuel. <Button variant="link" className="restore-auto-time" onClick={restoreAutomaticTime}>Rétablir le réglage automatique</Button></>}
          </p>
        </div>
        {uniform ? <>
          <dl className="probability-cards">
            <div className="probability-card"><dt>Position moyenne</dt><dd>{moments.position.toFixed(2)}</dd><small><Formula>{`$\\langle ${coordinate}\\rangle$`}</Formula></small></div>
            <div className="probability-card is-center"><dt>Impulsion moyenne</dt><dd>{moments.momentum.toFixed(2)}</dd><small><Formula>{gravity ? '$\\langle p_z\\rangle$' : '$\\langle p\\rangle$'}</Formula></small></div>
            <div className="probability-card is-right"><dt>Largeur du paquet</dt><dd>{moments.sigma.toFixed(2)}</dd><small><Formula>{`$\\Delta ${coordinate}(t)$`}</Formula></small></div>
          </dl>
          <p className="probability-note">{gravity ? 'Le potentiel agit partout : il n’y a pas de zone de collision ni de fractions réfléchie et transmise.' : 'Sans obstacle, le paquet se déplace et s’étale. Les valeurs ci-dessus décrivent son état à l’instant affiché.'} Pour un temps final élevé, le paquet peut sortir du cadre ; le calcul continue sur l’axe entier.</p>
        </> : <><dl className="probability-cards">
          <div className="probability-card"><dt>À gauche</dt><dd>{pct(frame.left)}</dd><small><Formula>{String.raw`$x<-b$`}</Formula></small></div>
          <div className="probability-card is-center"><dt>Dans la zone</dt><dd>{pct(frame.center)}</dd><small><Formula>{String.raw`$|x|\le b$`}</Formula></small></div>
          <div className="probability-card is-right"><dt>À droite</dt><dd>{pct(frame.right)}</dd><small><Formula>{String.raw`$x>b$`}</Formula></small></div>
        </dl>
        <p className="probability-note">Probabilités instantanées, avec <Formula>{boundaryFormula}</Formula>. Après séparation des paquets, gauche et droite donnent les fractions réfléchie et transmise.
          <span className="probability-bar" aria-hidden="true"><span style={{ width: `${frame.left * 100}%` }} /><span style={{ width: `${frame.center * 100}%` }} /><span style={{ width: `${frame.right * 100}%` }} /></span>
        </p></>}
        <div className="insight-row">
          <span className="insight-index"><Formula>{String.raw`$\psi$`}</Formula></span>
          <p>{gravity && g > 0 ? <>Le paquet est lancé vers les <Formula>{'$z$'}</Formula> croissants. La pesanteur le ralentit puis le fait redescendre, tout en conservant son énergie totale.</>
            : uniform || config.height === 0 ? 'Sans potentiel, le paquet avance et s’étale librement.'
            : config.potential === 'well' ? 'Même un puits attractif peut réfléchir une partie du paquet : la réflexion est un phénomène ondulatoire.'
            : energy < config.height ? <>L’énergie moyenne est inférieure au sommet du potentiel. Une partie du paquet peut néanmoins traverser ; son spectre d’énergies intervient aussi dans la transmission.</>
            : 'Au-dessus du potentiel, la transmission domine généralement, mais une réflexion reste possible.'}
            {!uniform && time > collisionTime && frame.center > .03 ? ' L’interaction est encore en cours.' : ''}</p>
        </div>
        <details className="scattering-components" onToggle={event => setComponentsOpen(event.currentTarget.open)}>
          <summary>Parties réelle et imaginaire de <Formula>{String.raw`$\psi$`}</Formula></summary>
          {componentsOpen ? <>
            <div className="plot-legend"><span><i className="legend-swatch accent" /><Formula>{String.raw`$\operatorname{Re}\psi$`}</Formula></span><span><i className="legend-swatch teal" /><Formula>{String.raw`$\operatorname{Im}\psi$`}</Formula></span></div>
            <div className="plot-shell"><ScientificPlot ariaLabel="Parties réelle et imaginaire du paquet d’ondes"
              xDomain={[-64, 64]} yDomain={[-(timeline?.maxAmplitude ?? .6) * 1.1, (timeline?.maxAmplitude ?? .6) * 1.1]}
              xTicks={[-60, -40, -20, 0, 20, 40, 60]} xLabel={`$${coordinate}$`} yLabel={`$\\psi(${coordinate},t)$`}
              series={[{ values: Array.from(SAMPLE_X, (x, i) => ({ x, y: frame.re[i] })), tone: 'accent', width: 1.6 }, { values: Array.from(SAMPLE_X, (x, i) => ({ x, y: frame.im[i] })), tone: 'teal', width: 1.6 }]}
              bands={uniform ? [] : [{ from: -edge, to: edge, tone: 'ink', opacity: .08 }]} />
            </div>
          </> : null}
        </details>
        <details className="theory-notes">
          <summary>Repères théoriques</summary>
          <div className="theory-grid">
            <div><span>Équation de Schrödinger</span><Formula display>{gravity ? String.raw`$i\hbar\frac{\partial\psi}{\partial t}=\left[-\frac{\hbar^2}{2m}\frac{\partial^2}{\partial z^2}+mgz\right]\psi$` : String.raw`$i\hbar\frac{\partial\psi}{\partial t}=\left[-\frac{\hbar^2}{2m}\frac{\partial^2}{\partial x^2}+V(x)\right]\psi$`}</Formula></div>
            <div><span>Paquet gaussien initial</span><Formula display>{`$\\psi(${coordinate},0)=\\frac{e^{-\\frac{(${coordinate}-${coordinate}_i)^2}{4\\sigma_${coordinate}^2}}e^{ik_0${coordinate}}}{(2\\pi\\sigma_${coordinate}^2)^{1/4}}$`}</Formula></div>
            <div><span>Énergie moyenne initiale</span><Formula display>{gravity ? String.raw`$\langle E\rangle=\frac{\hbar^2 k_0^2}{2m}+\frac{\hbar^2}{8m\sigma_z^2}+mgz_i$` : String.raw`$\langle E\rangle=\frac{\hbar^2 k_0^2}{2m}+\frac{\hbar^2}{8m\sigma_x^2}+\langle V\rangle_0$`}</Formula></div>
            {uniform ? <div><span>Centre et dispersion</span><Formula display>{gravity ? String.raw`$\begin{aligned}\langle z\rangle&=z_i+\frac{\hbar k_0}{m}t-\frac12gt^2,\\\langle p_z\rangle&=\hbar k_0-mgt,\\\Delta z(t)&=\sqrt{\sigma_z^2+\frac{\hbar^2t^2}{4m^2\sigma_z^2}}.\end{aligned}$` : String.raw`$\begin{aligned}\langle x\rangle&=x_i+\frac{\hbar k_0}{m}t,\\\langle p\rangle&=\hbar k_0,\\\Delta x(t)&=\sqrt{\sigma_x^2+\frac{\hbar^2t^2}{4m^2\sigma_x^2}}.\end{aligned}$`}</Formula></div> : null}
          </div>
          <p>Le paquet est normalisé : <Formula>{`$\\int|\\psi(${coordinate},t)|^2\\,d${coordinate}=1$`}</Formula>. Le facteur <Formula>$s$</Formula> agit uniquement sur la hauteur affichée de la densité. Le cadre peut couper les queues du paquet sans les supprimer du calcul.{!uniform ? <> Les probabilités sont intégrées sur tout le domaine de calcul. Pour le potentiel gaussien, <Formula>{String.raw`$a=2\sigma_V$`}</Formula> et la zone centrale couvre trois écarts types de part et d’autre.</> : null}</p>
          {uniform ? <p>Solution gaussienne exacte sur l’axe entier, évaluée à chaque instant, sans bord périodique ni réflexion artificielle.{gravity ? <> Le zéro du potentiel est fixé à <Formula>{'$z=0$'}</Formula> ; une énergie totale négative est donc possible.</> : null}</p>
            : <p>Évolution par séparation symétrique des opérateurs cinétique et potentiel, sur une grille de 4 096 points. Le réglage automatique attend moins de 0.5 % de probabilité dans la zone centrale et une variation inférieure à 0.1 point de pourcentage des fractions gauche/droite sur plusieurs temps de passage du paquet. Le temps final est limité à {maxFinalTime} pour ces paramètres afin de limiter les effets des bords périodiques, éloignés de la région de collision. Si la séparation reste incomplète à cette limite, elle est signalée.</p>}
        </details>
      </div>
    </section>
  );
}
