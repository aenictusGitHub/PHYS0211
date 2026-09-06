'use client';

import { useId } from 'react';
import { Math as Formula } from '@/components/math';
import { fieldVector, type SpinField, type Vector3 } from '@/lib/spin';

// Orthographic projection: all three axes remain legible without a moving camera.
function project([x, y, z]: Vector3) {
  return { x: 220 + 145 * (.8660254 * x - .5 * y), y: 200 - 145 * (-.25 * x - .4330127 * y + .8660254 * z), depth: .4330127 * x + .75 * y + .5 * z };
}
function path(points: Vector3[]) {
  return points.map((p, i) => { const q = project(p); return `${i ? 'L' : 'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`; }).join(' ');
}
const circles = [0, 1, 2].map(plane => Array.from({ length: 121 }, (_, i): Vector3 => {
  const a = 2 * Math.PI * i / 120, c = Math.cos(a), s = Math.sin(a);
  return plane === 0 ? [c, s, 0] : plane === 1 ? [c, 0, s] : [0, c, s];
}));
const axes = [{ label: '$x$', v: [1.2, 0, 0] }, { label: '$y$', v: [0, 1.2, 0] }, { label: '$z$', v: [0, 0, 1.2] }] as { label: string; v: Vector3 }[];

export function BlochSphere({ vector, field, orbit }: { vector: Vector3; field: SpinField; orbit: Vector3[] }) {
  const id = useId().replaceAll(':', ''), point = project(vector), b = fieldVector(field), bEnd = project(b.map(v => v * 1.15) as Vector3), bStart = project(b.map(v => -v * 1.15) as Vector3);
  return <div className="bloch-frame">
    <svg viewBox="0 0 440 410" role="img" aria-label={`Sphère de Bloch. Composantes du spin : x ${vector[0].toFixed(2)}, y ${vector[1].toFixed(2)}, z ${vector[2].toFixed(2)}.`}>
      <defs><radialGradient id={`${id}-sphere`} cx="35%" cy="25%" r="80%"><stop offset="0" stopColor="var(--lab-tint)" /><stop offset="1" stopColor="var(--lab-tone)" stopOpacity=".12" /></radialGradient>
        <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="var(--lab-tone)" /></marker></defs>
      <circle cx="220" cy="200" r="145" fill={`url(#${id}-sphere)`} stroke="var(--line)" />
      {circles.map((circle, i) => <path key={i} d={path(circle)} fill="none" stroke="var(--muted-foreground)" strokeOpacity=".25" strokeDasharray={i === 0 ? undefined : '3 5'} />)}
      {axes.map(({ label, v }) => { const end = project(v), start = project(v.map(n => -n) as Vector3); return <line key={label} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="var(--muted-foreground)" strokeOpacity=".4" />; })}
      <line x1={bStart.x} y1={bStart.y} x2={bEnd.x} y2={bEnd.y} stroke="var(--teal)" strokeWidth="2" strokeDasharray="6 5" />
      {orbit.slice(1).map((v, i) => <path key={i} d={path([orbit[i], v])} fill="none" stroke="var(--lab-tone)" strokeWidth="2" strokeOpacity={project(v).depth < 0 ? .2 : .55} />)}
      <circle cx="220" cy="200" r="3.5" fill="var(--foreground)" />
      <line x1="220" y1="200" x2={point.x} y2={point.y} stroke="var(--lab-tone)" strokeWidth="3.5" markerEnd={`url(#${id}-arrow)`} />
      <circle cx={point.x} cy={point.y} r="6" fill="var(--lab-tone)" stroke="var(--paper)" strokeWidth="2" />
    </svg>
    {axes.map(({ label, v }) => { const p = project(v); return <span key={label} className="bloch-axis" style={{ left: `${p.x / 4.4}%`, top: `${p.y / 4.1}%` }}><Formula>{label}</Formula></span>; })}
  </div>;
}
