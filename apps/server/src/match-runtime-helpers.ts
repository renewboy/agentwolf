import { AcpDeliveryUncertainError } from '@agentwolf/acp'
import {
  SpeechIdSchema,
  type GameEvent,
  type PlayerAction,
  type PlayerId,
  type SpeechId,
} from '@agentwolf/contracts'
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

export function currentSpeechId(
  events: readonly GameEvent[],
  playerId: PlayerId,
  kind: string,
): SpeechId {
  const boundary = events.findLast(
    (event) => event.payload.type === 'speech.started' || event.payload.type === 'speech.committed',
  )
  if (
    boundary?.payload.type !== 'speech.started' ||
    boundary.payload.playerId !== playerId ||
    boundary.payload.kind !== kind
  ) {
    throw new Error(`Missing active speech boundary for ${playerId}`)
  }
  return SpeechIdSchema.parse(boundary.sequence)
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
  return settleOrThrow(promises, 'One or more player turns failed')
}

export async function mapConcurrently<Value>(
  values: readonly Value[],
  operation: (value: Value) => Promise<void>,
): Promise<void> {
  await settleOrThrow(
    values.map(async (value) => operation(value)),
    'One or more player sessions failed',
  )
}

async function settleOrThrow<Value>(
  promises: readonly Promise<Value>[],
  errorMessage: string,
): Promise<Awaited<Value>[]> {
  const settled = await Promise.allSettled(promises)
  const errors: unknown[] = []
  const values: Awaited<Value>[] = []
  for (const result of settled) {
    if (result.status === 'rejected') errors.push(result.reason)
    else values.push(result.value)
  }
  if (errors.length > 0) throw new AggregateError(errors, errorMessage)
  return values
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
