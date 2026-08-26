import {
  TrajectoryAuditReportSchema,
  type MatchId,
  type PlayerId,
  type TrajectoryAuditIssue,
  type TrajectoryAuditReport,
  type TrajectoryTurn,
} from '@agentwolf/contracts'
import { playerBootstrapContextBudget } from '@agentwolf/acp'
import { GameEngine, replayGame, visibleEvents } from '@agentwolf/game-engine'
import type { BoardCatalogService } from './board-catalog.js'
import type { SqliteRepository } from './repository.js'

export async function auditTrajectory(
  repository: SqliteRepository,
  boards: BoardCatalogService,
  matchId: MatchId,
): Promise<TrajectoryAuditReport> {
  const match = repository.getMatch(matchId)
  if (!match?.boardSnapshot) throw new Error(`Match ${matchId} has no board snapshot`)
  const board = boards.resolveSnapshot(match.boardSnapshot).manifest
  const ruleset = boards.rulesetForSnapshot(match.boardSnapshot)
  const allEvents = repository.listMatchEvents(matchId)
  const turns = repository.listTrajectoryTurns(matchId).filter((turn) => turn.ownerId !== 'system')
  const records = repository.listTrajectoryRecords(matchId)
  const issues: TrajectoryAuditIssue[] = []

  for (const turn of turns) {
    const contextBudgetIssue = bootstrapContextBudgetIssue(turn)
    if (contextBudgetIssue) {
      issue(issues, turn.turnId, 'context-budget-exceeded', contextBudgetIssue)
    }
    const prompts = records.filter(
      (record) => record.turnId === turn.turnId && record.kind === 'prompt',
    )
    if (prompts.length === 0 || prompts[0]?.text === null) {
      issue(issues, turn.turnId, 'missing-prompt', 'Turn has no stored Prompt text')
      continue
    }
    if (prompts.length > 1) {
      issue(issues, turn.turnId, 'duplicate-prompt', `Turn has ${prompts.length} Prompt records`)
      continue
    }

    if (turn.kind !== 'postgame') {
      const delivery = allEvents.find(
        (event) =>
          event.payload.type === 'delivery.started' && event.payload.deliveryId === turn.turnId,
      )
      if (!delivery || delivery.payload.type !== 'delivery.started') {
        issue(issues, turn.turnId, 'missing-delivery', 'No matching delivery.started event')
      } else {
        if (delivery.payload.playerId !== turn.ownerId) {
          issue(
            issues,
            turn.turnId,
            'actor-mismatch',
            'Delivery owner differs from trajectory owner',
          )
        }
        if (
          delivery.payload.fromSequence !== turn.fromSequence ||
          delivery.payload.toSequence !== turn.toSequence
        ) {
          issue(
            issues,
            turn.turnId,
            'range-mismatch',
            'Delivery range differs from trajectory range',
          )
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
    }

    try {
      const history = allEvents.filter((event) => event.sequence <= turn.toSequence)
      const replayed = replayGame(matchId, board, history, ruleset)
      const state = turn.gameStatus
        ? {
            ...replayed,
            status: turn.gameStatus,
            pausedReason: turn.pausedReasonAtRender,
          }
        : replayed
      const ownerId = turn.ownerId as PlayerId
      if (turn.visibleEventSequences.length > 0) {
        const afterSequence = turn.kind === 'bootstrap' ? 0 : Math.max(0, turn.fromSequence - 1)
        const visibilityView =
          turn.kind === 'postgame'
            ? ({ kind: 'closed-eye' } as const)
            : ({ kind: 'player', playerId: ownerId } as const)
        const actualSequences = visibleEvents(history, visibilityView, state, afterSequence).map(
          (event) => event.sequence,
        )
        if (!sameNumbers(actualSequences, turn.visibleEventSequences)) {
          issue(
            issues,
            turn.turnId,
            'visible-events-mismatch',
            `Expected visible events ${actualSequences.join(',')}; stored ${turn.visibleEventSequences.join(',')}`,
          )
        }
      }
      if (turn.kind === 'action' && turn.actionType !== 'bootstrap-continuation') {
        const engine = GameEngine.restore({
          matchId,
          board,
          events: history,
          status: state.status,
          pausedReason: state.pausedReason,
          ruleset,
        })
        const descriptor = engine.currentTurn()
        if (!descriptor || !descriptor.actors.includes(ownerId)) {
          issue(
            issues,
            turn.turnId,
            'actor-mismatch',
            'Player is not an expected actor at the stored action boundary',
          )
        } else if (descriptor.actionType !== turn.actionType) {
          issue(
            issues,
            turn.turnId,
            'actor-mismatch',
            `Stored action type ${turn.actionType} differs from ${descriptor.actionType}`,
          )
        }
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
  if (turn.kind !== 'bootstrap' || !turn.usage || turn.usage.used <= playerBootstrapContextBudget) {
    return null
  }
  return `Bootstrap context used ${turn.usage.used} tokens; budget is ${playerBootstrapContextBudget}`
}

function issue(
  issues: TrajectoryAuditIssue[],
  turnId: string,
  code: TrajectoryAuditIssue['code'],
  detail: string,
): void {
  issues.push({ turnId, code, detail })
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
