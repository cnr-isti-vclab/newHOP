import { defineConfig } from 'vite';
import { createReadStream, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  resolve: {
    dedupe: ['three']
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
          fileName: 'nexus3d/corto.em.js',
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
    sourcemap: true
  }
}));
