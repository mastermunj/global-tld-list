import { defineConfig } from 'oxlint';
import baseConfig from '@mastermunj/oxc-config/oxlint';

export default defineConfig({
  extends: [baseConfig],
  // Written by scripts/generate.mts from the IANA/ICANN sources.
  ignorePatterns: [...(baseConfig.ignorePatterns ?? []), 'src/data.ts', 'src/details-data.ts'],
});
