import {
  ResolutionFrame as CoreResolutionFrame,
  ResolutionRegistry as CoreResolutionRegistry,
  type EffectDefinition as CoreEffectDefinition,
  type ResolutionFinalizer as CoreResolutionFinalizer,
} from '@agent-arena/ruleset'
import type { PlayerId } from '@agentwolf/contracts'
import type { BoardManifest, GameState, ResolutionEffect, ResolutionResult } from '../types.js'
import type { RoleRegistry } from '../roles/registry.js'
import type { QueryRegistry } from './query-registry.js'

export const resolutionLanes = [
  'targeting',
  'prevention',
  'protection',
  'damage',
  'information',
  'death',
  'reaction',
  'announcement',
  'victory',
] as const

export type ResolutionLane = (typeof resolutionLanes)[number]

export interface ResolutionContext {
  readonly state: GameState
  readonly board: BoardManifest
  readonly roles: RoleRegistry
  readonly queries?: QueryRegistry
}

export interface ResolutionContribution {
  readonly pendingDeaths?: ResolutionResult['pendingDeaths']
  readonly savedPlayerIds?: readonly PlayerId[]
  readonly inspections?: ResolutionResult['inspections']
  readonly exactInspections?: ResolutionResult['exactInspections']
  readonly consumedAbilityIds?: ResolutionResult['consumedAbilityIds']
}

export const ResolutionFrame = CoreResolutionFrame
export type ResolutionFrame = CoreResolutionFrame<ResolutionEffect>

export type EffectDefinition<Effect extends ResolutionEffect> = CoreEffectDefinition<
  ResolutionEffect,
  Effect,
  ResolutionLane,
  ResolutionContext
>

export type ResolutionFinalizer = CoreResolutionFinalizer<
  ResolutionEffect,
  ResolutionContext,
  ResolutionContribution
>

export class ResolutionRegistry extends CoreResolutionRegistry<
  ResolutionEffect,
  ResolutionLane,
  ResolutionContext,
  ResolutionContribution,
  ResolutionResult
> {
  public constructor() {
    super({ lanes: resolutionLanes, merge: mergeContributions })
  }
}

function mergeContributions(contributions: readonly ResolutionContribution[]): ResolutionResult {
  const pendingDeaths = new Map<PlayerId, Set<string>>()
  const savedPlayerIds = new Set<PlayerId>()
  const inspections: ResolutionResult['inspections'][number][] = []
  const exactInspections: ResolutionResult['exactInspections'][number][] = []
  const consumedAbilityIds: ResolutionResult['consumedAbilityIds'][number][] = []
  for (const contribution of contributions) {
    for (const death of contribution.pendingDeaths ?? []) {
      const causes = pendingDeaths.get(death.playerId) ?? new Set()
      for (const cause of death.causes) causes.add(cause)
      pendingDeaths.set(death.playerId, causes)
    }
    for (const playerId of contribution.savedPlayerIds ?? []) savedPlayerIds.add(playerId)
    inspections.push(...(contribution.inspections ?? []))
    exactInspections.push(...(contribution.exactInspections ?? []))
    consumedAbilityIds.push(...(contribution.consumedAbilityIds ?? []))
  }
  return {
    pendingDeaths: [...pendingDeaths].map(([playerId, causes]) => ({
      playerId,
      causes: [...causes],
    })),
    savedPlayerIds: [...savedPlayerIds],
    inspections,
    exactInspections,
    consumedAbilityIds,
  }
}
