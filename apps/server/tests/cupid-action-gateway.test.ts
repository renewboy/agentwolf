import {
  AgentProfileIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  type PlayerId,
} from '@agentwolf/contracts'
import {
  GameEngine,
  cupidAbilityIds,
  cupidBoard,
  cupidState,
  v1AbilityIds,
  type BoardManifest,
} from '@agentwolf/game-engine'
import { describe, expect, it } from 'vitest'
import { ActionMailbox } from '../src/action-mailbox.js'

describe('Cupid action gateway', () => {
  it('returns a semantic error for a lover ballot and accepts a correction in the same turn', () => {
    const board: BoardManifest = { ...cupidBoard, sheriff: false }
    const roleIds = board.roles.flatMap(({ roleId, count }) =>
      Array.from({ length: count }, () => roleId),
    )
    const engine = GameEngine.create({
      matchId: MatchIdSchema.parse('match-cupid-action-gateway'),
      board,
      roleAssignment: 'manual',
      seed: 1,
      players: roleIds.map((roleId, index) => ({
        id: PlayerIdSchema.parse(`player-${index + 1}`),
        seat: index + 1,
        name: `Gateway player ${index + 1}`,
        profileId: AgentProfileIdSchema.parse(`profile-gateway-${index + 1}`),
        roleId,
      })),
    })
    engine.start()
    const cupidId = playerWithRole(engine, 'role-cupid')
    const wolfId = playerWithRole(engine, 'role-werewolf')
    const villagerId = playerWithRole(engine, 'role-villager')
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: cupidId,
      abilityId: cupidAbilityIds.link,
      targetIds: [wolfId, villagerId],
    })
    advanceToDayVote(engine)
    expect(cupidState(engine.state).loverIds).toEqual([wolfId, villagerId])

    const mailbox = new ActionMailbox()
    const token = mailbox.issueToken(engine.state.matchId, wolfId)
    mailbox.expect({
      matchId: engine.state.matchId,
      playerId: wolfId,
      actionType: 'vote',
      voteKind: 'exile',
      validate: (action) => engine.validateAction(action),
    })
    expect(() => mailbox.submitVote(token, villagerId)).toThrow(/Lovers cannot vote/)
    const otherId = [...engine.state.players.values()].find(
      (player) => player.alive && player.id !== wolfId && player.id !== villagerId,
    )!.id
    expect(mailbox.submitVote(token, otherId)).toMatchObject({ accepted: true })
    expect(mailbox.take(engine.state.matchId, wolfId)).toMatchObject({
      type: 'vote',
      actorId: wolfId,
      targetId: otherId,
      kind: 'exile',
    })
  })
})

function advanceToDayVote(engine: GameEngine): void {
  while (engine.state.phaseId === 'phase-night-wolf-council') {
    const actorId = engine.activeActor()
    if (!actorId) throw new Error('Missing wolf speaker')
    engine.submit({
      type: 'speech',
      matchId: engine.state.matchId,
      actorId,
      kind: 'wolf-council',
      text: '本夜选择空刀。',
    })
  }
  for (const actorId of [...engine.expectedActors()]) {
    engine.submit({
      type: 'vote',
      matchId: engine.state.matchId,
      actorId,
      targetId: null,
      kind: 'wolf-kill',
    })
  }
  if (engine.state.phaseId === 'phase-night-witch') {
    for (const actorId of [...engine.expectedActors()]) {
      engine.submit({
        type: 'night-action',
        matchId: engine.state.matchId,
        actorId,
        abilityId: v1AbilityIds.witchAntidote,
        targetIds: [],
        option: 'pass',
      })
    }
  }
  if (engine.state.phaseId === 'phase-night-seer') {
    for (const actorId of [...engine.expectedActors()]) {
      engine.submit({
        type: 'night-action',
        matchId: engine.state.matchId,
        actorId,
        abilityId: v1AbilityIds.seerInspect,
        targetIds: [],
        option: 'pass',
      })
    }
  }
  while (engine.state.phaseId === 'phase-day-speech') {
    const actorId = engine.activeActor()
    if (!actorId) throw new Error('Missing day speaker')
    engine.submit({
      type: 'speech',
      matchId: engine.state.matchId,
      actorId,
      kind: 'day',
      text: '继续发言。',
    })
  }
  if (engine.state.phaseId !== 'phase-day-vote') {
    throw new Error(`Expected day vote, received ${engine.state.phaseId}`)
  }
}

function playerWithRole(engine: GameEngine, roleId: string): PlayerId {
  return [...engine.state.players.values()].find((player) => player.roleId === roleId)!.id
}
