import type {
  AbilityId,
  CharacterCardSnapshot,
  GameEvent,
  PhaseId,
  PlayerId,
  RoleId,
  SpectatorView,
} from '@agentwolf/contracts'
import {
  visibleEvents,
  visibleRoleId,
  type BoardManifest,
  type GameState,
  type PhaseNode,
  type RuleRuntime,
  type RoleCardChoice,
  type RulesetRuntime,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import { promptRegistryFor } from './prompt-registry.js'

export interface ContextEnvelope {
  readonly prompt: string
  readonly fromSequence?: number
  readonly toSequence: number
  readonly visibleEvents: readonly GameEvent[]
  readonly gameStatus: GameState['status']
  readonly pausedReason: string | null
  readonly continuation: boolean
}

export interface PublicHistoryCatchup {
  readonly fromSequence: number
  readonly toSequence: number
  readonly events: readonly GameEvent[]
  readonly narration: readonly string[]
}

export class ContextRenderer {
  readonly #ruleset: RulesetRuntime
  readonly #prompts: ReturnType<typeof promptRegistryFor>

  public constructor(ruleset: RulesetRuntime) {
    this.#ruleset = ruleset
    this.#prompts = promptRegistryFor(ruleset)
  }

  public abilityContracts(abilityIds: readonly AbilityId[]) {
    return [...new Set(abilityIds)].map((abilityId) => this.#prompts.abilityContract(abilityId))
  }

  public roleCardChoiceContracts(choices: readonly RoleCardChoice[]) {
    return choices.map((choice) => ({
      ...choice,
      label: this.#prompts.roleLabel(choice.roleId),
    }))
  }

  public async foundation(
    state: GameState,
    board: BoardManifest,
    playerId: PlayerId,
    historyEvents: readonly GameEvent[],
    character: CharacterCardSnapshot | null = null,
  ): Promise<ContextEnvelope> {
    const historySequence = historyEvents.at(-1)?.sequence ?? 0
    if (historySequence !== state.lastSequence) {
      throw new Error(
        `Foundation history ends at ${historySequence}, expected ${state.lastSequence}`,
      )
    }
    const player = state.players.get(playerId)
    if (!player?.roleId || !player.faction) throw new Error(`Player ${playerId} has no role`)
    const projected = visibleEvents(historyEvents, { kind: 'player', playerId }, state)
    return {
      prompt: this.#prompts.renderFoundation({
        actor: actorFact(player),
        roster: rosterFacts(state, historyEvents, { kind: 'player', playerId }),
        board: boardFacts(board, this.#ruleset, this.#prompts, state, historyEvents),
        game: gameFacts(state),
        events: [...projected],
        character,
      }),
      toSequence: state.lastSequence,
      visibleEvents: projected,
      gameStatus: state.status,
      pausedReason: state.pausedReason,
      continuation: false,
    }
  }

  public async foundations(
    state: GameState,
    board: BoardManifest,
    historyEvents: readonly GameEvent[],
    playerIds: readonly PlayerId[],
    characters: ReadonlyMap<PlayerId, CharacterCardSnapshot | null>,
  ): Promise<ReadonlyMap<PlayerId, ContextEnvelope>> {
    return new Map(
      await Promise.all(
        playerIds.map(
          async (playerId) =>
            [
              playerId,
              await this.foundation(
                state,
                board,
                playerId,
                historyEvents,
                characters.get(playerId) ?? null,
              ),
            ] as const,
        ),
      ),
    )
  }

  public async turn(
    state: GameState,
    board: BoardManifest,
    events: readonly GameEvent[],
    playerId: PlayerId,
    afterSequence: number,
    turn: TurnDescriptor,
    speechCharacterLimit: number,
    continuation = false,
    roleCardChoices: readonly RoleCardChoice[] = [],
  ): Promise<ContextEnvelope> {
    const player = state.players.get(playerId)
    if (!player?.roleId || !player.faction) throw new Error(`Player ${playerId} has no role`)
    const projected = visibleEvents(events, { kind: 'player', playerId }, state, afterSequence)
    const canUse = (abilityId: NonNullable<TurnDescriptor['allowedAbilityIds']>[number]) =>
      this.#ruleset.roles.canUseAbility(player, abilityId)
    return {
      prompt: this.#prompts.renderTurn({
        actor: actorFact(player),
        roster: rosterFacts(state, events, { kind: 'player', playerId }),
        board: boardFacts(board, this.#ruleset, this.#prompts, state, events),
        game: gameFacts(state),
        events: [...projected],
        turn: {
          phaseId: turn.phaseId,
          actionType: turn.actionType,
          ...(turn.speechKind ? { speechKind: turn.speechKind } : {}),
          ...(turn.voteKind ? { voteKind: turn.voteKind } : {}),
          ...(turn.abilityId ? { abilityId: turn.abilityId } : {}),
          allowedAbilityIds: (turn.allowedAbilityIds ?? []).filter(canUse),
          passAllowed: turn.passAllowed ?? true,
          interruptAbilityIds: (turn.interruptAbilityIds ?? []).filter(canUse),
          interruptWindow: false,
          sheriffActions: [...(turn.sheriffActions ?? [])],
          roleCardChoices: roleCardChoices.map((choice) => ({ ...choice })),
        },
        speechCharacterLimit,
        continuation,
      }),
      toSequence: state.lastSequence,
      visibleEvents: projected,
      gameStatus: state.status,
      pausedReason: state.pausedReason,
      continuation,
    }
  }

  public async interruptTurn(
    state: GameState,
    board: BoardManifest,
    events: readonly GameEvent[],
    playerId: PlayerId,
    afterSequence: number,
    turn: TurnDescriptor,
    interruptAbilityIds: readonly NonNullable<TurnDescriptor['interruptAbilityIds']>[number][],
    speechCharacterLimit: number,
    continuation = false,
  ): Promise<ContextEnvelope> {
    const player = state.players.get(playerId)
    if (!player?.roleId || !player.faction) throw new Error(`Player ${playerId} has no role`)
    const projected = visibleEvents(events, { kind: 'player', playerId }, state, afterSequence)
    const allowed = interruptAbilityIds.filter((abilityId) =>
      this.#ruleset.roles.canUseAbility(player, abilityId),
    )
    return {
      prompt: this.#prompts.renderTurn({
        actor: actorFact(player),
        roster: rosterFacts(state, events, { kind: 'player', playerId }),
        board: boardFacts(board, this.#ruleset, this.#prompts, state, events),
        game: gameFacts(state),
        events: [...projected],
        turn: {
          phaseId: turn.phaseId,
          actionType: 'skill-trigger',
          allowedAbilityIds: allowed,
          passAllowed: true,
          interruptAbilityIds: allowed,
          interruptWindow: true,
          sheriffActions: [],
          roleCardChoices: [],
        },
        speechCharacterLimit,
        continuation,
      }),
      toSequence: state.lastSequence,
      visibleEvents: projected,
      gameStatus: state.status,
      pausedReason: state.pausedReason,
      continuation,
    }
  }

  public async bootstrapContinuation(state: GameState): Promise<ContextEnvelope> {
    return {
      prompt: this.#prompts.renderBootstrapContinuation(),
      toSequence: state.lastSequence,
      visibleEvents: [],
      gameStatus: state.status,
      pausedReason: state.pausedReason,
      continuation: true,
    }
  }

  public bootstrap(envelope: ContextEnvelope): ContextEnvelope {
    return { ...envelope, prompt: this.#prompts.renderBootstrap() }
  }

  public publicHistorySince(
    state: GameState,
    board: BoardManifest,
    events: readonly GameEvent[],
    playerId: PlayerId,
    afterSequence: number,
  ): PublicHistoryCatchup {
    if (afterSequence < 0 || afterSequence > state.lastSequence) {
      throw new Error(
        `Public history cursor ${afterSequence} is outside terminal sequence ${state.lastSequence}`,
      )
    }
    const actor = state.players.get(playerId)
    if (!actor) throw new Error(`Public history has no player ${playerId}`)
    const history = events.filter((event) => event.sequence <= state.lastSequence)
    const publicEvents = visibleEvents(history, { kind: 'closed-eye' }, state, afterSequence)
    const narrationEvents = publicEvents.filter(
      (event) => !commonTerminalFactEventTypes.has(event.payload.type),
    )
    return {
      fromSequence: afterSequence + 1,
      toSequence: state.lastSequence,
      events: publicEvents,
      narration: this.#prompts.renderEventNarration({
        actor: actorFact(actor),
        roster: rosterFacts(state, history, { kind: 'closed-eye' }),
        board: boardFacts(board, this.#ruleset, this.#prompts, state, history),
        game: gameFacts(state),
        events: narrationEvents,
        character: null,
      }),
    }
  }
}

