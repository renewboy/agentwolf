import { PlayerIdSchema, type PlayerId } from '@agentwolf/contracts'
import { coreActionFor } from '@agentwolf/game-engine'
import { MatchOrchestrator, type ParticipantTurnDriver } from '@agent-arena/match-runtime'
import type { AgentWolfArenaFacts } from '@agentwolf/game-engine'
import type { MatchTurnLoopOptions } from './match-turn-loop.js'

export async function runCoreMatchTurn(
  options: MatchTurnLoopOptions,
): Promise<'continue' | 'disposed'> {
  const turn = options.engine.currentTurn()
  if (!turn || turn.actors.length === 0) {
    throw new Error(
      `Rule engine stopped without an actionable turn at ${options.engine.state.phaseId}`,
    )
  }
  const machine = options.arena.module.wrap(options.engine)
  const prepared = new Map<PlayerId, Awaited<ReturnType<typeof options.prepareActorTurn>>>()
  const driver: ParticipantTurnDriver<AgentWolfArenaFacts> = {
    takeTurn: async (context) => {
      const playerId = PlayerIdSchema.parse(context.participantId)
      const actor = await options.prepareActorTurn(playerId, turn)
      prepared.set(playerId, actor)
      const action = await options.takeActorTurn(actor, turn)
      if (options.engine.state.phaseId !== turn.phaseId) {
        throw new MatchTurnSupersededError()
      }
      context.gateway.submitTool(
        context.token,
        action.type === turn.actionType ? 'submit_action' : 'submit_interrupt',
        coreActionFor(context.boundary, action).payload,
      )
    },
  }
  const orchestrator = new MatchOrchestrator({
    module: options.arena.module,
    machine,
    driver,
    sessions: options.arenaSessions,
    beforeSubmit: () => {
      if (options.isDisposed()) throw new MatchTurnDisposedError()
    },
    onEvents: () => {
      options.record(machine.takeOriginalEvents())
    },
  })
  try {
    const result = await orchestrator.runDecision()
    if (!result) throw new Error(`Match ${options.engine.state.matchId} has no Core decision`)
    for (const action of result.actions) {
      const playerId = PlayerIdSchema.parse(action.actorId)
      options.playerRuntime(playerId)?.actionSettled()
      prepared.delete(playerId)
    }
    options.broadcastSnapshot()
    return 'continue'
  } catch (error) {
    if (containsNamedError(error, 'MatchTurnDisposedError')) return 'disposed'
    if (containsNamedError(error, 'MatchTurnSupersededError')) {
      options.broadcastSnapshot()
      return 'continue'
    }
    throw error
  } finally {
    for (const actor of prepared.values()) actor.runtime.actionSettled()
    orchestrator.close()
  }
}

class MatchTurnDisposedError extends Error {
  public constructor() {
    super('Match turn was disposed before Core submission')
    this.name = 'MatchTurnDisposedError'
  }
}

class MatchTurnSupersededError extends Error {
  public constructor() {
    super('Match phase changed before Core submission')
    this.name = 'MatchTurnSupersededError'
  }
}

function containsNamedError(error: unknown, name: string): boolean {
  let current = error
  while (current instanceof Error) {
    if (current.name === name) return true
    current = current.cause
  }
  return false
}
