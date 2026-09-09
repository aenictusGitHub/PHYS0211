export const ROTOR_RESOLUTION_MIN = 24;
export const ROTOR_RESOLUTION_MAX = 192;
export const ROTOR_RESOLUTION_STEP = 8;
export const ROTOR_RESOLUTION_DEFAULT = 64;

export function validRotorResolution(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= ROTOR_RESOLUTION_MIN
    && value <= ROTOR_RESOLUTION_MAX && (value - ROTOR_RESOLUTION_MIN) % ROTOR_RESOLUTION_STEP === 0;
}

/** Equal angular steps in theta and phi. Includes duplicated seam vertices and
 * face-center samples for phase colors; never changes the quantum basis. */
export function rotorSurfaceGrid(resolution = ROTOR_RESOLUTION_DEFAULT) {
  if (!validRotorResolution(resolution)) throw new Error(`Résolution du rotateur : de ${ROTOR_RESOLUTION_MIN} à ${ROTOR_RESOLUTION_MAX}, par pas de ${ROTOR_RESOLUTION_STEP}.`);
  const latitudes = resolution, longitudes = 2 * resolution;
  const angles: { theta: number; phi: number }[] = [];
  const directions: { x: number; y: number; z: number }[] = [];
  const faces: { indices: number[]; sample: number }[] = [];
  for (let i = 0; i <= latitudes; i++) {
    const theta = i * Math.PI / latitudes;
    for (let j = 0; j <= longitudes; j++) {
      const phi = j * 2 * Math.PI / longitudes;
      angles.push({ theta, phi });
      directions.push({ x: Math.sin(theta) * Math.cos(phi), y: Math.sin(theta) * Math.sin(phi), z: Math.cos(theta) });
    }
  }
  for (let i = 0; i < latitudes; i++) for (let j = 0; j < longitudes; j++) {
    const first = i * (longitudes + 1) + j;
    faces.push({ indices: [first, first + 1, first + longitudes + 2, first + longitudes + 1], sample: angles.length });
    angles.push({ theta: (i + .5) * Math.PI / latitudes, phi: (j + .5) * 2 * Math.PI / longitudes });
  }
  return { angles, directions, faces, latitudes, longitudes };
}
