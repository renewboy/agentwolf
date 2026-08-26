import { RulesetIdSchema } from '@agentwolf/contracts'
import type { RulePlugin } from '../../plugins/loader.js'
import { RulesetBuilder, type RulesetRuntime } from '../../plugins/ruleset.js'
import { evaluateVictory } from './victory.js'
import { registerClassicResolution } from './resolution-registry.js'
import { classicIdentityQueryPlugin } from './identity-queries.js'
import { classicDayPlugin } from './plugins/day-plugin.js'
import { classicDeathPlugin } from './plugins/death-plugin.js'
import { classicPluginIds } from './plugins/ids.js'
import { classicNightPlugin } from './plugins/night-plugin.js'
import { classicLegacyEventPlugin } from './plugins/legacy-event-plugin.js'
import { classicPhasePlugin } from './plugins/phase-plugin.js'
import {
  classicRolePlugins,
  classicV1RolePlugins,
  classicV2RolePlugins,
} from './plugins/role-plugins.js'
import { classicSheriffPlugin } from './plugins/sheriff-plugin.js'
import { classicTerminalPlugin } from './plugins/terminal-plugin.js'
import { classicV1WolfTeamPlugin, classicWolfTeamPlugin } from './plugins/wolf-team-plugin.js'

function plugins(
  rolePlugins: readonly RulePlugin<RulesetBuilder>[],
  wolfTeamPlugin: RulePlugin<RulesetBuilder>,
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
    classicNightPlugin,
    classicSheriffPlugin,
    classicDeathPlugin,
    classicDayPlugin,
    classicTerminalPlugin,
  ]
}

export function createClassicRuleset(): RulesetRuntime {
  return new RulesetBuilder({
    id: RulesetIdSchema.parse('ruleset-classic-v3'),
    version: 3,
    plugins: plugins(classicRolePlugins, classicWolfTeamPlugin),
  }).build()
}

export function createClassicV2Ruleset(): RulesetRuntime {
  return new RulesetBuilder({
    id: RulesetIdSchema.parse('ruleset-classic-v2'),
    version: 2,
    plugins: plugins(classicV2RolePlugins, classicV1WolfTeamPlugin),
  }).build()
}

export function createClassicV1Ruleset(): RulesetRuntime {
  return new RulesetBuilder({
    id: RulesetIdSchema.parse('ruleset-classic-v1'),
    version: 1,
    plugins: plugins(classicV1RolePlugins, classicV1WolfTeamPlugin),
  }).build()
}
