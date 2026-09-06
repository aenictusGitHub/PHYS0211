'use client';

import { useEffect, useState } from 'react';
import { Atom } from 'lucide-react';

import { HarmonicLab } from '@/components/harmonic-lab';
import { InfiniteWellLab } from '@/components/infinite-well-lab';
import { ScatteringLab } from '@/components/scattering-lab';
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
  if (data.lab !== 'well' && data.lab !== 'oscillator' && data.lab !== 'scattering') {
    throw new Error('lab doit valoir “well”, “oscillator” ou “scattering”.');
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
      `scale doit être compris entre ${DISPLAY_SCALE_MIN.toLocaleString('fr-BE')} et ${DISPLAY_SCALE_MAX}.`,
    );
  }

  const wellPresets = ['low-pair', 'high-pair', 'parabola'];
  const oscillatorPresets = ['mixture', 'coherent', 'opposite', 'quadrature'];
  const presets = data.lab === 'well' ? wellPresets : data.lab === 'oscillator' ? oscillatorPresets : ['tunnel', 'transmission', 'reflection'];
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
          'Ouvre et configure l’un des trois laboratoires. Pour scattering, règle potential, height, width, momentum, sigma et progress (de 0 à 1 dans la durée de diffusion). Le calcul se prépare en arrière-plan ; la lecture reste en pause.',
        inputSchema: {
          type: 'object',
          properties: {
            lab: { type: 'string', enum: ['well', 'oscillator', 'scattering'] },
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
              ],
            },
            time: { type: 'number', minimum: 0, maximum: TAU_MAX },
            potential: { type: 'string', enum: ['barrier', 'gaussian', 'well'] },
            height: { type: 'number', minimum: 0, maximum: 8 },
            width: { type: 'number', minimum: 0.5, maximum: 6 },
            momentum: { type: 'number', minimum: 1, maximum: 4 },
            sigma: { type: 'number', minimum: 2, maximum: 5 },
            progress: { type: 'number', minimum: 0, maximum: 1 },
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
          <span className="brand-mark"><Atom aria-hidden="true" /></span>
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
      </div>

      <footer>
        <span>John Martin</span>
      </footer>
    </main>
  );
}
