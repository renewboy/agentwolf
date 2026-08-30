import type { PromptTurnFact } from './facts.js'
import type { PromptToolName } from './schema.js'

export function actionToolNamesFor(turn: PromptTurnFact): readonly PromptToolName[] {
  const actionType = turn.actionType
  switch (actionType) {
    case 'speech':
      return []
    case 'vote':
      return ['submit_vote']
    case 'night-action':
      return ['submit_night_action']
    case 'sheriff-action':
      return ['submit_sheriff_action']
    case 'skill-trigger':
      return turn.passAllowed ? ['trigger_skill', 'pass_skill'] : ['trigger_skill']
  }
  throw new Error(`Unknown Prompt action type ${String(actionType)}`)
}
