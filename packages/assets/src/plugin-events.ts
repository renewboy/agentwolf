import {
  PlayerIdSchema,
  PluginEventTypeSchema,
  PluginIdSchema,
  RoleIdSchema,
  type GameEvent,
  type PlayerId,
  type RoleEffectId,
} from '@agentwolf/contracts'
import { formatCopy, getCopy } from './catalog.js'
import type { NarrationCatalog } from './narration.js'

interface PluginEventEffect {
  readonly effectId: RoleEffectId
  readonly sourcePlayerIds: readonly PlayerId[]
  readonly targetPlayerIds: readonly PlayerId[]
  readonly variant: string | null
}

interface PluginEventPresentation {
  readonly pluginId: string
  readonly eventType: string
  playerIds(data: unknown): PlayerId[]
  narrate(data: unknown, catalog: NarrationCatalog): string
  effect(data: unknown): PluginEventEffect | null
}

const magicMirrorPluginId = PluginIdSchema.parse('plugin-role-magic-mirror-girl')
const magicMirrorEventType = PluginEventTypeSchema.parse('event-magic-mirror-inspected')
const whiteWolfPluginId = PluginIdSchema.parse('plugin-role-white-wolf-king')
const whiteWolfEventType = PluginEventTypeSchema.parse('event-white-wolf-detonated')
const awakenedHiddenWolfPluginId = PluginIdSchema.parse('plugin-role-awakened-hidden-wolf')
const awakenedHiddenWolfEventTypes = {
  learned: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-learned'),
  status: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-status'),
  inspected: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-inspected'),
  poisoned: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-poisoned'),
  protected: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-protected'),
  attacked: PluginEventTypeSchema.parse('event-awakened-hidden-wolf-attacked'),
} as const

const presentations: readonly PluginEventPresentation[] = [
  {
    pluginId: magicMirrorPluginId,
    eventType: magicMirrorEventType,
    playerIds: (data) => {
      const parsed = magicMirrorData(data)
      return [parsed.actorId, parsed.targetId]
    },
    narrate: (data, catalog) => {
      const parsed = magicMirrorData(data)
      return formatCopy(getCopy('narration.magicMirrorResult'), {
        player: playerLabel(parsed.targetId, catalog),
        role: catalog.roleName(parsed.roleId),
      })
    },
    effect: (data) => {
      const parsed = magicMirrorData(data)
      return {
        effectId: 'magic-mirror-inspect',
        sourcePlayerIds: [parsed.actorId],
        targetPlayerIds: [parsed.targetId],
        variant: parsed.roleId,
      }
    },
  },
  {
    pluginId: whiteWolfPluginId,
    eventType: whiteWolfEventType,
    playerIds: (data) => {
      const parsed = whiteWolfData(data)
      return [parsed.actorId, parsed.targetId]
    },
    narrate: (data, catalog) => {
      const parsed = whiteWolfData(data)
      return formatCopy(getCopy('narration.whiteWolfDetonation'), {
        actor: playerLabel(parsed.actorId, catalog),
        target: playerLabel(parsed.targetId, catalog),
      })
    },
    effect: (data) => {
      const parsed = whiteWolfData(data)
      return {
        effectId: 'white-wolf-detonate',
        sourcePlayerIds: [parsed.actorId],
        targetPlayerIds: [parsed.actorId, parsed.targetId],
        variant: null,
      }
    },
  },
  {
    pluginId: awakenedHiddenWolfPluginId,
    eventType: awakenedHiddenWolfEventTypes.learned,
    playerIds: (data) => {
      const parsed = awakenedRoleData(data)
      return [parsed.actorId, parsed.targetId]
    },
    narrate: (data, catalog) => {
      const parsed = awakenedRoleData(data)
      return formatCopy(getCopy('narration.awakenedHiddenWolfLearned'), {
        player: playerLabel(parsed.targetId, catalog),
        role: catalog.roleName(parsed.roleId),
      })
    },
    effect: (data) => {
      const parsed = awakenedRoleData(data)
      return {
        effectId: 'awakened-hidden-wolf-learn',
        sourcePlayerIds: [parsed.actorId],
        targetPlayerIds: [parsed.targetId],
        variant: parsed.roleId,
      }
    },
  },
  {
    pluginId: awakenedHiddenWolfPluginId,
    eventType: awakenedHiddenWolfEventTypes.status,
    playerIds: (data) => [awakenedStatusData(data).actorId],
    narrate: (data) =>
      getCopy(
        awakenedStatusData(data).armed
          ? 'narration.awakenedHiddenWolfArmed'
          : 'narration.awakenedHiddenWolfDormant',
      ),
    effect: () => null,
  },
  {
    pluginId: awakenedHiddenWolfPluginId,
    eventType: awakenedHiddenWolfEventTypes.inspected,
    playerIds: (data) => {
      const parsed = awakenedRoleData(data)
      return [parsed.actorId, parsed.targetId]
    },
    narrate: (data, catalog) => {
      const parsed = awakenedRoleData(data)
      return formatCopy(getCopy('narration.awakenedHiddenWolfInspected'), {
        player: playerLabel(parsed.targetId, catalog),
        role: catalog.roleName(parsed.roleId),
      })
    },
    effect: (data) => {
      const parsed = awakenedRoleData(data)
      return {
        effectId: 'awakened-hidden-wolf-inspect',
        sourcePlayerIds: [parsed.actorId],
        targetPlayerIds: [parsed.targetId],
        variant: parsed.roleId,
      }
    },
  },
  {
    pluginId: awakenedHiddenWolfPluginId,
    eventType: awakenedHiddenWolfEventTypes.poisoned,
    playerIds: (data) => {
      const parsed = awakenedTargetData(data)
      return [parsed.actorId, parsed.targetId]
    },
    narrate: (data, catalog) => {
      const parsed = awakenedTargetData(data)
      return formatCopy(getCopy('narration.awakenedHiddenWolfPoisoned'), {
        player: playerLabel(parsed.targetId, catalog),
      })
    },
    effect: (data) => targetEffect('awakened-hidden-wolf-poison', awakenedTargetData(data)),
  },
  {
    pluginId: awakenedHiddenWolfPluginId,
    eventType: awakenedHiddenWolfEventTypes.protected,
    playerIds: (data) => {
      const parsed = awakenedTargetData(data)
      return [parsed.actorId, parsed.targetId]
    },
    narrate: (data, catalog) => {
      const parsed = awakenedTargetData(data)
      return formatCopy(getCopy('narration.awakenedHiddenWolfProtected'), {
        player: playerLabel(parsed.targetId, catalog),
      })
    },
    effect: (data) => targetEffect('awakened-hidden-wolf-shield', awakenedTargetData(data)),
  },
  {
    pluginId: awakenedHiddenWolfPluginId,
    eventType: awakenedHiddenWolfEventTypes.attacked,
    playerIds: (data) => {
      const parsed = awakenedAttackData(data)
      return [parsed.actorId, ...parsed.targetIds]
    },
    narrate: (data, catalog) => {
      const parsed = awakenedAttackData(data)
      return formatCopy(getCopy('narration.awakenedHiddenWolfAttacked'), {
        players: parsed.targetIds.map((playerId) => playerLabel(playerId, catalog)).join('、'),
      })
    },
    effect: (data) => {
      const parsed = awakenedAttackData(data)
      return {
        effectId:
          parsed.targetIds.length === 2
            ? 'awakened-hidden-wolf-double-attack'
            : 'awakened-hidden-wolf-attack',
        sourcePlayerIds: [parsed.actorId],
        targetPlayerIds: parsed.targetIds,
        variant: parsed.targetIds.length === 2 ? 'double' : null,
      }
    },
  },
]

