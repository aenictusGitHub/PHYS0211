/** One-dimensional Schrödinger evolution in units hbar = m = 1.
 * Strang splitting: exp(-i V dt/2) FFT^-1 exp(-i k² dt/2) FFT exp(-i V dt/2).
 * Free / uniform-gravity packets use the exact Gaussian solution on the line.
 * Localized potentials use distant periodic boundaries outside the time window.
 */
export type PotentialKind = 'free' | 'gravity' | 'barrier' | 'gaussian' | 'well';
export const SCATTERING_POTENTIALS: readonly PotentialKind[] = ['free', 'gravity', 'barrier', 'gaussian', 'well'];
export type ScatteringConfig = {
  potential: PotentialKind;
  height: number;
  width: number;
  momentum: number;
  sigma: number;
  /** Reduced gravitational acceleration, with z increasing upwards. */
  gravity?: number;
};

export const GRAVITY_DEFAULT = 0.15;
export const GRAVITY_MAX = 0.5;
export const SCATTERING_MOMENTUM_MIN = 0.75;
export const SCATTERING_MOMENTUM_MAX = 4;
export const SCATTERING_MOMENTUM_STEP = 0.00001;
export const SCATTERING_DEFAULT: ScatteringConfig = {
  potential: 'barrier', height: 2.5, width: 1, momentum: 2, sigma: 3, gravity: GRAVITY_DEFAULT,
};
export const SCATTERING_PRESETS = {
  tunnel: { potential: 'barrier', height: 2.5, width: 1, momentum: 2, sigma: 3, gravity: GRAVITY_DEFAULT },
  transmission: { potential: 'barrier', height: 1.5, width: 2, momentum: 2.8, sigma: 3, gravity: GRAVITY_DEFAULT },
  reflection: { potential: 'barrier', height: 6, width: 3, momentum: 2, sigma: 3, gravity: GRAVITY_DEFAULT },
} satisfies Record<string, ScatteringConfig>;

export const PROPAGATION_PRESETS = {
  free: { ...SCATTERING_DEFAULT, potential: 'free' },
  gravity: { ...SCATTERING_DEFAULT, potential: 'gravity' },
} satisfies Record<string, ScatteringConfig>;

export const ALL_SCATTERING_PRESETS = { ...SCATTERING_PRESETS, ...PROPAGATION_PRESETS };

export function isUniformField(config: ScatteringConfig) {
  return config.potential === 'free' || config.potential === 'gravity';
}

export function gravitationalAcceleration(config: ScatteringConfig) {
  return config.potential === 'gravity' ? config.gravity ?? GRAVITY_DEFAULT : 0;
}

/** Stable across property order, including configurations received as commands. */
export function scatteringConfigKey(config: ScatteringConfig) {
  return JSON.stringify([config.potential, isUniformField(config) ? 0 : config.height,
    isUniformField(config) ? 0 : config.width, gravitationalAcceleration(config),
    config.momentum, config.sigma]);
}

export const PACKET_CENTER = -24;
export const GRID_SIZE = 4096;
export const DOMAIN_LENGTH = 256;
export const DX = DOMAIN_LENGTH / GRID_SIZE;
// Keeps the largest resolved kinetic phase below pi, avoiding spurious
// high-frequency transmission channels at discontinuous potential edges.
export const SCATTERING_DT = 0.0025;
export const FRAME_COUNT = 361;
export const SAMPLE_START = GRID_SIZE / 4;
export const SAMPLE_STRIDE = 2;
export const SAMPLE_COUNT = GRID_SIZE / 4;
export const SAMPLE_X = Float64Array.from({ length: SAMPLE_COUNT }, (_, j) =>
  -DOMAIN_LENGTH / 2 + (SAMPLE_START + j * SAMPLE_STRIDE + 0.5) * DX,
);
export const SCATTERING_FINAL_TIME_MIN = 1;
export const SCATTERING_FINAL_TIME_MAX = 120;

/** Conservative outgoing-packet envelope before periodic numerical boundaries.
 * Use four initial spatial/momentum standard deviations; uniform fields are
 * evaluated on the entire line and have no periodic-boundary restriction.
 */
export function scatteringFinalTimeMax(config: ScatteringConfig) {
  if (isUniformField(config)) return SCATTERING_FINAL_TIME_MAX;
  const distance = DOMAIN_LENGTH / 2 - PACKET_CENTER - 4 * config.sigma;
  const speed = config.momentum + 2 / config.sigma;
  return Math.max(SCATTERING_FINAL_TIME_MIN, Math.min(SCATTERING_FINAL_TIME_MAX, Math.floor(distance / speed)));
}

