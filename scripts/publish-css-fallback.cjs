/**
 * Next.js 15+ emits hashed CSS files under `.next/static/css/*.css` (not `app/layout.css`).
 * Concatenate them into a stable public URL so styling still loads if hashed `/_next/static/...`
 * links are stale (404) after a bad deploy or mixed build.
 */
const fs = require('fs');
const path = require('path');

const cssDir = path.join(process.cwd(), '.next', 'static', 'css');
const destDir = path.join(process.cwd(), 'public', 'assets');
const dest = path.join(destDir, 'app-layout.css');

if (!fs.existsSync(cssDir)) {
  console.warn('[publish-css-fallback] skip: missing', cssDir);
  process.exit(0);
}

const files = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css')).sort();
if (files.length === 0) {
  console.warn('[publish-css-fallback] skip: no .css files in', cssDir);
  process.exit(0);
}

let combined = '';
for (const name of files) {
  combined += fs.readFileSync(path.join(cssDir, name), 'utf8');
  combined += '\n';
}

fs.mkdirSync(destDir, { recursive: true });
fs.writeFileSync(dest, combined, 'utf8');
console.info('[publish-css-fallback] wrote', path.relative(process.cwd(), dest), `(${files.length} file(s))`);
