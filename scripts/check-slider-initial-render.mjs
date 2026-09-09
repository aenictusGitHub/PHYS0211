import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { cn } from '../lib/utils.ts';

// Exercise the actual shared TSX component without a browser or layout metrics.
const source = readFileSync(new URL('../components/ui/slider.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const require = createRequire(import.meta.url);
const module = { exports: {} };
new Function('exports', 'require', 'module', compiled)(module.exports,
  name => name === '@/lib/utils' ? { cn } : require(name), module);
const { Slider } = module.exports;

const parameters = [
  ['Hauteur', 0, 8, 2.5],
  ['Largeur', .5, 6, 1],
  ['Nombre d’onde', 1, 4, 2],
  ['Accélération gravitationnelle', 0, .5, .1],
  ['Largeur du paquet', 2, 5, 3],
  ['Facteur d’affichage', .5, 20, 16],
  ['Perturbation', -20, 20, -6],
  ['Nombre quantique', 1, 8, 1],
  ['Temps', 0, 2 * Math.PI, 0],
];
let cases = 0;
for (const [label, min, max, initial] of parameters) {
  for (const value of new Set([min, initial, max])) {
    for (const hidden of [false, true]) {
      for (const disabled of [false, true]) {
        const html = renderToStaticMarkup(createElement('div', { hidden },
          createElement(Slider, { min, max, value: [value], disabled, 'aria-label': label })));
        const thumbs = html.match(/<div\b[^>]*data-slot="slider-thumb"[^>]*>/g) ?? [];
        const indicator = html.match(/<div\b[^>]*data-slot="slider-range"[^>]*>/)?.[0];
        assert.equal(thumbs.length, 1, `${label}: exactly one thumb`);
        assert.ok(indicator, `${label}: value indicator exists`);
        const percent = (value - min) / (max - min) * 100;
        const position = Number(thumbs[0].match(/inset-inline-start:([\d.e+-]+)%/)?.[1]);
        const fill = Number(indicator.match(/width:([\d.e+-]+)%/)?.[1]);
        assert.ok(Math.abs(position - percent) < 1e-10, `${label}: initial position is known without layout`);
        assert.ok(Math.abs(fill - percent) < 1e-10, `${label}: initial fill matches the value`);
        for (const element of [thumbs[0], indicator]) {
          assert.doesNotMatch(element, /visibility:hidden|display:none|NaN|undefined|var\(--position\)/,
            `${label}: no measurement-dependent hiding, including initially hidden labs`);
        }
        assert.ok(html.includes(`aria-valuenow="${value}"`), `${label}: accessible value is retained`);
        assert.ok(html.includes(`type="range"`), `${label}: native keyboard input is retained`);
        cases++;
      }
    }
  }
}
console.log(`Sliders: ${cases} initial renders pass, including hidden labs, disabled controls and both endpoints.`);
