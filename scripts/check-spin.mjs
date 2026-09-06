import assert from 'node:assert/strict';
import { SPIN_PRESETS, SPIN_TIME_MAX, blochVector, evolveSpin, fieldVector, parseSpinExperiment, probabilityPlus } from '../lib/spin.ts';

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: ${actual} versus ${expected}`);
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
for (const field of ['x', 'y', 'z', 'tilted']) {
  const b = fieldVector(field);
  close(dot(b, b), 1, 'Field normalized');
  for (const theta of [0, .37, Math.PI / 2, 2.47, Math.PI]) for (const phi of [0, .4, 1.5, 4.7, 2 * Math.PI]) {
    const initial = evolveSpin(theta, phi, field, 0), r0 = blochVector(initial);
    for (const phase of [0, .4, Math.PI / 2, Math.PI, 2 * Math.PI, 4 * Math.PI, 12 * Math.PI]) {
      const psi = evolveSpin(theta, phi, field, phase), r = blochVector(psi);
      close(psi.reduce((sum, c) => sum + c.re ** 2 + c.im ** 2, 0), 1, 'Spinor norm');
      close(dot(r, r), 1, 'Pure state Bloch radius');
      close(dot(b, r), dot(b, r0), 'Energy conserved');
      for (const axis of ['x', 'y', 'z']) {
        const p = probabilityPlus(r, axis);
        assert.ok(p >= 0 && p <= 1, 'Born probability in range');
      }
    }
    const once = evolveSpin(theta, phi, field, 2 * Math.PI), twice = evolveSpin(theta, phi, field, 4 * Math.PI);
    for (let i = 0; i < 2; i++) for (const part of ['re', 'im']) {
      close(once[i][part], -initial[i][part], 'Spinor changes sign after 2π');
      close(twice[i][part], initial[i][part], 'Spinor restored after 4π');
    }
    // Independent Rodrigues rotation checks the sign and geometry of all axes.
    const phase = .77, c = Math.cos(phase), s = Math.sin(phase);
    const cross = [b[1] * r0[2] - b[2] * r0[1], b[2] * r0[0] - b[0] * r0[2], b[0] * r0[1] - b[1] * r0[0]];
    blochVector(evolveSpin(theta, phi, field, phase)).forEach((value, i) => close(value, r0[i] * c + cross[i] * s + b[i] * dot(b, r0) * (1 - c), 'Bloch precession'));
  }
}
for (const p of SPIN_PRESETS) {
  const axis = p.id.split('-')[1], expected = p.id.endsWith('plus') ? 1 : 0;
  close(probabilityPlus(blochVector(evolveSpin(p.theta * Math.PI / 180, p.phi * Math.PI / 180, axis, 1.23)), axis), expected, 'Prepared eigenstate is stationary');
}
for (let t = 0; t <= SPIN_TIME_MAX; t += .013) {
  const r = blochVector(evolveSpin(Math.PI / 2, 0, 'z', t));
  close(probabilityPlus(r, 'x'), Math.cos(t / 2) ** 2, 'Default oscillation');
  close(r[1], Math.sin(t), 'Positive precession');
}
assert.equal(parseSpinExperiment({ lab: 'spin', preset: 'spin-z-minus', spinOmega: 3, time: SPIN_TIME_MAX }).mode, 'evolution');
for (const config of [{ spinTheta: 181 }, { spinPhi: -1 }, { spinOmega: Infinity }, { spinOmega: 0 }, { time: 13 }, { spinField: 'q' }, { spinMeasure: 'tilted' }, { preset: 'other' }, { mode: 'stationary' }]) assert.throws(() => parseSpinExperiment({ lab: 'spin', ...config }));
console.log('Spin: normalization, Born probabilities, all eigenstates, energy conservation, precession sign, 2π/4π spinor phases and command bounds pass.');
