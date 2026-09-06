/** One-dimensional Schrödinger evolution in units hbar = m = 1.
 * Strang splitting: exp(-i V dt/2) FFT^-1 exp(-i k² dt/2) FFT exp(-i V dt/2).
 * The distant periodic boundaries are outside the propagation window used here.
 */
export type PotentialKind = 'barrier' | 'gaussian' | 'well';
export type ScatteringConfig = {
  potential: PotentialKind;
  height: number;
  width: number;
  momentum: number;
  sigma: number;
};

export const SCATTERING_DEFAULT: ScatteringConfig = {
  potential: 'barrier', height: 2.5, width: 1, momentum: 2, sigma: 3,
};
export const SCATTERING_PRESETS = {
  tunnel: { potential: 'barrier', height: 2.5, width: 1, momentum: 2, sigma: 3 },
  transmission: { potential: 'barrier', height: 1.5, width: 2, momentum: 2.8, sigma: 3 },
  reflection: { potential: 'barrier', height: 6, width: 3, momentum: 2, sigma: 3 },
} satisfies Record<string, ScatteringConfig>;

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

export function potentialAt(x: number, config: ScatteringConfig) {
  if (config.potential === 'gaussian') {
    return config.height * Math.exp(-2 * (x / config.width) ** 2);
  }
  return Math.abs(x) < config.width / 2
    ? config.height * (config.potential === 'well' ? -1 : 1)
    : 0;
}

export function interactionEdge(config: ScatteringConfig) {
  return config.width * (config.potential === 'gaussian' ? 1.5 : 0.5);
}

export function scatteringDuration(config: ScatteringConfig) {
  return 56 / config.momentum;
}

export function incidentEnergy(config: ScatteringConfig) {
  return config.momentum ** 2 / 2 + 1 / (8 * config.sigma ** 2);
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
): ScatteringTimeline {
  const duration = scatteringDuration(config);
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

/** Interpolate densities (not complex amplitudes) to preserve probability. */
export function sampleTimeline(timeline: ScatteringTimeline, time: number) {
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
