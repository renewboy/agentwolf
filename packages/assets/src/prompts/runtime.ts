import * as nunjucks from 'nunjucks'
import { join } from 'node:path'
import type {
  AbilityId,
  Faction,
  GameEvent,
  PhaseId,
  PlayerId,
  PluginEventType,
  PluginId,
  RoleId,
} from '@agentwolf/contracts'
import {
  FoundationPromptFactsSchema,
  TurnPromptFactsSchema,
  type FoundationPromptFacts,
  type PromptActorFact,
  type PromptPlayerFact,
  type TurnPromptFacts,
} from './facts.js'
import {
  type PromptAbilityPresentation,
  type PromptBundleManifest,
  type PromptEventPresentation,
  type PromptPhasePresentation,
  type PromptRolePresentation,
  type PromptToolName,
  type PromptToolPresentation,
} from './schema.js'
import {
  assertPromptRootHasNoLocale,
  bundleEventPresentations,
  loadPromptBundle,
  precompilePromptTemplates,
  promptEnvironment,
  resolvePromptRoot,
  resolvePromptTemplate,
  validateCorePromptTools,
  validatePromptBundleGraph,
  type LoadedPromptBundle,
} from './loader.js'

export interface PromptPluginContribution {
  readonly pluginId: PluginId
  readonly roleIds: readonly RoleId[]
  readonly abilityIds: readonly AbilityId[]
  readonly phaseIds: readonly PhaseId[]
  readonly pluginEvents: readonly {
    readonly pluginId: PluginId
    readonly eventType: PluginEventType
  }[]
}

export interface PromptSemanticInventory {
  readonly plugins: readonly PluginId[]
  readonly contributions: readonly PromptPluginContribution[]
  readonly interactivePhaseIds: readonly PhaseId[]
  readonly coreEventTypes: readonly string[]
}

export interface LoadPromptBundlesOptions {
  readonly root?: string | URL
}

interface OwnedRole {
  readonly bundleId: '_core' | PluginId
  readonly presentation: PromptRolePresentation
}

interface OwnedAbility {
  readonly bundleId: '_core' | PluginId
  readonly role: PromptRolePresentation
  readonly presentation: PromptAbilityPresentation
}

interface OwnedPhase {
  readonly bundleId: '_core' | PluginId
  readonly presentation: PromptPhasePresentation
}

interface OwnedEvent {
  readonly bundleId: '_core' | PluginId
  readonly presentation: PromptEventPresentation
  readonly specificity: number
}

export class PromptCoreAssets {
  readonly #manifest: PromptBundleManifest
  readonly #environment: nunjucks.Environment

  public constructor(bundle: LoadedPromptBundle) {
    this.#manifest = bundle.manifest
    this.#environment = promptEnvironment([bundle])
  }

  public tool(name: PromptToolName): PromptToolPresentation {
    const tool = this.#manifest.core?.tools.find((entry) => entry.name === name)
    if (!tool) throw new Error(`Unknown Prompt tool ${name}`)
    return tool
  }

  public toolField(toolName: PromptToolName, fieldName: string): string {
    const field = this.tool(toolName).fields.find((entry) => entry.name === fieldName)
    if (!field) throw new Error(`Unknown Prompt field ${toolName}.${fieldName}`)
    return field.text
  }

