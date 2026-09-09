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
];

for (const expression of expressions) {
  for (const display of [false, true]) {
    const html = renderToStaticMarkup(createElement(Formula, { display }, `$${expression}$`));
    assert.doesNotMatch(html, /katex-error|<merror/);
    assert.equal(html.includes('math-display'), display, 'Inline labels keep their existing layout');
    assert.equal((html.match(/<math\b/g) ?? []).length, 1, 'One accessible mathematical expression');
    assert.ok(html.includes('<annotation encoding="application/x-tex">'), 'TeX source remains accessible');
    assert.ok(html.includes('class="katex-html" aria-hidden="true"'), 'Non-duplicated HTML fallback');
    if (display) assert.match(html, /<math[^>]*display="block"/);
  }
}
const cases = renderToStaticMarkup(createElement(Formula, { display: true }, expressions[0]));
assert.match(cases, /<mtable\b/);
assert.equal((cases.match(/<mtr\b/g) ?? []).length, 2, 'Potential has two mathematical rows');
assert.match(cases, /<mo[^>]*>\{<\/mo>/, 'Brace belongs to the same native expression');
assert.match(cases, /<msub>/, 'Potential index is a semantic subscript');
console.log('Display math: native cases, fractions, delimiters, limits and indices; inline HTML fallback and accessibility pass.');
