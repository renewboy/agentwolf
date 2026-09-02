import { RoleIdSchema } from '@agentwolf/contracts'
import { Role } from '../../../roles/base.js'

export class VillagerRole extends Role {
  public readonly id = RoleIdSchema.parse('role-villager')
  public readonly displayNameKey = 'roles.villager'
  public readonly faction = 'village' as const
  public readonly kind = 'villager' as const
  public readonly endgameModel = 'inert' as const
  public readonly abilities = []
}
