import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
      tsconfigPath: './tsconfig.json'
    })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'HTMLTemplate',
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: [
        'fs',
        'path',
        'crypto',
        'stream',
        'util',
        'node:fs',
        'node:path',
        'node:crypto',
        'node:stream',
        'node:util'
      ],
      output: {
        preserveModules: false,
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