  public acceptedReceipt(): string {
    return renderAtomic(this.#environment, this.#manifest.core!.receipts.accepted, {})
  }

  public rejectedReceipt(reason: string): string {
    return renderAtomic(this.#environment, this.#manifest.core!.receipts.rejected, { reason })
  }

  public playerContract(): string {
    return this.#environment
      .render(resolvePromptTemplate('_core', this.#manifest.core!.layouts.playerContract), {})
      .trim()
  }
}

export class PromptBundleRegistry {
  readonly #bundles: ReadonlyMap<'_core' | PluginId, LoadedPromptBundle>
  readonly #environment: nunjucks.Environment
  readonly #roles = new Map<RoleId, OwnedRole>()
  readonly #abilities = new Map<AbilityId, OwnedAbility>()
  readonly #phases = new Map<PhaseId, OwnedPhase>()
  readonly #events: readonly OwnedEvent[]
  readonly #core: LoadedPromptBundle

  public constructor(bundles: readonly LoadedPromptBundle[], inventory: PromptSemanticInventory) {
    this.#bundles = new Map(bundles.map((bundle) => [bundle.id, bundle]))
    const core = this.#bundles.get('_core')
    if (!core) throw new Error('Prompt bundle graph has no _core bundle')
    this.#core = core
    this.#environment = promptEnvironment(bundles)

    const events: OwnedEvent[] = []
    for (const bundle of bundles) {
      for (const role of bundle.manifest.roles) {
        if (this.#roles.has(role.id)) throw new Error(`Duplicate Prompt Role ${role.id}`)
        this.#roles.set(role.id, { bundleId: bundle.id, presentation: role })
        for (const ability of role.abilities) {
          if (this.#abilities.has(ability.id)) {
            throw new Error(`Duplicate Prompt Ability ${ability.id}`)
          }
          this.#abilities.set(ability.id, {
            bundleId: bundle.id,
            role,
            presentation: ability,
          })
        }
      }
      for (const phase of bundle.manifest.phases) {
        if (this.#phases.has(phase.id)) throw new Error(`Duplicate Prompt Phase ${phase.id}`)
        this.#phases.set(phase.id, { bundleId: bundle.id, presentation: phase })
      }
      for (const presentation of bundleEventPresentations(bundle.manifest)) {
        events.push({
          bundleId: bundle.id,
          presentation,
          specificity: 1 + Object.keys(presentation.where).length,
        })
      }
    }
    this.#events = Object.freeze(events)
    validateEventAmbiguity(events)
    validateSemanticCoverage(inventory, bundles, this.#roles, this.#abilities, this.#phases, events)
    validatePromptBundleGraph(bundles)
    precompilePromptTemplates(this.#environment, bundles)
  }

  public coreAssets(): PromptCoreAssets {
    return new PromptCoreAssets(this.#core)
  }

  public roleLabel(roleId: RoleId): string {
    return this.#role(roleId).presentation.label
  }

  public abilityLabel(abilityId: AbilityId): string {
    return this.#ability(abilityId).presentation.label
  }

  public phaseLabel(phaseId: PhaseId): string {
    return this.#phase(phaseId).presentation.label
  }

  public factionLabel(faction: Faction): string {
    return this.#core.manifest.core!.factions[faction]
  }

  public renderFoundation(input: FoundationPromptFacts): string {
    const facts = FoundationPromptFactsSchema.parse(input)
    const context = {
      ...this.#context(facts.actor, facts.roster, facts.events, facts),
      currentPhase: null,
    }
    const publicRoles = facts.board.roles.map((slot) => {
      const owned = this.#role(slot.roleId)
      return this.#render(owned.bundleId, owned.presentation.template, {
        ...context,
        section: 'public',
        role: roleContext(owned.presentation, slot.faction),
      })
    })
    const actorRole = this.#role(facts.actor.roleId)
    const ownerRole = this.#render(actorRole.bundleId, actorRole.presentation.template, {
      ...context,
      section: 'owner',
      role: roleContext(actorRole.presentation, facts.actor.faction),
    })
    const character = facts.character
      ? this.#render('_core', this.#core.manifest.core!.layouts.character, context)
      : ''
    const history = this.#renderEvents(facts.events, context)
    return this.#render('_core', this.#core.manifest.core!.layouts.foundation, {
      ...context,
      characterContext: character,
      ownerRoleContext: ownerRole,
      publicRoleContexts: publicRoles,
      history,
    })
  }

  public renderTurn(input: TurnPromptFacts): string {
    const facts = TurnPromptFactsSchema.parse(input)
    const phase = this.#phase(facts.turn.phaseId)
    if (!phase.presentation.template) {
      throw new Error(`Interactive Prompt Phase ${facts.turn.phaseId} has no turn template`)
    }
    const context = {
      ...this.#context(facts.actor, facts.roster, facts.events, facts),
      currentPhase: phase.presentation,
      activeRole: roleContext(this.#role(facts.actor.roleId).presentation, facts.actor.faction),
    }
    const interrupts = facts.turn.interruptAbilityIds.map((abilityId) => {
      const ability = this.#ability(abilityId)
      if (!ability.presentation.interruptTemplate) {
        throw new Error(`Prompt Ability ${abilityId} has no interrupt template`)
      }
      return this.#render(ability.bundleId, ability.presentation.interruptTemplate, {
        ...context,
        ability: abilityContext(ability.presentation),
      })
    })
    const currentTurn = this.#render(phase.bundleId, phase.presentation.template, {
      ...context,
      phase: { ...phase.presentation, ...facts.turn },
      narration: this.#renderEvents(facts.events, context),
      interruptInstructions: interrupts,
    })
    return facts.continuation
      ? this.#render('_core', this.#core.manifest.core!.layouts.continuation, {
          ...context,
          currentTurn,
        })
      : currentTurn
  }

  public renderEventNarration(input: FoundationPromptFacts): string[] {
    const facts = FoundationPromptFactsSchema.parse(input)
    const context = {
      ...this.#context(facts.actor, facts.roster, facts.events, facts),
      currentPhase: null,
    }
    return this.#renderEvents(facts.events, context)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  public renderBootstrapContinuation(): string {
    return this.#render('_core', this.#core.manifest.core!.layouts.bootstrapContinuation, {})
  }

  #context(
    actor: PromptActorFact,
    roster: readonly PromptPlayerFact[],
    events: readonly GameEvent[],
    facts: FoundationPromptFacts | TurnPromptFacts,
  ): Record<string, unknown> {
    const players = new Map(roster.map((player) => [player.playerId, player]))
    const helpers = {
      player: (playerId: PlayerId) => seatLabel(playerId, players),
      initialPlayer: (playerId: PlayerId) => initialPlayerLabel(playerId, players),
      speaker: (playerId: PlayerId) => speakerLabel(playerId, players),
      playerList: (playerIds: readonly PlayerId[]) =>
        playerIds.map((playerId) => seatLabel(playerId, players)).join('、'),
      playerListExcept: (playerIds: readonly PlayerId[], excludedPlayerId: PlayerId) =>
        playerIds
          .filter((playerId) => playerId !== excludedPlayerId)
          .map((playerId) => seatLabel(playerId, players))
          .join('、'),
      livingPlayerIds: (excludedPlayerId?: PlayerId) =>
        roster
          .filter(
            (player) =>
              player.alive &&
              (excludedPlayerId === undefined || player.playerId !== excludedPlayerId),
          )
          .map((player) => player.playerId),
      role: (roleId: RoleId) => this.roleLabel(roleId),
      ability: (abilityId: AbilityId) => this.abilityLabel(abilityId),
      phase: (phaseId: PhaseId) => this.phaseLabel(phaseId),
      faction: (faction: Faction) => this.factionLabel(faction),
      visibleEvent: (eventType: string) =>
        [...events].reverse().find((event) => event.payload.type === eventType)?.payload ?? null,
      announcement: (code: string) =>
        [...events]
          .reverse()
          .find(
            (event) => event.payload.type === 'public.announcement' && event.payload.code === code,
          )?.payload ?? null,
      hasEvent: (eventType: string) => events.some((event) => event.payload.type === eventType),
      abilityUses: (abilityId: AbilityId) => actor.abilityUses[abilityId] ?? 0,
    }
    return { ...facts, helpers }
  }

  #renderEvents(events: readonly GameEvent[], context: Record<string, unknown>): string[] {
    const lines: string[] = []
    for (const event of events) {
      const matches = this.#events
        .filter((entry) => matchesEvent(entry.presentation, event))
        .sort((left, right) => right.specificity - left.specificity)
      if (matches.length === 0) {
        throw new Error(`No Prompt event presentation for ${event.payload.type}`)
      }
      if (matches.length > 1 && matches[0]!.specificity === matches[1]!.specificity) {
        throw new Error(
          `Ambiguous Prompt event presentation for ${event.payload.type}: ${matches[0]!.bundleId}, ${matches[1]!.bundleId}`,
        )
      }
      const selected = matches[0]!
      if (selected.presentation.omit) continue
      const eventContext = { ...context, event, payload: event.payload }
      const rendered = selected.presentation.text
        ? renderAtomic(this.#environment, selected.presentation.text, eventContext)
        : this.#render(selected.bundleId, selected.presentation.template!, eventContext)
      if (rendered) {
        lines.push(`${rendered}${selected.presentation.paragraphAfter ? '\n\n' : '\n'}`)
      }
    }
    const finalLine = lines.at(-1)
    if (finalLine) lines[lines.length - 1] = finalLine.replace(/\n$/, '')
    return lines
  }

  #render(bundleId: '_core' | PluginId, reference: string, context: object): string {
    return this.#environment.render(resolvePromptTemplate(bundleId, reference), context).trim()
  }

  #role(roleId: RoleId): OwnedRole {
    const role = this.#roles.get(roleId)
    if (!role) throw new Error(`Unknown Prompt Role ${roleId}`)
    return role
  }

  #ability(abilityId: AbilityId): OwnedAbility {
    const ability = this.#abilities.get(abilityId)
    if (!ability) throw new Error(`Unknown Prompt Ability ${abilityId}`)
    return ability
  }

  #phase(phaseId: PhaseId): OwnedPhase {
    const phase = this.#phases.get(phaseId)
    if (!phase) throw new Error(`Unknown Prompt Phase ${phaseId}`)
    return phase
  }
}

