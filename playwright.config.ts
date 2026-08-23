import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const e2eServerPort = Number(process.env['AGENTWOLF_E2E_SERVER_PORT'] ?? '4311')
const e2eWebPort = Number(process.env['AGENTWOLF_E2E_WEB_PORT'] ?? '5174')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${e2eWebPort}`,
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
      url: `http://127.0.0.1:${e2eServerPort}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        AGENTWOLF_DATABASE_PATH: ':memory:',
        AGENTWOLF_DATA_DIR: resolve('.agentwolf/e2e'),
        AGENTWOLF_DEVELOPER_MODE: 'true',
        AGENTWOLF_PORT: String(e2eServerPort),
      },
    },
    {
      command: 'pnpm --filter @agentwolf/web dev',
      url: `http://127.0.0.1:${e2eWebPort}`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        AGENTWOLF_API_ORIGIN: `http://127.0.0.1:${e2eServerPort}`,
        AGENTWOLF_WEB_PORT: String(e2eWebPort),
      },
    },
  ],
})
