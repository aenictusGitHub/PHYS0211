'use client';

import { useEffect, useMemo, useState } from 'react';
import { AngularSurface, PhaseLegend } from '@/components/angular-surface';
import { Math as Formula } from '@/components/math';
import { QuantumParameter } from '@/components/quantum-parameter';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { type ExperimentCommand } from '@/components/lab-types';
import { ROTOR_L_MAX, angularDensity } from '@/lib/atomic';

export function RotorLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [state, setState] = useState({ l: 1, m: 0 });
  const [inertia, setInertia] = useState(1);
  const [phaseColors, setPhaseColors] = useState(false);
  const { l, m } = state;
  useEffect(() => {
    if (command?.lab !== 'rotor') return;
    setState(current => {
      const l = command.angular ?? current.l;
      return { l, m: Math.max(-l, Math.min(l, command.magnetic ?? current.m)) };
    });
    if (command.inertia !== undefined) setInertia(command.inertia);
  }, [command]);
  const polar = useMemo(() => Array.from({ length: 361 }, (_, j) => {
    const theta = j * Math.PI / 360;
    return { x: theta, y: 2 * Math.PI * Math.sin(theta) * angularDensity(l, m, theta) };
  }), [l, m]);
  const maximum = Math.max(...polar.map(point => point.y)) * 1.1;

  return <section className="workspace" aria-labelledby="rotor-title">
    <aside className="control-panel">
      <div><p className="eyebrow">05</p><h1 id="rotor-title">Rotateur rigide</h1><p className="lede">Une distance fixe, une orientation quantique. Reliez les harmoniques sphériques aux valeurs du moment cinétique.</p></div>
      <div className="equation-card"><span>Hamiltonien de rotation</span><Formula display>{String.raw`$\hat H=\frac{\hat L^2}{2I}$`}</Formula></div>
      <div className="control-stack">
        <QuantumParameter id="rotor-l" label="Nombre angulaire" symbol={String.raw`$\ell$`} value={l} min={0} max={ROTOR_L_MAX} onChange={next => setState(current => ({ l: next, m: Math.max(-next, Math.min(next, current.m)) }))} />
        <QuantumParameter id="rotor-m" label="Nombre magnétique" symbol="$m$" value={m} min={-l} max={l} onChange={m => setState(current => ({ ...current, m }))} />
        <QuantumParameter id="rotor-inertia" label="Moment d’inertie relatif" symbol="$I/I_0$" value={inertia} min={.5} max={5} step={.1} onChange={setInertia} />
        <div className="display-switch" role="group" aria-label="Couleurs du rotateur">
          <Button variant="outline" className={!phaseColors ? 'is-selected' : ''} aria-pressed={!phaseColors} onClick={() => setPhaseColors(false)}>Densité de probabilité</Button>
          <Button variant="outline" className={phaseColors ? 'is-selected' : ''} aria-pressed={phaseColors} onClick={() => setPhaseColors(true)}>Phase</Button>
        </div>
      </div>
      <dl className="measurements">
        <div><dt>Énergie</dt><dd><Formula>{String.raw`$E_\ell/E_\star=${(l * (l + 1) / inertia).toFixed(2).replace('.', '{,}')}$`}</Formula></dd></div>
        <div><dt>Moment total</dt><dd><Formula>{String.raw`$L^2=${l * (l + 1)}\,\hbar^2$`}</Formula></dd></div>
        <div><dt>Projection</dt><dd><Formula>{String.raw`$L_z=${m}\,\hbar$`}</Formula></dd></div>
        <div><dt>Dégénérescence</dt><dd><Formula>{String.raw`$2\ell+1=${2 * l + 1}$`}</Formula></dd></div>
      </dl>
      <p className="scale-note"><Formula>{String.raw`$E_\star=\hbar^2/(2I_0)$`}</Formula> fixe l’unité d’énergie. Sans champ extérieur, tous les états de même <Formula>{String.raw`$\ell$`}</Formula> ont la même énergie.</p>
    </aside>
    <div className="figure-panel">
      <div className="figure-heading"><div><p className="eyebrow">Probabilité d’orientation</p><h2><Formula>{String.raw`$|Y_{${l}}^{${m}}(\theta,\varphi)|^2$`}</Formula></h2></div><span className="figure-tag">Surface angulaire · 3D</span></div>
      <AngularSurface l={l} m={m} active={active} phaseColors={phaseColors} />
      {phaseColors ? <PhaseLegend /> : null}
      <p className="scale-note">Le rayon dessiné est proportionnel à <Formula>{String.raw`$|Y_\ell^m|^2$`}</Formula>, ramené à un maximum de 1. Cette surface représente une probabilité d’orientation, pas une trajectoire ni une distance variable. Tourner la vue ne fait pas évoluer l’état.</p>
      <div className="insight-row atomic-insight"><span className="insight-index"><Formula>{String.raw`$\ell$`}</Formula></span><p>{l === 0 ? 'L’état fondamental est isotrope : aucune direction n’est privilégiée.' : <>Les états <Formula>{'$m$'}</Formula> et <Formula>{'$-m$'}</Formula> ont la même densité, mais des projections opposées du moment cinétique. Leur phase est différente.</>}</p></div>
      <details className="theory-notes atomic-profile" open>
        <summary>Distribution de l’angle polaire</summary>
        <div className="plot-shell"><ScientificPlot ariaLabel={`Distribution de theta pour ell ${l}, m ${m}`} xDomain={[0, Math.PI]} yDomain={[0, maximum]}
          xLabel={String.raw`$\theta\;\text{(rad)}$`} yLabel={String.raw`$p(\theta)$`} xTicks={[0, Math.PI / 2, Math.PI]}
          series={[{ values: polar, tone: 'accent', fillTo: 0, fillOpacity: .24 }]} /></div>
        <p><Formula>{String.raw`$p(\theta)=2\pi\sin\theta\,|Y_\ell^m(\theta,0)|^2$`}</Formula>. Le facteur <Formula>{String.raw`$\sin\theta$`}</Formula> vient de l’élément d’angle solide ; l’aire sous la courbe vaut 1.</p>
      </details>
      <details className="theory-notes"><summary>Repères théoriques</summary><div className="theory-grid">
        <div><span>États propres</span><Formula display>{String.raw`$\begin{aligned}\hat L^2Y_\ell^m&=\hbar^2\ell(\ell+1)Y_\ell^m,\\\hat L_zY_\ell^m&=m\hbar Y_\ell^m.\end{aligned}$`}</Formula></div>
        <div><span>Niveaux de rotation</span><Formula display>{String.raw`$\begin{aligned}E_\ell&=\frac{\hbar^2}{2I}\ell(\ell+1),\\m&=-\ell,\ldots,\ell.\end{aligned}$`}</Formula></div>
        <div><span>Harmoniques sphériques normalisées</span><Formula display>{String.raw`$\begin{aligned}Y_\ell^m(\theta,\varphi)&=N_{\ell m}P_\ell^m(\cos\theta)e^{im\varphi},\\N_{\ell m}&=\sqrt{\frac{2\ell+1}{4\pi}\frac{(\ell-m)!}{(\ell+m)!}}.\end{aligned}$`}</Formula></div>
      </div><p>Convention de Condon–Shortley. La densité d’un état propre reste stationnaire ; sa phase globale évolue comme <Formula>{String.raw`$e^{-iE_\ell t/\hbar}$`}</Formula>. Les couleurs de phase sont données au temps initial. <a href="https://dlmf.nist.gov/14.30" target="_blank" rel="noreferrer">Harmoniques sphériques · NIST DLMF</a>.</p></details>
    </div>
  </section>;
}
