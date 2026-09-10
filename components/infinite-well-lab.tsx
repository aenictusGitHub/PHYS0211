'use client';

import { useEffect, useMemo, useState } from 'react';
import { PlaybackControls, DisplayControls } from '@/components/playback-controls';
import { useLabPlayback } from '@/components/use-lab-playback';

import { type ExperimentCommand } from '@/components/lab-types';
import { Math as Formula } from '@/components/math';
import { ScientificPlot } from '@/components/scientific-plot';
import { EnergyLevels } from '@/components/energy-levels';
import { WellObservables } from '@/components/well-observables';
import { WellStateEditor } from '@/components/well-state-editor';
import { QuantumParameter } from '@/components/quantum-parameter';
import { customWellCoefficients, wellDensityCeiling } from '@/lib/well-state';
import { clipEnergyGuides, potentialEnergyDomain } from '@/lib/plot-geometry';
import { evolveWellState, linearWellEigenfunction, prepareLinearWellMoments, projectWellState, solveLinearWell, WELL_BASIS_SIZE, WELL_LINEAR_LIMIT } from '@/lib/well-linear';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  TAU_MAX,
  sliderValue,
  wellCoefficients,
  wellEigenfunction,
  type Coefficient,
  type WellPreset,
} from '@/lib/quantum';

type WellMode = 'stationary' | 'evolution';
type InitialState = WellPreset | 'custom';

