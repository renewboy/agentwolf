import type { PlayerId, RoleId } from '@agentwolf/contracts'
import type { VictoryContext } from '../../plugins/victory-registry.js'

export const MAX_WEREWOLF_BELIEF_NODES = 50_000

export type MaterialWindow = 'day' | 'night'

export interface OpponentState {
  readonly playerId: PlayerId
  readonly roleId: RoleId
  readonly canVote: boolean
  readonly hunterShot: boolean
  readonly witchPoison: boolean
  readonly witchAntidote: boolean
  readonly nightProtection: 'repeatable' | 'no-consecutive-target' | 'single-use' | null
  readonly nightProtectionAvailable: boolean
  readonly blockedProtectionTargetId: PlayerId | null
  readonly exilePrevention: boolean
}

export interface SearchWorld {
  readonly wolves: number
  readonly opponents: readonly OpponentState[]
  readonly wolfSheriff: boolean
  readonly opponentSheriffId: PlayerId | null
  readonly hunterShotWolfLoss: number
  readonly window: MaterialWindow
  readonly publiclyRevealedRoles: readonly string[]
}

interface SearchBudget {
  nodes: number
  exhausted: boolean
}

export function canForceWin(belief: readonly SearchWorld[], context: VictoryContext): boolean {
  const budget: SearchBudget = { nodes: 0, exhausted: false }
  return searchBelief(belief, context, budget, new Map(), new Set()) && !budget.exhausted
}

function searchBelief(
  belief: readonly SearchWorld[],
  context: VictoryContext,
  budget: SearchBudget,
  memo: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  const active = normalizeWorlds(belief).filter(
    (world) => !wolfObjectiveReached(world.opponents, context),
  )
  if (active.length === 0) return true
  if (active.length > MAX_WEREWOLF_BELIEF_NODES || active.some((world) => world.wolves <= 0)) {
    return false
  }
  const observations = partitionByObservation(active)
  if (observations.length > 1) {
    return observations.every((worlds) => searchBelief(worlds, context, budget, memo, visiting))
  }
  const key = beliefKey(active)
  const cached = memo.get(key)
  if (cached !== undefined) return cached
  if (visiting.has(key)) return false
  budget.nodes += 1
  if (budget.nodes > MAX_WEREWOLF_BELIEF_NODES) {
    budget.exhausted = true
    return false
  }
  visiting.add(key)
  const window = active[0]?.window
  const result =
    window === 'day'
      ? forceFromDay(active, context, budget, memo, visiting)
      : window === 'night'
        ? forceFromNight(active, context, budget, memo, visiting)
        : false
  visiting.delete(key)
  memo.set(key, result)
  return result
}

function forceFromDay(
  belief: readonly SearchWorld[],
  context: VictoryContext,
  budget: SearchBudget,
  memo: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  return commonTargetIds(belief).some((targetId) => {
    const successors: SearchWorld[] = []
    for (const world of belief) {
      const next = dayTargetSuccessors(world, targetId, context)
      if (next.length === 0) return false
      successors.push(...next)
    }
    return everyObservedSuccessorWins(successors, context, budget, memo, visiting)
  })
}

function dayTargetSuccessors(
  world: SearchWorld,
  targetId: PlayerId,
  context: VictoryContext,
): SearchWorld[] {
  const target = world.opponents.find((opponent) => opponent.playerId === targetId)
  if (!target) return []
  const wolfVotes = world.wolves + (world.wolfSheriff ? 0.5 : 0)
  const opponentVotes =
    world.opponents.filter((opponent) => opponent.canVote).length +
    (world.opponentSheriffId ? 0.5 : 0)
  if (wolfVotes < opponentVotes) return [afterWolfExile(world)]
  if (wolfVotes > opponentVotes) return afterDayExile(world, target, context)

  const runoffWolfVotes = Math.max(0, world.wolves - 1)
  const runoffOpponentVotes =
    world.opponents.filter((opponent) => opponent.canVote).length -
    (target.canVote ? 1 : 0) +
    (world.opponentSheriffId && world.opponentSheriffId !== targetId ? 0.5 : 0)
  if (runoffWolfVotes < runoffOpponentVotes) return [afterWolfExile(world)]
  if (runoffWolfVotes === runoffOpponentVotes) return [{ ...world, window: 'night' }]
  return afterDayExile(world, target, context)
}

function afterWolfExile(world: SearchWorld): SearchWorld {
  const wolves = Math.max(0, world.wolves - 1)
  return {
    ...world,
    wolves,
    wolfSheriff: world.wolfSheriff && wolves > 0,
    window: 'night',
  }
}

