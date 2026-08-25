import type { RulesetId } from '@agentwolf/contracts'
import {
  installRulePlugins,
  type InstalledPlugin,
  type PluginInstallScope,
  type RulePlugin,
} from './loader.js'
import { ResolutionRegistry } from './resolution-registry.js'
import { VictoryRegistry } from './victory-registry.js'
import { RoleRegistry } from '../roles/registry.js'
import { RuleRegistry } from '../rule-registry.js'
import { InterruptRegistry } from './interrupt-registry.js'
import { PluginEventRegistry } from './event-registry.js'
import { PhaseGraphRegistry } from './phase-registry.js'
import { QueryRegistry } from './query-registry.js'
import { TriggerRegistry } from './trigger-registry.js'
import { SemanticOwnershipRecorder, type PluginSemanticContribution } from './semantic-ownership.js'

export class RulesetRuntime {
  public constructor(
    public readonly id: RulesetId,
    public readonly version: number,
    public readonly plugins: readonly InstalledPlugin[],
    public readonly roles: RoleRegistry,
    public readonly rules: RuleRegistry,
    public readonly resolution: ResolutionRegistry,
    public readonly victories: VictoryRegistry,
    public readonly interrupts: InterruptRegistry,
    public readonly events: PluginEventRegistry,
    public readonly phases: import('../types.js').PhaseGraph,
    public readonly queries: QueryRegistry,
    public readonly triggers: TriggerRegistry,
    public readonly contributions: readonly PluginSemanticContribution[],
  ) {}
}

export class RulesetBuilder implements PluginInstallScope {
  readonly #ownership = new SemanticOwnershipRecorder()
  public readonly roles = new RoleRegistry(this.#ownership)
  public readonly rules = new RuleRegistry()
  public readonly resolution = new ResolutionRegistry()
  public readonly victories = new VictoryRegistry()
  public readonly interrupts = new InterruptRegistry()
  public readonly events = new PluginEventRegistry(this.#ownership)
  public readonly phases = new PhaseGraphRegistry(this.#ownership)
  public readonly queries = new QueryRegistry(this.#ownership)
  public readonly triggers = new TriggerRegistry(this.#ownership)

  readonly #id: RulesetId
  readonly #version: number
  readonly #plugins: readonly RulePlugin<RulesetBuilder>[]

  public constructor(options: {
    readonly id: RulesetId
    readonly version: number
    readonly plugins: readonly RulePlugin<RulesetBuilder>[]
  }) {
    this.#id = options.id
    this.#version = options.version
    this.#plugins = options.plugins
  }

  public build(): RulesetRuntime {
    const installed = installRulePlugins(this, this.#plugins)
    const contributions = this.#ownership.contributions(installed.map((plugin) => plugin.id))
    return new RulesetRuntime(
      this.#id,
      this.#version,
      installed,
      this.roles,
      this.rules,
      this.resolution,
      this.victories,
      this.interrupts,
      this.events,
      this.phases.build(),
      this.queries,
      this.triggers,
      contributions,
    )
  }

  public beginPluginInstall(pluginId: import('@agentwolf/contracts').PluginId): void {
    this.#ownership.begin(pluginId)
  }

  public endPluginInstall(pluginId: import('@agentwolf/contracts').PluginId): void {
    this.#ownership.end(pluginId)
  }
}
