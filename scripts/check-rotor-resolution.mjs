import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { rotorSurfaceGrid, validRotorResolution, ROTOR_RESOLUTION_DEFAULT, ROTOR_RESOLUTION_MAX } from '../lib/rotor-resolution.ts';
import { sphericalHarmonic } from '../lib/atomic.ts';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(['./atomic', './playback', './rotor-resolution', './anharmonic-oscillator'].includes(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { angularSurfaceReference, ROTOR_PRESETS } = await import('../lib/atomic-dynamics.ts');
const { solveRotorField, prepareRotorField, evolveRotorField } = await import('../lib/rotor-field.ts');
const { parseAtomicExperiment } = await import('../lib/atomic-command.ts');
const near = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

assert.equal(ROTOR_RESOLUTION_DEFAULT, 64);
assert.equal(ROTOR_RESOLUTION_MAX, 192);
assert.equal(rotorSurfaceGrid().faces.length, 8192);
assert.equal(rotorSurfaceGrid(192).faces.length, 73728);
for (const value of [undefined, null, NaN, Infinity, 23, 193, 200, 64.5, 25, '64']) {
  assert.equal(validRotorResolution(value), false);
  if (value !== undefined) assert.throws(() => rotorSurfaceGrid(value));
}
for (let resolution = 24; resolution <= ROTOR_RESOLUTION_MAX; resolution += 8) {
  const { angles, directions, faces, latitudes, longitudes } = rotorSurfaceGrid(resolution);
  assert.equal(latitudes, resolution); assert.equal(longitudes, 2 * resolution);
  assert.equal(directions.length, (resolution + 1) * (2 * resolution + 1));
  assert.equal(faces.length, 2 * resolution ** 2);
  assert.equal(angles.length, directions.length + faces.length);
  directions.forEach(point => near(Math.hypot(point.x, point.y, point.z), 1));
  for (let i = 0; i <= resolution; i++) {
    const first = directions[i * (longitudes + 1)], last = directions[i * (longitudes + 1) + longitudes];
    near(first.x, last.x); near(first.y, last.y); near(first.z, last.z);
  }
  for (const face of faces) {
    assert.equal(face.indices.length, 4);
    assert.ok(face.indices.every(i => Number.isInteger(i) && i >= 0 && i < directions.length));
    assert.ok(face.sample >= directions.length && face.sample < angles.length);
    const first = angles[face.indices[0]], last = angles[face.indices[2]], center = angles[face.sample];
    near(center.theta, (first.theta + last.theta) / 2);
    near(center.phi, (first.phi + last.phi) / 2);
  }
  const parsed = parseAtomicExperiment({ lab: 'rotor', resolution });
  assert.equal(parsed.resolution, resolution); assert.equal(parsed.scale, undefined);
}
for (const value of [0, 200, 25, 64.5, '64']) assert.throws(() => parseAtomicExperiment({ lab: 'rotor', resolution: value }));
assert.throws(() => parseAtomicExperiment({ lab: 'rotor', scale: 2 }));
assert.throws(() => parseAtomicExperiment({ lab: 'hydrogen', resolution: 64 }));
assert.equal(parseAtomicExperiment({ lab: 'hydrogen', scale: 4 }).scale, 4);

const terms = [{ l: 3, m: 1 }], reference = angularSurfaceReference(terms);
const density = theta => {
  const y = sphericalHarmonic(3, 1, theta, 0);
  return (y.re ** 2 + y.im ** 2) / reference;
};
let previousError = Infinity;
for (const resolution of [24, 48, 96, 192]) {
  // Piecewise planar approximation converges to the same analytic surface.
  let error = 0;
  for (let i = 0; i < resolution; i++) {
    const theta = (i + .5) * Math.PI / resolution;
    error += Math.abs(density(theta) - (density(i * Math.PI / resolution) + density((i + 1) * Math.PI / resolution)) / 2);
  }
  error /= resolution;
  assert.ok(error < previousError * .3, 'Finer geometry reduces interpolation error'); previousError = error;
  const grid = rotorSurfaceGrid(resolution), point = grid.angles[(resolution / 3) * (2 * resolution + 1) + resolution / 2];
  near(point.theta, Math.PI / 3); near(point.phi, Math.PI / 2);
  near(density(point.theta), density(Math.PI / 3), 1e-12); // Same radius, no resolution-dependent zoom.
}

const spectrum = solveRotorField(10);
for (const preset of ROTOR_PRESETS) {
  const prepared = prepareRotorField(spectrum, preset.terms.map(c => ({ ...c, re: 1 / Math.sqrt(2), im: 0 })));
  const ceiling = angularSurfaceReference(prepared.basis, prepared.bounds);
  for (const phase of [0, .7, 3.1, 20 * Math.PI]) {
    const coefficients = evolveRotorField(prepared, phase);
    for (let j = 0; j <= 1024; j++) {
      const theta = j * Math.PI / 1024, phi = j * .73;
      let re = 0, im = 0;
      for (const c of coefficients) {
        const y = sphericalHarmonic(c.l, c.m, theta, phi);
        re += c.re * y.re - c.im * y.im; im += c.re * y.im + c.im * y.re;
      }
      assert.ok(re * re + im * im <= ceiling + 1e-12, 'Fixed density reference contains the evolving perturbed surface');
    }
  }
}
console.log('Rotor resolution: 24–192, geometry counts, closed seam, valid samples, convergence, fixed size, unchanged physical state and command validation pass.');
