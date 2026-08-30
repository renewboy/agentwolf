import { SemanticIdSchema } from '@agent-arena/contracts'
import { SemanticOwnershipRecorder as CoreSemanticOwnershipRecorder } from '@agent-arena/ruleset'
import {
  AbilityIdSchema,
  PhaseIdSchema,
  PluginEventTypeSchema,
  PluginIdSchema,
  QueryTypeSchema,
  RoleIdSchema,
  TriggerIdSchema,
  type AbilityId,
  type PhaseId,
  type PluginEventType,
  type PluginId,
  type QueryType,
  type RoleId,
  type TriggerId,
} from '@agentwolf/contracts'

const semanticKinds = ['role', 'ability', 'phase', 'pluginEvent', 'query', 'trigger'] as const
type SemanticKind = (typeof semanticKinds)[number]

export interface PluginEventContribution {
  readonly pluginId: PluginId
  readonly eventType: PluginEventType
}

export interface PluginSemanticContribution {
  readonly pluginId: PluginId
  readonly roleIds: readonly RoleId[]
  readonly abilityIds: readonly AbilityId[]
  readonly phaseIds: readonly PhaseId[]
  readonly pluginEvents: readonly PluginEventContribution[]
  readonly queryTypes: readonly QueryType[]
  readonly triggerIds: readonly TriggerId[]
}

export class SemanticOwnershipRecorder {
  readonly #core = new CoreSemanticOwnershipRecorder<SemanticKind>(semanticKinds)
  #activePluginId: PluginId | null = null

  public begin(pluginId: PluginId): void {
    this.#core.begin(pluginId)
    this.#activePluginId = pluginId
  }

  public end(pluginId: PluginId): void {
    this.#core.end(pluginId)
    this.#activePluginId = null
  }

  public role(roleId: RoleId): void {
    this.#record('role', roleId)
  }

  public ability(abilityId: AbilityId): void {
    this.#record('ability', abilityId)
  }

  public phase(phaseId: PhaseId): void {
    this.#record('phase', phaseId)
  }

  public pluginEvent(pluginId: PluginId, eventType: PluginEventType): void {
    const owner = this.#owner()
    if (owner !== pluginId) {
      throw new Error(`Plugin ${owner} cannot register event ${pluginId}:${eventType}`)
    }
    this.#record('pluginEvent', `${pluginId}.${eventType}`)
  }

  public query(queryType: QueryType): void {
    this.#record('query', queryType)
  }

  public trigger(triggerId: TriggerId): void {
    this.#record('trigger', triggerId)
  }

  public contributions(pluginIds: readonly PluginId[]): readonly PluginSemanticContribution[] {
    return this.#core.contributions(pluginIds).map((contribution) =>
      Object.freeze({
        pluginId: contribution.pluginId,
        roleIds: Object.freeze(contribution.semantics.role.map((id) => RoleIdSchema.parse(id))),
        abilityIds: Object.freeze(
          contribution.semantics.ability.map((id) => AbilityIdSchema.parse(id)),
        ),
        phaseIds: Object.freeze(contribution.semantics.phase.map((id) => PhaseIdSchema.parse(id))),
        pluginEvents: Object.freeze(contribution.semantics.pluginEvent.map(decodePluginEvent)),
        queryTypes: Object.freeze(
          contribution.semantics.query.map((id) => QueryTypeSchema.parse(id)),
        ),
        triggerIds: Object.freeze(
          contribution.semantics.trigger.map((id) => TriggerIdSchema.parse(id)),
        ),
      }),
    )
  }

  #record(kind: SemanticKind, value: string): void {
    this.#core.record(kind, SemanticIdSchema.parse(value))
  }

  #owner(): PluginId {
    if (!this.#activePluginId) throw new Error('Semantic registration requires an active plugin')
    return this.#activePluginId
  }
}

function decodePluginEvent(value: string): PluginEventContribution {
  const separator = value.indexOf('.')
  return Object.freeze({
    pluginId: PluginIdSchema.parse(value.slice(0, separator)),
    eventType: PluginEventTypeSchema.parse(value.slice(separator + 1)),
  })
}
