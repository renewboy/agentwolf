import type { JsonValue, PluginId } from '@agentwolf/contracts'
import type { z } from 'zod'

export interface PluginRequirement {
  readonly id: PluginId
  readonly version: number
}

export interface RulePlugin<Registrar> {
  readonly id: PluginId
  readonly version: number
  readonly config?: JsonValue
  readonly configSchema?: z.ZodType<JsonValue>
  readonly requires?: readonly PluginRequirement[]
  register(registrar: Registrar): void
}

export interface InstalledPlugin {
  readonly id: PluginId
  readonly version: number
  readonly config: JsonValue
  readonly order: number
}

export function installRulePlugins<Registrar>(
  registrar: Registrar,
  plugins: readonly RulePlugin<Registrar>[],
): readonly InstalledPlugin[] {
  const byId = new Map<PluginId, RulePlugin<Registrar>>()
  const inputOrder = new Map<PluginId, number>()
  for (const [index, plugin] of plugins.entries()) {
    if (!Number.isInteger(plugin.version) || plugin.version < 1) {
      throw new Error(`Plugin ${plugin.id} has invalid version ${plugin.version}`)
    }
    if (byId.has(plugin.id)) throw new Error(`Duplicate plugin ${plugin.id}`)
    byId.set(plugin.id, plugin)
    inputOrder.set(plugin.id, index)
  }

  for (const plugin of plugins) {
    for (const requirement of plugin.requires ?? []) {
      const dependency = byId.get(requirement.id)
      if (!dependency) throw new Error(`Plugin ${plugin.id} requires missing ${requirement.id}`)
      if (dependency.version !== requirement.version) {
        throw new Error(
          `Plugin ${plugin.id} requires ${requirement.id}@${requirement.version}, received ${dependency.version}`,
        )
      }
    }
  }

  const visiting = new Set<PluginId>()
  const visited = new Set<PluginId>()
  const ordered: RulePlugin<Registrar>[] = []
  const visit = (plugin: RulePlugin<Registrar>, path: readonly PluginId[]): void => {
    if (visited.has(plugin.id)) return
    if (visiting.has(plugin.id)) {
      throw new Error(`Plugin dependency cycle: ${[...path, plugin.id].join(' -> ')}`)
    }
    visiting.add(plugin.id)
    const requirements = [...(plugin.requires ?? [])].sort(
      (left, right) => (inputOrder.get(left.id) ?? 0) - (inputOrder.get(right.id) ?? 0),
    )
    for (const requirement of requirements) visit(byId.get(requirement.id)!, [...path, plugin.id])
    visiting.delete(plugin.id)
    visited.add(plugin.id)
    ordered.push(plugin)
  }
  for (const plugin of plugins) visit(plugin, [])

  return ordered.map((plugin, order) => {
    if (plugin.config !== undefined && !plugin.configSchema) {
      throw new Error(`Plugin ${plugin.id} provides config without a schema`)
    }
    plugin.register(registrar)
    return {
      id: plugin.id,
      version: plugin.version,
      config: plugin.configSchema?.parse(plugin.config ?? {}) ?? {},
      order,
    }
  })
}
