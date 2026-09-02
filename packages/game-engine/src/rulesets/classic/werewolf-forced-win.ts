import type { PlayerId, RoleId } from '@agentwolf/contracts'
import { visibleRoleId } from '../../visibility.js'
import type { EndgameRegistry, WerewolfProofPreparation } from '../../plugins/endgame-registry.js'
import type { VictoryCandidate, VictoryContext } from '../../plugins/victory-registry.js'
import type { GameState } from '../../types.js'

const MAX_BELIEF_NODES = 50_000

type FormalVictoryEvaluator = (context: VictoryContext) => VictoryCandidate | null

type MaterialWindow = 'day' | 'night'

interface OpponentState {
  readonly roleId: RoleId
  readonly canVote: boolean
  readonly hunterShot: boolean
  readonly witchPoison: boolean
  readonly witchAntidote: boolean
  readonly nightProtection: 'repeatable' | 'no-consecutive-target' | 'single-use' | null
  readonly nightProtectionAvailable: boolean
  readonly exilePrevention: boolean
}

interface SearchState {
  readonly wolves: number
  readonly opponents: readonly OpponentState[]
  readonly wolfSheriff: boolean
  readonly opponentSheriff: boolean
  readonly hunterShotWolfLoss: number
  readonly window: MaterialWindow
}

interface SearchBudget {
  nodes: number
  exhausted: boolean
}

export function evaluateWerewolfForcedWin(
  context: VictoryContext,
  registry: EndgameRegistry,
  evaluateFormal: FormalVictoryEvaluator,
): VictoryCandidate | null {
  if (context.state.status !== 'running' || context.state.pendingDeaths.size > 0) return null
  if (awaitingInitialSheriff(context.state, context.board.sheriff)) return null
  const window = materialWindow(context.state, context.events ?? [])
  if (!window) return null

  const groups = werewolfControlGroups(context, registry)
  for (const group of groups) {
    const preparation = prepareProof(context, registry, group)
    if (!preparation) continue
    const variants = opponentVariants(context, registry, group, preparation)
    if (!variants || variants.length === 0) continue
    const budget: SearchBudget = { nodes: 0, exhausted: false }
    const sheriffId = context.state.sheriff.holderId
    const wolfSheriff = Boolean(sheriffId && group.has(sheriffId))
    const opponentSheriff = Boolean(
      sheriffId && !group.has(sheriffId) && context.state.players.get(sheriffId)?.alive,
    )
    const wolves = [...group].filter(
      (playerId) => context.state.players.get(playerId)?.alive,
    ).length
    const everyVariantWins = variants.every((opponents) =>
      canForceWin(
        {
          wolves,
          opponents,
          wolfSheriff,
          opponentSheriff,
          hunterShotWolfLoss: preparation.hunterShotWolfLoss,
          window,
        },
        context,
        budget,
        new Map(),
        new Set(),
      ),
    )
    if (!everyVariantWins || budget.exhausted) continue
    const terminal = terminalCandidate(context, group, evaluateFormal)
    if (terminal?.winner !== 'werewolf') continue
    return { ...terminal, reason: 'werewolf-forced-win' }
  }
  return null
}

function werewolfControlGroups(
  context: VictoryContext,
  registry: EndgameRegistry,
): ReadonlySet<PlayerId>[] {
  const groups: ReadonlySet<PlayerId>[] = []
  const factionRoster = [...(context.events ?? [])]
    .reverse()
    .find(
      (event) => event.payload.type === 'faction.members' && event.payload.faction === 'werewolf',
    )
  if (factionRoster?.payload.type === 'faction.members') {
    const shared = factionRoster.payload.playerIds.filter((playerId) => {
      const player = context.state.players.get(playerId)
      return Boolean(
        player?.alive &&
        player.roleId &&
        registry.model(player.roleId)?.wolfControl === 'shared-faction',
      )
    })
    if (shared.length > 0) groups.push(new Set(shared))
  }
  for (const player of context.state.players.values()) {
    if (!player.alive || !player.roleId) continue
    const model = registry.model(player.roleId)
    if (model?.wolfControl !== 'isolated') continue
    if (model.canControlWerewolfProof && !model.canControlWerewolfProof(context, player.id))
      continue
    groups.push(new Set([player.id]))
  }
  return groups
}

function prepareProof(
  context: VictoryContext,
  registry: EndgameRegistry,
  group: ReadonlySet<PlayerId>,
): WerewolfProofPreparation | null {
  let current: WerewolfProofPreparation = {
    activeRoleIds: context.board.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    ),
    hunterShotWolfLoss: 1,
  }
  for (const model of registry.list()) {
    if (!current.activeRoleIds.includes(model.roleId) || !model.prepareWerewolfProof) continue
    const next = model.prepareWerewolfProof(context, group, current)
    if (!next) return null
    current = next
  }
  return current.activeRoleIds.length === context.board.playerCount ? current : null
}

