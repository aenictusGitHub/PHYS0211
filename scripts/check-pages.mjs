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
  // Keep the Safari zoom fix in the published (optimized) stylesheet. Native
  // layout is only enabled for display equations in MathML-capable engines.
  assert.match(css, /@supports \(math-style:normal\)\{\.math-display \.katex-mathml\{/,
    'Native display math is feature-gated, leaving an HTML fallback');
  const nativeMathRule = css.match(/\.math-display \.katex-mathml\{([^}]+)\}/)?.[1];
  assert.ok(nativeMathRule, 'Missing native mathematical layout');
  for (const declaration of ['clip-path:none', 'width:auto', 'height:auto', 'position:static', 'overflow:visible']) {
    assert.ok(nativeMathRule.includes(declaration), `Native math must reset ${declaration}`);
  }
  assert.ok(css.indexOf('.math-display .katex-mathml{') > css.indexOf('.katex .katex-mathml{'),
    'Native visibility overrides KaTeX accessibility-only positioning');
  assert.match(css, /\.math-display \.katex-html\{display:none\}/,
    'Native block equations do not render a duplicate HTML equation');
  assert.match(css, /\.math-display math\{[^}]*font-family:["']?Atelier Latin Modern Math/,
    'Native formulas retain the local LaTeX math font');
}
assert.ok(assets.some(name => /^scattering\.worker-.*\.js$/.test(name)), 'Missing numerical worker');
for (const file of assets.filter(name => name.endsWith('.js'))) {
  const js = readFileSync(resolve(root, 'assets', file), 'utf8');
  for (const url of js.match(/\/PHYS0211\/assets\/[A-Za-z0-9_.-]+/g) ?? []) checkAsset(url);
}
console.log('GitHub Pages: assets, local LaTeX fonts, formula layout and switch containment verified.');
