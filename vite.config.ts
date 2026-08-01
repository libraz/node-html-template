import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import pkg from './package.json' with { type: 'json' };

/** Chunk the executable is emitted as */
const CLI_CHUNK = 'cli.js';

export default defineConfig({
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    dts({
      tsconfigPath: './tsconfig.build.json',
      entryRoot: 'src',
      insertTypesEntry: false
    }),
    {
      // Rollup gives no guarantee that a shebang in the source survives into
      // the bundle, and the file has to be executable to be worth a shebang at
      // all, so both are applied here rather than hoped for.
      name: 'cli-executable',
      renderChunk(code, chunk) {
        return chunk.fileName === CLI_CHUNK ? { code: `#!/usr/bin/env node\n${code}`, map: null } : null;
      },
      writeBundle(options, bundle) {
        if (!bundle[CLI_CHUNK] || !options.dir) return;
        chmodSync(resolve(options.dir, CLI_CHUNK), 0o755);
      }
    }
  ],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        codegen: resolve(import.meta.dirname, 'src/codegen/index.ts'),
        loaders: resolve(import.meta.dirname, 'src/loaders/index.ts'),
        cli: resolve(import.meta.dirname, 'src/cli/bin.ts')
      },
      formats: ['es']
    },
    rollupOptions: {
      // A predicate rather than a hand-maintained list, so a newly used
      // built-in can never be bundled by accident.
      external: (id) => id.startsWith('node:'),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        exports: 'named'
      }
    },
    target: 'es2022',
    minify: false,
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true
  },
  resolve: {
    extensions: ['.ts', '.js']
  }
});
