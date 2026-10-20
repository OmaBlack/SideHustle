import { defineConfig, mergeConfig } from 'vitest/config';
import { vitestPreset } from '@sidehustle/config/vitest';

export default mergeConfig(
  vitestPreset,
  defineConfig({ test: { environment: 'jsdom', include: ['src/**/*.test.tsx', 'src/**/*.test.ts'] } }),
);
