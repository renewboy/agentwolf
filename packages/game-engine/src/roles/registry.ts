import type { AbilityId, RoleId } from '@agentwolf/contracts'
import { assertRule } from '../errors.js'
import type { AbilityDefinition } from './base.js'
import type { Role } from './base.js'
import { GuardRole } from './guard.js'
import { HunterRole } from './hunter.js'
import { IdiotRole } from './idiot.js'
import { SeerRole } from './seer.js'
import { VillagerRole } from './villager.js'
import { WerewolfRole } from './werewolf.js'
import { WitchRole } from './witch.js'

export class RoleRegistry {
  readonly #roles = new Map<RoleId, Role>()
  readonly #abilities = new Map<AbilityId, { role: Role; ability: AbilityDefinition }>()

  public register(role: Role): void {
    assertRule(!this.#roles.has(role.id), `Duplicate role ${role.id}`)
    this.#roles.set(role.id, role)
    for (const ability of role.abilities) {
      assertRule(!this.#abilities.has(ability.id), `Duplicate ability ${ability.id}`)
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

  public list(): readonly Role[] {
    return [...this.#roles.values()]
  }
}

export function createV1RoleRegistry(): RoleRegistry {
  const registry = new RoleRegistry()
  registry.register(new VillagerRole())
  registry.register(new WerewolfRole())
  registry.register(new SeerRole())
  registry.register(new WitchRole())
  registry.register(new HunterRole())
  registry.register(new IdiotRole())
  registry.register(new GuardRole())
  return registry
}
