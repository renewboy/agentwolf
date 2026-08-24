import type { CharacterCardSnapshot, GameEvent, PlayerId, RoleId } from '@agentwolf/contracts'
import {
  formatCopy,
  getCopy as getAssetCopy,
  renderCharacterPrompt,
  renderEventNarration as narrate,
} from '@agentwolf/assets'
import { loadPromptAsset, renderPrompt, type PromptAssetId } from '@agentwolf/assets/prompts'
import {
  v1AbilityIds,
  visibleEvents,
  type BoardManifest,
  type GameState,
  type RoleRegistry,
} from '@agentwolf/game-engine'

export interface ContextEnvelope {
  readonly prompt: string
  readonly promptVersion: number
  readonly toSequence: number
  readonly visibleEvents: readonly GameEvent[]
  readonly gameStatus: GameState['status']
  readonly pausedReason: string | null
  readonly continuation: boolean
}

export const promptContractVersion = 19

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

function publicRoleRules(board: BoardManifest, roles: RoleRegistry): string {
  const policyValues = {
    witchPotionLimit: formatCopy(getAssetCopy('promptContext.witchPotionLimit'), {
      count: board.policies.witchPotionsPerNight,
    }),
    witchSelfSave: getAssetCopy(
      board.policies.witchSelfSave === 'never'
        ? 'promptContext.witchSelfSaveNever'
        : board.policies.witchSelfSave === 'first-night'
          ? 'promptContext.witchSelfSaveFirstNight'
          : 'promptContext.witchSelfSaveAlways',
    ),
    guardSelfProtect: getAssetCopy(
      board.policies.guardCanSelfProtect
        ? 'promptContext.guardSelfProtectAllowed'
        : 'promptContext.guardSelfProtectForbidden',
    ),
    guardCollision: getAssetCopy(
      board.policies.guardAntidoteCollision === 'death'
        ? 'promptContext.guardAntidoteCollisionDeath'
        : 'promptContext.guardAntidoteCollisionSurvive',
    ),
  }
  const entries = board.roles.map((slot) => {
    const role = roles.role(slot.roleId)
    return formatCopy(getAssetCopy('promptContext.roleRuleEntry'), {
      role: getAssetCopy(role.displayNameKey),
      faction: getAssetCopy(`factions.${role.faction}`),
      description: formatCopy(getAssetCopy(role.publicRulesKey), policyValues),
    })
  })
  return formatCopy(getAssetCopy('promptContext.roleRulesIntro'), {
    roles: entries.join('\n'),
  })
}

