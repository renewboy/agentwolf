import type { Faction, PlayerId } from '@agentwolf/contracts'
import type { BoardManifest, GameState } from '../types.js'
import type { RoleRegistry } from '../roles/registry.js'

export interface VictoryCandidate {
  readonly winner: Faction
  readonly winningPlayerIds: readonly PlayerId[]
  readonly reason: string
}

export interface VictoryContext {
  readonly state: GameState
  readonly board: BoardManifest
  readonly roles: RoleRegistry
}

export interface VictoryEvaluator {
  readonly id: string
  evaluate(context: VictoryContext): VictoryCandidate | null
}

export class VictoryRegistry {
  readonly #evaluators: VictoryEvaluator[] = []

  public register(evaluator: VictoryEvaluator): void {
    if (this.#evaluators.some((entry) => entry.id === evaluator.id)) {
      throw new Error(`Duplicate victory evaluator ${evaluator.id}`)
    }
    this.#evaluators.push(evaluator)
  }

  public evaluate(context: VictoryContext): VictoryCandidate | null {
    const candidates = this.#evaluators
      .map((evaluator) => evaluator.evaluate(context))
      .filter((candidate): candidate is VictoryCandidate => candidate !== null)
    if (candidates.length === 0) return null
    const first = candidates[0]!
    const firstWinners = canonicalPlayerIds(first.winningPlayerIds)
    if (firstWinners.length === 0) throw new Error('Victory candidate has no winning players')
    if (
      candidates.some(
        (candidate) =>
          candidate.winner !== first.winner ||
          candidate.reason !== first.reason ||
          canonicalPlayerIds(candidate.winningPlayerIds).join(',') !== firstWinners.join(','),
      )
    ) {
      throw new Error(
        `Conflicting victory candidates: ${candidates
          .map(
            (candidate) =>
              `${candidate.winner}:${canonicalPlayerIds(candidate.winningPlayerIds).join('+')}:${candidate.reason}`,
          )
          .join(', ')}`,
      )
    }
    return { ...first, winningPlayerIds: firstWinners }
  }
}

function canonicalPlayerIds(playerIds: readonly PlayerId[]): PlayerId[] {
  const unique = [...new Set(playerIds)].sort((left, right) => left.localeCompare(right))
  if (unique.length !== playerIds.length) throw new Error('Victory candidate repeats a player')
  return unique
}
