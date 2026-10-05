// Post-build step: refreshes the compiled library and Nexus worker inside the
// "minimal" authoring folder. Models and index.html there are maintained manually.
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(new URL('.', import.meta.url)));
const distDir = join(rootDir, 'dist');
const minimalDir = join(rootDir, 'minimal');
const minimalLibDir = join(minimalDir, 'lib');

mkdirSync(minimalLibDir, { recursive: true });

copyFileSync(join(distDir, 'newhop.global.js'), join(minimalLibDir, 'newhop.global.js'));
copyFileSync(join(distDir, 'corto.em.js'), join(minimalLibDir, 'corto.em.js'));

console.log('minimal/lib/ refreshed.');
