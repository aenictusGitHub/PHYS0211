// Component/handler tests with a deterministic hook clock, without a browser.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import katex from 'katex';
import { scatteringFinalTimeMax } from '../lib/scattering.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

function harness(file, exported, lab, initialProps = {}) {
  const cache = new Map(), slots = [], callbacks = new Map(), timers = new Map(), workers = [];
  let cursor = 0, effects = [], dirty = false, nextId = 0, now = 0, props = { active: true, command: null, ...initialProps };
  let buttons = [], sliders = [], fields = [], plots = [], settings = [], elements = [], switches = [], html = '';
  const hooks = {
    ...React,
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) {
        const value = typeof initial === 'function' ? initial() : initial;
        slots[i] = { value, set(next) { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } } };
      }
      return [slots[i].value, slots[i].set];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const cleanup = slots[i]?.cleanup; slots[i] = { deps };
        effects.push(() => { cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  function Button({ children, variant, size, ...props }) { buttons.push({ ...props, text: renderToStaticMarkup(React.createElement('span', null, children)).replace(/<[^>]*>/g, '') }); return React.createElement('button', props, children); }
  function Slider(props) { sliders.push(props); return React.createElement('div', { id: props.id, 'data-slot': 'slider' }); }
  function Input(props) { fields.push(props); return React.createElement('input', props); }
  function Plot(props) {
    plots.push(props);
    if (lab === 'double-well') {
      for (const guide of props.horizontalLines ?? []) if (guide.label) {
        assert.equal(guide.labelOutside, true, 'Double-well energy symbols stay in the reserved gutter, clear of the potential and evolving density');
      }
    }
    for (const domain of [props.xDomain, props.yDomain]) assert.ok(domain.every(Number.isFinite) && domain[1] > domain[0], 'Finite nonempty axes');
    for (const label of [props.xLabel, props.yLabel]) if (label) katex.renderToString(label.slice(1, -1), { throwOnError: true, strict: 'ignore' });
    return React.createElement('div', { 'data-plot': props.ariaLabel });
  }
  const mocks = {
    '../lib/scattering.worker?worker': { __esModule: true, default: class {
      postMessage(request) { this.request = request; workers.push(this); }
      terminate() { this.terminated = true; }
    } },
    '@/components/ui/button': { Button }, '@/components/ui/slider': { Slider }, '@/components/ui/input': { Input },
    '@/components/ui/switch': { Switch(props) { switches.push(props); return React.createElement('button', { role: 'switch', 'aria-checked': props.checked, id: props.id }); } },
    '@/components/scientific-plot': { ScientificPlot: Plot },
    '@/components/angular-surface': { AngularSurface: () => null, PhaseLegend: () => null },
    '@/components/bloch-sphere': { BlochSphere: () => null },
    '@/components/hydrogen-slice': { HydrogenSlice: () => null },
  };
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const mod = { exports: {} }; cache.set(path, mod);
    const useHooks = /(?:lab|use-lab-playback|atomic-clock|coherent-state-editor)\.tsx?$/.test(path);
    new Function('exports', 'require', 'module', compile(readFileSync(path, 'utf8')))(mod.exports, name => {
      if (name === 'react' && useHooks) return hooks;
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(path), name);
        const child = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
        if (!child) throw new Error(`Unresolved ${name} from ${path}`);
        const exports = load(child);
        if (name === '@/components/playback-controls') return { ...exports, DisplayControls(props) { settings.push(props); return React.createElement(exports.DisplayControls, props); }, PlaybackControls(props) { settings.push(props); return React.createElement(exports.PlaybackControls, props); } };
        return exports;
      }
      return require(name);
    }, mod);
    return mod.exports;
  }
  const Component = load(resolve(root, file))[exported];
  function render() {
    globalThis.window = { requestAnimationFrame(fn) { callbacks.set(++nextId, fn); return nextId; }, cancelAnimationFrame(id) { callbacks.delete(id); },
      setTimeout(fn) { timers.set(++nextId, fn); return nextId; }, clearTimeout(id) { timers.delete(id); } };
    for (let attempt = 0; attempt < 12; attempt++) {
      dirty = false; cursor = 0; effects = []; buttons = []; sliders = []; fields = []; plots = []; settings = []; elements = []; switches = [];
      const element = Component(props);
      const visit = value => { if (Array.isArray(value)) value.forEach(visit); else if (React.isValidElement(value)) { if (typeof value.type === 'string') elements.push(value); visit(value.props.children); } };
      visit(element);
      html = renderToStaticMarkup(element);
      effects.forEach(fn => fn());
      if (!dirty) { assert.doesNotMatch(html, /katex-error/); return; }
    }
    throw new Error('Render did not settle');
  }
  render();
  return {
    render, html: () => html, plots: () => plots, fields: () => fields, elements: () => elements,
    toggle(id, enabled) { const control = switches.find(s => s.id === id); assert.ok(control, `Missing ${id}`); control.onCheckedChange(enabled); render(); },
    setProps(patch) { props = { ...props, ...patch }; render(); },
    command(command) { this.setProps({ command: { lab, id: ++nextId, ...command } }); },
    clock: () => settings.find(s => s.clock)?.clock,
    button(text) { const button = buttons.find(b => b.text === text || b['aria-label'] === text); assert.ok(button, `Missing button ${text}`); return button; },
    click(text) { this.button(text).onClick(); render(); },
    slider(id, value) { const slider = sliders.find(s => s.id === id); assert.ok(slider, `Missing ${id}`); slider.onValueChange([value]); render(); },
    sliderProps: id => sliders.find(s => s.id === id),
    workerRequests: () => workers.map(w => w.request),
    completeWorker(automaticFinalTime, scatteringComplete = true) {
      const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn());
      const worker = workers.at(-1); assert.ok(worker && !worker.terminated, 'An active calculation is pending');
      const { config, finalTime } = worker.request;
      // The physics is tested independently. This fixture exercises async state,
      // cache reuse, automatic/manual endpoints and stale-configuration guards.
      worker.onmessage({ data: { type: 'ready', timeline: {
        duration: finalTime ?? scatteringFinalTimeMax(config), automaticFinalTime: finalTime === null ? automaticFinalTime : undefined,
        scatteringComplete, analyticalConfig: { ...config, potential: 'free' },
        maxDensity: 1, maxAmplitude: 1, real: new Float32Array(0), imaginary: new Float32Array(0), probabilities: new Float64Array(0),
      } } }); render();
    },
    enter(id, value) { const field = fields.find(f => f.id === id); assert.ok(field, `Missing ${id}`); field.onKeyDown({ key: 'Enter', currentTarget: { value: String(value) }, preventDefault() {} }); render(); },
    tick(ms = 20) { now += ms; const frame = [...callbacks.values()]; callbacks.clear(); frame.forEach(fn => fn(now)); render(); },
    dispose() { slots.forEach(s => s?.cleanup?.()); },
  };
}

