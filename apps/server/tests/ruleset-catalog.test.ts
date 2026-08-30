import { MatchBoardSnapshotSchema } from '@agentwolf/contracts'
import {
  createClassicRuleset,
  createClassicV2Ruleset,
  createClassicV3Ruleset,
  guardBoard,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { RulesetCatalog } from '../src/ruleset-catalog.js'

describe('RulesetCatalog', () => {
  it('resolves an exact classic-v2 snapshot without installing classic-v3 Roles', () => {
    const catalog = new RulesetCatalog()
    const classicV2 = createClassicV2Ruleset()
    const snapshot = MatchBoardSnapshotSchema.parse({
      schemaVersion: 2,
      rulesetId: 'classic-v2',
      ruleset: catalog.lock(classicV2),
      policies: guardBoard.policies,
      id: guardBoard.id,
      name: 'Classic V2 guard board',
      description: '',
      roles: guardBoard.roles,
      characters: [],
      playerCount: guardBoard.playerCount,
      sheriff: guardBoard.sheriff,
      victory: guardBoard.policies.victory,
      source: 'built-in',
      revision: 1,
    })

    const resolved = catalog.forSnapshot(snapshot)
    expect(resolved.id).toBe('ruleset-classic-v2')
    expect(resolved.version).toBe(2)
    expect(resolved.roles.list().map((role) => role.id)).not.toContain('role-awakened-hidden-wolf')
    expect(resolved.plugins).toEqual(classicV2.plugins)
    expect(catalog.current().id).toBe('ruleset-classic-v4')
  })

  it('resolves classic-v3 without installing Cupid or changing its plugin lock', () => {
    const catalog = new RulesetCatalog()
    const classicV3 = createClassicV3Ruleset()
    const snapshot = MatchBoardSnapshotSchema.parse({
      schemaVersion: 2,
      rulesetId: 'classic-v3',
      ruleset: catalog.lock(classicV3),
      policies: guardBoard.policies,
      id: guardBoard.id,
      name: 'Classic V3 guard board',
      description: '',
      roles: guardBoard.roles,
      characters: [],
      playerCount: guardBoard.playerCount,
      sheriff: guardBoard.sheriff,
      victory: guardBoard.policies.victory,
      source: 'built-in',
      revision: 1,
    })

    const resolved = catalog.forSnapshot(snapshot)
    expect(resolved.id).toBe('ruleset-classic-v3')
    expect(resolved.roles.list().map((role) => role.id)).not.toContain('role-cupid')
    expect(resolved.plugins).toEqual(classicV3.plugins)
  })

  it('rejects the superseded classic-v4 Cupid v1 fingerprint', () => {
    const catalog = new RulesetCatalog()
    const current = createClassicRuleset()
    const currentLock = catalog.lock(current)
    expect(current.plugins.find((plugin) => plugin.id === 'plugin-role-cupid')?.version).toBe(2)
    const snapshot = MatchBoardSnapshotSchema.parse({
      schemaVersion: 2,
      rulesetId: 'classic-v4',
      ruleset: {
        ...currentLock,
        plugins: currentLock.plugins.map((plugin) =>
          plugin.id === 'plugin-role-cupid' ? { ...plugin, version: 1 } : plugin,
        ),
        fingerprint: 'f527bae1636c82df7d2ef170893f4063a2c26d0f06bed078ca3583e819902557',
      },
      policies: guardBoard.policies,
      id: guardBoard.id,
      name: 'Superseded Classic V4 board',
      description: '',
      roles: guardBoard.roles,
      characters: [],
      playerCount: guardBoard.playerCount,
      sheriff: guardBoard.sheriff,
      victory: guardBoard.policies.victory,
      source: 'built-in',
      revision: 1,
    })

    expect(() => catalog.forSnapshot(snapshot)).toThrow(/Ruleset fingerprint mismatch/)
  })
})
