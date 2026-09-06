'use client';

import { useEffect, useState } from 'react';
import { QuantumMark } from '@/components/quantum-mark';

import { HarmonicLab } from '@/components/harmonic-lab';
import { InfiniteWellLab } from '@/components/infinite-well-lab';
import { ScatteringLab } from '@/components/scattering-lab';
import { DoubleWellLab } from '@/components/double-well-lab';
import { RotorLab } from '@/components/rotor-lab';
import { HydrogenLab } from '@/components/hydrogen-lab';
import { SpinLab } from '@/components/spin-lab';
import { parseSpinExperiment, SPIN_TIME_MAX } from '@/lib/spin';
import { parseAtomicExperiment } from '@/lib/atomic-command';
import { type ExperimentCommand } from '@/components/lab-types';
import { Button } from '@/components/ui/button';
import { DISPLAY_SCALE_MAX, DISPLAY_SCALE_MIN, TAU_MAX } from '@/lib/quantum';

type Lab = ExperimentCommand['lab'];

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: {
        readOnlyHint: boolean;
        untrustedContentHint: boolean;
      };
      execute: (input: unknown) => Promise<Record<string, unknown>>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

function parseExperimentCommand(input: unknown): Omit<ExperimentCommand, 'id'> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('La configuration doit être un objet.');
  }

  const data = input as Record<string, unknown>;
  if (data.lab === 'spin') return parseSpinExperiment(data);
  if (data.lab === 'rotor' || data.lab === 'hydrogen') return parseAtomicExperiment(data);
  if (data.lab !== 'well' && data.lab !== 'oscillator' && data.lab !== 'scattering' && data.lab !== 'double-well') {
    throw new Error('lab doit valoir well, oscillator, scattering, double-well, rotor, hydrogen ou spin.');
  }

  if (
    data.mode !== undefined &&
    data.mode !== 'stationary' &&
    data.mode !== 'evolution'
  ) {
    throw new Error('mode doit valoir “stationary” ou “evolution”.');
  }

  if (data.lab === 'scattering' && (data.quantumNumber !== undefined || data.mode === 'stationary' || data.time !== undefined)) {
    throw new Error('La diffusion utilise progress (entre 0 et 1), sans nombre quantique ni mode stationnaire.');
  }

  if (data.quantumNumber !== undefined) {
    const minimum = data.lab === 'well' ? 1 : 0;
    if (
      typeof data.quantumNumber !== 'number' ||
      !Number.isInteger(data.quantumNumber) ||
      data.quantumNumber < minimum ||
      data.quantumNumber > 8
    ) {
      throw new Error(`quantumNumber doit être un entier entre ${minimum} et 8.`);
    }
  }

  if (
    data.time !== undefined &&
    (typeof data.time !== 'number' || !Number.isFinite(data.time) || data.time < 0 || data.time > TAU_MAX)
  ) {
    throw new Error('time doit être compris entre 0 et 2π.');
  }

  if (
    data.scale !== undefined &&
    (typeof data.scale !== 'number' ||
      !Number.isFinite(data.scale) ||
      data.scale < DISPLAY_SCALE_MIN ||
      data.scale > DISPLAY_SCALE_MAX)
  ) {
    throw new Error(
      `scale doit être compris entre ${DISPLAY_SCALE_MIN.toLocaleString('en-US', { useGrouping: false })} et ${DISPLAY_SCALE_MAX}.`,
    );
  }

  const wellPresets = ['low-pair', 'high-pair', 'parabola'];
  const oscillatorPresets = ['mixture', 'coherent', 'opposite', 'quadrature'];
  const presets = data.lab === 'well' ? wellPresets : data.lab === 'oscillator' ? oscillatorPresets
    : data.lab === 'double-well' ? ['left', 'right'] : ['tunnel', 'transmission', 'reflection'];
  if (
    data.preset !== undefined &&
    (typeof data.preset !== 'string' || !presets.includes(data.preset))
  ) {
    throw new Error(`preset inconnu pour le laboratoire ${data.lab}.`);
  }

  const bounds = { height: [0, 8], width: [0.5, 6], momentum: [1, 4], sigma: [2, 5], progress: [0, 1] } as const;
  for (const field of Object.keys(bounds) as Array<keyof typeof bounds>) {
    const value = data[field];
    if (value !== undefined && (data.lab !== 'scattering' || typeof value !== 'number' || !Number.isFinite(value) || value < bounds[field][0] || value > bounds[field][1])) {
      throw new Error(`${field} : réservé à la diffusion, entre ${bounds[field][0]} et ${bounds[field][1]}.`);
    }
  }
  if (data.potential !== undefined && (data.lab !== 'scattering' || !['barrier', 'gaussian', 'well'].includes(String(data.potential)))) {
    throw new Error('Potentiel inconnu pour la diffusion.');
  }

  const doubleWellBounds = { barrier: [0.5, 8], separation: [0.8, 2.5] } as const;
  for (const field of Object.keys(doubleWellBounds) as Array<keyof typeof doubleWellBounds>) {
    const value = data[field];
    if (value !== undefined && (data.lab !== 'double-well' || typeof value !== 'number' || !Number.isFinite(value)
      || value < doubleWellBounds[field][0] || value > doubleWellBounds[field][1])) {
      throw new Error(`${field} : réservé au double puits, entre ${doubleWellBounds[field][0]} et ${doubleWellBounds[field][1]}.`);
    }
  }

  return {
    lab: data.lab,
    mode:
      (data.mode as ExperimentCommand['mode']) ??
      (data.preset ? 'evolution' : data.quantumNumber !== undefined ? 'stationary' : undefined),
    quantumNumber: data.quantumNumber as number | undefined,
    preset: data.preset as string | undefined,
    time: data.time as number | undefined,
    scale: data.scale as number | undefined,
    potential: data.potential as ExperimentCommand['potential'],
    height: data.height as number | undefined,
    width: data.width as number | undefined,
    momentum: data.momentum as number | undefined,
    sigma: data.sigma as number | undefined,
    progress: data.progress as number | undefined,
    barrier: data.barrier as number | undefined,
    separation: data.separation as number | undefined,
  };
}

