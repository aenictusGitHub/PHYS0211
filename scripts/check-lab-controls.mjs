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
import { FOURIER_T_SCALE } from '../lib/fourier.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

function harness(file, exported, lab, initialProps = {}) {
  const cache = new Map(), slots = [], callbacks = new Map(), timers = new Map(), workers = [];
  let cursor = 0, effects = [], dirty = false, nextId = 0, now = 0, props = { active: true, command: null, ...initialProps };
  let buttons = [], sliders = [], fields = [], plots = [], settings = [], elements = [], switches = [], surfaces = [], blochs = [], html = '';
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
    for (const label of [props.xLabel, props.yLabel]) if (label) katex.renderToString(label.slice(1, -1), { throwOnError: true, strict: 'ignore', macros: { '\\overbar': '\\overline{\\mkern1mu#1\\mkern1mu}' } });
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
    '@/components/bloch-sphere': { BlochSphere(props) { blochs.push(props); return null; } },
    '@/components/hydrogen-slice': { HydrogenSlice: () => null },
    '@/components/hydrogen-cloud': { HydrogenCloud: props => React.createElement('div', { 'data-hydrogen-cloud': true, 'data-cloud-terms': props.terms.length, 'data-cloud-phase': props.phase }) },
  };
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const mod = { exports: {} }; cache.set(path, mod);
    const useHooks = path === resolve(root, file) || /(?:lab|stern-gerlach-experiment|use-lab-playback|atomic-clock|coherent-state-editor|angular-surface|scientific-plot)\.tsx?$/.test(path);
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
      dirty = false; cursor = 0; effects = []; buttons = []; sliders = []; fields = []; plots = []; settings = []; elements = []; switches = []; surfaces = []; blochs = [];
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
    render, html: () => html, plots: () => plots, fields: () => fields, elements: () => elements, surfaces: () => surfaces, blochs: () => blochs,
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
        momentumDensities: new Float32Array(0), maxMomentumDensity: Math.sqrt(2 / Math.PI) * config.sigma,
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
const spinDrag = harness('components/spin-lab.tsx', 'SpinLab', 'spin');
assert.ok(spinDrag.html().includes(String.raw`H=-\gamma\,\mathbf{B}\cdot\mathbf{S}`), 'Hamiltonian uses the gyromagnetic ratio and bold physical vectors');
assert.ok(spinDrag.html().includes(String.raw`\Omega=-\gamma B&gt;0`), 'Signed gyromagnetic convention agrees with the simulated positive precession');
spinDrag.command({ time: 2 });
spinDrag.click('Animer');
assert.equal(spinDrag.clock().playing, true);
spinDrag.blochs()[0].onVectorChange([0, -1, 0]);
spinDrag.render();
spinDrag.blochs()[0].vector.forEach((value, i) => near(value, [0, -1, 0][i]));
near(spinDrag.clock().time, 0);
assert.equal(spinDrag.clock().playing, false);
spinDrag.command({ time: 1 });
spinDrag.blochs()[0].onFieldChange([.6, 0, -.8]);
spinDrag.render();
assert.deepEqual(spinDrag.blochs()[0].field, [.6, 0, -.8]);
near(spinDrag.clock().time, 0);
assert.match(spinDrag.html(), /Direction personnalisée/);
spinDrag.blochs()[0].vector.forEach((value, i) => near(value, [0, -1, 0][i]));
spinDrag.dispose();

