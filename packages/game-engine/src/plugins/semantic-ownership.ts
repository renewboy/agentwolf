import type {
  AbilityId,
  PhaseId,
  PluginEventType,
  PluginId,
  QueryType,
  RoleId,
  TriggerId,
} from '@agentwolf/contracts'

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

interface MutableContribution {
  readonly roleIds: RoleId[]
  readonly abilityIds: AbilityId[]
  readonly phaseIds: PhaseId[]
  readonly pluginEvents: PluginEventContribution[]
  readonly queryTypes: QueryType[]
  readonly triggerIds: TriggerId[]
}

export class SemanticOwnershipRecorder {
  readonly #byPlugin = new Map<PluginId, MutableContribution>()
  #activePluginId: PluginId | null = null

  public begin(pluginId: PluginId): void {
    if (this.#activePluginId) {
      throw new Error(`Plugin ${pluginId} cannot install while ${this.#activePluginId} is active`)
    }
    if (this.#byPlugin.has(pluginId)) throw new Error(`Plugin ${pluginId} installed twice`)
    this.#activePluginId = pluginId
    this.#byPlugin.set(pluginId, emptyContribution())
  }

  public end(pluginId: PluginId): void {
    if (this.#activePluginId !== pluginId) {
      throw new Error(
        `Plugin install scope mismatch: expected ${this.#activePluginId}, got ${pluginId}`,
      )
    }
    this.#activePluginId = null
  }

  public role(roleId: RoleId): void {
    pushUnique(this.#active().roleIds, roleId, 'Role')
  }

  public ability(abilityId: AbilityId): void {
    pushUnique(this.#active().abilityIds, abilityId, 'Ability')
  }

  public phase(phaseId: PhaseId): void {
    pushUnique(this.#active().phaseIds, phaseId, 'Phase')
  }

  public pluginEvent(pluginId: PluginId, eventType: PluginEventType): void {
    const owner = this.#owner()
    if (owner !== pluginId) {
      throw new Error(`Plugin ${owner} cannot register event ${pluginId}:${eventType}`)
    }
    const events = this.#active().pluginEvents
    if (events.some((entry) => entry.pluginId === pluginId && entry.eventType === eventType)) {
      throw new Error(`Plugin event ${pluginId}:${eventType} registered twice`)
    }
    events.push({ pluginId, eventType })
  }

  public query(queryType: QueryType): void {
    pushUnique(this.#active().queryTypes, queryType, 'Query')
  }

  public trigger(triggerId: TriggerId): void {
    pushUnique(this.#active().triggerIds, triggerId, 'Trigger')
  }

  public contributions(pluginIds: readonly PluginId[]): readonly PluginSemanticContribution[] {
    if (this.#activePluginId)
      throw new Error(`Plugin ${this.#activePluginId} install is unfinished`)
    return pluginIds.map((pluginId) => {
      const contribution = this.#byPlugin.get(pluginId)
      if (!contribution) throw new Error(`Plugin ${pluginId} has no semantic install record`)
      return Object.freeze({
        pluginId,
        roleIds: Object.freeze([...contribution.roleIds]),
        abilityIds: Object.freeze([...contribution.abilityIds]),
        phaseIds: Object.freeze([...contribution.phaseIds]),
        pluginEvents: Object.freeze(
          contribution.pluginEvents.map((entry) => Object.freeze({ ...entry })),
        ),
        queryTypes: Object.freeze([...contribution.queryTypes]),
        triggerIds: Object.freeze([...contribution.triggerIds]),
      })
    })
  }

  #owner(): PluginId {
    if (!this.#activePluginId) throw new Error('Semantic registration requires an active plugin')
    return this.#activePluginId
  }

  #active(): MutableContribution {
    const owner = this.#owner()
    const contribution = this.#byPlugin.get(owner)
    if (!contribution) throw new Error(`Missing semantic install record for ${owner}`)
    return contribution
  }
}

function emptyContribution(): MutableContribution {
  return {
    roleIds: [],
    abilityIds: [],
    phaseIds: [],
    pluginEvents: [],
    queryTypes: [],
    triggerIds: [],
  }
}

function pushUnique<Value extends string>(values: Value[], value: Value, label: string): void {
  if (values.includes(value)) throw new Error(`${label} ${value} registered twice in one plugin`)
  values.push(value)
}
