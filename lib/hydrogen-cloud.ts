import { angularDensity, hydrogenWave, radialDistribution, radialExtent } from './atomic';
import type { AtomicTerm } from './atomic-dynamics';

export type CloudPoint = { x: number; y: number; z: number; phase: number };
type Candidate = { x: number; y: number; z: number; threshold: number; waves: { re: number; im: number }[]; envelope: number };
export type HydrogenCloudSamples = { candidates: Candidate[]; extent: number; terms: number; count: number };

function distribution(density: (x: number) => number, lo: number, hi: number, steps: number) {
  const cdf = new Float64Array(steps + 1), step = (hi - lo) / steps;
  let previous = density(lo);
  for (let i = 1; i <= steps; i++) {
    const next = density(lo + i * step);
    cdf[i] = cdf[i - 1] + (previous + next) * step / 2;
    previous = next;
  }
  return (u: number) => {
    const target = u * cdf[steps];
    let left = 0, right = steps;
    while (right - left > 1) { const middle = (left + right) >>> 1; if (cdf[middle] < target) left = middle; else right = middle; }
    const fraction = (target - cdf[left]) / (cdf[right] - cdf[left] || 1);
    return lo + (left + fraction) * step;
  };
}

/** Independent samples of the mixture of normalized basis densities.
 * Radial sampling includes r²; angular sampling uses u=cos(theta), so no
 * missing spherical Jacobian. Fixed random numbers make replay deterministic. */
export function sampleHydrogenCloud(terms: readonly AtomicTerm[], count = 20000): HydrogenCloudSamples {
  if (!terms.length) throw new Error('Le nuage nécessite au moins un état.');
  if (!Number.isInteger(count) || count < 1 || count > 30000) throw new Error('Nombre de points non valide.');
  let seed = 0x6d2b79f5;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) + .5) / 4294967296; };
  const limit = radialExtent(Math.max(...terms.map(term => term.n)));
  const samplers = terms.map(term => ({
    radius: distribution(r => radialDistribution(term.n, term.l, r), 0, limit, 8192),
    cosine: distribution(u => 2 * Math.PI * angularDensity(term.l, term.m, Math.acos(u)), -1, 1, 2048),
  }));
  const candidates: Candidate[] = [];
  // Reserve extra proposals for the rejection step in evolving superpositions.
  for (let i = 0; i < count * terms.length * (terms.length > 1 ? 2 : 1); i++) {
    const index = Math.floor(random() * terms.length), term = terms[index], sampler = samplers[index];
    const r = sampler.radius(random()), cosine = sampler.cosine(random()), sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
    let phi = random() * 2 * Math.PI;
    if (term.basis === 'real' && term.m !== 0) {
      // The real basis has a cos²(m phi) or sin²(m phi) azimuthal density.
      while (random() > (term.m > 0 ? Math.cos(term.m * phi) : Math.sin(term.m * phi)) ** 2) phi = random() * 2 * Math.PI;
    }
    const x = r * sine * Math.cos(phi), y = r * sine * Math.sin(phi), z = r * cosine;
    const waves = terms.map(t => hydrogenWave(t, x, y, z, t.basis));
    candidates.push({ x, y, z, waves, threshold: random(), envelope: terms.length * waves.reduce((sum, w) => sum + w.re ** 2 + w.im ** 2, 0) });
  }
  // A fixed radial quantile prevents a zoom jump when the point count changes.
  const extent = Math.max(...samplers.map(sampler => sampler.radius(.99999)), 1);
  return { candidates, extent, terms: terms.length, count };
}

/** Rejection against k sum|psi_k|² bounds |sum exp(-ik phase)psi_k|²
 * by Cauchy–Schwarz. Accepted points therefore sample the coherent density,
 * including its interference nodes, rather than an incoherent mixture. */
export function hydrogenCloudAtPhase(samples: HydrogenCloudSamples, phase: number): CloudPoint[] {
  const factors = Array.from({ length: samples.terms }, (_, k) => ({ re: Math.cos(k * phase), im: -Math.sin(k * phase) }));
  const result: CloudPoint[] = [];
  for (const p of samples.candidates) {
    let re = 0, im = 0;
    p.waves.forEach((w, k) => { re += w.re * factors[k].re - w.im * factors[k].im; im += w.re * factors[k].im + w.im * factors[k].re; });
    if (p.threshold * p.envelope < re * re + im * im) result.push({ x: p.x, y: p.y, z: p.z, phase: Math.atan2(im, re) });
    if (result.length === samples.count) break;
  }
  return result;
}

export function projectCloudPoint(p: { x: number; y: number; z: number }, yaw: number, pitch: number) {
  const u = Math.cos(yaw) * p.x - Math.sin(yaw) * p.y, v = Math.sin(yaw) * p.x + Math.cos(yaw) * p.y;
  return { x: u, y: Math.sin(pitch) * v - Math.cos(pitch) * p.z, z: Math.cos(pitch) * v + Math.sin(pitch) * p.z };
}