function afterDayExile(
  world: SearchWorld,
  target: OpponentState,
  context: VictoryContext,
): SearchWorld[] {
  if (target.exilePrevention) {
    return [
      {
        ...world,
        opponents: world.opponents
          .map((opponent) =>
            opponent.playerId === target.playerId
              ? { ...opponent, canVote: false, exilePrevention: false }
              : opponent,
          )
          .sort(compareOpponents),
        publiclyRevealedRoles: canonicalStrings([
          ...world.publiclyRevealedRoles,
          `${target.playerId}=${target.roleId}`,
        ]),
        window: 'night',
      },
    ]
  }
  const opponents = world.opponents.filter((opponent) => opponent.playerId !== target.playerId)
  const wolves = world.wolves - (target.hunterShot ? world.hunterShotWolfLoss : 0)
  const next: SearchWorld = {
    ...world,
    wolves,
    wolfSheriff: world.wolfSheriff && wolves > 0,
    opponents,
    opponentSheriffId: world.opponentSheriffId === target.playerId ? null : world.opponentSheriffId,
    window: 'night',
  }
  return transferOpponentSheriff(next, target.playerId, context)
}

function forceFromNight(
  belief: readonly SearchWorld[],
  context: VictoryContext,
  budget: SearchBudget,
  memo: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  return commonTargetIds(belief).some((targetId) => {
    const successors: SearchWorld[] = []
    for (const world of belief) {
      const next = nightTargetSuccessors(world, targetId, context)
      if (next.length === 0) return false
      successors.push(...next)
    }
    return everyObservedSuccessorWins(successors, context, budget, memo, visiting)
  })
}

function nightTargetSuccessors(
  world: SearchWorld,
  targetId: PlayerId,
  context: VictoryContext,
): SearchWorld[] {
  const target = world.opponents.find((opponent) => opponent.playerId === targetId)
  if (!target) return []
  const witches = world.opponents.filter(
    (opponent) => opponent.witchPoison || opponent.witchAntidote,
  )
  const guards = world.opponents.filter(
    (opponent) => opponent.nightProtection && opponent.nightProtectionAvailable,
  )
  if (witches.length > 1 || guards.length > 1) return []
  const guard = guards[0]
  const guardCanProtectTarget = Boolean(
    guard &&
    guard.blockedProtectionTargetId !== targetId &&
    (guard.playerId !== targetId || context.board.policies.guardCanSelfProtect),
  )
  const guardChoices = guardCanProtectTarget ? [false, true] : [false]
  const witch = witches[0]
  const witchChoices: Array<'pass' | 'poison' | 'antidote'> = ['pass']
  if (witch?.witchPoison) witchChoices.push('poison')
  const witchIsTarget = witch?.playerId === targetId
  const witchCanSelfSave =
    context.board.policies.witchSelfSave === 'always' ||
    (context.board.policies.witchSelfSave === 'first-night' && context.state.day === 0)
  if (witch?.witchAntidote && (!witchIsTarget || witchCanSelfSave)) {
    witchChoices.push('antidote')
  }

  const successors: SearchWorld[] = []
  for (const guardProtects of guardChoices) {
    for (const witchChoice of witchChoices) {
      let opponents = world.opponents.map((opponent) => {
        if (witch && opponent.playerId === witch.playerId) {
          return {
            ...opponent,
            witchPoison: witchChoice === 'poison' ? false : opponent.witchPoison,
            witchAntidote: witchChoice === 'antidote' ? false : opponent.witchAntidote,
          }
        }
        if (guard && opponent.playerId === guard.playerId) {
          return guardAfterChoice(opponent, targetId, guardProtects)
        }
        return opponent
      })
      const antidoteProtects = witchChoice === 'antidote'
      const collisionKills =
        guardProtects &&
        antidoteProtects &&
        context.board.policies.guardAntidoteCollision === 'death'
      const targetDies = collisionKills || (!guardProtects && !antidoteProtects)
      let removed: OpponentState | undefined
      if (targetDies) {
        removed = opponents.find((opponent) => opponent.playerId === targetId)
        opponents = opponents.filter((opponent) => opponent.playerId !== targetId)
      }
      const base: SearchWorld = {
        ...world,
        opponents: opponents.sort(compareOpponents),
        opponentSheriffId:
          targetDies && world.opponentSheriffId === targetId ? null : world.opponentSheriffId,
        window: 'day',
      }
      if (wolfObjectiveReached(base.opponents, context)) {
        successors.push(base)
        continue
      }
      let wolves = world.wolves - (witchChoice === 'poison' ? 1 : 0)
      if (removed?.hunterShot) wolves -= world.hunterShotWolfLoss
      const afterCounterplay: SearchWorld = {
        ...base,
        wolves,
        wolfSheriff: world.wolfSheriff && wolves > 0,
      }
      successors.push(...transferOpponentSheriff(afterCounterplay, targetId, context))
    }
  }
  return normalizeWorlds(successors)
}