/** Editable endpoint, distinct from the physical potential and playback rate. */
export function scatteringFinalTime(config: ScatteringConfig, requested?: number | null) {
  const value = requested === undefined || requested === null || !Number.isFinite(requested)
    ? Math.round(scatteringDuration(config)) : requested;
  return Math.max(SCATTERING_FINAL_TIME_MIN, Math.min(scatteringFinalTimeMax(config), value));
}

export function potentialAt(x: number, config: ScatteringConfig) {
  if (config.potential === 'free') return 0;
  if (config.potential === 'gravity') return gravitationalAcceleration(config) * x;
  if (config.potential === 'gaussian') {
    return config.height * Math.exp(-2 * (x / config.width) ** 2);
  }
  return Math.abs(x) < config.width / 2
    ? config.height * (config.potential === 'well' ? -1 : 1)
    : 0;
}

export function interactionEdge(config: ScatteringConfig) {
  if (isUniformField(config)) return 0;
  return config.width * (config.potential === 'gaussian' ? 1.5 : 0.5);
}

/** Exact step geometry for display; uses the same edges as the propagator. */
export function scatteringPotentialProfile(config: ScatteringConfig) {
  if (config.potential === 'gaussian') return Array.from(SAMPLE_X, x => ({ x, y: potentialAt(x, config) }));
  if (isUniformField(config)) return [{ x: -64, y: potentialAt(-64, config) }, { x: 64, y: potentialAt(64, config) }];
  const edge = interactionEdge(config), height = config.height * (config.potential === 'well' ? -1 : 1);
  return [{ x: -64, y: 0 }, { x: -edge, y: 0 }, { x: -edge, y: height },
    { x: edge, y: height }, { x: edge, y: 0 }, { x: 64, y: 0 }];
}

export function scatteringDuration(config: ScatteringConfig) {
  const freeDuration = 56 / config.momentum, g = gravitationalAcceleration(config);
  // End the downward flight when its center reaches z=-40, leaving room for
  // the Gaussian tails in the fixed view. This is a time window, not a wall.
  return g > 0 ? Math.min(freeDuration, (config.momentum + Math.sqrt(config.momentum ** 2 + 32 * g)) / g) : freeDuration;
}

export function incidentEnergy(config: ScatteringConfig) {
  return config.momentum ** 2 / 2 + 1 / (8 * config.sigma ** 2);
}

/** Include the initial potential contribution; the zero of mgz is z=0. */
export function initialPotentialEnergy(config: ScatteringConfig) {
  if (isUniformField(config)) return gravitationalAcceleration(config) * PACKET_CENTER;
  let energy = 0;
  const normalization = 1 / (Math.sqrt(2 * Math.PI) * config.sigma);
  for (let j = 0; j < GRID_SIZE; j++) {
    const x = -DOMAIN_LENGTH / 2 + (j + .5) * DX;
    energy += potentialAt(x, config) * normalization * Math.exp(-((x - PACKET_CENTER) ** 2) / (2 * config.sigma ** 2)) * DX;
  }
  return energy;
}

export function uniformFieldMoments(config: ScatteringConfig, time: number) {
  const g = gravitationalAcceleration(config);
  return {
    position: PACKET_CENTER + config.momentum * time - g * time * time / 2,
    momentum: config.momentum - g * time,
    sigma: Math.sqrt(config.sigma ** 2 + time * time / (4 * config.sigma ** 2)),
  };
}

/** Exact complex Gaussian for V(z)=gz (hbar=m=1), not a periodic ramp.
 * psi_g(z,t)=exp[-i(g t z + g²t³/6)] psi_free(z+g t²/2,t).
 */
export function uniformFieldWavefunction(config: ScatteringConfig, time: number) {
  const g = gravitationalAcceleration(config), sigma2 = config.sigma ** 2;
  const spreading = time / (2 * sigma2), denominator = 1 + spreading * spreading;
  const amplitude = (2 * Math.PI * sigma2 * denominator) ** -.25;
  const center = uniformFieldMoments(config, time).position;
  const phaseOffset = -.5 * Math.atan(spreading) - config.momentum ** 2 * time / 2
    + config.momentum * g * time * time / 2 - g * g * time ** 3 / 6;
  return (z: number) => {
    const scaledDistance = (z - center) ** 2 / (4 * sigma2 * denominator);
    const envelope = amplitude * Math.exp(-scaledDistance);
    const phase = (config.momentum - g * time) * z + spreading * scaledDistance + phaseOffset;
    return { re: envelope * Math.cos(phase), im: envelope * Math.sin(phase) };
  };
}

