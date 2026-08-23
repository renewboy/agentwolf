import type { AgentProfileId, GameEvent, MatchId, PlayerId } from '@agentwolf/contracts'
import type { BoardManifest, GameState, PlayerState } from './types.js'

export function emptyGameState(matchId: MatchId, board: BoardManifest): GameState {
  return {
    matchId,
    boardId: board.id,
    status: 'draft',
    day: 0,
    night: 0,
    phaseId: null,
    phaseLabelKey: '',
    players: new Map(),
    sheriff: {
      enabled: board.sheriff,
      holderId: null,
      badgeLost: false,
      initialCandidates: new Set(),
      standingCandidates: new Set(),
    },
    pendingDeaths: new Map(),
    recentDeaths: new Map(),
    phaseActions: [],
    phaseActors: [],
    completedActors: new Set(),
    speechOrder: [],
    lastVote: null,
    nightAttackTargetId: null,
    interruptToNight: false,
    lastSequence: 0,
    winner: null,
    pausedReason: null,
  }
}

function updatePlayer(
  players: ReadonlyMap<PlayerId, PlayerState>,
  playerId: PlayerId,
  update: (player: PlayerState) => PlayerState,
): ReadonlyMap<PlayerId, PlayerState> {
  const current = players.get(playerId)
  if (!current) {
    throw new Error(`Event references unknown player ${playerId}`)
  }
  const next = new Map(players)
  next.set(playerId, update(current))
  return next
}

