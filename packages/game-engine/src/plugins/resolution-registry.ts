import type { z } from 'zod'
import type { PlayerId } from '@agentwolf/contracts'
import type { ResolutionEffect, ResolutionResult } from '../types.js'

export const resolutionLanes = [
  'targeting',
  'prevention',
  'protection',
  'damage',
  'information',
  'death',
  'reaction',
  'announcement',
  'victory',
] as const

export type ResolutionLane = (typeof resolutionLanes)[number]

export interface ResolutionContext {
  readonly state: import('../types.js').GameState
  readonly board: import('../types.js').BoardManifest
  readonly roles: import('../roles/registry.js').RoleRegistry
  readonly queries?: import('./query-registry.js').QueryRegistry
}

export interface ResolutionContribution {
  readonly pendingDeaths?: ResolutionResult['pendingDeaths']
  readonly savedPlayerIds?: readonly PlayerId[]
  readonly inspections?: ResolutionResult['inspections']
  readonly exactInspections?: ResolutionResult['exactInspections']
  readonly consumedAbilityIds?: ResolutionResult['consumedAbilityIds']
}

export class ResolutionFrame {
  readonly #facts = new Map<string, unknown>()
  readonly #enqueue: (effect: ResolutionEffect) => void

  public constructor(enqueue: (effect: ResolutionEffect) => void) {
    this.#enqueue = enqueue
  }

  public enqueue(effect: ResolutionEffect): void {
    this.#enqueue(effect)
  }

  public fact<Value>(key: string, create: () => Value): Value {
    if (!this.#facts.has(key)) this.#facts.set(key, create())
    return this.#facts.get(key) as Value
  }

  public read<Value>(key: string, _fallback?: Value): Value | undefined {
    return this.#facts.get(key) as Value | undefined
  }
}

export interface EffectDefinition<Effect extends ResolutionEffect> {
  readonly kind: Effect['kind']
  readonly schema: z.ZodType<Effect>
  readonly lane: ResolutionLane
  readonly before?: readonly ResolutionEffect['kind'][]
  readonly after?: readonly ResolutionEffect['kind'][]
  apply(effect: Effect, context: ResolutionContext, frame: ResolutionFrame): void
}

export interface ResolutionFinalizer {
  readonly id: string
  readonly order?: number
  finalize(context: ResolutionContext, frame: ResolutionFrame): ResolutionContribution
}

interface StoredEffectDefinition {
  readonly kind: ResolutionEffect['kind']
  readonly lane: ResolutionLane
  readonly before: readonly ResolutionEffect['kind'][]
  readonly after: readonly ResolutionEffect['kind'][]
  readonly sequence: number
  parse(input: unknown): ResolutionEffect
  apply(effect: ResolutionEffect, context: ResolutionContext, frame: ResolutionFrame): void
}

interface QueuedEffect {
  readonly effect: ResolutionEffect
  readonly sequence: number
}

export class ResolutionRegistry {
  readonly #effects = new Map<ResolutionEffect['kind'], StoredEffectDefinition>()
  readonly #finalizers: Array<ResolutionFinalizer & { sequence: number }> = []
  #registrationSequence = 0

