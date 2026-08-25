import type { CharacterCardSnapshot, GameEvent, PlayerId } from '@agentwolf/contracts'
import {
  visibleEvents,
  type BoardManifest,
  type GameState,
  type RulesetRuntime,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import { promptRegistryFor } from './prompt-registry.js'

export interface ContextEnvelope {
  readonly prompt: string
  readonly toSequence: number
  readonly visibleEvents: readonly GameEvent[]
  readonly gameStatus: GameState['status']
  readonly pausedReason: string | null
  readonly continuation: boolean
}

export class ContextRenderer {
  readonly #ruleset: RulesetRuntime
  readonly #prompts: ReturnType<typeof promptRegistryFor>

  public constructor(ruleset: RulesetRuntime) {
    this.#ruleset = ruleset
    this.#prompts = promptRegistryFor(ruleset)
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
        roster: rosterFacts(state),
        board: boardFacts(board, this.#ruleset),
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

  public async turn(
    state: GameState,
    board: BoardManifest,
    events: readonly GameEvent[],
    playerId: PlayerId,
    afterSequence: number,
    turn: TurnDescriptor,
    speechCharacterLimit: number,
    continuation = false,
  ): Promise<ContextEnvelope> {
    const player = state.players.get(playerId)
    if (!player?.roleId || !player.faction) throw new Error(`Player ${playerId} has no role`)
    const projected = visibleEvents(events, { kind: 'player', playerId }, state, afterSequence)
    const canUse = (abilityId: NonNullable<TurnDescriptor['allowedAbilityIds']>[number]) =>
      this.#ruleset.roles.canUseAbility(player, abilityId)
    return {
      prompt: this.#prompts.renderTurn({
        actor: actorFact(player),
        roster: rosterFacts(state),
        board: boardFacts(board, this.#ruleset),
        game: gameFacts(state),
        events: [...projected],
        turn: {
          phaseId: turn.phaseId,
          actionType: turn.actionType,
          ...(turn.speechKind ? { speechKind: turn.speechKind } : {}),
          ...(turn.voteKind ? { voteKind: turn.voteKind } : {}),
          ...(turn.abilityId ? { abilityId: turn.abilityId } : {}),
          allowedAbilityIds: (turn.allowedAbilityIds ?? []).filter(canUse),
          interruptAbilityIds: (turn.interruptAbilityIds ?? []).filter(canUse),
          sheriffActions: [...(turn.sheriffActions ?? [])],
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
}

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

function rosterFacts(state: GameState) {
  return [...state.players.values()]
    .sort((left, right) => left.seat - right.seat)
    .map((player) => ({
      playerId: player.id,
      seat: player.seat,
      name: player.name,
      alive: player.alive,
    }))
}

function boardFacts(board: BoardManifest, ruleset: RulesetRuntime) {
  return {
    roles: board.roles.map((slot) => ({
      roleId: slot.roleId,
      faction: ruleset.roles.role(slot.roleId).faction,
      count: slot.count,
    })),
    sheriff: board.sheriff,
    policies: { ...board.policies },
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
