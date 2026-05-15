/**
 * Removes Next.js + tooling caches so HTML and /_next/static always match one build.
 * Run: node scripts/clean-build-artifacts.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targets = ['.next', path.join('node_modules', '.cache'), '.turbo'];

for (const rel of targets) {
  const abs = path.join(root, rel);
  try {
    fs.rmSync(abs, { recursive: true, force: true });
    process.stdout.write(`removed: ${rel}\n`);
  } catch (e) {
    process.stdout.write(`skip ${rel}: ${e instanceof Error ? e.message : String(e)}\n`);
  }
}
