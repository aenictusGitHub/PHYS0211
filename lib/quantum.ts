export type Complex = { re: number; im: number };

export type Coefficient = Complex & { n: number };

export type WellPreset = 'low-pair' | 'high-pair' | 'parabola';
export type OscillatorPreset = 'mixture' | 'coherent' | 'opposite' | 'quadrature';

export const TAU_MAX = 2 * Math.PI;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function sliderValue(
  value: number | readonly number[],
  fallback: number,
) {
  return typeof value === 'number' ? value : (value[0] ?? fallback);
}

export function factorial(n: number) {
  let value = 1;
  for (let index = 2; index <= n; index += 1) value *= index;
  return value;
}

export function hermite(n: number, x: number) {
  if (n === 0) return 1;
  if (n === 1) return 2 * x;

  let previous = 1;
  let current = 2 * x;
  for (let order = 1; order < n; order += 1) {
    const next = 2 * x * current - 2 * order * previous;
    previous = current;
    current = next;
  }
  return current;
}

export function wellEigenfunction(n: number, u: number, width = 1) {
  if (u < 0 || u > 1 || width <= 0) return 0;
  return Math.sqrt(2 / width) * Math.sin(n * Math.PI * u);
}

export function harmonicEigenfunction(n: number, xi: number) {
  const normalization =
    Math.pow(Math.PI, -0.25) /
    Math.sqrt(Math.pow(2, n) * factorial(n));
  return normalization * Math.exp(-(xi * xi) / 2) * hermite(n, xi);
}

export function normalizeCoefficients(coefficients: Coefficient[]) {
  const norm = Math.sqrt(
    coefficients.reduce(
      (total, coefficient) =>
        total + coefficient.re * coefficient.re + coefficient.im * coefficient.im,
      0,
    ),
  );

  if (norm === 0) return coefficients;
  return coefficients.map((coefficient) => ({
    ...coefficient,
    re: coefficient.re / norm,
    im: coefficient.im / norm,
  }));
}

export function wellCoefficients(preset: WellPreset): Coefficient[] {
  if (preset === 'low-pair') {
    return [1, 2].map((n) => ({ n, re: 1 / Math.sqrt(2), im: 0 }));
  }

  if (preset === 'high-pair') {
    return [9, 10].map((n) => ({ n, re: 1 / Math.sqrt(2), im: 0 }));
  }

  return normalizeCoefficients(
    Array.from({ length: 30 }, (_, index) => {
      const n = index + 1;
      return {
        n,
        re:
          (-4 * Math.sqrt(15) * (Math.pow(-1, n) - 1)) /
          (Math.pow(n, 3) * Math.pow(Math.PI, 3)),
        im: 0,
      };
    }),
  );
}

function multiplyByPhase(
  coefficient: Complex,
  energy: number,
  time: number,
) {
  const cosine = Math.cos(energy * time);
  const sine = Math.sin(energy * time);
  return {
    re: coefficient.re * cosine + coefficient.im * sine,
    im: coefficient.im * cosine - coefficient.re * sine,
  };
}

export function wellDensity(
  coefficients: Coefficient[],
  u: number,
  time: number,
  width = 1,
) {
  let re = 0;
  let im = 0;

  coefficients.forEach((coefficient) => {
    const phase = multiplyByPhase(coefficient, coefficient.n ** 2, time);
    const phi = wellEigenfunction(coefficient.n, u, width);
    re += phase.re * phi;
    im += phase.im * phi;
  });

  return width * (re * re + im * im);
}

export function coherentCoefficients(
  alpha: Complex,
  cutoff = 30,
): Coefficient[] {
  const magnitudeSquared = alpha.re * alpha.re + alpha.im * alpha.im;
  const coefficients: Coefficient[] = [
    { n: 0, re: Math.exp(-magnitudeSquared / 2), im: 0 },
  ];

  for (let n = 1; n <= cutoff; n += 1) {
    const previous = coefficients[n - 1];
    coefficients.push({
      n,
      re: (previous.re * alpha.re - previous.im * alpha.im) / Math.sqrt(n),
      im: (previous.re * alpha.im + previous.im * alpha.re) / Math.sqrt(n),
    });
  }

  return normalizeCoefficients(coefficients);
}

function combineCoefficientSets(
  sets: Array<{ coefficients: Coefficient[]; weight: Complex }>,
) {
  const maximumN = Math.max(
    ...sets.map(({ coefficients }) => coefficients.at(-1)?.n ?? 0),
  );
  const result: Coefficient[] = [];

  for (let n = 0; n <= maximumN; n += 1) {
    let re = 0;
    let im = 0;
    sets.forEach(({ coefficients, weight }) => {
      const coefficient = coefficients.find((entry) => entry.n === n);
      if (!coefficient) return;
      re += coefficient.re * weight.re - coefficient.im * weight.im;
      im += coefficient.re * weight.im + coefficient.im * weight.re;
    });
    result.push({ n, re, im });
  }

  return normalizeCoefficients(result);
}

export function oscillatorCoefficients(
  preset: OscillatorPreset,
  alpha: Complex,
) {
  if (preset === 'mixture') {
    return normalizeCoefficients([
      { n: 0, re: 1, im: 0 },
      { n: 1, re: 2, im: 0 },
      { n: 2, re: 2, im: 0 },
    ]);
  }

  if (preset === 'coherent') return coherentCoefficients(alpha);

  if (preset === 'opposite') {
    return combineCoefficientSets([
      { coefficients: coherentCoefficients({ re: 0, im: 2 }), weight: { re: 1, im: 0 } },
      { coefficients: coherentCoefficients({ re: 0, im: -2 }), weight: { re: 2, im: 0 } },
    ]);
  }

  return combineCoefficientSets([
    { coefficients: coherentCoefficients({ re: 0, im: 2 }), weight: { re: 1, im: 0 } },
    { coefficients: coherentCoefficients({ re: 2, im: 0 }), weight: { re: 2, im: 0 } },
  ]);
}

export function harmonicDensity(
  coefficients: Coefficient[],
  xi: number,
  time: number,
) {
  let re = 0;
  let im = 0;

  coefficients.forEach((coefficient) => {
    const phase = multiplyByPhase(
      coefficient,
      coefficient.n + 0.5,
      time,
    );
    const phi = harmonicEigenfunction(coefficient.n, xi);
    re += phase.re * phi;
    im += phase.im * phi;
  });

  return re * re + im * im;
}

export function expectationEnergy(coefficients: Coefficient[]) {
  return coefficients.reduce(
    (total, coefficient) =>
      total +
      (coefficient.re * coefficient.re + coefficient.im * coefficient.im) *
        (coefficient.n + 0.5),
    0,
  );
}

export function numericalExpectationX(
  values: Array<{ x: number; density: number }>,
) {
  if (values.length < 2) return 0;
  const step = values[1].x - values[0].x;
  const norm = values.reduce((sum, value) => sum + value.density * step, 0);
  if (norm === 0) return 0;
  return (
    values.reduce(
      (sum, value) => sum + value.x * value.density * step,
      0,
    ) / norm
  );
}
