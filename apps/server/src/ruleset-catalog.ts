import type { MatchBoardSnapshot } from '@agentwolf/contracts'
import { RulesetLockSchema, type JsonValue, type RulesetLock } from '@agentwolf/contracts'
import { createHash } from 'node:crypto'
import {
  createClassicRuleset,
  createClassicV1Ruleset,
  createClassicV2Ruleset,
  type RulesetRuntime,
} from '@agentwolf/game-engine'
import { promptRegistryFor } from './prompt-registry.js'

export class RulesetCatalog {
  readonly #classicV1 = createClassicV1Ruleset()
  readonly #classicV2 = createClassicV2Ruleset()
  readonly #classicV3 = createClassicRuleset()

  public constructor() {
    promptRegistryFor(this.#classicV1)
    promptRegistryFor(this.#classicV2)
    promptRegistryFor(this.#classicV3)
  }

  public current(): RulesetRuntime {
    return this.#classicV3
  }

  public forSnapshot(snapshot: MatchBoardSnapshot): RulesetRuntime {
    const ruleset =
      snapshot.rulesetId === 'classic-v1'
        ? this.#classicV1
        : snapshot.rulesetId === 'classic-v2'
          ? this.#classicV2
          : this.#classicV3
    if (snapshot.schemaVersion === 2) {
      const expected = this.lock(ruleset)
      if (snapshot.ruleset.fingerprint !== expected.fingerprint) {
        throw new Error(
          `Ruleset fingerprint mismatch for ${snapshot.ruleset.id}: expected ${snapshot.ruleset.fingerprint}, installed ${expected.fingerprint}`,
        )
      }
    }
    return ruleset
  }

  public currentSnapshotId(): 'classic-v3' {
    return 'classic-v3'
  }

  public lock(ruleset: RulesetRuntime = this.current()): RulesetLock {
    const plugins = ruleset.plugins.map((plugin) => ({
      id: plugin.id,
      version: plugin.version,
      config: plugin.config,
      configHash: digest(plugin.config),
    }))
    return RulesetLockSchema.parse({
      id: ruleset.id,
      version: ruleset.version,
      plugins,
      fingerprint: digest({ id: ruleset.id, version: ruleset.version, plugins }),
    })
  }
}

function digest(value: JsonValue | Readonly<Record<string, unknown>>): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
