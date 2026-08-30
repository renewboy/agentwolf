import { z } from 'zod'
import { PlayerActionSchema } from './actions.js'
import {
  AbilityIdSchema,
  BoardIdSchema,
  CapabilityIdSchema,
  EventSequenceSchema,
  AgentProfileIdSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PluginEventTypeSchema,
  PluginIdSchema,
  PlayerIdSchema,
  RoleIdSchema,
} from './ids.js'
import { JsonValueSchema } from './plugins.js'

export const FactionSchema = z.enum(['village', 'werewolf', 'independent'])
export type Faction = z.infer<typeof FactionSchema>

export const DeathTimingSchema = z.enum(['day', 'night'])
export type DeathTiming = z.infer<typeof DeathTimingSchema>

export const EventVisibilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('public') }),
  z.object({ kind: z.literal('god') }),
  z.object({ kind: z.literal('players'), playerIds: z.array(PlayerIdSchema).min(1) }),
  z.object({ kind: z.literal('faction'), faction: FactionSchema }),
])
export type EventVisibility = z.infer<typeof EventVisibilitySchema>

const PlayerRefSchema = z.object({
  playerId: PlayerIdSchema,
  seat: z.number().int().positive(),
  name: z.string().min(1),
  profileId: AgentProfileIdSchema,
})

export const GameEventPayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('match.created'),
    boardId: BoardIdSchema,
    players: z.array(PlayerRefSchema),
  }),
  z.object({
    type: z.literal('role.assigned'),
    playerId: PlayerIdSchema,
    roleId: RoleIdSchema,
    faction: FactionSchema,
  }),
  z.object({
    type: z.literal('role.revealed'),
    playerId: PlayerIdSchema,
    roleId: RoleIdSchema,
  }),
  z.object({
    type: z.literal('faction.members'),
    faction: FactionSchema,
    playerIds: z.array(PlayerIdSchema),
  }),
  z.object({
    type: z.literal('match.started'),
    startedAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal('match.starting'),
  }),
  z.object({
    type: z.literal('night.started'),
    night: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('day.started'),
    day: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('phase.changed'),
    phaseId: PhaseIdSchema,
    day: z.number().int().nonnegative(),
    labelKey: z.string(),
  }),
  z.object({
    type: z.literal('phase.actors-set'),
    phaseId: PhaseIdSchema,
    playerIds: z.array(PlayerIdSchema),
    mode: z.enum(['parallel', 'sequential']),
  }),
  z.object({
    type: z.literal('phase.actor-completed'),
    phaseId: PhaseIdSchema,
    playerId: PlayerIdSchema,
  }),
  z.object({
    type: z.literal('speech.order-set'),
    kind: z.enum(['day', 'sheriff', 'runoff', 'last-words', 'wolf-council']),
    playerIds: z.array(PlayerIdSchema),
    basis: z.enum(['night-death', 'sheriff', 'random']).optional(),
    anchorPlayerId: PlayerIdSchema.nullable().optional(),
    direction: z.enum(['clockwise', 'counterclockwise']).optional(),
  }),
  z.object({
    type: z.literal('speech.started'),
    playerId: PlayerIdSchema,
    kind: z.string(),
  }),
  z.object({
    type: z.literal('speech.committed'),
    playerId: PlayerIdSchema,
    kind: z.string(),
    text: z.string(),
    sanitized: z.boolean(),
  }),
  z.object({
    type: z.literal('speech.sanitized'),
    playerId: PlayerIdSchema,
    replacements: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('action.submitted'),
    playerId: PlayerIdSchema,
    action: PlayerActionSchema,
  }),
  z.object({
    type: z.literal('plugin.event'),
    pluginId: PluginIdSchema,
    eventType: PluginEventTypeSchema,
    schemaVersion: z.number().int().positive(),
    data: JsonValueSchema,
  }),
  z.object({
    type: z.literal('sheriff.candidacy'),
    playerId: PlayerIdSchema,
    standing: z.boolean(),
    initialCandidate: z.boolean(),
  }),
  z.object({
    type: z.literal('sheriff.elected'),
    playerId: PlayerIdSchema,
  }),
  z.object({
    type: z.literal('sheriff.badge-lost'),
    reason: z.string(),
  }),
  z.object({
    type: z.literal('sheriff.transferred'),
    fromPlayerId: PlayerIdSchema,
    toPlayerId: PlayerIdSchema.nullable(),
  }),
  z.object({
    type: z.literal('vote.cast'),
    voterId: PlayerIdSchema,
    targetId: PlayerIdSchema.nullable(),
    kind: z.string(),
    weight: z.number().positive(),
  }),
  z.object({
    type: z.literal('vote.resolved'),
    kind: z.string(),
    totals: z.record(z.string(), z.number()),
    tiedPlayerIds: z.array(PlayerIdSchema),
    selectedPlayerId: PlayerIdSchema.nullable(),
  }),
  z.object({
    type: z.literal('night.attack-selected'),
    targetId: PlayerIdSchema.nullable(),
  }),
  z.object({
    type: z.literal('guard.protected'),
    actorId: PlayerIdSchema,
    targetId: PlayerIdSchema.nullable(),
  }),
  z.object({
    type: z.literal('witch.potion-used'),
    actorId: PlayerIdSchema,
    potion: z.enum(['antidote', 'poison']),
    targetId: PlayerIdSchema,
  }),
  z.object({
    type: z.literal('seer.inspected'),
    actorId: PlayerIdSchema,
    targetId: PlayerIdSchema,
    result: z.enum(['village', 'werewolf']),
  }),
  z.object({
    type: z.literal('death.pending'),
    playerId: PlayerIdSchema,
    causes: z.array(z.string()).min(1),
    timing: DeathTimingSchema,
  }),
  z.object({
    type: z.literal('death.cancelled'),
    playerId: PlayerIdSchema,
    reason: z.string(),
  }),
  z.object({
    type: z.literal('exile.prevented'),
    playerId: PlayerIdSchema,
    reason: z.string(),
  }),
  z.object({
    type: z.literal('death.window-closed'),
  }),
  z.object({
    type: z.literal('day.interrupted'),
    reason: z.literal('self-destruct'),
  }),
  z.object({
    type: z.literal('day.completed'),
  }),
  z.object({
    type: z.literal('player.died'),
    playerId: PlayerIdSchema,
    causes: z.array(z.string()).min(1),
    announced: z.boolean(),
    timing: DeathTimingSchema,
  }),
  z.object({
    type: z.literal('players.eliminated-publicly'),
    playerIds: z.array(PlayerIdSchema).min(1),
  }),
  z.object({
    type: z.literal('ability.used'),
    playerId: PlayerIdSchema,
    abilityId: AbilityIdSchema,
    count: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('capability.granted'),
    playerId: PlayerIdSchema,
    capabilityId: CapabilityIdSchema,
  }),
  z.object({
    type: z.literal('capability.revoked'),
    playerId: PlayerIdSchema,
    capabilityId: CapabilityIdSchema,
  }),
  z.object({
    type: z.literal('player.saved'),
    playerId: PlayerIdSchema,
    reason: z.string(),
  }),
  z.object({
    type: z.literal('idiot.revealed'),
    playerId: PlayerIdSchema,
  }),
  z.object({
    type: z.literal('hunter.shot'),
    playerId: PlayerIdSchema,
    targetId: PlayerIdSchema,
  }),
  z.object({
    type: z.literal('public.announcement'),
    code: z.string(),
    playerIds: z.array(PlayerIdSchema),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  }),
  z.object({
    type: z.literal('delivery.started'),
    playerId: PlayerIdSchema,
    deliveryId: z.string(),
    fromSequence: z.number().int().nonnegative(),
    toSequence: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('delivery.acknowledged'),
    playerId: PlayerIdSchema,
    deliveryId: z.string(),
    toSequence: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('match.paused'),
    reason: z.string(),
    playerId: PlayerIdSchema.optional(),
  }),
  z.object({
    type: z.literal('match.resumed'),
  }),
  z.object({
    type: z.literal('match.ended'),
    winner: FactionSchema,
    winningPlayerIds: z.array(PlayerIdSchema).min(1),
    reason: z.string(),
  }),
])
export type GameEventPayload = z.infer<typeof GameEventPayloadSchema>

