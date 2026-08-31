import type { Faction, GameEvent, PlayerId, RoleId } from '@agentwolf/contracts'
import { formatCopy, getCopy } from './catalog.js'
import { renderPluginEventNarration } from './plugin-events.js'
import { registeredEventNarration } from './classic-event-presentations.js'

export interface NarrationPlayer {
  readonly playerId: PlayerId
  readonly seat: number
  readonly name: string
}

export interface NarrationCatalog {
  readonly players: ReadonlyMap<PlayerId, NarrationPlayer>
  readonly roleName: (roleId: RoleId) => string
  readonly viewerPlayerId?: PlayerId
}

function playerLabel(playerId: PlayerId, catalog: NarrationCatalog): string {
  const player = catalog.players.get(playerId)
  if (!player) throw new Error(`Unknown narration player ${playerId}`)
  return formatCopy(getCopy('narration.playerLabel'), { seat: player.seat, name: player.name })
}

function playerList(playerIds: readonly PlayerId[], catalog: NarrationCatalog): string {
  return playerIds
    .map((playerId) => playerLabel(playerId, catalog))
    .join(getCopy('narration.listJoiner'))
}

function announcement(event: GameEvent, catalog: NarrationCatalog): string | null {
  if (event.payload.type !== 'public.announcement') return null
  const keys: Record<string, string> = {
    'player-eliminated': 'announcements.playerEliminated',
    'peaceful-night': 'announcements.peacefulNight',
    'night-deaths': 'announcements.nightDeaths',
    'no-exile': 'announcements.noExile',
    'idiot-survived': 'announcements.idiotSurvived',
    'werewolf-self-destruct': 'announcements.werewolfSelfDestruct',
    'white-wolf-detonation': 'announcements.whiteWolfDetonation',
  }
  const key = keys[event.payload.code]
  if (!key) return null
  return formatCopy(getCopy(key), {
    players: playerList(event.payload.playerIds, catalog),
    ...event.payload.params,
  })
}

function factionName(faction: Faction): string {
  return getCopy(`factions.${faction}`)
}

export function renderEventNarration(event: GameEvent, catalog: NarrationCatalog): string | null {
  const payload = event.payload
  const renderedAnnouncement = announcement(event, catalog)
  if (renderedAnnouncement) return renderedAnnouncement
  const renderedPluginEvent = renderPluginEventNarration(event, catalog)
  if (renderedPluginEvent) return renderedPluginEvent
  const registeredNarration = registeredEventNarration(event, catalog)
  if (registeredNarration) return registeredNarration
  switch (payload.type) {
    case 'night.started':
      return formatCopy(getCopy('narration.nightStarted'), { night: payload.night })
    case 'day.started':
      return formatCopy(getCopy('narration.dayStarted'), { day: payload.day })
    case 'phase.changed':
      return formatCopy(getCopy('narration.phaseChanged'), { phase: getCopy(payload.labelKey) })
    case 'speech.order-set':
      return formatCopy(getCopy('narration.speechOrder'), {
        players: playerList(payload.playerIds, catalog),
      })
    case 'speech.committed':
      return formatCopy(getCopy('narration.speech'), {
        player: playerLabel(payload.playerId, catalog),
        text: payload.text,
      })
    case 'sheriff.candidacy':
      return formatCopy(
        getCopy(
          payload.standing ? 'narration.sheriffCandidateJoined' : 'narration.sheriffCandidateLeft',
        ),
        { player: playerLabel(payload.playerId, catalog) },
      )
    case 'sheriff.elected':
      return formatCopy(getCopy('narration.sheriffElected'), {
        player: playerLabel(payload.playerId, catalog),
      })
    case 'sheriff.badge-lost':
      return getCopy('narration.sheriffBadgeLost')
    case 'sheriff.transferred':
      return payload.toPlayerId
        ? formatCopy(getCopy('narration.sheriffTransferred'), {
            fromPlayer: playerLabel(payload.fromPlayerId, catalog),
            toPlayer: playerLabel(payload.toPlayerId, catalog),
          })
        : formatCopy(getCopy('narration.sheriffDestroyed'), {
            fromPlayer: playerLabel(payload.fromPlayerId, catalog),
          })
    case 'vote.cast':
      return payload.targetId
        ? formatCopy(getCopy('narration.vote'), {
            voter: playerLabel(payload.voterId, catalog),
            target: playerLabel(payload.targetId, catalog),
          })
        : formatCopy(
            getCopy(
              payload.kind === 'wolf-kill' ? 'narration.wolfNoKillVote' : 'narration.abstain',
            ),
            {
              voter: playerLabel(payload.voterId, catalog),
            },
          )
    case 'vote.resolved': {
      const totals = Object.entries(payload.totals)
        .sort(([, left], [, right]) => right - left)
        .map(([playerId, total]) =>
          formatCopy(getCopy('narration.voteTotalEntry'), {
            player: playerLabel(playerId as PlayerId, catalog),
            total,
          }),
        )
        .join(getCopy('narration.listJoiner'))
      return formatCopy(getCopy('narration.voteResolved'), {
        totals: totals || getCopy('narration.noVotes'),
      })
    }
    case 'faction.members':
      if (payload.faction !== 'werewolf') return null
      if (catalog.viewerPlayerId && payload.playerIds.includes(catalog.viewerPlayerId)) {
        const teammates = payload.playerIds.filter(
          (playerId) => playerId !== catalog.viewerPlayerId,
        )
        return teammates.length > 0
          ? formatCopy(getCopy('narration.factionMembers'), {
              players: playerList(teammates, catalog),
            })
          : getCopy('narration.factionNoTeammates')
      }
      return formatCopy(getCopy('narration.werewolfMembers'), {
        players: playerList(payload.playerIds, catalog),
      })
    case 'role.assigned':
      return formatCopy(
        getCopy(
          catalog.viewerPlayerId === payload.playerId
            ? 'narration.roleAssigned'
            : 'narration.roleRevealed',
        ),
        {
          player: playerLabel(payload.playerId, catalog),
          role: catalog.roleName(payload.roleId),
        },
      )
    case 'role.cards-reserved':
      return formatCopy(getCopy('narration.roleCardsReserved'), {
        roles: payload.cards.map((card) => catalog.roleName(card.roleId)).join('、'),
      })
    case 'role.cards-revealed':
      return formatCopy(getCopy('narration.roleCardsRevealed'), {
        roles: payload.cards.map((card) => catalog.roleName(card.roleId)).join('、'),
      })
    case 'role.transformed':
      return formatCopy(getCopy('narration.roleTransformed'), {
        player: playerLabel(payload.playerId, catalog),
        role: catalog.roleName(payload.toRoleId),
      })
    case 'role.revealed':
      return formatCopy(getCopy('narration.roleRevealed'), {
        player: playerLabel(payload.playerId, catalog),
        role: catalog.roleName(payload.roleId),
      })
    case 'match.ended':
      return formatCopy(getCopy('narration.matchEnded'), { winner: factionName(payload.winner) })
    case 'match.paused':
      return formatCopy(getCopy('narration.matchPaused'), { reason: payload.reason })
    case 'match.resumed':
      return getCopy('narration.matchResumed')
    case 'day.interrupted':
      return getCopy('narration.dayInterrupted')
    case 'day.completed':
      return null
    default:
      return null
  }
}