  public registerEffect<Effect extends ResolutionEffect>(
    definition: EffectDefinition<Effect>,
  ): void {
    if (this.#effects.has(definition.kind)) {
      throw new Error(`Duplicate effect definition ${definition.kind}`)
    }
    this.#effects.set(definition.kind, {
      kind: definition.kind,
      lane: definition.lane,
      before: definition.before ?? [],
      after: definition.after ?? [],
      sequence: ++this.#registrationSequence,
      parse: (input) => definition.schema.parse(input),
      apply: (effect, context, frame) => definition.apply(effect as Effect, context, frame),
    })
  }

  public registerFinalizer(finalizer: ResolutionFinalizer): void {
    if (this.#finalizers.some((entry) => entry.id === finalizer.id)) {
      throw new Error(`Duplicate resolution finalizer ${finalizer.id}`)
    }
    this.#finalizers.push({ ...finalizer, sequence: ++this.#registrationSequence })
  }

  public settle(
    initialEffects: readonly ResolutionEffect[],
    context: ResolutionContext,
  ): ResolutionResult {
    const definitionOrder = this.#definitionOrder()
    const queue: QueuedEffect[] = []
    let enqueueSequence = 0
    const enqueue = (effect: ResolutionEffect): void => {
      const definition = this.#effects.get(effect.kind)
      if (!definition) throw new Error(`Unknown resolution effect ${effect.kind}`)
      queue.push({ effect: definition.parse(effect), sequence: ++enqueueSequence })
    }
    const frame = new ResolutionFrame(enqueue)
    for (const effect of initialEffects) enqueue(effect)

    let steps = 0
    while (queue.length > 0) {
      if (++steps > 1_000) throw new Error('Resolution queue exceeded 1000 steps')
      queue.sort((left, right) => {
        const leftDefinition = this.#effects.get(left.effect.kind)!
        const rightDefinition = this.#effects.get(right.effect.kind)!
        return (
          resolutionLanes.indexOf(leftDefinition.lane) -
            resolutionLanes.indexOf(rightDefinition.lane) ||
          definitionOrder.get(leftDefinition.kind)! - definitionOrder.get(rightDefinition.kind)! ||
          left.sequence - right.sequence
        )
      })
      const current = queue.shift()!
      const definition = this.#effects.get(current.effect.kind)!
      definition.apply(current.effect, context, frame)
    }

    const contributions = [...this.#finalizers]
      .sort(
        (left, right) => (left.order ?? 0) - (right.order ?? 0) || left.sequence - right.sequence,
      )
      .map((finalizer) => finalizer.finalize(context, frame))
    return mergeContributions(contributions)
  }

  #definitionOrder(): ReadonlyMap<ResolutionEffect['kind'], number> {
    const definitions = [...this.#effects.values()]
    const byKind = new Map(definitions.map((definition) => [definition.kind, definition]))
    for (const definition of definitions) {
      for (const dependency of [...definition.before, ...definition.after]) {
        const target = byKind.get(dependency)
        if (!target) {
          throw new Error(`Effect ${definition.kind} orders against unknown ${dependency}`)
        }
        if (target.lane !== definition.lane) {
          throw new Error(
            `Effect ${definition.kind} cannot order across ${definition.lane}/${target.lane} lanes`,
          )
        }
      }
    }

    const visiting = new Set<ResolutionEffect['kind']>()
    const visited = new Set<ResolutionEffect['kind']>()
    const ordered: StoredEffectDefinition[] = []
    const visit = (
      definition: StoredEffectDefinition,
      path: readonly ResolutionEffect['kind'][],
    ): void => {
      if (visited.has(definition.kind)) return
      if (visiting.has(definition.kind)) {
        throw new Error(`Effect ordering cycle: ${[...path, definition.kind].join(' -> ')}`)
      }
      visiting.add(definition.kind)
      const dependencies = definitions
        .filter(
          (candidate) =>
            definition.after.includes(candidate.kind) || candidate.before.includes(definition.kind),
        )
        .sort((left, right) => left.sequence - right.sequence)
      for (const dependency of dependencies) visit(dependency, [...path, definition.kind])
      visiting.delete(definition.kind)
      visited.add(definition.kind)
      ordered.push(definition)
    }
    for (const definition of definitions.sort((left, right) => left.sequence - right.sequence)) {
      visit(definition, [])
    }
    return new Map(ordered.map((definition, index) => [definition.kind, index]))
  }
}

function mergeContributions(contributions: readonly ResolutionContribution[]): ResolutionResult {
  const pendingDeaths = new Map<PlayerId, Set<string>>()
  const savedPlayerIds = new Set<PlayerId>()
  const inspections: ResolutionResult['inspections'][number][] = []
  const exactInspections: ResolutionResult['exactInspections'][number][] = []
  const consumedAbilityIds: ResolutionResult['consumedAbilityIds'][number][] = []
  for (const contribution of contributions) {
    for (const death of contribution.pendingDeaths ?? []) {
      const causes = pendingDeaths.get(death.playerId) ?? new Set()
      for (const cause of death.causes) causes.add(cause)
      pendingDeaths.set(death.playerId, causes)
    }
    for (const playerId of contribution.savedPlayerIds ?? []) savedPlayerIds.add(playerId)
    inspections.push(...(contribution.inspections ?? []))
    exactInspections.push(...(contribution.exactInspections ?? []))
    consumedAbilityIds.push(...(contribution.consumedAbilityIds ?? []))
  }
  return {
    pendingDeaths: [...pendingDeaths].map(([playerId, causes]) => ({
      playerId,
      causes: [...causes],
    })),
    savedPlayerIds: [...savedPlayerIds],
    inspections,
    exactInspections,
    consumedAbilityIds,
  }
}