export function QuantumLab() {
  const [lab, setLab] = useState<Lab>('well');
  const [command, setCommand] = useState<ExperimentCommand | null>(null);

  useEffect(() => {
    const context = (
      document as Document & { modelContext?: ModelContext }
    ).modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const registration = context.registerTool(
      {
        name: 'configure_quantum_experiment',
        title: 'Configurer une expérience quantique',
        description:
          'Configure les sept laboratoires. scattering : potential, height, width, momentum, sigma, progress. double-well : barrier, separation, preset left/right, time (phase ΔE t/ℏ). rotor : angular (ℓ, défaut 1), magnetic (m, défaut 0), inertia (I/I0, défaut 1). hydrogen : principal (n, défaut 1), angular (ℓ, défaut 0), magnetic (m, défaut 0), basis (complex/real), atomicView (slice/radial), plane (xz/xy/yz/oblique). Respecter |m|≤ℓ<n pour hydrogen. rotor et hydrogen acceptent mode stationary/evolution ; en évolution, choisir un preset rotor-polar/rotor-rotation ou hydrogen-breathing/hydrogen-dipole/hydrogen-rotation et time (phase ΔE t/ℏ de 0 à 2π). Ils n’utilisent pas quantumNumber. spin : spinTheta et spinPhi en degrés, spinField (x/y/z/tilted), spinMeasure (x/y/z), spinOmega (Ω/Ω0), time (Ω0t, de 0 à 4π), preset spin-x-plus/minus, spin-y-plus/minus ou spin-z-plus/minus. Les angles explicites priment sur le preset. La lecture reste en pause.',
        inputSchema: {
          type: 'object',
          properties: {
            lab: { type: 'string', enum: ['well', 'oscillator', 'scattering', 'double-well', 'rotor', 'hydrogen', 'spin'] },
            mode: { type: 'string', enum: ['stationary', 'evolution'] },
            quantumNumber: { type: 'integer', minimum: 0, maximum: 8 },
            preset: {
              type: 'string',
              enum: [
                'low-pair',
                'high-pair',
                'parabola',
                'mixture',
                'coherent',
                'opposite',
                'quadrature',
                'tunnel',
                'transmission',
                'reflection',
                'left',
                'right',
                'rotor-polar',
                'rotor-rotation',
                'hydrogen-breathing',
                'hydrogen-dipole',
                'hydrogen-rotation',
                'hydrogen-rydberg',
                'spin-x-plus', 'spin-x-minus', 'spin-y-plus', 'spin-y-minus', 'spin-z-plus', 'spin-z-minus',
              ],
            },
            time: { type: 'number', minimum: 0, maximum: SPIN_TIME_MAX, description: 'Jusqu’à 4π pour spin ; jusqu’à 2π pour les autres laboratoires.' },
            spinTheta: { type: 'number', minimum: 0, maximum: 180 },
            spinPhi: { type: 'number', minimum: 0, maximum: 360 },
            spinOmega: { type: 'number', minimum: .25, maximum: 3 },
            spinField: { type: 'string', enum: ['x', 'y', 'z', 'tilted'] },
            spinMeasure: { type: 'string', enum: ['x', 'y', 'z'] },
            potential: { type: 'string', enum: ['barrier', 'gaussian', 'well'] },
            height: { type: 'number', minimum: 0, maximum: 8 },
            width: { type: 'number', minimum: 0.5, maximum: 6 },
            momentum: { type: 'number', minimum: 1, maximum: 4 },
            sigma: { type: 'number', minimum: 2, maximum: 5 },
            progress: { type: 'number', minimum: 0, maximum: 1 },
            barrier: { type: 'number', minimum: 0.5, maximum: 8 },
            separation: { type: 'number', minimum: 0.8, maximum: 2.5 },
            principal: { type: 'integer', minimum: 1, maximum: 40, description: 'Hydrogène : 1 à 5, ou 10 à 40 pour les états circulaires (ell=n−1, |m|=ell).' },
            angular: { type: 'integer', minimum: 0, maximum: 39, description: 'Rotateur : au plus 5. Hydrogène : ell<n ; pour n≥10, ell=n−1.' },
            magnetic: { type: 'integer', minimum: -39, maximum: 39 },
            inertia: { type: 'number', minimum: .5, maximum: 5 },
            basis: { type: 'string', enum: ['complex', 'real'] },
            atomicView: { type: 'string', enum: ['slice', 'radial'] },
            plane: { type: 'string', enum: ['xz', 'xy', 'yz', 'oblique'] },
            scale: {
              type: 'number',
              minimum: DISPLAY_SCALE_MIN,
              maximum: DISPLAY_SCALE_MAX,
            },
          },
          required: ['lab'],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: false,
          untrustedContentHint: false,
        },
        async execute(input) {
          let parsed: Omit<ExperimentCommand, 'id'>;
          try {
            parsed = parseExperimentCommand(input);
          } catch (error) {
            return {
              status: 'invalid',
              error:
                error instanceof Error
                  ? error.message
                  : 'Configuration non valide.',
            };
          }
          const nextCommand = { ...parsed, id: Date.now() };
          setLab(parsed.lab);
          setCommand(nextCommand);

          await new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => resolve());
            });
          });

          return {
            status: parsed.lab === 'scattering' ? 'preparing' : 'visible',
            lab: parsed.lab,
            mode: parsed.mode ?? 'inchangé',
            quantumNumber: parsed.quantumNumber ?? null,
            preset: parsed.preset ?? null,
            time: parsed.time ?? null,
            scale: parsed.scale ?? null,
            progress: parsed.progress ?? null,
            principal: parsed.principal ?? null,
            angular: parsed.angular ?? null,
            magnetic: parsed.magnetic ?? null,
            spinTheta: parsed.spinTheta ?? null,
            spinPhi: parsed.spinPhi ?? null,
            spinOmega: parsed.spinOmega ?? null,
            spinField: parsed.spinField ?? null,
            spinMeasure: parsed.spinMeasure ?? null,
          };
        },
      },
      { signal: lifecycle.signal },
    );

    void Promise.resolve(registration).catch((error) => {
      console.warn('WebMCP registration failed', error);
    });
    return () => lifecycle.abort();
  }, []);

  return (
    <main className="app-shell" data-lab={lab}>
      <a className="skip-link" href="#laboratory">Aller au laboratoire</a>
      <header className="site-header">
        <a className="brand" href="#laboratory" aria-label="Mécanique quantique, accueil">
          <span className="brand-mark"><QuantumMark /></span>
          <span><strong>Mécanique quantique</strong><small>PHYS0211-3 · 2026–2027</small></span>
        </a>

        <nav aria-label="Choisir un laboratoire">
          <Button
            variant="ghost"
            className={lab === 'well' ? 'lab-tab lab-tab-well is-active' : 'lab-tab lab-tab-well'}
            onClick={() => setLab('well')}
            aria-pressed={lab === 'well'}
          >
            <span>01</span> Puits infini
          </Button>
          <Button
            variant="ghost"
            className={lab === 'oscillator' ? 'lab-tab lab-tab-oscillator is-active' : 'lab-tab lab-tab-oscillator'}
            onClick={() => setLab('oscillator')}
            aria-pressed={lab === 'oscillator'}
          >
            <span>02</span> Oscillateur harmonique
          </Button>
          <Button
            variant="ghost"
            className={lab === 'scattering' ? 'lab-tab lab-tab-scattering is-active' : 'lab-tab lab-tab-scattering'}
            onClick={() => setLab('scattering')}
            aria-pressed={lab === 'scattering'}
          >
            <span>03</span> Diffusion de paquets
          </Button>
          <Button
            variant="ghost"
            className={lab === 'double-well' ? 'lab-tab lab-tab-double-well is-active' : 'lab-tab lab-tab-double-well'}
            onClick={() => setLab('double-well')}
            aria-pressed={lab === 'double-well'}
          >
            <span>04</span> Double puits
          </Button>
          <Button variant="ghost" className={`lab-tab lab-tab-rotor${lab === 'rotor' ? ' is-active' : ''}`}
            onClick={() => setLab('rotor')} aria-pressed={lab === 'rotor'}><span>05</span> Rotateur rigide</Button>
          <Button variant="ghost" className={`lab-tab lab-tab-hydrogen${lab === 'hydrogen' ? ' is-active' : ''}`}
            onClick={() => setLab('hydrogen')} aria-pressed={lab === 'hydrogen'}><span>06</span> Atome d’hydrogène</Button>
          <Button variant="ghost" className={`lab-tab lab-tab-spin${lab === 'spin' ? ' is-active' : ''}`}
            onClick={() => setLab('spin')} aria-pressed={lab === 'spin'}><span>07</span> Spin-1/2</Button>
        </nav>

      </header>

      <div id="laboratory" tabIndex={-1}>
        <div hidden={lab !== 'well'}>
          <InfiniteWellLab active={lab === 'well'} command={command} />
        </div>
        <div hidden={lab !== 'oscillator'}>
          <HarmonicLab active={lab === 'oscillator'} command={command} />
        </div>
        <div hidden={lab !== 'scattering'}>
          <ScatteringLab active={lab === 'scattering'} command={command} />
        </div>
        <div hidden={lab !== 'double-well'}>
          <DoubleWellLab active={lab === 'double-well'} command={command} />
        </div>
        <div hidden={lab !== 'rotor'}><RotorLab active={lab === 'rotor'} command={command} /></div>
        <div hidden={lab !== 'hydrogen'}><HydrogenLab active={lab === 'hydrogen'} command={command} /></div>
        <div hidden={lab !== 'spin'}><SpinLab active={lab === 'spin'} command={command} /></div>
      </div>

      <footer>
        <span>John Martin</span>
      </footer>
    </main>
  );
}
