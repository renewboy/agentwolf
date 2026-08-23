import type { PlayerId } from '@agentwolf/contracts'
import { assertRule } from '../errors.js'
import type { ActionValidationContext } from '../types.js'

export function requireAliveTarget(
  context: ActionValidationContext,
  targetId: PlayerId,
  options: { allowSelf: boolean },
): void {
  const target = context.state.players.get(targetId)
  assertRule(target, `Unknown target ${targetId}`)
  assertRule(target.alive, `${target.name} is not alive`)
  if (!options.allowSelf) {
    assertRule(targetId !== context.actor.id, 'This ability cannot target its owner')
  }
}

export function requireTargetCount(context: ActionValidationContext, count: 1): [PlayerId]
export function requireTargetCount(context: ActionValidationContext, count: number): PlayerId[]
export function requireTargetCount(context: ActionValidationContext, count: number): PlayerId[] {
  assertRule(context.action.type === 'night-action', 'Expected a night action')
  assertRule(context.action.targetIds.length === count, `This ability requires ${count} target(s)`)
  return [...context.action.targetIds]
}

export function abilityUseCount(context: ActionValidationContext, abilityId: string): number {
  return context.actor.roleState.abilityUses[abilityId] ?? 0
}
