import {
  AbilityIdSchema,
  RoleIdSchema,
  type AbilityId,
  type RoleEffectId,
  type RoleId,
} from '@agentwolf/contracts'
import { getCopy } from './catalog.js'
import roleMaterials from '../art/roles/manifest.json' with { type: 'json' }

export interface RoleEffectDefinition {
  readonly id: RoleEffectId
  readonly roleId: RoleId | null
  readonly abilityId: AbilityId | null
  readonly labelKey: string
  readonly tier: 'medium' | 'large'
  readonly family:
    | 'claw'
    | 'burst'
    | 'inspect'
    | 'medicine'
    | 'ward'
    | 'shot'
    | 'reveal'
    | 'crown'
    | 'bond'
    | 'cards'
  readonly durationMs: number
  readonly icon:
    | 'moon'
    | 'skull'
    | 'eye'
    | 'sparkle'
    | 'drop'
    | 'crosshair'
    | 'smile'
    | 'shield'
    | 'crown'
    | 'transfer'
    | 'mirror'
    | 'burst'
    | 'heart'
    | 'cards'
}

export const roleEffectCatalog: Readonly<Record<string, RoleEffectDefinition>> = {
  'werewolf-attack': {
    id: 'werewolf-attack',
    roleId: RoleIdSchema.parse('role-werewolf'),
    abilityId: AbilityIdSchema.parse('ability-werewolf-kill'),
    labelKey: 'effects.werewolfAttack',
    tier: 'large',
    durationMs: 2500,
    family: 'claw',
    icon: 'moon',
  },
  'werewolf-self-destruct': {
    id: 'werewolf-self-destruct',
    roleId: RoleIdSchema.parse('role-werewolf'),
    abilityId: AbilityIdSchema.parse('ability-werewolf-self-destruct'),
    labelKey: 'effects.werewolfSelfDestruct',
    tier: 'large',
    durationMs: 2500,
    family: 'burst',
    icon: 'skull',
  },
  'seer-inspect': {
    id: 'seer-inspect',
    roleId: RoleIdSchema.parse('role-seer'),
    abilityId: AbilityIdSchema.parse('ability-seer-inspect'),
    labelKey: 'effects.seerInspect',
    tier: 'medium',
    durationMs: 2500,
    family: 'inspect',
    icon: 'eye',
  },
  'witch-antidote': {
    id: 'witch-antidote',
    roleId: RoleIdSchema.parse('role-witch'),
    abilityId: AbilityIdSchema.parse('ability-witch-antidote'),
    labelKey: 'effects.witchAntidote',
    tier: 'medium',
    durationMs: 2500,
    family: 'medicine',
    icon: 'sparkle',
  },
  'witch-poison': {
    id: 'witch-poison',
    roleId: RoleIdSchema.parse('role-witch'),
    abilityId: AbilityIdSchema.parse('ability-witch-poison'),
    labelKey: 'effects.witchPoison',
    tier: 'large',
    durationMs: 2500,
    family: 'medicine',
    icon: 'drop',
  },
  'hunter-shot': {
    id: 'hunter-shot',
    roleId: RoleIdSchema.parse('role-hunter'),
    abilityId: AbilityIdSchema.parse('ability-hunter-shot'),
    labelKey: 'effects.hunterShot',
    tier: 'large',
    durationMs: 2500,
    family: 'shot',
    icon: 'crosshair',
  },
  'idiot-reveal': {
    id: 'idiot-reveal',
    roleId: RoleIdSchema.parse('role-idiot'),
    abilityId: null,
    labelKey: 'effects.idiotReveal',
    tier: 'large',
    durationMs: 2500,
    family: 'reveal',
    icon: 'smile',
  },
  'guard-protect': {
    id: 'guard-protect',
    roleId: RoleIdSchema.parse('role-guard'),
    abilityId: AbilityIdSchema.parse('ability-guard-protect'),
    labelKey: 'effects.guardProtect',
    tier: 'medium',
    durationMs: 2500,
    family: 'ward',
    icon: 'shield',
  },
  'sheriff-elected': {
    id: 'sheriff-elected',
    roleId: null,
    abilityId: null,
    labelKey: 'effects.sheriffElected',
    tier: 'large',
    durationMs: 2500,
    family: 'crown',
    icon: 'crown',
  },
  'sheriff-transferred': {
    id: 'sheriff-transferred',
    roleId: null,
    abilityId: null,
    labelKey: 'effects.sheriffTransferred',
    tier: 'large',
    durationMs: 3000,
    family: 'crown',
    icon: 'transfer',
  },
  'magic-mirror-inspect': {
    id: 'magic-mirror-inspect',
    roleId: RoleIdSchema.parse('role-magic-mirror-girl'),
    abilityId: AbilityIdSchema.parse('ability-magic-mirror-inspect'),
    labelKey: 'effects.magicMirrorInspect',
    tier: 'medium',
    durationMs: 2500,
    family: 'inspect',
    icon: 'mirror',
  },
  'white-wolf-detonate': {
    id: 'white-wolf-detonate',
    roleId: RoleIdSchema.parse('role-white-wolf-king'),
    abilityId: AbilityIdSchema.parse('ability-white-wolf-detonate'),
    labelKey: 'effects.whiteWolfDetonate',
    tier: 'large',
    durationMs: 3000,
    family: 'burst',
    icon: 'burst',
  },
  'awakened-hidden-wolf-learn': {
    id: 'awakened-hidden-wolf-learn',
    roleId: RoleIdSchema.parse('role-awakened-hidden-wolf'),
    abilityId: AbilityIdSchema.parse('ability-awakened-hidden-wolf-learn'),
    labelKey: 'effects.awakenedHiddenWolfLearn',
    tier: 'medium',
    durationMs: 2500,
    family: 'inspect',
    icon: 'eye',
  },
  'awakened-hidden-wolf-inspect': {
    id: 'awakened-hidden-wolf-inspect',
    roleId: RoleIdSchema.parse('role-awakened-hidden-wolf'),
    abilityId: AbilityIdSchema.parse('ability-awakened-hidden-wolf-inspect'),
    labelKey: 'effects.awakenedHiddenWolfInspect',
    tier: 'medium',
    durationMs: 2500,
    family: 'inspect',
    icon: 'mirror',
  },
  'awakened-hidden-wolf-poison': {
    id: 'awakened-hidden-wolf-poison',
    roleId: RoleIdSchema.parse('role-awakened-hidden-wolf'),
    abilityId: AbilityIdSchema.parse('ability-awakened-hidden-wolf-poison'),
    labelKey: 'effects.awakenedHiddenWolfPoison',
    tier: 'large',
    durationMs: 2500,
    family: 'medicine',
    icon: 'drop',
  },
  'awakened-hidden-wolf-shield': {
    id: 'awakened-hidden-wolf-shield',
    roleId: RoleIdSchema.parse('role-awakened-hidden-wolf'),
    abilityId: AbilityIdSchema.parse('ability-awakened-hidden-wolf-shield'),
    labelKey: 'effects.awakenedHiddenWolfShield',
    tier: 'medium',
    durationMs: 2500,
    family: 'ward',
    icon: 'shield',
  },
  'awakened-hidden-wolf-attack': {
    id: 'awakened-hidden-wolf-attack',
    roleId: RoleIdSchema.parse('role-awakened-hidden-wolf'),
    abilityId: AbilityIdSchema.parse('ability-awakened-hidden-wolf-kill'),
    labelKey: 'effects.awakenedHiddenWolfKill',
    tier: 'large',
    durationMs: 2500,
    family: 'claw',
    icon: 'moon',
  },
  'awakened-hidden-wolf-double-attack': {
    id: 'awakened-hidden-wolf-double-attack',
    roleId: RoleIdSchema.parse('role-awakened-hidden-wolf'),
    abilityId: AbilityIdSchema.parse('ability-awakened-hidden-wolf-double-kill'),
    labelKey: 'effects.awakenedHiddenWolfDoubleKill',
    tier: 'large',
    durationMs: 3000,
    family: 'claw',
    icon: 'burst',
  },
  'cupid-link': {
    id: 'cupid-link',
    roleId: RoleIdSchema.parse('role-cupid'),
    abilityId: AbilityIdSchema.parse('ability-cupid-link'),
    labelKey: 'effects.cupidLink',
    tier: 'medium',
    durationMs: 3000,
    family: 'bond',
    icon: 'heart',
  },
  'cupid-linked-death': {
    id: 'cupid-linked-death',
    roleId: RoleIdSchema.parse('role-cupid'),
    abilityId: null,
    labelKey: 'effects.cupidLinkedDeath',
    tier: 'large',
    durationMs: 3000,
    family: 'bond',
    icon: 'heart',
  },
  'thief-choose-card': {
    id: 'thief-choose-card',
    roleId: RoleIdSchema.parse('role-thief'),
    abilityId: AbilityIdSchema.parse('ability-thief-choose-card'),
    labelKey: 'effects.thiefChooseCard',
    tier: 'medium',
    durationMs: 2500,
    family: 'cards',
    icon: 'cards',
  },
}

export const passiveRoleIds = [RoleIdSchema.parse('role-villager')] as const

export function getRoleEffectDefinition(id: RoleEffectId): RoleEffectDefinition {
  const definition = roleEffectCatalog[id]
  if (!definition) throw new Error(`Unknown role effect ${id}`)
  return definition
}

export function getRoleEffectOutcome(
  effectId: RoleEffectId,
  variant: string | null,
): {
  readonly label: string
  readonly roleId: RoleId | null
} | null {
  if (effectId === 'seer-inspect' && (variant === 'werewolf' || variant === 'village')) {
    return { label: getCopy(`factions.${variant}`), roleId: null }
  }
  const revealedRole =
    effectId === 'idiot-reveal'
      ? 'role-idiot'
      : [
            'magic-mirror-inspect',
            'awakened-hidden-wolf-inspect',
            'awakened-hidden-wolf-learn',
            'thief-choose-card',
          ].includes(effectId)
        ? variant
        : null
  const material = roleMaterials.roles.find(
    (role) => role.id === revealedRole && role.id !== 'hidden',
  )
  return material ? { label: material.label, roleId: RoleIdSchema.parse(material.id) } : null
}