function daytimeState(state: GameState): string | null {
  if (
    state.day < 1 ||
    !state.phaseId ||
    state.phaseId.startsWith('phase-night-') ||
    state.phaseId === 'phase-match-ended'
  ) {
    return null
  }
  const players = [...state.players.values()]
    .filter((player) => player.alive)
    .sort((left, right) => left.seat - right.seat)
    .map((player) =>
      formatCopy(getAssetCopy('promptContext.rosterEntry'), {
        name: player.name,
        playerId: player.id,
        seat: player.seat,
      }),
    )
    .join(getAssetCopy('narration.listJoiner'))
  return formatCopy(getAssetCopy('promptContext.dayState'), { day: state.day, players })
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
    promptVersion = promptContractVersion,
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
    const role = this.#roles.role(player.roleId)
    const roleLine = formatCopy(getAssetCopy('promptContext.role'), {
      role: getAssetCopy(role.displayNameKey),
      faction: getAssetCopy(`factions.${player.faction}`),
    })
    const activeAbilities = role.abilities.filter(
      (ability) => promptVersion < 12 || ability.id !== v1AbilityIds.werewolfKill,
    )
    const abilityLine =
      activeAbilities.length === 0
        ? getAssetCopy('promptContext.noAbilities')
        : formatCopy(getAssetCopy('promptContext.abilities'), {
            abilities: activeAbilities
              .map((ability) =>
                promptVersion >= 6
                  ? formatCopy(getAssetCopy('promptContext.abilityEntry'), {
                      label: getAssetCopy(ability.labelKey),
                      abilityId: ability.id,
                    })
                  : getAssetCopy(ability.labelKey),
              )
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
      ...(promptVersion >= 11 ? [publicRoleRules(board, this.#roles)] : []),
      getAssetCopy('promptContext.villageVictory'),
      getAssetCopy(
        board.policies.victory === 'slaughter-edge'
          ? 'promptContext.werewolfVictorySlaughterEdge'
          : 'promptContext.werewolfVictorySlaughterAll',
      ),
      getAssetCopy(
        board.sheriff
          ? promptVersion >= 14
            ? 'promptContext.sheriffEnabledSpeechOrder'
            : 'promptContext.sheriffEnabled'
          : promptVersion >= 14
            ? 'promptContext.sheriffDisabledSpeechOrder'
            : 'promptContext.sheriffDisabled',
      ),
      ...(promptVersion < 11 && board.roles.some((slot) => slot.roleId === 'role-witch')
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
      ...(promptVersion < 11 && board.roles.some((slot) => slot.roleId === 'role-guard')
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
    const currentDayState = promptVersion >= 14 ? daytimeState(state) : null
    const historyLines = projectedHistory
      .filter(
        (event) =>
          event.payload.type !== 'role.assigned' &&
          !(
            currentDayState &&
            event.payload.type === 'day.started' &&
            event.payload.day === state.day
          ),
      )
      .map((event) => narrate(event, narrationCatalog(state, this.#roles, playerId)))
      .filter((line): line is string => Boolean(line))
    if (currentDayState) historyLines.unshift(currentDayState)
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
        ROLE_CONTEXT:
          character && promptVersion >= 18
            ? `${renderCharacterPrompt(character, player.name)}\n\n${roleLine}\n${abilityLine}`
            : `${roleLine}\n${abilityLine}`,
        ROSTER: roster,
        BOARD_RULES: rules,
        MATCH_HISTORY: historyLines.join('\n') || getAssetCopy('promptContext.matchNotStarted'),
      }),
      promptVersion,
      toSequence: state.lastSequence,
      visibleEvents: projectedHistory,
      gameStatus: state.status,
      pausedReason: state.pausedReason,
      continuation: false,
    }
  }

  public async turn(
    state: GameState,
    events: readonly GameEvent[],
    playerId: PlayerId,
    afterSequence: number,
    promptAsset: Exclude<
      PromptAssetId,
      'player-foundation' | 'player-continuation' | 'bootstrap-continuation'
    >,
    actionInstruction = '',
    promptVersion = promptContractVersion,
    continuation = false,
  ): Promise<ContextEnvelope> {
    const projected = visibleEvents(events, { kind: 'player', playerId }, state, afterSequence)
    const catalog = narrationCatalog(state, this.#roles, playerId)
    const currentDayState = promptVersion >= 14 ? daytimeState(state) : null
    const narrationEvents = projected.filter((event) => {
      if (
        promptVersion >= 10 &&
        event.payload.type === 'speech.committed' &&
        event.payload.playerId === playerId
      ) {
        return false
      }
      if (
        currentDayState &&
        event.payload.type === 'day.started' &&
        event.payload.day === state.day
      ) {
        return false
      }
      return true
    })
    const narration = [
      ...(currentDayState ? [currentDayState] : []),
      ...narrationEvents
        .map((event) => narrate(event, catalog))
        .filter((line): line is string => Boolean(line)),
    ].join('\n')
    const template = await loadPromptAsset(promptAsset)
    const currentTurn = renderPrompt(template, {
      GAME_NARRATION: narration,
      WOLF_VOTE_INSTRUCTION:
        promptAsset === 'wolf-vote-turn'
          ? getAssetCopy(
              promptVersion >= 17
                ? 'promptActions.wolfVoteTargetOptions'
                : 'promptActions.wolfVoteTargetRequired',
            )
          : '',
      ACTION_INSTRUCTION: versionedActionInstruction(promptAsset, actionInstruction, promptVersion),
    })
    return {
      prompt: continuation
        ? renderPrompt(await loadPromptAsset('player-continuation'), {
            CURRENT_TURN: currentTurn,
          })
        : currentTurn,
      promptVersion,
      toSequence: state.lastSequence,
      visibleEvents: projected,
      gameStatus: state.status,
      pausedReason: state.pausedReason,
      continuation,
    }
  }

  public async bootstrapContinuation(state: GameState): Promise<ContextEnvelope> {
    return {
      prompt: await loadPromptAsset('bootstrap-continuation'),
      promptVersion: promptContractVersion,
      toSequence: state.lastSequence,
      visibleEvents: [],
      gameStatus: state.status,
      pausedReason: state.pausedReason,
      continuation: true,
    }
  }
}

function versionedActionInstruction(
  promptAsset: Exclude<
    PromptAssetId,
    'player-foundation' | 'player-continuation' | 'bootstrap-continuation'
  >,
  actionInstruction: string,
  promptVersion: number,
): string {
  if (promptAsset === 'speech-turn' && promptVersion < 8) return ''
  if ((promptAsset === 'sheriff-turn' || promptAsset === 'vote-turn') && promptVersion < 9) {
    return ''
  }
  if (promptAsset === 'wolf-vote-turn' && promptVersion < 13) return ''
  return actionInstruction
}
