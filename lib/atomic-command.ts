import type { ExperimentCommand } from '../components/lab-types';
import { LAB_FINAL_TIME_MAX, parsePlaybackSettings } from './playback';

export function parseAtomicExperiment(data: Record<string, unknown>): Omit<ExperimentCommand, 'id'> {
  if (data.lab !== 'rotor' && data.lab !== 'hydrogen') throw new Error('Laboratoire atomique inconnu.');
  const allowed = data.lab === 'rotor' ? ['lab', 'angular', 'magnetic', 'inertia', 'mode', 'preset', 'time']
    : ['lab', 'principal', 'angular', 'magnetic', 'basis', 'atomicView', 'plane', 'mode', 'preset', 'time'];
  allowed.push('scale', 'playbackSpeed', 'finalTime');
  const playback = parsePlaybackSettings(data, data.lab === 'hydrogen' ? 100 : 20);
  for (const key of Object.keys(data)) if (!allowed.includes(key)) throw new Error(`${key} n’est pas utilisé dans ce laboratoire.`);
  if (data.mode !== undefined && data.mode !== 'stationary' && data.mode !== 'evolution') throw new Error('mode doit valoir stationary ou evolution.');
  const presets = data.lab === 'rotor' ? ['rotor-polar', 'rotor-rotation'] : ['hydrogen-breathing', 'hydrogen-dipole', 'hydrogen-rotation', 'hydrogen-rydberg'];
  if (data.preset !== undefined && (typeof data.preset !== 'string' || !presets.includes(data.preset))) throw new Error('Superposition inconnue pour ce laboratoire.');
  const mode: 'stationary' | 'evolution' = data.mode ?? (data.preset ? 'evolution' : 'stationary');
  const time = data.time ?? 0;
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > LAB_FINAL_TIME_MAX) throw new Error('time doit être compris entre 0 et 20π.');
  if (mode === 'stationary' && (data.preset !== undefined || data.time !== undefined)) throw new Error('preset et time demandent le mode evolution.');
  const dynamics = { mode, time, preset: (data.preset ?? presets[0]) as string, ...playback };
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = data[key] ?? fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${key} doit être un entier entre ${min} et ${max}.`);
    return value;
  };
  if (data.lab === 'rotor') {
    const l = integer('angular', 1, 0, 5), m = integer('magnetic', 0, -l, l);
    const inertia = data.inertia ?? 1;
    if (typeof inertia !== 'number' || !Number.isFinite(inertia) || inertia < .5 || inertia > 5) throw new Error('inertia doit être compris entre 0.5 et 5.');
    return { lab: 'rotor', angular: l, magnetic: m, inertia, ...dynamics };
  }
  const n = integer('principal', 1, 1, 40), l = integer('angular', n >= 10 ? n - 1 : 0, 0, n - 1), m = integer('magnetic', n >= 10 ? l : 0, -l, l);
  if (n > 5 && (n < 10 || l !== n - 1 || Math.abs(m) !== l || (data.basis !== undefined && data.basis !== 'complex'))) throw new Error('Pour n de 10 à 40, choisir un état circulaire : ell=n−1, |m|=ell, base complex.');
  if (data.basis !== undefined && data.basis !== 'complex' && data.basis !== 'real') throw new Error('basis doit valoir complex ou real.');
  if (data.atomicView !== undefined && data.atomicView !== 'slice' && data.atomicView !== 'radial') throw new Error('atomicView doit valoir slice ou radial.');
  if (data.plane !== undefined && data.plane !== 'xz' && data.plane !== 'xy' && data.plane !== 'yz' && data.plane !== 'oblique') throw new Error('plane doit valoir xz, xy, yz ou oblique.');
  return { lab: 'hydrogen', principal: n, angular: l, magnetic: m, ...dynamics,
    basis: data.basis ?? 'complex', atomicView: data.atomicView ?? 'slice', plane: data.plane ?? (n >= 10 || data.preset === 'hydrogen-rydberg' ? 'xy' : 'xz') };
}
