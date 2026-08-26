import type { AbilityId, PlayerAction, PlayerId } from '@agentwolf/contracts'
import { assertRule } from './errors.js'
import { ResolutionRegistry } from './plugins/resolution-registry.js'
import type { QueryRegistry } from './plugins/query-registry.js'
import { RoleRegistry } from './roles/registry.js'
import { createClassicResolutionRegistry } from './rulesets/classic/resolution-registry.js'
import type { RuleRuntime } from './rule-registry.js'
import type { BoardManifest, GameState, ResolutionEffect, ResolutionResult } from './types.js'

export class ResolutionAgenda {
  readonly #effects: ResolutionEffect[] = []
  readonly #registry: ResolutionRegistry
  readonly #queries: QueryRegistry | undefined

  public constructor(
    registry: ResolutionRegistry = createClassicResolutionRegistry(),
    queries?: QueryRegistry,
  ) {
    this.#registry = registry
    this.#queries = queries
  }

  public add(effect: ResolutionEffect): void {
    this.#effects.push(effect)
  }

  public addAll(effects: readonly ResolutionEffect[]): void {
    for (const effect of effects) this.add(effect)
  }

  public settle(state: GameState, board: BoardManifest, roles: RoleRegistry): ResolutionResult {
    return this.#registry.settle(this.#effects, {
      state,
      board,
      roles,
      ...(this.#queries ? { queries: this.#queries } : {}),
    })
  }
}

export function addAbilityEffects(
  agenda: ResolutionAgenda,
  state: GameState,
  board: BoardManifest,
  roles: RoleRegistry,
  action: Extract<PlayerAction, { type: 'night-action' | 'skill-trigger' }>,
): void {
  const actor = state.players.get(action.actorId)
  assertRule(actor?.roleId, `Action actor ${action.actorId} has no role`)
  const { ability } = roles.ability(action.abilityId)
  assertRule(
    roles.canUseAbility(actor, action.abilityId),
    `${actor.name} cannot use ${action.abilityId}`,
  )
  assertRule(
    ability.actionTypes.includes(action.type),
    `${action.abilityId} does not accept ${action.type}`,
  )
  const context = { state, board, roles, action, actor }
  ability.validate(context)
  agenda.addAll(ability.effects(context))
}

export function appendAbilityOutcomes(
  runtime: RuleRuntime,
  action: Extract<PlayerAction, { type: 'night-action' | 'skill-trigger' }>,
  result: ResolutionResult,
  stage: import('./roles/base.js').AbilityOutcome['stage'] = 'after-usage',
): void {
  const actor = runtime.state.players.get(action.actorId)
  assertRule(actor?.roleId, `Action actor ${action.actorId} has no role`)
  const { ability } = runtime.roles.ability(action.abilityId)
  const context = {
    state: runtime.state,
    board: runtime.board,
    roles: runtime.roles,
    action,
    actor,
  }
  for (const outcome of ability.outcomes?.(context, result) ?? []) {
    if (outcome.stage !== stage) continue
    runtime.append(outcome.payload, outcome.visibility)
  }
}

export function effectsForActions(
  state: GameState,
  board: BoardManifest,
  roles: RoleRegistry,
  actions: readonly PlayerAction[],
  registry: ResolutionRegistry = createClassicResolutionRegistry(),
  queries?: QueryRegistry,
): {
  agenda: ResolutionAgenda
  consumedAbilityIds: readonly { playerId: PlayerId; abilityId: AbilityId }[]
} {
  const agenda = new ResolutionAgenda(registry, queries)
  const consumedAbilityIds: Array<{ playerId: PlayerId; abilityId: AbilityId }> = []
  for (const action of actions) {
    if (action.type !== 'night-action' && action.type !== 'skill-trigger') continue
    addAbilityEffects(agenda, state, board, roles, action)
    consumedAbilityIds.push({ playerId: action.actorId, abilityId: action.abilityId })
  }
  return { agenda, consumedAbilityIds }
}
