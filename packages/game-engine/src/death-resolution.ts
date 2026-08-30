import type { DeathTiming } from '@agentwolf/contracts'
import { assertRule } from './errors.js'
import { visibility, type RuleRuntime } from './rule-registry.js'
import type { ResolvedDeathReaction } from './plugins/trigger-registry.js'
import type { PendingDeath, TimedDeath } from './types.js'

export function resolveDeathBatch(
  runtime: RuleRuntime,
  deaths: readonly PendingDeath[],
  timing: DeathTiming,
): readonly ResolvedDeathReaction[] {
  const timedDeaths = deaths.map((death): TimedDeath => {
    if (death.timing && death.timing !== timing) {
      throw new Error(`Death ${death.playerId} has conflicting timing`)
    }
    return { playerId: death.playerId, causes: [...death.causes], timing }
  })
  return runtime.triggers.resolveDeaths(timedDeaths, {
    state: runtime.state,
    board: runtime.board,
    roles: runtime.roles,
  })
}

export function appendIndividualDeaths(
  runtime: RuleRuntime,
  deaths: readonly PendingDeath[],
  timing: DeathTiming,
  persistTiming = true,
): readonly ResolvedDeathReaction[] {
  const resolved = resolveDeathBatch(runtime, deaths, timing)
  for (const entry of resolved) {
    const player = runtime.state.players.get(entry.death.playerId)
    assertRule(player, `Unknown death target ${entry.death.playerId}`)
    assertRule(player.alive, `Death target ${entry.death.playerId} is not alive`)
    runtime.append(
      {
        type: 'player.died',
        playerId: entry.death.playerId,
        causes: [...entry.death.causes],
        announced: false,
        ...(persistTiming ? { timing: entry.death.timing } : {}),
      },
      visibility.god,
    )
    if (entry.announcement !== 'events-only') {
      runtime.append(
        {
          type: 'public.announcement',
          code: 'player-eliminated',
          playerIds: [entry.death.playerId],
          params: {},
        },
        visibility.public,
      )
    }
    for (const event of entry.events) runtime.append(event.payload, event.visibility)
  }
  return resolved
}

export function appendAutomaticDeathAnnouncements(
  runtime: RuleRuntime,
  resolved: readonly ResolvedDeathReaction[],
): void {
  for (const entry of resolved) {
    if (entry.original) continue
    if (entry.announcement !== 'events-only') {
      runtime.append(
        {
          type: 'public.announcement',
          code: 'player-eliminated',
          playerIds: [entry.death.playerId],
          params: {},
        },
        visibility.public,
      )
    }
    for (const event of entry.events) runtime.append(event.payload, event.visibility)
  }
}

export function appendAutomaticDeathEvents(
  runtime: RuleRuntime,
  resolved: readonly ResolvedDeathReaction[],
  options: { readonly suppressPublicEvents?: boolean } = {},
): void {
  for (const entry of resolved) {
    for (const event of entry.events) {
      runtime.append(
        event.payload,
        options.suppressPublicEvents && event.visibility.kind === 'public'
          ? visibility.god
          : event.visibility,
      )
    }
  }
}
