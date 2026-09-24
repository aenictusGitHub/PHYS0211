'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Math as Formula } from '@/components/math';
import { phaseRgb } from '@/lib/atomic';
import type { AtomicTerm } from '@/lib/atomic-dynamics';
import { sampleHydrogenCloud, hydrogenCloudAtPhase, projectCloudPoint, cloudAxisGraduations } from '@/lib/hydrogen-cloud';

const INITIAL_VIEW = { yaw: .65, pitch: .35 };
export function HydrogenCloud({ terms, phase, active, phaseColors, pointSize, pointCount = 20000 }: {
  terms: readonly AtomicTerm[]; phase: number; active: boolean; phaseColors: boolean; pointSize: number; pointCount?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [view, setView] = useState(INITIAL_VIEW), [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 640, height: 440 });
  const samples = useMemo(() => active ? sampleHydrogenCloud(terms, pointCount) : null, [active, terms, pointCount]);
  const points = useMemo(() => samples ? hydrogenCloudAtPhase(samples, phase) : [], [samples, phase]);
  const extent = samples?.extent ?? 1;
  const radius = Math.min(size.width, size.height) * .43;
  const ticks = useMemo(() => cloudAxisGraduations(extent, zoom, view.yaw, view.pitch, size.width, size.height), [extent, zoom, view, size]);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active || !canvas.current) return;
    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.current.width = Math.round(size.width * dpr); canvas.current.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size.width, size.height);
    const factor = radius * zoom / extent;
    ctx.strokeStyle = '#bcc9d8'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
    for (const axis of [{ x: extent, y: 0, z: 0 }, { x: 0, y: extent, z: 0 }, { x: 0, y: 0, z: extent }]) {
      const p = projectCloudPoint(axis, view.yaw, view.pitch);
      ctx.beginPath(); ctx.moveTo(size.width / 2 - p.x * radius / extent, size.height / 2 - p.y * radius / extent); ctx.lineTo(size.width / 2 + p.x * radius / extent, size.height / 2 + p.y * radius / extent); ctx.stroke();
    }
    ctx.setLineDash([]);
    const projected = points.map(p => ({ ...projectCloudPoint(p, view.yaw, view.pitch), phase: p.phase })).sort((a, b) => a.z - b.z);
    for (const p of projected) {
      const rgb = phaseColors ? phaseRgb(p.phase) : [140, 49, 92];
      ctx.fillStyle = `rgba(${rgb.join(',')},${.22 + .35 * (p.z / extent + 1) / 2})`;
      ctx.beginPath(); ctx.arc(size.width / 2 + p.x * factor, size.height / 2 + p.y * factor, pointSize, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.fillStyle = '#182a45'; ctx.beginPath(); ctx.arc(size.width / 2, size.height / 2, 2.5, 0, 2 * Math.PI); ctx.fill();
  }, [active, points, phaseColors, pointSize, size, view, extent, radius, zoom]);
  const turn = (dx: number, dy: number) => setView(current => ({ yaw: current.yaw + dx, pitch: Math.max(-1.55, Math.min(1.55, current.pitch + dy)) }));
  return <>
    <div className="angular-surface hydrogen-cloud" ref={frame}>
      <canvas ref={canvas} role="img" tabIndex={0} data-cloud-points={points.length} data-yaw={view.yaw} data-pitch={view.pitch}
        aria-label={`Nuage 3D de probabilité de présence : ${points.length} positions échantillonnées. Axes gradués en rayons de Bohr : ${[...new Set(ticks.map(tick => tick.value))].sort((a, b) => a - b).join(', ')} ; origine 0. Glissez ou utilisez les flèches pour tourner la vue.`}
        onPointerDown={event => { if (event.button !== 0 || drag.current) return; drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); }}
        onPointerMove={event => { const start = drag.current; if (!start || start.id !== event.pointerId) return; turn((event.clientX - start.x) * .009, (event.clientY - start.y) * .009); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; }}
        onPointerUp={event => { if (drag.current?.id !== event.pointerId) return; drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); turn(event.key === 'ArrowLeft' ? -.12 : event.key === 'ArrowRight' ? .12 : 0, event.key === 'ArrowUp' ? -.12 : event.key === 'ArrowDown' ? .12 : 0); }} />
      <svg className="cloud-axis-ticks" width={size.width} height={size.height} aria-hidden="true">
        {ticks.map(tick => <g key={`${tick.axis}:${tick.value}`} data-axis={tick.axis} data-value={tick.value}>
          <line x1={tick.x - 4 * tick.nx} y1={tick.y - 4 * tick.ny} x2={tick.x + 4 * tick.nx} y2={tick.y + 4 * tick.ny} />
          {tick.showLabel ? <text x={tick.labelX} y={tick.labelY}>{tick.label}</text> : null}
        </g>)}
        <text x={size.width / 2 + 12} y={size.height / 2 + 14}>0</text>
      </svg>
      {['x', 'y', 'z'].map((axis, i) => { const p = projectCloudPoint({ x: i === 0 ? 1 : 0, y: i === 1 ? 1 : 0, z: i === 2 ? 1 : 0 }, view.yaw, view.pitch); return <span className="surface-axis" key={axis} aria-hidden="true" style={{ left: size.width / 2 + radius * p.x, top: size.height / 2 + radius * p.y }}><Formula>{`$${axis}/a_0$`}</Formula></span>; })}
    </div>
    <div className="surface-toolbar">
      <p className="scale-note">Glissez pour tourner · flèches au clavier.</p>
      <Button variant="outline" aria-label="Dézoomer le nuage" disabled={zoom <= .6} onClick={() => setZoom(z => Math.max(.6, z - .2))}>−</Button>
      <Button variant="outline" aria-label="Zoomer le nuage" disabled={zoom >= 2.4} onClick={() => setZoom(z => Math.min(2.4, z + .2))}>+</Button>
      <Button variant="outline" size="icon" aria-label="Réinitialiser la vue du nuage" onClick={() => { setView(INITIAL_VIEW); setZoom(1); }}><RotateCcw aria-hidden="true" /></Button>
    </div>
    <p className="scale-note">Positions en unités de <Formula>$a_0$</Formula>, échantillonnées selon la densité sans dimension <Formula>{String.raw`$a_0^3|\psi(\mathbf r,t)|^2$`}</Formula> : plus les points sont nombreux dans un volume, plus la présence y est probable. Ce ne sont ni plusieurs électrons ni des trajectoires. Le point central repère le noyau.</p>
  </>;
}
