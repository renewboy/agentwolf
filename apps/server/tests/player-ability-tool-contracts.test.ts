import { AbilityIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import type { PlayerState } from '@agentwolf/game-engine'
import { describe, expect, it, vi } from 'vitest'
import { playerAbilityToolContracts } from '../src/player-ability-tool-contracts.js'

const roleId = RoleIdSchema.parse('role-tool-contract-test')
const ownedAbilityId = AbilityIdSchema.parse('ability-tool-contract-owned')
const grantedAbilityId = AbilityIdSchema.parse('ability-tool-contract-granted')
const ownedAbility = { id: ownedAbilityId, actionTypes: ['night-action'] as const }
const grantedAbility = { id: grantedAbilityId, actionTypes: ['skill-trigger'] as const }

describe('player Ability tool contracts', () => {
  it('deduplicates owned and currently granted abilities with their Prompt presentations', () => {
    const player = { roleId } as PlayerState
    const roles = {
      role: () => ({ abilities: [ownedAbility] }),
      abilitiesFor: () => [ownedAbility, grantedAbility],
    }
    const renderer = {
      abilityContracts: (abilityIds: readonly (typeof ownedAbilityId)[]) =>
        abilityIds.map((abilityId) => ({
          abilityId,
          label: abilityId === ownedAbilityId ? '自有能力' : '授予能力',
          description: `${abilityId} 说明`,
        })),
    }

    expect(playerAbilityToolContracts(player, roles as never, renderer as never)).toEqual([
      {
        abilityId: ownedAbilityId,
        label: '自有能力',
        description: `${ownedAbilityId} 说明`,
        actionTypes: ['night-action'],
      },
      {
        abilityId: grantedAbilityId,
        label: '授予能力',
        description: `${grantedAbilityId} 说明`,
        actionTypes: ['skill-trigger'],
      },
    ])
  })

  it('supports an unassigned player and fails closed on a missing Prompt presentation', () => {
    const noRoleLookup = vi.fn()
    const emptyRoles = { role: noRoleLookup, abilitiesFor: () => [] }
    const emptyRenderer = { abilityContracts: () => [] }
    expect(
      playerAbilityToolContracts(
        { roleId: null } as unknown as PlayerState,
        emptyRoles as never,
        emptyRenderer as never,
      ),
    ).toEqual([])
    expect(noRoleLookup).not.toHaveBeenCalled()

    const roles = { role: () => ({ abilities: [ownedAbility] }), abilitiesFor: () => [] }
    expect(() =>
      playerAbilityToolContracts({ roleId } as PlayerState, roles as never, emptyRenderer as never),
    ).toThrow(`Missing Prompt contract for ${ownedAbilityId}`)
  })
})