const labs = [
  ['components/infinite-well-lab.tsx', 'InfiniteWellLab', 'well', 1],
  ['components/harmonic-lab.tsx', 'HarmonicLab', 'oscillator', 1],
  ['components/double-well-lab.tsx', 'DoubleWellLab', 'double-well', 2 * Math.PI],
  ['components/rotor-lab.tsx', 'RotorLab', 'rotor', 2 * Math.PI],
  ['components/hydrogen-lab.tsx', 'HydrogenLab', 'hydrogen', 2 * Math.PI],
  ['components/spin-lab.tsx', 'SpinLab', 'spin', 2 * Math.PI],
];
for (const [file, component, lab, unit] of labs) {
  const h = harness(file, component, lab);
  h.command({ mode: 'evolution' });
  for (const suffix of ['playback-speed', 'scale', 'final-time']) assert.equal(h.fields().filter(f => f.id === `${lab}-${suffix}`).length, 1, `${lab}: unique ${suffix}`);
  const sidebar = h.html().split('</aside>')[0];
  assert.doesNotMatch(sidebar, /role="spinbutton"/, 'Playback settings are not physical parameters');
  near(h.clock().playbackSpeed, 1);
  const initialEnd = h.clock().finalTime;
  const initialValue = h.fields().find(f => f.id === `${lab}-final-time`);
  initialValue.onBlur({ currentTarget: { value: initialValue.value } }); h.render();
  near(h.clock().finalTime, initialEnd); // Unedited 2π must not be rounded on blur.
  if (unit > 1) near(initialValue['aria-valuemin'], .1);
  h.click('Animer'); h.tick(); h.tick();
  const increment = h.clock().time;
  assert.ok(increment > 0, `${lab}: running`);
  h.enter(`${lab}-playback-speed`, 2); h.tick();
  near(h.clock().time, increment * 3); // ×2 takes effect without restarting the animation.
  const oldTime = h.clock().time;
  h.enter(`${lab}-scale`, 7.5);
  near(h.clock().time, oldTime);
  assert.equal(h.fields().find(f => f.id === `${lab}-scale`)['aria-valuenow'], 7.5);
  h.enter(`${lab}-final-time`, 3);
  near(h.clock().finalTime, 3 * unit); near(h.clock().time, oldTime);
  assert.equal(h.clock().playing, false, 'Changing final time pauses');
  h.click('Animer'); h.tick(); h.tick();
  near(h.clock().time, oldTime + 2 * increment); // Independent of selected endpoint.
  h.slider(`${lab}-time`, 2.9 * unit);
  h.enter(`${lab}-final-time`, 1);
  near(h.clock().time, unit); near(h.clock().finalTime, unit);
  h.click('Rejouer'); near(h.clock().time, 0); assert.equal(h.clock().playing, true);
  h.tick(); h.tick(); assert.ok(h.clock().time > 0);
  const beforeInactive = h.clock().time;
  h.setProps({ active: false }); h.tick(); near(h.clock().time, beforeInactive);
  h.setProps({ active: true });
  h.slider(`${lab}-time`, unit - .001);
  h.click('Animer'); h.tick(); h.tick();
  near(h.clock().time, unit); assert.equal(h.clock().playing, false, 'Exact endpoint and automatic stop');
  h.command({ mode: 'evolution', finalTime: 12, playbackSpeed: .5, scale: 4, time: 8 });
  near(h.clock().finalTime, 12); near(h.clock().playbackSpeed, .5); near(h.clock().time, 8);
  if (lab === 'well' || lab === 'spin') assert.ok(h.plots().some(p => Math.abs(p.xDomain[1] - 12 / unit) < 1e-9), 'History follows final time');
  if (lab !== 'spin') {
    h.command({ mode: 'stationary' });
    assert.equal(h.fields().filter(f => /-scale$/.test(f.id)).length, 1, 'Stationary scale remains available');
    assert.equal(h.fields().filter(f => /-final-time$|-playback-speed$/.test(f.id)).length, 0, 'Stationary mode hides time controls');
  }
  h.dispose();
  console.log(`${lab}: shared steppers, defaults, speed changes, endpoint, replay, pause, commands and stationary scale pass.`);
}

