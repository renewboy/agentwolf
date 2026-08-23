import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@agentwolf/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
      '@agentwolf/assets/prompts': fileURLToPath(
        new URL('./packages/assets/src/prompts.ts', import.meta.url),
      ),
      '@agentwolf/assets': fileURLToPath(
        new URL('./packages/assets/src/index.ts', import.meta.url),
      ),
      '@agentwolf/acp': fileURLToPath(new URL('./packages/acp/src/index.ts', import.meta.url)),
      '@agentwolf/game-engine': fileURLToPath(
        new URL('./packages/game-engine/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['packages/*/src/**/*.ts', 'apps/server/src/**/*.ts'],
      exclude: ['**/index.ts', '**/bin.ts', '**/errors.ts', '**/simulation-cli.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 65,
        statements: 80,
      },
    },
    restoreMocks: true,
  },
})