export type ScatteringSnapshot = {
  re: Float32Array;
  im: Float32Array;
  left: number;
  center: number;
  right: number;
  norm: number;
};

export type ScatteringTimeline = {
  real: Float32Array;
  imaginary: Float32Array;
  probabilities: Float64Array;
  duration: number;
  maxDensity: number;
  maxAmplitude: number;
  /** Uniform fields can be evaluated exactly at every animation time. */
  analyticalConfig?: ScatteringConfig;
  /** Selected after checking the full safe numerical trajectory. */
  automaticFinalTime?: number;
  /** Undefined for free propagation/uniform gravity, where there is no collision. */
  scatteringComplete?: boolean;
};

/** In-place radix-two FFT, with unit inverse normalization. */
class FourierTransform {
  private reversed = new Uint32Array(GRID_SIZE);
  private cosine = new Float64Array(GRID_SIZE / 2);
  private sine = new Float64Array(GRID_SIZE / 2);

  constructor() {
    const bits = Math.log2(GRID_SIZE);
    for (let i = 0; i < GRID_SIZE; i++) {
      let value = i;
      let reverse = 0;
      for (let j = 0; j < bits; j++) {
        reverse = (reverse << 1) | (value & 1);
        value >>= 1;
      }
      this.reversed[i] = reverse;
    }
    for (let i = 0; i < GRID_SIZE / 2; i++) {
      this.cosine[i] = Math.cos(2 * Math.PI * i / GRID_SIZE);
      this.sine[i] = Math.sin(2 * Math.PI * i / GRID_SIZE);
    }
  }

  apply(re: Float64Array, im: Float64Array, inverse = false) {
    for (let i = 0; i < GRID_SIZE; i++) {
      const j = this.reversed[i];
      if (j > i) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let size = 2; size <= GRID_SIZE; size *= 2) {
      const half = size / 2;
      const stride = GRID_SIZE / size;
      for (let start = 0; start < GRID_SIZE; start += size) {
        for (let j = 0; j < half; j++) {
          const cosine = this.cosine[j * stride];
          const sine = this.sine[j * stride] * (inverse ? 1 : -1);
          const a = start + j;
          const b = a + half;
          const real = cosine * re[b] - sine * im[b];
          const imaginary = sine * re[b] + cosine * im[b];
          re[b] = re[a] - real;
          im[b] = im[a] - imaginary;
          re[a] += real;
          im[a] += imaginary;
        }
      }
    }
    if (inverse) {
      for (let i = 0; i < GRID_SIZE; i++) {
        re[i] /= GRID_SIZE;
        im[i] /= GRID_SIZE;
      }
    }
  }
}

export class ScatteringSolver {
  readonly re = new Float64Array(GRID_SIZE);
  readonly im = new Float64Array(GRID_SIZE);
  readonly config: ScatteringConfig;
  readonly dt: number;
  private time = 0;
  private fft = new FourierTransform();
  private potentialCos = new Float64Array(GRID_SIZE);
  private potentialSin = new Float64Array(GRID_SIZE);
  private kineticCos = new Float64Array(GRID_SIZE);
  private kineticSin = new Float64Array(GRID_SIZE);

  constructor(config: ScatteringConfig, dt = SCATTERING_DT) {
    this.config = config;
    this.dt = dt;
    const normalization = (2 * Math.PI * config.sigma ** 2) ** -0.25;
    for (let i = 0; i < GRID_SIZE; i++) {
      const x = -DOMAIN_LENGTH / 2 + (i + 0.5) * DX;
      const envelope = normalization * Math.exp(-((x - PACKET_CENTER) ** 2) / (4 * config.sigma ** 2));
      this.re[i] = envelope * Math.cos(config.momentum * x);
      this.im[i] = envelope * Math.sin(config.momentum * x);
      const potentialPhase = -potentialAt(x, config) * dt / 2;
      this.potentialCos[i] = Math.cos(potentialPhase);
      this.potentialSin[i] = Math.sin(potentialPhase);
      const k = 2 * Math.PI * (i < GRID_SIZE / 2 ? i : i - GRID_SIZE) / DOMAIN_LENGTH;
      this.kineticCos[i] = Math.cos(-k * k * dt / 2);
      this.kineticSin[i] = Math.sin(-k * k * dt / 2);
    }
  }

