import { RoleIdSchema } from '@agentwolf/contracts'
import { Role } from './base.js'

export class IdiotRole extends Role {
  public readonly id = RoleIdSchema.parse('role-idiot')
  public readonly displayNameKey = 'roles.idiot'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public readonly abilities = []

  public canPreventExile(revealed: boolean): boolean {
    return !revealed
  }
}
