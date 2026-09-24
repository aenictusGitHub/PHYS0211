'use client';

import { useId, useMemo, useRef, type PointerEvent } from 'react';
import { Math as Formula } from '@/components/math';
import { fieldVector, type SpinField, type Vector3 } from '@/lib/spin';
import { blochArrowMesh } from '@/lib/bloch-arrow';
import { projectBloch as project, dragBlochVector, turnBlochVector } from '@/lib/bloch-interaction';

// Orthographic projection: all three axes remain legible without a moving camera.
function path(points: Vector3[]) {
  return points.map((p, i) => { const q = project(p); return `${i ? 'L' : 'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`; }).join(' ');
}
const circles = [0, 1, 2].map(plane => Array.from({ length: 121 }, (_, i): Vector3 => {
  const a = 2 * Math.PI * i / 120, c = Math.cos(a), s = Math.sin(a);
  return plane === 0 ? [c, s, 0] : plane === 1 ? [c, 0, s] : [0, c, s];
}));
const axes = [{ label: '$x$', v: [1.2, 0, 0] }, { label: '$y$', v: [0, 1.2, 0] }, { label: '$z$', v: [0, 0, 1.2] }] as { label: string; v: Vector3 }[];

export function BlochSphere({ vector, field, orbit, onVectorChange, onFieldChange }: {
  vector: Vector3; field: SpinField | Vector3; orbit: Vector3[];
  onVectorChange: (value: Vector3) => void; onFieldChange: (value: Vector3) => void;
}) {
  const id = useId().replaceAll(':', ''), b = fieldVector(field), bEnd = project(b.map(v => v * 1.25) as Vector3), bStart = project(b.map(v => -v * 1.25) as Vector3);
  const drag = useRef<{ initial: Vector3; x: number; y: number; target: 'spin' | 'field'; pointerId: number } | null>(null);
  const arrow = useMemo(() => [
    ...blochArrowMesh(vector).map(face => ({ ...face, tone: 'var(--lab-tone)' })),
    ...blochArrowMesh(b.map(value => value * 1.25) as Vector3, .45, .10).map(face => ({ ...face, tone: 'var(--accent)' })),
  ].map(face => ({
    ...face, depth: face.points.reduce((sum, point) => sum + project(point).depth, 0) / face.points.length,
  })).sort((a, b) => a.depth - b.depth), [vector, field]);
  const pointer = (event: PointerEvent<SVGCircleElement>) => {
    const matrix = event.currentTarget.ownerSVGElement?.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  };
  const update = (target: 'spin' | 'field', value: Vector3) => (target === 'spin' ? onVectorChange : onFieldChange)(value);
  const stop = (event: PointerEvent<SVGCircleElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="bloch-interactive"><div className="bloch-frame">
    <svg viewBox="0 0 440 410" role="group" aria-label={`Sphère de Bloch interactive. Composantes du spin : x ${vector[0].toFixed(2)}, y ${vector[1].toFixed(2)}, z ${vector[2].toFixed(2)}.`}>
      <defs><radialGradient id={`${id}-sphere`} cx="35%" cy="25%" r="80%"><stop offset="0" stopColor="var(--lab-tint)" /><stop offset="1" stopColor="var(--lab-tone)" stopOpacity=".12" /></radialGradient></defs>
      <circle cx="220" cy="200" r="145" fill={`url(#${id}-sphere)`} stroke="var(--line)" />
      {circles.map((circle, i) => <path key={i} d={path(circle)} fill="none" stroke="var(--muted-foreground)" strokeOpacity=".25" strokeDasharray={i === 0 ? undefined : '3 5'} />)}
      {axes.map(({ label, v }) => { const end = project(v), start = project(v.map(n => -n) as Vector3); return <line key={label} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="var(--muted-foreground)" strokeOpacity=".4" />; })}
      <line x1={bStart.x} y1={bStart.y} x2={bEnd.x} y2={bEnd.y} stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="6 5" />
      {orbit.slice(1).map((v, i) => <path key={i} d={path([orbit[i], v])} fill="none" stroke="var(--lab-tone)" strokeWidth="2" strokeOpacity={project(v).depth < 0 ? .2 : .55} />)}
      <circle cx="220" cy="200" r="3.5" fill="var(--foreground)" />
      <g data-bloch-arrow="3d" aria-hidden="true" strokeLinejoin="round">
        {arrow.map((face, i) => {
          const color = `color-mix(in srgb, ${face.tone}, ${face.light > 0 ? 'white' : 'black'} ${Math.round(Math.abs(face.light) * (face.light > 0 ? 32 : 42))}%)`;
          return <path key={i} d={`${path(face.points)} Z`} fill={color} stroke={color} strokeWidth=".35" />;
        })}
      </g>
      {(['spin', 'field'] as const).map(target => {
        const value = target === 'spin' ? vector : b, end = target === 'spin' ? project(vector) : bEnd;
        const label = target === 'spin' ? 'Orienter le spin initial' : 'Orienter le champ magnétique';
        return <circle key={target} className="bloch-drag-handle" cx={end.x} cy={end.y} r="11" fill="transparent" stroke={target === 'spin' ? 'var(--lab-tone)' : 'var(--accent)'} strokeWidth="1.3"
          tabIndex={0} role="button" aria-label={`${label}. x ${value[0].toFixed(2)}, y ${value[1].toFixed(2)}, z ${value[2].toFixed(2)}`} aria-describedby={`${id}-help`}
          onPointerDown={event => {
            if (event.button !== 0 || drag.current) return;
            const p = pointer(event); if (!p) return;
            event.preventDefault(); event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { initial: [...value], x: p.x, y: p.y, target, pointerId: event.pointerId };
            update(target, value);
          }}
          onPointerMove={event => {
            const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
            const p = pointer(event); if (!p) return;
            update(current.target, dragBlochVector(current.initial, p.x - current.x, p.y - current.y, current.target === 'field' ? 1.25 : 1, event.shiftKey));
          }}
          onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) return;
            event.preventDefault(); update(target, turnBlochVector(value, event.key));
          }}><title>{label}</title></circle>;
      })}
    </svg>
    {axes.map(({ label, v }) => { const p = project(v.map(value => value * 1.4 / 1.2) as Vector3); return <span key={label} className="bloch-axis" style={{ left: `${p.x / 4.4}%`, top: `${p.y / 4.1}%` }}><Formula>{label}</Formula></span>; })}
    <span className="bloch-axis bloch-field-label" style={{ left: `calc(${bEnd.x / 4.4}% + 16px)`, top: `calc(${bEnd.y / 4.1}% - 16px)` }}><Formula className="bloch-field-symbol">{String.raw`$\mathbf{B}$`}</Formula></span>
  </div><p id={`${id}-help`} className="scale-note bloch-drag-help">Glissez une extrémité pour orienter le spin initial ou le champ <Formula className="bloch-field-symbol">{String.raw`$\mathbf{B}$`}</Formula>. Maj pendant le glissement : autre hémisphère. Au clavier : flèches, espace pour changer d’hémisphère. L’évolution revient à <Formula>$t=0$</Formula>.</p></div>;
}
