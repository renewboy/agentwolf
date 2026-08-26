import { z } from 'zod'
import { PlayerIdSchema, type PlayerId } from '@agentwolf/contracts'
import {
  ResolutionRegistry,
  type ResolutionContext,
  type ResolutionFrame,
} from '../../plugins/resolution-registry.js'
import type {
  DamageCause,
  DamageEffect,
  ExactInspectEffect,
  InspectEffect,
  PreventDeathEffect,
  ProtectEffect,
  ResolutionResult,
  TargetEffect,
} from '../../types.js'
import { classicIdentityQueries } from './identity-queries.js'

const damageCauseSchema = z.enum([
  'werewolf',
  'poison',
  'shot',
  'exile',
  'self-destruct',
  'white-wolf-detonate',
  'linked',
])

const targetEffectSchema = z.object({
  kind: z.literal('target-map'),
  priority: z.literal(100),
  sourceId: PlayerIdSchema,
  fromTargetId: PlayerIdSchema,
  toTargetId: PlayerIdSchema,
})
const protectEffectSchema = z.object({
  kind: z.literal('protect'),
  priority: z.literal(300),
  sourceId: PlayerIdSchema,
  targetId: PlayerIdSchema,
  protection: z.string().min(1),
  blocks: z.array(damageCauseSchema).min(1),
})
const damageEffectSchema = z.object({
  kind: z.literal('damage'),
  priority: z.union([z.literal(400), z.literal(700)]),
  sourceId: PlayerIdSchema.nullable(),
  targetId: PlayerIdSchema,
  ignoredProtections: z.array(z.string().min(1)).optional(),
  cause: damageCauseSchema,
})
const inspectEffectSchema = z.object({
  kind: z.literal('inspect'),
  priority: z.literal(500),
  sourceId: PlayerIdSchema,
  targetId: PlayerIdSchema,
})
const exactInspectEffectSchema = z.object({
  kind: z.literal('inspect-role'),
  priority: z.literal(500),
  sourceId: PlayerIdSchema,
  targetId: PlayerIdSchema,
})
const preventDeathEffectSchema = z.object({
  kind: z.literal('prevent-death'),
  priority: z.literal(600),
  sourceId: PlayerIdSchema,
  targetId: PlayerIdSchema,
  cause: z.literal('exile'),
  reason: z.string(),
})

const targetMappingsKey = 'classic.target-mappings'
const protectionsKey = 'classic.protections'
const damagesKey = 'classic.damages'
const preventedExilesKey = 'classic.prevented-exiles'
const inspectionsKey = 'classic.inspections'
const exactInspectionsKey = 'classic.exact-inspections'

export function createClassicResolutionRegistry(): ResolutionRegistry {
  const registry = new ResolutionRegistry()
  registerClassicResolution(registry)
  return registry
}