export const coreGameEventTypes = [
  'match.created',
  'role.assigned',
  'role.revealed',
  'faction.members',
  'match.started',
  'match.starting',
  'night.started',
  'day.started',
  'phase.changed',
  'phase.actors-set',
  'phase.actor-completed',
  'speech.order-set',
  'speech.started',
  'speech.committed',
  'speech.sanitized',
  'action.submitted',
  'plugin.event',
  'sheriff.candidacy',
  'sheriff.elected',
  'sheriff.badge-lost',
  'sheriff.transferred',
  'vote.cast',
  'vote.resolved',
  'night.attack-selected',
  'guard.protected',
  'witch.potion-used',
  'seer.inspected',
  'death.pending',
  'death.cancelled',
  'exile.prevented',
  'death.window-closed',
  'day.interrupted',
  'day.completed',
  'player.died',
  'players.eliminated-publicly',
  'ability.used',
  'capability.granted',
  'capability.revoked',
  'player.saved',
  'idiot.revealed',
  'hunter.shot',
  'public.announcement',
  'delivery.started',
  'delivery.acknowledged',
  'match.paused',
  'match.resumed',
  'match.ended',
] as const satisfies readonly GameEventPayload['type'][]

export const GameEventSchema = z.object({
  matchId: MatchIdSchema,
  sequence: EventSequenceSchema,
  occurredAt: z.string().datetime(),
  visibility: EventVisibilitySchema,
  payload: GameEventPayloadSchema,
})
export type GameEvent = z.infer<typeof GameEventSchema>
