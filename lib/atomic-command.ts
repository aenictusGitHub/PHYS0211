import type { ExperimentCommand } from '../components/lab-types';

export function parseAtomicExperiment(data: Record<string, unknown>): Omit<ExperimentCommand, 'id'> {
  if (data.lab !== 'rotor' && data.lab !== 'hydrogen') throw new Error('Laboratoire atomique inconnu.');
  const allowed = data.lab === 'rotor' ? ['lab', 'angular', 'magnetic', 'inertia']
    : ['lab', 'principal', 'angular', 'magnetic', 'basis', 'atomicView', 'plane'];
  for (const key of Object.keys(data)) if (!allowed.includes(key)) throw new Error(`${key} n’est pas utilisé dans ce laboratoire.`);
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = data[key] ?? fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${key} doit être un entier entre ${min} et ${max}.`);
    return value;
  };
  if (data.lab === 'rotor') {
    const l = integer('angular', 1, 0, 5), m = integer('magnetic', 0, -l, l);
    const inertia = data.inertia ?? 1;
    if (typeof inertia !== 'number' || !Number.isFinite(inertia) || inertia < .5 || inertia > 5) throw new Error('inertia doit être compris entre 0,5 et 5.');
    return { lab: 'rotor', angular: l, magnetic: m, inertia };
  }
  const n = integer('principal', 1, 1, 5), l = integer('angular', 0, 0, n - 1), m = integer('magnetic', 0, -l, l);
  if (data.basis !== undefined && data.basis !== 'complex' && data.basis !== 'real') throw new Error('basis doit valoir complex ou real.');
  if (data.atomicView !== undefined && data.atomicView !== 'slice' && data.atomicView !== 'radial') throw new Error('atomicView doit valoir slice ou radial.');
  if (data.plane !== undefined && data.plane !== 'xz' && data.plane !== 'xy' && data.plane !== 'yz' && data.plane !== 'oblique') throw new Error('plane doit valoir xz, xy, yz ou oblique.');
  return { lab: 'hydrogen', principal: n, angular: l, magnetic: m,
    basis: data.basis ?? 'complex', atomicView: data.atomicView ?? 'slice', plane: data.plane ?? 'xz' };
}
