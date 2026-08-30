import type { PlayerState, RoleRegistry } from '@agentwolf/game-engine'
import type { PlayerAbilityToolContract } from './action-mailbox.js'
import type { ContextRenderer } from './context-renderer.js'

export function playerAbilityToolContracts(
  player: PlayerState,
  roles: RoleRegistry,
  renderer: ContextRenderer,
): readonly PlayerAbilityToolContract[] {
  const ownedAbilities = player.roleId ? roles.role(player.roleId).abilities : []
  const definitions = [
    ...new Map(
      [...ownedAbilities, ...roles.abilitiesFor(player)].map((ability) => [ability.id, ability]),
    ).values(),
  ]
  const presentations = new Map(
    renderer
      .abilityContracts(definitions.map((ability) => ability.id))
      .map((contract) => [contract.abilityId, contract]),
  )
  return definitions.map((ability) => {
    const presentation = presentations.get(ability.id)
    if (!presentation) throw new Error(`Missing Prompt contract for ${ability.id}`)
    return { ...presentation, actionTypes: ability.actionTypes }
  })
}
