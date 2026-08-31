import { describe, expect, it, vi } from 'vitest'
import {
  AgentProfileIdSchema,
  BoardIdSchema,
  PlayerIdSchema,
  RoleIdSchema,
} from '@agentwolf/contracts'
import {
  DealRegistry,
  createClassicBoardManifest,
  createClassicRuleset,
  hasLegalRoleDeal,
  prepareMatchSetup,
  sixPlayerBoard,
} from '../src/index.js'

describe('Role deal registry', () => {
  it('orders board/deal validators and rejects duplicate registrations', () => {
    const registry = new DealRegistry()
    const validateBoard = vi.fn()
    const validateDeal = vi.fn()
    registry.register({ id: 'first', validateBoard, validateDeal })
    registry.register({ id: 'without-board-hook', validateDeal: vi.fn() })
    expect(() => registry.register({ id: 'first', validateDeal })).toThrow(
      'Duplicate role deal validator first',
    )
    const roles = createClassicRuleset().roles
    registry.validateBoard(sixPlayerBoard, roles)
    registry.validateDeal({ board: sixPlayerBoard, roles, assignments: [], reserveCards: [] })
    expect(validateBoard).toHaveBeenCalledOnce()
    expect(validateDeal).toHaveBeenCalledOnce()
  })

  it('supports one reserve card and propagates non-rule validator failures', () => {
    const board = createClassicBoardManifest({
      id: BoardIdSchema.parse('board-one-reserve-test'),
      roles: [
        { roleId: RoleIdSchema.parse('role-werewolf'), count: 2 },
        { roleId: RoleIdSchema.parse('role-villager'), count: 3 },
        { roleId: RoleIdSchema.parse('role-seer'), count: 1 },
        { roleId: RoleIdSchema.parse('role-hunter'), count: 1 },
      ],
      reserveCount: 1,
      sheriff: false,
      victory: 'slaughter-all',
    })
    const ruleset = createClassicRuleset()
    const players = Array.from({ length: board.playerCount }, (_, index) => ({
      id: PlayerIdSchema.parse(`player-${index + 1}`),
      seat: index + 1,
      name: `Deal player ${index + 1}`,
      profileId: AgentProfileIdSchema.parse(`profile-deal-${index + 1}`),
    }))
    const setup = prepareMatchSetup(board, players, 'random', 3, ruleset.roles, new DealRegistry())
    expect(setup.assignments).toHaveLength(6)
    expect(setup.reserveCards).toHaveLength(1)

    const broken = new DealRegistry()
    broken.register({
      id: 'broken',
      validateDeal: () => {
        throw new Error('broken deal validator')
      },
    })
    expect(() => prepareMatchSetup(board, players, 'random', 3, ruleset.roles, broken)).toThrow(
      'broken deal validator',
    )
    expect(() => hasLegalRoleDeal(board, ruleset.roles, broken)).toThrow('broken deal validator')
  })
})