const coreAssetsByRoot = new Map<string, PromptCoreAssets>()

export function loadPromptCore(options: LoadPromptBundlesOptions = {}): PromptCoreAssets {
  const root = resolvePromptRoot(options.root)
  const existing = coreAssetsByRoot.get(root)
  if (existing) return existing
  assertPromptRootHasNoLocale(root)
  const core = loadPromptBundle('_core', join(root, '_core'))
  validateCorePromptTools(core.manifest)
  const assets = new PromptCoreAssets(core)
  coreAssetsByRoot.set(root, assets)
  return assets
}

export function loadPromptBundles(
  inventory: PromptSemanticInventory,
  options: LoadPromptBundlesOptions = {},
): PromptBundleRegistry {
  const root = resolvePromptRoot(options.root)
  assertPromptRootHasNoLocale(root)
  const bundles: LoadedPromptBundle[] = [loadPromptBundle('_core', join(root, '_core'))]
  const seen = new Set<PluginId>()
  for (const pluginId of inventory.plugins) {
    if (seen.has(pluginId)) throw new Error(`Duplicate installed Prompt plugin ${pluginId}`)
    seen.add(pluginId)
    bundles.push(loadPromptBundle(pluginId, join(root, 'bundles', pluginId)))
  }
  validateCorePromptTools(bundles[0]!.manifest)
  return new PromptBundleRegistry(bundles, inventory)
}

