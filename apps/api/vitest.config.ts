import { defineConfig, mergeConfig } from 'vitest/config';
import { vitestPreset } from '@sidehustle/config/vitest';

export default mergeConfig(
  vitestPreset,
  defineConfig({ test: { fileParallelism: false, testTimeout: 20_000 } }),
);
