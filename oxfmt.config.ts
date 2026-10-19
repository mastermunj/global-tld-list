import { defineConfig } from 'oxfmt';
import baseConfig from '@mastermunj/oxc-config/oxfmt';

export default defineConfig({
  ...baseConfig,
  ignorePatterns: [
    ...(baseConfig.ignorePatterns ?? []),
    // Written by scripts/generate.mts on every data refresh.
    'src/data.ts',
    'src/details-data.ts',
    // Written by the release tool on every release; reformatting it only creates noise.
    'CHANGELOG.md',
  ],
});
