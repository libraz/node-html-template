import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    dts({
      tsconfigPath: './tsconfig.build.json',
      entryRoot: 'src',
      insertTypesEntry: false
    })
  ],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts')
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
