'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, RotateCcw, Rotate3D } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Math as Formula } from '@/components/math';
import { sphericalHarmonic, phaseRgb } from '@/lib/atomic';
import { angularSurfaceReference, combineSamples, evolveSamples, type AtomicTerm } from '@/lib/atomic-dynamics';
import { ROTOR_RESOLUTION_DEFAULT, rotorSurfaceGrid } from '@/lib/rotor-resolution';

type Vertex = { x: number; y: number; z: number };
type Face = { indices: number[]; phase: number };

function project(point: Vertex, yaw: number, pitch: number) {
  const u = Math.cos(yaw) * point.x - Math.sin(yaw) * point.y;
  const v = Math.sin(yaw) * point.x + Math.cos(yaw) * point.y;
  return { x: u, y: Math.sin(pitch) * v - Math.cos(pitch) * point.z, z: Math.cos(pitch) * v + Math.sin(pitch) * point.z };
}

export function AngularSurface({ l, m, active, phaseColors, evolutionTerms, phase = 0, waveBasis, waveCoefficients, coefficientBounds, resolution = ROTOR_RESOLUTION_DEFAULT }: {
  l: number; m: number; active: boolean; phaseColors: boolean; evolutionTerms?: readonly AtomicTerm[]; phase?: number;
  waveBasis?: readonly { l: number; m: number }[];
  waveCoefficients?: readonly { re: number; im: number }[];
  coefficientBounds?: readonly number[];
  resolution?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 640, height: 400 });
  const [view, setView] = useState({ yaw: .65, pitch: .35 });
  const [rotating, setRotating] = useState(false);
  const terms = useMemo(() => waveBasis ?? evolutionTerms ?? [{ l, m }], [l, m, evolutionTerms, waveBasis]);
  const maximum = useMemo(() => angularSurfaceReference(terms, coefficientBounds), [terms, coefficientBounds]);
  const sampled = useMemo(() => {
    const { angles, directions, faces } = rotorSurfaceGrid(resolution);
    const basis = terms.map(term => {
      const real = new Float64Array(angles.length), imaginary = new Float64Array(angles.length);
      angles.forEach((point, index) => { const value = sphericalHarmonic(term.l, term.m, point.theta, point.phi); real[index] = value.re; imaginary[index] = value.im; });
      return { real, imaginary };
    });
    return { basis, directions, faces };
  }, [terms, resolution]);
  const mesh = useMemo(() => {
    const values = waveCoefficients ? combineSamples(sampled.basis, waveCoefficients) : evolveSamples(sampled.basis, phase);
    const vertices = sampled.directions.map((direction, index) => {
      const radius = (values.real[index] ** 2 + values.imaginary[index] ** 2) / maximum;
      return { x: radius * direction.x, y: radius * direction.y, z: radius * direction.z };
    });
    const faces: Face[] = sampled.faces.map(face => ({ indices: face.indices, phase: Math.atan2(values.imaginary[face.sample], values.real[face.sample]) }));
    return { vertices, faces };
  }, [sampled, phase, waveCoefficients, maximum]);

  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active || !rotating) return;
    let handle = 0, previous: number | undefined;
    const animate = (now: number) => {
      if (previous !== undefined) {
        const delta = Math.min(now - previous, 60) * .0003;
        setView(current => ({ ...current, yaw: current.yaw + delta }));
      }
      previous = now;
      handle = requestAnimationFrame(animate);
    };
    handle = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(handle);
  }, [active, rotating]);

  const radius = Math.min(size.width * .36, size.height * .38);
  const axes = [{ name: 'x', point: { x: 1.3, y: 0, z: 0 } }, { name: 'y', point: { x: 0, y: 1.3, z: 0 } }, { name: 'z', point: { x: 0, y: 0, z: 1.3 } }];
  useEffect(() => {
    if (!active || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.current.width = Math.round(size.width * ratio);
    canvas.current.height = Math.round(size.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const projected = mesh.vertices.map(point => project(point, view.yaw, view.pitch));
    context.strokeStyle = '#c5d1df';
    context.lineWidth = 1;
    context.setLineDash([4, 5]);
    for (const axis of [{ x: 1.25, y: 0, z: 0 }, { x: 0, y: 1.25, z: 0 }, { x: 0, y: 0, z: 1.25 }]) {
      const end = project(axis, view.yaw, view.pitch);
      context.beginPath();
      context.moveTo(size.width / 2 - end.x * radius, size.height / 2 - end.y * radius);
      context.lineTo(size.width / 2 + end.x * radius, size.height / 2 + end.y * radius);
      context.stroke();
    }
    context.setLineDash([]);
    const sorted = mesh.faces.map(face => ({ ...face, depth: face.indices.reduce((sum, i) => sum + projected[i].z, 0) / 4 })).sort((a, b) => a.depth - b.depth);
    for (const face of sorted) {
      const points = face.indices.map(i => projected[i]);
      const u = { x: points[2].x - points[0].x, y: points[2].y - points[0].y, z: points[2].z - points[0].z };
      const v = { x: points[3].x - points[1].x, y: points[3].y - points[1].y, z: points[3].z - points[1].z };
      const normal = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
      const length = Math.hypot(normal.x, normal.y, normal.z);
      if (length < 1e-10) continue;
      const shade = .7 + .3 * Math.abs((normal.x * .2 - normal.y * .4 + normal.z * .89) / length);
      const rgb = phaseColors ? phaseRgb(face.phase) : [187, 126, 31];
      context.fillStyle = `rgb(${rgb.map(value => Math.round(value * shade)).join(',')})`;
      context.beginPath();
      points.forEach((point, i) => {
        const x = size.width / 2 + radius * point.x, y = size.height / 2 + radius * point.y;
        if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.closePath();
      context.fill();
      context.strokeStyle = context.fillStyle;
      context.lineWidth = .45;
      context.stroke();
    }
  }, [active, mesh, phaseColors, radius, size, view]);

  return <>
    <div ref={frame} className="angular-surface" role="group" aria-label="Vue tridimensionnelle orientable">
      <canvas ref={canvas} tabIndex={0} role="img" data-resolution={resolution} data-faces={mesh.faces.length} aria-label={`${waveBasis ? 'Densité angulaire du rotateur dans le champ orientant' : evolutionTerms ? 'Densité angulaire évolutive d’une superposition' : `Surface de probabilité angulaire pour ell égal à ${l}, m égal à ${m}`}. Résolution : ${resolution} subdivisions polaires. Utilisez les flèches pour tourner la vue.`}
        onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); setRotating(false); }}
        onPointerMove={event => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
          drag.current = { x: event.clientX, y: event.clientY };
          setView(current => ({ yaw: current.yaw + dx * .009, pitch: Math.max(-1.3, Math.min(1.3, current.pitch + dy * .009)) }));
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); setRotating(false);
          setView(current => ({ yaw: current.yaw + (event.key === 'ArrowLeft' ? -.12 : event.key === 'ArrowRight' ? .12 : 0), pitch: Math.max(-1.3, Math.min(1.3, current.pitch + (event.key === 'ArrowUp' ? -.12 : event.key === 'ArrowDown' ? .12 : 0))) }));
        }} />
      {axes.map(axis => { const p = project(axis.point, view.yaw, view.pitch); return <span key={axis.name} className="surface-axis" aria-hidden="true" style={{ left: size.width / 2 + radius * p.x, top: size.height / 2 + radius * p.y }}><Formula>{`$${axis.name}$`}</Formula></span>; })}
    </div>
    <div className="surface-toolbar">
      <p className="scale-note">Glissez sur la surface ou utilisez les flèches.</p>
      <Button variant="outline" onClick={() => setRotating(current => !current)}>{rotating ? <Pause aria-hidden="true" /> : <Rotate3D aria-hidden="true" />}{rotating ? 'Arrêter la vue' : 'Tourner la vue'}</Button>
      <Button variant="outline" size="icon" aria-label="Réinitialiser la vue du rotateur" onClick={() => { setView({ yaw: .65, pitch: .35 }); setRotating(false); }}><RotateCcw aria-hidden="true" /></Button>
    </div>
  </>;
}

export function PhaseLegend() {
  return <div className="phase-key" aria-label="Couleur de la phase de moins pi à pi">
    <span>Phase</span><div><div className="phase-gradient" /><div className="range-labels"><Formula>{String.raw`$-\pi$`}</Formula><Formula>{'$0$'}</Formula><Formula>{String.raw`$\pi$`}</Formula></div></div>
  </div>;
}