const oscillator = harness('components/harmonic-lab.tsx', 'HarmonicLab', 'oscillator');
const originalEnergies = oscillator.plots()[0].horizontalLines.map(g => g.value);
oscillator.toggle('oscillator-anharmonic-enabled', true);
assert.equal(oscillator.sliderProps('oscillator-lambda').max, 1);
assert.equal(oscillator.sliderProps('oscillator-lambda').step, .01);
oscillator.slider('oscillator-lambda', 1);
const shiftedEnergies = oscillator.plots()[0].horizontalLines.map(g => g.value);
shiftedEnergies.forEach((e, n) => assert.ok(e > originalEnergies[n]));
const commonDomain = oscillator.plots()[0].yDomain;
oscillator.slider('oscillator-n', 8);
assert.deepEqual(oscillator.plots()[0].yDomain, commonDomain, 'Eigenstates share a fixed vertical scale');
oscillator.command({ mode: 'evolution', time: 1 });
oscillator.slider('oscillator-lambda', .75); near(oscillator.clock().time, 0);
const evolution = oscillator.plots()[0], energy = evolution.horizontalLines[0].value;
assert.equal(evolution.horizontalLines[0].labelOutside, true);
oscillator.slider('oscillator-time', 2);
near(oscillator.plots()[0].horizontalLines[0].value, energy);
assert.deepEqual(oscillator.plots()[0].yDomain, evolution.yDomain, 'Evolution scale does not jump during playback');
assert.ok(oscillator.plots()[0].series[1].values.some((p, i) => Math.abs(p.y - evolution.series[1].values[i].y) > .01));
oscillator.click('Composer…');
assert.match(oscillator.html(), /Plan complexe des états cohérents/);
oscillator.enter('coherent-re', 1.5);
assert.match(oscillator.html(), /Modifications non appliquées/);
oscillator.click('Appliquer la superposition'); near(oscillator.clock().time, 0);
assert.match(oscillator.html(), /Superposition appliquée/);
oscillator.click('Cohérent');
oscillator.slider('oscillator-time', 1);
oscillator.slider('alpha-magnitude', 2.5); near(oscillator.clock().time, 0);
oscillator.toggle('oscillator-anharmonic-enabled', false);
oscillator.command({ mode: 'stationary' });
assert.deepEqual(oscillator.plots()[0].horizontalLines.map(g => g.value), originalEnergies);
oscillator.dispose();

