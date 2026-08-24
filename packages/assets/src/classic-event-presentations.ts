import type { GameEvent, PlayerId, RoleEffectId } from '@agentwolf/contracts'
import { formatCopy, getCopy } from './catalog.js'
import type { NarrationCatalog } from './narration.js'

export interface RegisteredEventEffect {
  readonly effectId: RoleEffectId
  readonly sourcePlayerIds: readonly PlayerId[]
  readonly targetPlayerIds: readonly PlayerId[]
  readonly variant: string | null
}

interface ClassicEventPresentation {
  matches(event: GameEvent): boolean
  playerIds?(event: GameEvent): PlayerId[]
  narrate?(event: GameEvent, catalog: NarrationCatalog): string | null
  timeline?(event: GameEvent, catalog: NarrationCatalog): string | null
  effect?(event: GameEvent): RegisteredEventEffect | null
}

const presentations: readonly ClassicEventPresentation[] = [
  {
    matches: (event) => event.payload.type === 'night.attack-selected',
    narrate: (event, catalog) => {
      if (event.payload.type !== 'night.attack-selected') return null
      return event.payload.targetId
        ? formatCopy(getCopy('narration.nightAttackSelected'), {
            player: playerLabel(event.payload.targetId, catalog),
          })
        : getCopy('narration.nightAttackPassed')
    },
    timeline: (event, catalog) => {
      if (event.payload.type !== 'night.attack-selected') return null
      return event.payload.targetId
        ? formatCopy(getCopy('timeline.nightAttack'), {
            player: playerLabel(event.payload.targetId, catalog),
          })
        : getCopy('timeline.nightAttackPassed')
    },
    effect: (event) => {
      if (event.payload.type !== 'night.attack-selected' || !event.payload.targetId) return null
      return {
        effectId: 'werewolf-attack',
        sourcePlayerIds: [],
        targetPlayerIds: [event.payload.targetId],
        variant: null,
      }
    },
  },
  {
    matches: (event) =>
      event.payload.type === 'player.died' && event.payload.causes.includes('self-destruct'),
    effect: (event) => {
      if (event.payload.type !== 'player.died') return null
      return {
        effectId: 'werewolf-self-destruct',
        sourcePlayerIds: [event.payload.playerId],
        targetPlayerIds: [event.payload.playerId],
        variant: null,
      }
    },
  },
  {
    matches: (event) => event.payload.type === 'guard.protected',
    playerIds: actorAndTarget,
    narrate: (event, catalog) => {
      if (event.payload.type !== 'guard.protected') return null
      return event.payload.targetId
        ? formatCopy(getCopy('narration.guardProtected'), {
            player: playerLabel(event.payload.targetId, catalog),
          })
        : getCopy('narration.guardPassed')
    },
    timeline: (event, catalog) => {
      if (event.payload.type !== 'guard.protected') return null
      return event.payload.targetId
        ? formatCopy(getCopy('timeline.guardProtected'), {
            player: playerLabel(event.payload.targetId, catalog),
          })
        : getCopy('timeline.guardPassed')
    },
    effect: (event) => {
      if (event.payload.type !== 'guard.protected' || !event.payload.targetId) return null
      return {
        effectId: 'guard-protect',
        sourcePlayerIds: [event.payload.actorId],
        targetPlayerIds: [event.payload.targetId],
        variant: null,
      }
    },
  },
  {
    matches: (event) => event.payload.type === 'witch.potion-used',
    playerIds: actorAndTarget,
    narrate: (event, catalog) => {
      if (event.payload.type !== 'witch.potion-used') return null
      return formatCopy(
        getCopy(
          event.payload.potion === 'antidote'
            ? 'narration.witchAntidoteUsed'
            : 'narration.witchPoisonUsed',
        ),
        { player: playerLabel(event.payload.targetId, catalog) },
      )
    },
    timeline: (event, catalog) => {
      if (event.payload.type !== 'witch.potion-used') return null
      return formatCopy(
        getCopy(
          event.payload.potion === 'antidote' ? 'timeline.witchAntidote' : 'timeline.witchPoison',
        ),
        { player: playerLabel(event.payload.targetId, catalog) },
      )
    },
    effect: (event) => {
      if (event.payload.type !== 'witch.potion-used') return null
      return {
        effectId: event.payload.potion === 'antidote' ? 'witch-antidote' : 'witch-poison',
        sourcePlayerIds: [event.payload.actorId],
        targetPlayerIds: [event.payload.targetId],
        variant: event.payload.potion,
      }
    },
  },
  {
    matches: (event) => event.payload.type === 'seer.inspected',
    playerIds: actorAndTarget,
    narrate: (event, catalog) => {
      if (event.payload.type !== 'seer.inspected') return null
      return formatCopy(
        getCopy(
          event.payload.result === 'werewolf'
            ? 'narration.seerResultWerewolf'
            : 'narration.seerResultVillage',
        ),
        { player: playerLabel(event.payload.targetId, catalog) },
      )
    },
    effect: (event) => {
      if (event.payload.type !== 'seer.inspected') return null
      return {
        effectId: 'seer-inspect',
        sourcePlayerIds: [event.payload.actorId],
        targetPlayerIds: [event.payload.targetId],
        variant: event.payload.result,
      }
    },
  },
  {
    matches: (event) => event.payload.type === 'hunter.shot',
    playerIds: (event) =>
      event.payload.type === 'hunter.shot' ? [event.payload.playerId, event.payload.targetId] : [],
    narrate: hunterNarration,
    timeline: hunterNarration,
    effect: (event) => {
      if (event.payload.type !== 'hunter.shot') return null
      return {
        effectId: 'hunter-shot',
        sourcePlayerIds: [event.payload.playerId],
        targetPlayerIds: [event.payload.targetId],
        variant: null,
      }
    },
  },
  {
    matches: (event) => event.payload.type === 'idiot.revealed',
    playerIds: (event) => (event.payload.type === 'idiot.revealed' ? [event.payload.playerId] : []),
    timeline: (event, catalog) =>
      event.payload.type === 'idiot.revealed'
        ? formatCopy(getCopy('timeline.idiotRevealed'), {
            player: playerLabel(event.payload.playerId, catalog),
          })
        : null,
    effect: (event) =>
      event.payload.type === 'idiot.revealed'
        ? {
            effectId: 'idiot-reveal',
            sourcePlayerIds: [event.payload.playerId],
            targetPlayerIds: [event.payload.playerId],
            variant: null,
          }
        : null,
  },
]