export function reduceGameEvent(state: GameState, event: GameEvent): GameState {
  const payload = event.payload
  let next: GameState = { ...state, lastSequence: event.sequence }
  switch (payload.type) {
    case 'match.created': {
      const players = new Map<PlayerId, PlayerState>()
      for (const player of payload.players) {
        players.set(player.playerId, {
          id: player.playerId,
          seat: player.seat,
          name: player.name,
          profileId: player.profileId,
          roleId: null,
          faction: null,
          alive: true,
          canVote: true,
          roleState: { abilityUses: {}, memory: {} },
        })
      }
      next = { ...next, players }
      break
    }
    case 'role.assigned':
      next = {
        ...next,
        players: updatePlayer(next.players, payload.playerId, (player) => ({
          ...player,
          roleId: payload.roleId,
          faction: payload.faction,
        })),
      }
      break
    case 'match.starting':
      next = { ...next, status: 'starting' }
      break
    case 'match.started':
      next = { ...next, status: 'running' }
      break
    case 'night.started':
      next = {
        ...next,
        night: payload.night,
        pendingDeaths: new Map(),
        recentDeaths: new Map(),
        nightAttackTargetId: null,
        interruptToNight: false,
      }
      break
    case 'day.started':
      next = { ...next, day: payload.day }
      break
    case 'phase.changed':
      next = {
        ...next,
        day: payload.day,
        phaseId: payload.phaseId,
        phaseLabelKey: payload.labelKey,
        phaseActions: [],
        phaseActors: [],
        completedActors: new Set(),
      }
      break
    case 'phase.actors-set':
      next = { ...next, phaseActors: payload.playerIds, completedActors: new Set() }
      break
    case 'phase.actor-completed': {
      const completedActors = new Set(next.completedActors)
      completedActors.add(payload.playerId)
      next = { ...next, completedActors }
      break
    }
    case 'speech.order-set':
      next = { ...next, speechOrder: payload.playerIds }
      break
    case 'action.submitted':
      next = { ...next, phaseActions: [...next.phaseActions, payload.action] }
      break
    case 'sheriff.candidacy': {
      const initialCandidates = new Set(next.sheriff.initialCandidates)
      const standingCandidates = new Set(next.sheriff.standingCandidates)
      if (payload.initialCandidate) initialCandidates.add(payload.playerId)
      if (payload.standing) standingCandidates.add(payload.playerId)
      else standingCandidates.delete(payload.playerId)
      next = {
        ...next,
        sheriff: { ...next.sheriff, initialCandidates, standingCandidates },
      }
      break
    }
    case 'sheriff.elected':
      next = { ...next, sheriff: { ...next.sheriff, holderId: payload.playerId } }
      break
    case 'sheriff.badge-lost':
      next = {
        ...next,
        sheriff: { ...next.sheriff, holderId: null, badgeLost: true },
      }
      break
    case 'sheriff.transferred':
      next = {
        ...next,
        sheriff: {
          ...next.sheriff,
          holderId: payload.toPlayerId,
          badgeLost: payload.toPlayerId === null,
        },
      }
      break
    case 'death.pending': {
      const pendingDeaths = new Map(next.pendingDeaths)
      const previous = pendingDeaths.get(payload.playerId)
      pendingDeaths.set(payload.playerId, {
        playerId: payload.playerId,
        causes: [...new Set([...(previous?.causes ?? []), ...payload.causes])],
      })
      next = { ...next, pendingDeaths }
      break
    }
    case 'death.cancelled': {
      const pendingDeaths = new Map(next.pendingDeaths)
      pendingDeaths.delete(payload.playerId)
      next = { ...next, pendingDeaths }
      break
    }
    case 'death.window-closed':
      next = { ...next, recentDeaths: new Map() }
      break
    case 'day.interrupted':
      next = { ...next, interruptToNight: true }
      break
    case 'day.completed':
      next = { ...next, interruptToNight: true }
      break
    case 'player.died': {
      const pendingDeaths = new Map(next.pendingDeaths)
      pendingDeaths.delete(payload.playerId)
      const recentDeaths = new Map(next.recentDeaths)
      recentDeaths.set(payload.playerId, { playerId: payload.playerId, causes: payload.causes })
      next = {
        ...next,
        pendingDeaths,
        recentDeaths,
        players: updatePlayer(next.players, payload.playerId, (player) => ({
          ...player,
          alive: false,
          canVote: false,
        })),
      }
      break
    }
    case 'idiot.revealed':
      next = {
        ...next,
        players: updatePlayer(next.players, payload.playerId, (player) => ({
          ...player,
          canVote: false,
          roleState: {
            ...player.roleState,
            memory: { ...player.roleState.memory, 'idiot.revealed': true },
          },
        })),
      }
      break
    case 'guard.protected':
      next = {
        ...next,
        players: updatePlayer(next.players, payload.actorId, (player) => ({
          ...player,
          roleState: {
            ...player.roleState,
            memory: { ...player.roleState.memory, 'guard.lastTarget': payload.targetId },
          },
        })),
      }
      break
    case 'ability.used':
      next = {
        ...next,
        players: updatePlayer(next.players, payload.playerId, (player) => ({
          ...player,
          roleState: {
            ...player.roleState,
            abilityUses: {
              ...player.roleState.abilityUses,
              [payload.abilityId]: payload.count,
            },
          },
        })),
      }
      break
    case 'match.paused':
      next = { ...next, status: 'paused', pausedReason: payload.reason }
      break
    case 'match.resumed':
      next = { ...next, status: 'running', pausedReason: null }
      break
    case 'match.ended':
      next = { ...next, status: 'ended', winner: payload.winner }
      break
    case 'vote.resolved':
      next = {
        ...next,
        lastVote: {
          kind: payload.kind,
          selectedPlayerId: payload.selectedPlayerId,
          tiedPlayerIds: payload.tiedPlayerIds,
          totals: payload.totals,
        },
      }
      break
    case 'night.attack-selected':
      next = { ...next, nightAttackTargetId: payload.targetId }
      break
    case 'speech.started':
    case 'speech.committed':
    case 'speech.sanitized':
    case 'faction.members':
    case 'role.revealed':
    case 'vote.cast':
    case 'witch.potion-used':
    case 'seer.inspected':
    case 'player.saved':
    case 'hunter.shot':
    case 'public.announcement':
    case 'delivery.started':
    case 'delivery.acknowledged':
      break
    default: {
      const exhaustive: never = payload
      return exhaustive
    }
  }
  return next
}

export function replayGame(
  matchId: MatchId,
  board: BoardManifest,
  events: readonly GameEvent[],
): GameState {
  return events.reduce(reduceGameEvent, emptyGameState(matchId, board))
}

export interface CreatePlayerInput {
  readonly playerId: PlayerId
  readonly seat: number
  readonly name: string
  readonly profileId: AgentProfileId
}
