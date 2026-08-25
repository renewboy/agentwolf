import { AcpDeliveryUncertainError } from '@agentwolf/acp'
import type { GameEvent, PlayerAction, PlayerId } from '@agentwolf/contracts'
import { type GameState, type RoleRegistry, type TurnDescriptor } from '@agentwolf/game-engine'
import type { SpeechCommittedEvent } from './speech-playback-coordinator.js'

export function findCommittedSpeech(events: readonly GameEvent[]): SpeechCommittedEvent | null {
  return (
    events.findLast(
      (candidate): candidate is SpeechCommittedEvent =>
        candidate.payload.type === 'speech.committed',
    ) ?? null
  )
}

export function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = [...error.errors].map(describeError).join('; ')
    return details ? `${error.message}: ${details}` : error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export function hasUncertainDelivery(error: unknown): boolean {
  if (
    error instanceof AcpDeliveryUncertainError ||
    (error instanceof Error && error.name === 'AcpDeliveryUncertainError')
  ) {
    return true
  }
  if (error instanceof AggregateError) return [...error.errors].some(hasUncertainDelivery)
  return error instanceof Error && error.cause ? hasUncertainDelivery(error.cause) : false
}

export function interruptAbilityExpectation(
  state: GameState,
  playerId: PlayerId,
  turn: Pick<TurnDescriptor, 'interruptAbilityIds'>,
  roles: RoleRegistry,
) {
  const interruptAbilityIds = interruptAbilityIdsFor(state, playerId, turn, roles)
  return interruptAbilityIds.length > 0 ? { interruptAbilityIds } : {}
}

export function interruptAbilityIdsFor(
  state: GameState,
  playerId: PlayerId,
  turn: Pick<TurnDescriptor, 'interruptAbilityIds'>,
  roles: RoleRegistry,
) {
  const player = state.players.get(playerId)
  return player
    ? (turn.interruptAbilityIds ?? []).filter((abilityId) => roles.canUseAbility(player, abilityId))
    : []
}

export async function settleActions(
  promises: readonly Promise<PlayerAction>[],
): Promise<PlayerAction[]> {
  const settled = await Promise.allSettled(promises)
  const errors = settled
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason)
  if (errors.length > 0) throw new AggregateError(errors, 'One or more player turns failed')
  return settled
    .filter(
      (result): result is PromiseFulfilledResult<PlayerAction> => result.status === 'fulfilled',
    )
    .map((result) => result.value)
}

export async function mapWithConcurrency<Value>(
  values: readonly Value[],
  concurrency: number,
  operation: (value: Value) => Promise<void>,
): Promise<void> {
  const errors: unknown[] = []
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      for (;;) {
        const index = cursor++
        if (index >= values.length) return
        try {
          await operation(values[index]!)
        } catch (error) {
          errors.push(error)
        }
      }
    },
  )
  await Promise.all(workers)
  if (errors.length > 0) throw new AggregateError(errors, 'One or more player sessions failed')
}
