'use client';

import { useEffect, useMemo, useState } from 'react';
import { Math as Formula } from '@/components/math';
import { QuantumParameter } from '@/components/quantum-parameter';
import { HydrogenSlice } from '@/components/hydrogen-slice';
import { PhaseLegend } from '@/components/angular-surface';
import { ScientificPlot } from '@/components/scientific-plot';
import { Button } from '@/components/ui/button';
import { type ExperimentCommand } from '@/components/lab-types';
import { HYDROGEN_PRESETS, radialSuperposition } from '@/lib/atomic-dynamics';
import { AtomicClock, useAtomicClock } from '@/components/atomic-clock';
import { EnergyLevels } from '@/components/energy-levels';
import { HYDROGEN_N_MAX, RYDBERG_N_MIN, RYDBERG_N_MAX, hydrogenEnergy, radialDistribution, radialMean, radialExtent, type AtomicState, type HarmonicBasis, type OrbitalPlane } from '@/lib/atomic';

const PRESETS = [
  { label: '$1s$', n: 1, l: 0, m: 0 }, { label: '$2s$', n: 2, l: 0, m: 0 },
  { label: '$2p_z$', n: 2, l: 1, m: 0 }, { label: '$2p_x$', n: 2, l: 1, m: 1 },
  { label: '$3d_{z^2}$', n: 3, l: 2, m: 0 },
];

