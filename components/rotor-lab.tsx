'use client';

import { useEffect, useMemo, useState } from 'react';
import { AngularSurface, PhaseLegend } from '@/components/angular-surface';
import { Math as Formula } from '@/components/math';
import { QuantumParameter } from '@/components/quantum-parameter';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { type ExperimentCommand } from '@/components/lab-types';
import { ROTOR_L_MAX, angularDensity } from '@/lib/atomic';
import { ROTOR_PRESETS, polarSuperposition } from '@/lib/atomic-dynamics';
import { AtomicClock, useAtomicClock } from '@/components/atomic-clock';
import { EnergyLevels } from '@/components/energy-levels';
import { DisplayControls, PlaybackControls } from '@/components/playback-controls';
import { CompactStepper } from '@/components/compact-stepper';
import { ROTOR_RESOLUTION_DEFAULT, ROTOR_RESOLUTION_MIN, ROTOR_RESOLUTION_MAX, ROTOR_RESOLUTION_STEP } from '@/lib/rotor-resolution';
import { ROTOR_FIELD_MAX, solveRotorField, rotorFieldEigenstate, prepareRotorField, evolveRotorField, rotorMoments, rotorPolarDensity } from '@/lib/rotor-field';

const fixed = (value: number) => (Math.abs(value) < .0005 ? 0 : value).toFixed(3);

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
  const [resolution, setResolution] = useState(ROTOR_RESOLUTION_DEFAULT);
  const [fieldEnabled, setFieldEnabled] = useState(false);
  const [fieldStrength, setFieldStrength] = useState(2);
  const strength = fieldEnabled ? fieldStrength : 0;
  const perturbed = strength > 0;
  const restart = () => { setPhase(0); setPlaying(false); };
  const { l, m } = state;
  const spectrum = useMemo(() => solveRotorField(strength), [strength]);
  const initial = useMemo(() => evolving
    ? preset.terms.map(term => ({ l: term.l, m: term.m, re: 1 / Math.sqrt(preset.terms.length), im: 0 }))
    : rotorFieldEigenstate(spectrum, l, m), [spectrum, evolving, preset, l, m]);
  const prepared = useMemo(() => prepareRotorField(spectrum, initial), [spectrum, initial]);
  const wave = useMemo(() => evolving ? evolveRotorField(prepared, clock.phase) : initial, [evolving, prepared, clock.phase, initial]);
  const moments = useMemo(() => rotorMoments(wave, strength), [wave, strength]);
  const initialEnergy = useMemo(() => rotorMoments(initial, strength).energy, [initial, strength]);
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
    if (command.resolution !== undefined) setResolution(command.resolution);
  }, [command, setPhase, setPlaying]);
  const polar = useMemo(() => Array.from({ length: 361 }, (_, j) => {
    const theta = j * Math.PI / 360;
    return { x: theta, y: perturbed ? rotorPolarDensity(wave, theta) : evolving ? polarSuperposition(preset.terms, theta, clock.phase) : 2 * Math.PI * Math.sin(theta) * angularDensity(l, m, theta) };
  }), [l, m, evolving, preset, clock.phase, perturbed, wave]);
  const meanL2 = perturbed ? moments.angularMomentum2 : evolving ? preset.terms.reduce((sum, term) => sum + term.l * (term.l + 1), 0) / 2 : l * (l + 1);
  const meanM = perturbed ? moments.magnetic : evolving ? preset.terms.reduce((sum, term) => sum + term.m, 0) / 2 : m;
  const resolutionControl = <CompactStepper id="rotor-resolution" label="Résolution" value={resolution}
    min={ROTOR_RESOLUTION_MIN} max={ROTOR_RESOLUTION_MAX} step={ROTOR_RESOLUTION_STEP} onChange={setResolution}
    description={`Finesse du maillage 3D : de ${ROTOR_RESOLUTION_MIN} à ${ROTOR_RESOLUTION_MAX} subdivisions polaires, et deux fois plus autour de l’axe. Par défaut : ${ROTOR_RESOLUTION_DEFAULT}. Une résolution élevée demande plus de calcul pour l’affichage, sans changer l’état quantique.`} />;

  return <section className="workspace" aria-labelledby="rotor-title">
    <aside className="control-panel">
      <div><p className="eyebrow">05</p><h1 id="rotor-title">Rotateur rigide</h1><p className="lede">Une distance fixe, une orientation quantique. Reliez les harmoniques sphériques aux valeurs du moment cinétique.</p></div>
      <div className="mode-switch" role="group" aria-label="Mode du rotateur">
        <Button variant="ghost" className={!evolving ? 'is-selected' : ''} aria-pressed={!evolving} onClick={() => { setMode('stationary'); clock.setPlaying(false); }}>États propres</Button>
        <Button variant="ghost" className={evolving ? 'is-selected' : ''} aria-pressed={evolving} onClick={() => setMode('evolution')}>Évolution</Button>
      </div>
      <section className="well-perturbation" aria-labelledby="rotor-field-title">
        <div className="well-perturbation-heading">
          <label id="rotor-field-title" htmlFor="rotor-field-enabled">Champ orientant</label>
          <Switch id="rotor-field-enabled" checked={fieldEnabled} onCheckedChange={enabled => { setFieldEnabled(enabled); restart(); }} aria-describedby="rotor-field-help" />
        </div>
        <p id="rotor-field-help" className="scale-note">Perturbation optionnelle : favorise l’orientation vers l’axe <Formula>{'$+z$'}</Formula>.</p>
        {fieldEnabled ? <div className="control-stack">
          <div className="perturbation-equations"><Formula display>{String.raw`$V(\theta)=-\lambda B\cos\theta$`}</Formula><Formula display>{String.raw`$B=\frac{\hbar^2}{2I}$`}</Formula></div>
          <QuantumParameter id="rotor-lambda" label="Intensité" symbol={String.raw`$\lambda$`} value={fieldStrength} min={0} max={ROTOR_FIELD_MAX} step={.1} onChange={value => { setFieldStrength(value); restart(); }} />
        </div> : null}
      </section>
      <div className="equation-card"><span>Hamiltonien de rotation</span><Formula display>{perturbed ? String.raw`$H=\frac{L^2}{2I}-\lambda B\cos\theta$` : String.raw`$H=\frac{L^2}{2I}$`}</Formula></div>
      <div className="control-stack">
        {evolving ? <>
          <div className="preset-grid preset-grid-four">{ROTOR_PRESETS.map(item => <Button key={item.id} variant="outline" className={presetId === item.id ? 'is-selected' : ''} onClick={() => { setPresetId(item.id); clock.setPhase(0); clock.setPlaying(false); }}>{item.label}</Button>)}</div>
          <div className="equation-card"><span>État initial</span><Formula display>{preset.formula}</Formula></div>
          {perturbed ? <p className="scale-note">Superposition préparée dans la base du rotateur libre à <Formula>{'$t=0$'}</Formula>, puis évoluant dans le champ constant.</p> : null}
        </> : <>
        <QuantumParameter id="rotor-l" label={perturbed ? 'État issu du niveau' : 'Nombre angulaire'} symbol={perturbed ? String.raw`$\ell_0$` : String.raw`$\ell$`} value={l} min={0} max={ROTOR_L_MAX} onChange={next => setState(current => ({ l: next, m: Math.max(-next, Math.min(next, current.m)) }))} />
        <QuantumParameter id="rotor-m" label="Nombre magnétique" symbol="$m$" value={m} min={-l} max={l} onChange={m => setState(current => ({ ...current, m }))} />
        {perturbed ? <p className="scale-note"><Formula>{String.raw`$\ell_0$`}</Formula> repère le niveau d’origine sans champ. Sous champ, <Formula>{String.raw`$\ell$`}</Formula> n’est plus un nombre quantique exact ; <Formula>{'$m$'}</Formula> reste conservé.</p> : null}
        </>}
        <QuantumParameter id="rotor-inertia" label="Moment d’inertie relatif" symbol="$I/I_0$" value={inertia} min={.5} max={5} step={.1} onChange={setInertia} />
        <div className="display-switch" role="group" aria-label="Couleurs du rotateur">
          <Button variant="outline" className={!phaseColors ? 'is-selected' : ''} aria-pressed={!phaseColors} onClick={() => setPhaseColors(false)}>Densité de probabilité</Button>
          <Button variant="outline" className={phaseColors ? 'is-selected' : ''} aria-pressed={phaseColors} onClick={() => setPhaseColors(true)}>Phase</Button>
        </div>
      </div>
      <dl className="measurements">
        <div><dt>{evolving ? 'Énergie moyenne' : 'Énergie'}</dt><dd><Formula>{String.raw`$${evolving ? String.raw`\langle E\rangle` : perturbed ? String.raw`E_{\ell_0,m}` : String.raw`E_\ell`}/E_\star=${((perturbed ? initialEnergy : meanL2) / inertia).toFixed(2)}$`}</Formula></dd></div>
        <div><dt>Moment total{evolving || perturbed ? ' moyen' : ''}</dt><dd><Formula>{String.raw`$${evolving || perturbed ? String.raw`\langle L^2\rangle` : 'L^2'}=${fixed(meanL2)}\,\hbar^2$`}</Formula></dd></div>
        <div><dt>Projection{evolving ? ' moyenne' : ''}</dt><dd><Formula>{String.raw`$${evolving ? String.raw`\langle L_z\rangle` : 'L_z'}=${fixed(meanM)}\,\hbar$`}</Formula></dd></div>
        {perturbed ? <div><dt>Orientation moyenne</dt><dd><Formula>{String.raw`$\langle\cos\theta\rangle=${fixed(moments.orientation)}$`}</Formula></dd></div> : !evolving ? <div><dt>Dégénérescence</dt><dd><Formula>{String.raw`$2\ell+1=${2 * l + 1}$`}</Formula></dd></div> : null}
      </dl>
      <p className="scale-note"><Formula>{String.raw`$E_\star=\hbar^2/(2I_0)$`}</Formula> fixe l’unité d’énergie. Sans champ extérieur, tous les états de même <Formula>{String.raw`$\ell$`}</Formula> ont la même énergie.</p>
    </aside>
    <div className="figure-panel">
      <div className="figure-heading"><div><p className="eyebrow">{evolving ? 'Dynamique d’orientation' : 'Probabilité d’orientation'}</p><h2><Formula>{evolving
        ? String.raw`$\left\lvert\,\psi(\theta,\,\varphi,\,t)\,\right\rvert^{2}$`
        : perturbed ? String.raw`$\left\lvert\,\Phi_{${l},${m}}\,(\theta,\,\varphi)\,\right\rvert^{2}$`
          : String.raw`$\left\lvert\,Y_{${l}}^{${m}}\,(\theta,\,\varphi)\,\right\rvert^{2}$`}</Formula></h2></div><span className="figure-tag">Surface angulaire · 3D</span></div>
      <AngularSurface l={l} m={m} active={active} phaseColors={phaseColors} resolution={resolution} evolutionTerms={evolving ? preset.terms : undefined} phase={evolving ? clock.phase : 0}
        waveBasis={perturbed ? prepared.basis : undefined} waveCoefficients={perturbed ? wave : undefined} coefficientBounds={perturbed ? prepared.bounds : undefined} />
      {evolving ? perturbed ? <PlaybackControls id="rotor" clock={clock} displayControl={resolutionControl} timeUnit={2 * Math.PI} timeSymbol="$t/T_0$" finalSymbol="$t_f/T_0$"
        note={<><Formula>{String.raw`$T_0=\pi\hbar/B=${(Math.PI * inertia).toFixed(3)}\,\hbar/E_\star$`}</Formula> est la période de référence sans champ. Sous champ, plusieurs fréquences interviennent : l’évolution n’est généralement plus périodique. À vitesse ×1, une durée <Formula>{'$T_0$'}</Formula> prend 12 secondes à l’écran.</>} />
        : <AtomicClock id="rotor" clock={clock} displayControl={resolutionControl} period={String.raw`$T=2\pi\hbar/\Delta E=${(Math.PI * inertia).toFixed(3)}\,\hbar/E_\star$`} />
        : <DisplayControls id="rotor" stationary displayControl={resolutionControl} />}
      {phaseColors ? <PhaseLegend /> : null}
      <p className="scale-note">La résolution règle la finesse du maillage 3D, sans modifier les probabilités ni le zoom. Le rayon dessiné est proportionnel à la densité angulaire, avec une référence fixe pendant l’animation. Cette surface représente une probabilité d’orientation, pas une trajectoire ni une distance variable. « Tourner la vue » agit uniquement sur la caméra.</p>
      <div className="insight-row atomic-insight"><span className="insight-index"><Formula>{perturbed ? String.raw`$\lambda$` : String.raw`$\ell$`}</Formula></span><p>{perturbed ? evolving ? 'Le champ couple les harmoniques sphériques de même m. Les populations des états propres du Hamiltonien restent constantes, tandis que l’orientation et le moment total moyen peuvent varier.' : 'Le champ brise la symétrie entre les deux pôles. Les états propres mélangent plusieurs valeurs de ℓ, tout en gardant une projection m bien définie.' : evolving ? preset.description : l === 0 ? 'L’état fondamental est isotrope : aucune direction n’est privilégiée.' : <>Les états <Formula>{'$m$'}</Formula> et <Formula>{'$-m$'}</Formula> ont la même densité, mais des projections opposées du moment cinétique. Leur phase est différente.</>}</p></div>
      <details className="theory-notes atomic-profile" open>
        <summary>Distribution de l’angle polaire</summary>
        <div className="plot-shell"><ScientificPlot ariaLabel={evolving ? 'Distribution polaire de la superposition' : `Distribution de theta pour ${perturbed ? 'ell initial' : 'ell'} ${l}, m ${m}`} xDomain={[0, Math.PI]} yDomain={[0, perturbed ? 4 : 2]}
          xLabel={String.raw`$\theta\;\text{(rad)}$`} yLabel={String.raw`$p(\theta)$`} xTicks={[0, Math.PI / 2, Math.PI]}
          series={[{ values: polar, tone: 'accent', fillTo: 0, fillOpacity: .24 }]} /></div>
        <p><Formula>{String.raw`$p(\theta,t)=\sin\theta\int_0^{2\pi}|\psi(\theta,\varphi,t)|^2\,d\varphi$`}</Formula>. L’aire sous la courbe vaut 1. La résolution du maillage 3D ne modifie pas cette distribution. L’échelle verticale est commune aux états de chaque régime, avec ou sans champ.</p>
      </details>
      {perturbed ? prepared.sectors.map(({ m: sectorM, block, projected }) => <div key={sectorM}>
        <p className="scale-note">Secteur <Formula>{`$m=${sectorM}$`}</Formula> · niveaux issus de <Formula>{String.raw`$\ell_0=|m|,\ldots,5$`}</Formula>.</p>
        <EnergyLevels energies={block.energies.slice(0, 6 - Math.abs(sectorM)).map(energy => energy / inertia)}
          selected={evolving ? projected.flatMap((c, i) => c.re ** 2 + c.im ** 2 > 1e-4 ? [i] : []) : l - Math.abs(m)} firstIndex={Math.abs(sectorM)} indexSymbol={String.raw`\ell_0`} unit={String.raw`$E/E_\star$`} label={`Spectre du rotateur sous champ, m égal à ${sectorM}`} />
        {evolving ? <p className="scale-note">Parmi les niveaux montrés, le vert signale une population supérieure à 0.01 %. Le calcul inclut les niveaux supérieurs.</p> : null}
      </div>) : <EnergyLevels energies={Array.from({ length: ROTOR_L_MAX + 1 }, (_, ell) => ell * (ell + 1) / inertia)} selected={evolving ? [0, 1] : l} indexSymbol={String.raw`\ell`} unit={String.raw`$E/E_\star$`} label="Spectre du rotateur rigide" />}
      <details className="theory-notes"><summary>Repères théoriques</summary><div className="theory-grid">
        <div><span>{perturbed ? 'Base du rotateur libre' : 'États propres'}</span><Formula display>{String.raw`$\begin{aligned}L^2Y_\ell^m&=\hbar^2\ell(\ell+1)Y_\ell^m,\\L_zY_\ell^m&=m\hbar Y_\ell^m.\end{aligned}$`}</Formula></div>
        <div><span>{perturbed ? 'États propres sous champ' : 'Niveaux de rotation'}</span><Formula display>{perturbed ? String.raw`$\Phi_{\ell_0,m}=\sum_{\ell=|m|}^{\infty}c_\ell Y_\ell^m$` : String.raw`$\begin{aligned}E_\ell&=\frac{\hbar^2}{2I}\ell(\ell+1),\\m&=-\ell,\ldots,\ell.\end{aligned}$`}</Formula></div>
        <div><span>Harmoniques sphériques normalisées</span><Formula display>{String.raw`$\begin{aligned}Y_\ell^m\,(\theta,\,\varphi)&=N_{\ell m}\,P_\ell^m\,(\cos\theta)\,e^{im\varphi},\\N_{\ell m}&=\sqrt{\frac{2\ell+1}{4\pi}\frac{(\ell-m)!}{(\ell+m)!}}.\end{aligned}$`}</Formula></div>
      </div>{perturbed ? <>
        <Formula display>{String.raw`$\langle\ell,m|\cos\theta|\ell+1,m\rangle=\sqrt{\frac{(\ell+1)^2-m^2}{(2\ell+1)(2\ell+3)}}$`}</Formula>
        <p>Le couplage relie uniquement <Formula>{String.raw`$\Delta\ell=\pm1$`}</Formula> à <Formula>{String.raw`$\Delta m=0$`}</Formula>. Les secteurs <Formula>{'$m$'}</Formula> et <Formula>{'$-m$'}</Formula> ont les mêmes énergies, mais la dégénérescence entre toutes les projections est levée. Le Hamiltonien est diagonalisé dans la base des harmoniques sphériques jusqu’à <Formula>{String.raw`$\ell=24$`}</Formula>.</p>
        <Formula display>{String.raw`$\psi(t)=\sum_j a_j e^{-iE_jt/\hbar}\Phi_j$`}</Formula>
      </> : null}<p>Convention de Condon–Shortley. La densité d’un état propre reste stationnaire ; sa phase globale évolue comme <Formula>{String.raw`$e^{-iEt/\hbar}$`}</Formula>. Une phase globale commune est omise ; en superposition, les couleurs suivent les phases relatives.</p></details>
    </div>
  </section>;
}
