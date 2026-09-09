import assert from 'node:assert/strict';
import { solveAnharmonicOscillator, coherentSuperposition, projectOscillatorState, evolveAnharmonicState, oscillatorMeanPosition, oscillatorMeanMomentum } from '../lib/anharmonic-oscillator.ts';
import { prepareOscillatorMoments, oscillatorMomentsAt, oscillatorMomentHistory } from '../lib/oscillator-observables.ts';

const near = (a, b, tol = 1e-8) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const packet = (re, im = 0, amplitude = 1, phase = 0) => ({ re, im, amplitude, phase });
const states = [
  coherentSuperposition([packet(1.5, 2)]),
  coherentSuperposition([packet(0, 2), packet(0, -2, 2)]),
  coherentSuperposition([packet(2.5), packet(2.4, 0, 1, Math.PI)]),
  [{ n: 0, re: 1 / Math.sqrt(3), im: 0 }, { n: 1, re: 0, im: 1 / Math.sqrt(3) }, { n: 2, re: 1 / Math.sqrt(3), im: 0 }],
];
for (const strength of [0, .02, .3, 1]) {
  const spectrum = solveAnharmonicOscillator(strength);
  for (const [index, initial] of states.entries()) {
    const projected = projectOscillatorState(spectrum, initial);
    const start = performance.now(), model = prepareOscillatorMoments(spectrum, projected);
    const history = oscillatorMomentHistory(model, 20 * Math.PI);
    assert.ok(history.length <= 8193);
    near(history[0].time, 0); near(history.at(-1).time, 20 * Math.PI);
    for (const t of [0, .2, 1.7, 2 * Math.PI, 20 * Math.PI]) {
      const moments = oscillatorMomentsAt(model, t), wave = evolveAnharmonicState(spectrum, projected, t);
      near(moments.position, oscillatorMeanPosition(wave, spectrum.frequency));
      near(moments.momentum, oscillatorMeanMomentum(wave, spectrum.frequency));
      assert.ok(Math.abs(moments.position) <= model.positionBound + 1e-10);
      assert.ok(Math.abs(moments.momentum) <= model.momentumBound + 1e-10);
      if (strength === 0 && index === 0) {
        near(moments.position, Math.SQRT2 * (1.5 * Math.cos(t) + 2 * Math.sin(t)));
        near(moments.momentum, Math.SQRT2 * (2 * Math.cos(t) - 1.5 * Math.sin(t)));
        assert.equal(model.terms.length, 1, 'One frequency for the harmonic oscillator');
      }
    }
    for (let j = 0; j < history.length; j += 113) {
      const direct = oscillatorMomentsAt(model, history[j].time);
      near(history[j].position, direct.position); near(history[j].momentum, direct.momentum);
    }
    // Ehrenfest's dx/dtau=p, independently of the matrix-pair implementation.
    const h = 1e-6, t = .23;
    near((oscillatorMomentsAt(model, t + h).position - oscillatorMomentsAt(model, t - h).position) / (2 * h), oscillatorMomentsAt(model, t).momentum, 1e-5);
    const phase = .73;
    const rotated = projected.map(c => ({ n: c.n, re: c.re * Math.cos(phase) - c.im * Math.sin(phase), im: c.im * Math.cos(phase) + c.re * Math.sin(phase) }));
    const rotatedModel = prepareOscillatorMoments(spectrum, rotated);
    near(oscillatorMomentsAt(rotatedModel, t).position, oscillatorMomentsAt(model, t).position);
    near(oscillatorMomentsAt(rotatedModel, t).momentum, oscillatorMomentsAt(model, t).momentum);
    console.log(`Oscillator moments: lambda=${strength}, state=${index}, ${model.terms.length} frequency pairs, ${Math.round(performance.now() - start)} ms for maximum history and checks.`);
  }
  const eigen = prepareOscillatorMoments(spectrum, [{ n: 3, re: 1, im: 0 }]);
  assert.deepEqual(oscillatorMomentsAt(eigen, 1.2), { position: 0, momentum: 0 });
  assert.equal(oscillatorMomentHistory(eigen, 0).length, 1);
  assert.throws(() => oscillatorMomentHistory(eigen, -1));
}
console.log('Oscillator histories: direct evolved-state moments, coherent analytic solution, Ehrenfest, phase invariance, endpoints and bounds pass.');
