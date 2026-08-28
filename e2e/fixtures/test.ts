import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { expect, test as base, type APIRequestContext, type WorkerInfo } from '@playwright/test'
import type { MatchView } from '@agentwolf/contracts'

export interface E2eResources {
  readonly runId: string
  readonly sharedToolName: string
  readonly sharedToolId: string
  readonly sharedProfileName: string
  readonly sharedProfileId: string
  readonly boardProfileName: string
  readonly boardProfileId: string
}

interface E2eWorkerFixtures {
  readonly resources: E2eResources
}

export const test = base.extend<Record<never, never>, E2eWorkerFixtures>({
  resources: [
    async ({ playwright }, use, workerInfo: WorkerInfo) => {
      const baseURL = workerInfo.project.use.baseURL
      if (!baseURL) throw new Error('Playwright baseURL is required for E2E resources')
      const request = await playwright.request.newContext({ baseURL })
      const runId = `e${workerInfo.workerIndex.toString(36)}${randomUUID().slice(0, 6)}`
      const sharedToolName = `E2E Mock ${runId}`
      const sharedProfileName = `E2E Shared ${runId}`
      const boardProfileName = `E2E Board Agent ${runId}`
      try {
        const toolResponse = await request.post('/api/agent-tools', {
          data: {
            name: sharedToolName,
            kind: 'custom',
            command: process.execPath,
            args: [resolve('packages/acp/tests/fixtures/mock-agent.mjs')],
            environment: {},
            initialMode: 'read-only',
            modelConfigKey: 'model',
          },
        })
        expect(toolResponse.ok()).toBe(true)
        const sharedToolId = ((await toolResponse.json()) as { id: string }).id

        const sharedProfileResponse = await request.post('/api/agent-profiles', {
          data: {
            name: sharedProfileName,
            toolId: sharedToolId,
            model: 'mock-model',
            promptTimeoutMs: 5000,
            connection: {},
          },
        })
        expect(sharedProfileResponse.ok()).toBe(true)
        const sharedProfileId = ((await sharedProfileResponse.json()) as { id: string }).id

        const boardProfileResponse = await request.post('/api/agent-profiles', {
          data: {
            name: boardProfileName,
            toolId: sharedToolId,
            model: 'mock-model',
            reasoningEffort: 'high',
            promptTimeoutMs: 5000,
            connection: {},
          },
        })
        expect(boardProfileResponse.ok()).toBe(true)
        const boardProfileId = ((await boardProfileResponse.json()) as { id: string }).id

        await use({
          runId,
          sharedToolName,
          sharedToolId,
          sharedProfileName,
          sharedProfileId,
          boardProfileName,
          boardProfileId,
        })
      } finally {
        await removeNamespacedResources(request, runId)
        await request.dispose()
      }
    },
    { scope: 'worker' },
  ],
})

export { expect }

async function removeNamespacedResources(request: APIRequestContext, runId: string): Promise<void> {
  const matches = (await (await request.get('/api/matches')).json()) as MatchView[]
  for (const match of matches.filter((entry) =>
    entry.seats.some((seat) => seat.name.includes(runId)),
  )) {
    await request.delete(`/api/matches/${match.id}`)
  }

  const boards = (await (await request.get('/api/boards')).json()) as Array<{
    id: string
    name: string
    source: string
  }>
  for (const board of boards.filter(
    (entry) => entry.source === 'custom' && entry.name.includes(runId),
  )) {
    await request.delete(`/api/boards/${board.id}`)
  }

  const characters = (await (await request.get('/api/characters')).json()) as Array<{
    id: string
    name: string
    source: string
  }>
  for (const character of characters.filter(
    (entry) => entry.source === 'custom' && entry.name.includes(runId),
  )) {
    await request.delete(`/api/characters/${character.id}`)
  }

  const profiles = (await (await request.get('/api/agent-profiles')).json()) as Array<{
    id: string
    name: string
  }>
  for (const profile of profiles.filter((entry) => entry.name.includes(runId))) {
    await request.delete(`/api/agent-profiles/${profile.id}`)
  }

  const tools = (await (await request.get('/api/agent-tools')).json()) as Array<{
    id: string
    name: string
    builtIn: boolean
  }>
  for (const tool of tools.filter((entry) => !entry.builtIn && entry.name.includes(runId))) {
    await request.delete(`/api/agent-tools/${tool.id}`)
  }
}
