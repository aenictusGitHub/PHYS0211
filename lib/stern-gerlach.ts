import type { ExperimentCommand } from '../components/lab-types';
import { parsePlaybackSettings } from './playback';

export type SGModel = 'quantum' | 'classical';
export type SGBeam = 'mixed' | 'z-plus' | 'z-minus' | 'x-plus' | 'x-minus' | 'y-plus' | 'y-minus';
export type SGParameters = { j: number; gradient: number; velocity: number; length: number; distance: number; angle: number; g: number; mass: number };
export const SG_DEFAULTS: SGParameters = { j: .5, gradient: 500, velocity: 500, length: 4, distance: 12, angle: 0, g: 2, mass: 108 };
export const SG_J = [0, .5, 1, 1.5] as const;
export const SG_BEAMS: readonly SGBeam[] = ['mixed', 'z-plus', 'z-minus', 'x-plus', 'x-minus', 'y-plus', 'y-minus'];
export const SG_MU_B = 9.274e-24; // J/T; sufficient precision for this idealized apparatus.
export const SG_ATOMIC_MASS = 1.66054e-27; // kg/u.
export const SG_SOURCE_DISTANCE = .02; // m before the magnet entrance.
export const SG_SIGMA_MM = .035; // Collimated beam's transverse standard deviation.
export const SG_EMISSION_MS = .04;

export function sgProbabilities(p: SGParameters, beam: SGBeam) {
  if (p.j !== .5 || beam === 'mixed') return Array.from({ length: 2 * p.j + 1 }, () => 1 / (2 * p.j + 1));
  const angle = p.angle * Math.PI / 180;
  const projection = (beam.startsWith('z') ? Math.cos(angle) : beam.startsWith('x') ? Math.sin(angle) : 0)
    * (beam.endsWith('minus') ? -1 : 1);
  const plus = Math.max(0, Math.min(1, (1 + projection) / 2));
  return [1 - plus, plus]; // m=-1/2 first; magnetic moment has the opposite sign.
}

/** Narrow collimated beam: constant transverse force in 0<y<L, then drift.
 * Input moment is in Bohr magnetons; output transverse displacement is in mm. */
export function sgDeflection(mu: number, p: SGParameters, y: number) {
  const length = p.length / 100, acceleration = mu * SG_MU_B * p.gradient / (p.mass * SG_ATOMIC_MASS);
  if (y <= 0) return 0;
  const inside = Math.min(y, length);
  return acceleration / p.velocity ** 2 * (inside ** 2 / 2 + length * Math.max(0, y - length)) * 1000;
}

export function sgFlightTime(p: SGParameters) {
  return (SG_SOURCE_DISTANCE + (p.length + p.distance) / 100) / p.velocity * 1000;
}

export function sgChannels(p: SGParameters, beam: SGBeam) {
  const probabilities = sgProbabilities(p, beam);
  return probabilities.map((probability, index) => {
    const m = index - p.j, mu = -p.g * m;
    return { m, mu, probability, position: sgDeflection(mu, p, (p.length + p.distance) / 100) };
  });
}

export function sgClassicalMoment(p: SGParameters) { return p.g * Math.sqrt(p.j * (p.j + 1)); }
export function sgScreenRange(p: SGParameters) {
  return Math.max(.25, Math.abs(sgDeflection(sgClassicalMoment(p), p, (p.length + p.distance) / 100)) * 1.18 + 4 * SG_SIGMA_MM);
}

function erf(x: number) {
  const t = 1 / (1 + .3275911 * Math.abs(x));
  return Math.sign(x) * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x));
}
const normal = (x: number) => Math.exp(-x * x / (2 * SG_SIGMA_MM ** 2)) / (Math.sqrt(2 * Math.PI) * SG_SIGMA_MM);
export function sgDensity(x: number, p: SGParameters, beam: SGBeam, model: SGModel) {
  if (model === 'quantum') return sgChannels(p, beam).reduce((sum, c) => sum + c.probability * normal(x - c.position), 0);
  // Isotropic classical moments: the projection is uniform, convolved with beam width.
  const extent = Math.abs(sgDeflection(sgClassicalMoment(p), p, (p.length + p.distance) / 100));
  if (extent < 1e-6) return normal(x);
  const width = Math.SQRT2 * SG_SIGMA_MM;
  return Math.max(0, (erf((x + extent) / width) - erf((x - extent) / width)) / (4 * extent));
}

