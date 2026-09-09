'use client';

import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { Math as Formula } from '@/components/math';
import { Button } from '@/components/ui/button';
import { CompactStepper } from '@/components/compact-stepper';
import { boundCoherentPoint, coherentSuperposition, COHERENT_RADIUS, MAX_COHERENT_STATES, type CoherentPacket } from '@/lib/anharmonic-oscillator';

const EDGE = 28, SIDE = 300, CENTER = SIDE / 2, UNIT = (CENTER - EDGE) / COHERENT_RADIUS;
const TONES = ['#087f80', '#be4a2f', '#6950bd', '#2563a6', '#996417', '#ad3e78'];

export function CoherentStateEditor({ initial, onApply }: { initial: CoherentPacket[]; onApply: (packets: CoherentPacket[]) => void }) {
  const [packets, setPackets] = useState(initial);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const drag = useRef<number | null>(null);
  const packet = packets[selected];
  const error = useMemo(() => {
    try { coherentSuperposition(packets); return ''; }
    catch (cause) { return cause instanceof Error ? cause.message : 'État initial invalide.'; }
  }, [packets]);
  const update = (index: number, patch: Partial<CoherentPacket>) => {
    setPackets(current => current.map((p, j) => j === index ? { ...p, ...patch } : p));
    setDirty(true);
  };
  const position = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return boundCoherentPoint(((event.clientX - rect.left) * SIDE / rect.width - CENTER) / UNIT,
      (CENTER - (event.clientY - rect.top) * SIDE / rect.height) / UNIT);
  };
  const add = (point = { re: 0, im: 0 }) => {
    if (packets.length >= MAX_COHERENT_STATES) return;
    setPackets([...packets, { ...point, amplitude: 1, phase: 0 }]);
    setSelected(packets.length); setDirty(true);
  };

  return <section className="coherent-editor" aria-labelledby="coherent-editor-title">
    <div className="coherent-editor-heading">
      <h3 id="coherent-editor-title">Composer dans le plan complexe</h3>
      <p>Cliquez pour ajouter un état ; déplacez les points pour choisir <Formula>{String.raw`$\alpha_j$`}</Formula>. Appliquez ensuite la superposition.</p>
    </div>
    <div className="coherent-editor-grid">
      <div className="coherent-plane">
        <div className="coherent-axis-top"><Formula>{String.raw`$\operatorname{Im}\alpha$`}</Formula></div>
        <svg viewBox={`0 0 ${SIDE} ${SIDE}`} role="group" aria-label="Plan complexe des états cohérents" className="coherent-plane-svg"
          onPointerDown={event => {
            const target = event.target as SVGElement;
            const index = target.closest('[data-packet]')?.getAttribute('data-packet');
            if (index !== null && index !== undefined) { drag.current = Number(index); setSelected(Number(index)); }
            else if (packets.length < MAX_COHERENT_STATES) { drag.current = packets.length; add(position(event)); }
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => { if (drag.current !== null) update(drag.current, position(event)); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <circle cx={CENTER} cy={CENTER} r={UNIT * COHERENT_RADIUS} className="coherent-plane-bound" />
          {[-2, -1, 0, 1, 2].map(tick => <g key={tick} aria-hidden="true">
            <path d={`M ${CENTER + tick * UNIT} ${EDGE} V ${SIDE - EDGE} M ${EDGE} ${CENTER - tick * UNIT} H ${SIDE - EDGE}`} className={tick === 0 ? 'coherent-plane-axis' : 'coherent-plane-grid'} />
            <text x={CENTER + tick * UNIT} y={SIDE - 9} textAnchor="middle">{tick}</text>
            {tick !== 0 ? <text x={EDGE - 8} y={CENTER - tick * UNIT + 5} textAnchor="end">{tick}</text> : null}
          </g>)}
          {packets.map((p, index) => <g key={index} data-packet={index} role="button" tabIndex={0}
            aria-label={`État cohérent ${index + 1}, partie réelle ${p.re.toFixed(2)}, partie imaginaire ${p.im.toFixed(2)}`}
            aria-pressed={selected === index}
            onFocus={() => setSelected(index)}
            onKeyDown={event => {
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault(); update(index, boundCoherentPoint(p.re + (event.key === 'ArrowRight' ? .1 : event.key === 'ArrowLeft' ? -.1 : 0), p.im + (event.key === 'ArrowUp' ? .1 : event.key === 'ArrowDown' ? -.1 : 0)));
              } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(index); }
            }}>
            <circle cx={CENTER + p.re * UNIT} cy={CENTER - p.im * UNIT} r={selected === index ? 14 : 11} fill={TONES[index]} className="coherent-point" />
            <text x={CENTER + p.re * UNIT} y={CENTER - p.im * UNIT + 5} textAnchor="middle" className="coherent-point-number">{index + 1}</text>
          </g>)}
        </svg>
        <div className="coherent-axis-bottom"><Formula>{String.raw`$\operatorname{Re}\alpha\quad (|\alpha|\leq 2.5)$`}</Formula></div>
      </div>
      <div className="coherent-packet-controls">
        <div className="coherent-packet-tabs" role="group" aria-label="État cohérent à modifier">
          {packets.map((_, index) => <Button key={index} variant="outline" aria-label={`Modifier l’état cohérent ${index + 1}`} aria-pressed={selected === index}
            className={selected === index ? 'is-selected' : ''} onClick={() => setSelected(index)}>
            <Formula>{`$|\\alpha_${index + 1}\\rangle$`}</Formula>
          </Button>)}
          <Button variant="outline" disabled={packets.length >= MAX_COHERENT_STATES} onClick={() => add()} aria-label="Ajouter un état cohérent">+</Button>
        </div>
        <div className="coherent-number-grid">
          <CompactStepper id="coherent-re" label={<Formula>{String.raw`$\operatorname{Re}\alpha_j$`}</Formula>} value={packet.re} min={-COHERENT_RADIUS} max={COHERENT_RADIUS} step={.05}
            onChange={re => update(selected, boundCoherentPoint(re, packet.im))} description="Partie réelle de alpha pour l’état sélectionné" />
          <CompactStepper id="coherent-im" label={<Formula>{String.raw`$\operatorname{Im}\alpha_j$`}</Formula>} value={packet.im} min={-COHERENT_RADIUS} max={COHERENT_RADIUS} step={.05}
            onChange={im => update(selected, boundCoherentPoint(packet.re, im))} description="Partie imaginaire de alpha pour l’état sélectionné" />
          <CompactStepper id="coherent-amplitude" label={<>Amplitude <Formula>{'$A_j$'}</Formula></>} value={packet.amplitude} min={0} max={2} step={.05}
            onChange={amplitude => update(selected, { amplitude })} description="Amplitude relative, avant normalisation de la superposition" />
          <CompactStepper id="coherent-phase" label={<>Phase <Formula>{String.raw`$\theta_j\ ({}^\circ)$`}</Formula></>} value={packet.phase * 180 / Math.PI} min={-180} max={180} step={5}
            onChange={degrees => update(selected, { phase: degrees * Math.PI / 180 })} description="Phase du coefficient de superposition, en degrés" />
        </div>
        <Button variant="ghost" disabled={packets.length === 1} onClick={() => { setPackets(packets.filter((_, j) => j !== selected)); setSelected(Math.max(0, selected - 1)); setDirty(true); }}>Retirer cet état</Button>
        <p className="scale-note">Les amplitudes sont normalisées ensemble, en tenant compte du recouvrement entre états.</p>
        {error ? <p className="coherent-error" role="alert">{error}</p> : null}
        <Button disabled={!!error} onClick={() => { onApply(packets.map(p => ({ ...p }))); setDirty(false); }}>Appliquer la superposition</Button>
        <p className="scale-note" role="status">{dirty ? 'Modifications non appliquées.' : 'Superposition appliquée.'}</p>
      </div>
    </div>
  </section>;
}
