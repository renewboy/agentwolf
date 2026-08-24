import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { classicPluginIds } from './ids.js'

export const classicLegacyEventPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.legacyEvents,
  version: 1,
  register: ({ events }) => {
    events.registerLegacyReducer('idiot.revealed', (state, event) => {
      if (event.payload.type !== 'idiot.revealed') return state
      const player = state.players.get(event.payload.playerId)
      if (!player) throw new Error(`Unknown Idiot reveal player ${event.payload.playerId}`)
      const players = new Map(state.players)
      players.set(player.id, {
        ...player,
        canVote: false,
        roleState: {
          ...player.roleState,
          memory: { ...player.roleState.memory, 'idiot.revealed': true },
        },
      })
      return { ...state, players }
    })
    events.registerLegacyReducer('guard.protected', (state, event) => {
      if (event.payload.type !== 'guard.protected') return state
      const player = state.players.get(event.payload.actorId)
      if (!player) throw new Error(`Unknown Guard actor ${event.payload.actorId}`)
      const players = new Map(state.players)
      players.set(player.id, {
        ...player,
        roleState: {
          ...player.roleState,
          memory: { ...player.roleState.memory, 'guard.lastTarget': event.payload.targetId },
        },
      })
      return { ...state, players }
    })
  },
}
