import type { AbilityId, CapabilityId, RoleId } from '@agentwolf/contracts'
import { assertRule } from '../errors.js'
import type { AbilityDefinition } from './base.js'
import type { Role } from './base.js'
import type { PlayerState } from '../types.js'
import type { SemanticOwnershipRecorder } from '../plugins/semantic-ownership.js'

export class RoleRegistry {
  readonly #roles = new Map<RoleId, Role>()
  readonly #abilities = new Map<AbilityId, { role: Role; ability: AbilityDefinition }>()

  public constructor(private readonly ownership?: SemanticOwnershipRecorder) {}

  public register(role: Role): void {
    assertRule(!this.#roles.has(role.id), `Duplicate role ${role.id}`)
    for (const ability of role.abilities) {
      assertRule(!this.#abilities.has(ability.id), `Duplicate ability ${ability.id}`)
    }
    this.ownership?.role(role.id)
    for (const ability of role.abilities) this.ownership?.ability(ability.id)
    this.#roles.set(role.id, role)
    for (const ability of role.abilities) {
      this.#abilities.set(ability.id, { role, ability })
    }
  }

  public role(id: RoleId): Role {
    const role = this.#roles.get(id)
    assertRule(role, `Unknown role ${id}`)
    return role
  }

  public ability(id: AbilityId): { role: Role; ability: AbilityDefinition } {
    const entry = this.#abilities.get(id)
    assertRule(entry, `Unknown ability ${id}`)
    return entry
  }

  public hasAbility(id: AbilityId): boolean {
    return this.#abilities.has(id)
  }

  public capabilitiesFor(player: PlayerState): ReadonlySet<CapabilityId> {
    const capabilities = new Set(player.roleState.capabilities)
    if (player.roleId) {
      for (const capability of this.role(player.roleId).capabilities) capabilities.add(capability)
    }
    return capabilities
  }

  public hasCapability(player: PlayerState, capabilityId: CapabilityId): boolean {
    return this.capabilitiesFor(player).has(capabilityId)
  }

  public canUseAbility(player: PlayerState, abilityId: AbilityId): boolean {
    const entry = this.ability(abilityId)
    return entry.ability.requiredCapability
      ? this.hasCapability(player, entry.ability.requiredCapability)
      : entry.role.id === player.roleId
  }

  public abilitiesFor(player: PlayerState): readonly AbilityDefinition[] {
    return [...this.#abilities.values()]
      .filter(({ ability }) => this.canUseAbility(player, ability.id))
      .map(({ ability }) => ability)
  }

  public abilityIdsForCapability(capabilityId: CapabilityId): readonly AbilityId[] {
    return [...this.#abilities.values()]
      .filter(({ ability }) => ability.requiredCapability === capabilityId)
      .map(({ ability }) => ability.id)
  }

  public list(): readonly Role[] {
    return [...this.#roles.values()]
  }
}