function opponentVariants(
  context: VictoryContext,
  registry: EndgameRegistry,
  group: ReadonlySet<PlayerId>,
  preparation: WerewolfProofPreparation,
): OpponentState[][] | null {
  const pool = [...preparation.activeRoleIds]
  const groupRoleId = context.state.players.get([...group][0]!)?.roleId
  const groupControl = groupRoleId ? registry.model(groupRoleId)?.wolfControl : null
  const knownLiving: OpponentState[] = []
  let unknownLivingCount = 0
  for (const player of context.state.players.values()) {
    const knownRoleId = roleVisibleToGroup(player.id, group, context)
    if (knownRoleId && !removeOne(pool, knownRoleId)) return null
    if (!player.alive || group.has(player.id)) continue
    if (!knownRoleId) {
      if (!player.canVote) return null
      unknownLivingCount += 1
      continue
    }
    const opponent = opponentFor(knownRoleId, player.canVote, registry)
    const knownModel = registry.model(knownRoleId)
    if (!opponent || (knownModel && knownModel.wolfControl !== 'none')) return null
    knownLiving.push(opponent)
  }
  for (const playerId of group) {
    const roleId = context.state.players.get(playerId)?.roleId
    if (!roleId || roleVisibleToGroup(playerId, group, context) !== roleId) return null
  }

  const selections = chooseRoleMultisets(pool, unknownLivingCount)
  const variants = new Map<string, OpponentState[]>()
  for (const selection of selections) {
    const unknown: OpponentState[] = []
    let valid = true
    for (const roleId of selection) {
      const model = registry.model(roleId)
      if (model?.wolfControl === 'shared-faction') {
        valid = false
        break
      }
      if (model?.wolfControl === 'isolated') {
        if (groupControl === 'isolated') {
          valid = false
          break
        }
        return null
      }
      const opponent = opponentFor(roleId, true, registry)
      if (!opponent) {
        valid = false
        break
      }
      unknown.push(opponent)
    }
    if (!valid) continue
    const opponents = [...knownLiving, ...unknown].sort(compareOpponents)
    variants.set(opponents.map(opponentKey).join('|'), opponents)
    if (variants.size > MAX_BELIEF_NODES) return null
  }
  return [...variants.values()]
}

function roleVisibleToGroup(
  playerId: PlayerId,
  group: ReadonlySet<PlayerId>,
  context: VictoryContext,
): RoleId | null {
  for (const viewerId of group) {
    const roleId = visibleRoleId(
      playerId,
      { kind: 'player', playerId: viewerId },
      context.state,
      context.events,
    )
    if (roleId) return roleId
  }
  return null
}

function opponentFor(
  roleId: RoleId,
  canVote: boolean,
  registry: EndgameRegistry,
): OpponentState | null {
  const model = registry.model(roleId)
  const traits = model?.traits ?? {}
  return {
    roleId,
    canVote,
    hunterShot: traits.hunterShot ?? false,
    witchPoison: traits.witchPotions ?? false,
    witchAntidote: traits.witchPotions ?? false,
    nightProtection: traits.nightProtection ?? null,
    nightProtectionAvailable: Boolean(traits.nightProtection),
    exilePrevention: traits.exilePrevention ?? false,
  }
}

function chooseRoleMultisets(roleIds: readonly RoleId[], size: number): RoleId[][] {
  if (size < 0 || size > roleIds.length) return []
  const counts = new Map<RoleId, number>()
  for (const roleId of roleIds) counts.set(roleId, (counts.get(roleId) ?? 0) + 1)
  const entries = [...counts].sort(([left], [right]) => left.localeCompare(right))
  const results: RoleId[][] = []
  const selected: RoleId[] = []
  const visit = (index: number, remaining: number): void => {
    if (remaining === 0) {
      results.push([...selected])
      return
    }
    const [roleId, count] = entries[index] ?? []
    if (!roleId || count === undefined) return
    const maximum = Math.min(count, remaining)
    for (let take = 0; take <= maximum; take += 1) {
      for (let item = 0; item < take; item += 1) selected.push(roleId)
      visit(index + 1, remaining - take)
      selected.splice(selected.length - take, take)
    }
  }
  visit(0, size)
  return results
}

function canForceWin(
  state: SearchState,
  context: VictoryContext,
  budget: SearchBudget,
  memo: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  if (state.wolves <= 0) return false
  if (wolfObjectiveReached(state.opponents, context)) return true
  const key = searchKey(state)
  const cached = memo.get(key)
  if (cached !== undefined) return cached
  if (visiting.has(key)) return false
  budget.nodes += 1
  if (budget.nodes > MAX_BELIEF_NODES) {
    budget.exhausted = true
    return false
  }
  visiting.add(key)
  const result =
    state.window === 'day'
      ? forceFromDay(state, context, budget, memo, visiting)
      : forceFromNight(state, context, budget, memo, visiting)
  visiting.delete(key)
  memo.set(key, result)
  return result
}

