'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Math as Formula } from '@/components/math';
import { QuantumParameter } from '@/components/quantum-parameter';
import { ScientificPlot, type PlotSeries, type PlotMarker } from '@/components/scientific-plot';
import { PlaybackControls } from '@/components/playback-controls';
import { useLabPlayback } from '@/components/use-lab-playback';
import { SternGerlachScreen } from '@/components/stern-gerlach-screen';
import type { ExperimentCommand } from '@/components/lab-types';
import { SG_DEFAULTS, SG_J, SG_BEAMS, SG_SIGMA_MM, sgChannels, sgClassicalMoment, sgDeflection, sgDensity, sgFlightTime, sgParticles, sgScreenRange, type SGParameters, type SGBeam, type SGModel } from '@/lib/stern-gerlach';

const numberTex = (value: number) => Number.isInteger(value) ? String(value) : `${value < 0 ? '-' : ''}\\frac{${Math.abs(value * 2)}}{2}`;
const signed = (value: number) => (Math.abs(value) < .0005 ? 0 : value).toFixed(3);
const beamFormula = (beam: SGBeam) => String.raw`$|${beam.endsWith('minus') ? '-' : '+'}${beam[0]}\rangle$`;
const tone = (mu: number): PlotMarker['tone'] => mu > 0 ? 'teal' : mu < 0 ? 'accent' : 'ink';

