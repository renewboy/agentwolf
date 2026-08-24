import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { classicBasePhaseGraph } from '../phase-graph.js'
import { classicPluginIds } from './ids.js'

export const classicPhasePlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.phases,
  version: 1,
  register: ({ phases }) => phases.registerBase(classicBasePhaseGraph),
}
