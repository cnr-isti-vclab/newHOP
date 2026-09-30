// Post-build step: refreshes only the compiled library inside the "minimal"
// authoring folder. Models and index.html there are maintained manually.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(new URL('.', import.meta.url)));
const distDir = join(rootDir, 'dist');
const minimalLibDir = join(rootDir, 'minimal', 'lib');

mkdirSync(minimalLibDir, { recursive: true });

copyFileSync(join(distDir, 'newhop.global.js'), join(minimalLibDir, 'newhop.global.js'));
if (existsSync(join(distDir, 'newhop.global.js.map'))) {
  copyFileSync(join(distDir, 'newhop.global.js.map'), join(minimalLibDir, 'newhop.global.js.map'));
}

console.log('minimal/lib/ refreshed.');
