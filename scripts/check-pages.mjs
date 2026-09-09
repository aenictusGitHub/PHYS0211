import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('dist/pages');
const base = '/PHYS0211/';
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
assert.ok(html.includes('Mécanique quantique'));
assert.ok(html.includes('id="root"'));

function checkAsset(url) {
  if (!url.startsWith('/') || url.startsWith('//')) return;
  assert.ok(url.startsWith(base), `Missing GitHub Pages prefix: ${url}`);
  assert.ok(existsSync(resolve(root, url.slice(base.length))), `Missing asset: ${url}`);
}

for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) checkAsset(url);
const assets = readdirSync(resolve(root, 'assets'));
for (const file of assets.filter(name => name.endsWith('.css'))) {
  const css = readFileSync(resolve(root, 'assets', file), 'utf8');
  for (const [, url] of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) checkAsset(url);
  assert.ok(css.includes('Atelier Latin Modern'), 'Local LaTeX fonts must be included');
  assert.ok(css.includes('.scattering-timeline'), 'Shared laboratory styles must be included');
  // Check the optimized artifact, not just source CSS: the optimizer folds
  // translate:none away, which previously let the primitive push thumbs out.
  const thumbRule = css.match(/\.well-perturbation \[data-slot=["']?switch-thumb["']?\]\{([^}]+)\}/)?.[1];
  assert.ok(thumbRule, 'Missing perturbation switch layout');
  assert.match(thumbRule, /--tw-translate-x:0(?:px)?[;}]/, 'Cancel horizontal utility translation');
  assert.match(thumbRule, /--tw-translate-y:0(?:px)?[;}]/, 'Cancel vertical utility translation');
  assert.match(thumbRule, /top:\.25rem/, 'Thumb has a fixed inset within its track');
  assert.doesNotMatch(css, /\.oscillator-workspace \.well-perturbation \.math-formula\s*\{[^}]*display:block/,
    'Inline parameter symbols must not become block formulas');
  assert.match(css, /\.perturbation-equations>\.math-formula\{[^}]*display:block/,
    'Display equations have their own wrappers, separate from inline labels');
  assert.match(css, /\.perturbation-equations \.katex-display>\.katex\{[^}]*font-size:1em/,
    'Display equations share one font size instead of caption styling');
  assert.match(css, /\.katex \.sizing\.reset-size6\.size3\{font-size:\.7em\}/,
    'KaTeX subscript/superscript sizing is preserved');
  assert.match(css, /\.math-formula math\{[^}]*font-family:["']?Atelier Latin Modern Math/,
    'Both block and inline formulas retain the local native LaTeX math font');
  assert.doesNotMatch(css, /\.math-display \.katex-(?:mathml|html)\{/,
    'No competing visibility overrides: a single native expression is emitted');
  assert.doesNotMatch(css, /math-hat/, 'Obsolete operator-hat styles are absent');
  const choiceRules = [...css.matchAll(/[^{}]*\.display-switch button[^{}]*\{([^}]+)\}/g)].map(match => match[1]);
  assert.ok(choiceRules.some(rule => rule.includes('height:auto') && rule.includes('padding:.55em .7em') && rule.includes('line-height:1.4')),
    'Multiline choice buttons retain vertical padding in the published stylesheet');
  assert.match(css, /\.math-formula mtd\{padding:\.22em \.3em\}/,
    'Matrix rows have explicit vertical padding after the global reset');
  assert.match(css, /mtd\+mtd\{padding-left:\.8em\}/,
    'Piecewise potential columns retain their gap');
  assert.match(css, /\.math-display\{[^}]*overflow-x:auto/,
    'Unbroken equations remain accessible in narrow cards');
  assert.match(css, /\.math-display>\.katex-display\{min-width:max-content\}/,
    'Wide equations do not lose their beginning to centered overflow');
}
assert.ok(assets.some(name => /^scattering\.worker-.*\.js$/.test(name)), 'Missing numerical worker');
let nativeMathComponent = false;
let oscillatorMoments = false, rotorField = false, rotorResolution = false;
for (const file of assets.filter(name => name.endsWith('.js'))) {
  const js = readFileSync(resolve(root, 'assets', file), 'utf8');
  for (const url of js.match(/\/PHYS0211\/assets\/[A-Za-z0-9_.-]+/g) ?? []) checkAsset(url);
  nativeMathComponent ||= /output:["'`]mathml["'`]/.test(js);
  assert.doesNotMatch(js, /math-hat/, 'No special hat-rendering workaround is published');
  oscillatorMoments ||= js.includes('oscillator-observables-title');
  rotorField ||= js.includes('rotor-field-enabled') && js.includes('rotor-lambda');
  rotorResolution ||= js.includes('rotor-resolution') && js.includes('subdivisions polaires');
}
assert.ok(nativeMathComponent, 'The published component renders native math without an HTML duplicate');
assert.ok(oscillatorMoments && rotorField, 'The published bundle includes oscillator moments and the optional rotor field');
assert.ok(rotorResolution, 'The published bundle includes the rotor mesh-resolution control');
console.log('GitHub Pages: assets, local LaTeX fonts, formula layout and switch containment verified.');
