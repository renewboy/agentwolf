import type { GameEvent, PlayerId, RoleId, SpectatorView } from '@agentwolf/contracts'
import type { GameState } from './types.js'

export function canViewEvent(event: GameEvent, view: SpectatorView, state: GameState): boolean {
  if (view.kind === 'god') return true
  if (event.visibility.kind === 'public') return true
  if (view.kind === 'closed-eye') return false
  if (event.visibility.kind === 'players') {
    return event.visibility.playerIds.includes(view.playerId)
  }
  if (event.visibility.kind === 'faction') {
    return state.players.get(view.playerId)?.faction === event.visibility.faction
  }
  return false
}

export function visibleEvents(
  events: readonly GameEvent[],
  view: SpectatorView,
  state: GameState,
  afterSequence = 0,
): GameEvent[] {
  return events.filter(
    (event) => event.sequence > afterSequence && canViewEvent(event, view, state),
  )
}

export function publiclyEliminatedPlayerIds(events: readonly GameEvent[]): ReadonlySet<PlayerId> {
  const eliminated = new Set<PlayerId>()
  for (const event of events) {
    if (event.visibility.kind !== 'public') continue
    if (event.payload.type === 'players.eliminated-publicly') {
      for (const playerId of event.payload.playerIds) eliminated.add(playerId)
      continue
    }
    if (
      event.payload.type === 'public.announcement' &&
      (event.payload.code === 'night-deaths' ||
        event.payload.code === 'player-eliminated' ||
        event.payload.code === 'werewolf-self-destruct')
    ) {
      for (const playerId of event.payload.playerIds) eliminated.add(playerId)
    }
  }
  return eliminated
}

export function visibleRoleId(
  playerId: PlayerId,
  view: SpectatorView,
  state: GameState,
  events: readonly GameEvent[],
): RoleId | null {
  const player = state.players.get(playerId)
  if (!player) return null
  if (view.kind === 'god') return player.roleId
  if (state.status === 'ended') return player.roleId
  const roleRevealed = events.some(
    (event) =>
      event.visibility.kind === 'public' &&
      event.payload.type === 'role.revealed' &&
      event.payload.playerId === playerId,
  )
  if (roleRevealed) return player.roleId
  const idiotRevealed = events.some(
    (event) => event.payload.type === 'idiot.revealed' && event.payload.playerId === playerId,
  )
  if (idiotRevealed) return player.roleId
  if (view.kind === 'player') {
    if (view.playerId === playerId) return player.roleId
    const viewer = state.players.get(view.playerId)
    if (viewer?.faction === 'werewolf' && player.faction === 'werewolf') return player.roleId
  }
  return null
}
