import type { MatchBoardSnapshot } from '@agentwolf/contracts'
import type { RulesetLock } from '@agentwolf/contracts'
import {
  createClassicRuleset,
  lockRulesetRuntime,
  type RulesetRuntime,
} from '@agentwolf/game-engine'
import { promptRegistryFor } from './prompt-registry.js'

export interface RulesetReleaseDefinition {
  readonly familyId: MatchBoardSnapshot['rulesetId']
  readonly revision: number
  readonly default: boolean
  create(): RulesetRuntime
}

export const rulesetReleaseDefinitions: readonly RulesetReleaseDefinition[] = [
  {
    familyId: 'classic',
    revision: 6,
    default: true,
    create: createClassicRuleset,
  },
]

export class RulesetCatalog {
  readonly #definitions: ReadonlyMap<MatchBoardSnapshot['rulesetId'], RulesetReleaseDefinition>
  readonly #runtimes: ReadonlyMap<MatchBoardSnapshot['rulesetId'], RulesetRuntime>
  readonly #defaultFamilyId: MatchBoardSnapshot['rulesetId']

  public constructor(definitions: readonly RulesetReleaseDefinition[] = rulesetReleaseDefinitions) {
    if (definitions.length === 0) throw new Error('Ruleset release table is empty')
    const byFamily = new Map<MatchBoardSnapshot['rulesetId'], RulesetReleaseDefinition>()
    for (const definition of definitions) {
      if (byFamily.has(definition.familyId)) {
        throw new Error(`Duplicate Ruleset family ${definition.familyId}`)
      }
      byFamily.set(definition.familyId, definition)
    }
    const defaults = definitions.filter((definition) => definition.default)
    if (defaults.length !== 1) throw new Error('Ruleset release table requires exactly one default')
    this.#definitions = byFamily
    this.#defaultFamilyId = defaults[0]!.familyId
    this.#runtimes = new Map(
      definitions.map((definition) => {
        const runtime = definition.create()
        if (runtime.revision !== definition.revision) {
          throw new Error(
            `Ruleset ${definition.familyId} declares revision ${definition.revision}, runtime is ${runtime.revision}`,
          )
        }
        promptRegistryFor(runtime)
        return [definition.familyId, runtime]
      }),
    )
  }

  public current(): RulesetRuntime {
    return this.#runtimes.get(this.#defaultFamilyId)!
  }

  public forExecution(snapshot: MatchBoardSnapshot): RulesetRuntime {
    const definition = this.#definitions.get(snapshot.rulesetId)
    const ruleset = this.#runtimes.get(snapshot.rulesetId)
    if (!definition || !ruleset) throw new Error(`Unknown Ruleset family ${snapshot.rulesetId}`)
    if (snapshot.ruleset.revision !== definition.revision) {
      throw new Error(
        `Ruleset ${snapshot.rulesetId} revision ${snapshot.ruleset.revision} is read-only; current revision is ${definition.revision}`,
      )
    }
    const expected = this.lock(ruleset)
    if (snapshot.ruleset.fingerprint !== expected.fingerprint) {
      throw new Error(
        `Ruleset fingerprint mismatch for ${snapshot.ruleset.id}: expected ${snapshot.ruleset.fingerprint}, installed ${expected.fingerprint}`,
      )
    }
    return ruleset
  }

  public currentSnapshotId(): MatchBoardSnapshot['rulesetId'] {
    return this.#defaultFamilyId
  }

  public lock(ruleset: RulesetRuntime = this.current()): RulesetLock {
    return lockRulesetRuntime(ruleset)
  }
}
