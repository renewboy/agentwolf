import {
  AbilityIdSchema,
  PhaseIdSchema,
  RoleIdSchema,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import { assertRule } from './errors.js'
import { effectsForActions, v1AbilityIds } from './resolution.js'
import { appendFinalRoleReveals } from './role-reveal.js'
import { RuleRegistry, visibility, type RuleRuntime } from './rule-registry.js'
import { resolveDaySpeechOrder, sheriffCampaignOrder } from './speech-order.js'
import { IdiotRole } from './roles/idiot.js'
import { evaluateVictory } from './victory.js'
import { emitVoteResolution } from './vote-resolution.js'

const hunterRoleId = RoleIdSchema.parse('role-hunter')
const idiotRoleId = RoleIdSchema.parse('role-idiot')
const witchRoleId = RoleIdSchema.parse('role-witch')
const sheriffTransferAbilityId = AbilityIdSchema.parse('ability-sheriff-transfer')

function phase(id: string): ReturnType<typeof PhaseIdSchema.parse> {
  return PhaseIdSchema.parse(id)
}

function bySeat(runtime: RuleRuntime, ids: Iterable<PlayerId>): PlayerId[] {
  return [...ids].sort((left, right) => {
    const leftSeat = runtime.state.players.get(left)?.seat ?? Number.MAX_SAFE_INTEGER
    const rightSeat = runtime.state.players.get(right)?.seat ?? Number.MAX_SAFE_INTEGER
    return leftSeat - rightSeat
  })
}

function appendFinalDeath(
  runtime: RuleRuntime,
  playerId: PlayerId,
  causes: readonly string[],
): void {
  const player = runtime.state.players.get(playerId)
  assertRule(player, `Unknown death target ${playerId}`)
  runtime.append(
    { type: 'player.died', playerId, causes: [...causes], announced: false },
    visibility.god,
  )
  runtime.append(
    {
      type: 'public.announcement',
      code: 'player-eliminated',
      playerIds: [playerId],
      params: {},
    },
    visibility.public,
  )
}

function nightActions(runtime: RuleRuntime): PlayerAction[] {
  const nightStart = [...runtime.events]
    .reverse()
    .find((event) => event.payload.type === 'night.started')
  const fromSequence = nightStart?.sequence ?? 0
  return runtime.events
    .filter((event) => event.sequence > fromSequence && event.payload.type === 'action.submitted')
    .map((event) => {
      assertRule(event.payload.type === 'action.submitted', 'Expected submitted action event')
      return event.payload.action
    })
}

function resolveNight(runtime: RuleRuntime): void {
  const submittedNightActions = nightActions(runtime)
  const actions = submittedNightActions.filter(
    (action) =>
      (action.type === 'night-action' || action.type === 'skill-trigger') &&
      action.option !== 'pass',
  )
  const { agenda, consumedAbilityIds } = effectsForActions(
    runtime.state,
    runtime.board,
    runtime.roles,
    actions,
  )
  if (runtime.state.nightAttackTargetId) {
    const source = [...runtime.state.players.values()].find(
      (player) => player.alive && player.faction === 'werewolf',
    )
    agenda.add({
      kind: 'damage',
      priority: 400,
      sourceId: source?.id ?? null,
      targetId: runtime.state.nightAttackTargetId,
      cause: 'werewolf',
    })
  }
  const result = agenda.settle(runtime.state, runtime.board, runtime.roles)

  for (const action of submittedNightActions) {
    if (action.type !== 'night-action') continue
    if (action.abilityId === v1AbilityIds.guardProtect) {
      runtime.append(
        {
          type: 'guard.protected',
          actorId: action.actorId,
          targetId: action.targetIds[0] ?? null,
        },
        visibility.players([action.actorId]),
      )
    } else if (
      action.option !== 'pass' &&
      (action.abilityId === v1AbilityIds.witchAntidote ||
        action.abilityId === v1AbilityIds.witchPoison)
    ) {
      const targetId = action.targetIds[0]
      assertRule(targetId, 'Potion action is missing its target')
      runtime.append(
        {
          type: 'witch.potion-used',
          actorId: action.actorId,
          potion: action.abilityId === v1AbilityIds.witchAntidote ? 'antidote' : 'poison',
          targetId,
        },
        visibility.players([action.actorId]),
      )
    }
  }
  for (const consumed of consumedAbilityIds) {
    const player = runtime.state.players.get(consumed.playerId)
    const count = (player?.roleState.abilityUses[consumed.abilityId] ?? 0) + 1
    runtime.append(
      { type: 'ability.used', playerId: consumed.playerId, abilityId: consumed.abilityId, count },
      visibility.players([consumed.playerId]),
    )
  }
  for (const inspection of result.inspections) {
    runtime.append(
      {
        type: 'seer.inspected',
        actorId: inspection.sourceId,
        targetId: inspection.targetId,
        result: inspection.result,
      },
      visibility.players([inspection.sourceId]),
    )
  }
  for (const playerId of result.savedPlayerIds) {
    runtime.append({ type: 'player.saved', playerId, reason: 'night-protection' }, visibility.god)
  }
  for (const death of result.pendingDeaths) {
    runtime.append(
      { type: 'death.pending', playerId: death.playerId, causes: [...death.causes] },
      visibility.god,
    )
  }
  runtime.append({ type: 'day.started', day: runtime.state.day + 1 }, visibility.public)
}

function finalizeNightDeaths(runtime: RuleRuntime): void {
  const deaths = bySeat(runtime, runtime.state.pendingDeaths.keys())
  if (deaths.length === 0) {
    runtime.append(
      { type: 'public.announcement', code: 'peaceful-night', playerIds: [], params: {} },
      visibility.public,
    )
    return
  }
  for (const playerId of deaths) {
    const death = runtime.state.pendingDeaths.get(playerId)
    assertRule(death, `Missing pending death for ${playerId}`)
    const player = runtime.state.players.get(playerId)
    assertRule(player, `Unknown pending death player ${playerId}`)
    runtime.append(
      { type: 'player.died', playerId, causes: [...death.causes], announced: true },
      visibility.god,
    )
  }
  runtime.append(
    {
      type: 'public.announcement',
      code: 'night-deaths',
      playerIds: deaths,
      params: {},
    },
    visibility.public,
  )
}

function resolveDeathTriggers(runtime: RuleRuntime): void {
  const actions = runtime.state.phaseActions.filter(
    (action): action is Extract<PlayerAction, { type: 'skill-trigger' }> =>
      action.type === 'skill-trigger',
  )
  for (const action of actions) {
    const player = runtime.state.players.get(action.actorId)
    assertRule(player, `Unknown trigger actor ${action.actorId}`)
    if (action.abilityId === v1AbilityIds.hunterShot) {
      const count = (player.roleState.abilityUses[action.abilityId] ?? 0) + 1
      runtime.append(
        { type: 'ability.used', playerId: player.id, abilityId: action.abilityId, count },
        visibility.players([player.id]),
      )
      if (action.option === 'pass' || !action.targetId) continue
      const { agenda } = effectsForActions(runtime.state, runtime.board, runtime.roles, [action])
      const result = agenda.settle(runtime.state, runtime.board, runtime.roles)
      runtime.append(
        { type: 'hunter.shot', playerId: player.id, targetId: action.targetId },
        visibility.public,
      )
      for (const death of result.pendingDeaths) {
        appendFinalDeath(runtime, death.playerId, death.causes)
      }
    }
  }
}

function resolveSheriff(runtime: RuleRuntime): void {
  const standing = [...runtime.state.sheriff.standingCandidates]
  if (standing.length === 1) {
    runtime.append({ type: 'sheriff.elected', playerId: standing[0]! }, visibility.public)
    return
  }
  const sheriffVote = runtime.state.lastVote
  if (
    sheriffVote?.selectedPlayerId &&
    (sheriffVote.kind === 'sheriff' || sheriffVote.kind === 'sheriff-runoff')
  ) {
    runtime.append(
      { type: 'sheriff.elected', playerId: sheriffVote.selectedPlayerId },
      visibility.public,
    )
    return
  }
  runtime.append({ type: 'sheriff.badge-lost', reason: 'no-unique-winner' }, visibility.public)
}

function resolveExile(runtime: RuleRuntime): void {
  runtime.append({ type: 'day.completed' }, visibility.god)
  const targetId = runtime.state.lastVote?.selectedPlayerId
  if (!targetId) {
    runtime.append(
      { type: 'public.announcement', code: 'no-exile', playerIds: [], params: {} },
      visibility.public,
    )
    return
  }
  const target = runtime.state.players.get(targetId)
  assertRule(target?.roleId, `Unknown exile target ${targetId}`)
  if (target.roleId === idiotRoleId) {
    const idiot = runtime.roles.role(idiotRoleId)
    assertRule(idiot instanceof IdiotRole, 'Idiot role plugin is invalid')
    const revealed = target.roleState.memory['idiot.revealed'] === true
    if (idiot.canPreventExile(revealed)) {
      runtime.append({ type: 'idiot.revealed', playerId: targetId }, visibility.public)
      runtime.append(
        {
          type: 'public.announcement',
          code: 'idiot-survived',
          playerIds: [targetId],
          params: {},
        },
        visibility.public,
      )
      return
    }
  }
  appendFinalDeath(runtime, targetId, ['exile'])
}

export function registerClassicRules(registry: RuleRegistry): void {
  registry.registerActorSelector('publicly-alive', (runtime) =>
    bySeat(
      runtime,
      [...runtime.state.players.values()]
        .filter((player) => player.alive)
        .map((player) => player.id),
    ),
  )
  registry.registerActorSelector('standing-sheriff-candidates', (runtime) =>
    sheriffCampaignOrder(
      runtime.state.matchId,
      runtime.state.day,
      [...runtime.state.sheriff.standingCandidates],
      runtime.state.players,
    ),
  )
  registry.registerActorSelector('original-sheriff-noncandidates', (runtime) =>
    bySeat(
      runtime,
      [...runtime.state.players.values()]
        .filter((player) => player.alive && !runtime.state.sheriff.initialCandidates.has(player.id))
        .map((player) => player.id),
    ),
  )
  registry.registerActorSelector('sheriff-tied-candidates', (runtime) =>
    bySeat(runtime, runtime.state.lastVote?.tiedPlayerIds ?? []),
  )
  registry.registerActorSelector('pending-death-trigger-owners', (runtime) =>
    bySeat(
      runtime,
      [...runtime.state.recentDeaths.values()]
        .filter((death) => {
          const player = runtime.state.players.get(death.playerId)
          const hasShot = (player?.roleState.abilityUses[v1AbilityIds.hunterShot] ?? 0) > 0
          return (
            player?.roleId === hunterRoleId &&
            !hasShot &&
            death.causes.some((cause) => cause === 'werewolf' || cause === 'exile')
          )
        })
        .map((death) => death.playerId),
    ),
  )
  registry.registerActorSelector('last-words-eligible', (runtime) =>
    bySeat(
      runtime,
      [...runtime.state.recentDeaths.values()]
        .filter((death) => {
          const nightDeath = death.causes.some(
            (cause) => cause === 'werewolf' || cause === 'poison',
          )
          if (!nightDeath) return true
          if (runtime.board.policies.nightLastWords === 'every-night') return true
          return (
            runtime.board.policies.nightLastWords === 'first-night-only' && runtime.state.day === 1
          )
        })
        .map((death) => death.playerId),
    ),
  )
  registry.registerActorSelector('sheriff-or-system', (runtime) => {
    const sheriffId = runtime.state.sheriff.holderId
    if (!sheriffId || !runtime.state.players.get(sheriffId)?.alive) return []
    return [sheriffId]
  })
  registry.registerActorSelector('day-speech-order', (runtime) => runtime.state.speechOrder)
  registry.registerActorSelector('eligible-voters', (runtime) =>
    bySeat(
      runtime,
      [...runtime.state.players.values()]
        .filter((player) => player.alive && player.canVote)
        .map((player) => player.id),
    ),
  )
  registry.registerActorSelector('exile-tied-players', (runtime) =>
    bySeat(runtime, runtime.state.lastVote?.tiedPlayerIds ?? []),
  )
  registry.registerActorSelector('eligible-runoff-voters', (runtime) => {
    const tied = new Set(runtime.state.lastVote?.tiedPlayerIds ?? [])
    return bySeat(
      runtime,
      [...runtime.state.players.values()]
        .filter((player) => player.alive && player.canVote && !tied.has(player.id))
        .map((player) => player.id),
    )
  })
  registry.registerActorSelector('dead-sheriff', (runtime) => {
    const sheriffId = runtime.state.sheriff.holderId
    return sheriffId && !runtime.state.players.get(sheriffId)?.alive ? [sheriffId] : []
  })

  registry.registerPredicate('first-day-with-sheriff', (runtime) =>
    Boolean(runtime.board.sheriff && runtime.state.day === 1 && !runtime.state.sheriff.badgeLost),
  )
  registry.registerPredicate(
    'multiple-standing-candidates',
    (runtime) => runtime.state.sheriff.standingCandidates.size > 1,
  )
  registry.registerPredicate(
    'sheriff-vote-tied',
    (runtime) => (runtime.state.lastVote?.tiedPlayerIds.length ?? 0) > 1,
  )
  registry.registerPredicate(
    'exile-vote-tied',
    (runtime) => (runtime.state.lastVote?.tiedPlayerIds.length ?? 0) > 1,
  )
  registry.registerPredicate(
    'has-death-trigger',
    (runtime) => registry.selectActors('pending-death-trigger-owners', runtime).length > 0,
  )
  registry.registerPredicate(
    'has-last-words',
    (runtime) => registry.selectActors('last-words-eligible', runtime).length > 0,
  )
  registry.registerPredicate('dead-sheriff-holds-badge', (runtime) => {
    const sheriffId = runtime.state.sheriff.holderId
    return Boolean(sheriffId && !runtime.state.players.get(sheriffId)?.alive)
  })
  registry.registerPredicate('has-winner', (runtime) =>
    Boolean(evaluateVictory(runtime.state, runtime.board)),
  )
  registry.registerPredicate('interrupted-to-night', (runtime) => runtime.state.interruptToNight)

  registry.registerPhaseHandler(phase('phase-night-wolf-vote'), (runtime) => {
    const targetId = emitVoteResolution(
      runtime,
      'wolf-kill',
      false,
      visibility.faction('werewolf'),
      `${runtime.state.matchId}:night:${runtime.state.night}:wolf-kill`,
    )
    const recipients = [...runtime.state.players.values()]
      .filter(
        (player) =>
          player.alive &&
          (player.faction === 'werewolf' ||
            (player.roleId === witchRoleId &&
              (player.roleState.abilityUses[v1AbilityIds.witchAntidote] ?? 0) === 0)),
      )
      .map((player) => player.id)
    runtime.append({ type: 'night.attack-selected', targetId }, visibility.players(recipients))
  })
  registry.registerPhaseHandler(phase('phase-night-resolve'), resolveNight)
  registry.registerPhaseHandler(phase('phase-sheriff-vote'), (runtime) =>
    emitVoteResolution(runtime, 'sheriff', false),
  )
  registry.registerPhaseHandler(phase('phase-sheriff-runoff-vote'), (runtime) =>
    emitVoteResolution(runtime, 'sheriff-runoff', false),
  )
  registry.registerPhaseHandler(phase('phase-sheriff-resolve'), resolveSheriff)
  registry.registerPhaseHandler(phase('phase-day-announcement'), finalizeNightDeaths)
  registry.registerPhaseHandler(phase('phase-death-triggers'), resolveDeathTriggers)
  registry.registerPhaseHandler(phase('phase-day-speech-order'), resolveDaySpeechOrder)
  registry.registerPhaseHandler(phase('phase-day-vote'), (runtime) =>
    emitVoteResolution(runtime, 'exile', true),
  )
  registry.registerPhaseHandler(phase('phase-day-runoff-vote'), (runtime) =>
    emitVoteResolution(runtime, 'exile-runoff', true),
  )
  registry.registerPhaseHandler(phase('phase-day-resolve'), resolveExile)
  registry.registerPhaseHandler(phase('phase-match-ended'), (runtime) => {
    const victory = evaluateVictory(runtime.state, runtime.board)
    assertRule(victory, 'Match ended phase requires a winner')
    runtime.append(
      { type: 'match.ended', winner: victory.winner, reason: victory.reason },
      visibility.public,
    )
    appendFinalRoleReveals(runtime)
  })
}

export const systemAbilityIds = { sheriffTransferAbilityId } as const