export function HydrogenLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [state, setState] = useState<AtomicState>({ n: 1, l: 0, m: 0 });
  const [mode, setMode] = useState<'stationary' | 'evolution'>('stationary');
  const [presetId, setPresetId] = useState(HYDROGEN_PRESETS[0].id);
  const clock = useAtomicClock(active, mode === 'evolution');
  const { setPhase, setPlaying } = clock;
  const preset = HYDROGEN_PRESETS.find(item => item.id === presetId) ?? HYDROGEN_PRESETS[0];
  const evolving = mode === 'evolution';
  const [basis, setBasis] = useState<HarmonicBasis>('complex');
  const [view, setView] = useState<'slice' | 'radial'>('slice');
  const [plane, setPlane] = useState<OrbitalPlane>('xz');
  const [phaseColors, setPhaseColors] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [radialScale, setRadialScale] = useState(1);
  const { n, l, m } = state;
  const largestN = evolving ? Math.max(...preset.terms.map(term => term.n)) : n;
  const rydberg = largestN >= RYDBERG_N_MIN;
  const firstLevel = rydberg ? RYDBERG_N_MIN : 1;
  const lastLevel = rydberg ? RYDBERG_N_MAX : HYDROGEN_N_MAX;
  const extent = Math.round(3 * largestN * largestN / zoom * 10) / 10;
  const radialMax = radialExtent(largestN);
  const radial = useMemo(() => Array.from({ length: 801 }, (_, j) => {
    const r = radialMax * j / 800;
    return { x: r, y: evolving ? radialSuperposition(preset.terms, r, clock.phase) : radialDistribution(n, l, r) };
  }), [n, l, radialMax, evolving, preset, clock.phase]);
  const mean = evolving ? radial.reduce((sum, point, i) => i === 0 ? sum : sum + (point.x * point.y + radial[i - 1].x * radial[i - 1].y) / 2 * (point.x - radial[i - 1].x), 0) : radialMean(n, l);
  const energy = evolving ? preset.terms.reduce((sum, term) => sum + hydrogenEnergy(term.n), 0) / 2 : hydrogenEnergy(n);
  const periodFs = 2 * Math.PI * .6582119569 / Math.abs(hydrogenEnergy(preset.terms[1].n) - hydrogenEnergy(preset.terms[0].n));
  const capturedProbability = radial.reduce((sum, point, i) => i === 0 ? sum : sum + (point.y + radial[i - 1].y) / 2 * (point.x - radial[i - 1].x), 0);

  useEffect(() => {
    if (command?.lab !== 'hydrogen') return;
    if (command.mode) setMode(command.mode);
    if (command.preset) setPresetId(command.preset);
    setPhase(command.time ?? 0); setPlaying(false);
    if ((command.principal ?? 1) >= RYDBERG_N_MIN || command.preset === 'hydrogen-rydberg') { setZoom(1.5); setRadialScale(20); setPlane('xy'); }
    else setRadialScale(1);
    setState(current => {
      const n = command.principal ?? current.n;
      const l = Math.min(n - 1, command.angular ?? current.l);
      return { n, l, m: Math.max(-l, Math.min(l, command.magnetic ?? current.m)) };
    });
    if (command.basis) setBasis(command.basis);
    if (command.atomicView) setView(command.atomicView);
    if (command.plane) setPlane(command.plane);
  }, [command, setPhase, setPlaying]);

  return <section className="workspace" aria-labelledby="hydrogen-title">
    <aside className="control-panel">
      <div><p className="eyebrow">06</p><h1 id="hydrogen-title">Atome d’hydrogène</h1><p className="lede">Explorez les orbitales du potentiel coulombien : leur forme, leurs nœuds et la distance de l’électron au noyau.</p></div>
      <div className="mode-switch" role="group" aria-label="Mode de l’hydrogène">
        <Button variant="ghost" className={!evolving ? 'is-selected' : ''} aria-pressed={!evolving} onClick={() => { setMode('stationary'); clock.setPlaying(false); }}>États propres</Button>
        <Button variant="ghost" className={evolving ? 'is-selected' : ''} aria-pressed={evolving} onClick={() => setMode('evolution')}>Évolution</Button>
      </div>
      <div className="equation-card"><span>{evolving ? 'État initial' : 'Séparation radiale et angulaire'}</span><Formula display>{evolving ? preset.formula : basis === 'complex'
        ? String.raw`$\begin{aligned}\psi_{n\ell m}&=R_{n\ell}(r)\\&\quad\times Y_\ell^m(\theta,\varphi).\end{aligned}$`
        : String.raw`$\begin{aligned}\psi^{\mathrm{réel}}_{n\ell m}&=R_{n\ell}(r)\\&\quad\times\mathcal Y_{\ell m}(\theta,\varphi).\end{aligned}$`}</Formula></div>
      <div className="mode-switch" role="group" aria-label="Vue de l’atome d’hydrogène">
        <Button variant="ghost" className={view === 'slice' ? 'is-selected' : ''} aria-pressed={view === 'slice'} onClick={() => setView('slice')}>Coupe spatiale</Button>
        <Button variant="ghost" className={view === 'radial' ? 'is-selected' : ''} aria-pressed={view === 'radial'} onClick={() => setView('radial')}>Partie radiale</Button>
      </div>
      <div className="control-stack">
        {evolving ? <div className="preset-grid atomic-dynamic-presets">{HYDROGEN_PRESETS.map(item => <Button key={item.id} variant="outline" className={presetId === item.id ? 'is-selected' : ''} onClick={() => { const circular = item.id === 'hydrogen-rydberg'; setPresetId(item.id); clock.setPhase(0); clock.setPlaying(false); setZoom(circular ? 1.5 : 1); setRadialScale(circular ? 20 : 1); setPlane(circular ? 'xy' : item.id === 'hydrogen-rotation' ? 'oblique' : 'xz'); }}>{item.label}</Button>)}</div> : <>
        <div className="display-switch" role="group" aria-label="Famille d’états de l’hydrogène">
          <Button variant="outline" className={!rydberg ? 'is-selected' : ''} aria-pressed={!rydberg} onClick={() => { setState({ n: 1, l: 0, m: 0 }); setZoom(1); setRadialScale(1); }}>Orbitales usuelles</Button>
          <Button variant="outline" className={rydberg ? 'is-selected' : ''} aria-pressed={rydberg} onClick={() => { setState({ n: 20, l: 19, m: 19 }); setBasis('complex'); setPlane('xy'); setZoom(1.5); setRadialScale(20); }}>Rydberg circulaire</Button>
        </div>
        {!rydberg ? <>
        <div className="preset-grid atomic-presets" role="group" aria-label="Orbitales usuelles">
          {PRESETS.map(preset => <Button key={preset.label} variant="outline" onClick={() => { setState({ n: preset.n, l: preset.l, m: preset.m }); setBasis('real'); setZoom(1); setPlane('xz'); }}><Formula>{preset.label}</Formula></Button>)}
        </div>
        <QuantumParameter id="hydrogen-n" label="Nombre principal" symbol="$n$" value={n} min={1} max={HYDROGEN_N_MAX}
          onChange={n => setState(current => { const l = Math.min(current.l, n - 1); return { n, l, m: Math.max(-l, Math.min(l, current.m)) }; })} />
        <QuantumParameter id="hydrogen-l" label="Nombre orbital" symbol={String.raw`$\ell$`} value={l} min={0} max={n - 1}
          onChange={l => setState(current => ({ ...current, l, m: Math.max(-l, Math.min(l, current.m)) }))} />
        <QuantumParameter id="hydrogen-m" label={basis === 'complex' ? 'Nombre magnétique' : 'Indice de l’orbitale réelle'} symbol="$m$" value={m} min={-l} max={l}
          onChange={m => setState(current => ({ ...current, m }))} />
        <div className="display-switch" role="group" aria-label="Base des orbitales">
          <Button variant="outline" className={basis === 'complex' ? 'is-selected' : ''} aria-pressed={basis === 'complex'} onClick={() => setBasis('complex')}>Complexe</Button>
          <Button variant="outline" className={basis === 'real' ? 'is-selected' : ''} aria-pressed={basis === 'real'} onClick={() => setBasis('real')}>Réelle</Button>
        </div>
        <p className="scale-note">{basis === 'complex' ? <>États propres de <Formula>{String.raw`$\hat L_z$`}</Formula>, de valeur <Formula>{String.raw`$m\hbar$`}</Formula>.</>
          : <>Pour <Formula>{String.raw`$m\ne0$`}</Formula>, combinaisons des états <Formula>{'$+|m|$'}</Formula> et <Formula>{'$-|m|$'}</Formula>. Cet indice ne désigne plus une valeur propre de <Formula>{String.raw`$\hat L_z$`}</Formula>.</>}</p>
        </> : <>
          <QuantumParameter id="rydberg-n" label="Nombre principal" symbol="$n$" value={n} min={RYDBERG_N_MIN} max={RYDBERG_N_MAX} onChange={n => setState(current => ({ n, l: n - 1, m: (current.m < 0 ? -1 : 1) * (n - 1) }))} />
          <div className="display-switch" role="group" aria-label="Signe du moment cinétique">
            <Button variant="outline" className={m > 0 ? 'is-selected' : ''} aria-pressed={m > 0} onClick={() => setState(current => ({ ...current, m: current.l }))}><Formula>{String.raw`$m=+\ell$`}</Formula></Button>
            <Button variant="outline" className={m < 0 ? 'is-selected' : ''} aria-pressed={m < 0} onClick={() => setState(current => ({ ...current, m: -current.l }))}><Formula>{String.raw`$m=-\ell$`}</Formula></Button>
          </div>
          <p className="scale-note"><Formula>{String.raw`$\ell=n-1,\quad |m|=\ell$`}</Formula>. Densité en anneau dans le plan équatorial, sans nœud radial. Les deux signes donnent la même densité mais des courants de probabilité opposés.</p>
        </>}
        </>}
        {view === 'slice' ? <QuantumParameter id="hydrogen-zoom" label="Grossissement de la coupe" symbol="$g$" value={zoom} min={.5} max={2} step={.1} onChange={setZoom} />
          : <QuantumParameter id="hydrogen-radial-scale" label="Facteur d’affichage radial" symbol="$s$" value={radialScale} min={.5} max={100} step={.5} onChange={setRadialScale} />}
      </div>
      <dl className="measurements">
        <div><dt>{evolving ? 'Énergie moyenne' : 'Énergie'}</dt><dd><Formula>{String.raw`$${evolving ? String.raw`\langle E\rangle` : `E_${n}`}\simeq${energy.toFixed(rydberg ? 6 : 3)}\,\mathrm{eV}$`}</Formula></dd></div>
        <div><dt>Rayon moyen</dt><dd><Formula>{String.raw`$\langle r\rangle=${mean.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 2 })}\,a_0$`}</Formula></dd></div>
        {evolving ? <div><dt>Populations des deux états</dt><dd>50 % · 50 %</dd></div> : <>
          <div><dt>Nœuds radiaux</dt><dd>{n - l - 1}</dd></div>
          <div><dt>Dégénérescence sans spin</dt><dd><Formula>{`$n^2=${n * n}$`}</Formula></dd></div>
        </>}
      </dl>
    </aside>
    <div className="figure-panel">
      <div className="figure-heading"><div><p className="eyebrow">{view === 'slice' ? 'Orbitale · coupe au noyau' : 'Distribution radiale'}</p>
        <h2><Formula>{evolving ? view === 'slice' ? String.raw`$|\psi(\mathbf r,t)|^2$` : '$P(r,t)$' : view === 'slice' ? String.raw`$|\psi_{${n},${l},${m}}|^2$` : String.raw`$P_{${n},${l}}(r)=r^2|R_{${n},${l}}(r)|^2$`}</Formula></h2></div>
        <span className="figure-tag">{evolving ? preset.label : <Formula>{String.raw`$n=${n},\;\ell=${l},\;m=${m}$`}</Formula>}</span>
      </div>
      {view === 'slice' ? <>
        <div className="atomic-view-controls">
          <div className="display-switch slice-plane-switch" role="group" aria-label="Plan de coupe">
            <Button variant="outline" className={plane === 'xz' ? 'is-selected' : ''} aria-pressed={plane === 'xz'} onClick={() => setPlane('xz')}><Formula>{'$xz$'}</Formula></Button>
            <Button variant="outline" className={plane === 'xy' ? 'is-selected' : ''} aria-pressed={plane === 'xy'} onClick={() => setPlane('xy')}><Formula>{'$xy$'}</Formula></Button>
            <Button variant="outline" className={plane === 'yz' ? 'is-selected' : ''} aria-pressed={plane === 'yz'} onClick={() => setPlane('yz')}><Formula>{'$yz$'}</Formula></Button>
            <Button variant="outline" className={plane === 'oblique' ? 'is-selected' : ''} aria-pressed={plane === 'oblique'} onClick={() => setPlane('oblique')}>Oblique</Button>
          </div>
          <div className="display-switch" role="group" aria-label="Couleurs de l’orbitale">
            <Button variant="outline" className={!phaseColors ? 'is-selected' : ''} aria-pressed={!phaseColors} onClick={() => setPhaseColors(false)}>Densité de probabilité</Button>
            <Button variant="outline" className={phaseColors ? 'is-selected' : ''} aria-pressed={phaseColors} onClick={() => setPhaseColors(true)}>Phase</Button>
          </div>
        </div>
        <HydrogenSlice state={state} basis={basis} plane={plane} extent={extent} phaseColors={phaseColors} active={active} evolutionTerms={evolving ? preset.terms : undefined} phase={evolving ? clock.phase : 0} />
        {phaseColors ? <PhaseLegend /> : <div className="density-key"><span>Faible densité</span><i aria-hidden="true" /><span>Forte densité</span></div>}
      </> : <>
        <div className="plot-shell"><ScientificPlot ariaLabel={evolving ? `Distribution radiale évolutive : ${preset.label}` : `Distribution radiale de l’hydrogène n ${n}, ell ${l}`}
          xDomain={[0, radialMax]} yDomain={[0, Math.max(.6, (rydberg ? .02 : .6) * radialScale)]} xLabel={String.raw`$r/a_0$`} yLabel={evolving ? '$s a_0P(r,t)$' : String.raw`$s a_0P_{n\ell}(r)$`}
          series={[{ values: radial.map(point => ({ x: point.x, y: radialScale * point.y })), tone: 'accent', fillTo: 0, fillOpacity: .28 }]}
          verticalLines={[{ value: mean, tone: 'teal', dashed: true, label: String.raw`$\langle r\rangle$` }]} /></div>
        <p className="probability-note">Probabilité intégrée dans le cadre radial : {(100 * capturedProbability).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 2 })} %. Échelle verticale commune à la famille, à facteur <Formula>{'$s$'}</Formula> fixé. Le facteur agit seulement sur l’affichage.{!evolving ? <> La courbe ne dépend pas de <Formula>{'$m$'}</Formula> ni du choix d’une base réelle ou complexe.</> : null}</p>
      </>}
      {evolving ? <AtomicClock id="hydrogen-time" clock={clock} period={String.raw`$T=2\pi\hbar/\Delta E=${periodFs.toFixed(3)}\,\mathrm{fs}$`} /> : null}
      <EnergyLevels energies={Array.from({ length: lastLevel - firstLevel + 1 }, (_, index) => hydrogenEnergy(index + firstLevel))} selected={evolving ? preset.terms.map(term => term.n - firstLevel) : n - firstLevel} firstIndex={firstLevel} unit={String.raw`$E\;\mathrm{(eV)}$`} label="Niveaux liés de l’hydrogène" />
      <div className="insight-row atomic-insight"><span className="insight-index"><Formula>{'$r$'}</Formula></span><p>{evolving ? preset.description : rydberg ? <>État circulaire <Formula>{String.raw`$n=${n},\;\ell=${l},\;m=${m}$`}</Formula> : le maximum de la probabilité radiale est à <Formula>{`$r=n^2a_0=${n * n}a_0$`}</Formula>. La densité d’un état propre reste stationnaire ; l’anneau n’est pas une trajectoire.</> : n === 1
        ? <>Dans l’état <Formula>{'$1s$'}</Formula>, la densité volumique est maximale au noyau, mais la probabilité radiale est maximale à <Formula>{'$r=a_0$'}</Formula>.</>
        : <>La fonction radiale possède {n - l - 1} nœud{n - l - 1 > 1 ? 's' : ''}. Le facteur <Formula>{'$r^2$'}</Formula> tient compte du volume des couches sphériques.</>}</p></div>
      {rydberg ? <p className="scale-note">Les états circulaires maximisent le moment orbital et sa projection pour un <Formula>{'$n$'}</Formula> fixé. <a href="https://arxiv.org/abs/1305.1149" target="_blank" rel="noreferrer">États hydrogénoïdes de Rydberg · López-Rosa et al.</a></p> : null}
      <details className="theory-notes"><summary>Repères théoriques</summary><div className="theory-grid">
        <div><span>Potentiel et niveaux liés</span><Formula display>{String.raw`$\begin{aligned}V(r)&=-\frac{e^2}{4\pi\varepsilon_0r},\\E_n&\simeq-\frac{13.606\,\mathrm{eV}}{n^2}.\end{aligned}$`}</Formula></div>
        <div><span>Probabilité radiale</span><Formula display>{String.raw`$\begin{aligned}P_{n\ell}(r)&=r^2|R_{n\ell}(r)|^2,\\\int_0^\infty P_{n\ell}(r)\,dr&=1,\\\langle r\rangle&=\frac{a_0}{2}[3n^2-\ell(\ell+1)].\end{aligned}$`}</Formula></div>
        <div><span>Fonction radiale normalisée</span><Formula display>{String.raw`$\begin{aligned}R_{n\ell}(r)&=N_{n\ell}e^{-\rho/2}\rho^\ell L_{n-\ell-1}^{2\ell+1}(\rho),\\\rho&=\frac{2r}{na_0},\\N_{n\ell}&=\left(\frac{2}{na_0}\right)^{3/2}\sqrt{\frac{(n-\ell-1)!}{2n(n+\ell)!}}.\end{aligned}$`}</Formula></div>
      </div><p><Formula>{String.raw`$L_k^\alpha$`}</Formula> désigne un polynôme de Laguerre généralisé. Les orbitales réelles utilisent, pour <Formula>{'$k>0$'}</Formula>, <Formula>{String.raw`$\mathcal Y_{\ell,k}=\sqrt2(-1)^k\Re Y_\ell^k$`}</Formula> et <Formula>{String.raw`$\mathcal Y_{\ell,-k}=\sqrt2(-1)^k\Im Y_\ell^k$`}</Formula>. Le modèle néglige le spin, la structure fine et le mouvement du proton ; les densités des états propres sont stationnaires. <a href="https://farside.ph.utexas.edu/teaching/qmech/Quantum/node82.html" target="_blank" rel="noreferrer">Hydrogène · R. Fitzpatrick, UT Austin</a>.</p></details>
    </div>
  </section>;
}
