import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier === './playback' ? './playback.ts' : specifier, context); } });
const { SG_DEFAULTS: p, SG_J, SG_SIGMA_MM, sgChannels, sgDeflection, sgFlightTime, sgProbabilities, sgScreenRange, sgDensity, sgParticles, parseSternGerlach } = await import('../lib/stern-gerlach.ts');
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const channels = sgChannels(p, 'mixed');
assert.deepEqual(channels.map(c => [c.m, c.mu, c.probability]), [[-.5, 1, .5], [.5, -1, .5]]);
assert.ok(channels[0].position > 0 && channels[1].position < 0, 'Electronic magnetic moment and angular momentum have opposite signs');
near(channels[0].position, -channels[1].position);
const y = (p.length + p.distance) / 100;
near(sgDeflection(1, { ...p, gradient: -p.gradient }, y), -sgDeflection(1, p, y));
near(sgDeflection(1, { ...p, velocity: 2 * p.velocity }, y), sgDeflection(1, p, y) / 4);
near(sgDeflection(1, { ...p, mass: 2 * p.mass }, y), sgDeflection(1, p, y) / 2);
near(sgDeflection(1, { ...p, gradient: 0 }, y), 0);
near(sgDeflection(1, p, 0), 0);
const L = p.length / 100, h = 1e-7;
near((sgDeflection(1, p, L + h) - sgDeflection(1, p, L)) / h,
  (sgDeflection(1, p, L) - sgDeflection(1, p, L - h)) / h, 1e-4);
near(sgFlightTime(p), .36);
assert.deepEqual(sgProbabilities(p, 'z-plus'), [0, 1]);
assert.deepEqual(sgProbabilities(p, 'z-minus'), [1, 0]);
near(sgProbabilities({ ...p, angle: 90 }, 'z-plus')[1], .5);
near(sgProbabilities({ ...p, angle: 90 }, 'x-plus')[1], 1);
near(sgProbabilities({ ...p, angle: 180 }, 'z-plus')[1], 0);
for (const angle of [0, 20, 70, 180]) near(sgProbabilities({ ...p, angle }, 'y-plus')[1], .5);

for (const j of SG_J) {
  const config = { ...p, j }, states = sgChannels(config, 'mixed'), range = sgScreenRange(config);
  assert.equal(states.length, 2 * j + 1); near(states.reduce((sum, c) => sum + c.probability, 0), 1);
  for (const model of ['quantum', 'classical']) {
    const steps = 12000, dx = 2 * range / steps;
    let integral = 0, mean = 0;
    for (let i = 0; i < steps; i++) {
      const x = -range + (i + .5) * dx, density = sgDensity(x, config, 'mixed', model);
      assert.ok(density >= 0 && Number.isFinite(density)); integral += density * dx; mean += x * density * dx;
    }
    near(integral, 1, 1e-6); near(mean, 0, 1e-8);
  }
}
near(sgDensity(0, { ...p, gradient: 0 }, 'mixed', 'classical'), 1 / (Math.sqrt(2 * Math.PI) * SG_SIGMA_MM));
assert.equal(sgParticles(p, 'mixed', 'quantum', sgFlightTime(p) - .001, 7).filter(c => c.detected).length, 0);
const particles = sgParticles(p, 'mixed', 'quantum', 20, 7), hits = particles.filter(c => c.detected);
assert.ok(Math.abs(hits.filter(c => c.channel === 0).length / hits.length - .5) < .06);
assert.deepEqual(particles, sgParticles(p, 'mixed', 'quantum', 20, 7), 'Replay and scrubbing are reproducible');
assert.notDeepEqual(particles, sgParticles(p, 'mixed', 'quantum', 20, 8), 'New series uses a different sample');
const earlier = sgParticles(p, 'mixed', 'quantum', 1, 7).filter(c => c.detected);
for (const hit of earlier) { near(hit.x, particles[hit.id].x); near(hit.z, particles[hit.id].z); }
const vertical = sgParticles(p, 'mixed', 'quantum', 2, 9).filter(c => c.detected);
const horizontal = sgParticles({ ...p, angle: 90 }, 'mixed', 'quantum', 2, 9).filter(c => c.detected);
vertical.forEach((hit, i) => { near(hit.z, horizontal[i].x); near(hit.x, -horizontal[i].z); });
assert.ok(sgParticles(p, 'z-plus', 'quantum', 20, 3).every(c => c.channel === 1));
assert.equal(parseSternGerlach({ lab: 'stern-gerlach', sgJ: .5, sgBeam: 'z-plus', sgAngle: 90, finalTime: 12 }).sgAngle, 90);
for (const extra of [{ sgJ: 2 }, { sgGradient: NaN }, { sgVelocity: 0 }, { sgLength: 11 }, { sgMass: 0 }, { sgAngle: 181 }, { sgBeam: 'unknown' }, { sgModel: 'other' }, { sgJ: 1, sgBeam: 'z-plus' }, { sgModel: 'classical', sgBeam: 'z-plus' }, { scale: 5 }, { finalTime: 21 }, { time: 2, finalTime: 1 }, { mode: 'evolution' }]) {
  assert.throws(() => parseSternGerlach({ lab: 'stern-gerlach', ...extra }));
}
console.log('Stern–Gerlach: signed magnetic force, continuous exit velocity, deflection scaling, 2j+1 channels, Born probabilities, normalized profiles, rotated detector, reproducible sampling and input bounds pass.');
