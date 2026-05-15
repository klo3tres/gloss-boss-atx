/**
 * Next.js sometimes emits webpack-runtime in `.next/server/` with `require("./<id>.js")`
 * while chunk files live only under `.next/server/chunks/`. Copy chunks up so production
 * and `next start` resolve correctly (fixes MODULE_NOT_FOUND ./331.js on Windows).
 */
const fs = require('fs');
const path = require('path');

const serverDir = path.join(process.cwd(), '.next', 'server');
const chunksDir = path.join(serverDir, 'chunks');

if (!fs.existsSync(chunksDir)) {
  process.exit(0);
}

for (const name of fs.readdirSync(chunksDir)) {
  if (!name.endsWith('.js')) continue;
  const from = path.join(chunksDir, name);
  const to = path.join(serverDir, name);
  fs.copyFileSync(from, to);
}

console.info('[gloss-boss-atx] Patched server chunks into .next/server for Node require resolution.');
