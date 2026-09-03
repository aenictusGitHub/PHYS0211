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
  sliderValue,
  wellCoefficients,
  wellDensity,
  wellEigenfunction,
  type WellPreset,
} from '@/lib/quantum';

type WellMode = 'stationary' | 'evolution';

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

function presetFormula(preset: WellPreset) {
  if (preset === 'low-pair') {
    return String.raw`$\psi(x,0)=\frac{\phi_1(x)+\phi_2(x)}{\sqrt{2}}$`;
  }
  if (preset === 'high-pair') {
    return String.raw`$\psi(x,0)=\frac{\phi_9(x)+\phi_{10}(x)}{\sqrt{2}}$`;
  }
  return String.raw`$\psi(x,0)=\frac{\sqrt{30}}{a^{5/2}}x(a-x)$`;
}

function presetInsight(preset: WellPreset) {
  if (preset === 'low-pair') {
    return <>La différence d’énergie <Formula>{String.raw`$\Delta E=3E_1$`}</Formula> fait osciller la densité de gauche à droite.</>;
  }
  if (preset === 'high-pair') {
    return <>Les modes voisins <Formula>{String.raw`$n=9$`}</Formula> et <Formula>{String.raw`$n=10$`}</Formula> produisent un battement rapide, de période <Formula>{String.raw`$2\pi/19$`}</Formula>.</>;
  }
  return 'Le profil parabolique ne contient que des modes impairs et se reconstruit périodiquement.';
}

