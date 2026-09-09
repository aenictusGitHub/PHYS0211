import assert from 'node:assert/strict';
import { sphericalHarmonic, angularWave, angularDensity, hydrogenRadial, hydrogenWave, radialDistribution, radialMean, radialExtent, phaseRgb, sliceCoordinates } from '../lib/atomic.ts';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(['./playback', './rotor-resolution'].includes(specifier) ? `${specifier}.ts` : specifier, context); } });
const { parseAtomicExperiment } = await import('../lib/atomic-command.ts');

const close = (a, b, tolerance, name) => assert.ok(Math.abs(a - b) < tolerance, `${name}: ${a} versus ${b}`);
function simpson(f, lo, hi, intervals = 2000) {
  const step = (hi - lo) / intervals;
  let sum = f(lo) + f(hi);
  for (let i = 1; i < intervals; i++) sum += (i % 2 ? 4 : 2) * f(lo + i * step);
  return sum * step / 3;
}

close(sphericalHarmonic(0, 0, .4, .7).re, 1 / Math.sqrt(4 * Math.PI), 1e-14, 'Y00');
close(sphericalHarmonic(1, 0, .4, .7).re, Math.sqrt(3 / (4 * Math.PI)) * Math.cos(.4), 1e-14, 'Y10');
close(sphericalHarmonic(1, 1, .4, .7).re, -Math.sqrt(3 / (8 * Math.PI)) * Math.sin(.4) * Math.cos(.7), 1e-14, 'Y11 Condon–Shortley phase');
for (let l = 0; l <= 5; l++) {
  for (let m = -l; m <= l; m++) {
    const norm = simpson(theta => 2 * Math.PI * Math.sin(theta) * angularDensity(l, m, theta), 0, Math.PI);
    close(norm, 1, 2e-9, `Complex angular norm ${l},${m}`);
    const realNorm = simpson(theta => {
      let sum = 0;
      for (let j = 0; j < 32; j++) sum += angularWave(l, m, theta, 2 * Math.PI * (j + .5) / 32, 'real').re ** 2;
      return Math.sin(theta) * sum * 2 * Math.PI / 32;
    }, 0, Math.PI, 800);
    close(realNorm, 1, 1e-7, `Real angular norm ${l},${m}`);
    const positive = sphericalHarmonic(l, Math.abs(m), .714, 1.32);
    const negative = sphericalHarmonic(l, -Math.abs(m), .714, 1.32);
    close(negative.re, (-1) ** Math.abs(m) * positive.re, 1e-14, 'Conjugation real');
    close(negative.im, -((-1) ** Math.abs(m)) * positive.im, 1e-14, 'Conjugation imaginary');
  }
}
console.log('All rotor states through ell=5: angular normalization, phases and real-basis normalization pass.');

close(hydrogenRadial(1, 0, .8), 2 * Math.exp(-.8), 1e-14, 'R10');
close(hydrogenRadial(2, 0, .8), (2 - .8) * Math.exp(-.4) / Math.sqrt(8), 1e-14, 'R20');
close(hydrogenRadial(2, 1, .8), .8 * Math.exp(-.4) / Math.sqrt(24), 1e-14, 'R21');
close(hydrogenRadial(2, 0, 2), 0, 1e-14, '2s radial node');
assert.ok(radialDistribution(1, 0, 1) > radialDistribution(1, 0, .99));
assert.ok(radialDistribution(1, 0, 1) > radialDistribution(1, 0, 1.01));
for (let n = 1; n <= 5; n++) {
  for (let l = 0; l < n; l++) {
    const upper = 6 * n * n + 20 * n;
    close(simpson(r => radialDistribution(n, l, r), 0, upper, 10000), 1, 2e-8, `Radial norm ${n},${l}`);
    close(simpson(r => r * radialDistribution(n, l, r), 0, upper, 10000), radialMean(n, l), 2e-7, `Mean radius ${n},${l}`);
    const probabilityInFrame = simpson(r => radialDistribution(n, l, r), 0, radialExtent(n), 4000);
    assert.ok(probabilityInFrame > .9999 && probabilityInFrame < 1.000001, 'Radial plotting frame contains probability');
    let nodes = 0, previousSign = 0;
    for (let i = 1; i < 5000; i++) {
      const value = hydrogenRadial(n, l, upper * i / 5000);
      if (Math.abs(value) < 1e-12) continue;
      const sign = Math.sign(value);
      if (previousSign && sign !== previousSign) nodes++;
      previousSign = sign;
    }
    assert.equal(nodes, n - l - 1, 'Correct count of radial nodes');
  }
}
const px = { n: 2, l: 1, m: 1 }, py = { n: 2, l: 1, m: -1 };
close(hydrogenWave(px, 1, 0, 0, 'real').re, -hydrogenWave(px, -1, 0, 0, 'real').re, 1e-14, 'px sign');
assert.ok(hydrogenWave(px, 1, 0, 0, 'real').re > 0, 'Conventional positive px lobe');
close(hydrogenWave(py, 1, 0, .3, 'real').re, 0, 1e-14, 'py nodal xz plane');
assert.ok(hydrogenWave(py, 0, 1, 0, 'real').re > 0, 'Conventional positive py lobe');
close(hydrogenWave({ n: 1, l: 0, m: 0 }, 0, 0, 0).re, 1 / Math.sqrt(Math.PI), 1e-14, '1s at origin');
assert.deepEqual(phaseRgb(-Math.PI), phaseRgb(Math.PI), 'Cyclic phase key');
console.log('All hydrogen radial states through n=5: normalization, mean radius, node counts and real orbitals pass.');

