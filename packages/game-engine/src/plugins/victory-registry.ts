import type { Faction } from '@agentwolf/contracts'
import type { BoardManifest, GameState } from '../types.js'
import type { RoleRegistry } from '../roles/registry.js'

export interface VictoryCandidate {
  readonly winner: Faction
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
    if (
      candidates.some(
        (candidate) => candidate.winner !== first.winner || candidate.reason !== first.reason,
      )
    ) {
      throw new Error(
        `Conflicting victory candidates: ${candidates
          .map((candidate) => `${candidate.winner}:${candidate.reason}`)
          .join(', ')}`,
      )
    }
    return first
  }
}
