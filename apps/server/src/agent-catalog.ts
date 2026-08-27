import {
  AgentConfigurationSummarySchema,
  AgentProfileIdSchema,
  AgentProfileInputSchema,
  AgentProfileOrderInputSchema,
  AgentProfileSchema,
  AgentToolIdSchema,
  AgentToolInputSchema,
  AgentToolSchema,
  type AgentProfile,
  type AgentConfigurationSummary,
  type AgentProfileId,
  type AgentProfileInput,
  type AgentProfileOrderInput,
  type AgentTool,
  type AgentToolId,
  type AgentToolInput,
} from '@agentwolf/contracts'
import { builtInAgentTools } from '@agentwolf/acp'
import { RuleViolation } from '@agentwolf/game-engine'
import { createReadableId } from './ids.js'
import type { SqliteRepository } from './repository.js'

export class AgentCatalogService {
  readonly #repository: SqliteRepository

  public constructor(repository: SqliteRepository) {
    this.#repository = repository
  }

  public listTools(): AgentTool[] {
    return [...builtInAgentTools(), ...this.#repository.listCustomTools()]
  }

  public getTool(id: AgentToolId): AgentTool | null {
    return this.listTools().find((tool) => tool.id === id) ?? null
  }

  public createTool(input: AgentToolInput): AgentTool {
    const parsed = AgentToolInputSchema.parse(input)
    const tool = AgentToolSchema.parse({
      ...parsed,
      id: AgentToolIdSchema.parse(createReadableId('tool', parsed.name)),
      builtIn: false,
    })
    this.#repository.saveCustomTool(tool)
    return tool
  }

  public updateTool(id: AgentToolId, input: AgentToolInput): AgentTool {
    const current = this.getTool(id)
    if (!current) throw new Error(`Unknown Agent Tool ${id}`)
    if (current.builtIn) throw new Error('Built-in Agent Tools are read-only')
    const tool = AgentToolSchema.parse({ ...AgentToolInputSchema.parse(input), id, builtIn: false })
    this.#repository.saveCustomTool(tool)
    return tool
  }

  public deleteTool(id: AgentToolId): void {
    const tool = this.getTool(id)
    if (!tool) throw new Error(`Unknown Agent Tool ${id}`)
    if (tool.builtIn) throw new Error('Built-in Agent Tools are read-only')
    const inUse = this.#repository.listProfiles().some((profile) => profile.toolId === id)
    if (inUse) throw new Error('Agent Tool is used by an Agent Profile')
    if (!this.#repository.deleteCustomTool(id)) throw new Error(`Unknown Agent Tool ${id}`)
  }

  public listProfiles(): AgentProfile[] {
    return this.#repository.listProfiles()
  }

  public getProfile(id: AgentProfileId): AgentProfile | null {
    return this.#repository.getProfile(id)
  }

  public getProfileConfiguration(id: AgentProfileId): AgentConfigurationSummary | null {
    const profile = this.getProfile(id)
    if (!profile) return null
    const tool = this.getTool(profile.toolId)
    if (!tool) return null
    return agentConfiguration(profile, tool)
  }

  public createProfile(input: AgentProfileInput): AgentProfile {
    const parsed = AgentProfileInputSchema.parse(input)
    this.#requireTool(parsed.toolId)
    const timestamp = new Date().toISOString()
    const profile = AgentProfileSchema.parse({
      ...parsed,
      id: AgentProfileIdSchema.parse(createReadableId('profile', parsed.name)),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    this.#repository.saveProfile(profile)
    return profile
  }

  public updateProfile(id: AgentProfileId, input: AgentProfileInput): AgentProfile {
    const current = this.getProfile(id)
    if (!current) throw new Error(`Unknown Agent Profile ${id}`)
    const parsed = AgentProfileInputSchema.parse(input)
    this.#requireTool(parsed.toolId)
    const profile = AgentProfileSchema.parse({
      ...parsed,
      id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    })
    this.#repository.saveProfile(profile)
    return profile
  }

  public reorderProfiles(input: AgentProfileOrderInput): AgentProfile[] {
    const { profileIds } = AgentProfileOrderInputSchema.parse(input)
    const currentProfiles = this.listProfiles()
    if (
      profileIds.length !== currentProfiles.length ||
      currentProfiles.some((profile) => !profileIds.includes(profile.id))
    ) {
      throw new RuleViolation('Agent Profile order must include every current profile exactly once')
    }
    this.#repository.reorderProfiles(profileIds)
    return this.listProfiles()
  }

  public deleteProfile(id: AgentProfileId): void {
    const referencedBy = this.#repository
      .listCustomBoards()
      .find((board) => board.agentProfiles.some((slot) => slot.profileId === id))
    if (referencedBy) {
      throw new RuleViolation(`Agent Profile is used by board ${referencedBy.name}`)
    }
    if (!this.#repository.deleteProfile(id)) throw new Error(`Unknown Agent Profile ${id}`)
  }

  #requireTool(id: AgentToolId): AgentTool {
    const tool = this.getTool(id)
    if (!tool) throw new Error(`Unknown Agent Tool ${id}`)
    return tool
  }
}

export function agentConfiguration(
  profile: AgentProfile,
  tool: AgentTool,
): AgentConfigurationSummary {
  return AgentConfigurationSummarySchema.parse({
    name: tool.kind === 'trae-cli' ? 'Trae' : tool.name,
    model: profile.model,
    reasoningEffort: profile.reasoningEffort ?? null,
  })
}
