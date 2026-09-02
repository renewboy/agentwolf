import { createRulesetLock as createCoreRulesetLock } from '@agent-arena/ruleset'
import { RulesetLockSchema, type RulesetId, type RulesetLock } from '@agentwolf/contracts'
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
import { DealRegistry } from './deal-registry.js'
import { EndgameRegistry } from './endgame-registry.js'
import { SemanticOwnershipRecorder, type PluginSemanticContribution } from './semantic-ownership.js'

export class RulesetRuntime {
  public constructor(
    public readonly id: RulesetId,
    public readonly revision: number,
    public readonly plugins: readonly InstalledPlugin[],
    public readonly roles: RoleRegistry,
    public readonly rules: RuleRegistry,
    public readonly resolution: ResolutionRegistry,
    public readonly victories: VictoryRegistry,
    public readonly endgames: EndgameRegistry,
    public readonly interrupts: InterruptRegistry,
    public readonly events: PluginEventRegistry,
    public readonly phases: import('../types.js').PhaseGraph,
    public readonly queries: QueryRegistry,
    public readonly triggers: TriggerRegistry,
    public readonly deals: DealRegistry,
    public readonly contributions: readonly PluginSemanticContribution[],
  ) {}
}

export class RulesetBuilder implements PluginInstallScope {
  readonly #ownership = new SemanticOwnershipRecorder()
  public readonly roles = new RoleRegistry(this.#ownership)
  public readonly rules = new RuleRegistry()
  public readonly resolution = new ResolutionRegistry()
  public readonly victories = new VictoryRegistry()
  public readonly endgames = new EndgameRegistry()
  public readonly interrupts = new InterruptRegistry()
  public readonly events = new PluginEventRegistry(this.#ownership)
  public readonly phases = new PhaseGraphRegistry(this.#ownership)
  public readonly queries = new QueryRegistry(this.#ownership)
  public readonly triggers = new TriggerRegistry(this.#ownership)
  public readonly deals = new DealRegistry()

  readonly #id: RulesetId
  readonly #revision: number
  readonly #plugins: readonly RulePlugin<RulesetBuilder>[]

  public constructor(options: {
    readonly id: RulesetId
    readonly revision: number
    readonly plugins: readonly RulePlugin<RulesetBuilder>[]
  }) {
    this.#id = options.id
    this.#revision = options.revision
    this.#plugins = options.plugins
  }

  public build(): RulesetRuntime {
    const installed = installRulePlugins(this, this.#plugins)
    this.endgames.validate(this.roles)
    const contributions = this.#ownership.contributions(installed.map((plugin) => plugin.id))
    return new RulesetRuntime(
      this.#id,
      this.#revision,
      installed,
      this.roles,
      this.rules,
      this.resolution,
      this.victories,
      this.endgames,
      this.interrupts,
      this.events,
      this.phases.build(),
      this.queries,
      this.triggers,
      this.deals,
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

export function lockRulesetRuntime(ruleset: RulesetRuntime): RulesetLock {
  return RulesetLockSchema.parse(
    createCoreRulesetLock(ruleset.id, ruleset.revision, ruleset.plugins),
  )
}
