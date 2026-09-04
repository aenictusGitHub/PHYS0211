'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

import { type ExperimentCommand } from '@/components/lab-types';
import { Math as Formula } from '@/components/math';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  TAU_MAX,
  clamp,
  expectationEnergy,
  harmonicEigenfunction,
  numericalExpectationX,
  oscillatorCoefficients,
  sliderValue,
  type Coefficient,
  type OscillatorPreset,
} from '@/lib/quantum';

type OscillatorMode = 'stationary' | 'evolution';
type StateDisplay = 'wave' | 'density';

const PRESETS: Array<{
  value: OscillatorPreset;
  label: string;
  short: string;
}> = [
  { value: 'mixture', label: 'Mélange des modes 0, 1 et 2', short: '0 · 1 · 2' },
  { value: 'coherent', label: 'État cohérent', short: 'Cohérent' },
  { value: 'opposite', label: 'Deux états cohérents opposés', short: 'Chat opposé' },
  { value: 'quadrature', label: 'Deux états cohérents en quadrature', short: 'Quadrature' },
];

const POTENTIAL_STATIONARY = Array.from({ length: 401 }, (_, index) => {
  const x = -4 + (8 * index) / 400;
  return { x, y: (x * x) / 2 };
});

const POTENTIAL_EVOLUTION = Array.from({ length: 401 }, (_, index) => {
  const x = -5 + (10 * index) / 400;
  return { x, y: (x * x) / 2 };
});

function evolveOscillatorCoefficients(
  coefficients: Coefficient[],
  time: number,
) {
  return coefficients.map((coefficient) => {
    const angle = (coefficient.n + 0.5) * time;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return {
      re: coefficient.re * cosine + coefficient.im * sine,
      im: coefficient.im * cosine - coefficient.re * sine,
    };
  });
}

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

function presetFormula(preset: OscillatorPreset) {
  if (preset === 'mixture') {
    return String.raw`$|\psi(0)\rangle=\frac{|0\rangle+2|1\rangle+2|2\rangle}{3}$`;
  }
  if (preset === 'coherent') return String.raw`$|\alpha\rangle=e^{-|\alpha|^2/2}\sum_{n=0}^{\infty}\frac{\alpha^n}{\sqrt{n!}}|n\rangle$`;
  if (preset === 'opposite') return String.raw`$|\psi(0)\rangle\propto|2i\rangle+2|-2i\rangle$`;
  return String.raw`$|\psi(0)\rangle\propto|2i\rangle+2|2\rangle$`;
}