const commonTerminalFactEventTypes = new Set<GameEvent['payload']['type']>([
  'match.ended',
  'role.revealed',
])

function actorFact(
  player: GameState['players'] extends ReadonlyMap<PlayerId, infer Value> ? Value : never,
) {
  if (!player.roleId || !player.faction) throw new Error(`Player ${player.id} has no role`)
  return {
    playerId: player.id,
    seat: player.seat,
    name: player.name,
    alive: player.alive,
    roleId: player.roleId,
    faction: player.faction,
    abilityUses: { ...player.roleState.abilityUses },
  }
}

function rosterFacts(state: GameState, events: readonly GameEvent[], view: SpectatorView) {
  return [...state.players.values()]
    .sort((left, right) => left.seat - right.seat)
    .map((player) => ({
      playerId: player.id,
      seat: player.seat,
      name: player.name,
      alive: player.alive,
      roleId: visibleRoleId(player.id, view, state, events),
    }))
}

function boardFacts(
  board: BoardManifest,
  ruleset: RulesetRuntime,
  prompts: ReturnType<typeof promptRegistryFor>,
  state: GameState,
  events: readonly GameEvent[],
) {
  return {
    roles: board.roles.map((slot) => ({
      roleId: slot.roleId,
      faction: ruleset.roles.role(slot.roleId).faction,
      count: slot.count,
    })),
    cardCount: board.roles.reduce((total, slot) => total + slot.count, 0),
    playerCount: board.playerCount,
    reserveCount: board.reserveCount,
    nightActionOrder: nightActionOrderFacts(board, ruleset, prompts, state, events),
    sheriff: board.sheriff,
    policies: { ...board.policies },
  }
}

