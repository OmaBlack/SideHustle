import { defineConfig, mergeConfig } from 'vitest/config';
import { vitestPreset } from '@sidehustle/config/vitest';

export default mergeConfig(
  vitestPreset,
  defineConfig({
    test: {
      // Integration tests share one database, so files run one at a time.
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  }),
);
