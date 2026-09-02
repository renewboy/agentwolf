import { MatchBoardSnapshotSchema } from '@agentwolf/contracts'
import { createClassicRuleset, guardBoard } from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import {
  RulesetCatalog,
  rulesetReleaseDefinitions,
  type RulesetReleaseDefinition,
} from '../src/ruleset-catalog.js'

describe('RulesetCatalog', () => {
  it('builds the current runtime from one table row and verifies its immutable lock', () => {
    const catalog = new RulesetCatalog()
    const lock = catalog.lock()
    expect(rulesetReleaseDefinitions).toEqual([
      expect.objectContaining({ familyId: 'classic', revision: 9, default: true }),
    ])
    expect(catalog.current()).toMatchObject({ id: 'ruleset-classic', revision: 9 })
    expect(lock).toMatchObject({ id: 'ruleset-classic', revision: 9 })
    expect(lock.fingerprint).toBe(
      '72ee44901ac0f4dc754545f8c535f06c61fe4469d90b73d505b0df4419515a13',
    )
    const snapshot = snapshotFor(lock)
    expect(catalog.forExecution(snapshot)).toBe(catalog.current())
    expect(() =>
      catalog.forExecution(
        MatchBoardSnapshotSchema.parse({
          ...snapshot,
          ruleset: { ...snapshot.ruleset, revision: 5 },
        }),
      ),
    ).toThrow(/read-only/)
    expect(() =>
      catalog.forExecution(
        MatchBoardSnapshotSchema.parse({
          ...snapshot,
          ruleset: { ...snapshot.ruleset, fingerprint: '0'.repeat(64) },
        }),
      ),
    ).toThrow(/fingerprint mismatch/)
  })

  it('rejects empty, duplicate, ambiguous, and revision-mismatched release tables', () => {
    const current = rulesetReleaseDefinitions[0]!
    expect(() => new RulesetCatalog([])).toThrow(/empty/)
    expect(() => new RulesetCatalog([{ ...current, default: false }])).toThrow(/exactly one/)
    expect(() => new RulesetCatalog([current, current])).toThrow(/Duplicate/)
    const mismatched: RulesetReleaseDefinition = {
      familyId: 'classic',
      revision: 5,
      default: true,
      create: createClassicRuleset,
    }
    expect(() => new RulesetCatalog([mismatched])).toThrow(/runtime is 9/)
  })
})

function snapshotFor(ruleset: ReturnType<RulesetCatalog['lock']>) {
  return MatchBoardSnapshotSchema.parse({
    schemaVersion: 4,
    rulesetId: 'classic',
    ruleset,
    policies: guardBoard.policies,
    id: guardBoard.id,
    name: 'Classic guard board',
    description: '',
    roles: guardBoard.roles,
    characters: [],
    agentProfiles: [],
    playerCount: guardBoard.playerCount,
    reserveCount: guardBoard.reserveCount,
    sheriff: guardBoard.sheriff,
    victory: guardBoard.policies.victory,
    source: 'built-in',
    revision: 1,
  })
}
