import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Mirrors the build-time substitution in vite.config.ts so src/version.ts
  // resolves under vitest too.
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version)
  },
  test: {
    // Test environment
    environment: 'node',

    // Global settings
    globals: true,

    // Test timeouts
    testTimeout: 30000,
    hookTimeout: 30000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', 'tests/', '**/*.test.ts', '**/*.spec.ts', '**/*.config.ts', 'benchmarks/']
    },

    // Benchmark configuration
    benchmark: {
      include: ['benchmarks/**/*.bench.ts']
    },

    // Include/exclude patterns
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'coverage', '.vitest']
  }
});