function validateSemanticCoverage(
  inventory: PromptSemanticInventory,
  bundles: readonly LoadedPromptBundle[],
  roles: ReadonlyMap<RoleId, OwnedRole>,
  abilities: ReadonlyMap<AbilityId, OwnedAbility>,
  phases: ReadonlyMap<PhaseId, OwnedPhase>,
  events: readonly OwnedEvent[],
): void {
  const contributions = new Map(inventory.contributions.map((entry) => [entry.pluginId, entry]))
  for (const pluginId of inventory.plugins) {
    const contribution = contributions.get(pluginId)
    if (!contribution) throw new Error(`Missing semantic contribution for ${pluginId}`)
    const bundle = bundles.find((entry) => entry.id === pluginId)
    if (!bundle) throw new Error(`Missing Prompt bundle for ${pluginId}`)
    assertSameIds(
      `${pluginId} Roles`,
      contribution.roleIds,
      bundle.manifest.roles.map((entry) => entry.id),
    )
    assertSameIds(
      `${pluginId} Abilities`,
      contribution.abilityIds,
      bundle.manifest.roles.flatMap((entry) => entry.abilities.map((ability) => ability.id)),
    )
    assertSameIds(
      `${pluginId} Phases`,
      contribution.phaseIds,
      bundle.manifest.phases.map((entry) => entry.id),
    )
    for (const event of contribution.pluginEvents) {
      const covered = events.some(
        (entry) =>
          entry.bundleId === pluginId &&
          entry.presentation.eventType === 'plugin.event' &&
          entry.presentation.where['pluginId'] === event.pluginId &&
          entry.presentation.where['eventType'] === event.eventType,
      )
      if (!covered) {
        throw new Error(
          `Prompt bundle ${pluginId} does not present ${event.pluginId}:${event.eventType}`,
        )
      }
    }
  }
  for (const roleId of roles.keys()) {
    if (!inventory.contributions.some((entry) => entry.roleIds.includes(roleId))) {
      throw new Error(`Prompt bundle claims unowned Role ${roleId}`)
    }
  }
  for (const abilityId of abilities.keys()) {
    if (!inventory.contributions.some((entry) => entry.abilityIds.includes(abilityId))) {
      throw new Error(`Prompt bundle claims unowned Ability ${abilityId}`)
    }
  }
  for (const phaseId of phases.keys()) {
    if (!inventory.contributions.some((entry) => entry.phaseIds.includes(phaseId))) {
      throw new Error(`Prompt bundle claims unowned Phase ${phaseId}`)
    }
  }
  for (const phaseId of inventory.interactivePhaseIds) {
    if (!phases.get(phaseId)?.presentation.template) {
      throw new Error(`Interactive Prompt Phase ${phaseId} has no complete template`)
    }
  }
  for (const eventType of inventory.coreEventTypes) {
    if (!events.some((entry) => entry.presentation.eventType === eventType)) {
      throw new Error(`Core event ${eventType} has no Prompt presentation or omission`)
    }
  }
}

