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
      reasoningEffort: 'low',
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
    const discovery = await service.discoverTool(tool.id, { model: 'mock-model' })
    expect(discovery).toMatchObject({
      ok: true,
      agentName: 'agentwolf-mock',
      models: ['mock-default', 'mock-model'],
      currentModel: 'mock-model',
      reasoningEfforts: ['low', 'high'],
      currentReasoningEffort: 'high',
      modes: ['read-only'],
    })
    const result = await service.probe(profile.id)
    expect(result).toMatchObject({
      ok: true,
      agentName: 'agentwolf-mock',
      models: ['mock-default', 'mock-model'],
      currentModel: 'mock-model',
      reasoningEfforts: ['low', 'high'],
      currentReasoningEffort: 'low',
      modes: ['read-only'],
    })
    repository.close()
  })

  it('handles missing catalog entries and alternate ACP capability shapes', async () => {
    const dataDirectory = await mkdtemp(resolve(tmpdir(), 'agentwolf-probe-matrix-'))
    temporaryDirectories.push(dataDirectory)
    const repository = new SqliteRepository(':memory:')
    const catalog = new AgentCatalogService(repository)
    const fixture = fileURLToPath(
      new URL('../../../packages/acp/tests/fixtures/mock-agent.mjs', import.meta.url),
    )
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
    await expect(service.probe('profile-missing' as never)).rejects.toThrow(/Unknown Agent Profile/)
    await expect(service.discoverTool('tool-missing' as never)).rejects.toThrow(
      /Unknown Agent Tool/,
    )

    const variants = [
      {
        name: 'Nested options',
        environment: {
          AGENTWOLF_MOCK_NESTED_MODEL_OPTIONS: literal('true'),
          AGENTWOLF_MOCK_DISABLE_REASONING: literal('true'),
          AGENTWOLF_MOCK_DISABLE_MODES: literal('true'),
        },
        expected: {
          ok: true,
          models: ['mock-default', 'mock-model'],
          reasoningEfforts: [],
          modes: [],
        },
      },
      {
        name: 'No model',
        environment: { AGENTWOLF_MOCK_DISABLE_MODEL: literal('true') },
        expected: { ok: true, models: [] },
      },
      {
        name: 'Boolean model',
        environment: { AGENTWOLF_MOCK_MODEL_BOOLEAN: literal('true') },
        expected: { ok: true, models: [] },
      },
      {
        name: 'Duplicate reasoning',
        environment: { AGENTWOLF_MOCK_DUPLICATE_REASONING: literal('true') },
        expected: { ok: false, message: expect.stringContaining('multiple thought_level') },
      },
    ] as const
    for (const variant of variants) {
      const tool = catalog.createTool({
        name: variant.name,
        kind: 'custom',
        command: process.execPath,
        args: [fixture],
        environment: variant.environment,
        modelConfigKey: 'model',
      })
      expect(await service.discoverTool(tool.id)).toMatchObject(variant.expected)
    }

    const broken = catalog.createTool({
      name: 'Broken probe',
      kind: 'custom',
      command: resolve(dataDirectory, 'missing-agent'),
      args: [],
      environment: {},
      modelConfigKey: 'model',
    })
    expect(await service.discoverTool(broken.id)).toMatchObject({ ok: false, models: [] })

    const orphanProfile = {
      id: 'profile-orphan',
      name: 'Orphan',
      toolId: 'tool-orphan',
      model: 'model',
      promptTimeoutMs: 5_000,
      connection: {},
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
    }
    const missingToolService = new AgentProbeService(
      {
        getProfile: () => orphanProfile,
        getTool: () => null,
      } as never,
      config,
    )
    await expect(missingToolService.probe(orphanProfile.id as never)).rejects.toThrow(
      /Unknown Agent Tool/,
    )
    repository.close()
  }, 15_000)
})

function literal(value: string) {
  return { source: 'literal' as const, value, secret: false as const }
}