export function registeredEventNarration(
  event: GameEvent,
  catalog: NarrationCatalog,
): string | null {
  return presentation(event)?.narrate?.(event, catalog) ?? null
}

export function registeredTimelineNarration(
  event: GameEvent,
  catalog: NarrationCatalog,
): string | null {
  const definition = presentation(event)
  return definition?.timeline?.(event, catalog) ?? definition?.narrate?.(event, catalog) ?? null
}

export function registeredEventPlayerIds(event: GameEvent): PlayerId[] | null {
  const definition = presentation(event)
  return definition?.playerIds ? definition.playerIds(event) : null
}

export function registeredEventEffect(event: GameEvent): RegisteredEventEffect | null {
  return presentation(event)?.effect?.(event) ?? null
}

function presentation(event: GameEvent): ClassicEventPresentation | undefined {
  return presentations.find((definition) => definition.matches(event))
}

function actorAndTarget(event: GameEvent): PlayerId[] {
  if (
    event.payload.type !== 'guard.protected' &&
    event.payload.type !== 'witch.potion-used' &&
    event.payload.type !== 'seer.inspected'
  ) {
    return []
  }
  return [event.payload.actorId, ...(event.payload.targetId ? [event.payload.targetId] : [])]
}

function hunterNarration(event: GameEvent, catalog: NarrationCatalog): string | null {
  return event.payload.type === 'hunter.shot'
    ? formatCopy(getCopy('narration.hunterShot'), {
        player: playerLabel(event.payload.playerId, catalog),
        target: playerLabel(event.payload.targetId, catalog),
      })
    : null
}

function playerLabel(playerId: PlayerId, catalog: NarrationCatalog): string {
  const player = catalog.players.get(playerId)
  if (!player) throw new Error(`Unknown narration player ${playerId}`)
  return formatCopy(getCopy('narration.playerLabel'), { seat: player.seat, name: player.name })
}
