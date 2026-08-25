import { coreGameEventTypes } from '@agentwolf/contracts'
import {
  loadPromptBundles,
  type PromptBundleRegistry,
  type PromptSemanticInventory,
} from '@agentwolf/assets/prompts'
import type { RulesetRuntime } from '@agentwolf/game-engine'

const registries = new WeakMap<RulesetRuntime, PromptBundleRegistry>()

export function promptRegistryFor(ruleset: RulesetRuntime): PromptBundleRegistry {
  const existing = registries.get(ruleset)
  if (existing) return existing
  const registry = loadPromptBundles(promptInventory(ruleset))
  registries.set(ruleset, registry)
  return registry
}

export function promptInventory(ruleset: RulesetRuntime): PromptSemanticInventory {
  return {
    plugins: ruleset.plugins.map((plugin) => plugin.id),
    contributions: ruleset.contributions.map((contribution) => ({
      pluginId: contribution.pluginId,
      roleIds: contribution.roleIds,
      abilityIds: contribution.abilityIds,
      phaseIds: contribution.phaseIds,
      pluginEvents: contribution.pluginEvents,
    })),
    interactivePhaseIds: [...ruleset.phases.nodes.values()]
      .filter((phase) => phase.action !== undefined)
      .map((phase) => phase.id),
    coreEventTypes: coreGameEventTypes.filter((eventType) => eventType !== 'plugin.event'),
  }
}