export function registerClassicResolution(registry: ResolutionRegistry): void {
  registry.registerEffect<TargetEffect>({
    kind: 'target-map',
    schema: targetEffectSchema,
    lane: 'targeting',
    apply: (effect, _context, frame) => {
      frame
        .fact(targetMappingsKey, () => new Map<PlayerId, PlayerId>())
        .set(effect.fromTargetId, effect.toTargetId)
    },
  })
  registry.registerEffect<ProtectEffect>({
    kind: 'protect',
    schema: protectEffectSchema,
    lane: 'protection',
    apply: (effect, _context, frame) => {
      const targetId = redirectedTarget(effect.targetId, frame)
      const protections = frame.fact(protectionsKey, () => new Map<PlayerId, ProtectEffect[]>())
      const targetProtections = protections.get(targetId) ?? []
      targetProtections.push({ ...effect, targetId })
      protections.set(targetId, targetProtections)
    },
  })
  registry.registerEffect<DamageEffect>({
    kind: 'damage',
    schema: damageEffectSchema,
    lane: 'damage',
    apply: (effect, _context, frame) => {
      const targetId = redirectedTarget(effect.targetId, frame)
      const damages = frame.fact(damagesKey, () => new Map<PlayerId, DamageEffect[]>())
      const targetDamages = damages.get(targetId) ?? []
      targetDamages.push({ ...effect, targetId })
      damages.set(targetId, targetDamages)
    },
  })
  registry.registerEffect<InspectEffect>({
    kind: 'inspect',
    schema: inspectEffectSchema,
    lane: 'information',
    apply: (effect, context, frame) => {
      const targetId = redirectedTarget(effect.targetId, frame)
      if (!context.queries) throw new Error('Alignment inspection requires a query registry')
      frame
        .fact(inspectionsKey, () => [] as ResolutionResult['inspections'][number][])
        .push({
          sourceId: effect.sourceId,
          targetId,
          result: context.queries.resolve(classicIdentityQueries.alignment, { targetId }, context),
        })
    },
  })
  registry.registerEffect<ExactInspectEffect>({
    kind: 'inspect-role',
    schema: exactInspectEffectSchema,
    lane: 'information',
    apply: (effect, context, frame) => {
      const targetId = redirectedTarget(effect.targetId, frame)
      if (!context.queries) throw new Error('Exact inspection requires a query registry')
      frame
        .fact(exactInspectionsKey, () => [] as ResolutionResult['exactInspections'][number][])
        .push({
          sourceId: effect.sourceId,
          targetId,
          roleId: context.queries.resolve(classicIdentityQueries.exactRole, { targetId }, context),
        })
    },
  })
  registry.registerEffect<PreventDeathEffect>({
    kind: 'prevent-death',
    schema: preventDeathEffectSchema,
    lane: 'prevention',
    apply: (effect, _context, frame) => {
      frame
        .fact(preventedExilesKey, () => new Set<PlayerId>())
        .add(redirectedTarget(effect.targetId, frame))
    },
  })
  registry.registerFinalizer({ id: 'classic-combat', finalize: finalizeClassicCombat })
  registry.registerFinalizer({
    id: 'classic-inspection',
    finalize: (_context, frame) => ({ inspections: frame.read(inspectionsKey) ?? [] }),
  })
  registry.registerFinalizer({
    id: 'classic-exact-inspection',
    finalize: (_context, frame) => ({ exactInspections: frame.read(exactInspectionsKey) ?? [] }),
  })
}

function redirectedTarget(targetId: PlayerId, frame: ResolutionFrame): PlayerId {
  return frame.read<Map<PlayerId, PlayerId>>(targetMappingsKey)?.get(targetId) ?? targetId
}

function finalizeClassicCombat(
  context: ResolutionContext,
  frame: ResolutionFrame,
): Pick<ResolutionResult, 'pendingDeaths' | 'savedPlayerIds'> {
  const protections =
    frame.read<Map<PlayerId, ProtectEffect[]>>(protectionsKey) ??
    new Map<PlayerId, ProtectEffect[]>()
  const damages =
    frame.read<Map<PlayerId, DamageEffect[]>>(damagesKey) ?? new Map<PlayerId, DamageEffect[]>()
  const preventedExiles = frame.read<Set<PlayerId>>(preventedExilesKey) ?? new Set<PlayerId>()
  const pendingDeaths: ResolutionResult['pendingDeaths'][number][] = []
  const savedPlayerIds: PlayerId[] = []
  for (const [targetId, targetDamages] of damages) {
    const targetProtections = protections.get(targetId) ?? []
    const survivingDamages = targetDamages.filter((damage) => {
      if (damage.cause === 'exile') return !preventedExiles.has(targetId)
      const ignored = new Set(damage.ignoredProtections ?? [])
      const blockers = targetProtections.filter(
        (protection) =>
          !ignored.has(protection.protection) && blocksDamage(protection, damage.cause),
      )
      if (damage.cause !== 'werewolf') return blockers.length === 0
      if (
        blockers.some((entry) => entry.protection !== 'guard' && entry.protection !== 'antidote')
      ) {
        return false
      }
      const guarded = blockers.some((entry) => entry.protection === 'guard')
      const healed = blockers.some((entry) => entry.protection === 'antidote')
      if (guarded && healed) return context.board.policies.guardAntidoteCollision === 'death'
      return !guarded && !healed
    })
    if (survivingDamages.length > 0) {
      pendingDeaths.push({
        playerId: targetId,
        causes: [...new Set(survivingDamages.map((damage) => damage.cause))],
      })
    } else if (targetDamages.some((damage) => damage.cause === 'werewolf')) {
      savedPlayerIds.push(targetId)
    }
  }
  return { pendingDeaths, savedPlayerIds }
}

function blocksDamage(protection: ProtectEffect, cause: DamageCause): boolean {
  return protection.blocks.includes(cause)
}
