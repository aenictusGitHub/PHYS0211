import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const source = readFileSync(new URL('../components/math.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const require = createRequire(import.meta.url);
const module = { exports: {} };
new Function('exports', 'require', 'module', compiled)(module.exports, require, module);
const Formula = module.exports.Math;

// Include the reported cases formula, nested fractions, scalable delimiters,
// summation limits, aligned states and all seven laboratories' main notation.
const expressions = [
  String.raw`V(x)=\begin{cases}V_0,&|x|<a/2,\\0,&|x|\ge a/2.\end{cases}`,
  String.raw`E_{\mathrm{ref}}=\frac{\pi^2\hbar^2}{2ma^2}`,
  String.raw`\frac{V(\xi)}{\hbar\omega}=\frac{\xi^2}{2}+\lambda\xi^4`,
  String.raw`V(x)=\lambda E_{\mathrm{ref}}\!\left(\frac{x}{a}-\frac12\right)`,
  String.raw`\psi(x,t)=\sum_{n=1}^{40}c_n\phi_n(x)e^{-iE_nt/\hbar}`,
  String.raw`\begin{aligned}\hat H\phi_n&=E_n\phi_n,\\\phi_n(0)&=\phi_n(a)=0\end{aligned}`,
  String.raw`\psi(x,0)=\frac{\phi_0(x)+\phi_1(x)}{\sqrt2}`,
  String.raw`E_\ell=\frac{\hbar^2\ell(\ell+1)}{2I}`,
  String.raw`\psi_{n\ell m}(r,\theta,\varphi)=R_{n\ell}(r)Y_\ell^m(\theta,\varphi)`,
  String.raw`|\psi\rangle=\cos\frac\theta2|+\rangle+e^{i\varphi}\sin\frac\theta2|-\rangle`,
  String.raw`\phi_n(x)=\sqrt{\frac2a}\sin\!\left(n\pi x/a\right)`,
  String.raw`\langle E\rangle=2.01`,
  String.raw`x_i=-24`,
  String.raw`\hbar=m=1`,
];

for (const expression of expressions) {
  for (const display of [false, true]) {
    const html = renderToStaticMarkup(createElement(Formula, { display }, `$${expression}$`));
    assert.doesNotMatch(html, /katex-error|<merror/);
    assert.equal(html.includes('math-display'), display, 'Inline labels keep their existing layout');
    assert.equal((html.match(/<math\b/g) ?? []).length, 1, 'One accessible mathematical expression');
    assert.ok(html.includes('<annotation encoding="application/x-tex">'), 'TeX source remains accessible');
    assert.doesNotMatch(html, /katex-html|katex-mathml|aria-hidden|class="vlist/,
      'Only the first (native) rendition exists; no second copy can become visible');
    assert.equal(html.includes('class="katex-display"'), display,
      'Keep the existing block typography wrapper without changing inline flow');
    if (display) assert.match(html, /<math[^>]*display="block"/);
    else assert.doesNotMatch(html, /<math[^>]*display="block"/);
  }
}
const cases = renderToStaticMarkup(createElement(Formula, { display: true }, expressions[0]));
assert.match(cases, /<mtable\b/);
assert.equal((cases.match(/<mtr\b/g) ?? []).length, 2, 'Potential has two mathematical rows');
assert.match(cases, /<mo[^>]*>\{<\/mo>/, 'Brace belongs to the same native expression');
assert.match(cases, /<msub>/, 'Potential index is a semantic subscript');
const inline = renderToStaticMarkup(createElement(Formula, null, String.raw`x_i=-24`));
assert.match(inline, /<msub><mi>x<\/mi><mi>i<\/mi><\/msub>/,
  'Inline indices use native math layout too, including the reported initial position');
const eigenfunction = renderToStaticMarkup(createElement(Formula, { display: true }, expressions[10]));
assert.match(eigenfunction, /<msqrt><mfrac>/, 'The radical and fraction form one native layout');
assert.doesNotMatch(eigenfunction, /style="[^"]*(?:top|left|vertical-align):/,
  'No manually positioned HTML pieces at low zoom');

// Regressions use the actual laboratory formulas from the reported cards.
function labFormula(file, predicate) {
  const source = readFileSync(new URL(`../components/${file}.tsx`, import.meta.url), 'utf8');
  const formula = [...source.matchAll(/String\.raw`([^`]*)`/g)].map(match => match[1]).find(predicate);
  assert.ok(formula, `Missing representative formula in ${file}`);
  return formula;
}
function render(expression) {
  return renderToStaticMarkup(createElement(Formula, { display: true }, expression));
}
const spin = labFormula('spin-lab', tex => tex.startsWith('$|\\psi(0)\\rangle=\\cos'));
const hydrogen = labFormula('hydrogen-lab', tex => tex.startsWith('$\\psi_{n\\ell m}='));
const realHydrogen = labFormula('hydrogen-lab', tex => tex.startsWith('$\\psi^{\\mathrm{réel}}'));
for (const tex of [spin, hydrogen, realHydrogen]) {
  assert.doesNotMatch(render(tex), /<mtable|<mspace[^>]*linebreak/, 'One equation, one mathematical row');
  assert.ok(tex.includes('\\,'), 'Products have deliberate thin spacing');
}
const well = labFormula('infinite-well-lab', tex => tex.startsWith('$\\phi_n(x)=\\sqrt'));
assert.match(render(well), /<\/msqrt><mtext>\u2009<\/mtext><mi>sin<\/mi>/,
  'The normalization factor is separated from the sine');
assert.ok(!well.includes('\\!') && !well.includes('\\bigl'), 'No negative gap or oversized parentheses');
const rotor = labFormula('rotor-lab', tex => tex.startsWith('$\\hat H='));
assert.equal((render(rotor).match(/class="math-hat" stretchy="false"/g) ?? []).length, 2,
  'Both Hamiltonian and angular-momentum hats are non-stretching');
const wide = render(String.raw`\widehat{AB}`);
assert.match(wide, /<mo stretchy="true">\^<\/mo>/, 'An intentional wide hat stays wide');
assert.ok(!wide.includes('math-hat'));
const potential = labFormula('scattering-lab', tex => tex.startsWith('$V(x)=\\begin{cases}V_0'));
assert.equal((render(potential).match(/<mtr>/g) ?? []).length, 2);
assert.ok(potential.includes('\\lvert x\\rvert') && !potential.includes(','),
  'The case separator is column spacing, not a cramped comma');
const spinor = render(String.raw`|\psi(t)\rangle=\begin{pmatrix}0.14-0.83i\\-0.53+0.05i\end{pmatrix}`);
assert.equal((spinor.match(/<mtr>/g) ?? []).length, 2, 'The two spinor components keep separate rows');
for (const number of ['0.14', '0.83', '0.53', '0.05']) assert.ok(spinor.includes(`<mn>${number}</mn>`));
assert.doesNotMatch(spinor, /katex-error|<merror|katex-html/);
console.log('Math: unique native rendering, one-line equations, compact hats, product spacing, cases, two-row spinors and accessibility pass.');
