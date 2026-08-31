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
import { classicRolePlugins } from './plugins/role-plugins.js'
import { classicSheriffPlugin } from './plugins/sheriff-plugin.js'
import { classicTerminalPlugin } from './plugins/terminal-plugin.js'
import { classicWolfTeamPlugin } from './plugins/wolf-team-plugin.js'

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

const flowPlugins = {
  night: classicNightPlugin,
  death: classicDeathPlugin,
  day: classicDayPlugin,
  terminal: classicTerminalPlugin,
} as const

export function createClassicRuleset(): RulesetRuntime {
  return new RulesetBuilder({
    id: RulesetIdSchema.parse('ruleset-classic'),
    revision: 7,
    plugins: plugins(classicRolePlugins, classicWolfTeamPlugin, flowPlugins),
  }).build()
}
