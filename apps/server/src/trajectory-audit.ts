import {
  TrajectoryAuditReportSchema,
  type MatchId,
  type PlayerId,
  type TrajectoryAuditIssue,
  type TrajectoryAuditReport,
  type TrajectoryTurn,
} from '@agentwolf/contracts'
import { getCopy } from '@agentwolf/assets'
import { GameEngine, createV1RoleRegistry, replayGame } from '@agentwolf/game-engine'
import { playerBootstrapContextBudget } from '@agentwolf/acp'
import type { BoardCatalogService } from './board-catalog.js'
import { ContextRenderer } from './context-renderer.js'
import { actionInstructionFor, promptAssetFor } from './match-runtime-helpers.js'
import type { SqliteRepository } from './repository.js'

export async function auditTrajectory(
  repository: SqliteRepository,
  boards: BoardCatalogService,
  matchId: MatchId,
): Promise<TrajectoryAuditReport> {
  const match = repository.getMatch(matchId)
  if (!match?.boardSnapshot) throw new Error(`Match ${matchId} has no board snapshot`)
  const board = boards.resolveSnapshot(match.boardSnapshot).manifest
  const allEvents = repository.listMatchEvents(matchId)
  const turns = repository.listTrajectoryTurns(matchId).filter((turn) => turn.ownerId !== 'system')
  const records = repository.listTrajectoryRecords(matchId)
  const renderer = new ContextRenderer(createV1RoleRegistry())
  const issues: TrajectoryAuditIssue[] = []

  for (const turn of turns) {
    const contextBudgetIssue = bootstrapContextBudgetIssue(turn)
    if (contextBudgetIssue) {
      issue(issues, turn.turnId, 'context-budget-exceeded', contextBudgetIssue)
    }
    const prompts = records.filter(
      (record) => record.turnId === turn.turnId && record.kind === 'prompt',
    )
    if (prompts.length === 0) {
      issue(issues, turn.turnId, 'missing-prompt', 'Turn has no stored prompt')
      continue
    }
    if (prompts.length > 1) {
      issue(issues, turn.turnId, 'duplicate-prompt', `Turn has ${prompts.length} prompt records`)
      continue
    }
    const prompt = prompts[0]!.text
    if (prompt === null) {
      issue(issues, turn.turnId, 'missing-prompt', 'Prompt record has no text')
      continue
    }
    const delivery = allEvents.find(
      (event) =>
        event.payload.type === 'delivery.started' && event.payload.deliveryId === turn.turnId,
    )
    if (!delivery || delivery.payload.type !== 'delivery.started') {
      issue(issues, turn.turnId, 'missing-delivery', 'No matching delivery.started event')
    } else {
      if (delivery.payload.playerId !== turn.ownerId) {
        issue(issues, turn.turnId, 'actor-mismatch', 'Delivery owner differs from trajectory owner')
      }
      if (
        delivery.payload.fromSequence !== turn.fromSequence ||
        delivery.payload.toSequence !== turn.toSequence
      ) {
        issue(issues, turn.turnId, 'range-mismatch', 'Delivery range differs from trajectory range')
      }
    }
    if (
      turn.status === 'completed' &&
      !allEvents.some(
        (event) =>
          event.payload.type === 'delivery.acknowledged' &&
          event.payload.deliveryId === turn.turnId &&
          event.payload.toSequence === turn.toSequence,
      )
    ) {
      issue(
        issues,
        turn.turnId,
        'missing-acknowledgement',
        'Completed turn has no matching delivery acknowledgement',
      )
    }

    try {
      const history = allEvents.filter((event) => event.sequence <= turn.toSequence)
      const replayed = replayGame(matchId, board, history)
      const state = turn.gameStatus
        ? {
            ...replayed,
            status: turn.gameStatus,
            pausedReason: turn.pausedReasonAtRender,
          }
        : replayed
      const ownerId = turn.ownerId as PlayerId
      const expected =
        turn.kind === 'bootstrap'
          ? await renderer.foundation(state, board, ownerId, history, turn.promptVersion)
          : await expectedActionPrompt(
              renderer,
              matchId,
              board,
              history,
              ownerId,
              turn.fromSequence,
              turn.promptVersion,
              state.status,
              state.pausedReason,
              match.setup.speechCharacterLimit,
              issues,
              turn.turnId,
            )
      if (expected && turn.visibleEventSequences.length > 0) {
        const actualSequences = expected.visibleEvents.map((event) => event.sequence)
        if (!sameNumbers(actualSequences, turn.visibleEventSequences)) {
          issue(
            issues,
            turn.turnId,
            'visible-events-mismatch',
            `Expected visible events ${actualSequences.join(',')}; stored ${turn.visibleEventSequences.join(',')}`,
          )
        }
      }
      if (expected && !equivalentPrompt(turn, expected.prompt, prompt)) {
        issue(issues, turn.turnId, 'prompt-mismatch', firstDifference(expected.prompt, prompt))
      }
    } catch (error) {
      issue(
        issues,
        turn.turnId,
        'reconstruction-failed',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  return TrajectoryAuditReportSchema.parse({
    matchId,
    ok: issues.length === 0,
    auditedTurns: turns.length,
    issues,
  })
}

export function bootstrapContextBudgetIssue(turn: TrajectoryTurn): string | null {
  if (
    turn.promptVersion < 16 ||
    turn.kind !== 'bootstrap' ||
    !turn.usage ||
    turn.usage.used <= playerBootstrapContextBudget
  ) {
    return null
  }
  return `Bootstrap context used ${turn.usage.used} tokens; budget is ${playerBootstrapContextBudget}`
}

async function expectedActionPrompt(
  renderer: ContextRenderer,
  matchId: MatchId,
  board: ReturnType<BoardCatalogService['resolveSnapshot']>['manifest'],
  history: ReturnType<SqliteRepository['listMatchEvents']>,
  ownerId: PlayerId,
  fromSequence: number,
  promptVersion: number,
  status: ReturnType<typeof replayGame>['status'],
  pausedReason: string | null,
  speechCharacterLimit: number,
  issues: TrajectoryAuditIssue[],
  turnId: string,
) {
  const engine = GameEngine.restore({
    matchId,
    board,
    events: history,
    status,
    pausedReason,
  })
  const descriptor = engine.currentTurn()
  if (!descriptor || !descriptor.actors.includes(ownerId)) {
    issue(issues, turnId, 'actor-mismatch', 'Player is not an expected actor at prompt sequence')
    return null
  }
  return renderer.turn(
    engine.state,
    history,
    ownerId,
    Math.max(0, fromSequence - 1),
    promptAssetFor(descriptor, promptVersion),
    actionInstructionFor(
      descriptor,
      { board, state: engine.state, playerId: ownerId, speechCharacterLimit },
      promptVersion,
    ),
    promptVersion,
  )
}

function issue(
  issues: TrajectoryAuditIssue[],
  turnId: string,
  code: TrajectoryAuditIssue['code'],
  detail: string,
): void {
  issues.push({ turnId, code, detail })
}

function firstDifference(expected: string, actual: string): string {
  const limit = Math.min(expected.length, actual.length)
  let index = 0
  while (index < limit && expected[index] === actual[index]) index += 1
  return `Prompt differs at character ${index}; expected length ${expected.length}, actual length ${actual.length}`
}

export function equivalentPrompt(turn: TrajectoryTurn, expected: string, actual: string): boolean {
  if (expected === actual) return true
  if (turn.promptVersion === 12 && turn.phaseId === 'phase-night-wolf-vote') {
    const optionalConstraint = getCopy('promptActions.wolfKillVoteOnly')
    const withoutOptionalConstraint = (value: string) =>
      value
        .split('\n')
        .filter((line) => line !== optionalConstraint)
        .join('\n')
        .trim()
    if (withoutOptionalConstraint(expected) === withoutOptionalConstraint(actual)) return true
  }
  if (turn.kind !== 'bootstrap' || turn.promptVersion >= 5) return false
  const pausedPrefix = getCopy('narration.matchPaused').split('{{')[0]!
  const withoutSyntheticPause = actual
    .split('\n')
    .filter((line) => !line.startsWith(pausedPrefix))
    .join('\n')
  return expected === withoutSyntheticPause
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
