import assert from 'node:assert/strict';
import {
  SCATTERING_DEFAULT, SCATTERING_POTENTIALS, SCATTERING_PRESETS, ALL_SCATTERING_PRESETS,
  PROPAGATION_PRESETS, GRAVITY_DEFAULT, GRAVITY_MAX,
  ScatteringSolver, potentialAt, scatteringPotentialProfile, scatteringConfigKey,
  scatteringDuration, uniformFieldMoments, uniformFieldWavefunction,
  incidentEnergy, initialPotentialEnergy, computeScatteringTimeline, sampleTimeline,
  GRID_SIZE, DOMAIN_LENGTH, DX, PACKET_CENTER, SAMPLE_X,
} from '../lib/scattering.ts';

const close = (a, b, tolerance, label) => assert.ok(Math.abs(a - b) < tolerance, `${label}: ${a} vs ${b}`);
assert.deepEqual(SCATTERING_POTENTIALS, ['free', 'gravity', 'barrier', 'gaussian', 'well']);
assert.deepEqual(Object.keys(ALL_SCATTERING_PRESETS).sort(), ['free', 'gravity', 'reflection', 'transmission', 'tunnel']);
assert.equal(Object.keys(SCATTERING_PRESETS).length, 3, 'Localized-potential presets are preserved');
assert.ok(!Object.values(ALL_SCATTERING_PRESETS).some(p => p.potential === 'double-barrier'));
assert.equal(PROPAGATION_PRESETS.gravity.gravity, GRAVITY_DEFAULT);

for (const potential of ['free', 'gravity']) {
  for (const gravity of [0, .01, GRAVITY_DEFAULT, GRAVITY_MAX]) {
    for (const momentum of [.75, 2, 4]) {
      for (const sigma of [2, 5]) {
        const config = { ...SCATTERING_DEFAULT, potential, gravity, momentum, sigma };
        const acceleration = potential === 'gravity' ? gravity : 0;
        const duration = scatteringDuration(config);
        assert.ok(Number.isFinite(duration) && duration > 0);
        const profile = scatteringPotentialProfile(config);
        for (const z of [-128, -64, -24, 0, 64, 128]) close(potentialAt(z, config), acceleration * z, 1e-12, 'Potential on the entire axis');
        assert.deepEqual(profile.map(p => p.x), [-64, 64]);
        for (const point of profile) close(point.y, point.x * acceleration, 1e-12, 'Linear/zero potential profile');
        close(initialPotentialEnergy(config), acceleration * PACKET_CENTER, 1e-12, 'Initial gravitational energy');
        assert.equal(scatteringConfigKey(config), scatteringConfigKey({ ...config, height: 8, width: 6 }), 'Hidden obstacle parameters do not affect uniform fields');
        if (potential === 'free') assert.equal(scatteringConfigKey(config), scatteringConfigKey({ ...config, gravity: .5 }));

        for (const fraction of [0, .37, 1]) {
          const time = fraction * duration, evaluate = uniformFieldWavefunction(config, time);
          const expectedPosition = PACKET_CENTER + momentum * time - .5 * acceleration * time * time;
          const expectedMomentum = momentum - acceleration * time;
          const expectedVariance = sigma * sigma + time * time / (4 * sigma * sigma);
          let norm = 0, position = 0, variance = 0, meanMomentum = 0, kinetic = 0;
          const dz = .0001;
          // Integrate the exact solution on a wider interval than the display
          // grid so its extreme, freely spreading tails do not bias moments.
          for (let j = 0; j < 2 * GRID_SIZE; j++) {
            const z = -DOMAIN_LENGTH + (j + .5) * DX;
            const psi = evaluate(z), plus = evaluate(z + dz), minus = evaluate(z - dz);
            const reDerivative = (plus.re - minus.re) / (2 * dz), imDerivative = (plus.im - minus.im) / (2 * dz);
            const density = psi.re ** 2 + psi.im ** 2;
            norm += density * DX;
            position += z * density * DX;
            variance += (z - expectedPosition) ** 2 * density * DX;
            meanMomentum += (psi.re * imDerivative - psi.im * reDerivative) * DX;
            kinetic += .5 * (reDerivative ** 2 + imDerivative ** 2) * DX;
          }
          close(norm, 1, 2e-7, 'Unit norm over the numerical domain');
          close(position, expectedPosition, 2e-5, 'Ehrenfest position');
          close(variance, expectedVariance, 2e-3, 'Free Gaussian spreading under uniform force');
          close(meanMomentum, expectedMomentum, 1e-5, 'Momentum from the complex wavefunction');
          close(kinetic + acceleration * position, incidentEnergy(config) + initialPotentialEnergy(config), 3e-5, 'Conserved total energy');
          const moments = uniformFieldMoments(config, time);
          close(moments.position, expectedPosition, 1e-12, 'Displayed position');
          close(moments.momentum, expectedMomentum, 1e-12, 'Displayed momentum');
          close(moments.sigma ** 2, expectedVariance, 1e-10, 'Displayed width');
          assert.ok(moments.position >= -40.000001 && moments.position <= 32.000001, 'Center stays in the visible time window');
        }
      }
    }
  }
}

