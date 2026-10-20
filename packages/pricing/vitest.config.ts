import { defineConfig, mergeConfig } from 'vitest/config';
import { vitestPreset } from '@sidehustle/config/vitest';

export default mergeConfig(
  vitestPreset,
  defineConfig({
    test: {
      // NFR-MNT-01: 90% line and branch coverage on pricing logic.
      coverage: { thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 } },
    },
  }),
);