for (const plane of ['xy', 'xz', 'yz', 'oblique']) {
  const point = sliceCoordinates(1.3, -.7, plane);
  close(Math.hypot(...point), Math.hypot(1.3, -.7), 1e-14, 'Orthonormal slice coordinates');
}
const oblique = sliceCoordinates(1.3, -.7, 'oblique');
close(oblique.reduce((sum, value) => sum + value, 0), 0, 1e-14, 'Oblique plane equation');
for (let l = 0; l < 5; l++) for (let m = -l; m <= l; m++) {
  let maximum = 0;
  for (const u of [.41, 1.17, 2.31]) for (const v of [.63, 1.41, 2.77]) {
    maximum = Math.max(maximum, Math.abs(hydrogenWave({ n: l + 1, l, m }, ...sliceCoordinates(u, v, 'oblique'), 'real').re));
  }
  assert.ok(maximum > 1e-10, 'Every real orbital is visible in the oblique plane');
}

assert.equal(parseAtomicExperiment({ lab: 'rotor', angular: 5, magnetic: -5 }).magnetic, -5);
assert.equal(parseAtomicExperiment({ lab: 'hydrogen', principal: 5, angular: 4, magnetic: 4, basis: 'real' }).principal, 5);
assert.equal(parseAtomicExperiment({ lab: 'hydrogen', plane: 'oblique' }).plane, 'oblique');
for (const data of [
  { lab: 'hydrogen', principal: 0 }, { lab: 'hydrogen', principal: 2, angular: 2 },
  { lab: 'rotor', angular: 2, magnetic: 3 }, { lab: 'rotor', inertia: NaN },
  { lab: 'hydrogen', principal: 2.5 }, { lab: 'hydrogen', time: 2 },
  { lab: 'hydrogen', basis: 'invalid' }, { lab: 'rotor', principal: 2 },
]) assert.throws(() => parseAtomicExperiment(data));
console.log('Configuration validation rejects invalid quantum numbers and unsupported parameters.');

for (const n of [10, 20, 30, 40]) {
  const l = n - 1, upper = radialExtent(n);
  close(simpson(r => radialDistribution(n, l, r), 0, upper, 12000), 1, 2e-10, `Circular Rydberg norm n=${n}`);
  close(simpson(r => r * radialDistribution(n, l, r), 0, upper, 12000), n * (n + .5), 2e-7, `Circular Rydberg radius n=${n}`);
  close(simpson(theta => 2 * Math.PI * Math.sin(theta) * angularDensity(l, l, theta), 0, Math.PI, 4000), 1, 2e-10, `Circular angular norm n=${n}`);
  const peak = radialDistribution(n, l, n * n);
  assert.ok(peak > radialDistribution(n, l, n * n - 1) && peak > radialDistribution(n, l, n * n + 1), 'Circular radial maximum at n squared');
  assert.ok(peak < .02, 'Common circular-state vertical bound');
  const plus = hydrogenWave({ n, l, m: l }, n * n, 0, 0), minus = hydrogenWave({ n, l, m: -l }, n * n, 0, 0);
  close(plus.re ** 2 + plus.im ** 2, minus.re ** 2 + minus.im ** 2, 1e-18, 'Opposite circular signs have equal density');
  assert.equal(parseAtomicExperiment({ lab: 'hydrogen', principal: n }).angular, n - 1);
}
assert.throws(() => parseAtomicExperiment({ lab: 'hydrogen', principal: 20, angular: 0 }));
assert.throws(() => parseAtomicExperiment({ lab: 'hydrogen', principal: 40, angular: 39, magnetic: 0 }));
console.log('Circular Rydberg n=10…40: radial/angular norms, radii, signs and bounds pass.');
