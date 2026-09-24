import path from 'path';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(__dirname, '../../../..');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: path.resolve(
        repoRoot,
        'coverage/packages/pieces/community/assinafy'
      ),
      include: ['src/**/*.ts'],
      exclude: ['src/i18n/**'],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 95,
      },
    },
  },
  resolve: {
    alias: {
      '@activepieces/pieces-framework': path.resolve(
        repoRoot,
        'packages/pieces/framework/src/index.ts'
      ),
      '@activepieces/pieces-common': path.resolve(
        repoRoot,
        'packages/pieces/common/src/index.ts'
      ),
      '@activepieces/core-piece-types': path.resolve(
        repoRoot,
        'packages/core/piece-types/src/index.ts'
      ),
      '@activepieces/core-utils': path.resolve(
        repoRoot,
        'packages/core/utils/src/index.ts'
      ),
    },
  },
});
