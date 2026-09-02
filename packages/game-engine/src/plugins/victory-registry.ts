import type { Faction, GameEvent, PlayerId } from '@agentwolf/contracts'
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
  readonly events: readonly GameEvent[]
}

export interface VictoryEvaluator {
  readonly id: string
  evaluate(context: VictoryContext): VictoryCandidate | null
}

export interface VictoryModifier {
  readonly id: string
  readonly order?: number
  transform(context: VictoryContext, current: VictoryCandidate | null): VictoryCandidate | null
}

export interface ForcedVictoryEvaluator {
  readonly id: string
  evaluate(
    context: VictoryContext,
    evaluateFormal: (context: VictoryContext) => VictoryCandidate | null,
  ): VictoryCandidate | null
}

export class VictoryRegistry {
  readonly #evaluators: VictoryEvaluator[] = []
  readonly #forcedEvaluators: ForcedVictoryEvaluator[] = []
  readonly #modifiers: Array<VictoryModifier & { sequence: number }> = []
  #modifierSequence = 0

  public register(evaluator: VictoryEvaluator): void {
    if (this.#evaluators.some((entry) => entry.id === evaluator.id)) {
      throw new Error(`Duplicate victory evaluator ${evaluator.id}`)
    }
    this.#evaluators.push(evaluator)
  }

  public registerModifier(modifier: VictoryModifier): void {
    if (this.#modifiers.some((entry) => entry.id === modifier.id)) {
      throw new Error(`Duplicate victory modifier ${modifier.id}`)
    }
    this.#modifiers.push({ ...modifier, sequence: ++this.#modifierSequence })
  }

  public registerForced(evaluator: ForcedVictoryEvaluator): void {
    if (this.#forcedEvaluators.some((entry) => entry.id === evaluator.id)) {
      throw new Error(`Duplicate forced victory evaluator ${evaluator.id}`)
    }
    this.#forcedEvaluators.push(evaluator)
  }

  public evaluate(context: VictoryContext): VictoryCandidate | null {
    const formal = this.evaluateFormal(context)
    if (formal) return formal
    const candidates = this.#forcedEvaluators
      .map((evaluator) => evaluator.evaluate(context, (next) => this.evaluateFormal(next)))
      .filter((candidate): candidate is VictoryCandidate => candidate !== null)
    return canonicalCandidate(candidates)
  }

  public evaluateFormal(context: VictoryContext): VictoryCandidate | null {
    const candidates = this.#evaluators
      .map((evaluator) => evaluator.evaluate(context))
      .filter((candidate): candidate is VictoryCandidate => candidate !== null)
    let current = canonicalCandidate(candidates)
    for (const modifier of [...this.#modifiers].sort(
      (left, right) => (left.order ?? 0) - (right.order ?? 0) || left.sequence - right.sequence,
    )) {
      current = modifier.transform(context, current)
    }
    if (!current) return null
    const winningPlayerIds = canonicalPlayerIds(current.winningPlayerIds)
    if (winningPlayerIds.length === 0) throw new Error('Victory candidate has no winning players')
    return { ...current, winningPlayerIds }
  }
}

function canonicalCandidate(candidates: readonly VictoryCandidate[]): VictoryCandidate | null {
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

function canonicalPlayerIds(playerIds: readonly PlayerId[]): PlayerId[] {
  const unique = [...new Set(playerIds)].sort((left, right) => left.localeCompare(right))
  if (unique.length !== playerIds.length) throw new Error('Victory candidate repeats a player')
  return unique
}