  private phase(cos: Float64Array, sin: Float64Array) {
    for (let i = 0; i < GRID_SIZE; i++) {
      const real = this.re[i];
      this.re[i] = real * cos[i] - this.im[i] * sin[i];
      this.im[i] = real * sin[i] + this.im[i] * cos[i];
    }
  }

  step(count = 1) {
    if (isUniformField(this.config)) {
      this.time += count * this.dt;
      const evaluate = uniformFieldWavefunction(this.config, this.time);
      for (let j = 0; j < GRID_SIZE; j++) {
        const value = evaluate(-DOMAIN_LENGTH / 2 + (j + .5) * DX);
        this.re[j] = value.re;
        this.im[j] = value.im;
      }
      return;
    }
    for (let i = 0; i < count; i++) {
      this.phase(this.potentialCos, this.potentialSin);
      this.fft.apply(this.re, this.im);
      this.phase(this.kineticCos, this.kineticSin);
      this.fft.apply(this.re, this.im, true);
      this.phase(this.potentialCos, this.potentialSin);
    }
  }

  snapshot(): ScatteringSnapshot {
    const edge = interactionEdge(this.config);
    let left = 0;
    let center = 0;
    let right = 0;
    for (let i = 0; i < GRID_SIZE; i++) {
      const x = -DOMAIN_LENGTH / 2 + (i + 0.5) * DX;
      const p = (this.re[i] ** 2 + this.im[i] ** 2) * DX;
      if (x < -edge) left += p;
      else if (x > edge) right += p;
      else center += p;
    }
    const re = new Float32Array(SAMPLE_COUNT);
    const im = new Float32Array(SAMPLE_COUNT);
    for (let j = 0; j < SAMPLE_COUNT; j++) {
      re[j] = this.re[SAMPLE_START + j * SAMPLE_STRIDE];
      im[j] = this.im[SAMPLE_START + j * SAMPLE_STRIDE];
    }
    return { re, im, left, center, right, norm: left + center + right };
  }
}

export function computeScatteringTimeline(
  config: ScatteringConfig,
  onProgress?: (progress: number) => void,
  finalTime?: number,
): ScatteringTimeline {
  const duration = finalTime === undefined ? scatteringDuration(config) : scatteringFinalTime(config, finalTime);
  if (isUniformField(config)) {
    const maxDensity = 1 / (Math.sqrt(2 * Math.PI) * config.sigma);
    onProgress?.(1);
    return { real: new Float32Array(0), imaginary: new Float32Array(0), probabilities: new Float64Array(0),
      duration, maxDensity, maxAmplitude: Math.sqrt(maxDensity), analyticalConfig: { ...config } };
  }
  const frameDt = duration / (FRAME_COUNT - 1);
  const stepsPerFrame = Math.ceil(frameDt / SCATTERING_DT);
  const solver = new ScatteringSolver(config, frameDt / stepsPerFrame);
  const real = new Float32Array(FRAME_COUNT * SAMPLE_COUNT);
  const imaginary = new Float32Array(real.length);
  const probabilities = new Float64Array(FRAME_COUNT * 3);
  let maxDensity = 0;
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    if (frame > 0) solver.step(stepsPerFrame);
    const snapshot = solver.snapshot();
    real.set(snapshot.re, frame * SAMPLE_COUNT);
    imaginary.set(snapshot.im, frame * SAMPLE_COUNT);
    probabilities.set([snapshot.left, snapshot.center, snapshot.right], frame * 3);
    for (let j = 0; j < SAMPLE_COUNT; j++) {
      maxDensity = Math.max(maxDensity, snapshot.re[j] ** 2 + snapshot.im[j] ** 2);
    }
    if (frame % 30 === 0) onProgress?.(frame / (FRAME_COUNT - 1));
  }
  return { real, imaginary, probabilities, duration, maxDensity, maxAmplitude: Math.sqrt(maxDensity) };
}

export const SCATTERING_RESIDUAL_TOLERANCE = .005;
export const SCATTERING_STABILITY_TOLERANCE = .001;

/** Choose a post-collision endpoint from measured probabilities, not merely
 * flight time. Require <0.5% in the interaction region and <0.1 percentage
 * point change in either outgoing fraction over several packet transit times.
 * Starting after the incident center reaches the far edge avoids mistaking
 * the initial, pre-collision plateau for completed scattering.
 */
