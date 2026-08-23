import type { EventVisibility, GameEventPayload, PlayerAction } from '@agentwolf/contracts'
import { visibility } from './rule-registry.js'
import { sanitizeSpeech } from './speech.js'
import type { GameState, PhaseNode } from './types.js'

export function appendActionOutcome({
  node,
  action,
  state,
  append,
}: {
  readonly node: PhaseNode
  readonly action: PlayerAction
  readonly state: GameState
  readonly append: (payload: GameEventPayload, eventVisibility: EventVisibility) => void
}): void {
  if (action.type === 'speech') {
    const result = sanitizeSpeech(action.text, state.players)
    if (result.replacements > 0) {
      append(
        { type: 'speech.sanitized', playerId: action.actorId, replacements: result.replacements },
        visibility.god,
      )
    }
    append(
      {
        type: 'speech.committed',
        playerId: action.actorId,
        kind: action.kind,
        text: result.text,
        sanitized: result.replacements > 0,
      },
      action.kind === 'wolf-council' ? visibility.faction('werewolf') : visibility.public,
    )
    return
  }
  if (action.type === 'sheriff-action') {
    if (action.action === 'join' || action.action === 'decline') {
      append(
        {
          type: 'sheriff.candidacy',
          playerId: action.actorId,
          standing: action.action === 'join',
          initialCandidate: action.action === 'join',
        },
        visibility.public,
      )
    } else if (action.action === 'withdraw' || action.action === 'keep-running') {
      append(
        {
          type: 'sheriff.candidacy',
          playerId: action.actorId,
          standing: action.action === 'keep-running',
          initialCandidate: false,
        },
        visibility.public,
      )
    }
    return
  }
  if (action.type === 'skill-trigger' && node.id === 'phase-sheriff-transfer') {
    append(
      {
        type: 'sheriff.transferred',
        fromPlayerId: action.actorId,
        toPlayerId: action.targetId,
      },
      visibility.public,
    )
  }
}
