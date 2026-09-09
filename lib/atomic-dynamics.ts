import { angularWave, hydrogenRadial, type AtomicState, type HarmonicBasis } from './atomic';

export type AtomicTerm = AtomicState & { basis: HarmonicBasis };
export type AtomicPreset = { id: string; label: string; formula: string; description: string; terms: readonly AtomicTerm[] };
export type ComplexSamples = { real: Float64Array; imaginary: Float64Array };
const term = (n: number, l: number, m: number, basis: HarmonicBasis = 'complex'): AtomicTerm => ({ n, l, m, basis });

// Each preset is an equal, normalized superposition of two orthogonal states.
// phase = (E_b-E_a)t/hbar. The common phase exp(-i E_a t/hbar) is omitted.
export const ROTOR_PRESETS: readonly AtomicPreset[] = [
  { id: 'rotor-polar', label: 'Oscillation polaire', formula: String.raw`$\psi(0)=\frac{Y_0^0+Y_1^0}{\sqrt2}$`, terms: [term(1, 0, 0), term(2, 1, 0)], description: 'L’interférence fait osciller la probabilité entre les deux pôles, sans modifier les populations des niveaux.' },
  { id: 'rotor-rotation', label: 'Rotation azimutale', formula: String.raw`$\psi(0)=\frac{Y_0^0+Y_1^1}{\sqrt2}$`, terms: [term(1, 0, 0), term(2, 1, 1)], description: 'La densité tourne autour de l’axe z. Il s’agit du déplacement d’une distribution de probabilité, pas d’une trajectoire classique.' },
];
export const HYDROGEN_PRESETS: readonly AtomicPreset[] = [
  { id: 'hydrogen-breathing', label: 'Respiration radiale', formula: String.raw`$\psi(0)=\frac{\psi_{100}+\psi_{200}}{\sqrt2}$`, terms: [term(1, 0, 0), term(2, 0, 0)], description: 'L’interférence entre 1s et 2s fait respirer la distribution radiale. La probabilité totale reste égale à 1.' },
  { id: 'hydrogen-dipole', label: 'Oscillation dipolaire', formula: String.raw`$\psi(0)=\frac{\psi_{100}+\psi_{210}}{\sqrt2}$`, terms: [term(1, 0, 0), term(2, 1, 0)], description: 'La densité oscille de part et d’autre du noyau suivant z. La distribution radiale intégrée sur les angles reste constante.' },
  { id: 'hydrogen-rotation', label: 'Rotation de la densité', formula: String.raw`$\psi(0)=\frac{\psi_{211}+\psi_{322}}{\sqrt2}$`, terms: [term(2, 1, 1), term(3, 2, 2)], description: 'L’interférence de deux états de nombres magnétiques différents produit une densité tournante autour de z, sans trajectoire électronique imposée.' },
  { id: 'hydrogen-rydberg', label: 'Rydberg circulaires · 20 + 21', formula: String.raw`$\begin{aligned}\psi(0)=\tfrac1{\sqrt2}\big(&\psi_{20,19,19}\\&+\psi_{21,20,20}\big).\end{aligned}$`, terms: [term(20, 19, 19), term(21, 20, 20)], description: 'Deux états circulaires voisins forment une modulation tournante de l’anneau. Avec seulement deux composantes, cette modulation reste étendue : elle ne représente pas un électron ponctuel sur une orbite.' },
];

export function relativeFactors(count: number, phase: number) {
  return Array.from({ length: count }, (_, j) => ({ re: Math.cos(j * phase) / Math.sqrt(count), im: -Math.sin(j * phase) / Math.sqrt(count) }));
}

export function evolveSamples(basis: readonly ComplexSamples[], phase: number): ComplexSamples {
  return combineSamples(basis, relativeFactors(basis.length, phase));
}

export function combineSamples(basis: readonly ComplexSamples[], factors: readonly { re: number; im: number }[]): ComplexSamples {
  const real = new Float64Array(basis[0].real.length), imaginary = new Float64Array(real.length);
  for (let k = 0; k < basis.length; k++) {
    const source = basis[k], factor = factors[k];
    for (let j = 0; j < real.length; j++) {
      real[j] += source.real[j] * factor.re - source.imaginary[j] * factor.im;
      imaginary[j] += source.real[j] * factor.im + source.imaginary[j] * factor.re;
    }
  }
  return { real, imaginary };
}

/** Time-independent upper bound: animation never auto-rescales its colors/radii. */
export function basisDensityCeiling(basis: readonly ComplexSamples[], bounds?: readonly number[]) {
  let maximum = 0;
  for (let j = 0; j < basis[0].real.length; j++) {
    let sum = 0;
    basis.forEach((source, k) => { sum += Math.hypot(source.real[j], source.imaginary[j]) * (bounds?.[k] ?? 1 / Math.sqrt(basis.length)); });
    maximum = Math.max(maximum, sum * sum);
  }
  return maximum;
}

export function polarSuperposition(terms: readonly AtomicTerm[], theta: number, phase: number) {
  const factors = relativeFactors(terms.length, phase);
  const values = terms.map(term => angularWave(term.l, term.m, theta, 0));
  let density = 0;
  for (let a = 0; a < terms.length; a++) for (let b = 0; b < terms.length; b++) {
    if (terms[a].m !== terms[b].m) continue; // Exact integration over azimuth.
    density += values[a].re * values[b].re * (factors[a].re * factors[b].re + factors[a].im * factors[b].im);
  }
  return 2 * Math.PI * Math.sin(theta) * Math.max(0, density);
}

export function radialSuperposition(terms: readonly AtomicTerm[], radius: number, phase: number) {
  const a = hydrogenRadial(terms[0].n, terms[0].l, radius), b = hydrogenRadial(terms[1].n, terms[1].l, radius);
  const sameAngularState = terms[0].l === terms[1].l && terms[0].m === terms[1].m && terms[0].basis === terms[1].basis;
  return radius * radius * Math.max(0, (a * a + b * b) / 2 + (sameAngularState ? a * b * Math.cos(phase) : 0));
}