let applied;
const editor = harness('components/coherent-state-editor.tsx', 'CoherentStateEditor', 'editor', {
  initial: [{ re: 0, im: 0, amplitude: 1, phase: 0 }, { re: 0, im: 0, amplitude: 1, phase: 0 }],
  onApply: packets => { applied = packets; },
});
editor.enter('coherent-phase', 180);
assert.match(editor.html(), /La superposition s’annule/);
assert.equal(editor.button('Appliquer la superposition').disabled, true);
editor.enter('coherent-phase', 90); editor.click('Appliquer la superposition');
near(applied[0].phase, Math.PI / 2);
const surface = () => editor.elements().find(e => e.type === 'svg').props;
const pointEvent = (x, y, index = null) => ({ clientX: x, clientY: y, pointerId: 1,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }), setPointerCapture() {} },
  target: { closest: () => index === null ? null : { getAttribute: () => String(index) } },
});
surface().onPointerDown(pointEvent(198.8, 101.2)); editor.render();
surface().onPointerMove(pointEvent(247.6, 150)); editor.render(); surface().onPointerUp();
editor.click('Appliquer la superposition'); near(applied[2].re, 2); near(applied[2].im, 0);
surface().onPointerDown(pointEvent(247.6, 150, 2));
surface().onPointerMove(pointEvent(1000, 1000)); editor.render(); surface().onPointerUp();
editor.click('Appliquer la superposition'); near(Math.hypot(applied[2].re, applied[2].im), 2.5);
const point = editor.elements().find(e => e.props['data-packet'] === 0);
point.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} }); editor.render();
editor.click('Appliquer la superposition'); near(applied[0].re, .1);
for (let i = 0; i < 3; i++) editor.click('Ajouter un état cohérent');
assert.equal(editor.button('Ajouter un état cohérent').disabled, true);
editor.click('Appliquer la superposition'); assert.equal(applied.length, 6);
for (let i = 0; i < 5; i++) editor.click('Retirer cet état');
assert.equal(editor.button('Retirer cet état').disabled, true);
editor.dispose();
console.log('Oscillator: perturbation toggle, levels, shared scale, coherent plane add/drag/keyboard, amplitude/phase inputs, cancellation, limits, apply and time reset pass.');