function forceFromDay(
  state: SearchState,
  context: VictoryContext,
  budget: SearchBudget,
  memo: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  const wolfVotes = state.wolves + (state.wolfSheriff ? 0.5 : 0)
  const opponentVotes =
    state.opponents.filter((opponent) => opponent.canVote).length +
    (state.opponentSheriff ? 0.5 : 0)
  if (wolfVotes < opponentVotes) return false
  if (wolfVotes === opponentVotes) {
    return preferredTargets(state.opponents).every((target) =>
      forceFromDayRunoff(state, target, context, budget, memo, visiting),
    )
  }
  const targetPool = preferredTargets(state.opponents)
  return targetPool.every((target) =>
    forceAfterDayExile(state, target, context, budget, memo, visiting),
  )
}

function forceFromDayRunoff(
  state: SearchState,
  target: OpponentState,
  context: VictoryContext,
  budget: SearchBudget,
  memo: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  const wolfVotes = Math.max(0, state.wolves - 1)
  const opponentVotes =
    state.opponents.filter((opponent) => opponent.canVote).length -
    (target.canVote ? 1 : 0) +
    (state.opponentSheriff ? 0.5 : 0)
  if (wolfVotes < opponentVotes) return false
  if (wolfVotes === opponentVotes) {
    return canForceWin({ ...state, window: 'night' }, context, budget, memo, visiting)
  }
  return forceAfterDayExile(state, target, context, budget, memo, visiting)
}

function forceAfterDayExile(
  state: SearchState,
  target: OpponentState,
  context: VictoryContext,
  budget: SearchBudget,
  memo: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  const opponents = [...state.opponents]
  const index = opponents.findIndex((candidate) => opponentKey(candidate) === opponentKey(target))
  if (index < 0) return false
  if (target.exilePrevention) {
    opponents[index] = { ...target, canVote: false, exilePrevention: false }
    return canForceWin(
      { ...state, opponents: opponents.sort(compareOpponents), window: 'night' },
      context,
      budget,
      memo,
      visiting,
    )
  }
  opponents.splice(index, 1)
  const wolves = state.wolves - (target.hunterShot ? state.hunterShotWolfLoss : 0)
  return canForceWin(
    {
      ...state,
      wolves,
      opponents: opponents.sort(compareOpponents),
      opponentSheriff: state.opponentSheriff && opponents.length > 0,
      window: 'night',
    },
    context,
    budget,
    memo,
    visiting,
  )
}

function forceFromNight(
  state: SearchState,
  context: VictoryContext,
  budget: SearchBudget,
  memo: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  const witches = state.opponents.filter(
    (opponent) => opponent.witchPoison || opponent.witchAntidote,
  )
  const guards = state.opponents.filter(
    (opponent) => opponent.nightProtection && opponent.nightProtectionAvailable,
  )
  if (witches.length > 1 || guards.length > 1) return false
  const targetPool = nightTargets(state.opponents)
  return targetPool.every((target) => {
    const guard = guards[0]
    const guardCanProtectTarget = Boolean(
      guard &&
      (opponentKey(guard) !== opponentKey(target) || context.board.policies.guardCanSelfProtect),
    )
    const guardChoices = guardCanProtectTarget ? [false, true] : [false]
    const witch = witches[0]
    const witchChoices: Array<'pass' | 'poison' | 'antidote'> = ['pass']
    if (witch?.witchPoison) witchChoices.push('poison')
    const witchIsTarget = Boolean(witch && opponentKey(witch) === opponentKey(target))
    const witchCanSelfSave =
      context.board.policies.witchSelfSave === 'always' ||
      (context.board.policies.witchSelfSave === 'first-night' && context.state.day === 0)
    if (witch?.witchAntidote && (!witchIsTarget || witchCanSelfSave)) {
      witchChoices.push('antidote')
    }
    return guardChoices.every((guardProtects) =>
      witchChoices.every((witchChoice) => {
        const originalTargetIndex = state.opponents.findIndex(
          (candidate) => opponentKey(candidate) === opponentKey(target),
        )
        if (originalTargetIndex < 0) return false
        const opponents = state.opponents.map((opponent) =>
          witch && opponentKey(opponent) === opponentKey(witch)
            ? {
                ...opponent,
                witchPoison: witchChoice === 'poison' ? false : opponent.witchPoison,
                witchAntidote: witchChoice === 'antidote' ? false : opponent.witchAntidote,
              }
            : opponent,
        )
        const antidoteProtects = witchChoice === 'antidote'
        const collisionKills =
          guardProtects &&
          antidoteProtects &&
          context.board.policies.guardAntidoteCollision === 'death'
        const targetDies = collisionKills || (!guardProtects && !antidoteProtects)
        let removed: OpponentState | undefined
        if (targetDies) {
          removed = opponents.splice(originalTargetIndex, 1)[0]
        } else if (guardProtects && state.opponents.length === 1) {
          const surviving = opponents[originalTargetIndex]
          if (surviving?.nightProtection && surviving.nightProtection !== 'repeatable') {
            opponents[originalTargetIndex] = {
              ...surviving,
              nightProtectionAvailable: false,
            }
          }
        }
        if (wolfObjectiveReached(opponents, context)) return true
        let wolves = state.wolves - (witchChoice === 'poison' ? 1 : 0)
        if (removed?.hunterShot) wolves -= state.hunterShotWolfLoss
        return canForceWin(
          {
            ...state,
            wolves,
            opponents: opponents.sort(compareOpponents),
            opponentSheriff: state.opponentSheriff && opponents.length > 0,
            window: 'day',
          },
          context,
          budget,
          memo,
          visiting,
        )
      }),
    )
  })
}