export function SternGerlachLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [p, setParameters] = useState<SGParameters>(SG_DEFAULTS);
  const [model, setModel] = useState<SGModel>('quantum'), [beam, setBeam] = useState<SGBeam>('mixed');
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [scale, setScale] = useState(1), [seed, setSeed] = useState(1);
  const clock = useLabPlayback({ active, enabled: true, time, setTime, playing, setPlaying, defaultFinalTime: 8, rate: 1, command: command?.lab === 'stern-gerlach' ? command : null });
  const reset = () => { setTime(0); setPlaying(false); };
  const change = (key: keyof SGParameters, value: number) => { setParameters(current => ({ ...current, [key]: value })); if (key === 'j' && value !== .5) setBeam('mixed'); reset(); };
  useEffect(() => {
    if (command?.lab !== 'stern-gerlach') return;
    const keys = { sgJ: 'j', sgGradient: 'gradient', sgVelocity: 'velocity', sgLength: 'length', sgDistance: 'distance', sgAngle: 'angle', sgG: 'g', sgMass: 'mass' } as const;
    setParameters(current => {
      const next = { ...current };
      for (const [from, to] of Object.entries(keys)) { const value = command[from as keyof typeof keys]; if (value !== undefined) next[to] = value; }
      if (command.sgBeam && command.sgBeam !== 'mixed') next.j = .5;
      return next;
    });
    if (command.sgModel) setModel(command.sgModel);
    if (command.sgBeam) { setBeam(command.sgBeam); if (command.sgBeam !== 'mixed') setModel('quantum'); }
    if ((command.sgJ !== undefined && command.sgJ !== .5) || command.sgModel === 'classical') setBeam('mixed');
    if (command.scale !== undefined) setScale(command.scale);
    setTime(command.time ?? 0); setPlaying(false);
  }, [command]);

  const channels = useMemo(() => sgChannels(p, beam), [p, beam]);
  const range = sgScreenRange(p), flight = sgFlightTime(p), end = p.length + p.distance;
  const particles = useMemo(() => sgParticles(p, beam, model, time, seed), [p, beam, model, time, seed]);
  const hits = particles.filter(point => point.detected);
  const counts = channels.map((_, index) => hits.filter(hit => hit.channel === index).length);
  const resolved = channels.length === 1 || Math.abs(channels[1].position - channels[0].position) >= 4 * SG_SIGMA_MM;
  const trajectories = useMemo<PlotSeries[]>(() => {
    const branches = model === 'quantum' ? channels : Array.from({ length: 21 }, (_, i) => ({ mu: sgClassicalMoment(p) * (i / 10 - 1), probability: 1 / 21 }));
    const positions = [-2, 0, p.length, end, ...Array.from({ length: 81 }, (_, i) => -2 + (end + 2) * i / 80)].sort((a, b) => a - b);
    return branches.map(c => ({ values: positions.map(y => ({ x: y, y: sgDeflection(c.mu, p, y / 100) })),
      tone: model === 'quantum' ? tone(c.mu) : 'muted', width: model === 'quantum' ? 1.8 : 1,
      opacity: c.probability > 1e-10 ? model === 'quantum' ? .65 : .28 : .18, dashed: c.probability < 1e-10 }));
  }, [channels, end, model, p]);
  const profiles = useMemo<PlotSeries[]>(() => {
    // Resolve narrow peaks even when the selected apparatus separates them widely.
    const edge = Math.abs(sgDeflection(sgClassicalMoment(p), p, end / 100));
    const centers = [0, -edge, edge, ...channels.map(c => c.position)];
    const samples = [...Array.from({ length: 601 }, (_, i) => -range + 2 * range * i / 600),
      ...centers.flatMap(center => Array.from({ length: 81 }, (_, i) => center + (i - 40) * SG_SIGMA_MM / 8))]
      .filter(x => x >= -range && x <= range).sort((a, b) => a - b);
    return [{ values: samples.map(x => ({ x, y: sgDensity(x, p, beam, model) })), tone: 'teal', fillTo: 0, fillOpacity: .15 },
      ...(beam === 'mixed' ? [{ values: samples.map(x => ({ x, y: sgDensity(x, p, beam, model === 'quantum' ? 'classical' : 'quantum') })), tone: 'muted' as const, dashed: true, width: 1.5 }] : [])];
  }, [range, p, beam, model, end, channels]);
  const peak = Math.max(...profiles.flatMap(curve => curve.values.map(point => point.y)));
  const markers: PlotMarker[] = particles.filter(point => !point.detected).map(point => {
    // Only label outgoing quantum channels; the unpolarized incident beam has no
    // assigned spin direction. With no gradient the apparatus performs no separation.
    const showProjection = model === 'classical' || (point.y >= p.length / 100 && p.gradient !== 0);
    return { id: point.id, x: point.y * 100, y: point.displacement,
      tone: model === 'quantum' ? tone(point.mu) : 'ink', radius: 2 * scale,
      verticalArrow: showProjection ? 28 * point.spinProjection : undefined,
      label: showProjection ? `Projection du moment cinétique : Jₙ/ℏ = ${point.spinProjection.toFixed(model === 'quantum' ? 1 : 2)}` : 'Atome incident — aucune projection de canal affichée' };
  });
  const transverseRatio = 2 * Math.abs(sgDeflection(sgClassicalMoment(p), p, p.length / 100)) / (10 * p.length);

  return <section className="workspace sg-workspace" aria-labelledby="sg-title">
    <aside className="control-panel">
      <div><p className="eyebrow">09 · Mesure du moment magnétique</p><h1 id="sg-title">Stern–Gerlach</h1><p className="lede">Du faisceau d’atomes neutres aux traces sur l’écran : explorez la quantification spatiale.</p></div>
      <div className="mode-switch" role="group" aria-label="Modèle de Stern–Gerlach">
        <Button variant="ghost" aria-pressed={model === 'quantum'} className={model === 'quantum' ? 'is-selected' : ''} onClick={() => { setModel('quantum'); reset(); }}>Quantique</Button>
        <Button variant="ghost" aria-pressed={model === 'classical'} className={model === 'classical' ? 'is-selected' : ''} onClick={() => { setModel('classical'); setBeam('mixed'); reset(); }}>Classique</Button>
      </div>
      <div className="control-block"><p className="control-caption">Moment cinétique <Formula>$j$</Formula></p><div className="preset-grid preset-grid-four" role="group" aria-label="Moment cinétique de l’atome">{SG_J.map(j => <Button key={j} variant="outline" aria-pressed={p.j === j} className={p.j === j ? 'is-selected' : ''} onClick={() => change('j', j)}><Formula>{`$j=${numberTex(j)}$`}</Formula></Button>)}</div><p className="scale-note">Argent : <Formula>{String.raw`$j=\frac12,\ g\simeq2$`}</Formula>. Les autres valeurs illustrent les multiplets à masse et facteur <Formula>$g$</Formula> fixés, sans désigner une espèce précise.</p></div>
      {model === 'quantum' && p.j === .5 ? <div className="sg-preparation"><p className="control-caption">Faisceau incident</p><div className="preset-grid sg-beams" role="group" aria-label="Préparation du faisceau">{SG_BEAMS.map(value => <Button key={value} variant="outline" aria-pressed={beam === value} className={beam === value ? 'is-selected' : ''} onClick={() => { setBeam(value); reset(); }}>{value === 'mixed' ? 'Non polarisé (four)' : <Formula>{beamFormula(value)}</Formula>}</Button>)}</div></div> : null}
      <div className="equation-card"><span>{model === 'classical' ? 'Moments classiques isotropes' : beam === 'mixed' ? 'Ensemble non polarisé' : 'État préparé du spin'}</span><Formula display>{model === 'classical' ? String.raw`$|\boldsymbol\mu|=g\mu_B\sqrt{j(j+1)}$` : beam === 'mixed' ? String.raw`$\rho=\frac{\mathbb I}{2j+1}$` : String.raw`$|\chi\rangle=${beamFormula(beam).slice(1, -1)}$`}</Formula><p className="scale-note">{model === 'classical' ? 'Comparaison classique : moments de norme fixe, orientés isotropiquement.' : beam === 'mixed' ? 'Mélange statistique ; ce n’est pas une superposition pure de tous les états.' : 'Préparation idéale en amont. Le signe + ou − désigne le spin, pas le moment magnétique.'}</p></div>
      <div className="control-stack">
        <QuantumParameter id="sg-gradient" label="Gradient" symbol={String.raw`$G\;(\mathrm{T/m})$`} value={p.gradient} min={-1500} max={1500} step={25} onChange={v => change('gradient', v)} />
        <QuantumParameter id="sg-velocity" label="Vitesse du faisceau" symbol={String.raw`$v_y\;(\mathrm{m/s})$`} value={p.velocity} min={100} max={1000} step={25} onChange={v => change('velocity', v)} />
        <div><QuantumParameter id="sg-angle" label="Axe de mesure" symbol={String.raw`$\alpha\;({}^{\circ})$`} value={p.angle} min={0} max={180} step={5} onChange={v => change('angle', v)} /><div className="preset-grid" role="group" aria-label="Orientations de l’aimant">{[0, 90, 180].map((angle, i) => <Button key={angle} variant="outline" aria-pressed={p.angle === angle} className={p.angle === angle ? 'is-selected' : ''} onClick={() => change('angle', angle)}><Formula>{['$+z$', '$+x$', '$-z$'][i]}</Formula></Button>)}</div></div>
      </div>
      <details className="theory-notes sg-geometry"><summary>Géométrie et atome modèle</summary><div className="control-stack">
        <QuantumParameter id="sg-length" label="Longueur de l’aimant" symbol={String.raw`$L\;(\mathrm{cm})$`} value={p.length} min={1} max={10} step={.5} onChange={v => change('length', v)} />
        <QuantumParameter id="sg-distance" label="Distance à l’écran" symbol={String.raw`$D\;(\mathrm{cm})$`} value={p.distance} min={2} max={30} step={1} onChange={v => change('distance', v)} />
        <QuantumParameter id="sg-g" label="Facteur de Landé" symbol="$g$" value={p.g} min={.5} max={2} step={.1} onChange={v => change('g', v)} />
        <QuantumParameter id="sg-mass" label="Masse atomique" symbol={String.raw`$M\;(\mathrm{u})$`} value={p.mass} min={20} max={200} step={1} onChange={v => change('mass', v)} />
      </div><p className="scale-note">Valeurs initiales proches de l’argent : <Formula>{String.raw`$M\simeq108\,\mathrm{u},\ g=2$`}</Formula>. Le modèle néglige la structure hyperfine et les interactions entre atomes.</p></details>
    </aside>

    <div className="figure-panel">
      <div className="figure-heading"><div><p className="eyebrow">Expérience de Stern–Gerlach</p><h2>{p.j === 0 || p.gradient === 0 ? 'Une seule trace non déviée' : model === 'quantum' ? 'Un nombre discret de traces' : 'La prédiction classique continue'}</h2></div><span className="figure-tag">{model === 'quantum' ? `${2 * p.j + 1} canaux possibles` : 'Orientations isotropes'}</span></div>
      <ol className="sg-stages"><li>Four d’atomes neutres</li><li>Collimateur</li><li>Aimant à gradient</li><li>Écran</li></ol>
      <div className="plot-legend"><span><i className="legend-swatch" />{model === 'quantum' ? 'centres des canaux' : 'quelques déviations classiques'}</span><span><i className="legend-swatch sg-magnet-swatch" />région de l’aimant</span><span><Formula>{String.raw`$\uparrow\!\downarrow$`}</Formula> projection du moment cinétique <Formula>$J_n$</Formula></span></div>
      <div className="plot-shell sg-apparatus"><ScientificPlot ariaLabel="Propagation du faisceau avec flèches du moment cinétique projeté sur l’axe de mesure : flèche vers le haut pour Jₙ positif, vers le bas pour Jₙ négatif" xDomain={[-2.4, end + 1.5]} yDomain={[-range, range]} xLabel={String.raw`$y\;(\mathrm{cm})$`} yLabel={String.raw`$\xi\;(\mathrm{mm})$`}
        series={trajectories} markers={markers} bands={[{ from: 0, to: p.length, tone: 'teal', opacity: .18 }]} xTicks={[0, p.length, end]}
        horizontalLines={[{ value: 0, tone: 'muted' }]} verticalLines={[{ value: 0, label: '$0$', labelAbove: true }, { value: p.length, label: '$L$', labelAbove: true }, { value: end, label: '$L+D$', labelAbove: true, tone: 'ink', dashed: false }]} /></div>
      <p className="scale-note">Coupe dans le plan du faisceau et de l’axe <Formula>{String.raw`$\boldsymbol n=\sin\alpha\,\boldsymbol e_x+\cos\alpha\,\boldsymbol e_z$`}</Formula>. <Formula>{String.raw`$\xi=\boldsymbol r\cdot\boldsymbol n$`}</Formula> est la déviation transverse. Les traits suivent les centres des faisceaux, pas des trajectoires quantiques individuelles. Les axes s’adaptent aux paramètres, pas au temps.</p>
      <p className="scale-note sg-spin-note">{model === 'quantum' ? <>Après l’aimant, les flèches représentent <Formula>{String.raw`$J_n=m\hbar$`}</Formula> dans chaque canal, pas une orientation classique du spin. Avant la sortie, ou sans gradient, aucune flèche de canal n’est attribuée. Pour l’argent, <Formula>$J=S$</Formula>.</> : <>Les flèches représentent la projection continue du moment cinétique classique sur l’axe de mesure.</>} Leur longueur est proportionnelle à <Formula>{String.raw`$|J_n|$`}</Formula>, à une échelle graphique indépendante des axes. Le moment magnétique est opposé : <Formula>{String.raw`$\mu_n=-g\mu_B J_n/\hbar$`}</Formula>.</p>
      {transverseRatio > .1 ? <p className="nodal-notice">Forte déviation : l’approximation de faisceau étroit devient peu fiable. Réduisez le gradient ou augmentez la vitesse pour retrouver le régime du modèle.</p> : null}
      <PlaybackControls id="sg" clock={clock} scale={scale} onScaleChange={setScale} scaleMax={4}
        timeSymbol={String.raw`$t\;(\mathrm{ms})$`} finalSymbol={String.raw`$t_f\;(\mathrm{ms})$`} finalMin={1} finalMax={20} finalStep={1}
        scaleDescription="Le facteur s modifie seulement la taille des points dessinés, pas leurs positions ni les probabilités."
        note={<>Temps de vol jusqu’à l’écran : {flight.toFixed(3)} ms. À vitesse ×1, 1 ms physique est représentée en 1 seconde. Les atomes arrivent progressivement ; la largeur initiale du faisceau est {SG_SIGMA_MM} mm.</>} />
      <div className="sg-detector-heading"><h3>Impacts sur l’écran</h3><span aria-live="off">{hits.length} atomes détectés</span><Button variant="outline" onClick={() => { setSeed(value => value + 1); reset(); }}>Nouvelle série</Button></div>
      <div className="sg-detector-grid">
        <SternGerlachScreen points={hits} range={range} scale={scale} />
        <div className="sg-profile"><h3>Distribution attendue</h3><div className="plot-legend"><span><i className="legend-swatch sg-magnet-swatch" />{model === 'quantum' ? 'quantique' : 'classique'}</span>{beam === 'mixed' ? <span><i className="legend-swatch dashed" />{model === 'quantum' ? 'classique' : 'quantique'}</span> : null}</div>
          <div className="plot-shell"><ScientificPlot ariaLabel="Distribution normalisée des positions attendues à l’écran" xDomain={[-range, range]} yDomain={[0, peak * 1.12]} xLabel={String.raw`$\xi\;(\mathrm{mm})$`} yLabel={String.raw`$p(\xi)\;(\mathrm{mm}^{-1})$`} series={profiles} /></div><p className="scale-note">Prévision pour un grand nombre d’atomes ; l’aire vaut 1. L’élargissement des pics représente la largeur du faisceau, pas des valeurs intermédiaires du spin.</p></div>
      </div>
      {model === 'quantum' ? <>
        {!resolved ? <p className="nodal-notice">{p.gradient === 0 ? 'Sans gradient, aucune séparation magnétique : les traces se superposent.' : 'Les traces se recouvrent : cet écran ne résout pas les différents canaux.'} Les probabilités ci-dessous sont celles d’une mesure idéale du spin.</p> : null}
        <div className="sg-channel-table"><table><caption>Canaux quantiques et probabilités</caption><thead><tr><th><Formula>{String.raw`$m$`}</Formula></th><th><Formula>{String.raw`$\mu_n/\mu_B$`}</Formula></th><th>Position (mm)</th><th>Probabilité</th><th>Impacts{!resolved ? '¹' : ''}</th></tr></thead><tbody>{channels.map((c, i) => <tr key={c.m}><td><Formula>{`$${numberTex(c.m)}$`}</Formula></td><td>{signed(c.mu)}</td><td>{signed(c.position)}</td><td>{(100 * c.probability).toFixed(1)} %</td><td>{resolved ? counts[i] : '—'}</td></tr>)}</tbody></table></div>
        {!resolved ? <p className="scale-note">¹ Pas de comptage par canal lorsque les impacts ne permettent pas de les distinguer.</p> : <p className="scale-note">Comptages de la série simulée : ils fluctuent autour des probabilités. Les canaux sont identifiés dans le modèle ; une faible superposition des taches reste possible.</p>}
      </> : <div className="insight-row atomic-insight"><span className="insight-index">∞</span><p>Une orientation isotrope d’un moment classique non nul donne toutes les projections entre <Formula>{String.raw`$-|\boldsymbol\mu|$`}</Formula> et <Formula>{String.raw`$+|\boldsymbol\mu|$`}</Formula>. Avec un gradient non nul, on prédit une bande continue, contrairement au résultat observé avec l’argent.</p></div>}
      <details className="theory-notes sg-theory"><summary>Repères théoriques</summary><div className="theory-grid">
        <div><span>Force sur un atome neutre</span><Formula display>{String.raw`$U=-\boldsymbol\mu\cdot\boldsymbol B$`}</Formula><Formula display>{String.raw`$F_\xi\simeq\mu_n G,\qquad G=\frac{\partial B_n}{\partial\xi}$`}</Formula><p>Un champ homogène ne sépare pas le faisceau. La force vient du gradient du champ, et non d’une force de Lorentz sur une charge nette.</p></div>
        <div><span>De la force à la trace</span><Formula display>{String.raw`$Z_m=\frac{\mu_n G L}{M v_y^2}\left(D+\frac L2\right)$`}</Formula><p>Accélération constante dans l’aimant, puis dérive libre. Doubler la vitesse divise la déviation par quatre, à paramètres fixés.</p></div>
        <div><span>Quantification spatiale</span><Formula display>{String.raw`$J_n=m\hbar,\qquad m=-j,\ldots,j$`}</Formula><Formula display>{String.raw`$\mu_n=-g\,m\,\mu_B$`}</Formula><p>Il existe <Formula>{String.raw`$2j+1$`}</Formula> résultats possibles. Pour <Formula>{String.raw`$j=\frac12,\ g=2$`}</Formula>, <Formula>{String.raw`$\mu_n=\pm\mu_B$`}</Formula>. Le signe moins vient de la charge négative de l’électron : un spin positif est dévié vers <Formula>{String.raw`$-\boldsymbol n$`}</Formula> si <Formula>$G&gt;0$</Formula>.</p></div>
        <div><span>Axe de mesure et préparation</span><Formula display>{String.raw`$P_\pm=\frac{1\pm\boldsymbol r\cdot\boldsymbol n}{2}$`}</Formula><p>Pour un spin <Formula>{String.raw`$\frac12$`}</Formula> non polarisé, <Formula>{String.raw`$\boldsymbol r=0$`}</Formula> : chaque canal a une probabilité de 50 %. Pour <Formula>{String.raw`$|+z\rangle$`}</Formula>, <Formula>{String.raw`$P_+=\cos^2(\alpha/2)$`}</Formula>. Une mesure selon <Formula>$x$</Formula> redonne deux issues équiprobables.</p></div>
      </div><p className="scale-note">Modèle idéal inspiré du chapitre VII du cours : faisceau étroit et monoénergétique, champ dominant selon l’axe de mesure et gradient constant dans la région utile. La dynamique spatiale suit les centres des paquets ; la sélection des canaux suit la règle de Born. En comparaison classique, <Formula>{String.raw`$|\boldsymbol\mu|=g\mu_B\sqrt{j(j+1)}$`}</Formula>. Les effets de bord de l’aimant, la dispersion des vitesses et la structure hyperfine sont négligés.</p></details>
    </div>
  </section>;
}
