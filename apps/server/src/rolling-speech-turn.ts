import type { GameEvent, PlayerAction, PlayerId } from '@agentwolf/contracts'
import type { GameEngine, TurnDescriptor } from '@agentwolf/game-engine'
import type { PreparedActorTurn } from './match-runtime-types.js'
import type { RollingSpeechInterruptCoordinator } from './rolling-speech-interrupt.js'

type InterruptAction = Extract<PlayerAction, { type: 'skill-trigger' }>

export type RollingSpeechOutcome =
  | { readonly kind: 'speaker'; readonly action: PlayerAction }
  | {
      readonly kind: 'interrupt'
      readonly action: InterruptAction
      readonly partialText: string
      readonly speakerCancellation: Promise<unknown>
    }

export async function takeRollingSpeechTurn(options: {
  readonly actor: PreparedActorTurn
  readonly turn: TurnDescriptor
  readonly interrupts: RollingSpeechInterruptCoordinator
  readonly takeSpeaker: (onTextChunk: (text: string) => void) => Promise<PlayerAction>
}): Promise<RollingSpeechOutcome> {
  let partialText = ''
  const speaker = options
    .takeSpeaker((text) => {
      partialText += text
    })
    .then((action) => ({ kind: 'speaker' as const, action }))
  const interrupt = options.interrupts
    .waitForInterrupt()
    .then((action) => ({ kind: 'interrupt' as const, action }))
  const outcome = await Promise.race([speaker, interrupt])
  if (outcome.kind === 'speaker') return outcome
  const text = partialText.trim()
  if (text && options.turn.speechKind) {
    options.actor.runtime.recordAction({
      type: 'speech',
      matchId: options.actor.expectation.matchId,
      actorId: options.actor.playerId,
      kind: options.turn.speechKind,
      text,
    })
  }
  const speakerCancellation = options.actor.runtime
    .supersedeActiveTurn()
    .then(() => speaker)
    .catch(() => undefined)
  return { ...outcome, partialText, speakerCancellation }
}

export function submitRollingSpeechInterrupt(options: {
  readonly engine: GameEngine
  readonly turn: TurnDescriptor
  readonly speakerId: PlayerId
  readonly partialText: string
  readonly interrupt: InterruptAction
}): { readonly events: readonly GameEvent[]; readonly partialAction: PlayerAction | null } {
  const events: GameEvent[] = []
  const text = options.partialText.trim()
  let partialAction: PlayerAction | null = null
  if (text && options.turn.speechKind) {
    partialAction = {
      type: 'speech',
      matchId: options.engine.state.matchId,
      actorId: options.speakerId,
      kind: options.turn.speechKind,
      text,
    }
    events.push(...options.engine.submit(partialAction, { deferContinuation: true }))
  }
  events.push(...options.engine.submit(options.interrupt))
  return { events, partialAction }
}
