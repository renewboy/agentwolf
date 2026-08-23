import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AcpPlayerSession, resolveLaunchSpec } from '@agentwolf/acp'
import {
  AgentProbeResultSchema,
  type AgentTool,
  type AgentProbeResult,
  type AgentProfileId,
  type AgentToolId,
} from '@agentwolf/contracts'
import type { AgentCatalogService } from './agent-catalog.js'
import type { ServerConfig } from './config.js'

export class AgentProbeService {
  readonly #catalog: AgentCatalogService
  readonly #config: ServerConfig

  public constructor(catalog: AgentCatalogService, config: ServerConfig) {
    this.#catalog = catalog
    this.#config = config
  }

  public async probe(profileId: AgentProfileId): Promise<AgentProbeResult> {
    const profile = this.#catalog.getProfile(profileId)
    if (!profile) throw new Error(`Unknown Agent Profile ${profileId}`)
    const tool = this.#catalog.getTool(profile.toolId)
    if (!tool) throw new Error(`Unknown Agent Tool ${profile.toolId}`)
    return this.#inspect(tool, {
      model: profile.model,
      ...(profile.mode ? { mode: profile.mode } : {}),
    })
  }

  public async discoverTool(toolId: AgentToolId): Promise<AgentProbeResult> {
    const tool = this.#catalog.getTool(toolId)
    if (!tool) throw new Error(`Unknown Agent Tool ${toolId}`)
    return this.#inspect(tool, {})
  }

  async #inspect(
    tool: AgentTool,
    selection: { readonly model?: string; readonly mode?: string },
  ): Promise<AgentProbeResult> {
    const startedAt = performance.now()
    const probeRoot = resolve(this.#config.dataDirectory, 'probes')
    await mkdir(probeRoot, { recursive: true })
    const cwd = await mkdtemp(resolve(probeRoot, 'probe-'))
    let session: AcpPlayerSession | null = null
    try {
      const mode = selection.mode ?? tool.initialMode
      session = await AcpPlayerSession.start({
        cwd,
        launch: resolveLaunchSpec(tool),
        modelConfigKey: tool.modelConfigKey,
        ...(selection.model ? { model: selection.model } : {}),
        ...(mode ? { mode } : {}),
      })
      const models = session.configOptions
        .flatMap((option) =>
          option.category === 'model' && option.type === 'select'
            ? option.options.flatMap((entry) => ('options' in entry ? entry.options : [entry]))
            : [],
        )
        .map((option) => option.value)
      return AgentProbeResultSchema.parse({
        ok: true,
        agentName: session.initializeResponse.agentInfo?.name,
        agentVersion: session.initializeResponse.agentInfo?.version,
        protocolVersion: session.initializeResponse.protocolVersion,
        models,
        modes: session.availableModes.map((modeEntry) => modeEntry.id),
        message: 'connection-ok',
        durationMs: Math.round(performance.now() - startedAt),
      })
    } catch (error) {
      return AgentProbeResultSchema.parse({
        ok: false,
        models: [],
        modes: [],
        message: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - startedAt),
      })
    } finally {
      await session?.close()
      await rm(cwd, { recursive: true, force: true })
    }
  }
}