export function InfiniteWellLab({
  command,
}: {
  command: ExperimentCommand | null;
}) {
  const [mode, setMode] = useState<WellMode>('stationary');
  const [n, setN] = useState(1);
  const [width, setWidth] = useState(1);
  const [preset, setPreset] = useState<WellPreset>('low-pair');
  const [time, setTime] = useState(0);
  const [psiScale, setPsiScale] = useState(2);
  const [playing, setPlaying] = useState(false);

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
    if (command.time !== undefined) setTime(command.time);
    if (command.scale !== undefined) setPsiScale(command.scale);
    setPlaying(false);
  }, [command]);

  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(() => {
      setTime((current) => (current + 0.035) % TAU_MAX);
    }, 35);
    return () => window.clearInterval(interval);
  }, [playing]);

  const coefficients = useMemo(() => wellCoefficients(preset), [preset]);
  const values = useMemo(() => {
    return Array.from({ length: 361 }, (_, index) => {
      const u = index / 360;
      const y =
        mode === 'stationary'
          ? wellEigenfunction(n, u, width)
          : (psiScale * wellDensity(coefficients, u, time, width)) / width;
      return { x: width * u, y };
    });
  }, [coefficients, mode, n, psiScale, time, width]);

  const maximumDensity =
    mode === 'evolution'
      ? Math.max(2.2, ...values.map((point) => point.y))
      : 1;
  const expectedReducedEnergy = coefficients.reduce(
    (total, coefficient) =>
      total +
      (coefficient.re * coefficient.re + coefficient.im * coefficient.im) *
        coefficient.n ** 2,
    0,
  );

  const selectPreset = (nextPreset: WellPreset) => {
    const selected = PRESETS.find((entry) => entry.value === nextPreset);
    setPreset(nextPreset);
    setWidth(selected?.width ?? 1);
    setPsiScale(nextPreset === 'parabola' ? 6 : 2);
    setTime(0);
    setPlaying(false);
  };

  return (
    <section className="workspace" aria-labelledby="well-title">
      <aside className="control-panel">
        <div>
          <p className="eyebrow">Laboratoire 01 · Confinement</p>
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

        <div className="equation-card">
          <span>{mode === 'stationary' ? 'Fonction propre normalisée' : 'État initial'}</span>
          <Formula display>
            {mode === 'stationary'
              ? String.raw`$\phi_n(x)=\sqrt{\frac{2}{a}}\sin\!\left(\frac{n\pi x}{a}\right)$`
              : presetFormula(preset)}
          </Formula>
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

            <div className="control-block">
              <div className="control-heading">
                <label htmlFor="well-width">Largeur du puits <Formula>{String.raw`$a$`}</Formula></label>
                <output>{width.toFixed(1)}</output>
              </div>
              <Slider
                id="well-width"
                min={0.5}
                max={4}
                step={0.1}
                value={[width]}
                onValueChange={(value) => setWidth(sliderValue(value, 1))}
                aria-label="Largeur du puits a"
              />
              <div className="range-labels" aria-hidden="true"><span>0,5</span><span>4,0</span></div>
            </div>
          </div>
        ) : (
          <div className="control-stack">
            <div className="preset-grid" role="group" aria-label="État initial">
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
            </div>

            <div className="control-block time-control">
              <div className="control-heading">
                <label htmlFor="well-time">Temps réduit <Formula>{String.raw`$\tau$`}</Formula></label>
                <output>{time.toFixed(2)}</output>
              </div>
              <Slider
                id="well-time"
                min={0}
                max={TAU_MAX}
                step={0.01}
                value={[time]}
                onValueChange={(value) => setTime(clamp(sliderValue(value, 0), 0, TAU_MAX))}
                aria-label="Temps réduit tau"
              />
              <div className="range-labels" aria-hidden="true"><span>0</span><span>2π</span></div>
            </div>

            <div className="control-block scale-control">
              <div className="control-heading">
                <label htmlFor="well-scale">Échelle de <Formula>{String.raw`$|\psi|^2$`}</Formula></label>
                <output>×{psiScale.toFixed(1)}</output>
              </div>
              <Slider
                id="well-scale"
                min={0.5}
                max={8}
                step={0.1}
                value={[psiScale]}
                onValueChange={(value) => setPsiScale(sliderValue(value, 2))}
                aria-label="Facteur d’échelle graphique de la densité de probabilité"
              />
              <div className="range-labels" aria-hidden="true"><span>×0,5</span><span>×8</span></div>
              <p className="scale-note">Affichage uniquement · <Formula>{String.raw`$\int |\psi|^2\,dx=1$`}</Formula></p>
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
              <div><dt>Énergie</dt><dd><Formula>{String.raw`$E_${n}=${n * n}E_1$`}</Formula></dd></div>
              <div><dt>Nœuds internes</dt><dd>{n - 1}</dd></div>
              <div><dt>Échelle d’énergie</dt><dd><Formula>{String.raw`$E_1\propto a^{-2}$`}</Formula></dd></div>
            </>
          ) : (
            <>
              <div><dt>Largeur</dt><dd><Formula>{String.raw`$a=${width.toFixed(1)}$`}</Formula></dd></div>
              <div><dt>Énergie moyenne</dt><dd><Formula>{String.raw`$${expectedReducedEnergy.toFixed(2)}\,E_1$`}</Formula></dd></div>
              <div><dt>Facteur visuel</dt><dd>×{psiScale.toFixed(1)}</dd></div>
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
                  ? String.raw`$\phi_${n}(x)$`
                  : String.raw`$s\,|\psi(x,\tau)|^2$`}
              </Formula>
            </h2>
          </div>
          <div className="plot-legend" aria-label="Légende">
            <span><i className="legend-swatch accent" />{mode === 'stationary' ? 'fonction d’onde' : 'densité'}</span>
            <span><i className="legend-swatch teal dashed" />axe de symétrie</span>
          </div>
        </div>

        <div className="plot-shell">
          <ScientificPlot
            ariaLabel={
              mode === 'stationary'
                ? `Fonction propre du puits infini pour n égal à ${n} et largeur ${width.toFixed(1)}`
                : `Densité de probabilité dans le puits infini au temps réduit ${time.toFixed(2)}, facteur graphique ${psiScale.toFixed(1)}`
            }
            xDomain={[-0.12 * width, 1.12 * width]}
            yDomain={mode === 'stationary' ? [-2.3, 2.3] : [0, maximumDensity * 1.12]}
            xTicks={[0, width / 4, width / 2, (3 * width) / 4, width]}
            yTicks={mode === 'stationary' ? [-2, -1, 0, 1, 2] : undefined}
            xLabel="x"
            yLabel={mode === 'stationary' ? 'φₙ(x)' : 's · |ψ(x,τ)|²'}
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
              { from: -0.12 * width, to: 0, tone: 'ink', fadeToward: 'right', opacity: 0.2 },
              { from: width, to: 1.12 * width, tone: 'ink', fadeToward: 'left', opacity: 0.2 },
            ]}
            verticalLines={[
              { value: 0, label: 'V → ∞', tone: 'ink', dashed: false, width: 3.5 },
              { value: width / 2, tone: 'teal', dashed: true },
              { value: width, label: 'V → ∞', tone: 'ink', dashed: false, width: 3.5 },
            ]}
            horizontalLines={mode === 'stationary' ? [{ value: 0, tone: 'ink', dashed: false }] : []}
          />
        </div>

        <div className="insight-row">
          <span className="insight-index">{mode === 'stationary' ? String(n).padStart(2, '0') : 'τ'}</span>
          <p>
            {mode === 'stationary'
              ? n === 1
                ? 'L’état fondamental ne possède aucun nœud interne et minimise l’énergie.'
                : <>Le mode <Formula>{String.raw`$n=${n}$`}</Formula> possède {n - 1} nœud{n > 2 ? 's' : ''} interne{n > 2 ? 's' : ''}; son énergie vaut <Formula>{String.raw`$${n * n}E_1$`}</Formula>.</>
              : presetInsight(preset)}
          </p>
          <span className="insight-formula"><Formula>{String.raw`$E_n=n^2E_1$`}</Formula></span>
        </div>

        <details className="theory-notes">
          <summary>Repères théoriques</summary>
          <div className="theory-grid">
            <div>
              <span>Potentiel</span>
              <Formula display>{String.raw`$V(x)=\begin{cases}0,&0\le x\le a\\ \infty,&\text{sinon}\end{cases}$`}</Formula>
            </div>
            <div>
              <span>Énergies propres</span>
              <Formula display>{String.raw`$E_n=n^2\frac{\pi^2\hbar^2}{2ma^2}$`}</Formula>
            </div>
            <div>
              <span>Évolution spectrale</span>
              <Formula display>{String.raw`$\psi(x,t)=\sum_n c_n e^{-iE_nt/\hbar}\phi_n(x)$`}</Formula>
            </div>
          </div>
          <p>
            La fonction propre est nulle hors de <Formula>{String.raw`$[0,a]$`}</Formula>. Ici, <Formula>{String.raw`$\tau=E_1t/\hbar$`}</Formula> et les barrières infinies sont représentées par des parois verticales.
          </p>
        </details>
      </div>
    </section>
  );
}
