import type { PlayerId, RoleId } from '@agentwolf/contracts'
import type { EndgameRegistry, WerewolfProofPreparation } from '../../plugins/endgame-registry.js'
import type { VictoryCandidate, VictoryContext } from '../../plugins/victory-registry.js'
import type { GameState } from '../../types.js'
import { visibleRoleId } from '../../visibility.js'
import {
  MAX_WEREWOLF_BELIEF_NODES,
  canForceWin,
  compareOpponents,
  opponentKey,
  type MaterialWindow,
  type OpponentState,
  type SearchWorld,
} from './werewolf-forced-win-search.js'

type FormalVictoryEvaluator = (context: VictoryContext) => VictoryCandidate | null

export function evaluateWerewolfForcedWin(
  context: VictoryContext,
  registry: EndgameRegistry,
  evaluateFormal: FormalVictoryEvaluator,
): VictoryCandidate | null {
  if (context.state.status !== 'running' || context.state.pendingDeaths.size > 0) return null
  if (awaitingInitialSheriff(context.state, context.board.sheriff)) return null
  const window = materialWindow(context.state, context.events)
  if (!window) return null

  const groups = werewolfControlGroups(context, registry)
  for (const group of groups) {
    const preparation = prepareProof(context, registry, group)
    if (!preparation) continue
    const variants = opponentWorlds(context, registry, group, preparation)
    if (!variants || variants.length === 0) continue
    const sheriffId = context.state.sheriff.holderId
    const wolfSheriff = Boolean(sheriffId && group.has(sheriffId))
    const opponentSheriffId =
      sheriffId && !group.has(sheriffId) && context.state.players.get(sheriffId)?.alive
        ? sheriffId
        : null
    const wolves = [...group].filter(
      (playerId) => context.state.players.get(playerId)?.alive,
    ).length
    const belief = variants.map(
      (opponents): SearchWorld => ({
        wolves,
        opponents,
        wolfSheriff,
        opponentSheriffId,
        hunterShotWolfLoss: preparation.hunterShotWolfLoss,
        window,
        publiclyRevealedRoles: [],
      }),
    )
    if (!canForceWin(belief, context)) continue
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
  const factionRoster = [...context.events]
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
    if (model.canControlWerewolfProof && !model.canControlWerewolfProof(context, player.id)) {
      continue
    }
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

function opponentWorlds(
  context: VictoryContext,
  registry: EndgameRegistry,
  group: ReadonlySet<PlayerId>,
  preparation: WerewolfProofPreparation,
): OpponentState[][] | null {
  const knownRoles = rolesVisibleToGroup(context, registry, group)
  if (!knownRoles) return null
  const pool = [...preparation.activeRoleIds]
  const groupRoleId = context.state.players.get([...group][0]!)?.roleId
  const groupControl = groupRoleId ? registry.model(groupRoleId)?.wolfControl : null
  const knownLiving: OpponentState[] = []
  const unknownLiving: Array<{ readonly playerId: PlayerId; readonly canVote: boolean }> = []
  const players = [...context.state.players.values()].sort((left, right) => left.seat - right.seat)

  for (const player of players) {
    const knownRoleId = knownRoles.get(player.id) ?? null
    if (knownRoleId && !removeOne(pool, knownRoleId)) return null
    if (!player.alive || group.has(player.id)) continue
    if (!knownRoleId) {
      if (!player.canVote) return null
      unknownLiving.push({ playerId: player.id, canVote: player.canVote })
      continue
    }
    const model = registry.model(knownRoleId)
    if (model && model.wolfControl !== 'none') return null
    knownLiving.push(opponentFor(player.id, knownRoleId, player.canVote, registry))
  }
  for (const playerId of group) {
    const roleId = context.state.players.get(playerId)?.roleId
    if (!roleId || knownRoles.get(playerId) !== roleId) return null
  }

  const assignments = chooseRoleAssignments(
    pool,
    unknownLiving.map(({ playerId }) => playerId),
  )
  if (!assignments) return null
  const variants = new Map<string, OpponentState[]>()
  for (const assignment of assignments) {
    const unknown: OpponentState[] = []
    let valid = true
    for (const { playerId, canVote } of unknownLiving) {
      const roleId = assignment.get(playerId)
      if (!roleId) return null
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
      unknown.push(opponentFor(playerId, roleId, canVote, registry))
    }
    if (!valid) continue
    const opponents = [...knownLiving, ...unknown].sort(compareOpponents)
    variants.set(opponents.map(opponentKey).join('|'), opponents)
    if (variants.size > MAX_WEREWOLF_BELIEF_NODES) return null
  }
  return [...variants.values()]
}

function rolesVisibleToGroup(
  context: VictoryContext,
  registry: EndgameRegistry,
  group: ReadonlySet<PlayerId>,
): ReadonlyMap<PlayerId, RoleId> | null {
  const known = new Map<PlayerId, RoleId>()
  for (const player of context.state.players.values()) {
    const roleId = roleVisibleToGroup(player.id, group, context)
    if (roleId) known.set(player.id, roleId)
  }
  const observations = registry.observeWerewolfKnowledge(context, group)
  if (!observations) return null
  for (const observation of observations) {
    if (!context.state.players.has(observation.targetId)) return null
    const current = known.get(observation.targetId)
    if (current && current !== observation.roleId) return null
    known.set(observation.targetId, observation.roleId)
  }
  return known
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
  playerId: PlayerId,
  roleId: RoleId,
  canVote: boolean,
  registry: EndgameRegistry,
): OpponentState {
  const traits = registry.model(roleId)?.traits ?? {}
  return {
    playerId,
    roleId,
    canVote,
    hunterShot: traits.hunterShot ?? false,
    witchPoison: traits.witchPotions ?? false,
    witchAntidote: traits.witchPotions ?? false,
    nightProtection: traits.nightProtection ?? null,
    nightProtectionAvailable: Boolean(traits.nightProtection),
    blockedProtectionTargetId: null,
    exilePrevention: traits.exilePrevention ?? false,
  }
}

function chooseRoleAssignments(
  roleIds: readonly RoleId[],
  playerIds: readonly PlayerId[],
): Array<ReadonlyMap<PlayerId, RoleId>> | null {
  if (playerIds.length > roleIds.length) return []
  const counts = new Map<RoleId, number>()
  for (const roleId of roleIds) counts.set(roleId, (counts.get(roleId) ?? 0) + 1)
  const roles = [...counts.keys()].sort((left, right) => left.localeCompare(right))
  const assignment = new Map<PlayerId, RoleId>()
  const results: Array<ReadonlyMap<PlayerId, RoleId>> = []
  const visit = (index: number): boolean => {
    if (index === playerIds.length) {
      results.push(new Map(assignment))
      return results.length <= MAX_WEREWOLF_BELIEF_NODES
    }
    const playerId = playerIds[index]
    if (!playerId) return true
    for (const roleId of roles) {
      const count = counts.get(roleId) ?? 0
      if (count === 0) continue
      counts.set(roleId, count - 1)
      assignment.set(playerId, roleId)
      if (!visit(index + 1)) return false
      assignment.delete(playerId)
      counts.set(roleId, count)
    }
    return true
  }
  return visit(0) ? results : null
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

function removeOne(values: RoleId[], value: RoleId): boolean {
  const index = values.indexOf(value)
  if (index < 0) return false
  values.splice(index, 1)
  return true
}
