import {
  AgentProfileIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  type PlayerAction,
  type PlayerId,
} from '@agentwolf/contracts'
import {
  GameEngine,
  v1AbilityIds,
  type BoardManifest,
  type EnginePlayerInput,
} from '../src/index.js'

function createPlayers(board: BoardManifest): EnginePlayerInput[] {
  const roles = board.roles.flatMap(({ roleId, count }) =>
    Array.from({ length: count }, () => roleId),
  )
  return Array.from({ length: board.playerCount }, (_, index) => ({
    id: PlayerIdSchema.parse(`player-${index + 1}`),
    seat: index + 1,
    name: `测试玩家${index + 1}`,
    profileId: AgentProfileIdSchema.parse(`profile-seat-${index + 1}`),
    roleId: roles[index],
  }))
}

export function createManualEngine(board: BoardManifest): GameEngine {
  let tick = 0
  return GameEngine.create({
    matchId: MatchIdSchema.parse('match-test-001'),
    board,
    players: createPlayers(board),
    roleAssignment: 'manual',
    seed: 17,
    clock: () => new Date(Date.UTC(2026, 7, 22, 0, 0, tick++)),
  })
}

export function actorsWithRole(engine: GameEngine, roleId: string): PlayerId[] {
  return [...engine.state.players.values()]
    .filter((player) => player.roleId === roleId)
    .map((player) => player.id)
}

export function submitExpected(
  engine: GameEngine,
  build: (actorId: PlayerId) => PlayerAction,
): void {
  for (const actorId of [...engine.expectedActors()]) engine.submit(build(actorId))
}

function playWolfCouncil(engine: GameEngine): void {
  while (engine.state.phaseId === 'phase-night-wolf-council') {
    const actorId = engine.activeActor()
    if (!actorId) throw new Error('Wolf council is missing an actor')
    engine.submit({
      type: 'speech',
      matchId: engine.state.matchId,
      actorId,
      kind: 'wolf-council',
      text: '今晚按计划行动。',
    })
  }
}

export function playNight(
  engine: GameEngine,
  options: { wolfTargetId: PlayerId | null; seerTargetId?: PlayerId | null },
): void {
  if (engine.state.phaseId === 'phase-night-guard') {
    submitExpected(engine, (actorId) => ({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId,
      abilityId: v1AbilityIds.guardProtect,
      targetIds: [],
      option: 'pass',
    }))
  }
  playWolfCouncil(engine)
  if (engine.state.phaseId !== 'phase-night-wolf-vote') {
    throw new Error(`Expected wolf vote, got ${engine.state.phaseId}`)
  }
  submitExpected(engine, (actorId) => ({
    type: 'vote',
    matchId: engine.state.matchId,
    actorId,
    targetId: options.wolfTargetId,
    kind: 'wolf-kill',
  }))
  if (engine.state.phaseId === 'phase-night-witch') {
    submitExpected(engine, (actorId) => ({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId,
      abilityId: v1AbilityIds.witchAntidote,
      targetIds: [],
      option: 'pass',
    }))
  }
  if (engine.state.phaseId === 'phase-night-seer') {
    submitExpected(engine, (actorId) => {
      const targetId = options.seerTargetId
      return targetId
        ? {
            type: 'night-action',
            matchId: engine.state.matchId,
            actorId,
            abilityId: v1AbilityIds.seerInspect,
            targetIds: [targetId],
          }
        : {
            type: 'night-action',
            matchId: engine.state.matchId,
            actorId,
            abilityId: v1AbilityIds.seerInspect,
            targetIds: [],
            option: 'pass',
          }
    })
  }
}