const PRESETS: Array<{
  value: WellPreset;
  label: string;
  short: string;
  width: number;
}> = [
  { value: 'low-pair', label: 'Modes 1 + 2', short: '1 + 2', width: 1 },
  { value: 'high-pair', label: 'Modes 9 + 10', short: '9 + 10', width: 4 },
  { value: 'parabola', label: 'Parabole', short: 'Parabole', width: 4 },
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

function presetFormula(preset: InitialState) {
  if (preset === 'custom') return String.raw`$\begin{aligned}\psi(x,0)&=\displaystyle\sum\limits_{n=1}^{10}c_n\phi_n(x),\\[.7em]c_n&=\frac{A_n}{N}e^{i\theta_n},\\[.7em]N^2&=\displaystyle\sum\limits_{k=1}^{10}A_k^2.\end{aligned}$`;
  if (preset === 'low-pair') {
    return String.raw`$\psi(x,0)=\frac{\phi_1(x)+\phi_2(x)}{\sqrt{2}}$`;
  }
  if (preset === 'high-pair') {
    return String.raw`$\psi(x,0)=\frac{\phi_9(x)+\phi_{10}(x)}{\sqrt{2}}$`;
  }
  return String.raw`$\psi(x,0)=\frac{\sqrt{30}}{a^{5/2}}x(a-x)$`;
}

function presetInsight(preset: InitialState) {
  if (preset === 'custom') return 'Les amplitudes fixent les populations des niveaux ; les phases relatives modifient les interférences. Changer l’état initial remet le temps à zéro.';
  if (preset === 'low-pair') {
    return <>La différence d’énergie <Formula>{String.raw`$\Delta E=3E_1$`}</Formula> fait osciller la densité de gauche à droite.</>;
  }
  if (preset === 'high-pair') {
    return <>Les modes voisins <Formula>{String.raw`$n=9$`}</Formula> et <Formula>{String.raw`$n=10$`}</Formula> produisent un battement rapide, de période <Formula>{String.raw`$2\pi/19$`}</Formula>.</>;
  }
  return 'Le profil parabolique ne contient que des modes impairs et se reconstruit périodiquement.';
}

export function InfiniteWellLab({
  active,
  command,
}: {
  active: boolean;
  command: ExperimentCommand | null;
}) {
  const [mode, setMode] = useState<WellMode>('stationary');
  const [n, setN] = useState(1);
  const [width, setWidth] = useState(1);
  const [preset, setPreset] = useState<InitialState>('low-pair');
  const [customCoefficients, setCustomCoefficients] = useState<Coefficient[]>(() => wellCoefficients('low-pair'));
  const [time, setTime] = useState(0);
  const [psiScale, setPsiScale] = useState(2);
  const [stationaryScale, setStationaryScale] = useState(1);
  const [playing, setPlaying] = useState(false);
  const clock = useLabPlayback({ active, enabled: mode === 'evolution', time, setTime, playing, setPlaying, defaultFinalTime: TAU_MAX, rate: 1, command: command?.lab === 'well' ? command : null });
  const [perturbationEnabled, setPerturbationEnabled] = useState(false);
  const [perturbationStrength, setPerturbationStrength] = useState(6);
  const strength = perturbationEnabled ? perturbationStrength : 0;
  const perturbed = strength !== 0;
  const energyReference = perturbed ? String.raw`E_{\mathrm{ref}}` : 'E_1';

  useEffect(() => {
    if (!command || command.lab !== 'well') return;
    if (command.mode) setMode(command.mode);
    if (command.quantumNumber !== undefined) setN(command.quantumNumber);
    if (
      command.preset === 'low-pair' ||
      command.preset === 'high-pair' ||
      command.preset === 'parabola'
    ) {
      setPreset(command.preset);
      const selected = PRESETS.find((entry) => entry.value === command.preset);
      if (selected) setWidth(selected.width);
      setPsiScale(command.preset === 'parabola' ? 6 : 2);
    }
    if (command.preset === 'custom' || command.wellModes) {
      setPreset('custom');
      if (command.wellModes) setCustomCoefficients(customWellCoefficients(command.wellModes));
      setTime(0);
    }
    if (command.wellWidth !== undefined) setWidth(command.wellWidth);
    if (command.wellLinear !== undefined) {
      setPerturbationEnabled(command.wellLinear !== 0);
      if (command.wellLinear !== 0) setPerturbationStrength(command.wellLinear);
      setTime(0);
    }
    if (command.time !== undefined) setTime(command.time);
    if (command.scale !== undefined) { setPsiScale(command.scale); setStationaryScale(command.scale); }
    setPlaying(false);
  }, [command]);


  const coefficients = useMemo(() => preset === 'custom' ? customCoefficients : wellCoefficients(preset), [preset, customCoefficients]);
  const spectrum = useMemo(() => strength === 0 ? null : solveLinearWell(strength), [strength]);
  const spectralCoefficients = useMemo(() => spectrum ? projectWellState(spectrum, coefficients) : coefficients, [spectrum, coefficients]);
  const momentModel = useMemo(() => spectrum ? prepareLinearWellMoments(spectrum, spectralCoefficients) : undefined, [spectrum, spectralCoefficients]);
  const energies = useMemo(() => spectrum?.energies.slice(0, 8) ?? Array.from({ length: 8 }, (_, i) => (i + 1) ** 2), [spectrum]);
  const plotGrid = useMemo(
    () =>
      Array.from({ length: 241 }, (_, index) => {
        const u = index / 240;
        return { u };
      }),
    [],
  );
  const evolutionBasis = useMemo(
    () =>
      plotGrid.map((point) =>
        spectralCoefficients.map((coefficient) =>
          spectrum ? linearWellEigenfunction(spectrum.states[coefficient.n - 1], point.u, width) : wellEigenfunction(coefficient.n, point.u, width),
        ),
      ),
    [spectralCoefficients, spectrum, plotGrid, width],
  );
  const evolvedCoefficients = useMemo(
    () => evolveWellState(spectralCoefficients, time, spectrum?.energies),
    [spectralCoefficients, spectrum, time],
  );
  const values = useMemo(() => {
    return plotGrid.map((point, index) => ({
      x: point.u,
      y:
        mode === 'stationary'
          ? stationaryScale * (spectrum ? linearWellEigenfunction(spectrum.states[n - 1], point.u, width) : wellEigenfunction(n, point.u, width))
          : psiScale *
            probabilityFromBasis(evolutionBasis[index], evolvedCoefficients),
    }));
  }, [evolutionBasis, evolvedCoefficients, mode, n, plotGrid, psiScale, width, spectrum, stationaryScale]);

  const stationaryExtent = useMemo(() => Math.max(2.3, stationaryScale * (spectrum ? Math.max(...spectrum.states.slice(0, 8).map(state =>
    Math.max(...plotGrid.map(point => Math.abs(linearWellEigenfunction(state, point.u, width)))))) : Math.sqrt(2 / width)) * 1.12), [spectrum, plotGrid, width, stationaryScale]);

  const unscaledMaximumDensity = useMemo(() => {
    if (mode !== 'evolution') return 1;
    return wellDensityCeiling(spectralCoefficients, evolutionBasis);
  }, [spectralCoefficients, evolutionBasis, mode]);
  const maximumDensity =
    mode === 'evolution'
      ? Math.max(2.2, psiScale * unscaledMaximumDensity)
      : 1;
  const expectedReducedEnergy = useMemo(
    () =>
      spectralCoefficients.reduce(
        (total, coefficient) =>
          total +
          (coefficient.re * coefficient.re + coefficient.im * coefficient.im) *
            (spectrum?.energies[coefficient.n - 1] ?? coefficient.n ** 2),
        0,
      ),
    [spectralCoefficients, spectrum],
  );
  const potentialPlot = useMemo(() => {
    const floor = [{ x: 0, y: -strength / 2 }, { x: 1, y: strength / 2 }];
    const domain = potentialEnergyDomain(floor, [expectedReducedEnergy]);
    return {
      domain,
      walls: [{ x: 0, y: domain[1] }, ...floor, { x: 1, y: domain[1] }],
      energyGuides: clipEnergyGuides([{ value: expectedReducedEnergy, label: String.raw`$\langle E\rangle$`, tone: 'teal', dashed: true, width: 2 }], floor),
    };
  }, [strength, expectedReducedEnergy]);

  const selectPreset = (nextPreset: WellPreset) => {
    const selected = PRESETS.find((entry) => entry.value === nextPreset);
    setPreset(nextPreset);
    setWidth(selected?.width ?? 1);
    setPsiScale(nextPreset === 'parabola' ? 6 : 2);
    setTime(0);
    setPlaying(false);
  };

  return (
    <section className="workspace well-workspace" aria-labelledby="well-title">
      <aside className="control-panel">
        <div>
          <p className="eyebrow">03</p>
          <h1 id="well-title">Puits de potentiel infini</h1>
          <p className="lede">
            Reliez quantification, nœuds et interférences dans un espace où la
            particule ne peut jamais franchir les parois.
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

        <section className="well-perturbation" aria-labelledby="well-perturbation-label">
          <div className="well-perturbation-heading">
            <label id="well-perturbation-label" htmlFor="well-linear-enabled">Perturbation linéaire</label>
            <Switch id="well-linear-enabled" checked={perturbationEnabled} onCheckedChange={enabled => { setPerturbationEnabled(enabled); setTime(0); setPlaying(false); }} aria-describedby="well-perturbation-help" />
          </div>
          <p id="well-perturbation-help" className="scale-note">{perturbationEnabled ? 'Potentiel incliné entre deux parois infinies.' : 'Incliner le fond du puits avec un potentiel linéaire.'}</p>
          {perturbationEnabled ? <div className="control-stack">
            <div className="perturbation-equations">
              <Formula display>{String.raw`$V(x)=\lambda E_{\mathrm{ref}}\!\left(\frac{x}{a}-\frac12\right)$`}</Formula>
              <Formula display>{String.raw`$E_{\mathrm{ref}}=\frac{\pi^2\hbar^2}{2ma^2}$`}</Formula>
            </div>
            <QuantumParameter id="well-linear-strength" label="Pente" symbol={String.raw`$\lambda$`} value={perturbationStrength} min={-WELL_LINEAR_LIMIT} max={WELL_LINEAR_LIMIT} step={.1} onChange={value => { setPerturbationStrength(value); setTime(0); setPlaying(false); }} />
            <p className="scale-note">Le zéro du potentiel est au centre. Inverser le signe inverse la pente ; <Formula>{String.raw`$\lambda=0$`}</Formula> retrouve le puits plat.</p>
          </div> : null}
        </section>

        <div className="equation-card">
          <span>{mode === 'stationary' ? 'Fonction propre normalisée' : 'État initial'}</span>
          <Formula display>
            {mode === 'stationary'
              ? perturbed ? String.raw`$\begin{aligned}H_\lambda\phi_n^{(\lambda)}&=E_n^{(\lambda)}\phi_n^{(\lambda)},\\\phi_n^{(\lambda)}(0)&=\phi_n^{(\lambda)}(a)=0.\end{aligned}$` : String.raw`$\phi_n(x)=\sqrt{\frac{2}{a}}\,\sin(n\pi x/a)$`
              : presetFormula(preset)}
          </Formula>
          {perturbed ? <p className="scale-note">{mode === 'stationary' ? `États calculés dans une base de ${WELL_BASIS_SIZE} sinus.` : <>Les <Formula>{String.raw`$\phi_n$`}</Formula> de l’état initial restent ceux du puits sans perturbation. L’évolution utilise le potentiel incliné dès <Formula>{'$t=0$'}</Formula>.</>}</p> : null}
        </div>

        {mode === 'stationary' ? (
          <div className="control-stack">
            <div className="control-block">
              <div className="control-heading">
                <label htmlFor="well-n">Nombre quantique <Formula>{String.raw`$n$`}</Formula></label>
                <output>{n}</output>
              </div>
              <Slider
                id="well-n"
                min={1}
                max={8}
                step={1}
                value={[n]}
                onValueChange={(value) => setN(sliderValue(value, 1))}
                aria-label="Nombre quantique n"
              />
              <div className="range-labels" aria-hidden="true"><span>1</span><span>8</span></div>
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
                >
                  {entry.short}
                </Button>
              ))}
              <Button variant="outline" className={preset === 'custom' ? 'is-selected' : ''} aria-pressed={preset === 'custom'} onClick={() => { setPreset('custom'); setTime(0); setPlaying(false); }}>Personnalisé</Button>
            </div>

            {preset === 'custom' ? <WellStateEditor key={JSON.stringify(customCoefficients)} coefficients={customCoefficients} onApply={next => { setCustomCoefficients(next); setTime(0); setPlaying(false); }} /> : null}


          </div>
        )}

        <dl className="measurements">
          {mode === 'stationary' ? (
            <>
              <div><dt>Énergie</dt><dd><Formula>{String.raw`$${perturbed ? energies[n - 1].toFixed(3) : n * n}\,${energyReference}$`}</Formula></dd></div>
              <div><dt>Nœuds internes</dt><dd>{n - 1}</dd></div>
              <div><dt>Échelle d’énergie</dt><dd><Formula>{String.raw`$${energyReference}\propto a^{-2}$`}</Formula></dd></div>
            </>
          ) : (
            <>
              <div><dt>Largeur</dt><dd><Formula>{String.raw`$a=${width.toFixed(1)}$`}</Formula></dd></div>
              <div><dt>Énergie moyenne</dt><dd><Formula>{String.raw`$${expectedReducedEnergy.toFixed(2)}\,${energyReference}$`}</Formula></dd></div>
              <div><dt>Facteur <Formula>{String.raw`$s$`}</Formula></dt><dd><Formula>{`$s=${psiScale.toFixed(1)}$`}</Formula></dd></div>
            </>
          )}
        </dl>
      </aside>

      <div className="figure-panel">
        <div className="figure-heading">
          <div>
            <p className="eyebrow">{mode === 'stationary' ? 'Forme propre' : 'Densité de probabilité'}</p>
            <h2>
              <Formula>
                {mode === 'stationary'
                  ? perturbed ? String.raw`$s\,\phi_${n}^{(\lambda)}(x)$` : String.raw`$s\,\phi_${n}(x)$`
                  : String.raw`$s\,|\psi(x,\tau)|^2$`}
              </Formula>
            </h2>
          </div>
          <div className="plot-legend" aria-label="Légende">
            <span><i className="legend-swatch accent" aria-hidden="true" />{mode === 'stationary' ? 'fonction d’onde' : 'densité de probabilité'}</span>
            <span><i className="legend-swatch teal dashed" aria-hidden="true" />{perturbed ? 'centre du puits' : 'axe de symétrie'}</span>
          </div>
        </div>

        <div className="plot-shell">
          <ScientificPlot
            ariaLabel={
              mode === 'stationary'
                ? `Fonction propre du puits infini pour n égal à ${n}, pente lambda ${strength.toFixed(1)}`
                : `Densité de probabilité dans le puits infini au temps réduit ${time.toFixed(2)}, pente lambda ${strength.toFixed(1)}, facteur s égal à ${psiScale.toFixed(1)}`
            }
            xDomain={[-0.12, 1.12]}
            yDomain={mode === 'stationary' ? [-stationaryExtent, stationaryExtent] : [0, maximumDensity * 1.08]}
            xTicks={[0, 0.25, 0.5, 0.75, 1]}
            yTicks={mode === 'stationary' && stationaryExtent === 2.3 ? [-2, -1, 0, 1, 2] : undefined}
            xLabel={String.raw`$x/a$`}
            yLabel={mode === 'stationary' ? perturbed ? String.raw`$s\,\phi_n^{(\lambda)}(x)$` : String.raw`$s\,\phi_n(x)$` : String.raw`$s\,|\psi(x,\tau)|^2$`}
            series={[
              {
                values,
                tone: 'accent',
                fillTo: 0,
                fillOpacity: mode === 'stationary' ? 0.19 : 0.28,
                width: 2.8,
              },
            ]}
            bands={[
              { from: -0.12, to: 0, tone: 'ink', fadeToward: 'right', opacity: 0.2 },
              { from: 1, to: 1.12, tone: 'ink', fadeToward: 'left', opacity: 0.2 },
            ]}
            verticalLines={[
              { value: 0, label: String.raw`$V\to\infty$`, tone: 'ink', dashed: false, width: 3.5 },
              { value: 0.5, tone: 'teal', dashed: true },
              { value: 1, label: String.raw`$V\to\infty$`, tone: 'ink', dashed: false, width: 3.5 },
            ]}
            horizontalLines={mode === 'stationary' ? [{ value: 0, tone: 'ink', dashed: false }] : []}
          />
        </div>

        {mode === 'stationary' ? <DisplayControls id="well-stationary" stationary scale={stationaryScale} onScaleChange={setStationaryScale} /> : null}
        {mode === 'evolution' ? <PlaybackControls id="well" clock={clock} scale={psiScale} onScaleChange={setPsiScale}
          timeSymbol={String.raw`$\tau$`} finalSymbol={String.raw`$\tau_f$`}
          note={<><Formula>{String.raw`$\tau=${energyReference}t/\hbar$`}</Formula>. Le facteur <Formula>$s$</Formula> ne modifie pas la normalisation.</>} /> : null}
        <p className="scale-note">La boîte s’étend de <Formula>{'$x/a=0$'}</Formula> à <Formula>{'$x/a=1$'}</Formula>. Seule l’abscisse est réduite ; la normalisation reste définie par <Formula>{String.raw`$\int_0^a |\psi(x,t)|^2\,dx=1$`}</Formula>.</p>
        {mode === 'stationary' ? <EnergyLevels energies={energies} selected={n - 1} firstIndex={1} unit={`$E/${energyReference}$`} label="Niveaux d’énergie du puits infini, de n égal à 1 à 8" potentialBox boxTilt={strength} /> : null}
        {mode === 'evolution' && perturbed ? <section className="well-potential-profile" aria-label="Profil du potentiel incliné">
          <div className="well-moment-heading well-potential-heading">
            <p className="eyebrow">Potentiel dans le puits</p>
            <output aria-label="Énergie moyenne de l’état"><i className="legend-swatch teal dashed" aria-hidden="true" /><Formula>{String.raw`$\langle E\rangle=${expectedReducedEnergy.toFixed(3)}\,E_{\mathrm{ref}}$`}</Formula></output>
          </div>
          <div className="plot-shell"><ScientificPlot ariaLabel={`Potentiel linéaire de pente lambda ${strength.toFixed(1)}, avec deux parois infinies et énergie moyenne ${expectedReducedEnergy.toFixed(3)} en unités E ref`} xDomain={[-.12, 1.12]} yDomain={potentialPlot.domain} xTicks={[0, .25, .5, .75, 1]} xLabel="$x/a$" yLabel={String.raw`$E/E_{\mathrm{ref}}$`}
            series={[{ values: potentialPlot.walls, tone: 'ink', width: 3 }]}
            bands={[{ from: -.12, to: 0, tone: 'ink', opacity: .2, fadeToward: 'right' }, { from: 1, to: 1.12, tone: 'ink', opacity: .2, fadeToward: 'left' }]}
            verticalLines={[{ value: 0, width: 0, label: String.raw`$V\to\infty$`, labelAbove: true }, { value: 1, width: 0, label: String.raw`$V\to\infty$`, labelAbove: true }]}
            horizontalLines={[{ value: 0, tone: 'muted', dashed: true }, ...potentialPlot.energyGuides]} /></div>
        </section> : null}
        {mode === 'evolution' ? <WellObservables coefficients={coefficients} time={time} finalTime={clock.finalTime} momentModel={momentModel} perturbed={perturbed} /> : null}
        <div className="insight-row">
          <span className="insight-index">{mode === 'stationary' ? String(n).padStart(2, '0') : 'τ'}</span>
          <p>
            {mode === 'stationary'
              ? n === 1
                ? 'L’état fondamental ne possède aucun nœud interne et minimise l’énergie.'
                : <>Le mode <Formula>{String.raw`$n=${n}$`}</Formula> possède {n - 1} nœud{n > 2 ? 's' : ''} interne{n > 2 ? 's' : ''}; son énergie vaut <Formula>{String.raw`$${perturbed ? energies[n - 1].toFixed(3) : n * n}\,${energyReference}$`}</Formula>.</>
              : perturbed ? 'Le potentiel incliné mélange les modes du puits non perturbé. Les nouvelles différences d’énergie déterminent les oscillations.' : presetInsight(preset)}
          </p>
          <span className="insight-formula"><Formula>{perturbed ? String.raw`$\lambda=${strength.toFixed(1)}$` : String.raw`$E_n=n^2E_1$`}</Formula></span>
        </div>

        <details className="theory-notes">
          <summary>Repères théoriques</summary>
          <div className="theory-grid">
            <div>
              <span>Potentiel</span>
              <Formula display>{perturbed ? String.raw`$V(x)=\begin{cases}\lambda E_{\mathrm{ref}}\left(\frac{x}{a}-\frac12\right)&0<x<a\\ +\infty&\text{ailleurs}\end{cases}$` : String.raw`$V(x)=\begin{cases}0&0<x<a\\ +\infty&x\le 0\;\text{ou}\;x\ge a\end{cases}$`}</Formula>
            </div>
            <div>
              <span>{perturbed ? 'Hamiltonien réduit' : 'Énergies propres'}</span>
              <Formula display>{perturbed ? String.raw`$\frac{H_\lambda}{E_{\mathrm{ref}}}=-\frac{1}{\pi^2}\frac{d^2}{du^2}+\lambda\!\left(u-\frac12\right)$` : String.raw`$E_n=\frac{n^2\pi^2\hbar^2}{2ma^2},\qquad n=1,2,3,\ldots$`}</Formula>
            </div>
            <div>
              <span>Décomposition sur les états propres</span>
              <Formula display>{perturbed ? String.raw`$\psi(x,t)=\sum_{n=1}^{40}d_n\,\phi_n^{(\lambda)}(x)\,e^{-iE_n^{(\lambda)}t/\hbar}$` : String.raw`$\psi(x,t)=\sum_{n=1}^{\infty}c_n\,\phi_n(x)\,e^{-iE_nt/\hbar}$`}</Formula>
            </div>
          </div>
          <p>
            Les coefficients sont donnés par <Formula>{perturbed ? String.raw`$d_n=\langle\phi_n^{(\lambda)}|\psi(0)\rangle$` : String.raw`$c_n=\langle\phi_n|\psi(0)\rangle$`}</Formula>. Les conditions aux bords sont <Formula>{String.raw`$\psi(0,t)=\psi(a,t)=0$`}</Formula>. Le temps réduit est <Formula>{String.raw`$\tau=${energyReference}t/\hbar$`}</Formula>.
          </p>
          {perturbed ? <p>Avec <Formula>{String.raw`$u=x/a$`}</Formula>, le calcul diagonalise le Hamiltonien dans une base de {WELL_BASIS_SIZE} sinus normalisés, sans approximation au premier ordre. <Formula>{String.raw`$E_{\mathrm{ref}}$`}</Formula> reste l’énergie fondamentale du puits sans perturbation ; ce n’est pas l’énergie fondamentale du puits incliné. Le changement de potentiel conserve l’état initial choisi et remet le temps à zéro.</p> : null}
        </details>
      </div>
    </section>
  );
}
