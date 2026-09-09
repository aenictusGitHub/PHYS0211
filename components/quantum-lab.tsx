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
import { SternGerlachLab } from '@/components/stern-gerlach-lab';
import { parseSternGerlach, SG_J, SG_BEAMS } from '@/lib/stern-gerlach';
import { parseSpinExperiment, SPIN_TIME_MAX } from '@/lib/spin';
import { parseWellModes } from '@/lib/well-state';
import { parseAtomicExperiment } from '@/lib/atomic-command';
import { type ExperimentCommand } from '@/components/lab-types';
import { Button } from '@/components/ui/button';
import { DISPLAY_SCALE_MAX, DISPLAY_SCALE_MIN, TAU_MAX } from '@/lib/quantum';
import { ALL_SCATTERING_PRESETS, SCATTERING_POTENTIALS, GRAVITY_MAX, SCATTERING_MOMENTUM_MIN, SCATTERING_MOMENTUM_MAX, SCATTERING_FINAL_TIME_MIN, SCATTERING_FINAL_TIME_MAX } from '@/lib/scattering';
import { PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX, LAB_FINAL_TIME_MIN, LAB_FINAL_TIME_MAX } from '@/lib/playback';
import { ROTOR_RESOLUTION_MIN, ROTOR_RESOLUTION_MAX, ROTOR_RESOLUTION_STEP } from '@/lib/rotor-resolution';

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
  if (data.lab === 'stern-gerlach') return parseSternGerlach(data);
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
    (typeof data.time !== 'number' || !Number.isFinite(data.time) || data.time < 0 || data.time > LAB_FINAL_TIME_MAX)
  ) {
    throw new Error('time doit être compris entre 0 et 20π.');
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

  const wellPresets = ['low-pair', 'high-pair', 'parabola', 'custom'];
  const oscillatorPresets = ['mixture', 'coherent', 'opposite', 'quadrature'];
  const presets = data.lab === 'well' ? wellPresets : data.lab === 'oscillator' ? oscillatorPresets
    : data.lab === 'double-well' ? ['left', 'right'] : Object.keys(ALL_SCATTERING_PRESETS);
  if (
    data.preset !== undefined &&
    (typeof data.preset !== 'string' || !presets.includes(data.preset))
  ) {
    throw new Error(`preset inconnu pour le laboratoire ${data.lab}.`);
  }

  const bounds = { height: [0, 8], width: [0.5, 6], gravity: [0, GRAVITY_MAX], momentum: [SCATTERING_MOMENTUM_MIN, SCATTERING_MOMENTUM_MAX], sigma: [2, 5], progress: [0, 1], playbackSpeed: [PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX], finalTime: data.lab === 'scattering' ? [SCATTERING_FINAL_TIME_MIN, SCATTERING_FINAL_TIME_MAX] : [LAB_FINAL_TIME_MIN, LAB_FINAL_TIME_MAX] } as const;
  for (const field of Object.keys(bounds) as Array<keyof typeof bounds>) {
    const value = data[field];
    if (value !== undefined && ((!['playbackSpeed', 'finalTime'].includes(field) && data.lab !== 'scattering') || typeof value !== 'number' || !Number.isFinite(value) || value < bounds[field][0] || value > bounds[field][1])) {
      throw new Error(`${field} : valeur non applicable ou hors de l’intervalle ${bounds[field][0]} à ${bounds[field][1]}.`);
    }
  }
  if (data.potential !== undefined && (data.lab !== 'scattering' || !SCATTERING_POTENTIALS.includes(data.potential as NonNullable<ExperimentCommand['potential']>))) {
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

  if (data.wellModes !== undefined && (data.lab !== 'well' || data.mode === 'stationary')) throw new Error('wellModes est réservé au mode évolution du puits infini.');
  const wellModes = data.wellModes === undefined ? undefined : parseWellModes(data.wellModes);
  if (data.wellLinear !== undefined && (data.lab !== 'well' || typeof data.wellLinear !== 'number' || !Number.isFinite(data.wellLinear) || Math.abs(data.wellLinear) > 20)) throw new Error('wellLinear est réservé au puits infini : pente lambda entre -20 et 20, 0 désactive la perturbation.');
  if (data.wellWidth !== undefined && (data.lab !== 'well' || typeof data.wellWidth !== 'number' || !Number.isFinite(data.wellWidth) || data.wellWidth < .5 || data.wellWidth > 4)) throw new Error('wellWidth est réservé au puits infini et doit être compris entre 0.5 et 4.');
  return {
    lab: data.lab,
    mode:
      (data.mode as ExperimentCommand['mode']) ??
      (data.preset || wellModes ? 'evolution' : data.quantumNumber !== undefined ? 'stationary' : undefined),
    quantumNumber: data.quantumNumber as number | undefined,
    preset: data.preset as string | undefined,
    time: data.time as number | undefined,
    scale: data.scale as number | undefined,
    potential: data.potential as ExperimentCommand['potential'],
    height: data.height as number | undefined,
    width: data.width as number | undefined,
    gravity: data.gravity as number | undefined,
    momentum: data.momentum as number | undefined,
    sigma: data.sigma as number | undefined,
    progress: data.progress as number | undefined,
    playbackSpeed: data.playbackSpeed as number | undefined,
    finalTime: data.finalTime as number | undefined,
    barrier: data.barrier as number | undefined,
    separation: data.separation as number | undefined,
    wellModes,
    wellWidth: data.wellWidth as number | undefined,
    wellLinear: data.wellLinear as number | undefined,
  };
}

export function QuantumLab() {
  const [lab, setLab] = useState<Lab>('scattering');
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
          `Configure les huit laboratoires. stern-gerlach : sgJ, sgGradient, sgVelocity, sgLength, sgDistance, sgAngle, sgG, sgMass, sgBeam et sgModel. time et finalTime sont en ms (time de 0 à 20, finalTime de 1 à 20), scale de 0.5 à 4 règle la taille des impacts. sgBeam polarisé sélectionne j=1/2 et le modèle quantique ; sinon j différent de 1/2 ou sgModel=classical impose mixed. Pas de mode ni de preset pour Stern–Gerlach. scattering : potential, height, width, momentum, sigma, progress. double-well : barrier, separation, preset left/right, time (phase ΔE t/ℏ). rotor : angular (ℓ, défaut 1), magnetic (m, défaut 0), inertia (I/I0, défaut 1), resolution (maillage 3D, ${ROTOR_RESOLUTION_MIN} à ${ROTOR_RESOLUTION_MAX} par pas de ${ROTOR_RESOLUTION_STEP}, défaut 64). hydrogen : principal (n, défaut 1), angular (ℓ, défaut 0), magnetic (m, défaut 0), basis (complex/real), atomicView (slice/radial), plane (xz/xy/yz/oblique). Respecter |m|≤ℓ<n pour hydrogen. rotor et hydrogen acceptent mode stationary/evolution ; en évolution, choisir un preset rotor-polar/rotor-rotation ou hydrogen-breathing/hydrogen-dipole/hydrogen-rotation et time (phase ΔE t/ℏ de 0 à 20π). Ils n’utilisent pas quantumNumber. spin : spinTheta et spinPhi en degrés, spinField (x/y/z/tilted), spinMeasure (x/y/z), spinOmega (Ω/Ω0), time (Ω0t, de 0 à 20π), preset spin-x-plus/minus, spin-y-plus/minus ou spin-z-plus/minus. Les angles explicites priment sur le preset. Tous les laboratoires acceptent playbackSpeed et finalTime ; ce dernier utilise la même unité interne que time, pas t/T. scale est accepté sauf pour rotor, qui utilise resolution à la place. La lecture reste en pause.`,
        inputSchema: {
          type: 'object',
          properties: {
            lab: { type: 'string', enum: ['well', 'oscillator', 'scattering', 'double-well', 'rotor', 'hydrogen', 'spin', 'stern-gerlach'] },
            sgJ: { type: 'number', enum: SG_J },
            sgGradient: { type: 'number', minimum: -1500, maximum: 1500, description: 'Gradient de Stern–Gerlach en T/m.' },
            sgVelocity: { type: 'number', minimum: 100, maximum: 1000, description: 'Vitesse longitudinale en m/s.' },
            sgLength: { type: 'number', minimum: 1, maximum: 10, description: 'Longueur de l’aimant en cm.' },
            sgDistance: { type: 'number', minimum: 2, maximum: 30, description: 'Distance entre aimant et écran en cm.' },
            sgAngle: { type: 'number', minimum: 0, maximum: 180, description: 'Axe dans le plan xz : 0=+z, 90=+x, 180=-z (degrés).' },
            sgG: { type: 'number', minimum: .5, maximum: 2 },
            sgMass: { type: 'number', minimum: 20, maximum: 200, description: 'Masse de l’atome modèle en u.' },
            sgBeam: { type: 'string', enum: SG_BEAMS },
            sgModel: { type: 'string', enum: ['quantum', 'classical'] },
            mode: { type: 'string', enum: ['stationary', 'evolution'] },
            quantumNumber: { type: 'integer', minimum: 0, maximum: 8 },
            wellModes: { type: 'array', minItems: 1, maxItems: 10, description: 'Puits infini, évolution : amplitudes relatives et phases en degrés. Normalisation automatique ; au moins une amplitude non nulle.', items: { type: 'object', properties: { n: { type: 'integer', minimum: 1, maximum: 10 }, amplitude: { type: 'number', minimum: 0, maximum: 1 }, phase: { type: 'number', minimum: -180, maximum: 180 } }, required: ['n', 'amplitude'], additionalProperties: false } },
            wellWidth: { type: 'number', minimum: .5, maximum: 4, description: 'Largeur a du puits infini. L’abscisse reste x/a.' },
            wellLinear: { type: 'number', minimum: -20, maximum: 20, description: 'Perturbation du puits infini : V/E_ref = lambda (x/a - 1/2). 0 désactive ; sinon remet le temps à zéro avant d’appliquer le temps demandé. États initiaux définis dans la base non perturbée.' },
            preset: {
              type: 'string',
              enum: [
                'low-pair',
                'high-pair',
                'parabola',
                'custom',
                'mixture',
                'coherent',
                'opposite',
                'quadrature',
                'tunnel',
                'transmission',
                'reflection',
                'free',
                'gravity',
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
            time: { type: 'number', minimum: 0, maximum: LAB_FINAL_TIME_MAX, description: 'Temps réduit ou phase interne jusqu’à 20π. Diffusion : utiliser progress.' },
            spinTheta: { type: 'number', minimum: 0, maximum: 180 },
            spinPhi: { type: 'number', minimum: 0, maximum: 360 },
            spinOmega: { type: 'number', minimum: .25, maximum: 3 },
            spinField: { type: 'string', enum: ['x', 'y', 'z', 'tilted'] },
            spinMeasure: { type: 'string', enum: ['x', 'y', 'z'] },
            potential: { type: 'string', enum: SCATTERING_POTENTIALS },
            height: { type: 'number', minimum: 0, maximum: 8 },
            width: { type: 'number', minimum: 0.5, maximum: 6 },
            gravity: { type: 'number', minimum: 0, maximum: GRAVITY_MAX, description: 'Diffusion, gravity : accélération g en unités réduites (hbar=m=1), potentiel mgz sur tout l’axe, z orienté vers le haut, sans sol. free donne V=0. height et width ne s’appliquent pas à ces deux potentiels.' },
            momentum: { type: 'number', minimum: SCATTERING_MOMENTUM_MIN, maximum: SCATTERING_MOMENTUM_MAX },
            sigma: { type: 'number', minimum: 2, maximum: 5 },
            progress: { type: 'number', minimum: 0, maximum: 1 },
            playbackSpeed: { type: 'number', minimum: PLAYBACK_SPEED_MIN, maximum: PLAYBACK_SPEED_MAX, description: 'Tous les laboratoires : vitesse relative (1 normale), sans changer l’évolution physique.' },
            finalTime: { type: 'number', minimum: LAB_FINAL_TIME_MIN, maximum: SCATTERING_FINAL_TIME_MAX, description: 'Fin de lecture : même unité interne que time (phase pour double-well/rotor/hydrogen), jusqu’à 20π. Diffusion : de 1 à 120, borné selon le paquet pour limiter les effets des bords numériques.' },
            barrier: { type: 'number', minimum: 0.5, maximum: 8 },
            separation: { type: 'number', minimum: 0.8, maximum: 2.5 },
            principal: { type: 'integer', minimum: 1, maximum: 40, description: 'Hydrogène : 1 à 5, ou 10 à 40 pour les états circulaires (ell=n−1, |m|=ell).' },
            angular: { type: 'integer', minimum: 0, maximum: 39, description: 'Rotateur : au plus 5. Hydrogène : ell<n ; pour n≥10, ell=n−1.' },
            magnetic: { type: 'integer', minimum: -39, maximum: 39 },
            inertia: { type: 'number', minimum: .5, maximum: 5 },
            resolution: { type: 'integer', minimum: ROTOR_RESOLUTION_MIN, maximum: ROTOR_RESOLUTION_MAX, multipleOf: ROTOR_RESOLUTION_STEP, description: 'Rotateur uniquement : subdivisions polaires du maillage 3D ; deux fois plus de subdivisions azimutales. Défaut 64. Sans effet sur la physique, le zoom ou la distribution polaire.' },
            basis: { type: 'string', enum: ['complex', 'real'] },
            atomicView: { type: 'string', enum: ['slice', 'radial'] },
            plane: { type: 'string', enum: ['xz', 'xy', 'yz', 'oblique'] },
            scale: {
              type: 'number',
              minimum: DISPLAY_SCALE_MIN,
              maximum: 100,
              description: 'Gain graphique uniquement : jusqu’à 20, ou 100 pour l’hydrogène (coupe et profil radial). Non utilisé par le rotateur : employer resolution.',
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
            playbackSpeed: parsed.playbackSpeed ?? null,
            finalTime: parsed.finalTime ?? null,
            potential: parsed.potential ?? null,
            gravity: parsed.gravity ?? null,
            principal: parsed.principal ?? null,
            angular: parsed.angular ?? null,
            magnetic: parsed.magnetic ?? null,
            spinTheta: parsed.spinTheta ?? null,
            spinPhi: parsed.spinPhi ?? null,
            spinOmega: parsed.spinOmega ?? null,
            spinField: parsed.spinField ?? null,
            spinMeasure: parsed.spinMeasure ?? null,
            wellModes: parsed.wellModes ?? null,
            wellWidth: parsed.wellWidth ?? null,
            wellLinear: parsed.wellLinear ?? null,
            sgJ: parsed.sgJ ?? null,
            sgGradient: parsed.sgGradient ?? null,
            sgVelocity: parsed.sgVelocity ?? null,
            sgLength: parsed.sgLength ?? null,
            sgDistance: parsed.sgDistance ?? null,
            sgAngle: parsed.sgAngle ?? null,
            sgG: parsed.sgG ?? null,
            sgMass: parsed.sgMass ?? null,
            sgBeam: parsed.sgBeam ?? null,
            sgModel: parsed.sgModel ?? null,
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
            className={lab === 'scattering' ? 'lab-tab lab-tab-scattering is-active' : 'lab-tab lab-tab-scattering'}
            onClick={() => setLab('scattering')}
            aria-pressed={lab === 'scattering'}
          >
            <span>01</span> Diffusion paquets d’ondes
          </Button>
          <Button
            variant="ghost"
            className={lab === 'well' ? 'lab-tab lab-tab-well is-active' : 'lab-tab lab-tab-well'}
            onClick={() => setLab('well')}
            aria-pressed={lab === 'well'}
          >
            <span>02</span> Puits infini
          </Button>
          <Button
            variant="ghost"
            className={lab === 'oscillator' ? 'lab-tab lab-tab-oscillator is-active' : 'lab-tab lab-tab-oscillator'}
            onClick={() => setLab('oscillator')}
            aria-pressed={lab === 'oscillator'}
          >
            <span>03</span> Oscillateur harmonique
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
          <Button variant="ghost" className={`lab-tab lab-tab-sg${lab === 'stern-gerlach' ? ' is-active' : ''}`}
            onClick={() => setLab('stern-gerlach')} aria-pressed={lab === 'stern-gerlach'}><span>08</span> Stern–Gerlach</Button>
        </nav>

      </header>

      <div id="laboratory" tabIndex={-1}>
        <div hidden={lab !== 'scattering'}>
          <ScatteringLab active={lab === 'scattering'} command={command} />
        </div>
        <div hidden={lab !== 'well'}>
          <InfiniteWellLab active={lab === 'well'} command={command} />
        </div>
        <div hidden={lab !== 'oscillator'}>
          <HarmonicLab active={lab === 'oscillator'} command={command} />
        </div>
        <div hidden={lab !== 'double-well'}>
          <DoubleWellLab active={lab === 'double-well'} command={command} />
        </div>
        <div hidden={lab !== 'rotor'}><RotorLab active={lab === 'rotor'} command={command} /></div>
        <div hidden={lab !== 'hydrogen'}><HydrogenLab active={lab === 'hydrogen'} command={command} /></div>
        <div hidden={lab !== 'spin'}><SpinLab active={lab === 'spin'} command={command} /></div>
        <div hidden={lab !== 'stern-gerlach'}><SternGerlachLab active={lab === 'stern-gerlach'} command={command} /></div>
      </div>

      <footer>
        <span>John Martin</span>
      </footer>
    </main>
  );
}
