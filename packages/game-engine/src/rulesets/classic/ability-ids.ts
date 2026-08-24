import { AbilityIdSchema } from '@agentwolf/contracts'

export const v1AbilityIds = {
  werewolfKill: AbilityIdSchema.parse('ability-werewolf-kill'),
  guardProtect: AbilityIdSchema.parse('ability-guard-protect'),
  witchAntidote: AbilityIdSchema.parse('ability-witch-antidote'),
  witchPoison: AbilityIdSchema.parse('ability-witch-poison'),
  seerInspect: AbilityIdSchema.parse('ability-seer-inspect'),
  hunterShot: AbilityIdSchema.parse('ability-hunter-shot'),
  werewolfSelfDestruct: AbilityIdSchema.parse('ability-werewolf-self-destruct'),
} as const
