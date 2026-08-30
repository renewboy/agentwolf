import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@agent-arena/acp-runtime': fileURLToPath(
        new URL('./vendor/agent-arena-core/packages/acp-runtime/src/index.ts', import.meta.url),
      ),
      '@agent-arena/contracts': fileURLToPath(
        new URL('./vendor/agent-arena-core/packages/contracts/src/index.ts', import.meta.url),
      ),
      '@agent-arena/game-runtime': fileURLToPath(
        new URL('./vendor/agent-arena-core/packages/game-runtime/src/index.ts', import.meta.url),
      ),
      '@agent-arena/ruleset': fileURLToPath(
        new URL('./vendor/agent-arena-core/packages/ruleset/src/index.ts', import.meta.url),
      ),
      '@agent-arena/trajectory': fileURLToPath(
        new URL('./vendor/agent-arena-core/packages/trajectory/src/index.ts', import.meta.url),
      ),
      '@agentwolf/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url),
      ),
      '@agentwolf/assets/player-skills': fileURLToPath(
        new URL('./packages/assets/src/player-skills.ts', import.meta.url),
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
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/*/tests/**/*.test.ts',
            'apps/server/tests/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/tests/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['apps/web/tests/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['packages/*/src/**/*.ts', 'apps/server/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
      exclude: [
        'vendor/**',
        '**/index.ts',
        '**/bin.ts',
        '**/errors.ts',
        '**/simulation-cli.ts',
        'apps/web/src/main.tsx',
        'apps/web/src/motion/gsap.ts',
      ],
      watermarks: {
        statements: [50, 80],
        branches: [50, 80],
        functions: [50, 80],
        lines: [50, 80],
      },
      thresholds: {
        perFile: true,
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    restoreMocks: true,
  },
})
