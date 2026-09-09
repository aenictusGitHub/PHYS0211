'use client';

import { useEffect, useMemo, useState } from 'react';
import { AngularSurface, PhaseLegend } from '@/components/angular-surface';
import { Math as Formula } from '@/components/math';
import { QuantumParameter } from '@/components/quantum-parameter';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { type ExperimentCommand } from '@/components/lab-types';
import { ROTOR_L_MAX, angularDensity } from '@/lib/atomic';
import { ROTOR_PRESETS, polarSuperposition } from '@/lib/atomic-dynamics';
import { AtomicClock, useAtomicClock } from '@/components/atomic-clock';
import { EnergyLevels } from '@/components/energy-levels';
import { DisplayControls } from '@/components/playback-controls';

export function RotorLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [state, setState] = useState({ l: 1, m: 0 });
  const [mode, setMode] = useState<'stationary' | 'evolution'>('stationary');
  const [presetId, setPresetId] = useState(ROTOR_PRESETS[0].id);
  const clock = useAtomicClock(active, mode === 'evolution', command?.lab === 'rotor' ? command : null);
  const { setPhase, setPlaying } = clock;
  const preset = ROTOR_PRESETS.find(item => item.id === presetId) ?? ROTOR_PRESETS[0];
  const evolving = mode === 'evolution';
  const [inertia, setInertia] = useState(1);
  const [phaseColors, setPhaseColors] = useState(false);
  const [scale, setScale] = useState(1);
  const { l, m } = state;
  useEffect(() => {
    if (command?.lab !== 'rotor') return;
    if (command.mode) setMode(command.mode);
    if (command.preset) setPresetId(command.preset);
    setPhase(command.time ?? 0); setPlaying(false);
    setState(current => {
      const l = command.angular ?? current.l;
      return { l, m: Math.max(-l, Math.min(l, command.magnetic ?? current.m)) };
    });
    if (command.inertia !== undefined) setInertia(command.inertia);
    if (command.scale !== undefined) setScale(command.scale);
  }, [command, setPhase, setPlaying]);
  const polar = useMemo(() => Array.from({ length: 361 }, (_, j) => {
    const theta = j * Math.PI / 360;
    return { x: theta, y: evolving ? polarSuperposition(preset.terms, theta, clock.phase) : 2 * Math.PI * Math.sin(theta) * angularDensity(l, m, theta) };
  }), [l, m, evolving, preset, clock.phase]);
  const meanL2 = evolving ? preset.terms.reduce((sum, term) => sum + term.l * (term.l + 1), 0) / 2 : l * (l + 1);
  const meanM = evolving ? preset.terms.reduce((sum, term) => sum + term.m, 0) / 2 : m;

  return <section className="workspace" aria-labelledby="rotor-title">
    <aside className="control-panel">
      <div><p className="eyebrow">05</p><h1 id="rotor-title">Rotateur rigide</h1><p className="lede">Une distance fixe, une orientation quantique. Reliez les harmoniques sphériques aux valeurs du moment cinétique.</p></div>
      <div className="mode-switch" role="group" aria-label="Mode du rotateur">
        <Button variant="ghost" className={!evolving ? 'is-selected' : ''} aria-pressed={!evolving} onClick={() => { setMode('stationary'); clock.setPlaying(false); }}>États propres</Button>
        <Button variant="ghost" className={evolving ? 'is-selected' : ''} aria-pressed={evolving} onClick={() => setMode('evolution')}>Évolution</Button>
      </div>
      <div className="equation-card"><span>Hamiltonien de rotation</span><Formula display>{String.raw`$\hat H=\frac{\hat L^2}{2I}$`}</Formula></div>
      <div className="control-stack">
        {evolving ? <>
          <div className="preset-grid preset-grid-four">{ROTOR_PRESETS.map(item => <Button key={item.id} variant="outline" className={presetId === item.id ? 'is-selected' : ''} onClick={() => { setPresetId(item.id); clock.setPhase(0); clock.setPlaying(false); }}>{item.label}</Button>)}</div>
          <div className="equation-card"><span>État initial</span><Formula display>{preset.formula}</Formula></div>
        </> : <>
        <QuantumParameter id="rotor-l" label="Nombre angulaire" symbol={String.raw`$\ell$`} value={l} min={0} max={ROTOR_L_MAX} onChange={next => setState(current => ({ l: next, m: Math.max(-next, Math.min(next, current.m)) }))} />
        <QuantumParameter id="rotor-m" label="Nombre magnétique" symbol="$m$" value={m} min={-l} max={l} onChange={m => setState(current => ({ ...current, m }))} />
        </>}
        <QuantumParameter id="rotor-inertia" label="Moment d’inertie relatif" symbol="$I/I_0$" value={inertia} min={.5} max={5} step={.1} onChange={setInertia} />
        <div className="display-switch" role="group" aria-label="Couleurs du rotateur">
          <Button variant="outline" className={!phaseColors ? 'is-selected' : ''} aria-pressed={!phaseColors} onClick={() => setPhaseColors(false)}>Densité de probabilité</Button>
          <Button variant="outline" className={phaseColors ? 'is-selected' : ''} aria-pressed={phaseColors} onClick={() => setPhaseColors(true)}>Phase</Button>
        </div>
      </div>
      <dl className="measurements">
        <div><dt>{evolving ? 'Énergie moyenne' : 'Énergie'}</dt><dd><Formula>{String.raw`$${evolving ? String.raw`\langle E\rangle` : String.raw`E_\ell`}/E_\star=${(meanL2 / inertia).toFixed(2)}$`}</Formula></dd></div>
        <div><dt>Moment total{evolving ? ' moyen' : ''}</dt><dd><Formula>{String.raw`$${evolving ? String.raw`\langle L^2\rangle` : 'L^2'}=${meanL2}\,\hbar^2$`}</Formula></dd></div>
        <div><dt>Projection{evolving ? ' moyenne' : ''}</dt><dd><Formula>{String.raw`$${evolving ? String.raw`\langle L_z\rangle` : 'L_z'}=${meanM.toLocaleString('en-US', { useGrouping: false })}\,\hbar$`}</Formula></dd></div>
        {!evolving ? <div><dt>Dégénérescence</dt><dd><Formula>{String.raw`$2\ell+1=${2 * l + 1}$`}</Formula></dd></div> : null}
      </dl>
      <p className="scale-note"><Formula>{String.raw`$E_\star=\hbar^2/(2I_0)$`}</Formula> fixe l’unité d’énergie. Sans champ extérieur, tous les états de même <Formula>{String.raw`$\ell$`}</Formula> ont la même énergie.</p>
    </aside>
    <div className="figure-panel">
      <div className="figure-heading"><div><p className="eyebrow">{evolving ? 'Dynamique d’orientation' : 'Probabilité d’orientation'}</p><h2><Formula>{evolving ? String.raw`$|\psi(\theta,\varphi,t)|^2$` : String.raw`$|Y_{${l}}^{${m}}(\theta,\varphi)|^2$`}</Formula></h2></div><span className="figure-tag">Surface angulaire · 3D</span></div>
      <AngularSurface l={l} m={m} active={active} phaseColors={phaseColors} evolutionTerms={evolving ? preset.terms : undefined} phase={evolving ? clock.phase : 0} />
      {evolving ? <AtomicClock id="rotor" clock={clock} scale={scale} onScaleChange={setScale} scaleDescription="Le facteur s multiplie la distribution polaire affichée ; la surface d’orientation et l’état restent inchangés." period={String.raw`$T=2\pi\hbar/\Delta E=${(Math.PI * inertia).toFixed(3)}\,\hbar/E_\star$`} />
        : <DisplayControls id="rotor" stationary scale={scale} onScaleChange={setScale} />}
      {phaseColors ? <PhaseLegend /> : null}
      <p className="scale-note">Le rayon dessiné est proportionnel à la densité angulaire, avec une référence fixe pendant l’animation. Cette surface représente une probabilité d’orientation, pas une trajectoire ni une distance variable. « Tourner la vue » agit uniquement sur la caméra.</p>
      <div className="insight-row atomic-insight"><span className="insight-index"><Formula>{String.raw`$\ell$`}</Formula></span><p>{evolving ? preset.description : l === 0 ? 'L’état fondamental est isotrope : aucune direction n’est privilégiée.' : <>Les états <Formula>{'$m$'}</Formula> et <Formula>{'$-m$'}</Formula> ont la même densité, mais des projections opposées du moment cinétique. Leur phase est différente.</>}</p></div>
      <details className="theory-notes atomic-profile" open>
        <summary>Distribution de l’angle polaire</summary>
        <div className="plot-shell"><ScientificPlot ariaLabel={evolving ? 'Distribution polaire de la superposition' : `Distribution de theta pour ell ${l}, m ${m}`} xDomain={[0, Math.PI]} yDomain={[0, Math.max(2, 2 * scale)]}
          xLabel={String.raw`$\theta\;\text{(rad)}$`} yLabel={String.raw`$s\,p(\theta)$`} xTicks={[0, Math.PI / 2, Math.PI]}
          series={[{ values: polar.map(point => ({ x: point.x, y: scale * point.y })), tone: 'accent', fillTo: 0, fillOpacity: .24 }]} /></div>
        <p><Formula>{String.raw`$p(\theta,t)=\sin\theta\int_0^{2\pi}|\psi(\theta,\varphi,t)|^2\,d\varphi$`}</Formula>. La distribution physique a une aire de 1 ; la courbe affichée a une aire de <Formula>$s$</Formula>. Le facteur ne modifie pas la surface 3D. L’échelle verticale est commune à tous les états à <Formula>$s$</Formula> fixé.</p>
      </details>
      <EnergyLevels energies={Array.from({ length: ROTOR_L_MAX + 1 }, (_, ell) => ell * (ell + 1) / inertia)} selected={evolving ? [0, 1] : l} indexSymbol={String.raw`\ell`} unit={String.raw`$E/E_\star$`} label="Spectre du rotateur rigide" />
      <details className="theory-notes"><summary>Repères théoriques</summary><div className="theory-grid">
        <div><span>États propres</span><Formula display>{String.raw`$\begin{aligned}\hat L^2Y_\ell^m&=\hbar^2\ell(\ell+1)Y_\ell^m,\\\hat L_zY_\ell^m&=m\hbar Y_\ell^m.\end{aligned}$`}</Formula></div>
        <div><span>Niveaux de rotation</span><Formula display>{String.raw`$\begin{aligned}E_\ell&=\frac{\hbar^2}{2I}\ell(\ell+1),\\m&=-\ell,\ldots,\ell.\end{aligned}$`}</Formula></div>
        <div><span>Harmoniques sphériques normalisées</span><Formula display>{String.raw`$\begin{aligned}Y_\ell^m(\theta,\varphi)&=N_{\ell m}P_\ell^m(\cos\theta)e^{im\varphi},\\N_{\ell m}&=\sqrt{\frac{2\ell+1}{4\pi}\frac{(\ell-m)!}{(\ell+m)!}}.\end{aligned}$`}</Formula></div>
      </div><p>Convention de Condon–Shortley. La densité d’un état propre reste stationnaire ; sa phase globale évolue comme <Formula>{String.raw`$e^{-iE_\ell t/\hbar}$`}</Formula>. Cette phase globale est omise ; en superposition, les couleurs suivent la phase relative.</p></details>
    </div>
  </section>;
}
