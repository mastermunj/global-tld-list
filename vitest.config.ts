import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    watch: false,
    cache: false,
    coverage: {
      enabled: true,
      include: ['src/**', 'scripts/**'],
      exclude: ['src/data.ts', 'src/details-data.ts'],
    },
  },
});