// Indexed pseudorandom samples keep scrubbing/replay consistent within a run.
function random(index: number, salt: number, seed: number) {
  let n = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(seed + salt, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d); n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (((n ^ (n >>> 16)) >>> 0) + .5) / 4294967296;
}
export function sgParticles(p: SGParameters, beam: SGBeam, model: SGModel, time: number, seed: number) {
  const channels = sgChannels(p, beam), flight = sgFlightTime(p), angle = p.angle * Math.PI / 180;
  return Array.from({ length: Math.max(0, Math.floor(time / SG_EMISSION_MS) + 1) }, (_, id) => {
    const age = time - id * SG_EMISSION_MS, u = random(id, 1, seed);
    let channel = 0, total = channels[0].probability;
    while (channel < channels.length - 1 && u >= total) total += channels[++channel].probability;
    const mu = model === 'quantum' ? channels[channel].mu : (2 * u - 1) * sgClassicalMoment(p);
    const gaussianRadius = SG_SIGMA_MM * Math.sqrt(-2 * Math.log(random(id, 3, seed)));
    const gaussianAngle = 2 * Math.PI * random(id, 5, seed);
    const offset = gaussianRadius * Math.cos(gaussianAngle), perpendicular = gaussianRadius * Math.sin(gaussianAngle);
    const y = Math.min((p.length + p.distance) / 100, -SG_SOURCE_DISTANCE + p.velocity * age / 1000);
    const displacement = sgDeflection(mu, p, y) + offset;
    return { id, channel, y, displacement, detected: age >= flight,
      x: displacement * Math.sin(angle) + perpendicular * Math.cos(angle),
      z: displacement * Math.cos(angle) - perpendicular * Math.sin(angle) };
  });
}

export function parseSternGerlach(data: Record<string, unknown>): Omit<ExperimentCommand, 'id'> {
  if (data.lab !== 'stern-gerlach') throw new Error('Laboratoire Stern–Gerlach attendu.');
  const allowed = ['lab', 'sgJ', 'sgGradient', 'sgVelocity', 'sgLength', 'sgDistance', 'sgAngle', 'sgG', 'sgMass', 'sgBeam', 'sgModel', 'time', 'scale', 'playbackSpeed', 'finalTime'];
  for (const key of Object.keys(data)) if (!allowed.includes(key)) throw new Error(`${key} n’est pas utilisé par Stern–Gerlach.`);
  const bounds = { sgGradient: [-1500, 1500], sgVelocity: [100, 1000], sgLength: [1, 10], sgDistance: [2, 30], sgAngle: [0, 180], sgG: [.5, 2], sgMass: [20, 200], time: [0, 20] };
  for (const [key, [min, max]] of Object.entries(bounds)) if (data[key] !== undefined && (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || data[key] < min || data[key] > max)) throw new Error(`${key} doit être compris entre ${min} et ${max}.`);
  if (data.sgJ !== undefined && !(SG_J as readonly unknown[]).includes(data.sgJ)) throw new Error('sgJ doit valoir 0, 0.5, 1 ou 1.5.');
  if (data.sgBeam !== undefined && !(SG_BEAMS as readonly unknown[]).includes(data.sgBeam)) throw new Error('Préparation Stern–Gerlach inconnue.');
  if (data.sgModel !== undefined && data.sgModel !== 'quantum' && data.sgModel !== 'classical') throw new Error('sgModel doit valoir quantum ou classical.');
  if (data.sgBeam !== undefined && data.sgBeam !== 'mixed' && ((data.sgJ !== undefined && data.sgJ !== .5) || data.sgModel === 'classical')) throw new Error('Un faisceau polarisé est proposé uniquement pour j=1/2, en modèle quantique.');
  const playback = parsePlaybackSettings(data, 4);
  if (playback.finalTime !== undefined && (playback.finalTime < 1 || playback.finalTime > 20)) throw new Error('Temps final de Stern–Gerlach : de 1 à 20 ms.');
  if (data.time !== undefined && playback.finalTime !== undefined && (data.time as number) > playback.finalTime) throw new Error('time ne peut pas dépasser finalTime.');
  return { ...data, ...playback, lab: 'stern-gerlach' } as Omit<ExperimentCommand, 'id'>;
}
