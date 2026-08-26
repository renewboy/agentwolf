import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { visibility } from '../../../rule-registry.js'
import { emitVoteResolution } from '../../../vote-resolution.js'
import { classicCapabilities } from '../capabilities.js'
import { v1AbilityIds } from '../ability-ids.js'
import { classicPluginIds } from './ids.js'
import { phase } from './shared.js'

export const classicWolfTeamPlugin = wolfTeamPlugin(2, true)
export const classicV1WolfTeamPlugin = wolfTeamPlugin(1, false)

function wolfTeamPlugin(version: number, actorScoped: boolean): RulePlugin<RulesetBuilder> {
  const actionVisibility = actorScoped
    ? ('actors' as const)
    : { kind: 'faction' as const, faction: 'werewolf' as const }
  return {
    id: classicPluginIds.wolfTeam,
    version,
    requires: [{ id: classicPluginIds.werewolf, version: 1 }],
    register: ({ phases, rules }) => {
      phases.registerAll([
        {
          id: phase('phase-night-wolf-council'),
          labelKey: 'phases.nightWolfCouncil',
          mode: 'sequential',
          action: {
            type: 'speech',
            kind: 'wolf-council',
            visibility: actionVisibility,
          },
          actorSelector: `capability-alive:${classicCapabilities.wolfCouncil}`,
          edges: [{ to: phase('phase-night-wolf-vote') }],
        },
        {
          id: phase('phase-night-wolf-vote'),
          labelKey: 'phases.nightWolfVote',
          mode: 'parallel',
          action: {
            type: 'vote',
            kind: 'wolf-kill',
            visibility: actionVisibility,
            abilityId: v1AbilityIds.werewolfKill,
          },
          actorSelector: `capability-alive:${classicCapabilities.wolfKill}`,
          edges: [{ to: phase('phase-night-resolve') }],
        },
      ])
      rules.registerPhaseHandler(
        phase('phase-night-wolf-vote'),
        (runtime) => {
          const voteVisibility = actorScoped
            ? runtime.state.phaseActors.length > 0
              ? visibility.players(runtime.state.phaseActors)
              : visibility.god
            : visibility.faction('werewolf')
          const targetId = emitVoteResolution(
            runtime,
            'wolf-kill',
            false,
            voteVisibility,
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
          if (recipients.length > 0) {
            runtime.append(
              { type: 'night.attack-selected', targetId },
              visibility.players(recipients),
            )
          }
        },
        { id: 'classic-wolf-kill-vote' },
      )
    },
  }
}
