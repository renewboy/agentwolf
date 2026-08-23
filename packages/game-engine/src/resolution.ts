import {
  AbilityIdSchema,
  type AbilityId,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import { assertRule } from './errors.js'
import { RoleRegistry } from './roles/registry.js'
import type {
  BoardManifest,
  DamageEffect,
  GameState,
  ProtectEffect,
  ResolutionEffect,
  ResolutionResult,
} from './types.js'

function redirectedTarget(targetId: PlayerId, mappings: ReadonlyMap<PlayerId, PlayerId>): PlayerId {
  return mappings.get(targetId) ?? targetId
}

export class ResolutionAgenda {
  readonly #effects: Array<ResolutionEffect & { sequence: number }> = []
  #sequence = 0

  public add(effect: ResolutionEffect): void {
    this.#effects.push({ ...effect, sequence: ++this.#sequence })
  }

  public addAll(effects: readonly ResolutionEffect[]): void {
    for (const effect of effects) this.add(effect)
  }

  public settle(state: GameState, board: BoardManifest, roles: RoleRegistry): ResolutionResult {
    const effects = [...this.#effects].sort(
      (left, right) => left.priority - right.priority || left.sequence - right.sequence,
    )
    const mappings = new Map<PlayerId, PlayerId>()
    for (const effect of effects) {
      if (effect.kind === 'target-map') mappings.set(effect.fromTargetId, effect.toTargetId)
    }

    const protections = new Map<PlayerId, Set<ProtectEffect['protection']>>()
    const damages = new Map<PlayerId, DamageEffect[]>()
    const preventedExiles = new Set<PlayerId>()
    const inspections: ResolutionResult['inspections'][number][] = []

    for (const effect of effects) {
      if (effect.kind === 'protect') {
        const targetId = redirectedTarget(effect.targetId, mappings)
        const targetProtections = protections.get(targetId) ?? new Set()
        targetProtections.add(effect.protection)
        protections.set(targetId, targetProtections)
      } else if (effect.kind === 'damage') {
        const targetId = redirectedTarget(effect.targetId, mappings)
        const targetDamages = damages.get(targetId) ?? []
        targetDamages.push({ ...effect, targetId })
        damages.set(targetId, targetDamages)
      } else if (effect.kind === 'inspect') {
        const targetId = redirectedTarget(effect.targetId, mappings)
        const target = state.players.get(targetId)
        assertRule(target?.roleId, `Cannot inspect unknown role for ${targetId}`)
        inspections.push({
          sourceId: effect.sourceId,
          targetId,
          result: roles.role(target.roleId).seerResult(),
        })
      } else if (effect.kind === 'prevent-death') {
        preventedExiles.add(redirectedTarget(effect.targetId, mappings))
      }
    }

    const pendingDeaths: ResolutionResult['pendingDeaths'][number][] = []
    const savedPlayerIds: PlayerId[] = []
    for (const [targetId, targetDamages] of damages) {
      const protection = protections.get(targetId) ?? new Set()
      const survivingDamages = targetDamages.filter((damage) => {
        if (damage.cause === 'exile') return !preventedExiles.has(targetId)
        if (damage.cause !== 'werewolf') return true
        const guarded = protection.has('guard')
        const healed = protection.has('antidote')
        if (guarded && healed) return board.policies.guardAntidoteCollision === 'death'
        return !guarded && !healed
      })
      if (survivingDamages.length > 0) {
        pendingDeaths.push({
          playerId: targetId,
          causes: [...new Set(survivingDamages.map((damage) => damage.cause))],
        })
      } else if (targetDamages.some((damage) => damage.cause === 'werewolf')) {
        savedPlayerIds.push(targetId)
      }
    }

    return {
      pendingDeaths,
      savedPlayerIds,
      inspections,
      consumedAbilityIds: [],
    }
  }
}

export function effectsForActions(
  state: GameState,
  board: BoardManifest,
  roles: RoleRegistry,
  actions: readonly PlayerAction[],
): {
  agenda: ResolutionAgenda
  consumedAbilityIds: readonly { playerId: PlayerId; abilityId: AbilityId }[]
} {
  const agenda = new ResolutionAgenda()
  const consumedAbilityIds: Array<{ playerId: PlayerId; abilityId: AbilityId }> = []
  for (const action of actions) {
    if (action.type !== 'night-action' && action.type !== 'skill-trigger') continue
    const actor = state.players.get(action.actorId)
    assertRule(actor?.roleId, `Action actor ${action.actorId} has no role`)
    const { role, ability } = roles.ability(action.abilityId)
    assertRule(role.id === actor.roleId, `${actor.name} does not own ${action.abilityId}`)
    const context = { state, board, action, actor }
    ability.validate(context)
    agenda.addAll(ability.effects(context))
    consumedAbilityIds.push({ playerId: actor.id, abilityId: action.abilityId })
  }
  return { agenda, consumedAbilityIds }
}

export const v1AbilityIds = {
  werewolfKill: AbilityIdSchema.parse('ability-werewolf-kill'),
  guardProtect: AbilityIdSchema.parse('ability-guard-protect'),
  witchAntidote: AbilityIdSchema.parse('ability-witch-antidote'),
  witchPoison: AbilityIdSchema.parse('ability-witch-poison'),
  seerInspect: AbilityIdSchema.parse('ability-seer-inspect'),
  hunterShot: AbilityIdSchema.parse('ability-hunter-shot'),
  werewolfSelfDestruct: AbilityIdSchema.parse('ability-werewolf-self-destruct'),
} as const
