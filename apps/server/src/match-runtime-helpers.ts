import { AcpDeliveryUncertainError } from '@agentwolf/acp'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { GameEvent, PlayerAction, PlayerId } from '@agentwolf/contracts'
import {
  v1AbilityIds,
  type BoardManifest,
  type GameState,
  type TurnDescriptor,
} from '@agentwolf/game-engine'
import type { SpeechCommittedEvent } from './speech-playback-coordinator.js'
import { promptContractVersion } from './context-renderer.js'

export function findCommittedSpeech(events: readonly GameEvent[]): SpeechCommittedEvent | null {
  return (
    events.findLast(
      (candidate): candidate is SpeechCommittedEvent =>
        candidate.payload.type === 'speech.committed',
    ) ?? null
  )
}

export function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = [...error.errors].map(describeError).join('; ')
    return details ? `${error.message}: ${details}` : error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export function hasUncertainDelivery(error: unknown): boolean {
  if (
    error instanceof AcpDeliveryUncertainError ||
    (error instanceof Error && error.name === 'AcpDeliveryUncertainError')
  ) {
    return true
  }
  if (error instanceof AggregateError) return [...error.errors].some(hasUncertainDelivery)
  return error instanceof Error && error.cause ? hasUncertainDelivery(error.cause) : false
}

export function interruptAbilityExpectation(
  state: GameState,
  playerId: PlayerId,
  turn: Pick<TurnDescriptor, 'actionType' | 'phaseId'>,
) {
  return state.players.get(playerId)?.roleId === 'role-werewolf' &&
    supportsWerewolfSelfDestruct(turn)
    ? { interruptAbilityIds: [v1AbilityIds.werewolfSelfDestruct] }
    : {}
}

function supportsWerewolfSelfDestruct(
  turn: Pick<TurnDescriptor, 'actionType' | 'phaseId'>,
): boolean {
  if (!['speech', 'vote', 'sheriff-action'].includes(turn.actionType)) return false
  return (
    turn.phaseId.startsWith('phase-sheriff-') ||
    turn.phaseId === 'phase-day-speech' ||
    turn.phaseId === 'phase-day-runoff-speech' ||
    turn.phaseId === 'phase-day-vote' ||
    turn.phaseId === 'phase-day-runoff-vote'
  )
}

export async function settleActions(
  promises: readonly Promise<PlayerAction>[],
): Promise<PlayerAction[]> {
  const settled = await Promise.allSettled(promises)
  const errors = settled
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason)
  if (errors.length > 0) throw new AggregateError(errors, 'One or more player turns failed')
  return settled
    .filter(
      (result): result is PromiseFulfilledResult<PlayerAction> => result.status === 'fulfilled',
    )
    .map((result) => result.value)
}

export function promptAssetFor(turn: TurnDescriptor) {
  switch (turn.actionType) {
    case 'speech':
      return 'speech-turn' as const
    case 'vote':
      return turn.voteKind === 'wolf-kill' ? ('wolf-vote-turn' as const) : ('vote-turn' as const)
    case 'night-action':
      return 'night-turn' as const
    case 'sheriff-action':
      return 'sheriff-turn' as const
    case 'skill-trigger':
      return 'skill-turn' as const
    default: {
      const exhaustive: never = turn.actionType
      return exhaustive
    }
  }
}

