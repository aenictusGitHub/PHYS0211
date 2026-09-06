/** Analytic states: Condon–Shortley spherical harmonics and hydrogen in a0 units. */
export type AtomicState = { n: number; l: number; m: number };
export type HarmonicBasis = 'complex' | 'real';
export type OrbitalPlane = 'xz' | 'xy' | 'yz' | 'oblique';
export const ROTOR_L_MAX = 5;
export const HYDROGEN_N_MAX = 5;
export const RYDBERG_N_MIN = 10;
export const RYDBERG_N_MAX = 40;

function factorial(n: number) {
  let result = 1;
  for (let j = 2; j <= n; j++) result *= j;
  return result;
}

export function validAngularNumbers(l: number, m: number) {
  return Number.isInteger(l) && l >= 0 && l < RYDBERG_N_MAX && Number.isInteger(m) && Math.abs(m) <= l;
}

export function associatedLegendre(l: number, m: number, x: number) {
  const z = Math.max(-1, Math.min(1, x));
  let pmm = 1;
  for (let j = 1; j <= m; j++) pmm *= -(2 * j - 1) * Math.sqrt(Math.max(0, 1 - z * z));
  if (l === m) return pmm;
  let previous = pmm, current = z * (2 * m + 1) * pmm;
  for (let k = m + 2; k <= l; k++) {
    const next = ((2 * k - 1) * z * current - (k + m - 1) * previous) / (k - m);
    previous = current;
    current = next;
  }
  return current;
}

export function sphericalHarmonic(l: number, m: number, theta: number, phi: number) {
  if (!validAngularNumbers(l, m)) throw new Error('Nombres angulaires non valides.');
  const k = Math.abs(m);
  const amplitude = Math.sqrt((2 * l + 1) * factorial(l - k) / (4 * Math.PI * factorial(l + k)))
    * associatedLegendre(l, k, Math.cos(theta));
  const sign = m < 0 && k % 2 !== 0 ? -1 : 1;
  return { re: sign * amplitude * Math.cos(m * phi), im: sign * amplitude * Math.sin(m * phi) };
}

// Real tesseral basis: m>0 is cosine, m<0 sine; m is an index here,
// not an Lz eigenvalue. The phases give the conventional px/py/pz signs.
export function angularWave(l: number, m: number, theta: number, phi: number, basis: HarmonicBasis = 'complex') {
  if (basis === 'complex' || m === 0) return sphericalHarmonic(l, m, theta, phi);
  const harmonic = sphericalHarmonic(l, Math.abs(m), theta, phi);
  return { re: Math.SQRT2 * (-1) ** Math.abs(m) * (m > 0 ? harmonic.re : harmonic.im), im: 0 };
}

export function angularDensity(l: number, m: number, theta: number) {
  const value = sphericalHarmonic(l, m, theta, 0);
  return value.re * value.re + value.im * value.im;
}

export function generalizedLaguerre(k: number, alpha: number, x: number) {
  if (k === 0) return 1;
  let previous = 1, current = 1 + alpha - x;
  for (let j = 2; j <= k; j++) {
    const next = ((2 * j - 1 + alpha - x) * current - (j - 1 + alpha) * previous) / j;
    previous = current;
    current = next;
  }
  return current;
}

/** a0^(3/2) R_nl(r), where radius is r/a0. */
export function hydrogenRadial(n: number, l: number, radius: number) {
  if (!Number.isInteger(n) || n < 1 || n > RYDBERG_N_MAX || !Number.isInteger(l) || l < 0 || l >= n) {
    throw new Error('Nombres quantiques de l’hydrogène non valides.');
  }
  if (radius < 0 || !Number.isFinite(radius)) return 0;
  const rho = 2 * radius / n;
  const normalization = Math.sqrt((2 / n) ** 3 * factorial(n - l - 1) / (2 * n * factorial(n + l)));
  return normalization * Math.exp(-rho / 2) * rho ** l * generalizedLaguerre(n - l - 1, 2 * l + 1, rho);
}

export function hydrogenWave(state: AtomicState, x: number, y: number, z: number, basis: HarmonicBasis = 'complex') {
  const radius = Math.hypot(x, y, z);
  const theta = radius === 0 ? 0 : Math.acos(Math.max(-1, Math.min(1, z / radius)));
  const angular = angularWave(state.l, state.m, theta, Math.atan2(y, x), basis);
  const radial = hydrogenRadial(state.n, state.l, radius);
  return { re: radial * angular.re, im: radial * angular.im };
}

/** Orthonormal coordinates; the oblique plane x+y+z=0 avoids axial nodal planes. */
export function sliceCoordinates(u: number, v: number, plane: OrbitalPlane): [number, number, number] {
  if (plane === 'xy') return [u, v, 0];
  if (plane === 'yz') return [0, u, v];
  if (plane === 'oblique') return [u / Math.SQRT2 + v / Math.sqrt(6), -u / Math.SQRT2 + v / Math.sqrt(6), -2 * v / Math.sqrt(6)];
  return [u, 0, v];
}

export function radialDistribution(n: number, l: number, radius: number) {
  return radius ** 2 * hydrogenRadial(n, l, radius) ** 2;
}

export function radialMean(n: number, l: number) {
  return (3 * n * n - l * (l + 1)) / 2;
}

export function hydrogenEnergy(n: number) { return -13.605693 / (n * n); }

// A wide radial frame keeps the integral essentially complete, even for 5s.
export function radialExtent(n: number) { return 4 * n * n + 8 * n; }

/** Cyclic, continuous RGB phase key, shared by both laboratories. */
export function phaseRgb(phase: number): [number, number, number] {
  const hue = ((phase / (2 * Math.PI) + 1) % 1) * 6;
  const c = 155, x = c * (1 - Math.abs(hue % 2 - 1)), offset = 55;
  const base = hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x]
    : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
  return base.map(value => Math.round(value + offset)) as [number, number, number];
}
