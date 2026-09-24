import { useId } from 'react';
import { Math as Formula } from '@/components/math';
import type { PlotMarker } from '@/components/scientific-plot';

export function SternGerlachScreen({ points, range, scale }: { points: readonly { id: number; x: number; z: number; tone: PlotMarker['tone'] }[]; range: number; scale: number }) {
  const clip = `sg-screen-${useId().replaceAll(':', '')}`;
  const map = (value: number) => 150 + 150 * value / range;
  const colors = { accent: 'var(--accent)', teal: 'var(--teal)', ink: 'var(--foreground)', muted: 'var(--muted-foreground)' };
  return <div className="sg-screen-wrap">
    <div className="sg-screen">
      <svg viewBox="0 0 300 300" role="img" aria-label={`Écran de détection vu de face : ${points.length} impacts. Axes x et z, de ${(-range).toFixed(2)} à ${range.toFixed(2)} mm.`}>
        <defs><clipPath id={clip}><rect x="0" y="0" width="300" height="300" /></clipPath></defs>
        <path d="M 150 0 V 300 M 0 150 H 300" stroke="var(--line)" strokeDasharray="4 5" fill="none" />
        <g clipPath={`url(#${clip})`} opacity=".6">
          {points.map(p => <circle key={p.id} data-screen-impact={p.id} data-channel-tone={p.tone} cx={map(p.x)} cy={map(-p.z)} r={1.6 * scale} fill={colors[p.tone ?? 'ink']} />)}
        </g>
      </svg>
      <span className="sg-screen-z"><Formula>$z$</Formula></span>
      <span className="sg-screen-x"><Formula>$x$</Formula></span>
      {!points.length ? <p className="sg-screen-empty">En attente du faisceau</p> : null}
    </div>
    <p className="scale-note">Vue de face · axes à même échelle<br />de {(-range).toFixed(2)} à {range.toFixed(2)} mm</p>
  </div>;
}
