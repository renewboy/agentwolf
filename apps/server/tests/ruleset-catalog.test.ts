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
      expect.objectContaining({ familyId: 'classic', revision: 6, default: true }),
    ])
    expect(catalog.current()).toMatchObject({ id: 'ruleset-classic', revision: 6 })
    expect(lock).toMatchObject({ id: 'ruleset-classic', revision: 6 })
    expect(lock.fingerprint).toBe(
      '806490f20fe1ca19e9dbbf14a5f2158819963796e9eb5130c58394eb805e98d5',
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
    expect(() => new RulesetCatalog([mismatched])).toThrow(/runtime is 6/)
  })
})

function snapshotFor(ruleset: ReturnType<RulesetCatalog['lock']>) {
  return MatchBoardSnapshotSchema.parse({
    schemaVersion: 3,
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
    sheriff: guardBoard.sheriff,
    victory: guardBoard.policies.victory,
    source: 'built-in',
    revision: 1,
  })
}
