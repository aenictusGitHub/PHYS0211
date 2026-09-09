'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Math as Formula } from '@/components/math';
import { hydrogenWave, phaseRgb, sliceCoordinates, type AtomicState, type HarmonicBasis, type OrbitalPlane } from '@/lib/atomic';
import { basisDensityCeiling, evolveSamples, type AtomicTerm } from '@/lib/atomic-dynamics';

const RESOLUTION = 241;

export function HydrogenSlice({ state, basis, plane, extent, phaseColors, active, evolutionTerms, phase = 0, densityScale = 1 }: {
  state: AtomicState; basis: HarmonicBasis; plane: OrbitalPlane; extent: number; phaseColors: boolean; active: boolean;
  evolutionTerms?: readonly AtomicTerm[]; phase?: number; densityScale?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sampled = useMemo(() => {
    if (!active) return null;
    const terms = evolutionTerms ?? [{ ...state, basis }];
    const samples = terms.map(term => {
      const real = new Float64Array(RESOLUTION ** 2), imaginary = new Float64Array(RESOLUTION ** 2);
      for (let row = 0; row < RESOLUTION; row++) {
        const vertical = extent * (1 - 2 * row / (RESOLUTION - 1));
        for (let column = 0; column < RESOLUTION; column++) {
          const x = extent * (2 * column / (RESOLUTION - 1) - 1);
          const value = hydrogenWave(term, ...sliceCoordinates(x, vertical, plane), term.basis);
          const index = row * RESOLUTION + column;
          real[index] = value.re; imaginary[index] = value.im;
        }
      }
      return { real, imaginary };
    });
    return { samples, maximum: basisDensityCeiling(samples) };
  }, [active, basis, extent, plane, state, evolutionTerms]);
  const field = useMemo(() => sampled ? { ...evolveSamples(sampled.samples, phase), maximum: sampled.maximum, nodal: sampled.maximum < 1e-24 } : null, [sampled, phase]);

  useEffect(() => {
    if (!active || !canvas.current || !field) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const pixels = context.createImageData(RESOLUTION, RESOLUTION);
    for (let j = 0; j < field.real.length; j++) {
      const density = field.real[j] ** 2 + field.imaginary[j] ** 2;
      const brightness = field.nodal ? 0 : Math.pow(Math.min(1, densityScale * density / field.maximum), .32);
      const color = phaseColors ? phaseRgb(Math.atan2(field.imaginary[j], field.real[j])) : [50, 91, 171];
      for (let k = 0; k < 3; k++) pixels.data[4 * j + k] = Math.round(255 + brightness * (color[k] - 255));
      pixels.data[4 * j + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  }, [active, field, phaseColors, densityScale]);

  return <>
    <div className="hydrogen-slice-frame">
      <div className="hydrogen-slice">
        <canvas ref={canvas} width={RESOLUTION} height={RESOLUTION} role="img"
          aria-label={`Coupe ${plane} ${evolutionTerms ? 'de la superposition évolutive' : `de l’orbitale n ${state.n}, ell ${state.l}, m ${state.m}, base ${basis === 'real' ? 'réelle' : 'complexe'}`}, de moins ${extent} à plus ${extent} rayons de Bohr. ${field?.nodal ? 'Ce plan est nodal.' : 'La saturation représente la densité de probabilité.'}`} />
        <div className="slice-axis horizontal" aria-hidden="true" /><div className="slice-axis vertical" aria-hidden="true" />
        <span className="slice-origin" aria-hidden="true" />
        <div className="slice-ticks" aria-hidden="true"><span>−{extent.toLocaleString('en-US', { useGrouping: false })}</span><span>0</span><span>{extent.toLocaleString('en-US', { useGrouping: false })}</span></div>
        <span className="slice-x-label" aria-hidden="true"><Formula>{`$${plane === 'oblique' ? 'u' : plane === 'yz' ? 'y' : 'x'}/a_0$`}</Formula></span>
        <span className="slice-y-label" aria-hidden="true"><Formula>{`$${plane === 'oblique' ? 'v' : plane === 'xy' ? 'y' : 'z'}/a_0$`}</Formula></span>
      </div>
    </div>
    {field?.nodal ? <p className="nodal-notice" role="status">Ce plan est un plan nodal : la fonction d’onde y est nulle. Choisissez la coupe oblique pour voir l’orbitale.</p> : null}
    {plane === 'oblique' ? <p className="scale-note">Plan <Formula>{'$x+y+z=0$'}</Formula>, dans les coordonnées orthonormées <Formula>{String.raw`$u=(x-y)/\sqrt2$`}</Formula> et <Formula>{String.raw`$v=(x+y-2z)/\sqrt6$`}</Formula>.</p> : null}
    <p className="scale-note">Coupe au centre du noyau, et non projection. Contraste renforcé : la saturation suit <Formula>{String.raw`$\min(1,s|\psi|^2/\rho_{\mathrm{ref}})^{0.32}$`}</Formula>, avec une référence fixe pendant l’animation. Le facteur <Formula>$s$</Formula> ne modifie que le contraste. Les zones blanches correspondent aux faibles densités et aux nœuds.</p>
  </>;
}
