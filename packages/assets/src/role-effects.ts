import {
  AbilityIdSchema,
  RoleIdSchema,
  type AbilityId,
  type RoleEffectId,
  type RoleId,
} from '@agentwolf/contracts'

export interface RoleEffectDefinition {
  readonly id: RoleEffectId
  readonly roleId: RoleId | null
  readonly abilityId: AbilityId | null
  readonly labelKey: string
  readonly tier: 'medium' | 'large'
  readonly durationMs: number
}

export const roleEffectCatalog: Readonly<Record<RoleEffectId, RoleEffectDefinition>> = {
  'werewolf-attack': {
    id: 'werewolf-attack',
    roleId: RoleIdSchema.parse('role-werewolf'),
    abilityId: AbilityIdSchema.parse('ability-werewolf-kill'),
    labelKey: 'effects.werewolfAttack',
    tier: 'large',
    durationMs: 720,
  },
  'werewolf-self-destruct': {
    id: 'werewolf-self-destruct',
    roleId: RoleIdSchema.parse('role-werewolf'),
    abilityId: AbilityIdSchema.parse('ability-werewolf-self-destruct'),
    labelKey: 'effects.werewolfSelfDestruct',
    tier: 'large',
    durationMs: 760,
  },
  'seer-inspect': {
    id: 'seer-inspect',
    roleId: RoleIdSchema.parse('role-seer'),
    abilityId: AbilityIdSchema.parse('ability-seer-inspect'),
    labelKey: 'effects.seerInspect',
    tier: 'medium',
    durationMs: 560,
  },
  'witch-antidote': {
    id: 'witch-antidote',
    roleId: RoleIdSchema.parse('role-witch'),
    abilityId: AbilityIdSchema.parse('ability-witch-antidote'),
    labelKey: 'effects.witchAntidote',
    tier: 'medium',
    durationMs: 580,
  },
  'witch-poison': {
    id: 'witch-poison',
    roleId: RoleIdSchema.parse('role-witch'),
    abilityId: AbilityIdSchema.parse('ability-witch-poison'),
    labelKey: 'effects.witchPoison',
    tier: 'large',
    durationMs: 680,
  },
  'hunter-shot': {
    id: 'hunter-shot',
    roleId: RoleIdSchema.parse('role-hunter'),
    abilityId: AbilityIdSchema.parse('ability-hunter-shot'),
    labelKey: 'effects.hunterShot',
    tier: 'large',
    durationMs: 720,
  },
  'idiot-reveal': {
    id: 'idiot-reveal',
    roleId: RoleIdSchema.parse('role-idiot'),
    abilityId: null,
    labelKey: 'effects.idiotReveal',
    tier: 'large',
    durationMs: 720,
  },
  'guard-protect': {
    id: 'guard-protect',
    roleId: RoleIdSchema.parse('role-guard'),
    abilityId: AbilityIdSchema.parse('ability-guard-protect'),
    labelKey: 'effects.guardProtect',
    tier: 'medium',
    durationMs: 560,
  },
  'sheriff-elected': {
    id: 'sheriff-elected',
    roleId: null,
    abilityId: null,
    labelKey: 'effects.sheriffElected',
    tier: 'large',
    durationMs: 680,
  },
  'sheriff-transferred': {
    id: 'sheriff-transferred',
    roleId: null,
    abilityId: null,
    labelKey: 'effects.sheriffTransferred',
    tier: 'large',
    durationMs: 720,
  },
}

export const passiveRoleIds = [RoleIdSchema.parse('role-villager')] as const
