import { AcpDeliveryUncertainError } from '@agentwolf/acp'
import type { GameEvent, PlayerAction, PlayerId } from '@agentwolf/contracts'
import {
  type GameEngine,
  type GameState,
  type RoleRegistry,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import type { SqliteRepository } from './repository.js'
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

export function reconcileCommittedPendingAction(
  repository: SqliteRepository,
  engine: GameEngine,
  playerId: PlayerId,
): void {
  const pending = repository.playerSessions.get(engine.state.matchId, playerId)?.pendingAction
  if (!pending) return
  const deliverySequence = engine.events.find(
    (event) =>
      event.payload.type === 'delivery.started' && event.payload.deliveryId === pending.deliveryId,
  )?.sequence
  if (!deliverySequence) return
  const committed = engine.events.some(
    (event) =>
      event.sequence > deliverySequence &&
      event.payload.type === 'action.submitted' &&
      event.payload.playerId === playerId &&
      JSON.stringify(event.payload.action) === JSON.stringify(pending.action),
  )
  if (committed) repository.playerSessions.clearPendingAction(engine.state.matchId, playerId)
}