const fourier = harness('components/fourier-lab.tsx', 'FourierLab', 'fourier');
assert.match(fourier.html(), /Fonctions d’ondes en/);
assert.doesNotMatch(fourier.html(), /Unités réduites|sans phase quadratique|katex-error/);
assert.match(fourier.html(), /Grandeurs sans dimension/);
assert.match(fourier.html(), /Grandeurs sans dimension :<br\s*\/>/);
const unitList = fourier.html().match(/<ul class="scale-note fourier-unit-list">([\s\S]*?)<\/ul>/)?.[1];
assert.ok(unitList);
assert.equal((unitList.match(/<li>/g) ?? []).length, 3);
assert.doesNotMatch(unitList, /fixe|Électron|Temps/);
assert.match(fourier.html(), /m=m_e\\simeq9\.109\\times10\^\{-31\}/);
assert.ok(fourier.html().includes(String.raw`\hbar^2`));
assert.equal(fourier.plots()[0].xLabel, String.raw`$x/\ell$`);
assert.equal(fourier.plots()[1].xLabel, String.raw`$p\ell/\hbar$`);
assert.equal(fourier.plots()[0].yLabel, String.raw`$\ell\,|\psi(x)|^2$`);
assert.ok(fourier.html().includes(String.raw`\int|\psi(x)|^2\,dx=\int|\overbar{\psi}(p)|^2\,dp=1`));
assert.ok(!fourier.html().includes(String.raw`\widetilde\psi`), 'Fourier momentum wavefunctions consistently use an overbar');
assert.equal(fourier.plots()[1].yLabel, String.raw`$\frac{\hbar}{\ell}|\overbar{\psi}(p)|^2$`);
assert.doesNotMatch(fourier.html(), /Axes sans dimension|Formules en SI|faites glisser horizontalement|Densité sans dimension, normalisée|Amplitude sans dimension, dans|Les axes horizontaux restent fixes|Les commandes « Fenêtre/);
assert.match(fourier.html(), /Les bandes couvrent/);
assert.match(fourier.html(), /Échelles des axes/);
assert.equal((fourier.html().match(/<label[^>]+id="fourier-(?:momentum-)?window-label"[^>]*>Abscisse /g) ?? []).length, 2);
assert.doesNotMatch(fourier.html(), /10\^\{-25\}|Demi-largeur en nanomètres/);
near(fourier.plots()[1].verticalLines[2].value, .5);
near(Math.max(...fourier.plots()[1].series[0].values.map(p => p.y)), Math.sqrt(2 / Math.PI));
for (const plot of fourier.plots()) {
  const values = plot.series[0].values;
  const area = values.slice(1).reduce((sum, p, i) => sum + (p.x - values[i].x) * (p.y + values[i].y) / 2, 0);
  assert.ok(Math.abs(area - 1) < 1e-8, 'Densities remain normalized in the dimensionless plot coordinates');
}
const assertNoChirpDetails = () => {
  assert.doesNotMatch(fourier.html(), /[Pp]hase quadratique|chirp|c\(0\)|Sens physique du paramètre|Corrélation et expansion|Avec une phase quadratique|Phase quadratique actuelle|Exemple : temps de vol libre/);
  assert.ok(fourier.html().includes(String.raw`\Phi(x)=\frac{p_0(x-x_0)}{\hbar}</annotation>`));
  assert.ok(fourier.html().includes(String.raw`\overbar{\psi}(p,0)=N_p\,e^{-\frac{\sigma_0^2(p-p_0)^2}{\hbar^2}-\frac{ipx_0}{\hbar}}`));
  assert.ok(fourier.html().includes(String.raw`N_p=\left(\frac{2\sigma_0^2}{\pi\hbar^2}\right)^{1/4}`));
  assert.ok(fourier.html().includes(String.raw`\sigma^2(t)=\sigma_0^2+\frac{\hbar^2t^2}{4m^2\sigma_0^2}`));
};
assertNoChirpDetails();
for (const formula of [String.raw`\langle x\rangle=\int_{-\infty}^{\infty}x\,|\psi(x)|^2\,dx`, String.raw`\langle x^2\rangle=\int_{-\infty}^{\infty}x^2\,|\psi(x)|^2\,dx`, String.raw`\langle p\rangle=\int_{-\infty}^{\infty}p\,|\overbar{\psi}(p)|^2\,dp`, String.raw`\langle p^2\rangle=\int_{-\infty}^{\infty}p^2\,|\overbar{\psi}(p)|^2\,dp`]) {
  assert.ok(fourier.html().includes(formula), 'Moment definition is rendered in LaTeX');
}
assert.match(fourier.html(), /<output>0\.000<\/output>/);
assert.equal(fourier.plots().length, 2);
assert.match(fourier.html(), /0\.500/);
assert.ok(fourier.html().includes(String.raw`0.500\,\hbar</annotation>`));
assertNoChirpDetails();
const initialAxes = fourier.plots().map(plot => [plot.xDomain, plot.yDomain]);
fourier.click('Étroit'); assert.equal(fourier.sliderProps('fourier-sigma').value[0], .5);
assert.deepEqual(fourier.plots().map(plot => [plot.xDomain, plot.yDomain]), initialAxes);
fourier.click('Large'); assert.equal(fourier.sliderProps('fourier-sigma').value[0], 2);
assert.deepEqual(fourier.plots().map(plot => [plot.xDomain, plot.yDomain]), initialAxes);
fourier.click('Parties réelle et imaginaire');
assert.ok(fourier.plots().every(plot => plot.series.length === 2 && plot.yDomain[0] < 0));
fourier.command({ fourierSigma: .7, fourierCenter: 1, fourierMomentum: -1, fourierView: 'density' });
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
assert.equal(fourier.fields().find(field => field.id === 'fourier-momentum-window').value, '40');
const momentumDensity = fourier.plots()[1].series[0].values;
fourier.click('Animer'); fourier.tick(); fourier.tick();
assert.ok(fourier.clock().time > 0);
fourier.click('Pause'); const pausedTime = fourier.clock().time; fourier.tick(); near(fourier.clock().time, pausedTime);
fourier.slider('fourier-time', 2);
near(fourier.clock().time, 2);
assert.match(fourier.html(), /<output>0\.232<\/output>/);
assert.match(fourier.html(), /<output>1\.007<\/output>/);
assertNoChirpDetails();
assert.match(fourier.html(), /Le produit .*augmente donc/);
assert.deepEqual(fourier.plots()[1].series[0].values, momentumDensity);
assert.deepEqual(fourier.plots().map(plot => [plot.xDomain, plot.yDomain]), freeAxes);
assert.equal(fourier.plots()[0].xDrag, undefined, 'Dragging edits the initial state, not the running solution');
fourier.enter('fourier-window', 60);
assert.deepEqual(fourier.plots()[0].xDomain, [-60, 60]);
assert.deepEqual(fourier.plots()[1].series[0].values, momentumDensity);
near(fourier.clock().time, 2);
fourier.enter('fourier-playback-speed', 2); near(fourier.clock().playbackSpeed, 2);
const positionBeforePZoom = fourier.plots()[0].series;
fourier.enter('fourier-momentum-window', 3);
assert.deepEqual(fourier.plots()[1].xDomain, [-3, 3]);
assert.deepEqual(fourier.plots()[0].xDomain, [-60, 60]);
assert.deepEqual(fourier.plots()[0].series, positionBeforePZoom);
near(fourier.clock().time, 2);
assert.match(fourier.html(), /<output>1\.007<\/output>/);
assert.match(fourier.html(), /<output>0\.500<\/output>/);
fourier.step('fourier-momentum-window', 1);
assert.deepEqual(fourier.plots()[1].xDomain, [-4, 4]);
fourier.enter('fourier-momentum-window', 0); assert.deepEqual(fourier.plots()[1].xDomain, [-1, 1]);
fourier.enter('fourier-momentum-window', 'invalid'); assert.deepEqual(fourier.plots()[1].xDomain, [-1, 1]);
fourier.enter('fourier-momentum-window', 999); assert.deepEqual(fourier.plots()[1].xDomain, [-100, 100]);
fourier.enter('fourier-momentum-window', 40);
fourier.enter('fourier-final-time', 1); near(fourier.clock().time, 1); near(fourier.clock().finalTime, 1);
fourier.click('Rejouer'); near(fourier.clock().time, 0);
fourier.tick(); fourier.tick(); assert.ok(fourier.clock().time > 0);
fourier.setProps({ active: false }); const hiddenTime = fourier.clock().time; fourier.tick(); near(fourier.clock().time, hiddenTime);
fourier.setProps({ active: true });
fourier.command({ fourierSigma: 1, fourierCenter: 0, fourierMomentum: 0, time: FOURIER_T_SCALE, finalTime: 20 });
assertNoChirpDetails();
assert.equal(fourier.clock().playing, false);
assert.match(fourier.html(), /<output>1\.118<\/output>/);
fourier.slider('fourier-time', 2); fourier.slider('fourier-sigma', 2); near(fourier.clock().time, 0);
fourier.command({ fourierSigma: 1, fourierMomentum: 8, fourierWindow: 5, time: 20, finalTime: 20 });
assert.match(fourier.html(), /Une partie du paquet sort de la fenêtre/);
assert.deepEqual(fourier.plots()[0].xDomain, [-5, 5]);
fourier.click('État initial');
assert.equal(fourier.plots()[0].xDrag.value, 0);
fourier.command({ fourierSigma: .2, fourierCenter: .37, fourierMomentum: 0, fourierWindow: 400, time: 0, finalTime: 1 });
const focusedPeak = Math.max(...fourier.plots()[0].series[0].values.map(p => p.y));
near(focusedPeak, 1 / (Math.sqrt(2 * Math.PI) * .2), 1e-8);
assert.ok(fourier.plots()[0].series[0].values.length < 600, 'Wide windows resolve a narrow focus without huge empty-tail arrays');
fourier.command({ fourierSigma: 1, fourierCenter: 0, fourierMomentum: 8, fourierWindow: 5, fourierMomentumWindow: 2, time: 4 });
assert.deepEqual(fourier.plots()[1].xDomain, [-2, 2]);
assert.match(fourier.html(), /Une partie de la distribution en impulsion sort/);
for (const plot of fourier.plots()) {
  assert.equal(plot.series[0].values[0].x, plot.xDomain[0]);
  assert.equal(plot.series[0].values.at(-1).x, plot.xDomain[1]);
}
fourier.click('État initial');
fourier.click('Réinitialiser le paquet');
fourier.enter('fourier-window', 35); fourier.enter('fourier-momentum-window', 40);
const translationAxes = fourier.plots().map(plot => [plot.xDomain, plot.yDomain]);
assert.deepEqual(fourier.plots().map(plot => [plot.xDrag.min, plot.xDrag.max]), [[-35, 35], [-40, 40]]);
fourier.plots()[0].xDrag.onChange(25); fourier.render();
fourier.plots()[1].xDrag.onChange(-30); fourier.render();
assert.equal(fourier.sliderProps('fourier-center').value[0], 25);
assert.equal(fourier.sliderProps('fourier-momentum').value[0], -30);
assert.deepEqual(fourier.plots().map(plot => [plot.xDomain, plot.yDomain]), translationAxes);
assert.ok(fourier.html().includes(String.raw`0.500\,\hbar</annotation>`));
fourier.enter('fourier-window', 400); fourier.enter('fourier-momentum-window', 100);
assert.deepEqual(fourier.plots().map(plot => [plot.xDrag.min, plot.xDrag.max]), [[-400, 400], [-100, 100]]);
fourier.plots()[0].xDrag.onChange(-400); fourier.render();
fourier.plots()[1].xDrag.onChange(100); fourier.render();
assert.equal(fourier.sliderProps('fourier-center').value[0], -400);
assert.equal(fourier.sliderProps('fourier-momentum').value[0], 100);
assert.equal(fourier.sliderProps('fourier-center').min, -400);
assert.equal(fourier.sliderProps('fourier-momentum').max, 100);
fourier.enter('fourier-window', 35); fourier.enter('fourier-momentum-window', 40);
assert.equal(fourier.sliderProps('fourier-center').value[0], -400, 'Zooming does not modify the physical state');
assert.equal(fourier.sliderProps('fourier-momentum').value[0], 100);
for (const [shape, label] of [['exponential', 'Exponentielle décroissante'], ['lorentzian', 'Lorentzienne']]) {
  fourier.command({ mode: 'evolution', time: 1, fourierSigma: 1, fourierCenter: 0, fourierMomentum: 0 });
  fourier.click(label);
  assert.equal(fourier.clock().time, 0, 'Changing shape resets the clock');
  assert.match(fourier.html(), /0\.707/);
  assert.doesNotMatch(fourier.html(), /id="fourier-chirp-enabled"|Sens physique du paramètre|Corrélation et expansion/);
  assert.match(fourier.html(), /amplitude lorentzienne/);
  fourier.command({ fourierShape: shape, mode: 'evolution', time: 1, fourierSigma: 1, fourierCenter: 0, fourierMomentum: 0 });
  assert.equal(fourier.plots()[0].xDrag, undefined);
  assert.ok(fourier.plots().every(plot => plot.series.every(series => series.values.every(p => Number.isFinite(p.y)))));
  fourier.click('Gaussienne');
  assertNoChirpDetails();
  assert.match(fourier.html(), /0\.500/);
}
fourier.click('Réinitialiser le paquet');
fourier.click('Oscillateur : états propres');
assert.equal(fourier.fields().filter(field => /fourier-mode-\d-amplitude/.test(field.id)).length, 0);
assert.match(fourier.html(), /Longueur de l’oscillateur|Premier état excité/);
assert.doesNotMatch(fourier.html(), /Composer l’état initial|superposition|amplitude lorentzienne|id="fourier-chirp-enabled"/);
near(fourier.plots()[0].xDrag.value, 0);
near(fourier.plots()[1].xDrag.value, 0);
assert.match(fourier.html(), /1\.500/);
const harmonicAxes = fourier.plots().map(plot => plot.xDomain);
for (const plot of fourier.plots()) near(plot.series[0].values.find(point => point.x === 0).y, 0);
fourier.plots()[1].xDrag.onChange(4); fourier.render();
near(fourier.plots()[1].xDrag.value, 4);
near(fourier.sliderProps('fourier-momentum').value[0], 4);
fourier.click('Évolution libre');
const oscillatorMomentum = fourier.plots()[1].series[0].values;
assert.match(fourier.html(), /Dans « Évolution libre », le piège est retiré/);
fourier.click('État initial');
assert.doesNotMatch(fourier.html(), /Dans « Évolution libre », le piège est retiré/);
fourier.click('Évolution libre');
assert.match(fourier.html(), /Dans « Évolution libre », le piège est retiré/);
fourier.slider('fourier-time', .5);
assert.deepEqual(fourier.plots()[1].series[0].values, oscillatorMomentum);
assert.deepEqual(fourier.plots().map(plot => plot.xDomain), harmonicAxes);
fourier.slider('fourier-sigma', 2);
near(fourier.clock().time, 0);
assert.match(fourier.html(), /1\.500/);
fourier.command({ fourierShape: 'oscillator', fourierSigma: 1, time: 1 });
assert.ok(fourier.plots().every(plot => plot.series.every(series => series.values.every(p => Number.isFinite(p.y)))));
fourier.click('Gaussienne');
fourier.click('Oscillateur : états propres');
assert.match(fourier.html(), /1\.500/);
assert.equal(fourier.fields().filter(field => /fourier-mode-\d-amplitude/.test(field.id)).length, 0);
assert.equal(fourier.fields().find(field => field.id === 'fourier-number').value, '1');
for (let n = 0; n <= 5; n++) {
  fourier.enter('fourier-number', n);
  assert.equal(fourier.fields().find(field => field.id === 'fourier-number').value, String(n));
  near(fourier.clock().time, 0);
  assert.ok(fourier.html().includes((n + .5).toFixed(3)));
  const density = fourier.plots()[0].series[0].values;
  if (n % 2) near(density.find(point => point.x === 0).y, 0);
  else assert.ok(density.find(point => point.x === 0).y > 0);
  const pDensity = fourier.plots()[1].series[0].values;
  fourier.slider('fourier-time', .5);
  assert.deepEqual(fourier.plots()[1].series[0].values, pDensity);
  assert.deepEqual(fourier.plots().map(plot => plot.xDomain), harmonicAxes);
}
fourier.click('Gaussienne');
assert.equal(fourier.fields().find(field => field.id === 'fourier-number'), undefined);
fourier.click('Oscillateur : états propres');
assert.equal(fourier.fields().find(field => field.id === 'fourier-number').value, '5');
fourier.command({ fourierShape: 'gaussian' });
fourier.command({ fourierNumber: 2 });
assert.equal(fourier.fields().find(field => field.id === 'fourier-number').value, '2');
assert.match(fourier.html(), /2\.500/);
fourier.command({ fourierSigma: 2 });
assert.equal(fourier.fields().find(field => field.id === 'fourier-number').value, '2');
fourier.click('Réinitialiser le paquet');
fourier.click('Oscillateur : états propres');
assert.equal(fourier.fields().find(field => field.id === 'fourier-number').value, '1');
fourier.command({ fourierShape: 'gaussian', fourierView: 'density', fourierSigma: 1, time: 2 });
const beforeVerticalChange = fourier.plots().map(plot => ({ series: plot.series, xDomain: plot.xDomain, verticalLines: plot.verticalLines }));
fourier.enter('fourier-position-ymax', .4);
assert.deepEqual(fourier.plots().map(plot => plot.yDomain), [[0, .4], [0, 1.8]]);
fourier.enter('fourier-momentum-ymax', 2.5);
assert.deepEqual(fourier.plots().map(plot => plot.yDomain), [[0, .4], [0, 2.5]]);
assert.deepEqual(fourier.plots().map(plot => ({ series: plot.series, xDomain: plot.xDomain, verticalLines: plot.verticalLines })), beforeVerticalChange);
near(fourier.clock().time, 2);
fourier.step('fourier-position-ymax', 1); near(fourier.plots()[0].yDomain[1], .45);
fourier.enter('fourier-position-ymax', 'invalid'); near(fourier.plots()[0].yDomain[1], .45);
fourier.enter('fourier-position-ymax', 0); near(fourier.plots()[0].yDomain[1], .05);
fourier.enter('fourier-momentum-ymax', 999); near(fourier.plots()[1].yDomain[1], 100);
fourier.slider('fourier-time', 3);
assert.deepEqual(fourier.plots().map(plot => plot.yDomain), [[0, .05], [0, 100]]);
fourier.click('Parties réelle et imaginaire');
fourier.enter('fourier-position-ymax', .75); fourier.enter('fourier-momentum-ymax', 1.25);
assert.deepEqual(fourier.plots().map(plot => plot.yDomain), [[-.75, .75], [-1.25, 1.25]]);
near(fourier.clock().time, 3);
fourier.click('Densités de probabilité');
assert.deepEqual(fourier.plots().map(plot => plot.yDomain), [[0, .05], [0, 100]], 'Each representation keeps its own vertical limits');
fourier.slider('fourier-sigma', .2);
assert.deepEqual(fourier.plots().map(plot => plot.yDomain), [[0, .05], [0, 100]], 'Manual limits survive changes of state');
fourier.click('Ordonnées auto');
assert.ok(fourier.plots()[0].yDomain[1] > 1.99);
fourier.command({ fourierView: 'complex', fourierPositionYMax: 2, fourierMomentumYMax: 3 });
assert.deepEqual(fourier.plots().map(plot => plot.yDomain), [[-2, 2], [-3, 3]]);
fourier.click('État initial');
assert.equal(fourier.fields().filter(field => /fourier-(position|momentum)-ymax/.test(field.id)).length, 2);
fourier.dispose();
console.log('Fourier: fixed axes, removed phase option, free playback, conserved momentum density, manual window, presets, drag, commands and formulas pass.');
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
interactive.setProps({ bands: [{ from: -2, to: 2, color: '#8654bd', verticalGradient: { topOpacity: .4, bottomOpacity: .08 } }] });
const bandGradient = () => interactive.elements().find(el => el.type === 'linearGradient' && el.props.id.endsWith('-band-gradient-0'));
assert.equal(bandGradient().props.x1, '0');
assert.equal(bandGradient().props.x2, '0');
assert.equal(bandGradient().props.y1, '0');
assert.equal(bandGradient().props.y2, '1');
assert.deepEqual(bandGradient().props.children.map(el => el.props.stopOpacity), [.4, .08]);
assert.ok(bandGradient().props.children.every(el => el.props.stopColor === '#8654bd'), 'Custom band color is applied to both stops');
interactive.setProps({ bands: [{ from: -2, to: 2, fadeToward: 'left' }] });
assert.equal(bandGradient().props.x1, '1');
assert.equal(bandGradient().props.x2, '0');
assert.equal(bandGradient().props.y2, '0');
interactive.setProps({ rightAxis: { label: '$J_z/\\hbar$', ticks: [{ value: .25, label: '$-\\frac{1}{2}$' }, { value: .75, label: '$\\frac{1}{2}$' }] }, verticalArrows: [{ x: 0, from: .2, to: .8, label: '$\\nabla B_n$' }] });
assert.ok(interactive.elements().some(el => el.props['data-plot-axis'] === 'right'));
assert.equal(interactive.elements().filter(el => el.props.className === 'plot-right-tick').length, 2);
assert.ok(interactive.elements().some(el => el.props['data-plot-annotation'] === 'vertical-arrow'));
assert.ok(interactive.html().includes(String.raw`\dfrac{1}{2}`), 'Channel fractions remain readable');
interactive.setProps({ verticalArrows: [{ x: 0, from: .5, to: .5, label: '$G=0$' }] });
assert.ok(!interactive.elements().some(el => el.props['data-plot-annotation'] === 'vertical-arrow'), 'No directional arrow for a zero gradient');
assert.ok(!interactive.elements().some(el => el.props['data-plot-detector'] === 'screen'), 'Detector is opt-in');
interactive.setProps({ detectorScreen: { impacts: [{ id: 0, value: .25, spread: .5, tone: 'teal' }] } });
assert.ok(interactive.elements().some(el => el.props['data-plot-detector'] === 'screen'));
assert.equal(interactive.elements().filter(el => el.props['data-detector-impact']).length, 1);
const detectorAxis = interactive.elements().find(el => el.props['data-plot-axis'] === 'right');
const detectorPlate = interactive.elements().find(el => el.props['data-plot-detector'] === 'screen');
const detectorFace = interactive.elements().find(el => el.props['data-detector-face']);
const detectorSurface = interactive.elements().find(el => el.props['data-detector-surface']);
assert.equal(detectorSurface.props.transform, 'matrix(1 0.45 0 1 0 0)', 'Face and impacts share the same oblique projection');
assert.equal(detectorFace.props.x, -detectorFace.props.width / 2, 'Detector is centred on the physical detection plane');
const detectorTranslation = detectorPlate.props.children.find(el => el?.type === 'g').props.transform;
const detectorCenter = Number(detectorTranslation.match(/translate\(([^ ]+)/)[1]);
assert.ok(detectorAxis.props.children[0].props.x1 > detectorCenter + detectorFace.props.width / 2, 'Projection axis stays clear of the detector plate');
assert.equal(interactive.elements().find(el => el.props['data-detector-impact']).props.cx, 0, 'Central impacts retain the channel heights under projection');
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

const reducedWell = harness('components/infinite-well-lab.tsx', 'InfiniteWellLab', 'well');
const wellArea = values => values.slice(1).reduce((sum, p, i) => sum + (p.x - values[i].x) * (p.y + values[i].y) / 2, 0);
assert.equal(reducedWell.plots()[0].xLabel, '$u=x/a$');
assert.equal(reducedWell.plots()[0].yLabel, String.raw`$s\,\widetilde\phi_n(u)$`);
assert.ok(reducedWell.html().includes(String.raw`\widetilde\phi_n(u)=\sqrt a\,\phi_n(au)`));
assert.doesNotMatch(reducedWell.html(), /Seule l’abscisse est réduite/);
for (const wellLinear of [0, 6]) {
  for (const quantumNumber of [1, 3, 8]) {
    let reference;
    for (const wellWidth of [.5, 1, 4]) {
      reducedWell.command({ mode: 'stationary', quantumNumber, wellWidth, wellLinear, scale: 1 });
      const plot = reducedWell.plots()[0];
      const values = plot.series[0].values;
      near(wellArea(values.map(p => ({ x: p.x, y: p.y ** 2 }))), 1);
      if (reference) assert.deepEqual(values, reference, 'Reduced eigenfunctions do not depend on physical width');
      reference = values;
      assert.ok(values.every(p => p.y >= plot.yDomain[0] && p.y <= plot.yDomain[1]));
    }
  }
  for (const preset of ['low-pair', 'high-pair', 'parabola']) {
    for (const time of [0, .4]) {
      let reference;
      for (const wellWidth of [1, 4]) {
        reducedWell.command({ mode: 'evolution', preset, wellWidth, wellLinear, scale: 2, time });
        const plot = reducedWell.plots()[0];
        assert.equal(plot.yLabel, String.raw`$s\,|\widetilde\psi(u,\tau)|^2$`);
        const values = plot.series[0].values;
        assert.ok(Math.abs(wellArea(values) / 2 - 1) < 1e-6, 'Reduced probability integrates to one in du after removing graphical gain');
        if (reference) assert.deepEqual(values, reference, 'Reduced dynamics are width independent at fixed reduced time');
        reference = values;
        assert.ok(values.every(p => p.y <= plot.yDomain[1]));
      }
    }
  }
}
reducedWell.dispose();
console.log('Infinite well: dimensionless amplitudes and densities, unit normalization in du, width independence and perturbed modes pass.');

const oscillator = harness('components/harmonic-lab.tsx', 'HarmonicLab', 'oscillator');
const oscillatorArea = values => values.slice(1).reduce((sum, p, i) => sum + (p.x - values[i].x) * (p.y + values[i].y) / 2, 0);
const initialOscillatorPlot = oscillator.plots()[0];
near(oscillator.fields().find(f => f.id === 'oscillator-stationary-scale').value, 1);
near(initialOscillatorPlot.series[1].values.find(p => p.x === 0).y, .5 + 2 * Math.PI ** -.25);
near(oscillatorArea(initialOscillatorPlot.series[1].values.map(p => ({ x: p.x, y: ((p.y - .5) / 2) ** 2 }))), 1, 1e-6);
assert.ok(initialOscillatorPlot.yLabel.includes(String.raw`2s\,\widetilde\phi`), 'Axis reports the actual graphical gain and reduced eigenfunction');
for (const scale of [.5, 2, 5, 20, 1]) {
  oscillator.enter('oscillator-stationary-scale', scale);
  assert.deepEqual(oscillator.plots()[0].yDomain, initialOscillatorPlot.yDomain, 'Stationary gain never rescales the vertical axis');
  near(oscillator.plots()[0].series[1].values.find(p => p.x === 0).y, .5 + 2 * scale * Math.PI ** -.25);
  if (scale === 20) assert.match(oscillator.html(), /Une partie de la courbe dépasse le cadre/);
}
assert.doesNotMatch(oscillator.html(), /Une partie de la courbe dépasse le cadre/);
oscillator.command({ mode: 'evolution', preset: 'mixture', time: 0 });
near(oscillator.fields().find(f => f.id === 'oscillator-scale').value, 1);
const initialDensityPlot = oscillator.plots()[0];
const initialMeanEnergy = initialDensityPlot.horizontalLines[0].value;
near(oscillatorArea(initialDensityPlot.series[1].values.map(p => ({ x: p.x, y: p.y - initialMeanEnergy }))), 2, 1e-6);
oscillator.enter('oscillator-scale', 2);
oscillator.plots()[0].series[1].values.forEach((p, i) => near(p.y - initialMeanEnergy, 2 * (initialDensityPlot.series[1].values[i].y - initialMeanEnergy)));
for (const scale of [.5, 5, 20, 1]) {
  oscillator.enter('oscillator-scale', scale);
  assert.deepEqual(oscillator.plots()[0].yDomain, initialDensityPlot.yDomain, 'Evolution gain never rescales the vertical axis');
  if (scale === 20) assert.match(oscillator.html(), /Une partie de la courbe dépasse le cadre/);
}
for (const preset of ['coherent', 'opposite', 'quadrature', 'mixture']) {
  oscillator.command({ mode: 'evolution', preset });
  near(oscillator.fields().find(f => f.id === 'oscillator-scale').value, 1);
}
oscillator.command({ mode: 'stationary' });
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
assert.equal(rotor.fields().find(f => f.id === 'rotor-resolution')['aria-valuenow'], 128);
assert.equal(rotor.surfaces()[0].resolution, 128);
assert.doesNotMatch(rotor.html(), /Facteur d’affichage|rotor-scale/);
assert.equal(rotor.plots()[0].yLabel, String.raw`$p(\theta)$`);
const unscaledPolar = rotor.plots()[0].series[0].values;
rotor.step('rotor-resolution', 1); assert.equal(rotor.surfaces()[0].resolution, 136);
rotor.step('rotor-resolution', -1); assert.equal(rotor.surfaces()[0].resolution, 128);
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
assert.equal(double.plots()[0].yLabel, String.raw`$E+s\,|\widetilde\Psi|^2$`);
assert.match(double.html(), /Définition des unités réduites/);
assert.match(double.html(), /Période réduite/);
assert.ok(double.html().includes(String.raw`L=\frac{a_{\mathrm{phys}}}{1.5}`));
double.slider('double-well-separation', 2);
assert.ok(double.html().includes(String.raw`L=\frac{a_{\mathrm{phys}}}{2}`));
double.slider('double-well-separation', 1.5);
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

const doubleUnits = harness('components/double-well-lab.tsx', 'DoubleWellLab', 'double-well');
function checkDoubleUnits(density, separation) {
  const plot = doubleUnits.plots()[0], curve = plot.series[1].values;
  assert.equal(plot.xLabel, '$u=x/a$');
  assert.deepEqual(plot.xTicks, [-1, 0, 1]);
  const baseline = curve[0].y;
  const probability = point => density ? (point.y - baseline) / 2 : ((point.y - baseline) / 2) ** 2;
  const area = curve.slice(1).reduce((sum, point, j) => sum + (point.x - curve[j].x) * (probability(point) + probability(curve[j])) / 2, 0);
  near(area, 1);
  near(curve[0].x, -8 / separation);
  for (const point of plot.series[0].values) near(point.y, 3 * (point.x ** 2 - 1) ** 2);
  assert.ok(curve.every(point => point.y >= plot.yDomain[0] && point.y <= plot.yDomain[1]), 'Normalized curves fit the vertical frame');
  for (const guide of plot.horizontalLines) if (guide.xRange) assert.ok(guide.xRange.every(x => x >= curve[0].x && x <= curve.at(-1).x));
}
for (const separation of [.8, 1.5, 2.5]) {
  for (let quantumNumber = 0; quantumNumber < 9; quantumNumber++) {
    doubleUnits.command({ mode: 'stationary', quantumNumber, separation, barrier: 3, scale: 2 });
    doubleUnits.click('Fonction propre réduite'); checkDoubleUnits(false, separation);
    doubleUnits.click('Densité propre réduite'); checkDoubleUnits(true, separation);
  }
  for (const time of [0, 1, Math.PI]) {
    doubleUnits.command({ mode: 'evolution', separation, scale: 2, time });
    checkDoubleUnits(true, separation);
  }
}
doubleUnits.dispose();
console.log('Double well: x/a coordinates, potential minima, normalized amplitudes/densities in du and unclipped frames pass.');

const cloudView = harness('components/hydrogen-cloud.tsx', 'HydrogenCloud', 'hydrogen-cloud', { terms: [{ n: 2, l: 1, m: 0, basis: 'real' }], phase: 0, phaseColors: false, pointSize: 1.2 });
const cloudCanvas = () => cloudView.elements().find(el => el.type === 'canvas').props;
const cloudCount = cloudCanvas()['data-cloud-points'];
assert.equal(cloudCount, 20000);
assert.equal(cloudView.elements().filter(el => el.type === 'text').length, 0, 'No numbers on the cloud axes, including the origin');
assert.ok(cloudView.elements().some(el => el.props.className === 'cloud-scale-bar' && el.props['data-length'] > 0), 'A length scale remains visible');
let cloudCapture = null;
const cloudTarget = { setPointerCapture(id) { cloudCapture = id; }, releasePointerCapture() { cloudCapture = null; }, focus() {} };
cloudCanvas().onPointerDown({ button: 0, pointerId: 1, clientX: 0, clientY: 0, currentTarget: cloudTarget });
assert.equal(cloudCapture, 1);
cloudCanvas().onPointerMove({ pointerId: 1, clientX: 40, clientY: 20 }); cloudView.render();
near(cloudCanvas()['data-yaw'], .65 + .36);
near(cloudCanvas()['data-pitch'], .35 + .18);
assert.equal(cloudCanvas()['data-cloud-points'], cloudCount, 'Rotation never resamples the cloud');
cloudCanvas().onPointerUp({ pointerId: 1, currentTarget: cloudTarget }); assert.equal(cloudCapture, null);
cloudCanvas().onKeyDown({ key: 'ArrowLeft', preventDefault() {} }); cloudView.render();
near(cloudCanvas()['data-yaw'], .65 + .24);
cloudCanvas().onLostPointerCapture();
cloudCanvas().onPointerMove({ pointerId: 1, clientX: 80, clientY: 30 }); cloudView.render();
near(cloudCanvas()['data-yaw'], .65 + .24);
cloudView.setProps({ pointSize: 2 }); assert.equal(cloudCanvas()['data-cloud-points'], cloudCount);
cloudView.setProps({ pointCount: 5000 }); assert.equal(cloudCanvas()['data-cloud-points'], 5000);
near(cloudCanvas()['data-yaw'], .65 + .24, 'Point count preserves the camera');
cloudView.click('Réinitialiser la vue du nuage'); near(cloudCanvas()['data-yaw'], .65);
cloudView.setProps({ active: false }); assert.equal(cloudCanvas()['data-cloud-points'], 0, 'Hidden cloud does no sampling work');
cloudView.dispose();
console.log('Hydrogen cloud controls: drag, capture/release, keyboard, reset, stable samples, point size and inactive state pass.');
const circularHydrogen = harness('components/hydrogen-lab.tsx', 'HydrogenLab', 'hydrogen');
assert.ok(circularHydrogen.html().includes(String.raw`a_0^3\bigl\lvert\psi_`));
assert.match(circularHydrogen.html(), /Densités sans dimension/);
circularHydrogen.click('Nuage de points 3D');
assert.match(circularHydrogen.html(), /data-hydrogen-cloud="true"/);
assert.ok(circularHydrogen.fields().some(f => f.id === 'hydrogen-point-size'));
assert.equal(circularHydrogen.fields().find(f => f.id === 'hydrogen-point-count')['aria-valuenow'], 20000);
assert.equal(circularHydrogen.fields().find(f => f.id === 'hydrogen-point-size')['aria-valuenow'], .5);
circularHydrogen.enter('hydrogen-point-count', 5000);
assert.equal(circularHydrogen.fields().find(f => f.id === 'hydrogen-point-count')['aria-valuenow'], 5000);
circularHydrogen.enter('hydrogen-point-count', 99999);
assert.equal(circularHydrogen.fields().find(f => f.id === 'hydrogen-point-count')['aria-valuenow'], 30000);
circularHydrogen.enter('hydrogen-point-count', 0);
assert.equal(circularHydrogen.fields().find(f => f.id === 'hydrogen-point-count')['aria-valuenow'], 1000);
circularHydrogen.click('Coupe spatiale');
assert.doesNotMatch(circularHydrogen.html(), /data-hydrogen-cloud="true"/);
circularHydrogen.click('Évolution');
circularHydrogen.click('Rydberg circulaires · 20 + 21');
circularHydrogen.click('Partie radiale');
assert.equal(circularHydrogen.fields().find(f => f.id === 'hydrogen-circular-n')['aria-valuenow'], 20);
const originalCircularRadial = circularHydrogen.plots()[0].series[0].values;
circularHydrogen.click('Animer'); circularHydrogen.tick(); circularHydrogen.tick();
circularHydrogen.enter('hydrogen-circular-n', 30);
assert.equal(circularHydrogen.clock().phase, 0);
assert.equal(circularHydrogen.clock().playing, false);
assert.match(circularHydrogen.html(), /Rydberg circulaires · 30 \+ 31/);
assert.notDeepEqual(circularHydrogen.plots()[0].series[0].values, originalCircularRadial);
circularHydrogen.enter('hydrogen-circular-n', 99);
assert.equal(circularHydrogen.fields().find(f => f.id === 'hydrogen-circular-n')['aria-valuenow'], 39);
circularHydrogen.enter('hydrogen-circular-n', 0);
assert.equal(circularHydrogen.fields().find(f => f.id === 'hydrogen-circular-n')['aria-valuenow'], 10);
circularHydrogen.command({ mode: 'evolution', preset: 'hydrogen-rydberg', principal: 25 });
assert.match(circularHydrogen.html(), /Rydberg circulaires · 25 \+ 26/);
circularHydrogen.dispose();

const scattering = harness('components/scattering-lab.tsx', 'ScatteringLab', 'scattering');
assert.equal(scattering.plots()[0].yLabel, String.raw`$s\,|\Psi|^2,\;V$`);
assert.match(scattering.html(), /Définition des unités réduites/);
const endpoint = () => scattering.fields().find(f => f.id === 'scattering-final-time')['aria-valuenow'];
assert.equal(scattering.plots().length, 1, 'Momentum view is optional and off initially');
scattering.click('Position et impulsion');
assert.equal(scattering.plots().length, 2);
assert.match(scattering.plots()[1].ariaLabel, /impulsion/);
assert.equal(scattering.plots()[1].yLabel, String.raw`$|\overbar{\Psi}(p,t)|^2$`);
assert.ok(scattering.plots()[1].xTicks.includes(0), 'The momentum axis retains a zero tick');
near(scattering.plots()[1].verticalLines[0].value, 2);
assert.equal(scattering.plots()[1].verticalLines[0].label, String.raw`$\langle p\rangle$`);
assert.ok(scattering.plots()[1].series[0].values.every(point => Number.isFinite(point.y)));
scattering.click('Position seule');
assert.match(scattering.html(), /Recherche d’un temps final/);
scattering.completeWorker(23);
assert.equal(scattering.workerRequests().at(-1).finalTime, null, 'Automatic duration is requested by default');
assert.equal(endpoint(), 23, 'Calculated post-scattering endpoint is displayed');
assert.equal(scattering.sliderProps('scattering-time').max, 23);
scattering.slider('scattering-time', 5);
const momentumRequests = scattering.workerRequests().length;
scattering.click('Position et impulsion');
assert.equal(scattering.sliderProps('scattering-time').value[0], 5, 'Opening momentum view preserves time');
assert.equal(scattering.workerRequests().length, momentumRequests, 'Display choice does not restart the solver');
const momentumLimits = scattering.plots()[1].yDomain;
const momentumCurve = scattering.plots()[1].series[0].values;
scattering.enter('scattering-scale', 12);
assert.deepEqual(scattering.plots()[1].series[0].values, momentumCurve, 'Momentum density remains normalized and unscaled');
scattering.slider('scattering-time', 6);
assert.deepEqual(scattering.plots()[1].yDomain, momentumLimits, 'Momentum vertical axis is time independent');
scattering.click('Animer');
scattering.click('Position seule');
assert.ok(scattering.button('Pause'), 'Switching views does not interrupt playback');
scattering.click('Pause');
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
scattering.click('Gaussien');
scattering.completeWorker(23);
assert.equal(scattering.workerRequests().at(-1).config.potential, 'gaussian');
assert.equal(scattering.sliderProps('scattering-time').value[0], 0, 'Changing shape resets the evolution');
scattering.click('Transmission'); scattering.completeWorker(23);
assert.equal(scattering.workerRequests().at(-1).config.potential, 'gaussian', 'Barrier presets preserve the selected Gaussian shape');
assert.equal(scattering.button('Gaussien')['aria-pressed'], true);
scattering.click('Puits'); scattering.completeWorker(23);
assert.equal(scattering.workerRequests().at(-1).config.potential, 'gaussian-well', 'Changing family preserves the Gaussian shape');
assert.equal(scattering.button('Puits')['aria-pressed'], true);
assert.doesNotMatch(scattering.html(), />Effet tunnel<|>Transmission<|>Réflexion</);
scattering.click('Carré'); scattering.completeWorker(23);
assert.equal(scattering.workerRequests().at(-1).config.potential, 'well');
assert.equal(scattering.button('Carré')['aria-pressed'], true);
scattering.click('Barrière'); scattering.completeWorker(23);
assert.equal(scattering.workerRequests().at(-1).config.potential, 'barrier');
scattering.click('Évolution libre'); scattering.completeWorker(23);
assert.doesNotMatch(scattering.html(), />Carré<|>Gaussien<|>Effet tunnel</);
assert.ok(scattering.button('Paquet libre'));
scattering.click('Position et impulsion');
scattering.slider('scattering-momentum', 1.70688);
assert.ok(scattering.plots()[1].xTicks.includes(0), 'Noninteger incident momentum must not hide the zero tick');
assert.ok(scattering.plots()[1].xTicks.every(Number.isInteger));
near(scattering.plots()[1].verticalLines[0].value, 1.70688);
assert.equal(scattering.plots()[1].verticalLines[0].label, String.raw`$\langle p\rangle$`);
scattering.click('Pesanteur'); scattering.completeWorker(23);
assert.equal(scattering.workerRequests().at(-1).config.potential, 'gravity');
assert.doesNotMatch(scattering.html(), />Paquet libre<|>Carré<|>Gaussien<|>Effet tunnel</);
assert.equal(scattering.plots()[2].verticalLines[0].label, String.raw`$\langle p_z\rangle$`);
const incidentMomentum = scattering.plots()[2].verticalLines[0].value;
scattering.slider('scattering-time', 2);
near(scattering.plots()[2].verticalLines[0].value, incidentMomentum - .3);
assert.ok(scattering.plots()[2].xTicks.includes(0));
scattering.dispose();
const sg = harness('components/stern-gerlach-lab.tsx', 'SternGerlachLab', 'stern-gerlach');
assert.match(sg.html(), /Stern–Gerlach/);
assert.doesNotMatch(sg.html(), /class="sg-stages"/);
assert.match(sg.html(), /four et le collimateur \(non représentés\)/);
assert.match(sg.html(), /<ul class="sg-apparatus-legend" aria-label="Légende du schéma">/);
assert.equal((sg.html().match(/<ul class="sg-apparatus-legend"[\s\S]*?<\/ul>/)[0].match(/<li>/g) ?? []).length, 3, 'Three distinct legend groups');
assert.ok(sg.html().includes(String.raw`0\le y\le L`), 'Magnet legend matches the shaded interval');
assert.ok(sg.plots()[0].verticalLines.every(line => !line.label?.includes(String.raw`\text{Écran}`)), 'No redundant screen heading');
assert.deepEqual(sg.plots()[0].detectorScreen.impacts, [], 'No artificial impacts before detection');
assert.equal(sg.clock().time, 0); assert.equal(sg.clock().finalTime, 8);
assert.equal(sg.plots().length, 2);
assert.equal(sg.plots()[0].rightAxis.label, String.raw`$J_z/\hbar$`);
assert.deepEqual(sg.plots()[0].rightAxis.ticks.map(t => t.label), [String.raw`$-\frac{1}{2}$`, String.raw`$\frac{1}{2}$`]);
const positiveChannelPositions = sg.plots()[0].rightAxis.ticks.map(t => t.value);
const legendTones = () => sg.elements().filter(el => el.props['data-channel-tone']).map(el => el.props['data-channel-tone']);
assert.deepEqual(legendTones(), ['teal', 'accent']);
assert.ok(positiveChannelPositions[0] > positiveChannelPositions[1], 'Positive gradient: negative spin is the upper channel');
assert.ok(sg.plots()[0].verticalArrows[0].to > sg.plots()[0].verticalArrows[0].from);
const positiveFieldShade = { ...sg.plots()[0].bands[0].verticalGradient };
assert.ok(positiveFieldShade.topOpacity > positiveFieldShade.bottomOpacity, 'Positive gradient: B_n increases upward, not along the beam');
assert.ok(positiveFieldShade.topOpacity - positiveFieldShade.bottomOpacity > .6, 'Default gradient is clearly visible');
assert.equal(sg.plots()[0].bands[0].color, '#8195aa');
assert.doesNotMatch(sg.html(), /zone violette/);
assert.ok(sg.plots()[0].markers.every(atom => atom.verticalArrow === undefined), 'No channel projection assigned to the incident mixed beam');
sg.click('Animer'); sg.tick(); sg.tick(); assert.ok(sg.clock().time > 0);
sg.enter('sg-playback-speed', 2); sg.enter('sg-scale', 3);
assert.equal(sg.clock().playing, true, 'Display settings do not reset the experiment');
sg.slider('sg-gradient', 0); assert.equal(sg.clock().time, 0); assert.equal(sg.clock().playing, false);
assert.equal(sg.plots()[0].rightAxis, undefined, 'No misleading separate spin ticks for coincident channels');
assert.equal(sg.plots()[0].verticalArrows[0].to, sg.plots()[0].verticalArrows[0].from);
assert.equal(sg.plots()[0].verticalArrows[0].label, '$G=0$');
assert.equal(sg.plots()[0].bands[0].verticalGradient.topOpacity, sg.plots()[0].bands[0].verticalGradient.bottomOpacity, 'Uniform shading at zero gradient');
assert.match(sg.html(), /Sans gradient, aucune séparation/);
sg.command({ sgGradient: 0, time: 2 });
assert.ok(sg.plots()[0].markers.every(atom => atom.verticalArrow === undefined), 'No channel spin arrows without a measuring gradient');
sg.command({ sgJ: .5, sgGradient: 500, sgBeam: 'z-plus', sgAngle: 0, time: 2 });
assert.ok(sg.plots()[0].detectorScreen.impacts.length > 0, 'Detected atoms accumulate on the apparatus screen');
assert.ok(sg.plots()[0].detectorScreen.impacts.every(hit => hit.tone === 'accent' && Number.isFinite(hit.value) && Number.isFinite(hit.spread)));
const verifyScreenConsistency = angleDegrees => {
  const apparatus = sg.plots()[0], impacts = apparatus.detectorScreen.impacts, range = apparatus.yDomain[1];
  assert.equal((sg.html().match(/data-screen-impact=/g) ?? []).length, impacts.length, 'Both screens contain the same number of detected atoms');
  const front = harness('components/stern-gerlach-screen.tsx', 'SternGerlachScreen', 'screen', { points: impacts, range, scale: apparatus.detectorScreen.scale });
  const circles = front.elements().filter(el => el.props['data-screen-impact'] !== undefined);
  assert.deepEqual(circles.map(el => el.props['data-screen-impact']), impacts.map(hit => hit.id));
  circles.forEach((circle, index) => {
    const hit = impacts[index], angle = angleDegrees * Math.PI / 180;
    near(circle.props.cx, 150 + 150 * hit.x / range);
    near(circle.props.cy, 150 - 150 * hit.z / range);
    assert.equal(circle.props['data-channel-tone'], hit.tone);
    near(hit.value, hit.x * Math.sin(angle) + hit.z * Math.cos(angle));
    near(hit.spread, .5 + (hit.x * Math.cos(angle) - hit.z * Math.sin(angle)) / (2 * range));
  });
  front.dispose();
};
verifyScreenConsistency(0);
assert.match(sg.html(), /100\.0 %/);
const outgoing = () => sg.plots()[0].markers.filter(atom => atom.verticalArrow !== undefined);
assert.ok(outgoing().length > 0);
assert.ok(outgoing().every(atom => atom.verticalArrow === 14 && atom.tone === 'accent'), 'Positive spin points up although the magnetic moment deflects downward');
assert.ok(sg.plots()[0].markers.filter(atom => atom.x < 4).every(atom => atom.verticalArrow === undefined));
const arrowLengths = outgoing().map(atom => atom.verticalArrow);
sg.enter('sg-scale', 4);
assert.deepEqual(outgoing().map(atom => atom.verticalArrow), arrowLengths, 'Dot-size control does not change spin glyph scale');
sg.command({ sgGradient: -500, time: 2 });
assert.deepEqual(legendTones(), ['accent', 'teal'], 'Legend swatches follow channel order when the gradient is reversed');
sg.plots()[0].rightAxis.ticks.forEach((tick, i) => near(tick.value, -positiveChannelPositions[i]));
assert.ok(sg.plots()[0].verticalArrows[0].to < sg.plots()[0].verticalArrows[0].from);
assert.deepEqual(sg.plots()[0].bands[0].verticalGradient, { topOpacity: positiveFieldShade.bottomOpacity, bottomOpacity: positiveFieldShade.topOpacity }, 'Reversing G reverses the shading');
assert.ok(outgoing().every(atom => atom.verticalArrow === 14), 'Reversing the gradient reverses force, not the spin projection');
sg.slider('sg-angle', 90); assert.equal(sg.clock().time, 0); assert.match(sg.html(), /50\.0 %/);
assert.equal(sg.plots()[0].rightAxis.label, String.raw`$J_x/\hbar$`);
sg.command({ sgJ: 1.5, sgModel: 'quantum', time: 3, finalTime: 6 });
assert.equal(sg.plots()[0].rightAxis.ticks.length, 4);
verifyScreenConsistency(90);
assert.deepEqual(legendTones(), ['accent', 'accent', 'teal', 'teal'], 'Spin 3/2 has four legend strokes matching the negative-gradient channel order');
assert.match(sg.html(), /4 canaux possibles/); assert.match(sg.html(), /25\.0 %/);
assert.ok(outgoing().every(atom => [-42, -14, 14, 42].includes(atom.verticalArrow)));
sg.command({ sgJ: 0, time: 2 });
assert.deepEqual(legendTones(), ['ink'], 'Spin zero has a single central channel');
assert.ok(outgoing().every(atom => atom.verticalArrow === 0), 'Zero angular momentum has no arrow');
sg.command({ sgJ: 1, sgGradient: 500, time: 2 });
assert.deepEqual(legendTones(), ['teal', 'ink', 'accent'], 'Spin one has three ordered channels');
sg.command({ sgJ: 1.5, time: 2 });
sg.click('Classique'); assert.equal(sg.clock().time, 0); assert.match(sg.html(), /Moments classiques isotropes/);
assert.ok(sg.plots()[0].markers.every(atom => Number.isFinite(atom.verticalArrow)), 'Classical projections are defined even in the incident beam');
sg.command({ sgGradient: 1500, sgVelocity: 100, sgLength: 10, sgDistance: 30, sgMass: 20, time: 8, finalTime: 12 });
assert.match(sg.html(), /Forte déviation/);
for (const plot of sg.plots()) for (const curve of plot.series) assert.ok(curve.values.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
sg.click('Nouvelle série'); assert.equal(sg.clock().time, 0); assert.match(sg.html(), /0 atomes détectés/);
assert.deepEqual(sg.plots()[0].detectorScreen.impacts, [], 'A new series clears the apparatus screen too');
sg.enter('sg-final-time', 1); assert.equal(sg.clock().finalTime, 1);
sg.dispose();
console.log('Stern–Gerlach: preparations, model/axis/geometry changes, zero gradient, high-deflection warning, playback and detector reset pass.');
const cascade = harness('components/stern-gerlach-cascade-lab.tsx', 'SternGerlachCascadeLab', 'stern-gerlach');
assert.match(cascade.html(), /Stern–Gerlach en cascade/);
for (const sequence of [String.raw`z\to x\to z`, String.raw`z\to z\to z`]) assert.ok(cascade.html().includes(`${sequence}</annotation>`), 'Cascade axis presets use mathematical typography');
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