export function automaticScatteringEndpoint(config: ScatteringConfig, timeline: ScatteringTimeline) {
  if (isUniformField(config)) return { time: scatteringFinalTime(config), complete: undefined };
  const minimum = (-PACKET_CENTER + interactionEdge(config)) / config.momentum;
  const settling = Math.max(2, 2 * config.sigma / config.momentum);
  const after = Math.max(1, config.sigma / config.momentum);
  const limit = Math.floor(Math.min(timeline.duration, scatteringFinalTimeMax(config)));
  for (let time = Math.ceil(minimum + settling + after); time <= limit; time++) {
    const begin = Math.max(0, Math.floor((time - settling - after) / timeline.duration * (FRAME_COUNT - 1)));
    const end = Math.min(FRAME_COUNT - 1, Math.ceil(time / timeline.duration * (FRAME_COUNT - 1)));
    let minLeft = Infinity, maxLeft = -Infinity, minRight = Infinity, maxRight = -Infinity, center = 0;
    for (let frame = begin; frame <= end; frame++) {
      const [left, middle, right] = timeline.probabilities.subarray(frame * 3, frame * 3 + 3);
      minLeft = Math.min(minLeft, left); maxLeft = Math.max(maxLeft, left);
      minRight = Math.min(minRight, right); maxRight = Math.max(maxRight, right);
      center = Math.max(center, middle);
    }
    if (center <= SCATTERING_RESIDUAL_TOLERANCE
      && maxLeft - minLeft <= SCATTERING_STABILITY_TOLERANCE
      && maxRight - minRight <= SCATTERING_STABILITY_TOLERANCE) return { time, complete: true };
  }
  return { time: limit, complete: false };
}

/** Keep the safe full history for seeking/manual extension; choose the visible
 * endpoint separately, after the outgoing packets have actually separated.
 */
export function computeAutomaticScatteringTimeline(config: ScatteringConfig, onProgress?: (progress: number) => void): ScatteringTimeline {
  const timeline = computeScatteringTimeline(config, onProgress,
    isUniformField(config) ? scatteringFinalTime(config) : scatteringFinalTimeMax(config));
  const endpoint = automaticScatteringEndpoint(config, timeline);
  return { ...timeline, automaticFinalTime: endpoint.time, scatteringComplete: endpoint.complete };
}

/** Interpolate densities (not complex amplitudes) to preserve probability. */
export function sampleTimeline(timeline: ScatteringTimeline, time: number) {
  if (timeline.analyticalConfig) {
    const config = timeline.analyticalConfig;
    const evaluate = uniformFieldWavefunction(config, Math.max(0, Math.min(timeline.duration, time)));
    const re = new Float32Array(SAMPLE_COUNT), im = new Float32Array(SAMPLE_COUNT), density = new Float32Array(SAMPLE_COUNT);
    for (let j = 0; j < SAMPLE_COUNT; j++) {
      const value = evaluate(SAMPLE_X[j]);
      re[j] = value.re; im[j] = value.im;
      density[j] = value.re ** 2 + value.im ** 2;
    }
    // Probability partition at the origin, only for numerical consistency;
    // the UI shows moments instead of scattering fractions for uniform fields.
    let left = 0, right = 0;
    for (let j = 0; j < GRID_SIZE; j++) {
      const z = -DOMAIN_LENGTH / 2 + (j + .5) * DX, value = evaluate(z);
      const probability = (value.re ** 2 + value.im ** 2) * DX;
      if (z < 0) left += probability; else right += probability;
    }
    return { density, re, im, left, center: 0, right };
  }
  const position = Math.max(0, Math.min(FRAME_COUNT - 1, time / timeline.duration * (FRAME_COUNT - 1)));
  const a = Math.floor(position);
  const b = Math.min(FRAME_COUNT - 1, a + 1);
  const blend = position - a;
  const density = new Float32Array(SAMPLE_COUNT);
  const re = new Float32Array(SAMPLE_COUNT);
  const im = new Float32Array(SAMPLE_COUNT);
  for (let j = 0; j < SAMPLE_COUNT; j++) {
    const p = a * SAMPLE_COUNT + j;
    const q = b * SAMPLE_COUNT + j;
    density[j] = (1 - blend) * (timeline.real[p] ** 2 + timeline.imaginary[p] ** 2)
      + blend * (timeline.real[q] ** 2 + timeline.imaginary[q] ** 2);
    re[j] = (1 - blend) * timeline.real[p] + blend * timeline.real[q];
    im[j] = (1 - blend) * timeline.imaginary[p] + blend * timeline.imaginary[q];
  }
  const probabilities = [0, 1, 2].map(j =>
    (1 - blend) * timeline.probabilities[a * 3 + j] + blend * timeline.probabilities[b * 3 + j],
  );
  return { density, re, im, left: probabilities[0], center: probabilities[1], right: probabilities[2] };
}
