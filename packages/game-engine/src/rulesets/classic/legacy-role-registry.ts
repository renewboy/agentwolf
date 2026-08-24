import { RoleRegistry } from '../../roles/registry.js'
import { GuardRole } from './roles/guard.js'
import { HunterRole } from './roles/hunter.js'
import { IdiotRole } from './roles/idiot.js'
import { SeerRole } from './roles/seer.js'
import { VillagerRole } from './roles/villager.js'
import { WerewolfRole } from './roles/werewolf.js'
import { WitchRole } from './roles/witch.js'

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
