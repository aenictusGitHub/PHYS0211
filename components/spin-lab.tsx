'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { BlochSphere } from '@/components/bloch-sphere';
import { Math as Formula } from '@/components/math';
import { QuantumParameter } from '@/components/quantum-parameter';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { type ExperimentCommand } from '@/components/lab-types';
import { sliderValue } from '@/lib/quantum';
import { SPIN_PRESETS, SPIN_TIME_MAX, blochVector, evolveSpin, fieldVector, probabilityPlus, type Complex, type SpinAxis, type SpinField } from '@/lib/spin';

const axes: SpinAxis[] = ['x', 'y', 'z'];
const fields: { id: SpinField; formula: string }[] = [
  { id: 'x', formula: '$x$' }, { id: 'y', formula: '$y$' }, { id: 'z', formula: '$z$' },
  { id: 'tilted', formula: String.raw`$\frac{x+z}{\sqrt2}$` },
];
const fixed = (v: number) => (Math.abs(v) < .005 ? 0 : v).toFixed(2);
function complexLabel({ re, im }: Complex) {
  return `${fixed(re)}${im < -.005 ? '-' : '+'}${fixed(Math.abs(im))}i`;
}

export function SpinLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [theta, setTheta] = useState(90), [phi, setPhi] = useState(0);
  const [field, setField] = useState<SpinField>('z'), [measure, setMeasure] = useState<SpinAxis>('x');
  const [omega, setOmega] = useState(1), [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!active || !playing) return;
    let handle = 0, previous: number | undefined;
    const animate = (now: number) => {
      if (previous !== undefined) {
        const elapsed = Math.min(now - previous, 60) / 1000;
        setTime(current => {
          const next = current + elapsed * SPIN_TIME_MAX / 16;
          return Math.min(SPIN_TIME_MAX, next);
        });
      }
      previous = now; handle = requestAnimationFrame(animate);
    };
    handle = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(handle);
  }, [active, playing]);
  useEffect(() => { if (time >= SPIN_TIME_MAX) setPlaying(false); }, [time]);
  useEffect(() => {
    if (command?.lab !== 'spin') return;
    const preset = SPIN_PRESETS.find(p => p.id === command.preset);
    if (command.spinTheta !== undefined || preset) setTheta(command.spinTheta ?? preset!.theta);
    if (command.spinPhi !== undefined || preset) setPhi(command.spinPhi ?? preset!.phi);
    if (command.spinField) setField(command.spinField);
    if (command.spinMeasure) setMeasure(command.spinMeasure);
    if (command.spinOmega !== undefined) setOmega(command.spinOmega);
    setTime(command.time ?? 0); setPlaying(false);
  }, [command]);

  const initialTheta = theta * Math.PI / 180, initialPhi = phi * Math.PI / 180;
  const spinor = evolveSpin(initialTheta, initialPhi, field, omega * time), vector = blochVector(spinor);
  const plus = probabilityPlus(vector, measure), b = fieldVector(field), energy = omega / 2 * vector.reduce((sum, v, i) => sum + v * b[i], 0);
  const orbit = useMemo(() => Array.from({ length: 181 }, (_, j) => blochVector(evolveSpin(initialTheta, initialPhi, field, j * 2 * Math.PI / 180))), [initialTheta, initialPhi, field]);
  const probabilities = useMemo(() => {
    const plus = Array.from({ length: 401 }, (_, j) => {
      const t = j * SPIN_TIME_MAX / 400;
      return { x: t / (2 * Math.PI), y: probabilityPlus(blochVector(evolveSpin(initialTheta, initialPhi, field, omega * t)), measure) };
    });
    return [plus, plus.map(p => ({ x: p.x, y: 1 - p.y }))];
  }, [initialTheta, initialPhi, field, omega, measure]);
  const reset = () => { setTime(0); setPlaying(false); };

  return <section className="workspace spin-workspace" aria-labelledby="spin-title">
    <aside className="control-panel">
      <div><p className="eyebrow">07</p><h1 id="spin-title">Spin-1/2</h1><p className="lede">Deux résultats possibles, une infinité de superpositions. Préparez un spin, faites-le précesser et changez l’axe de mesure.</p></div>
      <div className="equation-card"><span>État initial dans la base de <Formula>{'$S_z$'}</Formula></span><Formula display>{String.raw`$\begin{aligned}|\psi(0)\rangle={}&\cos\frac{\theta_0}{2}|+z\rangle\\&+e^{i\varphi_0}\sin\frac{\theta_0}{2}|-z\rangle\end{aligned}$`}</Formula></div>
      <div className="control-stack">
        <div className="control-block"><p className="control-caption">Préparer un état propre</p><div className="spin-presets" role="group" aria-label="État initial du spin">{SPIN_PRESETS.map(p => {
          const selected = theta === p.theta && (theta === 0 || theta === 180 || phi % 360 === p.phi);
          return <Button key={p.id} variant="outline" className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => { setTheta(p.theta); setPhi(p.phi); reset(); }}><Formula>{p.label}</Formula></Button>;
        })}</div></div>
        <QuantumParameter id="spin-theta" label="Angle polaire initial" symbol={String.raw`$\theta_0\;(^{\circ})$`} value={theta} min={0} max={180} onChange={v => { setTheta(v); reset(); }} />
        <QuantumParameter id="spin-phi" label="Azimut initial" symbol={String.raw`$\varphi_0\;(^{\circ})$`} value={phi} min={0} max={360} onChange={v => { setPhi(v); reset(); }} />
        <div className="control-block"><p className="control-caption">Axe du champ <Formula>{String.raw`$\boldsymbol b$`}</Formula></p><div className="spin-fields" role="group" aria-label="Axe du champ">{fields.map(f => <Button key={f.id} variant="outline" className={field === f.id ? 'is-selected' : ''} aria-pressed={field === f.id} onClick={() => { setField(f.id); reset(); }}><Formula>{f.formula}</Formula></Button>)}</div></div>
        <QuantumParameter id="spin-omega" label="Fréquence relative" symbol={String.raw`$\Omega/\Omega_0$`} value={omega} min={.25} max={3} step={.05} onChange={v => { setOmega(v); reset(); }} />
      </div>
      <div className="equation-card"><span>Hamiltonien</span><Formula display>{String.raw`$\hat H=\frac{\hbar\Omega}{2}\,\boldsymbol b\cdot\boldsymbol\sigma$`}</Formula><p className="scale-note">Le signe de la précession est fixé par ce Hamiltonien ; <Formula>{String.raw`$|\boldsymbol b|=1$`}</Formula>.</p></div>
      <dl className="measurements spin-measurements">{axes.map((axis, i) => <div key={axis}><dt><Formula>{String.raw`$\langle S_${axis}\rangle/\hbar$`}</Formula></dt><dd>{fixed(vector[i] / 2)}</dd></div>)}</dl>
      <p className="scale-note">Chaque composante mesurée vaut <Formula>{String.raw`$+\hbar/2$`}</Formula> ou <Formula>{String.raw`$-\hbar/2$`}</Formula>. Sa valeur moyenne peut être intermédiaire.</p>
    </aside>

    <div className="figure-panel">
      <div className="figure-heading"><div><p className="eyebrow">Sphère de Bloch</p><h2><Formula>{String.raw`$\boldsymbol r(t)=\langle\boldsymbol\sigma\rangle$`}</Formula></h2></div><div className="plot-legend"><span><i className="legend-swatch spin-swatch" />état du spin</span><span><i className="legend-swatch dashed" />axe du champ</span></div></div>
      <div className="spin-visual"><BlochSphere vector={vector} field={field} orbit={orbit} /><div className="spin-state-card"><span>Spineur à cet instant</span><Formula display>{String.raw`$|\psi(t)\rangle=\begin{pmatrix}${complexLabel(spinor[0])}\\${complexLabel(spinor[1])}\end{pmatrix}$`}</Formula><p>Base <Formula>{String.raw`$\{|+z\rangle,|-z\rangle\}$`}</Formula></p><p className="scale-note">Le cercle indique la précession possible. La sphère représente l’état quantique, pas la position d’une particule.</p></div></div>
      <div className="scattering-timeline spin-clock"><div className="transport-controls">
        <Button onClick={() => { if (time >= SPIN_TIME_MAX) setTime(0); setPlaying(p => !p); }}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{playing ? 'Pause' : time >= SPIN_TIME_MAX ? 'Rejouer' : 'Animer'}</Button>
        <Button variant="outline" size="icon" aria-label="Revenir à l’état initial du spin" onClick={reset}><RotateCcw aria-hidden="true" /></Button>
      </div><div className="control-block"><div className="control-heading"><label htmlFor="spin-time">Temps <Formula>{'$t/T_0$'}</Formula></label><output>{(time / (2 * Math.PI)).toFixed(2)}</output></div>
        <Slider id="spin-time" min={0} max={SPIN_TIME_MAX} step={.005} value={[time]} onValueChange={v => { setTime(sliderValue(v, 0)); setPlaying(false); }} aria-label="Temps du spin en unités T zéro" />
        <div className="range-labels"><span>État initial</span><span><Formula>{'$2T_0$'}</Formula></span></div></div>
        <p className="scale-note"><Formula>{String.raw`$T_0=2\pi/\Omega_0$`}</Formula> ; période de précession <Formula>{String.raw`$T/T_0=${fixed(1 / omega)}$`}</Formula>. La fréquence modifie la vitesse du spin ; l’horloge conserve la même échelle.</p>
      </div>

      <section className="spin-readout" aria-labelledby="spin-measure-title"><div className="spin-measure-heading"><h3 id="spin-measure-title">Mesurer le spin selon</h3><div className="spin-measure-axis" role="group" aria-label="Axe de mesure">{axes.map(axis => <Button key={axis} variant="outline" className={measure === axis ? 'is-selected' : ''} aria-pressed={measure === axis} onClick={() => setMeasure(axis)}><Formula>{`$${axis}$`}</Formula></Button>)}</div></div>
        <dl className="probability-cards spin-probabilities"><div className="probability-card"><dt><Formula>{String.raw`$S_${measure}=+\hbar/2$`}</Formula></dt><dd>{(100 * plus).toFixed(1)} %</dd></div><div className="probability-card is-right"><dt><Formula>{String.raw`$S_${measure}=-\hbar/2$`}</Formula></dt><dd>{(100 * (1 - plus)).toFixed(1)} %</dd></div></dl>
        <div className="plot-legend"><span><i className="legend-swatch" />résultat +</span><span><i className="legend-swatch spin-minus-swatch" />résultat −</span></div>
        <div className="plot-shell spin-probability-plot"><ScientificPlot ariaLabel={`Probabilités des deux résultats d’une mesure selon ${measure}, de zéro à deux T zéro`} xDomain={[0, 2]} yDomain={[0, 1]} xLabel="$t/T_0$" yLabel="$P$" yTicks={[0, .25, .5, .75, 1]} series={[{ values: probabilities[0], tone: 'accent', width: 2.5 }, { values: probabilities[1], tone: 'teal', dashed: true, width: 2.5 }]} verticalLines={[{ value: time / (2 * Math.PI), tone: 'ink', dashed: true }]} /></div>
        <p className="scale-note">Probabilités prévues par la règle de Born, sans effectuer de mesure ni de réduction de l’état. Le trait vertical suit l’instant affiché ; l’échelle reste fixée de 0 à 1.</p>
      </section>

      <details className="theory-notes spin-energy"><summary>Les deux niveaux d’énergie</summary><div className="plot-shell"><ScientificPlot ariaLabel="Deux niveaux d’énergie du spin et son énergie moyenne" xDomain={[0, 1]} yDomain={[-1.7, 1.7]} xTicks={[]} yTicks={[-1.5, -.75, 0, .75, 1.5]} xLabel="" yLabel={String.raw`$E/(\hbar\Omega_0)$`} series={[]} horizontalLines={[{ value: omega / 2, label: '$E_+$', tone: 'ink', dashed: true }, { value: -omega / 2, label: '$E_-$', tone: 'ink', dashed: true }, { value: energy, tone: 'teal', dashed: false }]} /></div><p><Formula>{String.raw`$E_\pm=\pm\hbar\Omega/2$`}</Formula>. En vert : <Formula>{String.raw`$\langle E\rangle/(\hbar\Omega_0)=${fixed(energy)}$`}</Formula>, constante pendant l’évolution.</p></details>
      <div className="insight-row atomic-insight"><span className="insight-index"><Formula>{String.raw`$4\pi$`}</Formula></span><p>Après une rotation de <Formula>{String.raw`$2\pi$`}</Formula>, le vecteur de Bloch revient à sa position initiale, mais le spineur change de signe. Il faut <Formula>{String.raw`$4\pi$`}</Formula> pour retrouver le même spineur. Cette phase globale seule ne change aucune probabilité.</p></div>
      <details className="theory-notes"><summary>Repères théoriques</summary><div className="theory-grid">
        <div><span>Spin et matrices de Pauli</span><Formula display>{String.raw`$\begin{aligned}\hat{\boldsymbol S}&=\frac{\hbar}{2}\boldsymbol\sigma,\\\hat S^2&=\frac34\hbar^2\mathbb I.\end{aligned}$`}</Formula></div>
        <div><span>Probabilités de mesure</span><Formula display>{String.raw`$\begin{aligned}P_\pm^{(j)}&=\frac{1\pm r_j}{2},\\\langle S_j\rangle&=\frac{\hbar}{2}r_j.\end{aligned}$`}</Formula></div>
        <div><span>Évolution unitaire exacte</span><Formula display>{String.raw`$\begin{aligned}|\psi(t)\rangle&=U(t)|\psi(0)\rangle,\\U(t)&=\cos\frac{\Omega t}{2}\,\mathbb I\\&\quad-i\sin\frac{\Omega t}{2}\,\boldsymbol b\cdot\boldsymbol\sigma,\\\dot{\boldsymbol r}&=\Omega\,\boldsymbol b\times\boldsymbol r.\end{aligned}$`}</Formula></div>
      </div><p>Un état pur vérifie <Formula>{String.raw`$|\boldsymbol r|=1$`}</Formula>. La phase globale est conservée dans le spineur affiché. <a href="https://quantum.cloud.ibm.com/learning/en/courses/utility-scale-quantum-computing/bits-gates-and-circuits" target="_blank" rel="noreferrer">États à deux niveaux et sphère de Bloch · IBM Quantum</a>.</p></details>
    </div>
  </section>;
}
