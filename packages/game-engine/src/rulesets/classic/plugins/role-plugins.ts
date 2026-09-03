import { TriggerIdSchema } from '@agentwolf/contracts'
import type { RulePlugin } from '../../../plugins/loader.js'
import type { EndgameRoleModel } from '../../../plugins/endgame-registry.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { visibility } from '../../../rule-registry.js'
import { GuardRole } from '../roles/guard.js'
import { HunterRole, hunterCanFire } from '../roles/hunter.js'
import { IdiotRole } from '../roles/idiot.js'
import { SeerRole } from '../roles/seer.js'
import { VillagerRole } from '../roles/villager.js'
import { WerewolfRole } from '../roles/werewolf.js'
import { WitchRole } from '../roles/witch.js'
import { classicCapabilities } from '../capabilities.js'
import { v1AbilityIds } from '../ability-ids.js'
import {
  MagicMirrorGirlRole,
  magicMirrorInspectedEventType,
  magicMirrorInspectionDataSchema,
  magicMirrorStateSchema,
} from '../roles/magic-mirror-girl.js'
import {
  WhiteWolfKingRole,
  whiteWolfDetonatedEventType,
  whiteWolfDetonationDataSchema,
  whiteWolfStateSchema,
} from '../roles/white-wolf-king.js'
import { awakenedHiddenWolfPlugin } from './awakened-hidden-wolf-plugin.js'
import { cupidPlugin } from './cupid-plugin.js'
import { thiefPlugin } from './thief-plugin.js'
import { classicPluginIds } from './ids.js'
import { phase } from './shared.js'

const classicBaseRolePlugins: readonly RulePlugin<RulesetBuilder>[] = [
  rolePlugin(classicPluginIds.villager, () => new VillagerRole()),
  rolePlugin(classicPluginIds.werewolf, () => new WerewolfRole(), {
    endgame: { wolfControl: 'shared-faction' },
  }),
  rolePlugin(classicPluginIds.seer, () => new SeerRole(), {
    insertion: {
      node: {
        id: phase('phase-night-seer'),
        labelKey: 'phases.nightSeer',
        mode: 'parallel',
        action: {
          type: 'night-action',
          abilityIds: [],
          capabilityIds: [classicCapabilities.seerInspect],
          visibility: 'actor',
        },
        actorSelector: `capability-alive:${classicCapabilities.seerInspect}`,
        activeWhen: `capability-active:${classicCapabilities.seerInspect}`,
        edges: [],
      },
      after: phase('phase-night-witch'),
      before: phase('phase-night-resolve'),
    },
  }),
  rolePlugin(classicPluginIds.witch, () => new WitchRole(), {
    endgame: { wolfControl: 'none', traits: { witchPotions: true } },
    insertion: {
      node: {
        id: phase('phase-night-witch'),
        labelKey: 'phases.nightWitch',
        mode: 'parallel',
        action: {
          type: 'night-action',
          abilityIds: [],
          capabilityIds: [classicCapabilities.witchAntidote, classicCapabilities.witchPoison],
          visibility: 'actor',
        },
        actorSelector: `capability-alive:${classicCapabilities.witchAntidote}`,
        activeWhen: `capability-active:${classicCapabilities.witchAntidote}`,
        edges: [],
      },
      after: phase('phase-night-wolf-vote'),
      before: phase('phase-night-resolve'),
    },
  }),
  {
    id: classicPluginIds.hunter,
    version: 1,
    register: ({ endgames, roles, triggers }) => {
      const role = new HunterRole()
      roles.register(role)
      endgames.registerRole(endgameModel(role, { traits: { hunterShot: true } }))
      triggers.registerDecision({
        id: TriggerIdSchema.parse('trigger-hunter-shot'),
        signal: 'player-death',
        abilityId: v1AbilityIds.hunterShot,
        eligible: hunterCanFire,
      })
    },
  },
  {
    id: classicPluginIds.idiot,
    version: 1,
    register: ({ endgames, roles, rules }) => {
      const role = new IdiotRole()
      roles.register(role)
      endgames.registerRole(endgameModel(role, { traits: { exilePrevention: true } }))
      rules.registerPhaseHandler(
        phase('phase-day-resolve'),
        (runtime) => {
          const targetId = runtime.state.lastVote?.selectedPlayerId
          if (!targetId) return
          const target = runtime.state.players.get(targetId)
          if (
            !target ||
            !runtime.roles.hasCapability(target, classicCapabilities.idiotExilePrevention) ||
            target.roleState.memory['idiot.revealed'] === true
          ) {
            return
          }
          runtime.append(
            { type: 'exile.prevented', playerId: targetId, reason: 'role-exile-prevention' },
            visibility.god,
          )
          runtime.append({ type: 'idiot.revealed', playerId: targetId }, visibility.public)
          runtime.append(
            {
              type: 'public.announcement',
              code: 'idiot-survived',
              playerIds: [targetId],
              params: {},
            },
            visibility.public,
          )
        },
        { id: 'idiot-exile-prevention', order: -100 },
      )
    },
  },
  rolePlugin(classicPluginIds.guard, () => new GuardRole(), {
    endgame: {
      wolfControl: 'none',
      traits: { nightProtection: 'no-consecutive-target' },
    },
    insertion: {
      node: {
        id: phase('phase-night-guard'),
        labelKey: 'phases.nightGuard',
        mode: 'parallel',
        action: {
          type: 'night-action',
          abilityIds: [],
          capabilityIds: [classicCapabilities.guardProtect],
          visibility: 'actor',
        },
        actorSelector: `capability-alive:${classicCapabilities.guardProtect}`,
        activeWhen: `capability-active:${classicCapabilities.guardProtect}`,
        edges: [],
      },
      after: null,
      before: phase('phase-night-wolf-council'),
    },
  }),
  {
    id: classicPluginIds.magicMirrorGirl,
    version: 1,
    register: ({ events, phases, roles }) => {
      roles.register(new MagicMirrorGirlRole())
      phases.insert({
        node: {
          id: phase('phase-night-magic-mirror'),
          labelKey: 'phases.nightMagicMirror',
          mode: 'parallel',
          action: {
            type: 'night-action',
            abilityIds: [],
            capabilityIds: [classicCapabilities.exactRoleInspect],
            visibility: 'actor',
          },
          actorSelector: `capability-alive:${classicCapabilities.exactRoleInspect}`,
          activeWhen: `capability-active:${classicCapabilities.exactRoleInspect}`,
          edges: [],
        },
        after: phase('phase-night-seer'),
        before: phase('phase-night-resolve'),
      })
      events.register({
        pluginId: classicPluginIds.magicMirrorGirl,
        eventType: magicMirrorInspectedEventType,
        schemaVersion: 1,
        stateSchema: magicMirrorStateSchema,
        dataSchema: magicMirrorInspectionDataSchema,
        initialState: { inspections: [] },
        reduce: (state, data) => ({ inspections: [...state.inspections, data] }),
      })
    },
  },
  {
    id: classicPluginIds.whiteWolfKing,
    version: 1,
    register: ({ endgames, events, roles }) => {
      const role = new WhiteWolfKingRole()
      roles.register(role)
      endgames.registerRole(endgameModel(role, { wolfControl: 'shared-faction' }))
      events.register({
        pluginId: classicPluginIds.whiteWolfKing,
        eventType: whiteWolfDetonatedEventType,
        schemaVersion: 1,
        stateSchema: whiteWolfStateSchema,
        dataSchema: whiteWolfDetonationDataSchema,
        initialState: { detonations: [] },
        reduce: (state, data) => ({ detonations: [...state.detonations, data] }),
      })
    },
  },
  awakenedHiddenWolfPlugin,
]