function guardAfterChoice(
  guard: OpponentState,
  targetId: PlayerId,
  protectsTarget: boolean,
): OpponentState {
  if (!guard.nightProtection) return guard
  if (!protectsTarget) {
    return guard.nightProtection === 'no-consecutive-target'
      ? { ...guard, blockedProtectionTargetId: null }
      : guard
  }
  if (guard.nightProtection === 'single-use') {
    return { ...guard, nightProtectionAvailable: false, blockedProtectionTargetId: targetId }
  }
  return guard.nightProtection === 'no-consecutive-target'
    ? { ...guard, blockedProtectionTargetId: targetId }
    : guard
}

function transferOpponentSheriff(
  world: SearchWorld,
  removedPlayerId: PlayerId,
  context: VictoryContext,
): SearchWorld[] {
  if (world.opponentSheriffId || context.state.sheriff.holderId !== removedPlayerId) return [world]
  if (world.wolves <= 0 || wolfObjectiveReached(world.opponents, context)) return [world]
  if (world.opponents.length === 0) return [world]
  return world.opponents.map((opponent) => ({
    ...world,
    opponentSheriffId: opponent.playerId,
  }))
}

function everyObservedSuccessorWins(
  successors: readonly SearchWorld[],
  context: VictoryContext,
  budget: SearchBudget,
  memo: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  const normalized = normalizeWorlds(successors)
  if (normalized.length === 0 || normalized.length > MAX_WEREWOLF_BELIEF_NODES) {
    if (normalized.length > MAX_WEREWOLF_BELIEF_NODES) budget.exhausted = true
    return false
  }
  return partitionByObservation(normalized).every((belief) =>
    searchBelief(belief, context, budget, memo, visiting),
  )
}

function commonTargetIds(belief: readonly SearchWorld[]): PlayerId[] {
  const first = belief[0]
  if (!first) return []
  return first.opponents
    .map((opponent) => opponent.playerId)
    .filter((playerId) =>
      belief.every((world) => world.opponents.some((opponent) => opponent.playerId === playerId)),
    )
    .sort((left, right) => left.localeCompare(right))
}

function partitionByObservation(worlds: readonly SearchWorld[]): SearchWorld[][] {
  const partitions = new Map<string, SearchWorld[]>()
  for (const world of worlds) {
    const key = publicObservationKey(world)
    const existing = partitions.get(key) ?? []
    existing.push(world)
    partitions.set(key, existing)
  }
  return [...partitions.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, partition]) => normalizeWorlds(partition))
}

function publicObservationKey(world: SearchWorld): string {
  return [
    world.window,
    world.wolves,
    world.wolfSheriff ? 1 : 0,
    world.opponentSheriffId ?? 'none',
    world.opponents
      .map((opponent) => `${opponent.playerId}/${opponent.canVote ? 1 : 0}`)
      .sort()
      .join(','),
    canonicalStrings(world.publiclyRevealedRoles).join(','),
  ].join(':')
}

function normalizeWorlds(worlds: readonly SearchWorld[]): SearchWorld[] {
  const unique = new Map(worlds.map((world) => [worldKey(world), world]))
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, world]) => world)
}

function wolfObjectiveReached(
  opponents: readonly OpponentState[],
  context: VictoryContext,
): boolean {
  if (context.board.policies.victory === 'slaughter-all') return opponents.length === 0
  const livingVillager = opponents.some(
    (opponent) => context.roles.role(opponent.roleId).kind === 'villager',
  )
  const livingGod = opponents.some((opponent) => {
    const role = context.roles.role(opponent.roleId)
    return role.faction === 'village' && role.kind === 'god'
  })
  return !livingVillager || !livingGod
}

function beliefKey(worlds: readonly SearchWorld[]): string {
  return worlds.map(worldKey).sort().join('||')
}

function worldKey(world: SearchWorld): string {
  return [
    world.window,
    world.wolves,
    world.wolfSheriff ? 1 : 0,
    world.opponentSheriffId ?? 'none',
    world.hunterShotWolfLoss,
    world.opponents.map(opponentKey).sort().join(','),
    canonicalStrings(world.publiclyRevealedRoles).join(','),
  ].join(':')
}

export function opponentKey(opponent: OpponentState): string {
  return [
    opponent.playerId,
    opponent.roleId,
    opponent.canVote ? 1 : 0,
    opponent.hunterShot ? 1 : 0,
    opponent.witchPoison ? 1 : 0,
    opponent.witchAntidote ? 1 : 0,
    opponent.nightProtection ?? 'none',
    opponent.nightProtectionAvailable ? 1 : 0,
    opponent.blockedProtectionTargetId ?? 'none',
    opponent.exilePrevention ? 1 : 0,
  ].join('/')
}

export function compareOpponents(left: OpponentState, right: OpponentState): number {
  return (
    left.playerId.localeCompare(right.playerId) ||
    opponentKey(left).localeCompare(opponentKey(right))
  )
}

function canonicalStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}
