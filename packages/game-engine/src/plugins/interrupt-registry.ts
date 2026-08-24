import type { EventVisibility, GameEventPayload, PhaseId } from '@agentwolf/contracts'
import type { RuleRuntime } from '../rule-registry.js'
import type { PhaseInterruptDefinition, ResolutionResult } from '../types.js'

export interface InterruptHandler {
  readonly id: string
  events?(
    runtime: RuleRuntime,
    definition: PhaseInterruptDefinition,
    result: ResolutionResult,
  ): readonly { readonly payload: GameEventPayload; readonly visibility: EventVisibility }[]
  nextPhase(
    runtime: RuleRuntime,
    definition: PhaseInterruptDefinition,
    result: ResolutionResult,
  ): PhaseId
}

export class InterruptRegistry {
  readonly #handlers = new Map<string, InterruptHandler>()

  public register(handler: InterruptHandler): void {
    if (this.#handlers.has(handler.id)) throw new Error(`Duplicate interrupt handler ${handler.id}`)
    this.#handlers.set(handler.id, handler)
  }

  public handler(id: string): InterruptHandler {
    const handler = this.#handlers.get(id)
    if (!handler) throw new Error(`Unknown interrupt handler ${id}`)
    return handler
  }
}