// Independent finite-difference check of i dpsi/dt = -psi''/2 + gz psi.
for (const gravity of [0, .15, .5]) {
  const config = { ...PROPAGATION_PRESETS.gravity, gravity };
  for (const time of [0, 2.3, 10]) {
    const center = uniformFieldMoments(config, time).position;
    const psiAt = uniformFieldWavefunction(config, time);
    const dt = .000001, dz = .0002;
    const after = uniformFieldWavefunction(config, time + dt), before = uniformFieldWavefunction(config, time - dt);
    for (const z of [center - 2, center, center + 3]) {
      const psi = psiAt(z), plus = psiAt(z + dz), minus = psiAt(z - dz), next = after(z), previous = before(z);
      const lhsRe = -(next.im - previous.im) / (2 * dt), lhsIm = (next.re - previous.re) / (2 * dt);
      const rhsRe = -.5 * (plus.re - 2 * psi.re + minus.re) / (dz * dz) + gravity * z * psi.re;
      const rhsIm = -.5 * (plus.im - 2 * psi.im + minus.im) / (dz * dz) + gravity * z * psi.im;
      close(lhsRe, rhsRe, 3e-6, 'Schrödinger equation, real part');
      close(lhsIm, rhsIm, 3e-6, 'Schrödinger equation, imaginary part');
    }
  }
}

for (const config of Object.values(PROPAGATION_PRESETS)) {
  const timeline = computeScatteringTimeline(config);
  assert.ok(timeline.analyticalConfig, 'Real-time sampling uses the exact complex state');
  for (const fraction of [0, .231, .7, 1, .4, 0]) {
    const time = fraction * timeline.duration, frame = sampleTimeline(timeline, time);
    const evaluate = uniformFieldWavefunction(config, time);
    close(frame.left + frame.center + frame.right, 1, 1e-9, 'Timeline probabilities');
    for (let j = 0; j < SAMPLE_X.length; j += 19) {
      const expected = evaluate(SAMPLE_X[j]);
      close(frame.re[j], expected.re, 3e-8, 'Real part at arbitrary scrub time');
      close(frame.im[j], expected.im, 3e-8, 'Imaginary part at arbitrary scrub time');
      close(frame.density[j], expected.re ** 2 + expected.im ** 2, 3e-8, 'Density consistent with complex state');
    }
  }
  const solver = new ScatteringSolver(config, .01);
  solver.step(100); solver.step(130);
  const expected = uniformFieldWavefunction(config, 2.3);
  for (let j = 0; j < GRID_SIZE; j += 41) close(solver.re[j], expected(-DOMAIN_LENGTH / 2 + (j + .5) * DX).re, 1e-12, 'Solver composes analytical time steps');
}
const zeroGravity = { ...PROPAGATION_PRESETS.gravity, gravity: 0 };
for (const time of [0, 5, 20]) {
  for (const z of [-64, -24, 0, 32]) assert.deepEqual(uniformFieldWavefunction(zeroGravity, time)(z), uniformFieldWavefunction(PROPAGATION_PRESETS.free, time)(z), 'g=0 exactly reproduces free propagation');
}
const defaultGravity = PROPAGATION_PRESETS.gravity;
assert.ok(scatteringDuration(defaultGravity) > defaultGravity.momentum / defaultGravity.gravity, 'Default gravity preset shows the turning point');
console.log('Free and gravity: potential geometry, full complex Schrödinger solution, normalization, Ehrenfest motion, dispersion, energy conservation, parameter limits and scrubbing pass.');