function validateEventAmbiguity(events: readonly OwnedEvent[]): void {
  for (const [index, left] of events.entries()) {
    for (const right of events.slice(index + 1)) {
      if (
        left.presentation.eventType === right.presentation.eventType &&
        left.specificity === right.specificity &&
        matchersOverlap(left.presentation.where, right.presentation.where)
      ) {
        throw new Error(
          `Ambiguous Prompt event matchers for ${left.presentation.eventType}: ${left.bundleId}, ${right.bundleId}`,
        )
      }
    }
  }
}

function matchersOverlap(
  left: PromptEventPresentation['where'],
  right: PromptEventPresentation['where'],
): boolean {
  for (const path of Object.keys(left).filter((candidate) => candidate in right)) {
    const leftValue = left[path]!
    const rightValue = right[path]!
    const leftIsExists = leftValue !== null && typeof leftValue === 'object'
    const rightIsExists = rightValue !== null && typeof rightValue === 'object'
    if (!leftIsExists && !rightIsExists) {
      if (leftValue !== rightValue) return false
      continue
    }
    const leftExists = leftIsExists ? leftValue.exists : true
    const rightExists = rightIsExists ? rightValue.exists : true
    if (leftExists !== rightExists) return false
  }
  return true
}

function matchesEvent(presentation: PromptEventPresentation, event: GameEvent): boolean {
  if (presentation.eventType !== event.payload.type) return false
  return Object.entries(presentation.where).every(([path, expected]) => {
    const value = propertyAt(event.payload, path)
    if (expected && typeof expected === 'object') {
      return expected.exists ? value !== undefined : value === undefined
    }
    return value === expected
  })
}

function propertyAt(value: unknown, path: string): unknown {
  let current = value
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function roleContext(role: PromptRolePresentation, faction: Faction) {
  return {
    id: role.id,
    label: role.label,
    faction,
    abilities: role.abilities.map(abilityContext),
  }
}

function abilityContext(ability: PromptAbilityPresentation) {
  return { id: ability.id, label: ability.label, foundation: ability.foundation }
}

function playerFact(
  playerId: PlayerId,
  players: ReadonlyMap<PlayerId, PromptPlayerFact>,
): PromptPlayerFact {
  const player = players.get(playerId)
  if (!player) throw new Error(`Unknown Prompt Player ${playerId}`)
  return player
}

function seatLabel(playerId: PlayerId, players: ReadonlyMap<PlayerId, PromptPlayerFact>): string {
  return `${playerFact(playerId, players).seat} 号玩家`
}

function speakerLabel(
  playerId: PlayerId,
  players: ReadonlyMap<PlayerId, PromptPlayerFact>,
): string {
  const player = playerFact(playerId, players)
  return `${player.name}（${player.seat} 号玩家）`
}

function initialPlayerLabel(
  playerId: PlayerId,
  players: ReadonlyMap<PlayerId, PromptPlayerFact>,
): string {
  const player = playerFact(playerId, players)
  return `${player.name}（${player.seat} 号玩家，Player ID：${player.playerId}）`
}

function renderAtomic(environment: nunjucks.Environment, text: string, context: object): string {
  return environment.renderString(text, context).trim()
}

function assertSameIds(
  label: string,
  expected: readonly string[],
  actual: readonly string[],
): void {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  const missing = expected.filter((id) => !actualSet.has(id))
  const extra = actual.filter((id) => !expectedSet.has(id))
  if (missing.length > 0 || extra.length > 0 || actualSet.size !== actual.length) {
    throw new Error(
      `${label} mismatch; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`,
    )
  }
}
