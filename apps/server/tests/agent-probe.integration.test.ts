import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentCatalogService } from '../src/agent-catalog.js'
import { AgentProbeService } from '../src/agent-probe.js'
import type { ServerConfig } from '../src/config.js'
import { SqliteRepository } from '../src/repository.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

describe('AgentProbeService', () => {
  it('probes a real ACP stdio process and reports models and modes', async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), 'agentwolf-probe-'))
    temporaryDirectories.push(dataDirectory)
    const repository = new SqliteRepository(':memory:')
    const catalog = new AgentCatalogService(repository)
    const fixture = fileURLToPath(
      new URL('../../../packages/acp/tests/fixtures/mock-agent.mjs', import.meta.url),
    )
    const tool = catalog.createTool({
      name: 'Mock ACP',
      kind: 'custom',
      command: process.execPath,
      args: [fixture],
      environment: {},
      initialMode: 'read-only',
      modelConfigKey: 'model',
    })
    const profile = catalog.createProfile({
      name: 'Mock player',
      toolId: tool.id,
      model: 'mock-model',
      mode: 'read-only',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory,
      databasePath: ':memory:',
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(dataDirectory, 'web'),
      developerMode: false,
    }
    const service = new AgentProbeService(catalog, config)
    const discovery = await service.discoverTool(tool.id)
    expect(discovery).toMatchObject({
      ok: true,
      agentName: 'agentwolf-mock',
      models: ['mock-default', 'mock-model'],
      modes: ['read-only'],
    })
    const result = await service.probe(profile.id)
    expect(result).toMatchObject({
      ok: true,
      agentName: 'agentwolf-mock',
      models: ['mock-default', 'mock-model'],
      modes: ['read-only'],
    })
    repository.close()
  })
})
