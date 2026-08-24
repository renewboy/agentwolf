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

function playerLabel(playerId: PlayerId, catalog: NarrationCatalog): string {
  const player = catalog.players.get(playerId)
  if (!player) throw new Error(`Unknown narration player ${playerId}`)
  return formatCopy(getCopy('narration.playerLabel'), { seat: player.seat, name: player.name })
}
