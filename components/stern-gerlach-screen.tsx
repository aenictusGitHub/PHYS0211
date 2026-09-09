import { useId } from 'react';
import { Math as Formula } from '@/components/math';

export function SternGerlachScreen({ points, range, scale }: { points: readonly { x: number; z: number }[]; range: number; scale: number }) {
  const clip = `sg-screen-${useId().replaceAll(':', '')}`;
  const map = (value: number) => 150 + 138 * value / range;
  return <div className="sg-screen-wrap">
    <div className="sg-screen">
      <svg viewBox="0 0 300 300" role="img" aria-label={`Écran de détection vu de face : ${points.length} impacts. Axes x et z, de ${(-range).toFixed(2)} à ${range.toFixed(2)} mm.`}>
        <defs><clipPath id={clip}><rect x="0" y="0" width="300" height="300" /></clipPath></defs>
        <path d="M 150 0 V 300 M 0 150 H 300" stroke="var(--line)" strokeDasharray="4 5" fill="none" />
        <g clipPath={`url(#${clip})`} fill="var(--lab-tone)" opacity=".55">
          {points.map((p, i) => <circle key={i} cx={map(p.x)} cy={map(-p.z)} r={1.5 * scale} />)}
        </g>
      </svg>
      <span className="sg-screen-z"><Formula>$z$</Formula></span>
      <span className="sg-screen-x"><Formula>$x$</Formula></span>
      {!points.length ? <p className="sg-screen-empty">En attente du faisceau</p> : null}
    </div>
    <p className="scale-note">Vue de face · même échelle sur les deux axes<br />de {(-range).toFixed(2)} à {range.toFixed(2)} mm</p>
  </div>;
}
