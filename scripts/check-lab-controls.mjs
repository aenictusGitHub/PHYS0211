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
  let buttons = [], sliders = [], fields = [], plots = [], settings = [], elements = [], switches = [], surfaces = [], html = '';
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
    useId() { return hooks.useRef(`test-${++nextId}`).current; },
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
    '@/components/stern-gerlach-lab': { SternGerlachLab: props => React.createElement('div', { 'data-single-active': props.active, 'data-single-command': props.command?.id }) },
    '@/components/stern-gerlach-cascade-lab': { SternGerlachCascadeLab: props => React.createElement('div', { 'data-cascade-active': props.active, 'data-cascade-command': props.command?.id }) },
    '@/components/angular-surface': { AngularSurface(props) { surfaces.push(props); return null; }, PhaseLegend: () => null },
    '@/components/bloch-sphere': { BlochSphere: () => null },
    '@/components/hydrogen-slice': { HydrogenSlice: () => null },
  };
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const mod = { exports: {} }; cache.set(path, mod);
    const useHooks = /(?:lab|stern-gerlach-experiment|use-lab-playback|atomic-clock|coherent-state-editor|angular-surface|scientific-plot)\.tsx?$/.test(path);
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
      dirty = false; cursor = 0; effects = []; buttons = []; sliders = []; fields = []; plots = []; settings = []; elements = []; switches = []; surfaces = [];
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
    render, html: () => html, plots: () => plots, fields: () => fields, elements: () => elements, surfaces: () => surfaces,
    step(id, direction) { const button = buttons.find(b => b['aria-describedby'] === `${id}-label` && b['aria-label'] === (direction > 0 ? 'Augmenter' : 'Diminuer')); assert.ok(button && !button.disabled); button.onClick(); render(); },
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
const fourier = harness('components/fourier-lab.tsx', 'FourierLab', 'fourier');
assert.match(fourier.html(), /Fonctions d’ondes en/);
assert.match(fourier.html(), /Sens physique du paramètre/);
assert.match(fourier.html(), /point de focalisation/);
assert.match(fourier.html(), /temps de vol libre/);
assert.match(fourier.html(), /ce n’est pas faire avancer le temps/);
assert.match(fourier.html(), /<output>0\.000<\/output>/);
assert.equal(fourier.plots().length, 2);
assert.match(fourier.html(), /0\.500/);
assert.equal(fourier.fields().filter(field => field.id === 'fourier-chirp-value').length, 0, 'Initial chirp is optional and off by default');
fourier.toggle('fourier-chirp-enabled', true);
assert.match(fourier.html().split('<details')[0], /id="fourier-chirp-value"/, 'The c input is visible without opening a disclosure');
assert.equal(fourier.fields().filter(field => field.id === 'fourier-chirp-value').length, 1);
fourier.enter('fourier-chirp-value', 1.25);
near(fourier.sliderProps('fourier-chirp').value[0], 1.25);
fourier.step('fourier-chirp-value', -1); near(fourier.sliderProps('fourier-chirp').value[0], 1.24);
fourier.enter('fourier-chirp-value', -1.5); near(fourier.sliderProps('fourier-chirp').value[0], -1.5);
fourier.enter('fourier-chirp-value', 'invalid'); near(fourier.sliderProps('fourier-chirp').value[0], -1.5);
fourier.enter('fourier-chirp-value', 10); near(fourier.sliderProps('fourier-chirp').value[0], 2);
fourier.slider('fourier-chirp', -.75);
assert.equal(fourier.fields().find(field => field.id === 'fourier-chirp-value').value, '-0.75');
fourier.click('Réinitialiser le paquet');
assert.equal(fourier.fields().filter(field => field.id === 'fourier-chirp-value').length, 0);
const initialAxes = fourier.plots().map(plot => [plot.xDomain, plot.yDomain]);
fourier.click('Étroit'); assert.equal(fourier.sliderProps('fourier-sigma').value[0], .5);
assert.deepEqual(fourier.plots().map(plot => [plot.xDomain, plot.yDomain]), initialAxes);
fourier.click('Large'); assert.equal(fourier.sliderProps('fourier-sigma').value[0], 2);
assert.deepEqual(fourier.plots().map(plot => [plot.xDomain, plot.yDomain]), initialAxes);
const positionDensity = fourier.plots()[0].series[0].values;
fourier.toggle('fourier-chirp-enabled', true);
fourier.slider('fourier-chirp', 2);
assert.deepEqual(fourier.plots()[0].series[0].values, positionDensity, 'Quadratic phase does not change position density');
assert.match(fourier.html(), /1\.118/);
fourier.click('Parties réelle et imaginaire');
assert.ok(fourier.plots().every(plot => plot.series.length === 2 && plot.yDomain[0] < 0));
fourier.command({ fourierSigma: .7, fourierCenter: 1, fourierMomentum: -1, fourierChirp: -1, fourierView: 'density' });
assert.equal(fourier.sliderProps('fourier-center').value[0], 1);
assert.equal(fourier.sliderProps('fourier-momentum').value[0], -1);
assert.ok(fourier.plots().every(plot => plot.series.length === 1));
fourier.click('Réinitialiser le paquet');
assert.equal(fourier.sliderProps('fourier-sigma').value[0], 1);
assert.equal(fourier.fields().filter(field => field.id === 'fourier-chirp-value').length, 0);
assert.equal(fourier.sliderProps('fourier-sigma').min, .2); assert.equal(fourier.sliderProps('fourier-sigma').max, 5);
const axesBeforeDrag = fourier.plots().map(plot => [plot.xDomain, plot.yDomain]);
fourier.plots()[0].xDrag.onChange(6.3); fourier.render();
fourier.plots()[1].xDrag.onChange(-5.1); fourier.render();
assert.equal(fourier.sliderProps('fourier-center').value[0], 6.3);
assert.equal(fourier.sliderProps('fourier-momentum').value[0], -5.1);
assert.equal(fourier.sliderProps('fourier-sigma').value[0], 1);
assert.deepEqual(fourier.plots().map(plot => [plot.xDomain, plot.yDomain]), axesBeforeDrag);
assert.match(fourier.html(), /0\.500/);
for (const sigma of [.2, 5]) {
  fourier.slider('fourier-sigma', sigma);
  assert.deepEqual(fourier.plots().map(plot => plot.xDomain), initialAxes.map(axes => axes[0]));
  for (const plot of fourier.plots()) assert.ok(plot.series.every(curve => curve.values.every(p => p.y <= plot.yDomain[1])), 'Expanded width never clips density peak');
}
for (const plot of fourier.plots()) assert.ok(plot.series.every(curve => curve.values.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
fourier.click('Réinitialiser le paquet');
fourier.slider('fourier-momentum', 1);
fourier.click('Évolution libre');
const freeAxes = fourier.plots().map(plot => [plot.xDomain, plot.yDomain]);
const momentumDensity = fourier.plots()[1].series[0].values;
fourier.click('Animer'); fourier.tick(); fourier.tick();
assert.ok(fourier.clock().time > 0);
fourier.click('Pause'); const pausedTime = fourier.clock().time; fourier.tick(); near(fourier.clock().time, pausedTime);
fourier.slider('fourier-time', 2);
near(fourier.clock().time, 2);
assert.match(fourier.html(), /<output>2\.000<\/output>/);
assert.match(fourier.html(), /<output>1\.414<\/output>/);
assert.match(fourier.html(), /Phase quadratique actuelle/);
assert.deepEqual(fourier.plots()[1].series[0].values, momentumDensity);
assert.deepEqual(fourier.plots().map(plot => [plot.xDomain, plot.yDomain]), freeAxes);
assert.equal(fourier.plots()[0].xDrag, undefined, 'Dragging edits the initial state, not the running solution');
fourier.enter('fourier-window', 60);
assert.deepEqual(fourier.plots()[0].xDomain, [-60, 60]);
assert.deepEqual(fourier.plots()[1].series[0].values, momentumDensity);
near(fourier.clock().time, 2);
fourier.enter('fourier-playback-speed', 2); near(fourier.clock().playbackSpeed, 2);
fourier.enter('fourier-final-time', 1); near(fourier.clock().time, 1); near(fourier.clock().finalTime, 1);
fourier.click('Rejouer'); near(fourier.clock().time, 0);
fourier.tick(); fourier.tick(); assert.ok(fourier.clock().time > 0);
fourier.setProps({ active: false }); const hiddenTime = fourier.clock().time; fourier.tick(); near(fourier.clock().time, hiddenTime);
fourier.setProps({ active: true });
fourier.command({ fourierSigma: 1, fourierCenter: 0, fourierMomentum: 0, fourierChirp: -1, time: 1, finalTime: 4 });
assert.equal(fourier.clock().playing, false);
assert.match(fourier.html(), /<output>0\.707<\/output>/);
assert.match(fourier.html(), /0\.500/); // minimum reached at the focus
fourier.toggle('fourier-chirp-enabled', false); near(fourier.clock().time, 0);
assert.equal(fourier.fields().filter(field => field.id === 'fourier-chirp-value').length, 0);
assert.match(fourier.html(), /0\.500/);
fourier.toggle('fourier-chirp-enabled', true);
near(fourier.sliderProps('fourier-chirp').value[0], -1, 1e-10);
fourier.slider('fourier-time', 2); fourier.slider('fourier-sigma', 2); near(fourier.clock().time, 0);
fourier.command({ fourierSigma: 1, fourierMomentum: 8, fourierChirpEnabled: false, fourierWindow: 35, time: 20, finalTime: 20 });
assert.match(fourier.html(), /Une partie du paquet sort de la fenêtre/);
assert.deepEqual(fourier.plots()[0].xDomain, [-35, 35]);
fourier.click('État initial');
assert.equal(fourier.plots()[0].xDrag.value, 0);
fourier.command({ fourierSigma: .2, fourierCenter: .37, fourierMomentum: 0, fourierChirp: -2, fourierWindow: 400, time: .032, finalTime: 1 });
const focusedPeak = Math.max(...fourier.plots()[0].series[0].values.map(p => p.y));
near(focusedPeak, 1 / (Math.sqrt(2 * Math.PI) * .2 / Math.sqrt(5)), 1e-8);
assert.ok(fourier.plots()[0].series[0].values.length < 600, 'Wide windows resolve a narrow focus without huge empty-tail arrays');
fourier.command({ fourierSigma: 1, fourierCenter: 0, fourierMomentum: 8, fourierWindow: 5, fourierChirpEnabled: false, time: 4 });
for (const plot of fourier.plots()) {
  assert.equal(plot.series[0].values[0].x, plot.xDomain[0]);
  assert.equal(plot.series[0].values.at(-1).x, plot.xDomain[1]);
}
fourier.dispose();
console.log('Fourier: fixed axes, optional phase, free playback, focus, conserved momentum density, manual window, presets, drag, commands and formulas pass.');
// Real SVG interaction handlers, with a synthetic measured hit area (no browser).
let translated = 1, captured = false;
const plotDrag = { value: 1, min: -8, max: 8, step: .1, label: 'Déplacer le centre', onChange: value => { translated = value; } };
const interactive = harness('components/scientific-plot.tsx', 'ScientificPlot', 'plot', { ariaLabel: 'Paquet', xDomain: [-18, 18], yDomain: [0, 1], xLabel: '$x$', yLabel: '$p$', series: [], xDrag: plotDrag });
const hit = () => interactive.elements().find(el => el.props.className === 'plot-drag-surface').props;
const target = { getBoundingClientRect: () => ({ width: 360 }), focus() {}, setPointerCapture() { captured = true; }, hasPointerCapture: () => captured, releasePointerCapture() { captured = false; } };
const event = (clientX, extra = {}) => ({ button: 0, isPrimary: true, pointerId: 1, clientX, currentTarget: target, preventDefault() {}, ...extra });
hit().onPointerDown(event(100)); assert.equal(captured, true); near(translated, 1);
hit().onPointerMove(event(120, { pointerId: 2 })); near(translated, 1);
hit().onPointerMove(event(120)); near(translated, 3);
interactive.setProps({ xDrag: { ...plotDrag, value: translated } });
hit().onPointerMove(event(140)); near(translated, 5); // original anchor survives rerender
hit().onPointerUp(event(145)); near(translated, 5.5); assert.equal(captured, false);
hit().onPointerMove(event(150)); near(translated, 5.5);
hit().onPointerDown(event(100, { button: 2 })); hit().onPointerMove(event(200)); near(translated, 5.5);
hit().onPointerDown(event(100)); hit().onPointerMove(event(-900)); near(translated, -8);
hit().onPointerCancel(); hit().onPointerMove(event(100)); near(translated, -8);
hit().onPointerDown(event(100)); hit().onLostPointerCapture(); hit().onPointerMove(event(900)); near(translated, -8);
hit().onKeyDown({ key: 'ArrowRight', shiftKey: true, preventDefault() {} }); near(translated, 4);
hit().onKeyDown({ key: 'Home', preventDefault() {} }); near(translated, -8);
hit().onKeyDown({ key: 'End', preventDefault() {} }); near(translated, 8);
interactive.setProps({ xDrag: undefined });
assert.equal(interactive.elements().some(el => el.props.role === 'slider'), false, 'Other laboratories stay noninteractive');
interactive.dispose();
console.log('Plot dragging: pointer capture, no initial jump, coordinate mapping, rerender continuity, bounds, cancellation, keyboard and opt-in behavior pass.');
for (const [file, component, lab, unit] of labs) {
  const h = harness(file, component, lab);
  const displaySuffix = lab === 'rotor' ? 'resolution' : 'scale';
  const displayValue = lab === 'rotor' ? 80 : 7.5;
  h.command({ mode: 'evolution' });
  for (const suffix of ['playback-speed', displaySuffix, 'final-time']) assert.equal(h.fields().filter(f => f.id === `${lab}-${suffix}`).length, 1, `${lab}: unique ${suffix}`);
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
  h.enter(`${lab}-${displaySuffix}`, displayValue);
  near(h.clock().time, oldTime);
  assert.equal(h.clock().playing, true, 'Display edits do not interrupt playback');
  assert.equal(h.fields().find(f => f.id === `${lab}-${displaySuffix}`)['aria-valuenow'], displayValue);
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
  h.command({ mode: 'evolution', finalTime: 12, playbackSpeed: .5, ...(lab === 'rotor' ? { resolution: 72 } : { scale: 4 }), time: 8 });
  near(h.clock().finalTime, 12); near(h.clock().playbackSpeed, .5); near(h.clock().time, 8);
  if (lab === 'well' || lab === 'spin' || lab === 'oscillator') assert.ok(h.plots().some(p => Math.abs(p.xDomain[1] - 12 / unit) < 1e-9), 'History follows final time');
  if (lab !== 'spin') {
    h.command({ mode: 'stationary' });
    assert.equal(h.fields().filter(f => f.id.endsWith(`-${displaySuffix}`)).length, 1, 'Stationary display setting remains available');
    assert.equal(h.fields().filter(f => /-final-time$|-playback-speed$/.test(f.id)).length, 0, 'Stationary mode hides time controls');
  }
  h.dispose();
  console.log(`${lab}: shared steppers, defaults, speed changes, endpoint, replay, pause, commands and stationary display setting pass.`);
}

const oscillator = harness('components/harmonic-lab.tsx', 'HarmonicLab', 'oscillator');
const momentPlots = () => oscillator.plots().filter(p => p.ariaLabel.includes('au cours du temps réduit'));
assert.equal(momentPlots().length, 0);
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
assert.equal(momentPlots().length, 2);
for (const plot of momentPlots()) {
  assert.deepEqual(plot.series[0].values, plot.series[1].values);
  assert.ok(plot.series[0].width < plot.series[1].width);
  assert.equal(plot.series[1].progressive, true);
  near(plot.progressX, 1); near(plot.verticalLines[0].value, 1);
}
const momentsBeforeScale = momentPlots().map(p => [p.series[0].values, p.yDomain]);
oscillator.enter('oscillator-scale', 10);
assert.deepEqual(momentPlots().map(p => [p.series[0].values, p.yDomain]), momentsBeforeScale, 'Physical means do not depend on the display factor');
oscillator.enter('oscillator-final-time', 9);
momentPlots().forEach(p => { near(p.xDomain[1], 9); near(p.series[0].values.at(-1).x, 9); });
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
assert.equal(momentPlots().length, 0);
assert.deepEqual(oscillator.plots()[0].horizontalLines.map(g => g.value), originalEnergies);
oscillator.dispose();

const rotor = harness('components/rotor-lab.tsx', 'RotorLab', 'rotor');
const rotorLevels = () => rotor.plots().filter(p => p.ariaLabel.startsWith('Spectre du rotateur'));
const freeLevels = rotorLevels()[0].horizontalLines.map(g => g.value);
assert.equal(rotor.fields().find(f => f.id === 'rotor-resolution')['aria-valuenow'], 64);
assert.equal(rotor.surfaces()[0].resolution, 64);
assert.doesNotMatch(rotor.html(), /Facteur d’affichage|rotor-scale/);
assert.equal(rotor.plots()[0].yLabel, String.raw`$p(\theta)$`);
const unscaledPolar = rotor.plots()[0].series[0].values;
rotor.step('rotor-resolution', 1); assert.equal(rotor.surfaces()[0].resolution, 72);
rotor.step('rotor-resolution', -1); assert.equal(rotor.surfaces()[0].resolution, 64);
rotor.enter('rotor-resolution', 96);
rotor.step('rotor-resolution', 1); assert.equal(rotor.surfaces()[0].resolution, 104, 'The arrows cross the previous upper limit');
for (const [input, expected] of [[10000, 192], [-1, 24], [55, 56], ['not-a-number', 56], [64, 64]]) {
  rotor.enter('rotor-resolution', input); assert.equal(rotor.surfaces()[0].resolution, expected);
  assert.deepEqual(rotor.plots()[0].series[0].values, unscaledPolar, 'Resolution never scales or changes the polar density');
}
assert.equal(rotor.sliderProps('rotor-lambda'), undefined, 'Field disabled initially');
rotor.toggle('rotor-field-enabled', true);
assert.equal(rotor.sliderProps('rotor-lambda').max, 10);
rotor.slider('rotor-lambda', 10);
assert.notDeepEqual(rotorLevels()[0].horizontalLines.map(g => g.value), freeLevels);
assert.match(rotor.html(), /Orientation moyenne/);
assert.doesNotMatch(rotor.html(), /Dégénérescence<\/dt>/);
const rotorDomain = rotorLevels()[0].yDomain;
rotor.slider('rotor-l', 5);
assert.deepEqual(rotorLevels()[0].yDomain, rotorDomain, 'Field energy frame is independent of selected l0 in each m sector');
rotor.slider('rotor-m', 3);
rotor.slider('rotor-l', 1);
assert.equal(rotor.sliderProps('rotor-m').value[0], 1, 'm remains valid when changing l0');
rotor.command({ mode: 'evolution', time: 1 });
const oldWave = rotor.surfaces()[0].waveCoefficients, oldPolar = rotor.plots()[0].series[0].values;
const oldReference = rotor.surfaces()[0].coefficientBounds;
rotor.enter('rotor-resolution', 192);
assert.equal(rotor.surfaces()[0].resolution, 192);
near(rotor.clock().time, 1);
assert.equal(rotor.surfaces()[0].waveCoefficients, oldWave, 'Resolution leaves the evolving state untouched');
assert.equal(rotor.surfaces()[0].coefficientBounds, oldReference, 'The density reference remains independent of mesh resolution');
assert.deepEqual(rotor.plots()[0].series[0].values, oldPolar);
assert.doesNotMatch(rotor.html(), /Facteur d’affichage|rotor-scale/);
assert.match(rotor.html(), /n’est généralement plus périodique/);
assert.doesNotMatch(rotor.html(), /Évolution de la superposition/);
const fieldPolar = rotor.plots()[0].series[0].values;
rotor.slider('rotor-time', 2);
assert.ok(rotor.plots()[0].series[0].values.some((point, i) => Math.abs(point.y - fieldPolar[i].y) > .001));
rotor.slider('rotor-lambda', 2); near(rotor.clock().time, 0);
rotor.click('Rotation azimutale');
assert.equal(rotorLevels().length, 2, 'Evolution shows both occupied m sectors');
rotor.enter('rotor-final-time', 2); near(rotor.clock().finalTime, 4 * Math.PI);
rotor.toggle('rotor-field-enabled', false); near(rotor.clock().time, 0);
assert.deepEqual(rotorLevels()[0].horizontalLines.map(g => g.value), freeLevels);
assert.match(rotor.html(), /Évolution de la superposition/);
rotor.dispose();
console.log('Rotor: resolution stepper, limits, unchanged physical state/density/time, optional field, shifted levels and free-rotor recovery pass.');

const meshView = harness('components/angular-surface.tsx', 'AngularSurface', 'mesh', { l: 3, m: 1, active: false, phaseColors: true, resolution: 24 });
const canvasProps = () => meshView.elements().find(element => element.type === 'canvas').props;
const axes = () => meshView.elements().filter(element => element.props.className === 'surface-axis').map(element => element.props.style);
assert.equal(canvasProps()['data-faces'], 2 * 24 ** 2);
canvasProps().onKeyDown({ key: 'ArrowLeft', preventDefault() {} }); meshView.render();
const rotatedAxes = axes();
meshView.setProps({ resolution: 192 });
assert.equal(canvasProps()['data-resolution'], 192);
assert.equal(canvasProps()['data-faces'], 2 * 192 ** 2, 'Resolution reaches the actual rendered mesh, not just its label');
assert.deepEqual(axes(), rotatedAxes, 'Refining the mesh preserves the camera orientation');
assert.match(canvasProps()['aria-label'], /192 subdivisions polaires/);
meshView.dispose();

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
const sg = harness('components/stern-gerlach-lab.tsx', 'SternGerlachLab', 'stern-gerlach');
assert.match(sg.html(), /Stern–Gerlach/);
assert.equal(sg.clock().time, 0); assert.equal(sg.clock().finalTime, 8);
assert.equal(sg.plots().length, 2);
assert.ok(sg.plots()[0].markers.every(atom => atom.verticalArrow === undefined), 'No channel projection assigned to the incident mixed beam');
sg.click('Animer'); sg.tick(); sg.tick(); assert.ok(sg.clock().time > 0);
sg.enter('sg-playback-speed', 2); sg.enter('sg-scale', 3);
assert.equal(sg.clock().playing, true, 'Display settings do not reset the experiment');
sg.slider('sg-gradient', 0); assert.equal(sg.clock().time, 0); assert.equal(sg.clock().playing, false);
assert.match(sg.html(), /Sans gradient, aucune séparation/);
sg.command({ sgGradient: 0, time: 2 });
assert.ok(sg.plots()[0].markers.every(atom => atom.verticalArrow === undefined), 'No channel spin arrows without a measuring gradient');
sg.command({ sgJ: .5, sgGradient: 500, sgBeam: 'z-plus', sgAngle: 0, time: 2 });
assert.match(sg.html(), /100\.0 %/);
const outgoing = () => sg.plots()[0].markers.filter(atom => atom.verticalArrow !== undefined);
assert.ok(outgoing().length > 0);
assert.ok(outgoing().every(atom => atom.verticalArrow === 14 && atom.tone === 'accent'), 'Positive spin points up although the magnetic moment deflects downward');
assert.ok(sg.plots()[0].markers.filter(atom => atom.x < 4).every(atom => atom.verticalArrow === undefined));
const arrowLengths = outgoing().map(atom => atom.verticalArrow);
sg.enter('sg-scale', 4);
assert.deepEqual(outgoing().map(atom => atom.verticalArrow), arrowLengths, 'Dot-size control does not change spin glyph scale');
sg.command({ sgGradient: -500, time: 2 });
assert.ok(outgoing().every(atom => atom.verticalArrow === 14), 'Reversing the gradient reverses force, not the spin projection');
sg.slider('sg-angle', 90); assert.equal(sg.clock().time, 0); assert.match(sg.html(), /50\.0 %/);
sg.command({ sgJ: 1.5, sgModel: 'quantum', time: 3, finalTime: 6 });
assert.match(sg.html(), /4 canaux possibles/); assert.match(sg.html(), /25\.0 %/);
assert.ok(outgoing().every(atom => [-42, -14, 14, 42].includes(atom.verticalArrow)));
sg.command({ sgJ: 0, time: 2 });
assert.ok(outgoing().every(atom => atom.verticalArrow === 0), 'Zero angular momentum has no arrow');
sg.command({ sgJ: 1.5, time: 2 });
sg.click('Classique'); assert.equal(sg.clock().time, 0); assert.match(sg.html(), /Moments classiques isotropes/);
assert.ok(sg.plots()[0].markers.every(atom => Number.isFinite(atom.verticalArrow)), 'Classical projections are defined even in the incident beam');
sg.command({ sgGradient: 1500, sgVelocity: 100, sgLength: 10, sgDistance: 30, sgMass: 20, time: 8, finalTime: 12 });
assert.match(sg.html(), /Forte déviation/);
for (const plot of sg.plots()) for (const curve of plot.series) assert.ok(curve.values.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
sg.click('Nouvelle série'); assert.equal(sg.clock().time, 0); assert.match(sg.html(), /0 atomes détectés/);
sg.enter('sg-final-time', 1); assert.equal(sg.clock().finalTime, 1);
sg.dispose();
console.log('Stern–Gerlach: preparations, model/axis/geometry changes, zero gradient, high-deflection warning, playback and detector reset pass.');
const cascade = harness('components/stern-gerlach-cascade-lab.tsx', 'SternGerlachCascadeLab', 'stern-gerlach');
assert.match(cascade.html(), /Stern–Gerlach en cascade/);
assert.match(cascade.html(), /12\.5 %/);
assert.equal(cascade.clock().finalTime, 12);
assert.doesNotMatch(cascade.html(), /NaN|Infinity|katex-error/);
cascade.click('Animer'); cascade.tick(); cascade.tick();
assert.ok(cascade.clock().time > 0);
cascade.enter('sg-cascade-playback-speed', 2); cascade.enter('sg-cascade-scale', 2);
assert.equal(cascade.clock().playing, true);
cascade.setProps({ active: false }); const stoppedTime = cascade.clock().time;
cascade.tick(); assert.equal(cascade.clock().time, stoppedTime, 'Hidden cascade stops advancing');
cascade.setProps({ active: true });
cascade.click('z → z → z'); assert.equal(cascade.clock().time, 0); assert.equal(cascade.clock().playing, false);
assert.match(cascade.html(), /Théorie : 100\.0 %/);
cascade.click('z → x → z');
cascade.command({ sgSetup: 'cascade', time: 8 });
assert.equal(cascade.clock().time, 8); assert.doesNotMatch(cascade.html(), /NaN|Infinity/);
cascade.click('Sans l’analyseur B'); assert.equal(cascade.sliderProps('sg-cascade-angle-1'), undefined);
assert.match(cascade.html(), /Théorie : 100\.0 %/);
cascade.toggle('sg-cascade-middle', true); assert.equal(cascade.sliderProps('sg-cascade-angle-1').value[0], 90);
cascade.click('Deux sorties de B'); assert.match(cascade.html(), /25\.0 % du faisceau initial/);
cascade.slider('sg-cascade-angle-1', 0); assert.equal(cascade.clock().time, 0);
cascade.click('Filtre B : moins'); assert.match(cascade.html(), /Aucun atome ne peut atteindre C/);
cascade.command({ sgSetup: 'cascade', sgBeam: 'z-plus', sgCascadeAngles: [0, 0, 0], sgCascadeFilters: ['plus', 'plus'], sgCascadeMiddle: true, time: 5, finalTime: 12 });
assert.match(cascade.html(), /100\.0 % du faisceau initial/);
cascade.click('Nouvelle série'); assert.equal(cascade.clock().time, 0); assert.match(cascade.html(), /0 atomes détectés/);
cascade.enter('sg-cascade-final-time', 4); assert.equal(cascade.clock().finalTime, 4);
cascade.dispose();
const sgSetup = harness('components/stern-gerlach-experiment.tsx', 'SternGerlachExperiment', 'stern-gerlach');
assert.match(sgSetup.html(), /data-single-active="true"/);
sgSetup.click('En cascade'); assert.match(sgSetup.html(), /data-cascade-active="true"/); assert.match(sgSetup.html(), /data-single-active="false"/);
sgSetup.command({ sgSetup: 'single', time: 1 }); assert.match(sgSetup.html(), /data-single-active="true"/); assert.doesNotMatch(sgSetup.html(), /data-cascade-command=/);
sgSetup.command({ sgSetup: 'cascade', time: 5 }); assert.match(sgSetup.html(), /data-cascade-active="true"/); assert.doesNotMatch(sgSetup.html(), /data-single-command=/);
sgSetup.setProps({ active: false }); assert.doesNotMatch(sgSetup.html(), /data-(single|cascade)-active="true"/);
sgSetup.dispose();
console.log('Stern–Gerlach cascade: setup switch, presets, filters, bypass, unreachable output, live counters, playback, command routing and native formulas pass.');
delete globalThis.window;
console.log('Double well: initial-state buttons, relative population/phase, pure-state stationarity and reset on preparation pass.');
console.log('Scattering: automatic endpoint, manual override, physical/display edits, async calculation, cache, safety notice and command progress pass.');