function nightActionOrderFacts(
  board: BoardManifest,
  ruleset: RulesetRuntime,
  prompts: ReturnType<typeof promptRegistryFor>,
  state: GameState,
  events: readonly GameEvent[],
): { phaseId: PhaseId; firstNightOnly: boolean }[] {
  const boardRoleIds = new Set(board.roles.map((slot) => slot.roleId))
  const ordered: { phaseId: PhaseId; firstNightOnly: boolean }[] = []
  const visited = new Set<PhaseId>()
  let phaseId: PhaseId | undefined = ruleset.phases.entry

  while (phaseId) {
    if (visited.has(phaseId)) {
      throw new Error(`Night action order contains a cycle before daytime: ${phaseId}`)
    }
    visited.add(phaseId)
    const node = ruleset.phases.nodes.get(phaseId)
    if (!node) throw new Error(`Night action order references missing phase ${phaseId}`)
    if (prompts.phasePresentation(node.id).daytime) break

    const firstNight = promptRuleRuntime(state, board, ruleset, events, node, 1)
    const laterNight = promptRuleRuntime(state, board, ruleset, events, node, 2)
    if (node.action && phaseAppliesToBoard(node, boardRoleIds, ruleset, firstNight, laterNight)) {
      const activeOnFirstNight = ruleset.rules.evaluate(node.activeWhen, firstNight)
      const activeOnLaterNights = ruleset.rules.evaluate(node.activeWhen, laterNight)
      ordered.push({
        phaseId: node.id,
        firstNightOnly: activeOnFirstNight && !activeOnLaterNights,
      })
    }

    phaseId = node.edges.find((edge) => !edge.when)?.to
  }

  return ordered
}

function phaseAppliesToBoard(
  node: PhaseNode,
  boardRoleIds: ReadonlySet<RoleId>,
  ruleset: RulesetRuntime,
  firstNight: RuleRuntime,
  laterNight: RuleRuntime,
): boolean {
  if (!node.action) return false
  const abilityIds =
    node.action.type === 'vote'
      ? node.action.abilityId
        ? [node.action.abilityId]
        : []
      : node.action.type === 'night-action' || node.action.type === 'skill-trigger'
        ? node.action.abilityIds
        : []
  for (const abilityId of abilityIds) {
    if (boardRoleIds.has(ruleset.roles.ability(abilityId).role.id)) return true
  }

  const capabilityIds =
    node.action.type === 'night-action' || node.action.type === 'skill-trigger'
      ? (node.action.capabilityIds ?? [])
      : []
  for (const capabilityId of capabilityIds) {
    const roleIds = ruleset.roles
      .abilityIdsForCapability(capabilityId)
      .map((abilityId) => ruleset.roles.ability(abilityId).role.id)
    if (roleIds.some((roleId) => boardRoleIds.has(roleId))) return true
  }

  return (
    ruleset.rules.selectActors(node.actorSelector, firstNight).length > 0 ||
    ruleset.rules.selectActors(node.actorSelector, laterNight).length > 0
  )
}

function promptRuleRuntime(
  state: GameState,
  board: BoardManifest,
  ruleset: RulesetRuntime,
  events: readonly GameEvent[],
  node: PhaseNode,
  night: number,
): RuleRuntime {
  return {
    state: {
      ...state,
      status: 'running',
      day: night - 1,
      night,
      phaseId: node.id,
      phaseLabelKey: node.labelKey,
    },
    board: { ...board, phases: ruleset.phases },
    events,
    roles: ruleset.roles,
    resolution: ruleset.resolution,
    victories: ruleset.victories,
    pluginEvents: ruleset.events,
    queries: ruleset.queries,
    triggers: ruleset.triggers,
    append: () => {
      throw new Error('Prompt rule projection cannot append events')
    },
  }
}

function gameFacts(state: GameState) {
  return {
    day: state.day,
    night: state.night,
    status: state.status,
    pausedReason: state.pausedReason,
  }
}
