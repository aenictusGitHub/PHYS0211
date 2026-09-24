import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(['./atomic', './atomic-dynamics'].includes(specifier) ? `${specifier}.ts` : specifier, context); } });
const { sampleHydrogenCloud, hydrogenCloudAtPhase, projectCloudPoint } = await import('../lib/hydrogen-cloud.ts');
const { HYDROGEN_PRESETS, circularRydbergPreset, radialSuperposition } = await import('../lib/atomic-dynamics.ts');
const { radialMean, radialExtent } = await import('../lib/atomic.ts');
const close = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} vs ${b}`);
const mean = (points, f) => points.reduce((sum, p) => sum + f(p), 0) / points.length;
const radius = p => Math.hypot(p.x, p.y, p.z);
const state = (n, l, m, basis = 'complex') => ({ n, l, m, basis });
const ground = sampleHydrogenCloud([state(1, 0, 0)], 24000);
const points = hydrogenCloudAtPhase(ground, 0);
assert.equal(points.length, 24000);
close(mean(points, radius), 1.5, .025, 'Ground-state mean radius');
close(mean(points, p => radius(p) ** 2), 3, .1, 'Ground-state second moment');
for (const axis of ['x', 'y', 'z']) { close(mean(points, p => p[axis]), 0, .03, 'Isotropy'); close(mean(points, p => (p[axis] / radius(p)) ** 2), 1 / 3, .015, 'Uniform solid angle'); }
assert.deepEqual(hydrogenCloudAtPhase(ground, 1), points, 'Stationary density is independent of time');
assert.deepEqual(sampleHydrogenCloud([state(1, 0, 0)], 10).candidates, ground.candidates.slice(0, 10), 'Deterministic sampling');
assert.equal(sampleHydrogenCloud([state(1, 0, 0)], 1000).extent, ground.extent, 'Point count never changes the camera extent');
for (const [m, axis] of [[0, 'z'], [1, 'x'], [-1, 'y']]) {
  const orbital = hydrogenCloudAtPhase(sampleHydrogenCloud([state(2, 1, m, 'real')], 16000), 0);
  close(mean(orbital, p => (p[axis] / radius(p)) ** 2), .6, .02, `Real 2p_${axis} orientation`);
  close(mean(orbital, radius), 5, .08, '2p radial Jacobian');
}
for (const n of [2, 5, 20, 40]) {
  const l = n < 10 ? 0 : n - 1;
  const orbital = hydrogenCloudAtPhase(sampleHydrogenCloud([state(n, l, l)], 16000), 0);
  close(mean(orbital, radius), radialMean(n, l), .025 * radialMean(n, l), `Radial nodes/Rydberg n=${n}`);
  assert.ok(orbital.every(p => Number.isFinite(radius(p))));
}
for (const preset of [...HYDROGEN_PRESETS, circularRydbergPreset(39)]) {
  const samples = sampleHydrogenCloud(preset.terms, 16000), limit = radialExtent(Math.max(...preset.terms.map(t => t.n)));
  for (const phase of [0, Math.PI / 2, Math.PI]) {
    const cloud = hydrogenCloudAtPhase(samples, phase);
    assert.equal(cloud.length, 16000, 'Requested point count is maintained during evolution');
    let expected = 0;
    for (let i = 0; i < 10000; i++) { const r = limit * (i + .5) / 10000; expected += r * radialSuperposition(preset.terms, r, phase) * limit / 10000; }
    close(mean(cloud, radius), expected, expected * .035, `${preset.id}, phase=${phase}`);
  }
  const atZero = hydrogenCloudAtPhase(samples, 0), atPeriod = hydrogenCloudAtPhase(samples, 2 * Math.PI);
  assert.equal(atZero.length, atPeriod.length);
  atZero.forEach((p, i) => { assert.equal(p.x, atPeriod[i].x); assert.equal(p.z, atPeriod[i].z); });
}
const p = { x: 2, y: -3, z: 4 };
for (const count of [1000, 30000]) {
  const samples = sampleHydrogenCloud(HYDROGEN_PRESETS[1].terms, count);
  for (let step = 0; step <= 24; step++) assert.equal(hydrogenCloudAtPhase(samples, step * Math.PI / 12).length, count);
}
close(radius(projectCloudPoint(p, .8, -.3)), radius(p), 1e-12, 'Camera rotation preserves distances');
console.log('Hydrogen cloud: normalization, isotropy, radial Jacobian/nodes, real orbitals, Rydberg, coherent evolution, replay and projection pass.');