function nightTargets(opponents: readonly OpponentState[]): OpponentState[] {
  const unique = new Map(opponents.map((opponent) => [opponentKey(opponent), opponent]))
  return [...unique.values()]
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

function preferredTargets(opponents: readonly OpponentState[]): OpponentState[] {
  const voters = opponents.filter((opponent) => opponent.canVote)
  const source = voters.length > 0 ? voters : opponents
  const unique = new Map(source.map((opponent) => [opponentKey(opponent), opponent]))
  return [...unique.values()]
}

function terminalCandidate(
  context: VictoryContext,
  group: ReadonlySet<PlayerId>,
  evaluateFormal: FormalVictoryEvaluator,
): VictoryCandidate | null {
  const players = new Map(
    [...context.state.players].map(([playerId, player]) => [
      playerId,
      group.has(playerId) ? player : { ...player, alive: false, canVote: false },
    ]),
  )
  return evaluateFormal({ ...context, state: { ...context.state, players } })
}

function materialWindow(state: GameState, events: VictoryContext['events']): MaterialWindow | null {
  let phaseId = state.phaseId
  if (!phaseId) return null
  if (phaseId === 'phase-match-ended') {
    const previousPhase = [...events]
      .reverse()
      .find(
        (event) =>
          event.payload.type === 'phase.changed' && event.payload.phaseId !== 'phase-match-ended',
      )
    if (!previousPhase || previousPhase.payload.type !== 'phase.changed') return null
    phaseId = previousPhase.payload.phaseId
  }
  if (state.interruptToNight || phaseId === 'phase-day-resolve') return 'night'
  if (phaseId === 'phase-night-resolve' || phaseId === 'phase-day-announcement') return 'day'
  if (phaseId === 'phase-last-words' || phaseId === 'phase-death-triggers') {
    const timings = [...state.recentDeaths.values()].map((death) => death.timing)
    if (timings.length === 0) return null
    return timings.every((timing) => timing === 'day') ? 'night' : 'day'
  }
  if (phaseId.startsWith('phase-night-')) return 'night'
  if (phaseId.startsWith('phase-day-')) return 'day'
  if (phaseId === 'phase-sheriff-transfer') {
    const timings = [...state.recentDeaths.values()].map((death) => death.timing)
    return timings.every((timing) => timing === 'day') ? 'night' : 'day'
  }
  return null
}

function awaitingInitialSheriff(state: GameState, enabled: boolean): boolean {
  return enabled && state.day <= 1 && !state.sheriff.holderId && !state.sheriff.badgeLost
}

function searchKey(state: SearchState): string {
  return [
    state.window,
    state.wolves,
    state.wolfSheriff ? 1 : 0,
    state.opponentSheriff ? 1 : 0,
    state.hunterShotWolfLoss,
    [...state.opponents].sort(compareOpponents).map(opponentKey).join(','),
  ].join(':')
}

function opponentKey(opponent: OpponentState): string {
  return [
    opponent.roleId,
    opponent.canVote ? 1 : 0,
    opponent.hunterShot ? 1 : 0,
    opponent.witchPoison ? 1 : 0,
    opponent.witchAntidote ? 1 : 0,
    opponent.nightProtection ?? 'none',
    opponent.nightProtectionAvailable ? 1 : 0,
    opponent.exilePrevention ? 1 : 0,
  ].join('/')
}

function compareOpponents(left: OpponentState, right: OpponentState): number {
  return opponentKey(left).localeCompare(opponentKey(right))
}

function removeOne(values: RoleId[], value: RoleId): boolean {
  const index = values.indexOf(value)
  if (index < 0) return false
  values.splice(index, 1)
  return true
}
