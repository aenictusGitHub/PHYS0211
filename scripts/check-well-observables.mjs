import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { wellCoefficients } from '../lib/quantum.ts';
import { prepareWellMoments, wellMomentsAt, wellMomentHistory } from '../lib/well-observables.ts';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === './quantum' && context.parentURL?.endsWith('/well-state.ts') ? './quantum.ts' : specifier, context);
} });
const { customWellCoefficients, dotDecimalText, parseDecimalInput } = await import('../lib/well-state.ts');
const close = (a, b, name, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${name}: ${a} versus ${b}`);

function directIntegral(coefficients, time) {
  const evolved = coefficients.map(c => ({ n: c.n, re: c.re * Math.cos(c.n ** 2 * time) + c.im * Math.sin(c.n ** 2 * time), im: c.im * Math.cos(c.n ** 2 * time) - c.re * Math.sin(c.n ** 2 * time) }));
  const intervals = 4000, h = 1 / intervals;
  let position = 0, momentum = 0;
  for (let j = 0; j <= intervals; j++) {
    const u = j * h, weight = j === 0 || j === intervals ? 1 : j % 2 ? 4 : 2;
    let re = 0, im = 0, derivativeRe = 0, derivativeIm = 0;
    for (const c of evolved) {
      const phi = Math.SQRT2 * Math.sin(c.n * Math.PI * u), derivative = Math.SQRT2 * c.n * Math.PI * Math.cos(c.n * Math.PI * u);
      re += c.re * phi; im += c.im * phi;
      derivativeRe += c.re * derivative; derivativeIm += c.im * derivative;
    }
    position += weight * u * (re ** 2 + im ** 2);
    momentum += weight * (re * derivativeIm - im * derivativeRe);
  }
  return { position: position * h / 3, momentum: momentum * h / 3 };
}

const general = customWellCoefficients(Array.from({ length: 10 }, (_, i) => ({ n: i + 1, amplitude: (i + 1) / 10, phase: 30 * i - 150 })));
const states = [wellCoefficients('low-pair'), wellCoefficients('high-pair'), wellCoefficients('parabola'), general, [...general].reverse()];
for (const coefficients of states) {
  const model = prepareWellMoments(coefficients);
  for (const time of [0, .17, .87, 2.43, 2 * Math.PI]) {
    const expected = directIntegral(coefficients, time), result = wellMomentsAt(model, time);
    close(result.position, expected.position, 'Position agrees with integration');
    close(result.momentum, expected.momentum, 'Momentum agrees with integration', 1e-8);
    assert.ok(result.position >= 0 && result.position <= 1);
    assert.ok(Math.abs(result.momentum) <= model.momentumBound + 1e-12);
    const h = 1e-7, derivative = (wellMomentsAt(model, time + h).position - wellMomentsAt(model, time - h).position) / (2 * h);
    close(derivative, 2 * result.momentum / Math.PI ** 2, 'Ehrenfest relation and momentum sign', 2e-7);
  }
  const history = wellMomentHistory(model);
  assert.ok(history.length - 1 >= 24 * model.maxFrequency);
  close(history[0].time, 0, 'History starts at zero');
  close(history.at(-1).time, 2 * Math.PI, 'History ends at full revival');
  close(history[0].position, history.at(-1).position, 'Position revival');
  close(history[0].momentum, history.at(-1).momentum, 'Momentum revival');
}
const low = prepareWellMoments(wellCoefficients('low-pair'));
for (let time = 0; time <= 2 * Math.PI; time += .013) {
  const value = wellMomentsAt(low, time);
  close(value.position, .5 - 16 * Math.cos(3 * time) / (9 * Math.PI ** 2), 'Two-mode exact position');
  close(value.momentum, 8 * Math.sin(3 * time) / 3, 'Two-mode exact momentum');
}
for (let n = 1; n <= 10; n++) {
  const model = prepareWellMoments([{ n, re: 1, im: 0 }]);
  for (const time of [0, .7, 4]) {
    close(wellMomentsAt(model, time).position, .5, 'Eigenstate center');
    close(wellMomentsAt(model, time).momentum, 0, 'Eigenstate zero mean momentum');
  }
}
assert.equal(dotDecimalText('0,7071'), '0.7071');
assert.equal(dotDecimalText('-90.5'), '-90.5');
close(parseDecimalInput('0.7071'), .7071, 'Dot decimal');
close(parseDecimalInput('0,7071'), .7071, 'Comma pasted then normalized');
close(parseDecimalInput('1e-3'), .001, 'Scientific input');
for (const value of ['', '.', '0x1', '1.2.3', 'abc']) assert.ok(Number.isNaN(parseDecimalInput(value)), 'Invalid decimal rejected');
console.log('Well means: exact integrals, momentum sign, Ehrenfest, stationary states, revivals, sampled beats and decimal inputs pass.');
