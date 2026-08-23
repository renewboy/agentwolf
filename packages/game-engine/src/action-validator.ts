import type { EventVisibility, PlayerAction } from '@agentwolf/contracts'
import { systemAbilityIds } from './classic-rules.js'
import { assertRule } from './errors.js'
import { v1AbilityIds } from './resolution.js'
import type { RoleRegistry } from './roles/registry.js'
import { sanitizeSpeech } from './speech.js'
import type { BoardManifest, GameState, PhaseNode } from './types.js'

export function phaseSpeechKind(
  phaseId: string,
): Extract<PlayerAction, { type: 'speech' }>['kind'] {
  if (phaseId === 'phase-night-wolf-council') return 'wolf-council'
  if (phaseId.includes('sheriff') && phaseId.includes('runoff')) return 'runoff'
  if (phaseId.includes('sheriff')) return 'sheriff'
  if (phaseId === 'phase-last-words') return 'last-words'
  if (phaseId.includes('runoff')) return 'runoff'
  return 'day'
}

export function expectedVoteKind(phaseId: string): Extract<PlayerAction, { type: 'vote' }>['kind'] {
  if (phaseId === 'phase-night-wolf-vote') return 'wolf-kill'
  if (phaseId === 'phase-sheriff-vote') return 'sheriff'
  if (phaseId === 'phase-sheriff-runoff-vote') return 'sheriff-runoff'
  if (phaseId === 'phase-day-runoff-vote') return 'exile-runoff'
  return 'exile'
}

export function validateTurnAction(
  node: PhaseNode,
  action: PlayerAction,
  state: GameState,
  board: BoardManifest,
  roles: RoleRegistry,
): void {
  assertRule(node.actionType === action.type, `${node.id} requires ${node.actionType}`)
  const actor = state.players.get(action.actorId)
  assertRule(actor?.roleId, `Actor ${action.actorId} has no role`)

  if (action.type === 'speech') {
    assertRule(action.kind === phaseSpeechKind(node.id), `Unexpected speech kind ${action.kind}`)
    const result = sanitizeSpeech(action.text, state.players)
    assertRule(
      result.unknownIds.length === 0,
      `Speech contains unknown Player ID ${result.unknownIds[0]}`,
    )
  } else if (action.type === 'vote') {
    validateVote(node, action, state)
  } else if (action.type === 'sheriff-action') {
    const allowed =
      node.id === 'phase-sheriff-signup'
        ? ['join', 'decline']
        : node.id === 'phase-sheriff-withdraw'
          ? ['withdraw', 'keep-running']
          : ['speech-clockwise', 'speech-counterclockwise']
    assertRule(allowed.includes(action.action), `${action.action} is invalid during ${node.id}`)
  } else if (action.type === 'night-action') {
    if (action.option === 'pass') {
      assertRule(action.targetIds.length === 0, 'A pass action cannot have targets')
      return
    }
    if (node.abilityId) {
      assertRule(action.abilityId === node.abilityId, `${node.id} requires ${node.abilityId}`)
    } else if (node.id === 'phase-night-witch') {
      assertRule(
        action.abilityId === v1AbilityIds.witchAntidote ||
          action.abilityId === v1AbilityIds.witchPoison,
        'Witch phase requires a potion action',
      )
    }
    const entry = roles.ability(action.abilityId)
    assertRule(entry.role.id === actor.roleId, `${actor.name} does not own ${action.abilityId}`)
    entry.ability.validate({ state, board, action, actor })
  } else if (action.type === 'skill-trigger') {
    if (node.id === 'phase-sheriff-transfer') {
      assertRule(
        action.abilityId === systemAbilityIds.sheriffTransferAbilityId,
        'Expected badge transfer',
      )
      if (action.targetId) {
        const target = state.players.get(action.targetId)
        assertRule(target?.alive, 'Badge target must be alive')
        assertRule(target.id !== actor.id, 'Badge cannot remain with a dead sheriff')
      }
      return
    }
    assertRule(action.abilityId === v1AbilityIds.hunterShot, 'Unexpected death trigger')
    if (action.option === 'pass') {
      assertRule(action.targetId === null, 'A pass trigger cannot have a target')
      return
    }
    roles.ability(action.abilityId).ability.validate({ state, board, action, actor })
  }
}

function validateVote(
  node: PhaseNode,
  action: Extract<PlayerAction, { type: 'vote' }>,
  state: GameState,
): void {
  const expectedKind = expectedVoteKind(node.id)
  assertRule(action.kind === expectedKind, `${node.id} requires ${expectedKind} vote`)
  if (!action.targetId) return
  const target = state.players.get(action.targetId)
  assertRule(target?.alive, 'Vote target must be publicly alive')
  if (expectedKind === 'wolf-kill') {
    assertRule(target.faction !== 'werewolf', 'Werewolves cannot attack a werewolf')
  } else if (expectedKind === 'sheriff') {
    assertRule(state.sheriff.standingCandidates.has(target.id), 'Target is not running for sheriff')
  } else if (expectedKind === 'sheriff-runoff' || expectedKind === 'exile-runoff') {
    assertRule(state.lastVote?.tiedPlayerIds.includes(target.id), 'Target is not in the runoff')
  }
}

export function normalizeTurnAction(
  node: PhaseNode,
  action: PlayerAction,
  state: GameState,
): PlayerAction {
  if (action.type !== 'speech') return action
  return {
    ...action,
    text: sanitizeSpeech(action.text, state.players).text,
    kind: phaseSpeechKind(node.id),
  }
}

export function turnActionVisibility(node: PhaseNode, action: PlayerAction): EventVisibility {
  if (node.id === 'phase-night-wolf-council' || node.id === 'phase-night-wolf-vote') {
    return { kind: 'faction', faction: 'werewolf' }
  }
  if (action.type === 'speech' && action.kind !== 'wolf-council') return { kind: 'public' }
  if (action.type === 'sheriff-action') return { kind: 'public' }
  return { kind: 'players', playerIds: [action.actorId] }
}

export function isSelfDestructInterrupt(
  node: PhaseNode,
  action: PlayerAction,
): action is Extract<PlayerAction, { type: 'skill-trigger' }> {
  if (action.type !== 'skill-trigger' || action.abilityId !== v1AbilityIds.werewolfSelfDestruct) {
    return false
  }
  return (
    node.id.startsWith('phase-sheriff-') ||
    node.id === 'phase-day-speech' ||
    node.id === 'phase-day-runoff-speech' ||
    node.id === 'phase-day-vote' ||
    node.id === 'phase-day-runoff-vote'
  )
}
