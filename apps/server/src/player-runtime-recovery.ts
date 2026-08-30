import type { SessionUpdate } from '@agentclientprotocol/sdk'
import type { PlayerRuntimeOptions } from './player-runtime-types.js'

export function adoptLegacyPlayerSession(options: PlayerRuntimeOptions) {
  const turns = options.repository.listTrajectoryTurns(options.matchId, options.playerId)
  const latest = turns.at(-1)
  if (!latest) {
    throw new Error(`Player ${options.playerId} has no durable ACP Session binding to resume`)
  }
  const binding = options.repository.playerSessions.adopt({
    matchId: options.matchId,
    playerId: options.playerId,
    profile: options.profile,
    tool: options.tool,
    sessionGeneration: latest.sessionGeneration,
    sessionId: latest.sessionId,
  })
  options.repository.playerSessions.markBootstrap(options.matchId, options.playerId, 'acknowledged')
  return binding
}

export function terminalToolUpdate(update: SessionUpdate): boolean {
  if (update.sessionUpdate !== 'tool_call' && update.sessionUpdate !== 'tool_call_update') {
    return false
  }
  return update.status === 'completed' || update.status === 'failed'
}
