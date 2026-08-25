import { RoleIdSchema } from '@agentwolf/contracts'
import { Role } from '../../../roles/base.js'
import { classicCapabilities } from '../capabilities.js'

export class IdiotRole extends Role {
  public readonly id = RoleIdSchema.parse('role-idiot')
  public readonly displayNameKey = 'roles.idiot'
  public readonly faction = 'village' as const
  public readonly kind = 'god' as const
  public override readonly capabilities = [classicCapabilities.idiotExilePrevention] as const
  public readonly abilities = []

  public canPreventExile(revealed: boolean): boolean {
    return !revealed
  }
}
