import { passiveRoleIds, roleEffectCatalog } from '@agentwolf/assets'
import { createV1RoleRegistry } from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'

describe('role effect catalog', () => {
  it('covers every V1 role and active ability with bounded feedback definitions', () => {
    const roles = createV1RoleRegistry().list()
    const definitions = Object.values(roleEffectCatalog)
    for (const role of roles) {
      const roleDefinitions = definitions.filter((definition) => definition.roleId === role.id)
      expect(
        roleDefinitions.length > 0 ||
          passiveRoleIds.includes(role.id as (typeof passiveRoleIds)[number]),
        `Role ${role.id} requires an effect definition or passive declaration`,
      ).toBe(true)
      for (const ability of role.abilities) {
        expect(
          roleDefinitions.some((definition) => definition.abilityId === ability.id),
          `Ability ${ability.id} requires an effect definition`,
        ).toBe(true)
      }
    }
    for (const definition of definitions) {
      expect(definition.durationMs).toBeGreaterThanOrEqual(320)
      expect(definition.durationMs).toBeLessThanOrEqual(760)
    }
    expect(roleEffectCatalog['sheriff-elected']).toMatchObject({ roleId: null, tier: 'large' })
    expect(roleEffectCatalog['sheriff-transferred']).toMatchObject({ roleId: null, tier: 'large' })
  })
})
