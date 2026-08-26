import { CapabilityIdSchema } from '@agentwolf/contracts'

export const classicCapabilities = {
  wolfCouncil: CapabilityIdSchema.parse('capability-wolf-council'),
  wolfKill: CapabilityIdSchema.parse('capability-wolf-kill'),
  wolfSelfDestruct: CapabilityIdSchema.parse('capability-wolf-self-destruct'),
  seerInspect: CapabilityIdSchema.parse('capability-seer-inspect'),
  witchAntidote: CapabilityIdSchema.parse('capability-witch-antidote'),
  witchPoison: CapabilityIdSchema.parse('capability-witch-poison'),
  hunterShot: CapabilityIdSchema.parse('capability-hunter-shot'),
  idiotExilePrevention: CapabilityIdSchema.parse('capability-idiot-exile-prevention'),
  guardProtect: CapabilityIdSchema.parse('capability-guard-protect'),
  exactRoleInspect: CapabilityIdSchema.parse('capability-exact-role-inspect'),
  whiteWolfDetonate: CapabilityIdSchema.parse('capability-white-wolf-detonate'),
  awakenedHiddenWolfLearn: CapabilityIdSchema.parse('capability-awakened-hidden-wolf-learn'),
  awakenedHiddenWolfInspect: CapabilityIdSchema.parse('capability-awakened-hidden-wolf-inspect'),
  awakenedHiddenWolfPoison: CapabilityIdSchema.parse('capability-awakened-hidden-wolf-poison'),
  awakenedHiddenWolfShield: CapabilityIdSchema.parse('capability-awakened-hidden-wolf-shield'),
  awakenedHiddenWolfKill: CapabilityIdSchema.parse('capability-awakened-hidden-wolf-kill'),
  awakenedHiddenWolfDoubleKill: CapabilityIdSchema.parse(
    'capability-awakened-hidden-wolf-double-kill',
  ),
} as const
