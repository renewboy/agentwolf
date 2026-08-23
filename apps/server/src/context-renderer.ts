import type { GameEvent, PlayerId, RoleId } from '@agentwolf/contracts'
import {
  formatCopy,
  getCopy as getAssetCopy,
  renderEventNarration as narrate,
} from '@agentwolf/assets'
import { loadPromptAsset, renderPrompt, type PromptAssetId } from '@agentwolf/assets/prompts'
import {
  visibleEvents,
  type BoardManifest,
  type GameState,
  type RoleRegistry,
} from '@agentwolf/game-engine'

export interface ContextEnvelope {
  readonly prompt: string
  readonly toSequence: number
  readonly visibleEvents: readonly GameEvent[]
}

function narrationCatalog(state: GameState, roles: RoleRegistry, viewerPlayerId?: PlayerId) {
  return {
    players: new Map(
      [...state.players.values()].map((player) => [
        player.id,
        { playerId: player.id, seat: player.seat, name: player.name },
      ]),
    ),
    roleName: (roleId: RoleId) => getAssetCopy(roles.role(roleId).displayNameKey),
    ...(viewerPlayerId ? { viewerPlayerId } : {}),
  }
}

export class ContextRenderer {
  readonly #roles: RoleRegistry

  public constructor(roles: RoleRegistry) {
    this.#roles = roles
  }

  public async foundation(
    state: GameState,
    board: BoardManifest,
    playerId: PlayerId,
    historyEvents: readonly GameEvent[],
  ): Promise<ContextEnvelope> {
    const historySequence = historyEvents.at(-1)?.sequence ?? 0
    if (historySequence !== state.lastSequence) {
      throw new Error(
        `Foundation history ends at ${historySequence}, expected ${state.lastSequence}`,
      )
    }
    const player = state.players.get(playerId)
    if (!player?.roleId || !player.faction) throw new Error(`Player ${playerId} has no role`)
    const role = this.#roles.role(player.roleId)
    const roleLine = formatCopy(getAssetCopy('promptContext.role'), {
      role: getAssetCopy(role.displayNameKey),
      faction: getAssetCopy(`factions.${player.faction}`),
    })
    const abilityLine =
      role.abilities.length === 0
        ? getAssetCopy('promptContext.noAbilities')
        : formatCopy(getAssetCopy('promptContext.abilities'), {
            abilities: role.abilities
              .map((ability) => getAssetCopy(ability.labelKey))
              .join(getAssetCopy('narration.listJoiner')),
          })
    const roster = [...state.players.values()]
      .sort((left, right) => left.seat - right.seat)
      .map((entry) =>
        formatCopy(getAssetCopy('promptContext.rosterEntry'), {
          name: entry.name,
          playerId: entry.id,
          seat: entry.seat,
        }),
      )
      .join('\n')
    const rules = [
      formatCopy(getAssetCopy('promptContext.composition'), {
        roles: board.roles
          .map((slot) =>
            formatCopy(getAssetCopy('promptContext.roleCount'), {
              role: getAssetCopy(this.#roles.role(slot.roleId).displayNameKey),
              count: slot.count,
            }),
          )
          .join(getAssetCopy('narration.listJoiner')),
      }),
      getAssetCopy('promptContext.villageVictory'),
      getAssetCopy(
        board.policies.victory === 'slaughter-edge'
          ? 'promptContext.werewolfVictorySlaughterEdge'
          : 'promptContext.werewolfVictorySlaughterAll',
      ),
      getAssetCopy(
        board.sheriff ? 'promptContext.sheriffEnabled' : 'promptContext.sheriffDisabled',
      ),
      ...(board.roles.some((slot) => slot.roleId === 'role-witch')
        ? [
            formatCopy(getAssetCopy('promptContext.witchPotionLimit'), {
              count: board.policies.witchPotionsPerNight,
            }),
            getAssetCopy(
              board.policies.witchSelfSave === 'never'
                ? 'promptContext.witchSelfSaveNever'
                : board.policies.witchSelfSave === 'first-night'
                  ? 'promptContext.witchSelfSaveFirstNight'
                  : 'promptContext.witchSelfSaveAlways',
            ),
          ]
        : []),
      ...(board.roles.some((slot) => slot.roleId === 'role-guard')
        ? [
            getAssetCopy(
              board.policies.guardCanSelfProtect
                ? 'promptContext.guardSelfProtectAllowed'
                : 'promptContext.guardSelfProtectForbidden',
            ),
            getAssetCopy(
              board.policies.guardAntidoteCollision === 'death'
                ? 'promptContext.guardAntidoteCollisionDeath'
                : 'promptContext.guardAntidoteCollisionSurvive',
            ),
          ]
        : []),
      getAssetCopy(
        board.policies.nightLastWords === 'first-night-only'
          ? 'promptContext.lastWordsFirstNight'
          : board.policies.nightLastWords === 'every-night'
            ? 'promptContext.lastWordsEveryNight'
            : 'promptContext.lastWordsNone',
      ),
    ].join('\n')
    const projectedHistory = visibleEvents(historyEvents, { kind: 'player', playerId }, state)
    const historyLines = projectedHistory
      .filter((event) => event.payload.type !== 'role.assigned')
      .map((event) => narrate(event, narrationCatalog(state, this.#roles, playerId)))
      .filter((line): line is string => Boolean(line))
    if (
      state.status === 'paused' &&
      state.pausedReason &&
      !projectedHistory.some((event) => event.payload.type === 'match.paused')
    ) {
      historyLines.push(
        formatCopy(getAssetCopy('narration.matchPaused'), { reason: state.pausedReason }),
      )
    }
    const template = await loadPromptAsset('player-foundation')
    return {
      prompt: renderPrompt(template, {
        ROLE_CONTEXT: `${roleLine}\n${abilityLine}`,
        ROSTER: roster,
        BOARD_RULES: rules,
        MATCH_HISTORY: historyLines.join('\n') || getAssetCopy('promptContext.matchNotStarted'),
      }),
      toSequence: state.lastSequence,
      visibleEvents: projectedHistory,
    }
  }

  public async turn(
    state: GameState,
    events: readonly GameEvent[],
    playerId: PlayerId,
    afterSequence: number,
    promptAsset: Exclude<PromptAssetId, 'player-foundation'>,
    actionInstruction = '',
  ): Promise<ContextEnvelope> {
    const projected = visibleEvents(events, { kind: 'player', playerId }, state, afterSequence)
    const catalog = narrationCatalog(state, this.#roles, playerId)
    const narration = projected
      .map((event) => narrate(event, catalog))
      .filter((line): line is string => Boolean(line))
      .join('\n')
    const template = await loadPromptAsset(promptAsset)
    return {
      prompt: renderPrompt(template, {
        GAME_NARRATION: narration,
        ACTION_INSTRUCTION: actionInstruction,
      }),
      toSequence: state.lastSequence,
      visibleEvents: projected,
    }
  }
}
