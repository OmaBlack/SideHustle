import { defineConfig, mergeConfig } from 'vitest/config';
import { vitestPreset } from '@sidehustle/config/vitest';

export default mergeConfig(vitestPreset, defineConfig({}));
