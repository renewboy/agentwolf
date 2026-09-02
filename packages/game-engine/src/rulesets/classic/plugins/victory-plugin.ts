import { PlayerIdSchema, PluginEventTypeSchema, type PlayerId } from '@agentwolf/contracts'
import { z } from 'zod'
import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import type { VictoryCandidate } from '../../../plugins/victory-registry.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'
import type { GameState } from '../../../types.js'
import { evaluateVictory } from '../victory.js'
import { evaluateWerewolfForcedWin } from '../werewolf-forced-win.js'
import { classicPluginIds } from './ids.js'

export const wolfKnifeVictoryLockedEventType = PluginEventTypeSchema.parse(
  'event-wolf-knife-victory-locked',
)

const wolfKnifeVictoryLockSchema = z.object({
  winningPlayerIds: z.array(PlayerIdSchema).min(1),
  formalReason: z.string().min(1),
})

const victoryPluginStateSchema = z.object({
  wolfKnifeVictoryLock: wolfKnifeVictoryLockSchema.nullable(),
})

const initialVictoryPluginState = { wolfKnifeVictoryLock: null }

export const classicVictoryPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.victory,
  version: 1,
  register: ({ endgames, events, victories }) => {
    events.register({
      pluginId: classicPluginIds.victory,
      eventType: wolfKnifeVictoryLockedEventType,
      schemaVersion: 1,
      stateSchema: victoryPluginStateSchema,
      dataSchema: wolfKnifeVictoryLockSchema,
      initialState: initialVictoryPluginState,
      reduce: (state, data) => {
        const current = state.wolfKnifeVictoryLock
        if (
          current &&
          (current.formalReason !== data.formalReason ||
            current.winningPlayerIds.join(',') !== data.winningPlayerIds.join(','))
        ) {
          throw new Error('Wolf-knife victory lock cannot be replaced')
        }
        return { wolfKnifeVictoryLock: data }
      },
    })
    victories.register({
      id: 'classic-victory',
      evaluate: ({ state, board, roles }) => evaluateVictory(state, board, roles),
    })
    victories.registerForced({
      id: 'classic-werewolf-forced-win',
      evaluate: (context, evaluateFormal) =>
        evaluateWerewolfForcedWin(context, endgames, evaluateFormal),
    })
    victories.registerModifier({
      id: 'classic-wolf-knife-victory-lock',
      order: 1_000,
      transform: (context, current) => {
        const lock = wolfKnifeVictoryLock(context.state)
        return lock
          ? {
              winner: 'werewolf',
              winningPlayerIds: lock.winningPlayerIds,
              reason: 'werewolf-knife-priority',
            }
          : current
      },
    })
  },
}

export function appendWolfKnifeVictoryLock(
  runtime: RuleRuntime,
  candidate: VictoryCandidate,
): void {
  if (candidate.winner !== 'werewolf') {
    throw new Error('Only a Werewolf victory can lock the wolf-knife checkpoint')
  }
  runtime.append(
    {
      type: 'plugin.event',
      pluginId: classicPluginIds.victory,
      eventType: wolfKnifeVictoryLockedEventType,
      schemaVersion: 1,
      data: {
        winningPlayerIds: canonicalPlayerIds(candidate.winningPlayerIds),
        formalReason: candidate.reason,
      },
    },
    visibility.god,
  )
}

export function hasWolfKnifeVictoryLock(state: GameState): boolean {
  return wolfKnifeVictoryLock(state) !== null
}

function wolfKnifeVictoryLock(
  state: GameState,
): { readonly winningPlayerIds: readonly PlayerId[]; readonly formalReason: string } | null {
  return victoryPluginStateSchema.parse(
    state.pluginState.get(classicPluginIds.victory) ?? initialVictoryPluginState,
  ).wolfKnifeVictoryLock
}

function canonicalPlayerIds(playerIds: readonly PlayerId[]): PlayerId[] {
  return [...new Set(playerIds)].sort((left, right) => left.localeCompare(right))
}
