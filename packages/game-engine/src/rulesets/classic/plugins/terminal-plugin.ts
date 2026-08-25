import { assertRule } from '../../../errors.js'
import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { appendFinalRoleReveals } from '../../../role-reveal.js'
import { visibility } from '../../../rule-registry.js'
import { classicPluginIds } from './ids.js'
import { phase } from './shared.js'

export const classicTerminalPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.terminal,
  version: 1,
  requires: [{ id: classicPluginIds.victory, version: 1 }],
  register: ({ phases, rules }) => {
    phases.register({
      id: phase('phase-match-ended'),
      labelKey: 'phases.matchEnded',
      mode: 'automatic',
      edges: [],
    })
    rules.registerPredicate('has-winner', (runtime) =>
      Boolean(
        runtime.victories.evaluate({
          state: runtime.state,
          board: runtime.board,
          roles: runtime.roles,
        }),
      ),
    )
    rules.registerPredicate('interrupted-to-night', (runtime) => runtime.state.interruptToNight)
    rules.registerPhaseHandler(
      phase('phase-match-ended'),
      (runtime) => {
        const victory = runtime.victories.evaluate({
          state: runtime.state,
          board: runtime.board,
          roles: runtime.roles,
        })
        assertRule(victory, 'Match ended phase requires a winner')
        runtime.append(
          { type: 'match.ended', winner: victory.winner, reason: victory.reason },
          visibility.public,
        )
        appendFinalRoleReveals(runtime)
      },
      { id: 'classic-match-ended' },
    )
  },
}
