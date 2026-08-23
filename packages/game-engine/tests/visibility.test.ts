import { describe, expect, it } from 'vitest'
import { canViewEvent, sixPlayerBoard, standardBoard, visibleRoleId } from '../src/index.js'
import { actorsWithRole, createManualEngine, playNight, submitExpected } from './helpers.js'

describe('event visibility', () => {
  it('keeps private role assignment out of closed-eye view', () => {
    const engine = createManualEngine(standardBoard)
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    const roleEvent = engine.events.find(
      (event) => event.payload.type === 'role.assigned' && event.payload.playerId === wolfId,
    )!

    expect(canViewEvent(roleEvent, { kind: 'god' }, engine.state)).toBe(true)
    expect(canViewEvent(roleEvent, { kind: 'closed-eye' }, engine.state)).toBe(false)
    expect(canViewEvent(roleEvent, { kind: 'player', playerId: wolfId }, engine.state)).toBe(true)
  })

  it('shows wolf teammates only to wolf player views', () => {
    const [firstWolf, secondWolf] = actorsWithRole(
      createManualEngine(standardBoard),
      'role-werewolf',
    )
    if (!firstWolf || !secondWolf) throw new Error('Expected two wolves')
    const engine = createManualEngine(standardBoard)
    const villagerId = actorsWithRole(engine, 'role-villager')[0]!

    expect(
      visibleRoleId(
        secondWolf,
        { kind: 'player', playerId: firstWolf },
        engine.state,
        engine.events,
      ),
    ).toBe('role-werewolf')
    expect(
      visibleRoleId(
        secondWolf,
        { kind: 'player', playerId: villagerId },
        engine.state,
        engine.events,
      ),
    ).toBeNull()
    expect(
      visibleRoleId(secondWolf, { kind: 'closed-eye' }, engine.state, engine.events),
    ).toBeNull()
  })

  it('shows the selected wolf target only to living wolves and the living Witch', () => {
    const engine = createManualEngine(standardBoard)
    const wolves = actorsWithRole(engine, 'role-werewolf')
    const witchId = actorsWithRole(engine, 'role-witch')[0]!
    const villagerId = actorsWithRole(engine, 'role-villager')[0]!
    engine.start()
    while (engine.state.phaseId === 'phase-night-wolf-council') {
      const actorId = engine.activeActor()
      if (!actorId) throw new Error('Expected wolf speaker')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId,
        kind: 'wolf-council',
        text: '确认合法目标。',
      })
    }
    submitExpected(engine, (actorId) => ({
      type: 'vote',
      matchId: engine.state.matchId,
      actorId,
      targetId: villagerId,
      kind: 'wolf-kill',
    }))
    const selected = engine.events.findLast(
      (event) => event.payload.type === 'night.attack-selected',
    )!

    expect(selected.visibility.kind).toBe('players')
    expect(canViewEvent(selected, { kind: 'player', playerId: witchId }, engine.state)).toBe(true)
    for (const wolfId of wolves) {
      expect(canViewEvent(selected, { kind: 'player', playerId: wolfId }, engine.state)).toBe(true)
    }
    const otherVillager = actorsWithRole(engine, 'role-villager')[1]!
    expect(canViewEvent(selected, { kind: 'player', playerId: otherVillager }, engine.state)).toBe(
      false,
    )
    expect(canViewEvent(selected, { kind: 'closed-eye' }, engine.state)).toBe(false)
  })

  it('keeps eliminated roles hidden while the match is running', () => {
    const engine = createManualEngine(sixPlayerBoard)
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    engine.start()
    playNight(engine, { wolfTargetId: targetId })

    expect(engine.state.players.get(targetId)?.alive).toBe(false)
    expect(
      engine.events.some(
        (event) => event.payload.type === 'role.revealed' && event.payload.playerId === targetId,
      ),
    ).toBe(false)
    expect(visibleRoleId(targetId, { kind: 'closed-eye' }, engine.state, engine.events)).toBeNull()
  })

  it('shows every role from terminal state even for an older log without final reveal events', () => {
    const engine = createManualEngine(sixPlayerBoard)
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const endedState = { ...engine.state, status: 'ended' as const }
    expect(visibleRoleId(targetId, { kind: 'closed-eye' }, endedState, engine.events)).toBe(
      'role-villager',
    )
  })
})
