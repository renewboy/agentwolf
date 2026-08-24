import { z } from 'zod'
import {
  AgentProfileSchema,
  AgentToolSchema,
  MatchIdSchema,
  PlayerActionSchema,
  PlayerIdSchema,
  type AgentProfile,
  type AgentTool,
  type MatchId,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'

const PendingPlayerActionSchema = z.object({
  deliveryId: z.string().min(1).max(160),
  action: PlayerActionSchema,
  acceptedAt: z.string().datetime(),
})

export const PlayerSessionBindingSchema = z.object({
  schemaVersion: z.literal(1),
  matchId: MatchIdSchema,
  playerId: PlayerIdSchema,
  profile: AgentProfileSchema,
  tool: AgentToolSchema,
  state: z.enum(['creating', 'active']),
  sessionId: z.string().min(1).max(320).nullable(),
  sessionGeneration: z.number().int().positive(),
  bootstrapState: z.enum(['pending', 'dispatched', 'acknowledged']),
  pendingAction: PendingPlayerActionSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type PlayerSessionBinding = z.infer<typeof PlayerSessionBindingSchema>

export interface ReservePlayerSessionBindingInput {
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly profile: AgentProfile
  readonly tool: AgentTool
  readonly sessionGeneration?: number
}

export function createPlayerSessionBinding(
  input: ReservePlayerSessionBindingInput,
  timestamp = new Date().toISOString(),
): PlayerSessionBinding {
  return PlayerSessionBindingSchema.parse({
    schemaVersion: 1,
    matchId: input.matchId,
    playerId: input.playerId,
    profile: input.profile,
    tool: input.tool,
    state: 'creating',
    sessionId: null,
    sessionGeneration: input.sessionGeneration ?? 1,
    bootstrapState: 'pending',
    pendingAction: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

export function withActivePlayerSession(
  binding: PlayerSessionBinding,
  sessionId: string,
  timestamp = new Date().toISOString(),
): PlayerSessionBinding {
  if (binding.state !== 'creating' || binding.sessionId !== null) {
    throw new Error(`Player Session ${binding.matchId}/${binding.playerId} is already active`)
  }
  return PlayerSessionBindingSchema.parse({
    ...binding,
    state: 'active',
    sessionId,
    updatedAt: timestamp,
  })
}

export function withBootstrapState(
  binding: PlayerSessionBinding,
  bootstrapState: PlayerSessionBinding['bootstrapState'],
  timestamp = new Date().toISOString(),
): PlayerSessionBinding {
  return PlayerSessionBindingSchema.parse({ ...binding, bootstrapState, updatedAt: timestamp })
}

export function withPendingPlayerAction(
  binding: PlayerSessionBinding,
  deliveryId: string,
  action: PlayerAction,
  timestamp = new Date().toISOString(),
): PlayerSessionBinding {
  if (action.matchId !== binding.matchId || action.actorId !== binding.playerId) {
    throw new Error(
      `Pending action ownership does not match ${binding.matchId}/${binding.playerId}`,
    )
  }
  if (binding.pendingAction && binding.pendingAction.deliveryId !== deliveryId) {
    throw new Error(
      `Player Session ${binding.matchId}/${binding.playerId} already has pending action ${binding.pendingAction.deliveryId}`,
    )
  }
  if (
    binding.pendingAction &&
    JSON.stringify(binding.pendingAction.action) !== JSON.stringify(action)
  ) {
    throw new Error(`Delivery ${deliveryId} already has a different accepted action`)
  }
  return PlayerSessionBindingSchema.parse({
    ...binding,
    pendingAction: { deliveryId, action, acceptedAt: timestamp },
    updatedAt: timestamp,
  })
}

export function withoutPendingPlayerAction(
  binding: PlayerSessionBinding,
  timestamp = new Date().toISOString(),
): PlayerSessionBinding {
  return PlayerSessionBindingSchema.parse({
    ...binding,
    pendingAction: null,
    updatedAt: timestamp,
  })
}
