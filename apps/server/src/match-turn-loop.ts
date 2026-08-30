import type { GameEvent, PlayerAction, PlayerId } from '@agentwolf/contracts'
import type { GameEngine, TurnDescriptor } from '@agentwolf/game-engine'
import { findCommittedSpeech, settleActions } from './match-runtime-helpers.js'
import type { PreparedActorTurn } from './match-runtime-types.js'
import type { PlayerRuntime } from './player-runtime.js'
import type { RollingSpeechInterruptCoordinator } from './rolling-speech-interrupt.js'
import { submitRollingSpeechInterrupt, takeRollingSpeechTurn } from './rolling-speech-turn.js'
import type { SpeechPlaybackCoordinator } from './speech-playback-coordinator.js'

export interface MatchTurnLoopOptions {
  readonly engine: GameEngine
  readonly speechInterrupts: RollingSpeechInterruptCoordinator | null
  readonly playback: SpeechPlaybackCoordinator
  readonly isDisposed: () => boolean
  readonly playerRuntime: (playerId: PlayerId) => PlayerRuntime | null
  readonly prepareActorTurn: (
    playerId: PlayerId,
    turn: TurnDescriptor,
  ) => Promise<PreparedActorTurn>
  readonly takeActorTurn: (
    actor: PreparedActorTurn,
    turn: TurnDescriptor,
    onSpeechChunk?: (text: string) => void,
  ) => Promise<PlayerAction>
  readonly record: (events: readonly GameEvent[]) => void
  readonly broadcastSnapshot: () => void
}

export async function runMatchTurn(
  options: MatchTurnLoopOptions,
): Promise<'continue' | 'disposed'> {
  const turn = options.engine.currentTurn()
  if (!turn || turn.actors.length === 0) {
    throw new Error(
      `Rule engine stopped without an actionable turn at ${options.engine.state.phaseId}`,
    )
  }
  const actorIds = turn.mode === 'sequential' ? turn.actors.slice(0, 1) : [...turn.actors]
  if (options.speechInterrupts && turn.mode === 'sequential' && turn.actionType === 'speech') {
    options.speechInterrupts.refresh(actorIds[0] ?? null)
    if (actorIds[0]) await options.speechInterrupts.quiesce(actorIds[0])
  } else {
    options.speechInterrupts?.stopAll()
  }
  const prepared = await Promise.all(
    actorIds.map((playerId) => options.prepareActorTurn(playerId, turn)),
  )
  let actions: PlayerAction[]
  if (
    options.speechInterrupts &&
    turn.mode === 'sequential' &&
    turn.actionType === 'speech' &&
    prepared[0]
  ) {
    const actor = prepared[0]
    const outcome = await takeRollingSpeechTurn({
      actor,
      turn,
      interrupts: options.speechInterrupts,
      takeSpeaker: (onTextChunk) => options.takeActorTurn(actor, turn, onTextChunk),
    })
    if (outcome.kind === 'interrupt') {
      const submitted = submitRollingSpeechInterrupt({
        engine: options.engine,
        turn,
        speakerId: actor.playerId,
        partialText: outcome.partialText,
        interrupt: outcome.action,
      })
      options.record(submitted.events)
      options.speechInterrupts.stopAll()
      await Promise.allSettled([outcome.speakerCancellation, options.speechInterrupts.settleAll()])
      options.speechInterrupts.takeInterrupt()
      actor.runtime.actionSettled()
      options.playerRuntime(outcome.action.actorId)?.actionSettled()
      options.broadcastSnapshot()
      return 'continue'
    }
    actions = [outcome.action]
  } else {
    actions = await settleActions(prepared.map((actor) => options.takeActorTurn(actor, turn)))
  }
  if (options.isDisposed()) return 'disposed'
  const orderedActions = actions.sort((left, right) => {
    const leftSeat = options.engine.state.players.get(left.actorId)?.seat ?? 0
    const rightSeat = options.engine.state.players.get(right.actorId)?.seat ?? 0
    return leftSeat - rightSeat
  })
  let committedActionCount = 0
  for (const action of orderedActions) {
    if (options.engine.state.phaseId !== turn.phaseId) break
    const deferSpeechBoundary =
      action.type === 'speech' && turn.mode === 'sequential' && turn.actors.length === 1
    const events = options.engine.submit(action, { deferContinuation: deferSpeechBoundary })
    options.record(events)
    options.playerRuntime(action.actorId)?.actionSettled()
    committedActionCount += 1
    if (options.speechInterrupts && options.engine.state.phaseId !== turn.phaseId) {
      options.speechInterrupts.stopAll()
      await options.speechInterrupts.settleAll()
    }
    if (deferSpeechBoundary) {
      const committed = findCommittedSpeech(events)
      if (!committed) throw new Error('Speech action did not produce a committed event')
      const boundaryTurn = options.engine.currentTurn()
      const hasNextSpeechActor =
        boundaryTurn?.phaseId === turn.phaseId &&
        boundaryTurn.mode === 'sequential' &&
        boundaryTurn.actionType === 'speech' &&
        boundaryTurn.actors.length > 0
      if (
        options.speechInterrupts &&
        boundaryTurn?.phaseId === turn.phaseId &&
        boundaryTurn.mode === 'sequential' &&
        boundaryTurn.actionType === 'speech'
      ) {
        options.speechInterrupts.refresh(boundaryTurn.actors[0] ?? null)
      }
      await options.playback.waitFor({
        sequence: committed.sequence,
        playerId: committed.payload.playerId,
        event: committed,
      })
      if (options.isDisposed()) return 'disposed'
      if (options.speechInterrupts && !hasNextSpeechActor) {
        options.speechInterrupts.stopAll()
        await options.speechInterrupts.settleAll()
      }
      const interrupt = options.speechInterrupts?.peekInterrupt() ?? null
      if (interrupt) {
        options.record(options.engine.submit(interrupt))
        options.speechInterrupts?.stopAll()
        await options.speechInterrupts?.settleAll()
        options.speechInterrupts?.takeInterrupt()
        options.playerRuntime(interrupt.actorId)?.actionSettled()
      } else {
        options.record(options.engine.continueAfterDeferredAction())
      }
    }
  }
  for (const action of orderedActions.slice(committedActionCount)) {
    options.playerRuntime(action.actorId)?.actionSettled()
  }
  options.broadcastSnapshot()
  return 'continue'
}