const double = harness('components/double-well-lab.tsx', 'DoubleWellLab', 'double-well');
double.slider('double-well-time', 1);
double.click('À droite'); near(double.clock().time, 0);
for (const label of ['À gauche', 'À droite', 'En quadrature', 'État n = 0', 'État n = 1']) {
  double.click(label); assert.equal(double.button(label)['aria-pressed'], true);
  const curve = double.plots()[0].series[1].values.map(p => p.y);
  double.slider('double-well-time', Math.PI / 2);
  const changed = double.plots()[0].series[1].values.map(p => p.y);
  if (label.startsWith('État n')) changed.forEach((v, i) => near(v, curve[i]));
  else assert.ok(changed.some((v, i) => Math.abs(v - curve[i]) > .01), 'Superposition evolves visibly');
}
double.slider('double-well-population', .25); near(double.clock().time, 0);
double.slider('double-well-relative-phase', -90);
assert.match(double.html(), /-90/);
double.dispose();

const scattering = harness('components/scattering-lab.tsx', 'ScatteringLab', 'scattering');
const endpoint = () => scattering.fields().find(f => f.id === 'scattering-final-time')['aria-valuenow'];
assert.match(scattering.html(), /Recherche d’un temps final/);
scattering.completeWorker(23);
assert.equal(scattering.workerRequests().at(-1).finalTime, null, 'Automatic duration is requested by default');
assert.equal(endpoint(), 23, 'Calculated post-scattering endpoint is displayed');
assert.equal(scattering.sliderProps('scattering-time').max, 23);
scattering.enter('scattering-final-time', 10);
assert.match(scattering.html(), /Temps final manuel/);
scattering.enter('scattering-playback-speed', 2); scattering.enter('scattering-scale', 7.5);
assert.equal(endpoint(), 10, 'Display changes preserve the manual endpoint');
scattering.click('Rétablir le réglage automatique');
assert.equal(endpoint(), 23, 'Restoring auto reuses the checked full history');
assert.equal(scattering.workerRequests().length, 1);
for (const [id, value, autoTime] of [['scattering-momentum', 1, 45], ['scattering-width', 4, 49], ['scattering-height', 3, 47], ['scattering-sigma', 5, 50]]) {
  scattering.enter('scattering-final-time', 10);
  scattering.slider(id, value);
  assert.match(scattering.html(), /Recherche d’un temps final/);
  assert.equal(scattering.sliderProps('scattering-time').value[0], 0, 'Physical edits reset time');
  assert.equal(scattering.sliderProps('scattering-time').disabled, true, 'Old trajectory cannot be played with new parameters');
  scattering.completeWorker(autoTime);
  assert.equal(scattering.workerRequests().at(-1).finalTime, null);
  assert.equal(endpoint(), autoTime, 'Physical edits restore automatic final time');
}
scattering.enter('scattering-final-time', 10);
scattering.click('Gaussien'); scattering.completeWorker(52, false);
assert.equal(endpoint(), 52);
assert.match(scattering.html(), /séparation des paquets n’est pas encore complète/, 'Unresolved scattering is not claimed complete');
scattering.command({ potential: 'barrier', momentum: 2, finalTime: 9 });
scattering.completeWorker(23); assert.equal(endpoint(), 9);
assert.equal(scattering.workerRequests().at(-1).finalTime, 9, 'Explicit command endpoint remains manual');
scattering.command({ playbackSpeed: 1 }); assert.equal(endpoint(), 9);
scattering.command({ preset: 'reflection', progress: 1 });
scattering.completeWorker(21);
assert.equal(endpoint(), 21); assert.equal(scattering.sliderProps('scattering-time').value[0], 21, 'Command progress uses the resolved automatic endpoint');
scattering.enter('scattering-final-time', 15);
assert.equal(scattering.sliderProps('scattering-time').value[0], 15, 'Shortening clamps time without replaying the previous command');
scattering.dispose();
delete globalThis.window;
console.log('Double well: initial-state buttons, relative population/phase, pure-state stationarity and reset on preparation pass.');
console.log('Scattering: automatic endpoint, manual override, physical/display edits, async calculation, cache, safety notice and command progress pass.');
