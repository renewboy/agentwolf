import type { RulesetId } from '@agentwolf/contracts'
import { installRulePlugins, type InstalledPlugin, type RulePlugin } from './loader.js'
import { ResolutionRegistry } from './resolution-registry.js'
import { VictoryRegistry } from './victory-registry.js'
import { RoleRegistry } from '../roles/registry.js'
import { RuleRegistry } from '../rule-registry.js'
import { InterruptRegistry } from './interrupt-registry.js'
import { PluginEventRegistry } from './event-registry.js'
import { PhaseGraphRegistry } from './phase-registry.js'
import { QueryRegistry } from './query-registry.js'
import { TriggerRegistry } from './trigger-registry.js'

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
  ) {}
}

export class RulesetBuilder {
  public readonly roles = new RoleRegistry()
  public readonly rules = new RuleRegistry()
  public readonly resolution = new ResolutionRegistry()
  public readonly victories = new VictoryRegistry()
  public readonly interrupts = new InterruptRegistry()
  public readonly events = new PluginEventRegistry()
  public readonly phases = new PhaseGraphRegistry()
  public readonly queries = new QueryRegistry()
  public readonly triggers = new TriggerRegistry()

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
    )
  }
}
