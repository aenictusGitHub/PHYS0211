import type { SGBeam } from './stern-gerlach';

export type SGFilter = 'plus' | 'minus' | 'both';
export type SGCascadeConfig = {
  beam: SGBeam;
  angles: [number, number, number];
  filters: [SGFilter, SGFilter];
  middle: boolean;
};
type Bloch = [number, number, number];
export const SG_CASCADE_DEFAULTS: SGCascadeConfig = { beam: 'mixed', angles: [0, 90, 0], filters: ['plus', 'plus'], middle: true };
export const SG_CASCADE_INTERVAL = .08;
export const SG_CASCADE_ARRIVAL = 3.3;
export const SG_CASCADE_PRESETS = [
  { label: 'z → x → z', angles: [0, 90, 0], filters: ['plus', 'plus'], middle: true },
  { label: 'z → z → z', angles: [0, 0, 0], filters: ['plus', 'plus'], middle: true },
  { label: 'Sans l’analyseur B', angles: [0, 90, 0], filters: ['plus', 'plus'], middle: false },
  { label: 'Deux sorties de B', angles: [0, 90, 0], filters: ['plus', 'both'], middle: true },
] as const;

const axis = (angle: number): Bloch => [Math.sin(angle * Math.PI / 180), 0, Math.cos(angle * Math.PI / 180)];
const initial = (beam: SGBeam): Bloch => {
  if (beam === 'mixed') return [0, 0, 0];
  const sign = beam.endsWith('plus') ? 1 : -1;
  return [beam[0] === 'x' ? sign : 0, beam[0] === 'y' ? sign : 0, beam[0] === 'z' ? sign : 0];
};
function plusProbability(state: Bloch, n: Bloch) {
  const p = (1 + state.reduce((sum, value, i) => sum + value * n[i], 0)) / 2;
  return p < 1e-14 ? 0 : p > 1 - 1e-14 ? 1 : p;
}
const accepts = (filter: SGFilter, sign: number) => filter === 'both' || (filter === 'plus' ? sign === 1 : sign === -1);
const filterAt = (config: SGCascadeConfig, stage: number): SGFilter => stage < 2 ? config.filters[stage] : 'both';

/** Enumerate incoherent measurement histories, retaining absolute source weights.
 * Transmitting both measured outputs is NOT coherent recombination or bypass. */
export function sgCascadeStatistics(config: SGCascadeConfig) {
  let branches: { weight: number; state: Bloch }[] = [{ weight: 1, state: initial(config.beam) }];
  return config.angles.map((angle, stage) => {
    const incoming = branches.reduce((sum, b) => sum + b.weight, 0);
    if (stage === 1 && !config.middle) return { incoming, plus: 0, minus: 0, passed: incoming, blocked: 0, bypassed: true };
    const n = axis(angle), next: typeof branches = [];
    let plus = 0, minus = 0;
    for (const b of branches) {
      const pPlus = plusProbability(b.state, n);
      for (const sign of [1, -1]) {
        const weight = b.weight * (sign === 1 ? pPlus : 1 - pPlus);
        if (sign === 1) plus += weight; else minus += weight;
        if (weight > 0 && accepts(filterAt(config, stage), sign)) next.push({ weight, state: n.map(value => sign * value) as Bloch });
      }
    }
    branches = next;
    const passed = next.reduce((sum, b) => sum + b.weight, 0);
    return { incoming, plus, minus, passed, blocked: Math.max(0, incoming - passed), bypassed: false };
  });
}

function random(id: number, stage: number, seed: number) {
  let n = Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(seed + 101 * (stage + 1), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d); n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (((n ^ (n >>> 16)) >>> 0) + .5) / 4294967296;
}

export function sgCascadeAtoms(config: SGCascadeConfig, time: number, seed: number) {
  return Array.from({ length: Math.max(0, Math.floor(time / SG_CASCADE_INTERVAL) + 1) }, (_, id) => {
    const age = time - id * SG_CASCADE_INTERVAL;
    let state = initial(config.beam), stoppedAt: number | null = null;
    const outcomes: (number | null)[] = [null, null, null];
    for (let stage = 0; stage < 3; stage++) {
      if (stage === 1 && !config.middle) continue;
      const n = axis(config.angles[stage]);
      const sign = random(id, stage, seed) < plusProbability(state, n) ? 1 : -1;
      outcomes[stage] = sign;
      state = n.map(value => value * sign) as Bloch;
      if (!accepts(filterAt(config, stage), sign)) { stoppedAt = stage; break; }
    }
    return { id, age, outcomes, stoppedAt, detected: stoppedAt === null && age >= SG_CASCADE_ARRIVAL };
  });
}
export type SGCascadeAtom = ReturnType<typeof sgCascadeAtoms>[number];

export function sgCascadeCounts(atoms: readonly SGCascadeAtom[], config: SGCascadeConfig) {
  return [0, 1, 2].map(stage => {
    let plus = 0, minus = 0, passed = 0, blocked = 0;
    for (const atom of atoms) {
      if (atom.age < stage + 1 || (atom.stoppedAt !== null && atom.stoppedAt < stage)) continue;
      if (stage === 1 && !config.middle) { passed++; continue; }
      if (atom.outcomes[stage] === 1) plus++; else minus++;
      if (atom.stoppedAt === stage) blocked++; else passed++;
    }
    return { plus, minus, passed, blocked };
  });
}

/** A logical beam-routing diagram, not a trajectory solver. Local outputs use
 * minus above / plus below, consistent with the electronic magnetic moment. */
export function sgCascadeGlyph(atom: SGCascadeAtom, config: SGCascadeConfig) {
  if (atom.detected || (atom.stoppedAt !== null && atom.age > atom.stoppedAt + 1.18)) return null;
  const age = Math.min(atom.age, atom.stoppedAt === null ? SG_CASCADE_ARRIVAL : atom.stoppedAt + 1);
  const stage = Math.min(2, Math.floor(age)), local = age - stage;
  // Each analyser's output is at local time 1; the next stage reroutes it to
  // the next input without rotating its spin. C terminates at the detectors.
  const previous = stage === 0 ? null : atom.outcomes[stage - 1];
  const sign = stage === 1 && !config.middle ? null : atom.outcomes[stage];
  let offset = 0;
  if (local < .3 && previous !== null) offset = 42 * previous * (1 - local / .3);
  if (local > .6 && sign !== null) offset = 42 * sign * Math.min(1, (local - .6) / .4);
  if (stage === 2 && local > 1) offset = 42 * (sign ?? 0);
  // Arrows label the separated output channels, never a hidden incoming spin.
  const measured = local >= .8 && sign !== null ? sign : null;
  return { x: 32 + 268 * age, y: 126 + offset, spin: measured, stage,
    blocked: atom.stoppedAt !== null && age >= atom.stoppedAt + 1,
    opacity: atom.stoppedAt === null ? 1 : Math.max(0, Math.min(1, (atom.stoppedAt + 1.18 - atom.age) / .18)) };
}
