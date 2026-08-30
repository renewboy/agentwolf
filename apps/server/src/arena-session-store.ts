import { createHash } from 'node:crypto'
import {
  DecisionIdSchema,
  GameActionSchema,
  MatchIdSchema as CoreMatchIdSchema,
  ParticipantIdSchema,
  type GameAction,
  type MatchId as CoreMatchId,
  type ParticipantId,
  type SessionBinding,
  type SessionBindingStore,
} from '@agent-arena/contracts'
import {
  MatchIdSchema,
  PlayerActionSchema,
  PlayerIdSchema,
  type MatchId,
  type PlayerId,
} from '@agentwolf/contracts'
import type { SqliteRepository } from './repository.js'

export class AgentWolfSessionBindingStore implements SessionBindingStore {
  public constructor(private readonly repository: SqliteRepository) {}

  public get(matchId: CoreMatchId, participantId: ParticipantId): SessionBinding | null {
    const binding = this.repository.playerSessions.get(
      MatchIdSchema.parse(matchId),
      PlayerIdSchema.parse(participantId),
    )
    if (!binding) return null
    return {
      matchId: CoreMatchIdSchema.parse(binding.matchId),
      participantId: ParticipantIdSchema.parse(binding.playerId),
      state: binding.state,
      sessionId: binding.sessionId,
      sessionGeneration: binding.sessionGeneration,
      bootstrapState: binding.bootstrapState,
      pendingAction: binding.pendingAction
        ? {
            decisionId: decisionForDelivery(binding.pendingAction.deliveryId),
            action: corePendingAction(
              binding.matchId,
              binding.playerId,
              decisionForDelivery(binding.pendingAction.deliveryId),
              binding.pendingAction.action,
            ),
            acceptedAt: binding.pendingAction.acceptedAt,
          }
        : null,
    }
  }

  public put(binding: SessionBinding): SessionBinding {
    const matchId = MatchIdSchema.parse(binding.matchId)
    const playerId = PlayerIdSchema.parse(binding.participantId)
    let current = this.repository.playerSessions.get(matchId, playerId)
    if (!current) throw new Error(`AgentWolf provisions Session bindings before Core adaptation`)
    if (current.state === 'creating' && binding.state === 'active' && binding.sessionId) {
      current = this.repository.playerSessions.activate(matchId, playerId, binding.sessionId)
    }
    if (current.bootstrapState !== binding.bootstrapState) {
      current = this.repository.playerSessions.markBootstrap(
        matchId,
        playerId,
        binding.bootstrapState,
      )
    }
    if (binding.pendingAction === null && current.pendingAction) {
      current = this.repository.playerSessions.clearPendingAction(matchId, playerId)
    } else if (binding.pendingAction) {
      const action = PlayerActionSchema.parse(binding.pendingAction.action.payload)
      current = this.saveProductPending(matchId, playerId, binding.pendingAction.decisionId, action)
    }
    return this.get(current.matchId, ParticipantIdSchema.parse(current.playerId))!
  }

  public savePendingAction(
    matchId: CoreMatchId,
    participantId: ParticipantId,
    decisionId: ReturnType<typeof DecisionIdSchema.parse>,
    action: GameAction,
  ): SessionBinding {
    const productMatchId = MatchIdSchema.parse(matchId)
    const playerId = PlayerIdSchema.parse(participantId)
    this.saveProductPending(
      productMatchId,
      playerId,
      decisionId,
      PlayerActionSchema.parse(action.payload),
    )
    return this.get(matchId, participantId)!
  }

  public clearPendingAction(matchId: CoreMatchId, participantId: ParticipantId): SessionBinding {
    this.repository.playerSessions.clearPendingAction(
      MatchIdSchema.parse(matchId),
      PlayerIdSchema.parse(participantId),
    )
    return this.get(matchId, participantId)!
  }

  public deleteMatch(): void {
    throw new Error('AgentWolf MatchManager owns Session binding deletion through Match cascade')
  }

  private saveProductPending(
    matchId: MatchId,
    playerId: PlayerId,
    decisionId: ReturnType<typeof DecisionIdSchema.parse>,
    action: ReturnType<typeof PlayerActionSchema.parse>,
  ) {
    const current = this.repository.playerSessions.get(matchId, playerId)
    if (!current) throw new Error(`Missing Player Session binding for ${matchId}/${playerId}`)
    if (
      current.pendingAction &&
      JSON.stringify(current.pendingAction.action) === JSON.stringify(action)
    ) {
      return current
    }
    return this.repository.playerSessions.savePendingAction(matchId, playerId, decisionId, action)
  }
}

function decisionForDelivery(deliveryId: string) {
  const parsed = DecisionIdSchema.safeParse(deliveryId)
  return parsed.success
    ? parsed.data
    : DecisionIdSchema.parse(
        `decision-legacy-${createHash('sha256').update(deliveryId).digest('hex').slice(0, 16)}`,
      )
}

function corePendingAction(
  matchId: MatchId,
  playerId: PlayerId,
  decisionId: ReturnType<typeof DecisionIdSchema.parse>,
  action: ReturnType<typeof PlayerActionSchema.parse>,
) {
  return GameActionSchema.parse({
    matchId: CoreMatchIdSchema.parse(matchId),
    decisionId,
    actorId: ParticipantIdSchema.parse(playerId),
    actionType: action.type,
    payload: JSON.parse(JSON.stringify(action)),
  })
}
