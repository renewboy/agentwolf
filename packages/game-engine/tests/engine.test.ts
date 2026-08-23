import { describe, expect, it } from 'vitest'
import {
  GameEngine,
  guardBoard,
  sheriffCampaignOrder,
  sixPlayerBoard,
  standardBoard,
  v1AbilityIds,
  type BoardManifest,
} from '../src/index.js'
import { actorsWithRole, createManualEngine, playNight, submitExpected } from './helpers.js'

const noSheriffBoard: BoardManifest = {
  ...standardBoard,
  sheriff: false,
}

describe('GameEngine', () => {
  it('keeps a deferred speech at its action boundary until continuation is explicit', () => {
    const engine = createManualEngine(noSheriffBoard)
    engine.start()
    playNight(engine, { wolfTargetId: null })
    expect(engine.state.phaseId).toBe('phase-day-speech')
    const firstSpeaker = engine.activeActor()
    if (!firstSpeaker) throw new Error('Expected a day speaker')

    const committed = engine.submit(
      {
        type: 'speech',
        matchId: engine.state.matchId,
        actorId: firstSpeaker,
        kind: 'day',
        text: '提交后先停留在当前发言阶段。',
      },
      { deferContinuation: true },
    )

    const nextSpeaker = engine.activeActor()
    expect(nextSpeaker).not.toBe(firstSpeaker)
    expect(engine.state.phaseId).toBe('phase-day-speech')
    expect(committed.some((event) => event.payload.type === 'speech.committed')).toBe(true)
    expect(
      committed.some(
        (event) =>
          event.payload.type === 'speech.started' && event.payload.playerId === nextSpeaker,
      ),
    ).toBe(false)

    const continued = engine.continueAfterDeferredAction()
    expect(
      continued.some(
        (event) =>
          event.payload.type === 'speech.started' && event.payload.playerId === nextSpeaker,
      ),
    ).toBe(true)
  })

  it('holds the next phase after a final speech and resumes cleanly from that boundary', () => {
    const engine = createManualEngine(noSheriffBoard)
    engine.start()
    playNight(engine, { wolfTargetId: null })
    while (engine.expectedActors().length > 1) {
      const actorId = engine.activeActor()
      if (!actorId) throw new Error('Expected a day speaker')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId,
        kind: 'day',
        text: '同一轮继续生成发言。',
      })
    }
    const finalSpeaker = engine.activeActor()
    if (!finalSpeaker) throw new Error('Expected the final day speaker')
    engine.submit(
      {
        type: 'speech',
        matchId: engine.state.matchId,
        actorId: finalSpeaker,
        kind: 'day',
        text: '本轮最后一段发言。',
      },
      { deferContinuation: true },
    )

    expect(engine.state.phaseId).toBe('phase-day-speech')
    expect(engine.expectedActors()).toHaveLength(0)
    engine.pause('playback-boundary')
    const restored = GameEngine.restore({
      matchId: engine.state.matchId,
      board: noSheriffBoard,
      events: engine.events,
      status: 'paused',
      pausedReason: 'playback-boundary',
    })
    restored.resume()
    expect(restored.state.phaseId).toBe('phase-day-vote')
  })

  it('rejects a wolf-kill vote that targets a werewolf teammate', () => {
    const engine = createManualEngine(sixPlayerBoard)
    const [firstWolf, secondWolf] = actorsWithRole(engine, 'role-werewolf')
    if (!firstWolf || !secondWolf) throw new Error('Expected two werewolves')
    engine.start()
    while (engine.state.phaseId === 'phase-night-wolf-council') {
      const actorId = engine.activeActor()
      if (!actorId) throw new Error('Expected wolf speaker')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId,
        kind: 'wolf-council',
        text: '确认狼队成员后再选择目标。',
      })
    }
    const invalidAction = {
      type: 'vote' as const,
      matchId: engine.state.matchId,
      actorId: firstWolf,
      targetId: secondWolf,
      kind: 'wolf-kill' as const,
    }
    const beforeValidation = engine.snapshot()

    expect(() => engine.validateAction(invalidAction)).toThrow(
      'Werewolves cannot attack a werewolf',
    )
    expect(engine.snapshot()).toEqual(beforeValidation)
    expect(() => engine.submit(invalidAction)).toThrow('Werewolves cannot attack a werewolf')
  })

  it('accepts a Hunter pass as an intentional death-trigger action', () => {
    const engine = createManualEngine(sixPlayerBoard)
    const hunterId = actorsWithRole(engine, 'role-hunter')[0]!
    engine.start()
    playNight(engine, { wolfTargetId: hunterId })
    expect(engine.state.phaseId).toBe('phase-death-triggers')
    engine.submit({
      type: 'skill-trigger',
      matchId: engine.state.matchId,
      actorId: hunterId,
      abilityId: v1AbilityIds.hunterShot,
      targetId: null,
      option: 'pass',
    })

    expect(engine.events.some((event) => event.payload.type === 'hunter.shot')).toBe(false)
    expect(engine.state.phaseId).toBe('phase-last-words')
  })

  it('records a Guard pass as private ability state with no target', () => {
    const engine = createManualEngine(guardBoard)
    const guardId = actorsWithRole(engine, 'role-guard')[0]!
    engine.start()
    expect(engine.state.phaseId).toBe('phase-night-guard')
    engine.submit({
      type: 'night-action',
      matchId: engine.state.matchId,
      actorId: guardId,
      abilityId: v1AbilityIds.guardProtect,
      targetIds: [],
      option: 'pass',
    })
    playNight(engine, { wolfTargetId: null })

    const guardState = engine.events.findLast((event) => event.payload.type === 'guard.protected')
    expect(guardState?.payload).toMatchObject({
      type: 'guard.protected',
      actorId: guardId,
      targetId: null,
    })
    expect(engine.state.players.get(guardId)?.roleState.memory['guard.lastTarget']).toBeNull()
  })

  it('keeps first-night deaths publicly active through sheriff signup', () => {
    const engine = createManualEngine(standardBoard)
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const seerTargetId = actorsWithRole(engine, 'role-werewolf')[0]!
    engine.start()
    playNight(engine, { wolfTargetId: targetId, seerTargetId })

    expect(engine.state.phaseId).toBe('phase-sheriff-signup')
    expect(engine.state.pendingDeaths.has(targetId)).toBe(true)
    expect(engine.state.players.get(targetId)?.alive).toBe(true)
    expect(engine.expectedActors()).toContain(targetId)
    expect(
      engine.events.some(
        (event) =>
          event.payload.type === 'seer.inspected' &&
          event.payload.targetId === seerTargetId &&
          event.payload.result === 'werewolf',
      ),
    ).toBe(true)
  })

  it('elects the only candidate remaining after withdrawal', () => {
    const engine = createManualEngine(standardBoard)
    engine.start()
    playNight(engine, { wolfTargetId: null })
    const [first, second, ...others] = engine.expectedActors()
    if (!first || !second) throw new Error('Expected sheriff signup actors')
    engine.submit({
      type: 'sheriff-action',
      matchId: engine.state.matchId,
      actorId: first,
      action: 'join',
    })
    engine.submit({
      type: 'sheriff-action',
      matchId: engine.state.matchId,
      actorId: second,
      action: 'join',
    })
    for (const actorId of others) {
      engine.submit({
        type: 'sheriff-action',
        matchId: engine.state.matchId,
        actorId,
        action: 'decline',
      })
    }
    expect(engine.expectedActors()).toEqual(
      sheriffCampaignOrder(
        engine.state.matchId,
        engine.state.day,
        [first, second],
        engine.state.players,
      ),
    )
    while (engine.state.phaseId === 'phase-sheriff-speech') {
      const actorId = engine.activeActor()
      if (!actorId) throw new Error('Expected sheriff speaker')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId,
        kind: 'sheriff',
        text: '我会承担警长职责。',
      })
    }
    expect(engine.state.phaseId).toBe('phase-sheriff-withdraw')
    engine.submit({
      type: 'sheriff-action',
      matchId: engine.state.matchId,
      actorId: first,
      action: 'keep-running',
    })
    engine.submit({
      type: 'sheriff-action',
      matchId: engine.state.matchId,
      actorId: second,
      action: 'withdraw',
    })

    expect(engine.state.sheriff.holderId).toBe(first)
    expect(engine.state.phaseId).toBe('phase-day-speech-order')
    engine.submit({
      type: 'sheriff-action',
      matchId: engine.state.matchId,
      actorId: first,
      action: 'speech-clockwise',
    })
    expect(engine.state.phaseId).toBe('phase-day-speech')
    const speechOrder = engine.events.findLast((event) => event.payload.type === 'speech.order-set')
    expect(speechOrder?.payload).toMatchObject({
      type: 'speech.order-set',
      basis: 'sheriff',
      anchorPlayerId: first,
      direction: 'clockwise',
    })
    expect(engine.state.speechOrder.at(-1)).toBe(first)
  })

  it('persists a deterministic death-anchored order without a Sheriff', () => {
    const engine = createManualEngine(noSheriffBoard)
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    engine.start()
    playNight(engine, { wolfTargetId: targetId })
    while (engine.state.phaseId === 'phase-last-words') {
      const actorId = engine.activeActor()
      if (!actorId) throw new Error('Expected last-words speaker')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId,
        kind: 'last-words',
        text: '留下最后的公开信息。',
      })
    }

    expect(engine.state.phaseId).toBe('phase-day-speech')
    const orderEvent = engine.events.findLast((event) => event.payload.type === 'speech.order-set')
    expect(orderEvent?.payload).toMatchObject({
      type: 'speech.order-set',
      basis: 'night-death',
      anchorPlayerId: targetId,
    })
    expect(engine.activeActor()).toBe(engine.state.speechOrder[0])
    const restored = GameEngine.restore({
      matchId: engine.state.matchId,
      board: noSheriffBoard,
      events: engine.events,
      status: 'running',
      pausedReason: null,
    })
    expect(restored.state.speechOrder).toEqual(engine.state.speechOrder)
  })

  it('lets the Idiot survive exile and removes its vote', () => {
    const engine = createManualEngine(noSheriffBoard)
    const idiotId = actorsWithRole(engine, 'role-idiot')[0]!
    engine.start()
    playNight(engine, { wolfTargetId: null })
    expect(engine.state.phaseId).toBe('phase-day-speech')
    while (engine.state.phaseId === 'phase-day-speech') {
      const actorId = engine.activeActor()
      if (!actorId) throw new Error('Expected day speaker')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId,
        kind: 'day',
        text: '这一轮先听完整发言再投票。',
      })
    }
    expect(engine.state.phaseId).toBe('phase-day-vote')
    submitExpected(engine, (actorId) => ({
      type: 'vote',
      matchId: engine.state.matchId,
      actorId,
      targetId: idiotId,
      kind: 'exile',
    }))

    expect(engine.state.players.get(idiotId)?.alive).toBe(true)
    expect(engine.state.players.get(idiotId)?.canVote).toBe(false)
    expect(engine.state.phaseId).toBe('phase-night-wolf-council')
    expect(engine.events.some((event) => event.payload.type === 'idiot.revealed')).toBe(true)
  })

  it('interrupts sheriff election when a werewolf self-destructs', () => {
    const engine = createManualEngine(standardBoard)
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    engine.start()
    playNight(engine, { wolfTargetId: null })
    expect(engine.state.phaseId).toBe('phase-sheriff-signup')

    engine.submit({
      type: 'skill-trigger',
      matchId: engine.state.matchId,
      actorId: wolfId,
      abilityId: v1AbilityIds.werewolfSelfDestruct,
      targetId: null,
    })

    expect(engine.state.sheriff.badgeLost).toBe(true)
    expect(engine.state.players.get(wolfId)?.alive).toBe(false)
    expect(engine.state.phaseId).toBe('phase-last-words')
    engine.submit({
      type: 'speech',
      matchId: engine.state.matchId,
      actorId: wolfId,
      kind: 'last-words',
      text: '我的遗言到此结束。',
    })
    expect(engine.state.phaseId).toBe('phase-night-wolf-council')
    expect(engine.state.night).toBe(2)
  })

  it('continues to the next night after daytime exile last words', () => {
    const engine = createManualEngine(noSheriffBoard)
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    engine.start()
    playNight(engine, { wolfTargetId: null })
    while (engine.state.phaseId === 'phase-day-speech') {
      const actorId = engine.activeActor()
      if (!actorId) throw new Error('Expected day speaker')
      engine.submit({
        type: 'speech',
        matchId: engine.state.matchId,
        actorId,
        kind: 'day',
        text: '白天发言结束。',
      })
    }
    submitExpected(engine, (actorId) => ({
      type: 'vote',
      matchId: engine.state.matchId,
      actorId,
      targetId,
      kind: 'exile',
    }))
    expect(engine.state.phaseId).toBe('phase-last-words')
    engine.submit({
      type: 'speech',
      matchId: engine.state.matchId,
      actorId: targetId,
      kind: 'last-words',
      text: '遗言结束。',
    })

    expect(engine.state.phaseId).toBe('phase-night-wolf-council')
    expect(engine.state.night).toBe(2)
  })

  it('restores a paused engine from its event log', () => {
    const engine = createManualEngine(sixPlayerBoard)
    engine.start()
    engine.pause('operator-recovery')

    const restored = GameEngine.restore({
      matchId: engine.state.matchId,
      board: sixPlayerBoard,
      events: engine.events,
      status: 'paused',
      pausedReason: 'operator-recovery',
    })
    expect(restored.state).toMatchObject({
      status: 'paused',
      phaseId: 'phase-night-wolf-council',
      pausedReason: 'operator-recovery',
    })
    expect(restored.events).toEqual(engine.events)

    restored.resume()
    expect(restored.state.status).toBe('running')
    expect(restored.state.phaseId).toBe('phase-night-wolf-council')
  })
})
