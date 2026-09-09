import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Static deployment assets are checked separately by build:pages.
const checks = readdirSync(new URL('.', import.meta.url))
  .filter(name => /^check-.*\.mjs$/.test(name) && name !== 'check-pages.mjs')
  .sort();
for (const name of checks) {
  console.log(`\n${name}`);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`\n${checks.length} checks passed.`);
