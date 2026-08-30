import { TriggerIdSchema } from '@agentwolf/contracts'
import type { RulePlugin } from '../../../plugins/loader.js'
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
import {
  awakenedHiddenWolfPlugin,
  awakenedHiddenWolfV2Plugin,
} from './awakened-hidden-wolf-plugin.js'
import { cupidPlugin, cupidV1Plugin } from './cupid-plugin.js'
import { classicPluginIds } from './ids.js'
import { phase } from './shared.js'

export const classicV3RolePlugins: readonly RulePlugin<RulesetBuilder>[] = [
  rolePlugin(classicPluginIds.villager, () => new VillagerRole()),
  rolePlugin(classicPluginIds.werewolf, () => new WerewolfRole()),
  rolePlugin(classicPluginIds.seer, () => new SeerRole(), {
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
  }),
  rolePlugin(classicPluginIds.witch, () => new WitchRole(), {
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
  }),
  {
    id: classicPluginIds.hunter,
    version: 1,
    register: ({ roles, triggers }) => {
      roles.register(new HunterRole())
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
    register: ({ roles, rules }) => {
      roles.register(new IdiotRole())
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
    register: ({ events, roles }) => {
      roles.register(new WhiteWolfKingRole())
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

const classicCurrentBaseRolePlugins: readonly RulePlugin<RulesetBuilder>[] = [
  ...classicV3RolePlugins.filter((plugin) => plugin.id !== classicPluginIds.awakenedHiddenWolf),
  awakenedHiddenWolfV2Plugin,
]

export const classicV4RolePlugins: readonly RulePlugin<RulesetBuilder>[] = [
  ...classicCurrentBaseRolePlugins,
  cupidV1Plugin,
]

export const classicRolePlugins: readonly RulePlugin<RulesetBuilder>[] = [
  ...classicCurrentBaseRolePlugins,
  cupidPlugin,
]

export const classicV2RolePlugins = classicV3RolePlugins.filter(
  (plugin) => plugin.id !== classicPluginIds.awakenedHiddenWolf,
)

export const classicV1RolePlugins = classicV2RolePlugins.filter(
  (plugin) =>
    plugin.id !== classicPluginIds.magicMirrorGirl && plugin.id !== classicPluginIds.whiteWolfKing,
)

function rolePlugin(
  id: (typeof classicPluginIds)[keyof typeof classicPluginIds],
  create: () => import('../../../roles/base.js').Role,
  insertion?: import('../../../plugins/phase-registry.js').PhaseInsertion,
): RulePlugin<RulesetBuilder> {
  return {
    id,
    version: 1,
    register: ({ phases, roles }) => {
      roles.register(create())
      if (insertion) phases.insert(insertion)
    },
  }
}
