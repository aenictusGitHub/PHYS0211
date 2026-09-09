'use client';

import { useEffect, useMemo, useState } from 'react';
import { PlaybackControls, DisplayControls } from '@/components/playback-controls';
import { useLabPlayback } from '@/components/use-lab-playback';

import { type ExperimentCommand } from '@/components/lab-types';
import { Math as Formula } from '@/components/math';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { QuantumParameter } from '@/components/quantum-parameter';
import { CoherentStateEditor } from '@/components/coherent-state-editor';
import {
  ANHARMONIC_LIMIT, coherentSuperposition, oscillatorBasis,
  solveAnharmonicOscillator, projectOscillatorState, evolveAnharmonicState,
  oscillatorMeanPosition, type CoherentPacket,
} from '@/lib/anharmonic-oscillator';
import { eigenstateDomain, energyGuides } from '@/lib/energy-display';
import { clipEnergyGuides } from '@/lib/plot-geometry';
import {
  TAU_MAX,
  oscillatorCoefficients,
  sliderValue,
  type OscillatorPreset,
} from '@/lib/quantum';

type OscillatorMode = 'stationary' | 'evolution';
type StateDisplay = 'wave' | 'density';
type InitialPreset = OscillatorPreset | 'custom-coherent';

const PRESETS: Array<{
  value: InitialPreset;
  label: string;
  short: string;
}> = [
  { value: 'mixture', label: 'Mélange des modes 0, 1 et 2', short: '0 · 1 · 2' },
  { value: 'coherent', label: 'État cohérent', short: 'Cohérent' },
  { value: 'opposite', label: 'Deux états cohérents opposés', short: 'Chat opposé' },
  { value: 'quadrature', label: 'Deux états cohérents en quadrature', short: 'Quadrature' },
  { value: 'custom-coherent', label: 'Composer une superposition d’états cohérents', short: 'Composer…' },
];

const OSCILLATOR_COORDINATES = Array.from({ length: 601 }, (_, index) => -6 + index / 50);
const INITIAL_PACKETS: CoherentPacket[] = [
  { re: 2, im: 0, amplitude: 1, phase: 0 },
  { re: -2, im: 0, amplitude: 1, phase: 0 },
];

function probabilityFromBasis(
  basis: number[],
  evolved: Array<{ re: number; im: number }>,
) {
  let re = 0;
  let im = 0;
  basis.forEach((phi, index) => {
    re += evolved[index].re * phi;
    im += evolved[index].im * phi;
  });
  return re * re + im * im;
}

function presetFormula(preset: InitialPreset) {
  if (preset === 'custom-coherent') return String.raw`$|\psi(0)\rangle=\mathcal N\sum_{j=1}^{M} A_j e^{i\theta_j}|\alpha_j\rangle$`;
  if (preset === 'mixture') {
    return String.raw`$|\psi(0)\rangle=\frac{|0\rangle+2|1\rangle+2|2\rangle}{3}$`;
  }
  if (preset === 'coherent') return String.raw`$|\alpha\rangle=e^{-|\alpha|^2/2}\sum_{n=0}^{\infty}\frac{\alpha^n}{\sqrt{n!}}|n\rangle$`;
  if (preset === 'opposite') return String.raw`$|\psi(0)\rangle\propto|2i\rangle+2|-2i\rangle$`;
  return String.raw`$|\psi(0)\rangle\propto|2i\rangle+2|2\rangle$`;
}

function presetInsight(preset: InitialPreset) {
  if (preset === 'custom-coherent') return 'Les états cohérents interfèrent : leurs amplitudes complexes s’additionnent avant le calcul de la densité de probabilité.';
  if (preset === 'mixture') {
    return 'Trois phases propres se combinent : le profil change, puis se reforme après une période.';
  }
  if (preset === 'coherent') {
    return 'Le paquet gaussien conserve sa forme et suit exactement la trajectoire classique.';
  }
  if (preset === 'opposite') {
    return 'Deux paquets opposés se rencontrent et font apparaître une structure d’interférence.';
  }
  return 'Deux paquets déphasés d’un quart de tour parcourent l’espace de phase en quadrature.';
}

