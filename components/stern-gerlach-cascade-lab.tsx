'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Math as Formula } from '@/components/math';
import { QuantumParameter } from '@/components/quantum-parameter';
import { PlaybackControls } from '@/components/playback-controls';
import { useLabPlayback } from '@/components/use-lab-playback';
import type { ExperimentCommand } from '@/components/lab-types';
import { SG_BEAMS } from '@/lib/stern-gerlach';
import { SG_CASCADE_DEFAULTS, SG_CASCADE_PRESETS, sgCascadeStatistics, sgCascadeAtoms, sgCascadeCounts, sgCascadeGlyph, type SGCascadeConfig, type SGFilter, type SGCascadeAtom } from '@/lib/stern-gerlach-cascade';

const percent = (value: number) => `${(100 * value).toFixed(1)} %`;
const names = ['A', 'B', 'C'];
const color = (sign: number) => sign > 0 ? 'var(--accent)' : 'var(--teal)';

export function CascadeDiagram({ config, atoms, scale }: { config: SGCascadeConfig; atoms: SGCascadeAtom[]; scale: number }) {
  return <div className="sg-cascade-scroll" role="region" aria-label="Schéma animé de la cascade, défilable horizontalement" tabIndex={0}>
    <svg className="sg-cascade-diagram" viewBox="0 0 960 250" role="img" aria-label="Trois analyseurs successifs. Chaque atome est mesuré, transmis ou arrêté par les filtres ; les flèches identifient la projection du spin dans les branches.">
      {config.angles.map((angle, stage) => {
        const x = 32 + 268 * stage, bypass = stage === 1 && !config.middle;
        const previousBypass = stage === 2 && !config.middle;
        const previousFilter = config.filters[stage - 1];
        const filter = stage < 2 ? config.filters[stage] : 'both';
        return <g key={stage}>
          <text x={x + 128} y={30} textAnchor="middle">{names[stage]} · {bypass ? 'retiré' : `${angle}°`}</text>
          {stage === 0 || previousBypass ? <path d={`M${x} 126 H${x + 80}`} className="sg-cascade-path" /> : [1, -1].map(sign => previousFilter === 'both' || previousFilter === (sign > 0 ? 'plus' : 'minus') ? <path key={sign} d={`M${x} ${126 + 42 * sign} L${x + 80} 126`} className="sg-cascade-path" /> : null)}
          <path d={`M${x + 80} 126 H${x + (bypass ? 268 : 161)}`} className="sg-cascade-path" />
          <rect x={x + 94} y={94} width={66} height={64} rx={8} className={`sg-cascade-magnet${bypass ? ' is-bypassed' : ''}`} />
          {bypass ? <text x={x + 127} y={134} textAnchor="middle">—</text> : <g transform={`translate(${x + 127} 126) rotate(${angle})`} stroke="var(--lab-tone)" strokeWidth={2.5} fill="none"><path d="M0 18 V-18 M-6 -10 L0 -18 L6 -10" /></g>}
          {!bypass ? [1, -1].map(sign => {
            const blocked = filter !== 'both' && filter !== (sign > 0 ? 'plus' : 'minus');
            return <g key={sign}>
              <path d={`M${x + 161} 126 L${x + 268} ${126 + 42 * sign}`} fill="none" stroke={color(sign)} strokeWidth={2.2} opacity={.65} />
              <text x={x + 235} y={126 + 67 * sign} fill={color(sign)} textAnchor="middle">{sign > 0 ? '+' : '−'}</text>
              {blocked ? <g><title>{`Sortie ${sign > 0 ? '+' : '−'} bloquée`}</title><path d={`M${x + 268} ${126 + 42 * sign - 11} v22`} stroke="var(--foreground)" strokeWidth={6} /></g> : null}
            </g>;
          }) : null}
        </g>;
      })}
      {[1, -1].map(sign => <path key={sign} d={`M836 ${126 + sign * 42} H918`} stroke={color(sign)} strokeWidth={2.2} fill="none" />)}
      <path d="M918 65 V187" stroke="var(--foreground)" strokeWidth={4} />
      <text x={908} y={30} textAnchor="middle">Écran</text>
      <text x={32} y={225}>Faisceau incident</text><text x={518} y={225} textAnchor="middle">Barre noire : sortie bloquée</text>
      {atoms.map(atom => {
        if (atom.detected) return <circle key={atom.id} cx={918 + 6 * Math.sin(atom.id * 13.7)} cy={126 + 42 * atom.outcomes[2]! + 10 * Math.sin(atom.id * 7.3)} r={1.8 * scale} fill={color(atom.outcomes[2]!)} opacity={.55} />;
        const glyph = sgCascadeGlyph(atom, config);
        if (!glyph) return null;
        return <g key={atom.id} transform={`translate(${glyph.x} ${glyph.y})`} opacity={glyph.opacity}>
          {glyph.spin !== null ? <path d={`M0 0 v${-18 * glyph.spin} m-5 ${7 * glyph.spin} l5 ${-7 * glyph.spin} l5 ${7 * glyph.spin}`} stroke={color(glyph.spin)} strokeWidth={2.8} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          <circle r={3 * scale} fill={glyph.spin === null ? 'var(--foreground)' : color(glyph.spin)} stroke="var(--card)" strokeWidth={1} />
        </g>;
      })}
    </svg>
  </div>;
}

export function SternGerlachCascadeLab({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [config, setConfig] = useState<SGCascadeConfig>(SG_CASCADE_DEFAULTS);
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [scale, setScale] = useState(1), [seed, setSeed] = useState(1);
  const currentCommand = command?.lab === 'stern-gerlach' && command.sgSetup === 'cascade' ? command : null;
  const clock = useLabPlayback({ active, enabled: true, time, setTime, playing, setPlaying, defaultFinalTime: 12, rate: 1, command: currentCommand });
  const reset = () => { setTime(0); setPlaying(false); };
  const change = (patch: Partial<SGCascadeConfig>) => { setConfig(value => ({ ...value, ...patch })); reset(); };
  useEffect(() => {
    if (!currentCommand) return;
    setConfig(value => ({ ...value,
      beam: currentCommand.sgBeam ?? value.beam, angles: currentCommand.sgCascadeAngles ?? value.angles,
      filters: currentCommand.sgCascadeFilters ?? value.filters, middle: currentCommand.sgCascadeMiddle ?? value.middle }));
    if (currentCommand.scale !== undefined) setScale(currentCommand.scale);
    setTime(currentCommand.time ?? 0); setPlaying(false);
  }, [currentCommand]);
  const statistics = useMemo(() => sgCascadeStatistics(config), [config]);
  const atoms = useMemo(() => sgCascadeAtoms(config, time, seed), [config, time, seed]);
  const counts = sgCascadeCounts(atoms, config), last = statistics[2];
  const detected = atoms.filter(atom => atom.detected);
  const detectedPlus = detected.filter(atom => atom.outcomes[2] === 1).length;
  const absent = sgCascadeStatistics({ ...config, middle: false })[2];
  const both = sgCascadeStatistics({ ...config, middle: true, filters: [config.filters[0], 'both'] })[2];
  const conditional = (value: number, incoming: number) => incoming > 1e-14 ? percent(value / incoming) : '—';
  return <section className="workspace sg-workspace sg-cascade-workspace" aria-labelledby="sg-cascade-title">
    <aside className="control-panel">
      <div><p className="eyebrow">08 · Mesures successives</p><h1 id="sg-cascade-title">Stern–Gerlach en cascade</h1><p className="lede">Préparer, mesurer, filtrer : l’ordre des analyseurs change les résultats.</p></div>
      <div className="control-block"><p className="control-caption">Expériences à comparer</p><div className="preset-grid sg-cascade-presets">{SG_CASCADE_PRESETS.map(preset => <Button key={preset.label} variant="outline" aria-pressed={config.middle === preset.middle && config.angles.every((v, i) => v === preset.angles[i]) && config.filters.every((v, i) => v === preset.filters[i])} className={config.middle === preset.middle && config.angles.every((v, i) => v === preset.angles[i]) && config.filters.every((v, i) => v === preset.filters[i]) ? 'is-selected' : ''} onClick={() => change({ angles: [...preset.angles], filters: [...preset.filters], middle: preset.middle })}>{preset.label}</Button>)}</div></div>
      <div className="sg-preparation"><p className="control-caption">Faisceau incident · <Formula>{String.raw`$j=\frac12$`}</Formula></p><div className="preset-grid sg-beams" role="group" aria-label="Préparation de la cascade">{SG_BEAMS.map(beam => <Button key={beam} variant="outline" aria-pressed={config.beam === beam} className={config.beam === beam ? 'is-selected' : ''} onClick={() => change({ beam })}>{beam === 'mixed' ? 'Non polarisé (four)' : <Formula>{`$|${beam.endsWith('plus') ? '+' : '-'}${beam[0]}\\rangle$`}</Formula>}</Button>)}</div></div>
      {config.angles.map((angle, stage) => <div key={stage} className="sg-cascade-setting">
        <h3>Analyseur {names[stage]}</h3>
        {stage === 1 ? <div className="well-perturbation sg-cascade-middle"><div className="control-heading"><label htmlFor="sg-cascade-middle">Analyseur B inséré</label><Switch id="sg-cascade-middle" checked={config.middle} onCheckedChange={middle => change({ middle })} /></div></div> : null}
        {stage !== 1 || config.middle ? <>
          <QuantumParameter id={`sg-cascade-angle-${stage}`} label="Orientation" symbol={String.raw`$\alpha_${names[stage]}\;({}^{\circ})$`} value={angle} min={0} max={180} step={5} onChange={value => { const angles: SGCascadeConfig['angles'] = [...config.angles]; angles[stage] = value; change({ angles }); }} />
          <div className="preset-grid" role="group" aria-label={`Axe de l’analyseur ${names[stage]}`}>{[0, 90, 180].map((value, i) => <Button key={value} variant="outline" aria-label={`Analyseur ${names[stage]} : ${['+z', '+x', '-z'][i]}`} aria-pressed={angle === value} className={angle === value ? 'is-selected' : ''} onClick={() => { const angles: SGCascadeConfig['angles'] = [...config.angles]; angles[stage] = value; change({ angles }); }}><Formula>{['$+z$', '$+x$', '$-z$'][i]}</Formula></Button>)}</div>
          {stage < 2 ? <div className="sg-cascade-filter"><p className="control-caption">Sorties transmises</p><div className="preset-grid" role="group" aria-label={`Filtre de l’analyseur ${names[stage]}`}>{(['plus', 'minus', 'both'] as SGFilter[]).map(value => <Button key={value} variant="outline" aria-label={`Filtre ${names[stage]} : ${value === 'both' ? 'deux sorties' : value === 'plus' ? 'plus' : 'moins'}`} aria-pressed={config.filters[stage] === value} className={config.filters[stage] === value ? 'is-selected' : ''} onClick={() => { const filters: SGCascadeConfig['filters'] = [...config.filters]; filters[stage] = value; change({ filters }); }}>{value === 'both' ? 'Les deux' : <Formula>{value === 'plus' ? '$+$' : '$-$'}</Formula>}</Button>)}</div></div> : <p className="scale-note">Les deux sorties de C sont détectées.</p>}
        </> : <p className="scale-note">Aucune mesure selon B : l’état transmis par A est conservé jusqu’à C.</p>}
      </div>)}
    </aside>
    <div className="figure-panel">
      <div className="figure-heading"><div><p className="eyebrow">Cascade de spin <Formula>{String.raw`$\frac12$`}</Formula></p><h2>{config.middle ? 'Trois mesures successives' : 'Deux mesures, sans B'}</h2></div><span className="figure-tag">A → {config.middle ? 'B → ' : ''}C</span></div>
      <CascadeDiagram config={config} atoms={atoms} scale={scale} />
      <p className="scale-note">Schéma logique, sans échelle de longueur. Les sorties sont redirigées vers l’analyseur suivant sans rotation du spin ; les flèches des atomes indiquent la projection dans le canal local, <Formula>{String.raw`$J_n=\pm\hbar/2$`}</Formula>. Le signe désigne le spin, pas le moment magnétique.</p>
      <PlaybackControls id="sg-cascade" clock={clock} scale={scale} onScaleChange={setScale} scaleMax={4} timeSymbol={String.raw`$t\;(\mathrm{u.a.})$`} finalSymbol={String.raw`$t_f\;(\mathrm{u.a.})$`} finalMin={4} finalMax={20} finalStep={1} scaleDescription="Modifie seulement la taille des atomes et des impacts." note="Le temps règle la progression des atomes dans le schéma, pas une précession du spin. Modifier un analyseur ou un filtre remet les comptages à zéro." />
      <div className="sg-detector-heading"><h3>Détection après C</h3><span>{detected.length} atomes détectés</span><Button variant="outline" onClick={() => { setSeed(value => value + 1); reset(); }}>Nouvelle série</Button></div>
      <dl className="sg-cascade-results">{[1, -1].map(sign => <div key={sign} className={sign > 0 ? 'is-plus' : 'is-minus'}><dt><Formula>{`$J_{n_C}=${sign > 0 ? '+' : '-'}\\hbar/2$`}</Formula></dt><dd>{sign > 0 ? detectedPlus : detected.length - detectedPlus} impacts<p>Théorie : {conditional(sign > 0 ? last.plus : last.minus, last.incoming)} des atomes arrivant en C</p><p>{percent(sign > 0 ? last.plus : last.minus)} du faisceau initial</p></dd></div>)}</dl>
      {last.incoming <= 1e-14 ? <p className="nodal-notice">Aucun atome ne peut atteindre C avec ces filtres. Les probabilités conditionnelles en C ne sont donc pas définies.</p> : null}
      <div className="sg-channel-table"><table><caption>Transmission à chaque étape</caption><thead><tr><th>Analyseur</th><th>Résultats + / −</th><th>Transmis</th><th>Bloqués</th><th>Transmission théorique¹</th></tr></thead><tbody>{statistics.map((stage, i) => <tr key={i}><td>{names[i]}{stage.bypassed ? ' (retiré)' : ''}</td><td>{stage.bypassed ? '—' : `${counts[i].plus} / ${counts[i].minus}`}</td><td>{counts[i].passed}</td><td>{counts[i].blocked}</td><td>{percent(stage.passed)}</td></tr>)}</tbody></table></div>
      <p className="scale-note">¹ Fraction du faisceau initial, après le filtre. Les comptes progressent au passage de chaque sortie ; certains atomes sont encore en vol avant l’écran. Ils fluctuent d’une série à l’autre autour des probabilités théoriques.</p>
      <div className="sg-cascade-comparison"><h3>L’effet de l’analyseur B</h3><p>Préparation, analyseurs A et C et filtre de A identiques :</p><div className="sg-channel-table"><table><caption>Probabilité du résultat + en C, parmi les atomes arrivant en C</caption><thead><tr><th>B retiré</th><th>B inséré, deux sorties transmises</th></tr></thead><tbody><tr><td>{conditional(absent.plus, absent.incoming)}</td><td>{conditional(both.plus, both.incoming)}</td></tr></tbody></table></div><p className="scale-note">Transmettre les deux sorties après une mesure n’équivaut pas à retirer l’aimant : les résultats sont mélangés sans recombinaison cohérente.</p></div>
      <details className="theory-notes sg-theory"><summary>Repères théoriques</summary><div className="theory-grid">
        <div><span>Deux axes successifs</span><Formula display>{String.raw`$P(s_b\mid s_a)=\frac{1+s_as_b\cos(\alpha_b-\alpha_a)}{2}$`}</Formula><p>Avec <Formula>{String.raw`$s_a,s_b=\pm1$`}</Formula> et des axes dans le plan <Formula>$xz$</Formula>. Deux mesures sur le même axe reproduisent le résultat ; deux axes orthogonaux donnent 50 % / 50 %.</p></div>
        <div><span>Préparation et filtrage</span><Formula display>{String.raw`$P_\pm=\frac{1\pm\boldsymbol r\cdot\boldsymbol n}{2}$`}</Formula><p>Le four non polarisé correspond à <Formula>{String.raw`$\boldsymbol r=0$`}</Formula>. Sélectionner une sortie prépare l’état propre correspondant ; la probabilité totale d’un chemin est le produit des probabilités successives.</p></div>
        <div><span>Mesurer sans sélectionner</span><Formula display>{String.raw`$\rho'=\Pi_+\rho\Pi_++\Pi_-\rho\Pi_-$`}</Formula><p>Les <Formula>{String.raw`$\Pi_\pm$`}</Formula> sont les projecteurs sur les deux états propres. Les sorties sont transmises comme un mélange statistique, et non recombinées de façon à effacer l’information de chemin.</p></div>
        <div><span>Exemple du faisceau non polarisé</span><Formula display>{String.raw`$z{+}\ \to\ x{+}\ \to\ z{\pm}$`}</Formula><p>Après A : 50 % du faisceau initial. Après B : 25 %. En C : 12.5 % du faisceau initial dans chaque sortie, soit 50 % / 50 % des atomes qui atteignent C.</p></div>
      </div><p className="scale-note">Analyseurs et filtres idéaux pour un spin 1/2, sans pertes supplémentaires ni précession entre les appareils. L’animation représente les canaux de mesure, pas des trajectoires quantiques individuelles.</p></details>
    </div>
  </section>;
}
