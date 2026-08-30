import { RulesetIdSchema } from '@agentwolf/contracts'
import type { RulePlugin } from '../../plugins/loader.js'
import { RulesetBuilder, type RulesetRuntime } from '../../plugins/ruleset.js'
import { evaluateVictory } from './victory.js'
import { registerClassicResolution } from './resolution-registry.js'
import { classicIdentityQueryPlugin } from './identity-queries.js'
import { classicDayPlugin, classicV1DayPlugin, classicV2DayPlugin } from './plugins/day-plugin.js'
import {
  classicDeathPlugin,
  classicV1DeathPlugin,
  classicV2DeathPlugin,
} from './plugins/death-plugin.js'
import { classicPluginIds } from './plugins/ids.js'
import {
  classicNightPlugin,
  classicV1NightPlugin,
  classicV2NightPlugin,
} from './plugins/night-plugin.js'
import { classicLegacyEventPlugin } from './plugins/legacy-event-plugin.js'
import { classicPhasePlugin } from './plugins/phase-plugin.js'
import {
  classicRolePlugins,
  classicV1RolePlugins,
  classicV2RolePlugins,
  classicV3RolePlugins,
  classicV4RolePlugins,
  classicV5RolePlugins,
} from './plugins/role-plugins.js'
import { classicSheriffPlugin } from './plugins/sheriff-plugin.js'
import { classicTerminalPlugin, classicV1TerminalPlugin } from './plugins/terminal-plugin.js'
import { classicV1WolfTeamPlugin, classicWolfTeamPlugin } from './plugins/wolf-team-plugin.js'

function plugins(
  rolePlugins: readonly RulePlugin<RulesetBuilder>[],
  wolfTeamPlugin: RulePlugin<RulesetBuilder>,
  flowPlugins: {
    readonly night: RulePlugin<RulesetBuilder>
    readonly death: RulePlugin<RulesetBuilder>
    readonly day: RulePlugin<RulesetBuilder>
    readonly terminal: RulePlugin<RulesetBuilder>
  },
): readonly RulePlugin<RulesetBuilder>[] {
  return [
    classicPhasePlugin,
    classicLegacyEventPlugin,
    classicIdentityQueryPlugin,
    ...rolePlugins,
    {
      id: classicPluginIds.resolution,
      version: 1,
      register: ({ resolution }) => registerClassicResolution(resolution),
    },
    {
      id: classicPluginIds.victory,
      version: 1,
      register: ({ victories }) => {
        victories.register({
          id: 'classic-victory',
          evaluate: ({ state, board, roles }) => evaluateVictory(state, board, roles),
        })
      },
    },
    wolfTeamPlugin,
    flowPlugins.night,
    classicSheriffPlugin,
    flowPlugins.death,
    flowPlugins.day,
    flowPlugins.terminal,
  ]
}

const currentFlowPlugins = {
  night: classicNightPlugin,
  death: classicDeathPlugin,
  day: classicDayPlugin,
  terminal: classicTerminalPlugin,
} as const

const v2FlowPlugins = {
  night: classicV2NightPlugin,
  death: classicV2DeathPlugin,
  day: classicV2DayPlugin,
  terminal: classicTerminalPlugin,
} as const

const legacyFlowPlugins = {
  night: classicV1NightPlugin,
  death: classicV1DeathPlugin,
  day: classicV1DayPlugin,
  terminal: classicV1TerminalPlugin,
} as const

export function createClassicRuleset(): RulesetRuntime {
  return new RulesetBuilder({
    id: RulesetIdSchema.parse('ruleset-classic-v6'),
    version: 6,
    plugins: plugins(classicRolePlugins, classicWolfTeamPlugin, currentFlowPlugins),
  }).build()
}

export function createClassicV5Ruleset(): RulesetRuntime {
  return new RulesetBuilder({
    id: RulesetIdSchema.parse('ruleset-classic-v5'),
    version: 5,
    plugins: plugins(classicV5RolePlugins, classicWolfTeamPlugin, v2FlowPlugins),
  }).build()
}

export function createClassicV4Ruleset(): RulesetRuntime {
  return new RulesetBuilder({
    id: RulesetIdSchema.parse('ruleset-classic-v4'),
    version: 4,
    plugins: plugins(classicV4RolePlugins, classicWolfTeamPlugin, v2FlowPlugins),
  }).build()
}

export function createClassicV3Ruleset(): RulesetRuntime {
  return new RulesetBuilder({
    id: RulesetIdSchema.parse('ruleset-classic-v3'),
    version: 3,
    plugins: plugins(classicV3RolePlugins, classicWolfTeamPlugin, legacyFlowPlugins),
  }).build()
}

export function createClassicV2Ruleset(): RulesetRuntime {
  return new RulesetBuilder({
    id: RulesetIdSchema.parse('ruleset-classic-v2'),
    version: 2,
    plugins: plugins(classicV2RolePlugins, classicV1WolfTeamPlugin, legacyFlowPlugins),
  }).build()
}

export function createClassicV1Ruleset(): RulesetRuntime {
  return new RulesetBuilder({
    id: RulesetIdSchema.parse('ruleset-classic-v1'),
    version: 1,
    plugins: plugins(classicV1RolePlugins, classicV1WolfTeamPlugin, legacyFlowPlugins),
  }).build()
}