export function HarmonicLab({
  active,
  command,
}: {
  active: boolean;
  command: ExperimentCommand | null;
}) {
  const [mode, setMode] = useState<OscillatorMode>('stationary');
  const [n, setN] = useState(0);
  const [display, setDisplay] = useState<StateDisplay>('wave');
  const [stationaryScale, setStationaryScale] = useState(1);
  const [preset, setPreset] = useState<InitialPreset>('mixture');
  const [packets, setPackets] = useState<CoherentPacket[]>(INITIAL_PACKETS);
  const [anharmonicEnabled, setAnharmonicEnabled] = useState(false);
  const [anharmonicStrength, setAnharmonicStrength] = useState(.02);
  const strength = anharmonicEnabled ? anharmonicStrength : 0;
  const [alphaMagnitude, setAlphaMagnitude] = useState(2);
  const [alphaPhase, setAlphaPhase] = useState(Math.PI / 2);
  const [time, setTime] = useState(0);
  const [psiScale, setPsiScale] = useState(2);
  const [playing, setPlaying] = useState(false);
  const clock = useLabPlayback({ active, enabled: mode === 'evolution', time, setTime, playing, setPlaying, defaultFinalTime: TAU_MAX, rate: 1, command: command?.lab === 'oscillator' ? command : null });

  useEffect(() => {
    if (!command || command.lab !== 'oscillator') return;
    if (command.mode) setMode(command.mode);
    if (command.quantumNumber !== undefined) setN(command.quantumNumber);
    if (
      command.preset === 'mixture' ||
      command.preset === 'coherent' ||
      command.preset === 'opposite' ||
      command.preset === 'quadrature' ||
      command.preset === 'custom-coherent'
    ) {
      setPreset(command.preset);
      setPsiScale(
        command.preset === 'coherent'
          ? 5
          : command.preset === 'mixture'
            ? 2
            : 1.5,
      );
    }
    if (command.time !== undefined) setTime(command.time);
    if (command.scale !== undefined) {
      if (command.mode === 'stationary') {
        setStationaryScale(command.scale);
      } else if (command.mode === 'evolution') {
        setPsiScale(command.scale);
      } else {
        setStationaryScale(command.scale);
        setPsiScale(command.scale);
      }
    }
    setPlaying(false);
  }, [command]);


  const alpha = useMemo(
    () => ({
      re: alphaMagnitude * Math.cos(alphaPhase),
      im: alphaMagnitude * Math.sin(alphaPhase),
    }),
    [alphaMagnitude, alphaPhase],
  );
  const coefficients = useMemo(
    () => preset === 'custom-coherent' ? coherentSuperposition(packets) : oscillatorCoefficients(preset, alpha),
    [alpha, preset, packets],
  );

  const spectrum = useMemo(() => solveAnharmonicOscillator(strength), [strength]);
  const grid = useMemo(() => OSCILLATOR_COORDINATES.map(x => ({ x, basis: oscillatorBasis(x, spectrum.states.length, spectrum.frequency) })), [spectrum]);
  const potential = useMemo(() => OSCILLATOR_COORDINATES.map(x => ({ x, y: x * x / 2 + strength * x ** 4 })), [strength]);
  const energies = useMemo(() => spectrum.energies.slice(0, 9), [spectrum]);
  const spatialStates = useMemo(() => spectrum.states.map(state => grid.map(point =>
    state.reduce((sum, c, j) => sum + c * point.basis[j], 0))), [spectrum, grid]);
  const stationaryStates = useMemo(() => spatialStates.slice(0, 9), [spatialStates]);

  const stationaryValues = useMemo(() => {
    const baseline = energies[n];
    return OSCILLATOR_COORDINATES.map((x, index) => {
      const phi = stationaryStates[n][index];
      return {
        x,
        y:
          baseline +
          stationaryScale * (display === 'wave' ? phi : phi * phi),
      };
    });
  }, [display, n, stationaryScale, energies, stationaryStates]);
  const projected = useMemo(() => projectOscillatorState(spectrum, coefficients), [spectrum, coefficients]);
  const evolvedCoefficients = useMemo(
    () => evolveAnharmonicState(spectrum, projected, time),
    [spectrum, projected, time],
  );
  const probabilityValues = useMemo(
    () =>
      grid.map((point) => ({
        x: point.x,
        density: probabilityFromBasis(point.basis, evolvedCoefficients),
      })),
    [evolvedCoefficients, grid],
  );

  const meanEnergy = useMemo(
    () => projected.reduce((sum, c) => sum + spectrum.energies[c.n] * (c.re ** 2 + c.im ** 2), 0),
    [projected, spectrum],
  );
  const evolutionValues = useMemo(
    () =>
      probabilityValues.map((point) => ({
        x: point.x,
        y: meanEnergy + psiScale * point.density,
      })),
    [meanEnergy, probabilityValues, psiScale],
  );
  const meanX = oscillatorMeanPosition(evolvedCoefficients, spectrum.frequency);
  const stationaryDomain = useMemo(() => eigenstateDomain(energies, stationaryStates, stationaryScale, 9), [energies, stationaryStates, stationaryScale]);
  // A time-independent upper envelope avoids clipping interference peaks or a moving vertical scale.
  const densityBound = useMemo(() => Math.max(...OSCILLATOR_COORDINATES.map((_, index) => {
    const envelope = spatialStates.reduce((sum, state, j) => sum + Math.hypot(projected[j].re, projected[j].im) * Math.abs(state[index]), 0);
    return envelope * envelope;
  })), [spatialStates, projected]);
  const evolutionMaximum = Math.max(13.4, meanEnergy + 1.08 * psiScale * densityBound);
  const restart = () => { setTime(0); setPlaying(false); };

  const selectPreset = (nextPreset: InitialPreset) => {
    setPreset(nextPreset);
    setPsiScale(
      nextPreset === 'coherent' ? 5 : nextPreset === 'mixture' ? 2 : 1.5,
    );
    setTime(0);
    setPlaying(false);
    if (nextPreset === 'coherent') {
      setAlphaMagnitude(2);
      setAlphaPhase(Math.PI / 2);
    }
  };

  return (
    <section className="workspace oscillator-workspace" aria-labelledby="oscillator-title">
      <aside className="control-panel">
        <div>
          <p className="eyebrow">03</p>
          <h1 id="oscillator-title">Oscillateur harmonique</h1>
          <p className="lede">
            Explorez les modes d’Hermite, l’échelle régulière des énergies et
            le mouvement quasi classique des états cohérents.
          </p>
        </div>

        <div className="mode-switch" role="group" aria-label="Type d’exploration">
          <Button
            variant="ghost"
            className={mode === 'stationary' ? 'is-selected' : ''}
            onClick={() => {
              setMode('stationary');
              setPlaying(false);
            }}
            aria-pressed={mode === 'stationary'}
          >
            États propres
          </Button>
          <Button
            variant="ghost"
            className={mode === 'evolution' ? 'is-selected' : ''}
            onClick={() => setMode('evolution')}
            aria-pressed={mode === 'evolution'}
          >
            Évolution
          </Button>
        </div>

        <section className="well-perturbation" aria-labelledby="oscillator-anharmonic-title">
          <div className="well-perturbation-heading">
            <label id="oscillator-anharmonic-title" htmlFor="oscillator-anharmonic-enabled">Perturbation anharmonique</label>
            <Switch id="oscillator-anharmonic-enabled" checked={anharmonicEnabled}
              onCheckedChange={enabled => { setAnharmonicEnabled(enabled); restart(); }} aria-describedby="oscillator-anharmonic-help" />
          </div>
          <p id="oscillator-anharmonic-help" className="scale-note">Ajoute un terme quartique positif au potentiel.</p>
          {anharmonicEnabled ? <div className="control-stack">
            <div className="perturbation-equations">
              <Formula display>{String.raw`$\frac{V(\xi)}{\hbar\omega}=\frac{\xi^2}{2}+\lambda\xi^4$`}</Formula>
            </div>
            <QuantumParameter id="oscillator-lambda" label="Intensité" symbol={String.raw`$\lambda$`} value={anharmonicStrength}
              min={0} max={ANHARMONIC_LIMIT} step={.01} onChange={value => { setAnharmonicStrength(value); restart(); }} />
          </div> : null}
        </section>

        <div className="equation-card">
          <span>{mode === 'stationary' ? 'Fonction propre' : 'État initial'}</span>
          <Formula display>
            {mode === 'stationary'
              ? strength > 0
                ? String.raw`$\hat H\phi_n=E_n\phi_n$`
                : String.raw`$\phi_n(\xi)=\frac{e^{-\xi^2/2}H_n(\xi)}{\pi^{1/4}\sqrt{2^n n!}}$`
              : presetFormula(preset)}
          </Formula>
        </div>

        {mode === 'stationary' ? (
          <div className="control-stack">
            <div className="control-block">
              <div className="control-heading">
                <label htmlFor="oscillator-n">Nombre quantique <Formula>{String.raw`$n$`}</Formula></label>
                <output>{n}</output>
              </div>
              <Slider
                id="oscillator-n"
                min={0}
                max={8}
                step={1}
                value={[n]}
                onValueChange={(value) => setN(sliderValue(value, 0))}
                aria-label="Nombre quantique n"
              />
              <div className="range-labels" aria-hidden="true"><span>0</span><span>8</span></div>
            </div>

            <div className="display-switch" role="group" aria-label="Grandeur représentée">
              <Button variant="outline" className={display === 'wave' ? 'is-selected' : ''} onClick={() => setDisplay('wave')} aria-pressed={display === 'wave'}>
                <Formula>{String.raw`$\phi_n(\xi)$`}</Formula>
              </Button>
              <Button variant="outline" className={display === 'density' ? 'is-selected' : ''} onClick={() => setDisplay('density')} aria-pressed={display === 'density'}>
                <Formula>{String.raw`$|\phi_n(\xi)|^2$`}</Formula>
              </Button>
            </div>


          </div>
        ) : (
          <div className="control-stack">
            <div className="preset-grid preset-grid-four" role="group" aria-label="État initial">
              {PRESETS.map((entry) => (
                <Button
                  key={entry.value}
                  variant="outline"
                  className={preset === entry.value ? 'is-selected' : ''}
                  onClick={() => selectPreset(entry.value)}
                  aria-pressed={preset === entry.value}
                  title={entry.label}
                >
                  {entry.short}
                </Button>
              ))}
            </div>

            {preset === 'coherent' ? (
              <div className="compact-controls">
                <div className="control-block">
                  <div className="control-heading">
                    <label htmlFor="alpha-magnitude">Module <Formula>{String.raw`$|\alpha|$`}</Formula></label>
                    <output>{alphaMagnitude.toFixed(1)}</output>
                  </div>
                  <Slider
                    id="alpha-magnitude"
                    min={0}
                    max={2.5}
                    step={0.1}
                    value={[alphaMagnitude]}
                    onValueChange={(value) => { setAlphaMagnitude(sliderValue(value, 2)); restart(); }}
                    aria-label="Module de alpha"
                  />
                </div>
                <div className="control-block">
                  <div className="control-heading">
                    <label htmlFor="alpha-phase">Phase <Formula>{String.raw`$\arg(\alpha)$`}</Formula></label>
                    <output><Formula>{`$${(alphaPhase / Math.PI).toFixed(1)}\\pi$`}</Formula></output>
                  </div>
                  <Slider
                    id="alpha-phase"
                    min={-Math.PI}
                    max={Math.PI}
                    step={0.05}
                    value={[alphaPhase]}
                    onValueChange={(value) => { setAlphaPhase(sliderValue(value, Math.PI / 2)); restart(); }}
                    aria-label="Phase de alpha"
                  />
                </div>
              </div>
            ) : null}


          </div>
        )}

        <dl className="measurements">
          {mode === 'stationary' ? (
            <>
              <div><dt>Énergie</dt><dd><Formula>{String.raw`$${energies[n].toFixed(3)}\,\hbar\omega$`}</Formula></dd></div>
              <div><dt>Parité</dt><dd>{n % 2 === 0 ? 'paire' : 'impaire'}</dd></div>
              <div><dt>Nœuds</dt><dd>{n}</dd></div>
            </>
          ) : (
            <>
              <div><dt>Énergie moyenne</dt><dd><Formula>{String.raw`$${meanEnergy.toFixed(2)}\,\hbar\omega$`}</Formula></dd></div>
              <div><dt>Position moyenne</dt><dd><Formula>{String.raw`$${meanX.toFixed(2)}\,x_0$`}</Formula></dd></div>
              <div><dt>Facteur <Formula>{String.raw`$s$`}</Formula></dt><dd><Formula>{`$s=${psiScale.toFixed(1)}$`}</Formula></dd></div>
            </>
          )}
        </dl>
      </aside>

      <div className="figure-panel">
        <div className="figure-heading">
          <div>
            <p className="eyebrow">{mode === 'stationary' ? 'Diagramme d’énergie' : 'Évolution temporelle'}</p>
            <h2>
              <Formula>
                {mode === 'stationary'
                  ? display === 'wave'
                    ? String.raw`$s\,\phi_${n}(\xi)+\frac{E_${n}}{\hbar\omega}$`
                    : String.raw`$s\,|\phi_${n}(\xi)|^2+\frac{E_${n}}{\hbar\omega}$`
                  : String.raw`$s\,|\psi(\xi,\tau)|^2+\frac{\langle E\rangle}{\hbar\omega}$`}
              </Formula>
            </h2>
          </div>
          <div className="plot-legend" aria-label="Légende">
            <span><i className="legend-swatch accent" aria-hidden="true" />{mode === 'stationary' && display === 'wave' ? 'fonction propre' : 'densité de probabilité'}</span>
            <span><i className="legend-swatch ink" aria-hidden="true" />potentiel</span>
          </div>
        </div>

        {mode === 'evolution' && preset === 'custom-coherent' ? <CoherentStateEditor initial={packets} onApply={next => { setPackets(next); restart(); }} /> : null}

        <div className="plot-shell">
          {mode === 'stationary' ? (
            <ScientificPlot
              ariaLabel={`Oscillateur harmonique, état n égal à ${n}, ${display === 'wave' ? 'fonction propre' : 'densité de probabilité'}`}
              xDomain={[-5, 5]}
              yDomain={stationaryDomain}
              xTicks={[-4, -2, 0, 2, 4]}
              xLabel={String.raw`$\xi=x/x_0$`}
              yLabel={
                display === 'wave'
                  ? String.raw`$\frac{E}{\hbar\omega}+s\,\phi_n(\xi)$`
                  : String.raw`$\frac{E}{\hbar\omega}+s\,|\phi_n(\xi)|^2$`
              }
              series={[
                { values: potential, tone: 'ink', width: 2, fillTo: 0, fillOpacity: 0.1 },
                { values: stationaryValues, tone: 'accent', width: 2.8, fillTo: energies[n], fillOpacity: 0.24 },
              ]}
              horizontalLines={clipEnergyGuides(energyGuides(energies, n), potential)}
            />
          ) : (
            <ScientificPlot
              ariaLabel={`Densité de probabilité de l’oscillateur harmonique au temps réduit ${time.toFixed(2)}, facteur s égal à ${psiScale.toFixed(1)}`}
              xDomain={[-6, 6]}
              yDomain={[0, evolutionMaximum]}
              xTicks={[-4, -2, 0, 2, 4]}
              xLabel={String.raw`$\xi=x/x_0$`}
              yLabel={String.raw`$\frac{E}{\hbar\omega}+s\,|\psi(\xi,\tau)|^2$`}
              series={[
                { values: potential, tone: 'ink', width: 2, fillTo: 0, fillOpacity: 0.1 },
                { values: evolutionValues, tone: 'accent', width: 2.8, fillTo: meanEnergy, fillOpacity: 0.3 },
              ]}
              horizontalLines={[{ value: meanEnergy, label: String.raw`$\langle E\rangle$`, tone: 'teal', dashed: true, labelOutside: true }]}
            />
          )}
        </div>

        {mode === 'evolution' ? <PlaybackControls id="oscillator" clock={clock} scale={psiScale} onScaleChange={setPsiScale}
          timeSymbol={String.raw`$\tau=\omega t$`} finalSymbol={String.raw`$\tau_f$`} />
          : <DisplayControls id="oscillator-stationary" stationary scale={stationaryScale} onScaleChange={setStationaryScale} />}
        {mode === 'stationary' ? <p className="scale-note">Échelle commune aux états <Formula>{'$n=0,\\ldots,8$'}</Formula> à potentiel et facteur <Formula>{'$s$'}</Formula> fixés. Tous les niveaux sont indiqués en pointillés ; le niveau sélectionné est en vert.</p> : null}
        <div className="insight-row">
          <span className="insight-index">{mode === 'stationary' ? String(n).padStart(2, '0') : 'τ'}</span>
          <p>
            {mode === 'stationary'
              ? n === 0
                ? <>Même dans l’état fondamental, l’énergie ne peut pas être nulle : <Formula>{String.raw`$E_0=${energies[0].toFixed(3)}\,\hbar\omega$`}</Formula>.</>
                : <>L’état <Formula>{String.raw`$n=${n}$`}</Formula> possède {n} nœud{n > 1 ? 's' : ''} et une parité {n % 2 === 0 ? 'paire' : 'impaire'}.</>
              : strength > 0 ? 'L’anharmonicité modifie les phases relatives : même un état initial cohérent peut se déformer au cours du temps.' : presetInsight(preset)}
          </p>
          <span className="insight-formula"><Formula>{strength > 0 ? String.raw`$\lambda=${strength.toFixed(2)}$` : String.raw`$E_n=\hbar\omega(n+1/2)$`}</Formula></span>
        </div>

        <details className="theory-notes">
          <summary>Repères théoriques</summary>
          <div className="theory-grid">
            <div>
              <span>Hamiltonien</span>
              <Formula display>{String.raw`$\frac{\hat H}{\hbar\omega}=-\frac12\frac{\mathrm d^2}{\mathrm d\xi^2}+\frac{\xi^2}{2}+\lambda\xi^4$`}</Formula>
            </div>
            <div>
              <span>Base harmonique non perturbée</span>
              <Formula display>{String.raw`$\begin{aligned}H_0(\xi)&=1,\qquad H_1(\xi)=2\xi,\\ H_{n+1}(\xi)&=2\xi H_n(\xi)\\ &\quad-2nH_{n-1}(\xi).\end{aligned}$`}</Formula>
            </div>
            <div>
              <span>État cohérent</span>
              <Formula display>{String.raw`$\begin{aligned}\hat a|\alpha\rangle&=\alpha|\alpha\rangle,\\ |\alpha\rangle&=e^{-|\alpha|^2/2}\sum_{n=0}^{\infty}\frac{\alpha^n}{\sqrt{n!}}\,|n\rangle.\end{aligned}$`}</Formula>
            </div>
            <div>
              <span>Superposition cohérente normalisée</span>
              <Formula display>{String.raw`$\begin{aligned}|\psi(0)\rangle&=\mathcal N\sum_{j=1}^{M}w_j|\alpha_j\rangle,\\ w_j&=A_j e^{i\theta_j},\\ \mathcal N^{-2}&=\sum_{j,k}w_j^*w_k\langle\alpha_j|\alpha_k\rangle,\\ \langle\alpha|\beta\rangle&=e^{-(|\alpha|^2+|\beta|^2)/2+\alpha^*\beta}.\end{aligned}$`}</Formula>
            </div>
          </div>
          <p>
            On pose <Formula>{String.raw`$x_0=\sqrt{\hbar/(m\omega)}$`}</Formula>, <Formula>{String.raw`$\xi=x/x_0$`}</Formula> et <Formula>{String.raw`$\tau=\omega t$`}</Formula>. Chaque état propre acquiert la phase <Formula>{String.raw`$e^{-iE_n\tau/(\hbar\omega)}$`}</Formula>. Pour <Formula>{String.raw`$\lambda=0$`}</Formula>, <Formula>{String.raw`$E_n=\hbar\omega(n+\tfrac12)$`}</Formula>. Le décalage vertical des courbes par leur énergie est uniquement graphique.
          </p>
          <p>Avec la perturbation, le Hamiltonien est diagonalisé dans une base de {spectrum.states.length} fonctions d’Hermite dont la largeur s’adapte au potentiel. Ce réglage numérique ne change ni les unités ni les états cohérents initiaux de l’oscillateur non perturbé ; ces derniers sont projetés sur les états propres du potentiel choisi pour calculer leur évolution.</p>
        </details>
      </div>
    </section>
  );
}
