import { defineConfig } from 'vite';
import { createReadStream, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageVersion = (JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }).version;

export default defineConfig(({ mode }) => ({
  define: {
    __NEWHOP_VERSION__: JSON.stringify(packageVersion),
    __NEWHOP_LIBRARY_URL__: mode === 'global'
      ? 'document.currentScript.src'
      : mode === 'esm'
        ? 'import.meta.url'
        : 'undefined'
  },
  resolve: {
    dedupe: ['three'],
    alias: [
      {
        find: /^three$/,
        replacement: resolve(__dirname, 'node_modules/three/build/three.module.js')
      }
    ]
  },
  plugins: [
    {
      name: 'serve-nexus-worker',
      configureServer(server) {
        const workerPath = resolve(__dirname, 'node_modules/nexus3d/dist/corto.em.js');
        server.middlewares.use('/nexus3d/corto.em.js', (_request, response, next) => {
          response.setHeader('Content-Type', 'text/javascript');
          createReadStream(workerPath).on('error', next).pipe(response);
        });
      },
      generateBundle() {
        const workerPath = resolve(__dirname, 'node_modules/nexus3d/dist/corto.em.js');
        this.emitFile({
          type: 'asset',
          fileName: 'corto.em.js',
          source: readFileSync(workerPath)
        });
      }
    }
  ],
  build: {
    emptyOutDir: mode === 'esm',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'newHOP',
      formats: [mode === 'global' ? 'iife' : 'es'],
      fileName: () => mode === 'global' ? 'newhop.global.js' : 'newhop.js'
    },
    rollupOptions: {
      external: mode === 'global' ? [] : ['three', /^three\//],
      output: {
        globals: {
          three: 'THREE'
        }
      }
    },
    sourcemap: mode !== 'global'
  }
}));