export function renderPluginEventNarration(
  event: GameEvent,
  catalog: NarrationCatalog,
): string | null {
  if (event.payload.type !== 'plugin.event') return null
  return definition(event.payload)?.narrate(event.payload.data, catalog) ?? null
}

export function pluginEventPlayerIds(event: GameEvent): PlayerId[] {
  if (event.payload.type !== 'plugin.event') return []
  return definition(event.payload)?.playerIds(event.payload.data) ?? []
}

export function pluginEventEffect(event: GameEvent): PluginEventEffect | null {
  if (event.payload.type !== 'plugin.event') return null
  return definition(event.payload)?.effect(event.payload.data) ?? null
}

function definition(payload: Extract<GameEvent['payload'], { type: 'plugin.event' }>) {
  return presentations.find(
    (entry) => entry.pluginId === payload.pluginId && entry.eventType === payload.eventType,
  )
}

function magicMirrorData(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Magic Mirror event data must be an object')
  }
  const record = data as Record<string, unknown>
  return {
    actorId: PlayerIdSchema.parse(record['actorId']),
    targetId: PlayerIdSchema.parse(record['targetId']),
    roleId: RoleIdSchema.parse(record['roleId']),
  }
}

function whiteWolfData(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('White Wolf event data must be an object')
  }
  const record = data as Record<string, unknown>
  return {
    actorId: PlayerIdSchema.parse(record['actorId']),
    targetId: PlayerIdSchema.parse(record['targetId']),
  }
}

function awakenedRoleData(data: unknown) {
  const record = pluginData(data, 'Awakened Hidden Wolf Role')
  return {
    actorId: PlayerIdSchema.parse(record['actorId']),
    targetId: PlayerIdSchema.parse(record['targetId']),
    roleId: RoleIdSchema.parse(record['roleId']),
  }
}

function awakenedStatusData(data: unknown) {
  const record = pluginData(data, 'Awakened Hidden Wolf status')
  if (typeof record['armed'] !== 'boolean') throw new Error('Invalid awakened status')
  return {
    actorId: PlayerIdSchema.parse(record['actorId']),
    armed: record['armed'],
  }
}

function awakenedTargetData(data: unknown) {
  const record = pluginData(data, 'Awakened Hidden Wolf target')
  return {
    actorId: PlayerIdSchema.parse(record['actorId']),
    targetId: PlayerIdSchema.parse(record['targetId']),
  }
}

function awakenedAttackData(data: unknown) {
  const record = pluginData(data, 'Awakened Hidden Wolf attack')
  if (!Array.isArray(record['targetIds'])) throw new Error('Invalid awakened attack targets')
  return {
    actorId: PlayerIdSchema.parse(record['actorId']),
    targetIds: record['targetIds'].map((targetId) => PlayerIdSchema.parse(targetId)),
  }
}

function pluginData(data: unknown, label: string): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label} event data must be an object`)
  }
  return data as Record<string, unknown>
}

function targetEffect(
  effectId: RoleEffectId,
  data: { readonly actorId: PlayerId; readonly targetId: PlayerId },
): PluginEventEffect {
  return {
    effectId,
    sourcePlayerIds: [data.actorId],
    targetPlayerIds: [data.targetId],
    variant: null,
  }
}

function playerLabel(playerId: PlayerId, catalog: NarrationCatalog): string {
  const player = catalog.players.get(playerId)
  if (!player) throw new Error(`Unknown narration player ${playerId}`)
  return formatCopy(getCopy('narration.playerLabel'), { seat: player.seat, name: player.name })
}
