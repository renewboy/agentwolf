import { randomBytes } from 'node:crypto'
import type { AcpPromptCallbacks, AcpPromptResult } from '@agentwolf/acp'
import { AcpDeliveryUncertainError } from '@agentwolf/acp'
import type { MatchId, PlayerId, PostgameReviewSubmission } from '@agentwolf/contracts'
import { prepareDirectSpeechResponse } from './direct-speech-response.js'
import type { ActionMailbox, PostgameReviewExpectation } from './action-mailbox.js'
import type { ContextEnvelope } from './context-renderer.js'
import type { PlayerRuntimeStatus, PlayerSession } from './player-runtime.js'
import type { MatchTrajectoryRecorder, TrajectoryTurnRecorder } from './trajectory.js'

export interface AuxiliaryDeliveryOptions {
  readonly session: PlayerSession
  readonly promptTimeoutMs: number
  readonly envelope: ContextEnvelope
  readonly actionType: string
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly sessionGeneration: number
  readonly trajectory: MatchTrajectoryRecorder
  readonly callbacks?: AcpPromptCallbacks
  readonly acceptedAfterError?: () => boolean
  readonly setStatus: (status: PlayerRuntimeStatus) => void
  readonly setActiveTrajectory: (trajectory: TrajectoryTurnRecorder | null) => void
}

export async function deliverAuxiliaryPrompt(
  options: AuxiliaryDeliveryOptions,
): Promise<{ result: AcpPromptResult; trajectory: TrajectoryTurnRecorder }> {
  const turnId = `postgame-${randomBytes(10).toString('hex')}`
  options.setStatus('thinking')
  const trajectory = options.trajectory.beginTurn({
    turnId,
    ownerId: options.playerId,
    sessionId: options.session.sessionId,
    sessionGeneration: options.sessionGeneration,
    kind: 'postgame',
    phaseId: null,
    actionType: options.actionType,
    fromSequence: options.envelope.fromSequence ?? options.envelope.toSequence,
    toSequence: options.envelope.toSequence,
    prompt: options.envelope.prompt,
    visibleEventSequences: options.envelope.visibleEvents.map((event) => event.sequence),
    gameStatus: options.envelope.gameStatus,
    pausedReasonAtRender: options.envelope.pausedReason,
    continuation: options.envelope.continuation,
  })
  options.setActiveTrajectory(trajectory)
  try {
    const result = await options.session.prompt(options.envelope.prompt, options.promptTimeoutMs, {
      ...(options.callbacks?.onTextChunk ? { onTextChunk: options.callbacks.onTextChunk } : {}),
      onUpdate: (update) => {
        trajectory.update(update)
        options.callbacks?.onUpdate?.(update)
      },
    })
    options.setStatus('ready')
    if (result.stopReason !== 'end_turn') {
      throw new Error(`ACP turn stopped with ${result.stopReason}`)
    }
    trajectory.complete(result.stopReason)
    return { result, trajectory }
  } catch (error) {
    if (options.acceptedAfterError?.()) {
      trajectory.diagnostic(
        'ACP Prompt ended after the postgame review was accepted; using the accepted review.',
      )
      trajectory.complete('end_turn')
      options.setStatus(options.session.connected ? 'ready' : 'failed')
      return { result: { text: '', stopReason: 'end_turn', updates: [] }, trajectory }
    }
    trajectory.fail(error, isUncertain(error) ? 'uncertain' : 'failed')
    options.setStatus('failed')
    throw error
  } finally {
    options.setActiveTrajectory(null)
  }
}

export async function takePostgameReviewTurn(options: {
  readonly mailbox: ActionMailbox
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly envelope: ContextEnvelope
  readonly expectation: PostgameReviewExpectation
  readonly deliver: (
    envelope: ContextEnvelope,
    actionType: string,
    callbacks?: AcpPromptCallbacks,
    acceptedAfterError?: () => boolean,
  ) => Promise<{ result: AcpPromptResult; trajectory: TrajectoryTurnRecorder }>
  readonly onAccepted: (submission: PostgameReviewSubmission) => void
}): Promise<PostgameReviewSubmission> {
  options.mailbox.expectPostgameReview({
    ...options.expectation,
    onAccepted: (submission) => {
      options.onAccepted(submission)
      options.expectation.onAccepted?.(submission)
    },
  })
  try {
    await options.deliver(options.envelope, 'postgame-review', undefined, () =>
      Boolean(options.mailbox.peekPostgameReview(options.matchId, options.playerId)),
    )
    const submission = options.mailbox.takePostgameReview(options.matchId, options.playerId)
    if (!submission) throw new Error('Agent did not submit the expected postgame review')
    return submission
  } finally {
    options.mailbox.clearPostgameReview(options.matchId, options.playerId)
  }
}

export async function takePostgameSpeechTurn(options: {
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly envelope: ContextEnvelope
  readonly callbacks: AcpPromptCallbacks
  readonly deliver: (
    envelope: ContextEnvelope,
    actionType: string,
    callbacks?: AcpPromptCallbacks,
  ) => Promise<{ result: AcpPromptResult; trajectory: TrajectoryTurnRecorder }>
}): Promise<string> {
  const speechCapture = prepareDirectSpeechResponse(options.callbacks)
  const { result, trajectory } = await options.deliver(
    options.envelope,
    'postgame-reflection',
    speechCapture.callbacks,
  )
  const text = speechCapture.response.finish(result.text)
  if (speechCapture.response.diagnostic) trajectory.diagnostic(speechCapture.response.diagnostic)
  trajectory.accepted('postgame-speech', {
    type: 'speech',
    matchId: options.matchId,
    actorId: options.playerId,
    kind: 'postgame',
    text,
  })
  return text
}

function isUncertain(error: unknown): boolean {
  return (
    error instanceof AcpDeliveryUncertainError ||
    (error instanceof Error && error.name === 'AcpDeliveryUncertainError')
  )
}
