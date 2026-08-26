import { describe, expect, it } from 'vitest'
import {
  ResolutionAgenda,
  createV1RoleRegistry,
  guardBoard,
  type BoardManifest,
} from '../src/index.js'
import { actorsWithRole, createManualEngine } from './helpers.js'

describe('ResolutionAgenda', () => {
  it('applies guard and antidote collision as death', () => {
    const engine = createManualEngine(guardBoard)
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const guardId = actorsWithRole(engine, 'role-guard')[0]!
    const witchId = actorsWithRole(engine, 'role-witch')[0]!
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    const agenda = new ResolutionAgenda()
    agenda.add({
      kind: 'protect',
      priority: 300,
      sourceId: guardId,
      targetId,
      protection: 'guard',
      blocks: ['werewolf'],
    })
    agenda.add({
      kind: 'protect',
      priority: 300,
      sourceId: witchId,
      targetId,
      protection: 'antidote',
      blocks: ['werewolf'],
    })
    agenda.add({ kind: 'damage', priority: 400, sourceId: wolfId, targetId, cause: 'werewolf' })

    expect(agenda.settle(engine.state, guardBoard, createV1RoleRegistry()).pendingDeaths).toEqual([
      { playerId: targetId, causes: ['werewolf'] },
    ])
  })

  it('allows a board policy to make the same collision survive', () => {
    const board: BoardManifest = {
      ...guardBoard,
      policies: { ...guardBoard.policies, guardAntidoteCollision: 'survive' },
    }
    const engine = createManualEngine(board)
    const targetId = actorsWithRole(engine, 'role-villager')[0]!
    const guardId = actorsWithRole(engine, 'role-guard')[0]!
    const witchId = actorsWithRole(engine, 'role-witch')[0]!
    const wolfId = actorsWithRole(engine, 'role-werewolf')[0]!
    const agenda = new ResolutionAgenda()
    agenda.add({
      kind: 'protect',
      priority: 300,
      sourceId: guardId,
      targetId,
      protection: 'guard',
      blocks: ['werewolf'],
    })
    agenda.add({
      kind: 'protect',
      priority: 300,
      sourceId: witchId,
      targetId,
      protection: 'antidote',
      blocks: ['werewolf'],
    })
    agenda.add({ kind: 'damage', priority: 400, sourceId: wolfId, targetId, cause: 'werewolf' })

    const result = agenda.settle(engine.state, board, createV1RoleRegistry())
    expect(result.pendingDeaths).toEqual([])
    expect(result.savedPlayerIds).toEqual([targetId])
  })
})
