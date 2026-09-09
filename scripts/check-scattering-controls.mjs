import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import katex from 'katex';
import * as scattering from '../lib/scattering.ts';
import * as quantum from '../lib/quantum.ts';
import * as playback from '../lib/playback.ts';
import { cn } from '../lib/utils.ts';

const require = createRequire(import.meta.url);
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
function load(path, overrides = {}) {
  const module = { exports: {} };
  new Function('exports', 'require', 'module', compile(readFileSync(new URL(path, import.meta.url), 'utf8')))(
    module.exports, name => name in overrides ? overrides[name] : require(name), module);
  return module.exports;
}
const math = load('../components/math.tsx');
const slider = load('../components/ui/slider.tsx', { '@/lib/utils': { cn } });
const input = load('../components/ui/input.tsx', { '@/lib/utils': { cn } });
let plots = [];
const controls = [];
const inputs = [];
function StepperInput(props) {
  inputs.push(props);
  return createElement(input.Input, props);
}
function Button({ variant, size, children, ...props }) {
  controls.push(props);
  return createElement('button', props, children);
}
const stepper = load('../components/compact-stepper.tsx', {
  '@/components/ui/input': { Input: StepperInput },
  '@/components/ui/button': { Button },
});
const playbackControls = load('../components/playback-controls.tsx', {
  '@/components/compact-stepper': stepper, '@/components/math': math,
  '@/components/ui/button': { Button }, '@/components/ui/slider': slider,
  '@/lib/quantum': quantum, '@/lib/playback': playback,
});
function ScientificPlot(props) {
  plots.push(props);
  for (const label of [props.xLabel, props.yLabel, ...(props.horizontalLines ?? []).map(line => line.label).filter(Boolean)]) {
    katex.renderToString(label.slice(1, -1), { throwOnError: true, strict: 'ignore' });
  }
  assert.ok(props.yDomain.every(Number.isFinite) && props.yDomain[1] > props.yDomain[0]);
  return createElement('div', { role: 'img', 'aria-label': props.ariaLabel });
}
for (const potential of scattering.SCATTERING_POTENTIALS) {
  plots = [];
  const { ScatteringLab } = load('../components/scattering-lab.tsx', {
    '@/components/math': math,
    '@/components/playback-controls': playbackControls,
    '@/components/scientific-plot': { ScientificPlot },
    '@/components/ui/button': { Button },
    '@/components/ui/slider': slider,
    '../lib/scattering.worker?worker': { default: class {} },
    '@/lib/quantum': quantum,
    '@/lib/playback': playback,
    '@/lib/scattering': { ...scattering, SCATTERING_DEFAULT: { ...scattering.SCATTERING_DEFAULT, potential } },
  });
  const html = renderToStaticMarkup(createElement(ScatteringLab, { active: true, command: null }));
  assert.doesNotMatch(html, /katex-error|Double barrière|Résonance|scattering-gap/);
  assert.match(html, /Évolution libre/);
  assert.match(html, /Pesanteur/);
  assert.match(html, /Montée et chute/);
  assert.match(html, /id="scattering-playback-speed"/);
  assert.match(html, /Vitesse de lecture/);
  assert.match(html, /aria-valuetext="×1"/);
  const sidebar = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'));
  const timelineStart = html.indexOf('class="scattering-timeline"');
  const timelineControls = html.slice(timelineStart, html.indexOf('<dl', timelineStart));
  assert.doesNotMatch(sidebar, /scattering-scale/, 'Display scale is not a physical parameter');
  assert.equal((html.match(/id="scattering-scale"/g) ?? []).length, 1, 'Exactly one display scale control');
  assert.equal((timelineControls.match(/role="spinbutton"/g) ?? []).length, 3, 'Display settings and final time use compact number steppers');
  assert.equal((timelineControls.match(/data-slot="slider"/g) ?? []).length, 1, 'Only time retains a slider');
  for (const id of ['scattering-time', 'scattering-playback-speed', 'scattering-scale', 'scattering-final-time']) {
    assert.ok(timelineControls.includes(`id="${id}"`), `${id} belongs with the playback controls`);
  }
  const finalTimeInput = inputs.findLast(field => field.id === 'scattering-final-time');
  const config = { ...scattering.SCATTERING_DEFAULT, potential };
  assert.equal(finalTimeInput['aria-valuenow'], scattering.scatteringFinalTime(config));
  assert.equal(finalTimeInput['aria-valuemax'], scattering.scatteringFinalTimeMax(config));
  const uniform = potential === 'free' || potential === 'gravity';
  assert.equal(html.includes('id="scattering-height"'), !uniform, 'Only localized potentials have a height slider');
  assert.equal(html.includes('id="scattering-width"'), !uniform, 'Only localized potentials have a width slider');
  assert.equal(html.includes('id="scattering-gravity"'), potential === 'gravity');
  assert.equal(html.includes('Position moyenne'), uniform);
  assert.equal(html.includes('Dans la zone'), !uniform, 'No fictitious collision zone for free/gravitational propagation');
  assert.equal(plots[0].xLabel, potential === 'gravity' ? '$z$' : '$x$');
  if (potential === 'gravity') {
    assert.equal(plots.length, 2, 'Density and gravitational energy have independent vertical scales');
    assert.ok(plots[1].series[0].values[0].y < 0 && plots[1].series[0].values.at(-1).y > 0);
    assert.ok(plots[1].horizontalLines[0].value < 0, 'Default total gravitational energy includes mg z_i');
  }
}
assert.ok(controls.filter(button => typeof button.onClick === 'function').length >= 50, 'Potential and preset selectors retain click handlers');

