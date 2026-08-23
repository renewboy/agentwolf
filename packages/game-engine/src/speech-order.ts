import type { MatchId, PlayerAction, PlayerId } from '@agentwolf/contracts'
import { deterministicIndex } from './deterministic.js'
import { assertRule } from './errors.js'
import { visibility, type RuleRuntime } from './rule-registry.js'

export type SpeechDirection = 'clockwise' | 'counterclockwise'

interface SpeechOrderPlayer {
  readonly id: PlayerId
  readonly seat: number
  readonly alive: boolean
}

export interface DaySpeechOrderDecision {
  readonly playerIds: readonly PlayerId[]
  readonly basis: 'night-death' | 'sheriff' | 'random'
  readonly anchorPlayerId: PlayerId
  readonly direction: SpeechDirection
}

export function sheriffCampaignOrder(
  matchId: MatchId,
  day: number,
  candidates: readonly PlayerId[],
  players: ReadonlyMap<PlayerId, { readonly seat: number }>,
): PlayerId[] {
  const ordered = [...candidates].sort(
    (left, right) => (players.get(left)?.seat ?? 0) - (players.get(right)?.seat ?? 0),
  )
  if (ordered.length < 2) return ordered
  return rotate(
    ordered,
    deterministicIndex(
      `${matchId}:day:${day}:sheriff-campaign:${ordered.join(',')}`,
      ordered.length,
    ),
  )
}

export function daySpeechOrder(input: {
  readonly matchId: MatchId
  readonly day: number
  readonly players: readonly SpeechOrderPlayer[]
  readonly recentDeathIds: readonly PlayerId[]
  readonly sheriffId: PlayerId | null
  readonly sheriffDirection?: SpeechDirection
}): DaySpeechOrderDecision {
  const seats = [...input.players].sort((left, right) => left.seat - right.seat)
  const living = seats.filter((player) => player.alive)
  assertRule(living.length > 0, 'Day speech order requires a living player')
  const livingIds = living.map((player) => player.id)
  const livingSet = new Set(livingIds)
  const deaths = [...new Set(input.recentDeathIds)]
    .map((playerId) => seats.find((player) => player.id === playerId))
    .filter((player): player is SpeechOrderPlayer => Boolean(player))
    .sort((left, right) => left.seat - right.seat)
  const sheriffId = input.sheriffId && livingSet.has(input.sheriffId) ? input.sheriffId : null
  const randomKey = `${input.matchId}:day:${input.day}:living:${livingIds.join(',')}:deaths:${deaths
    .map((player) => player.id)
    .join(',')}`

  if (sheriffId) {
    assertRule(input.sheriffDirection, 'Living Sheriff must choose a day speech direction')
    const anchorId = deaths.length === 1 ? deaths[0]!.id : sheriffId
    const aroundTable = walkAfterAnchor(seats, anchorId, input.sheriffDirection)
    return {
      playerIds: [...aroundTable.filter((playerId) => playerId !== sheriffId), sheriffId],
      basis: deaths.length === 1 ? 'night-death' : 'sheriff',
      anchorPlayerId: anchorId,
      direction: input.sheriffDirection,
    }
  }

  const direction = deterministicDirection(`${randomKey}:direction`)
  if (deaths.length > 0) {
    const anchorId = deaths[0]!.id
    return {
      playerIds: walkAfterAnchor(seats, anchorId, direction),
      basis: 'night-death',
      anchorPlayerId: anchorId,
      direction,
    }
  }

  const startId = livingIds[deterministicIndex(`${randomKey}:start`, livingIds.length)]!
  const directionalLiving = direction === 'clockwise' ? livingIds : [...livingIds].reverse()
  return {
    playerIds: rotate(directionalLiving, directionalLiving.indexOf(startId)),
    basis: 'random',
    anchorPlayerId: startId,
    direction,
  }
}

export function resolveDaySpeechOrder(runtime: RuleRuntime): void {
  const sheriffId = runtime.state.sheriff.holderId
  const livingSheriff = sheriffId && runtime.state.players.get(sheriffId)?.alive ? sheriffId : null
  const directionAction = runtime.state.phaseActions.find(
    (action): action is Extract<PlayerAction, { type: 'sheriff-action' }> =>
      action.type === 'sheriff-action',
  )
  const sheriffDirection = directionAction
    ? directionAction.action === 'speech-counterclockwise'
      ? 'counterclockwise'
      : 'clockwise'
    : undefined
  const decision = daySpeechOrder({
    matchId: runtime.state.matchId,
    day: runtime.state.day,
    players: [...runtime.state.players.values()],
    recentDeathIds: [...runtime.state.recentDeaths.keys()],
    sheriffId: livingSheriff,
    ...(sheriffDirection ? { sheriffDirection } : {}),
  })
  runtime.append(
    {
      type: 'speech.order-set',
      kind: 'day',
      playerIds: [...decision.playerIds],
      basis: decision.basis,
      anchorPlayerId: decision.anchorPlayerId,
      direction: decision.direction,
    },
    visibility.public,
  )
  runtime.append({ type: 'death.window-closed' }, visibility.god)
}

function walkAfterAnchor(
  seats: readonly SpeechOrderPlayer[],
  anchorId: PlayerId,
  direction: SpeechDirection,
): PlayerId[] {
  const anchorIndex = seats.findIndex((player) => player.id === anchorId)
  assertRule(anchorIndex >= 0, `Unknown speech-order anchor ${anchorId}`)
  const step = direction === 'clockwise' ? 1 : -1
  const result: PlayerId[] = []
  for (let distance = 1; distance <= seats.length; distance += 1) {
    const index = (anchorIndex + step * distance + seats.length) % seats.length
    const player = seats[index]!
    if (player.alive) result.push(player.id)
  }
  return result
}

function rotate<Value>(values: readonly Value[], offset: number): Value[] {
  return [...values.slice(offset), ...values.slice(0, offset)]
}

function deterministicDirection(key: string): SpeechDirection {
  return deterministicIndex(key, 2) === 0 ? 'clockwise' : 'counterclockwise'
}
