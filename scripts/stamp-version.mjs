// Adds ?v=<version> to the site's own CSS and JS URLs, so a deploy never
// leaves a browser running cached old scripts or styles with new HTML.
// GitHub Pages lets browsers cache files for 10 minutes, and without this
// a fresh index.html can load a stale main.js or style.css.
//
// Usage: node scripts/stamp-version.mjs <site dir> <version>
// Rewrites files in place, so run it on a copy of web/.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [dir, version] = process.argv.slice(2);
if (!dir || !version) {
  console.error('Usage: node scripts/stamp-version.mjs <site dir> <version>');
  process.exit(1);
}
const v = `?v=${encodeURIComponent(version)}`;

function rewrite(file, edit) {
  const before = readFileSync(file, 'utf8');
  const after = edit(before);
  if (after !== before) writeFileSync(file, after);
}

// index.html: the stylesheet and the entry script.
rewrite(join(dir, 'index.html'), s => s
  .replace(/(href="css\/[^"?]+\.css)"/g, `$1${v}"`)
  .replace(/(src="js\/[^"?]+\.js)"/g, `$1${v}"`));

// Our modules: relative imports and the built-in engine worker. Vendored
// code (chess.js, Stockfish) changes rarely and Stockfish finds its .wasm
// from its own URL, so it's left alone.
function* jsFiles(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) yield* jsFiles(p);
    else if (e.name.endsWith('.js')) yield p;
  }
}
for (const file of jsFiles(join(dir, 'js'))) {
  rewrite(file, s => s
    .replace(/(\bfrom\s+['"]\.{1,2}\/[^'"?]+\.js)(['"])/g, `$1${v}$2`)
    .replace(/(new URL\(['"]\.\/[^'"?]+\.js)(['"])/g, `$1${v}$2`));
}