export const classicRolePlugins: readonly RulePlugin<RulesetBuilder>[] = [
  ...classicBaseRolePlugins,
  cupidPlugin,
  thiefPlugin,
]

function rolePlugin(
  id: (typeof classicPluginIds)[keyof typeof classicPluginIds],
  create: () => import('../../../roles/base.js').Role,
  options: {
    readonly insertion?: import('../../../plugins/phase-registry.js').PhaseInsertion
    readonly endgame?: EndgameModelInput
  } = {},
): RulePlugin<RulesetBuilder> {
  return {
    id,
    version: 1,
    register: ({ endgames, phases, roles }) => {
      const role = create()
      roles.register(role)
      if (options.endgame) endgames.registerRole(endgameModel(role, options.endgame))
      if (options.insertion) phases.insert(options.insertion)
    },
  }
}

function endgameModel(
  role: import('../../../roles/base.js').Role,
  model: EndgameModelInput,
): EndgameRoleModel {
  return {
    roleId: role.id,
    materialAbilityIds: role.abilities
      .filter((ability) => ability.endgameImpact === 'material')
      .map((ability) => ability.id),
    knowledgeAbilityIds: [],
    wolfControl: 'none',
    ...model,
  }
}

type EndgameModelInput = Omit<
  EndgameRoleModel,
  'roleId' | 'materialAbilityIds' | 'knowledgeAbilityIds' | 'wolfControl'
> & {
  readonly wolfControl?: EndgameRoleModel['wolfControl']
  readonly knowledgeAbilityIds?: EndgameRoleModel['knowledgeAbilityIds']
}