// Exercise stepper handlers without relying on browser-specific number spinners.
for (const [min, max, step, initial, prefix] of [[.25, 4, .25, 1, '×'], [.5, 20, .5, 16, ''], [1, 52, 1, 28, '']]) {
  function renderStepper(value) {
    let next = value;
    const start = controls.length;
    const html = renderToStaticMarkup(createElement(stepper.CompactStepper, {
      id: 'test-stepper', label: 'Réglage', value, min, max, step, prefix,
      onChange: updated => { next = updated; }, description: 'Réglage de test',
    }));
    const buttons = controls.slice(start);
    return { html, field: inputs.at(-1), up: buttons[0], down: buttons[1], value: () => next };
  }
  const defaults = renderStepper(initial);
  assert.equal(defaults.field.value, String(initial));
  assert.equal(defaults.field['aria-valuenow'], initial);
  defaults.up.onClick(); assert.equal(defaults.value(), initial + step);
  defaults.down.onClick(); assert.equal(defaults.value(), initial - step);
  for (const value of [min, initial, max]) {
    const rendered = renderStepper(value);
    assert.equal(rendered.up.disabled, value === max);
    assert.equal(rendered.down.disabled, value === min);
    for (const [key, expected] of [['ArrowUp', Math.min(max, value + step)], ['ArrowDown', Math.max(min, value - step)], ['Home', min], ['End', max]]) {
      let prevented = false;
      rendered.field.onKeyDown({ key, preventDefault() { prevented = true; }, currentTarget: { value: String(value) } });
      assert.ok(prevented); assert.equal(rendered.value(), expected);
    }
    for (const [text, expected] of [['', value], ['invalid', value], ['Infinity', value], ['-10', min], ['100', max], ['1,5', step === 1 ? 2 : 1.5], ['1.5', step === 1 ? 2 : 1.5]]) {
      rendered.field.onKeyDown({ key: 'Enter', preventDefault() {}, currentTarget: { value: text } });
      assert.equal(rendered.value(), expected);
    }
    rendered.field.onKeyDown({ key: 'Enter', preventDefault() {}, currentTarget: { value: '2' } });
    assert.equal(rendered.value(), 2);
  }
  const fractional = renderStepper(initial + step);
  assert.doesNotMatch(fractional.field.value, /,/, 'Displayed decimals use a dot');
}

// Test the actual command parser independently of the React navigation view.
const source = readFileSync(new URL('../components/quantum-lab.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('quantum-lab.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const parser = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'parseExperimentCommand');
const dependencies = { ...scattering, ...quantum, ...playback };
const parse = new Function(...Object.keys(dependencies), `${compile(parser.getText(file))}; return parseExperimentCommand;`)(...Object.values(dependencies));
for (const potential of scattering.SCATTERING_POTENTIALS) assert.equal(parse({ lab: 'scattering', potential }).potential, potential);
for (const preset of Object.keys(scattering.ALL_SCATTERING_PRESETS)) assert.equal(parse({ lab: 'scattering', preset }).preset, preset);
for (const gravity of [0, .15, .5]) assert.equal(parse({ lab: 'scattering', potential: 'gravity', gravity }).gravity, gravity);
for (const gravity of [-.01, .51, NaN, Infinity, '0.15']) assert.throws(() => parse({ lab: 'scattering', gravity }));
assert.throws(() => parse({ lab: 'oscillator', gravity: .15 }));
for (const playbackSpeed of [.25, 1, 2, 4]) assert.equal(parse({ lab: 'scattering', playbackSpeed }).playbackSpeed, playbackSpeed);
for (const playbackSpeed of [0, -.25, 4.25, NaN, Infinity, '2']) assert.throws(() => parse({ lab: 'scattering', playbackSpeed }));
assert.equal(parse({ lab: 'oscillator', playbackSpeed: 2 }).playbackSpeed, 2);
for (const finalTime of [1, 28, 40, 120]) assert.equal(parse({ lab: 'scattering', finalTime }).finalTime, finalTime);
for (const finalTime of [0, -1, 121, NaN, Infinity, '28']) assert.throws(() => parse({ lab: 'scattering', finalTime }));
assert.equal(parse({ lab: 'oscillator', finalTime: 28 }).finalTime, 28);
assert.throws(() => parse({ lab: 'scattering', potential: 'double-barrier' }));
for (const preset of ['resonance', 'resonance-1', 'resonance-2']) assert.throws(() => parse({ lab: 'scattering', preset }));
console.log('Scattering controls: compact steppers, defaults, buttons, keyboard, input limits, physical/display separation, five potentials and command validation pass.');
