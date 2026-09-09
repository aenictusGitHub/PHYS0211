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
}
assert.ok(assets.some(name => /^scattering\.worker-.*\.js$/.test(name)), 'Missing numerical worker');
for (const file of assets.filter(name => name.endsWith('.js'))) {
  const js = readFileSync(resolve(root, 'assets', file), 'utf8');
  for (const [, url] of js.matchAll(/["'](\/PHYS0211\/assets\/[^"']+)["']/g)) checkAsset(url);
}
console.log('GitHub Pages: entry point, styles, local LaTeX fonts and worker assets verified.');
