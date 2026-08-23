import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @agentwolf/server dev',
      url: 'http://127.0.0.1:4310/api/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
      env: {
        AGENTWOLF_DATABASE_PATH: ':memory:',
        AGENTWOLF_DATA_DIR: resolve('.agentwolf/e2e'),
      },
    },
    {
      command: 'pnpm --filter @agentwolf/web dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
  ],
})