function presetInsight(preset: OscillatorPreset) {
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
  const [preset, setPreset] = useState<OscillatorPreset>('mixture');
  const [alphaMagnitude, setAlphaMagnitude] = useState(2);
  const [alphaPhase, setAlphaPhase] = useState(Math.PI / 2);
  const [time, setTime] = useState(0);
  const [psiScale, setPsiScale] = useState(2);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!command || command.lab !== 'oscillator') return;
    if (command.mode) setMode(command.mode);
    if (command.quantumNumber !== undefined) setN(command.quantumNumber);
    if (
      command.preset === 'mixture' ||
      command.preset === 'coherent' ||
      command.preset === 'opposite' ||
      command.preset === 'quadrature'
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
    if (command.scale !== undefined) setPsiScale(command.scale);
    setPlaying(false);
  }, [command]);

  useEffect(() => {
    if (!active || !playing) return;
    let animationFrame = 0;
    let previousTime: number | null = null;
    let accumulatedMilliseconds = 0;
    const frameDuration = 1000 / 60;
    const animate = (timestamp: number) => {
      if (previousTime !== null) {
        accumulatedMilliseconds += Math.min(timestamp - previousTime, 100);
        const elapsedFrames = Math.floor(accumulatedMilliseconds / frameDuration);
        if (elapsedFrames > 0) {
          accumulatedMilliseconds -= elapsedFrames * frameDuration;
          const elapsed = (elapsedFrames * frameDuration) / 1000;
          setTime((current) => (current + elapsed) % TAU_MAX);
        }
      }
      previousTime = timestamp;
      animationFrame = window.requestAnimationFrame(animate);
    };
    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [active, playing]);

  const alpha = useMemo(
    () => ({
      re: alphaMagnitude * Math.cos(alphaPhase),
      im: alphaMagnitude * Math.sin(alphaPhase),
    }),
    [alphaMagnitude, alphaPhase],
  );
  const coefficients = useMemo(
    () => oscillatorCoefficients(preset, alpha),
    [alpha, preset],
  );

  const stationaryValues = useMemo(() => {
    const baseline = n + 0.5;
    return Array.from({ length: 401 }, (_, index) => {
      const x = -4 + (8 * index) / 400;
      const phi = harmonicEigenfunction(n, x);
      return {
        x,
        y: baseline + (display === 'wave' ? phi : phi * phi),
      };
    });
  }, [display, n]);

  const probabilityGrid = useMemo(
    () =>
      Array.from({ length: 401 }, (_, index) => {
        const x = -7 + (14 * index) / 400;
        return {
          x,
          basis: coefficients.map((coefficient) =>
            harmonicEigenfunction(coefficient.n, x),
          ),
        };
      }),
    [coefficients],
  );
  const evolvedCoefficients = useMemo(
    () => evolveOscillatorCoefficients(coefficients, time),
    [coefficients, time],
  );
  const probabilityValues = useMemo(
    () =>
      probabilityGrid.map((point) => ({
        x: point.x,
        density: probabilityFromBasis(point.basis, evolvedCoefficients),
      })),
    [evolvedCoefficients, probabilityGrid],
  );

  const meanEnergy = useMemo(
    () => expectationEnergy(coefficients),
    [coefficients],
  );
  const evolutionValues = useMemo(
    () =>
      probabilityValues.map((point) => ({
        x: point.x,
        y: meanEnergy + psiScale * point.density,
      })),
    [meanEnergy, probabilityValues, psiScale],
  );
  const meanX = numericalExpectationX(probabilityValues);
  const stationaryMaximum = Math.max(9, n + 1.65);
  const evolutionMaximum = 13.4;

  const selectPreset = (nextPreset: OscillatorPreset) => {
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
    <section className="workspace" aria-labelledby="oscillator-title">
      <aside className="control-panel">
        <div>
          <p className="eyebrow">02</p>
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

        <div className="equation-card">
          <span>{mode === 'stationary' ? 'Fonction propre' : 'État initial'}</span>
          <Formula display>
            {mode === 'stationary'
              ? String.raw`$\phi_n(\xi)=\frac{e^{-\xi^2/2}H_n(\xi)}{\pi^{1/4}\sqrt{2^n n!}}$`
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
                <Formula>{String.raw`$\phi_n(x)$`}</Formula>
              </Button>
              <Button variant="outline" className={display === 'density' ? 'is-selected' : ''} onClick={() => setDisplay('density')} aria-pressed={display === 'density'}>
                <Formula>{String.raw`$|\phi_n(x)|^2$`}</Formula>
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
                    onValueChange={(value) => setAlphaMagnitude(sliderValue(value, 2))}
                    aria-label="Module de alpha"
                  />
                </div>
                <div className="control-block">
                  <div className="control-heading">
                    <label htmlFor="alpha-phase">Phase <Formula>{String.raw`$\arg(\alpha)$`}</Formula></label>
                    <output>{(alphaPhase / Math.PI).toFixed(1)}π</output>
                  </div>
                  <Slider
                    id="alpha-phase"
                    min={-Math.PI}
                    max={Math.PI}
                    step={0.05}
                    value={[alphaPhase]}
                    onValueChange={(value) => setAlphaPhase(sliderValue(value, Math.PI / 2))}
                    aria-label="Phase de alpha"
                  />
                </div>
              </div>
            ) : null}

            <div className="control-block time-control">
              <div className="control-heading">
                <label htmlFor="oscillator-time">Temps réduit <Formula>{String.raw`$\tau=\omega t$`}</Formula></label>
                <output>{time.toFixed(2)}</output>
              </div>
              <Slider
                id="oscillator-time"
                min={0}
                max={TAU_MAX}
                step={0.01}
                value={[time]}
                onValueChange={(value) => setTime(clamp(sliderValue(value, 0), 0, TAU_MAX))}
                aria-label="Temps réduit omega t"
              />
              <div className="range-labels" aria-hidden="true"><span>0</span><span>2π</span></div>
            </div>

            <div className="control-block scale-control">
              <div className="control-heading">
                <label htmlFor="oscillator-scale">Facteur d’affichage <Formula>{String.raw`$s$`}</Formula></label>
                <output><Formula>{`$s=${psiScale.toFixed(1)}$`}</Formula></output>
              </div>
              <Slider
                id="oscillator-scale"
                min={0.5}
                max={8}
                step={0.1}
                value={[psiScale]}
                onValueChange={(value) => setPsiScale(sliderValue(value, 2))}
                aria-label="Facteur d’affichage s de la densité de probabilité"
              />
              <div className="range-labels" aria-hidden="true"><span><Formula>{String.raw`$s=0{,}5$`}</Formula></span><span><Formula>{String.raw`$s=8$`}</Formula></span></div>
              <p className="scale-note">Le facteur <Formula>{String.raw`$s$`}</Formula> modifie uniquement l’affichage · <Formula>{String.raw`$\int |\psi|^2\,dx=1$`}</Formula></p>
            </div>

            <div className="transport-controls">
              <Button onClick={() => setPlaying((current) => !current)}>
                {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                {playing ? 'Pause' : 'Animer'}
              </Button>
              <Button variant="outline" size="icon" onClick={() => {
                setTime(0);
                setPlaying(false);
              }} aria-label="Revenir au temps zéro">
                <RotateCcw aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        <dl className="measurements">
          {mode === 'stationary' ? (
            <>
              <div><dt>Énergie</dt><dd><Formula>{String.raw`$(n+\frac12)\hbar\omega$`}</Formula></dd></div>
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
                    ? String.raw`$\phi_${n}(\xi)+E_${n}$`
                    : String.raw`$|\phi_${n}(\xi)|^2+E_${n}$`
                  : String.raw`$s\,|\psi(\xi,\tau)|^2+\langle E\rangle$`}
              </Formula>
            </h2>
          </div>
          <div className="plot-legend" aria-label="Légende">
            <span><i className="legend-swatch accent" aria-hidden="true" />{mode === 'stationary' ? (display === 'wave' ? 'fonction propre' : 'densité') : 'densité'}</span>
            <span><i className="legend-swatch ink" aria-hidden="true" />potentiel</span>
          </div>
        </div>

        <div className="plot-shell">
          {mode === 'stationary' ? (
            <ScientificPlot
              ariaLabel={`Oscillateur harmonique, état n égal à ${n}, ${display === 'wave' ? 'fonction propre' : 'densité de probabilité'}`}
              xDomain={[-4, 4]}
              yDomain={[0, stationaryMaximum]}
              xTicks={[-4, -2, 0, 2, 4]}
              xLabel={String.raw`$\xi=x/x_0$`}
              yLabel={String.raw`$\frac{E}{\hbar\omega}+\text{amplitude}$`}
              series={[
                { values: POTENTIAL_STATIONARY, tone: 'ink', width: 2, fillTo: 0, fillOpacity: 0.1 },
                { values: stationaryValues, tone: 'accent', width: 2.8, fillTo: n + 0.5, fillOpacity: 0.24 },
              ]}
              horizontalLines={[{ value: n + 0.5, label: String.raw`$E_${n}$`, tone: 'teal', dashed: true }]}
            />
          ) : (
            <ScientificPlot
              ariaLabel={`Densité de probabilité de l’oscillateur harmonique au temps réduit ${time.toFixed(2)}, facteur s égal à ${psiScale.toFixed(1)}`}
              xDomain={[-5, 5]}
              yDomain={[0, evolutionMaximum]}
              xTicks={[-4, -2, 0, 2, 4]}
              xLabel={String.raw`$\xi=x/x_0$`}
              yLabel={String.raw`$\frac{E}{\hbar\omega}+s\,|\psi(\xi,\tau)|^2$`}
              series={[
                { values: POTENTIAL_EVOLUTION, tone: 'ink', width: 2, fillTo: 0, fillOpacity: 0.1 },
                { values: evolutionValues, tone: 'accent', width: 2.8, fillTo: meanEnergy, fillOpacity: 0.3 },
              ]}
              horizontalLines={[{ value: meanEnergy, label: String.raw`$\langle E\rangle$`, tone: 'teal', dashed: true }]}
            />
          )}
        </div>

        <div className="insight-row">
          <span className="insight-index">{mode === 'stationary' ? String(n).padStart(2, '0') : 'τ'}</span>
          <p>
            {mode === 'stationary'
              ? n === 0
                ? <>Même dans l’état fondamental, l’énergie ne peut pas être nulle : <Formula>{String.raw`$E_0=\hbar\omega/2$`}</Formula>.</>
                : <>L’état <Formula>{String.raw`$n=${n}$`}</Formula> possède {n} nœud{n > 1 ? 's' : ''} et une parité {n % 2 === 0 ? 'paire' : 'impaire'}.</>
              : presetInsight(preset)}
          </p>
          <span className="insight-formula"><Formula>{String.raw`$E_n=\hbar\omega(n+1/2)$`}</Formula></span>
        </div>

        <details className="theory-notes">
          <summary>Repères théoriques</summary>
          <div className="theory-grid">
            <div>
              <span>Hamiltonien</span>
              <Formula display>{String.raw`$\hat H=\frac{\hat p_x^2}{2m}+\frac{m\omega^2\hat x^2}{2}$`}</Formula>
            </div>
            <div>
              <span>Polynômes d’Hermite</span>
              <Formula display>{String.raw`$H_{n+1}=2\xi H_n-2nH_{n-1}$`}</Formula>
            </div>
            <div>
              <span>État cohérent</span>
              <Formula display>{String.raw`$|\alpha\rangle=e^{-|\alpha|^2/2}\sum_{n=0}^{\infty}\frac{\alpha^n}{\sqrt{n!}}|n\rangle$`}</Formula>
            </div>
          </div>
          <p>
            Les amplitudes sont décalées verticalement sur leur niveau
            d’énergie pour rendre le diagramme lisible. Le calcul temporel
            emploie la phase physique <Formula>{String.raw`$\exp[-i(n+1/2)\tau]$`}</Formula>.
          </p>
        </details>
      </div>
    </section>
  );
}
