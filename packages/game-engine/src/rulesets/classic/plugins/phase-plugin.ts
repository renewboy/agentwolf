import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { classicPluginIds } from './ids.js'
import { phase } from './shared.js'

export const classicPhasePlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.phases,
  version: 1,
  register: ({ phases }) =>
    phases.configure({ id: 'classic-sheriff-v1', entry: phase('phase-night-wolf-council') }),
}