export function actionInstructionFor(
  turn: TurnDescriptor,
  context?: {
    readonly board: BoardManifest
    readonly state: GameState
    readonly playerId: PlayerId
  },
  promptVersion = promptContractVersion,
): string {
  if (turn.actionType === 'speech') {
    const instructions: string[] = []
    if (promptVersion >= 8) {
      instructions.push(getCopy('promptActions.publicFactsImmutable'))
    }
    if (promptVersion >= 9 && turn.phaseId === 'phase-night-wolf-council') {
      instructions.push(getCopy('promptActions.wolfCouncilSpeech'))
    }
    if (promptVersion >= 3 && turn.speechKind === 'sheriff') {
      instructions.push(getCopy('promptActions.sheriffCampaignPrivacy'))
    }
    if (
      promptVersion >= 6 &&
      context?.state.players.get(context.playerId)?.roleId === 'role-werewolf' &&
      (promptVersion < 9 || supportsWerewolfSelfDestruct(turn))
    ) {
      instructions.push(getCopy('promptActions.werewolfSpeechSelfDestruct'))
    }
    return instructions.join('\n')
  }
  if (
    promptVersion >= 9 &&
    (turn.actionType === 'vote' || turn.actionType === 'sheriff-action') &&
    context?.state.players.get(context.playerId)?.roleId === 'role-werewolf' &&
    supportsWerewolfSelfDestruct(turn)
  ) {
    return getCopy('promptActions.werewolfSpeechSelfDestruct')
  }
  if (promptVersion >= 13 && turn.actionType === 'vote' && turn.voteKind === 'wolf-kill') {
    return getCopy('promptActions.wolfKillVoteOnly')
  }
  if (turn.actionType === 'night-action') {
    if (turn.allowedAbilityIds?.length === 1) {
      return formatCopy(getCopy('promptActions.nightFixedAbility'), {
        abilityId: turn.allowedAbilityIds[0]!,
      })
    }
    const base = getCopy(
      turn.phaseId === 'phase-night-witch'
        ? 'promptActions.nightWitch'
        : 'promptActions.nightGeneric',
    )
    if (promptVersion === 1 || turn.phaseId !== 'phase-night-witch' || !context) return base
    const antidoteAvailable =
      (context.state.players.get(context.playerId)?.roleState.abilityUses[
        v1AbilityIds.witchAntidote
      ] ?? 0) === 0
    const attackedId =
      promptVersion >= 11 && !antidoteAvailable ? null : context.state.nightAttackTargetId
    const blockedSelfSave =
      attackedId === context.playerId && context.board.policies.witchSelfSave === 'never'
    const currentConstraint =
      promptVersion >= 11 && !antidoteAvailable
        ? getCopy('promptActions.nightWitchAntidoteUnavailable')
        : blockedSelfSave
          ? formatCopy(getCopy('promptActions.nightWitchSelfSaveBlocked'), {
              playerId: context.playerId,
            })
          : attackedId
            ? formatCopy(getCopy('promptActions.nightWitchTarget'), { playerId: attackedId })
            : getCopy('promptActions.nightWitchNoTarget')
    return `${base}\n${currentConstraint}\n${getCopy('promptActions.nightWitchLimit')}`
  }
  if (turn.actionType === 'skill-trigger') {
    const base = turn.allowedAbilityIds?.length
      ? formatCopy(getCopy('promptActions.skillAbilities'), {
          abilityIds: turn.allowedAbilityIds.map((id) => `\`${id}\``).join(' / '),
        })
      : getCopy('promptActions.skillGeneric')
    if (promptVersion >= 4 && turn.phaseId === 'phase-sheriff-transfer' && context) {
      const targets = [...context.state.players.values()]
        .filter((player) => player.alive && player.id !== context.playerId)
        .sort((left, right) => left.seat - right.seat)
        .map((player) => `\`${player.id}\``)
        .join(' / ')
      return `${base}\n${formatCopy(getCopy('promptActions.sheriffTransferTargets'), {
        playerIds: targets || getCopy('common.none'),
      })}`
    }
    return base
  }
  return ''
}

export async function mapWithConcurrency<Value>(
  values: readonly Value[],
  concurrency: number,
  operation: (value: Value) => Promise<void>,
): Promise<void> {
  const errors: unknown[] = []
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      for (;;) {
        const index = cursor++
        if (index >= values.length) return
        try {
          await operation(values[index]!)
        } catch (error) {
          errors.push(error)
        }
      }
    },
  )
  await Promise.all(workers)
  if (errors.length > 0) throw new AggregateError(errors, 'One or more player sessions failed')
}
