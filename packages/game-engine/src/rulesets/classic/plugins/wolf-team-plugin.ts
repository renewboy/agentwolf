import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { visibility } from '../../../rule-registry.js'
import { emitVoteResolution } from '../../../vote-resolution.js'
import { classicCapabilities } from '../capabilities.js'
import { classicPluginIds } from './ids.js'
import { phase } from './shared.js'

export const classicWolfTeamPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.wolfTeam,
  version: 1,
  requires: [{ id: classicPluginIds.werewolf, version: 1 }],
  register: ({ rules }) => {
    rules.registerPhaseHandler(
      phase('phase-night-wolf-vote'),
      (runtime) => {
        const targetId = emitVoteResolution(
          runtime,
          'wolf-kill',
          false,
          visibility.faction('werewolf'),
          `${runtime.state.matchId}:night:${runtime.state.night}:wolf-kill`,
        )
        const [antidoteAbilityId] = runtime.roles.abilityIdsForCapability(
          classicCapabilities.witchAntidote,
        )
        const recipients = [...runtime.state.players.values()]
          .filter(
            (player) =>
              player.alive &&
              (runtime.roles.hasCapability(player, classicCapabilities.wolfKill) ||
                (antidoteAbilityId !== undefined &&
                  runtime.roles.hasCapability(player, classicCapabilities.witchAntidote) &&
                  (player.roleState.abilityUses[antidoteAbilityId] ?? 0) === 0)),
          )
          .map((player) => player.id)
        runtime.append({ type: 'night.attack-selected', targetId }, visibility.players(recipients))
      },
      { id: 'classic-wolf-kill-vote' },
    )
  },
}
