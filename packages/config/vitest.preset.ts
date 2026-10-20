import type { ViteUserConfig } from 'vitest/config';

/** Shared Vitest settings. Packages spread this into their own `defineConfig`. */
export const vitestPreset: ViteUserConfig = {
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
};
