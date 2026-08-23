import { BoardIdSchema, RoleIdSchema } from '@agentwolf/contracts'
import { assertRule } from './errors.js'
import { classicPhaseGraph } from './phase-graph.js'
import type { BoardManifest } from './types.js'

const defaultPolicies = {
  witchSelfSave: 'never',
  witchPotionsPerNight: 1,
  guardAntidoteCollision: 'death',
  guardCanSelfProtect: true,
  sheriffExplosion: 'single-explosion-loses-badge',
  nightLastWords: 'first-night-only',
  victory: 'slaughter-edge',
} as const

export const sixPlayerBoard: BoardManifest = {
  id: BoardIdSchema.parse('board-quick-6'),
  nameKey: 'boards.quick6.name',
  descriptionKey: 'boards.quick6.description',
  playerCount: 6,
  roles: [
    { roleId: RoleIdSchema.parse('role-werewolf'), count: 2 },
    { roleId: RoleIdSchema.parse('role-villager'), count: 2 },
    { roleId: RoleIdSchema.parse('role-seer'), count: 1 },
    { roleId: RoleIdSchema.parse('role-hunter'), count: 1 },
  ],
  sheriff: false,
  policies: {
    ...defaultPolicies,
    victory: 'slaughter-all',
  },
  phases: classicPhaseGraph,
}

export const ninePlayerBoard: BoardManifest = {
  id: BoardIdSchema.parse('board-standard-9'),
  nameKey: 'boards.standard9.name',
  descriptionKey: 'boards.standard9.description',
  playerCount: 9,
  roles: [
    { roleId: RoleIdSchema.parse('role-werewolf'), count: 3 },
    { roleId: RoleIdSchema.parse('role-villager'), count: 3 },
    { roleId: RoleIdSchema.parse('role-seer'), count: 1 },
    { roleId: RoleIdSchema.parse('role-witch'), count: 1 },
    { roleId: RoleIdSchema.parse('role-hunter'), count: 1 },
  ],
  sheriff: true,
  policies: defaultPolicies,
  phases: classicPhaseGraph,
}

export const standardBoard: BoardManifest = {
  id: BoardIdSchema.parse('board-standard-12'),
  nameKey: 'boards.standard12.name',
  descriptionKey: 'boards.standard12.description',
  playerCount: 12,
  roles: [
    { roleId: RoleIdSchema.parse('role-werewolf'), count: 4 },
    { roleId: RoleIdSchema.parse('role-villager'), count: 4 },
    { roleId: RoleIdSchema.parse('role-seer'), count: 1 },
    { roleId: RoleIdSchema.parse('role-witch'), count: 1 },
    { roleId: RoleIdSchema.parse('role-hunter'), count: 1 },
    { roleId: RoleIdSchema.parse('role-idiot'), count: 1 },
  ],
  sheriff: true,
  policies: defaultPolicies,
  phases: classicPhaseGraph,
}

export const guardBoard: BoardManifest = {
  id: BoardIdSchema.parse('board-guard-12'),
  nameKey: 'boards.guard12.name',
  descriptionKey: 'boards.guard12.description',
  playerCount: 12,
  roles: [
    { roleId: RoleIdSchema.parse('role-werewolf'), count: 4 },
    { roleId: RoleIdSchema.parse('role-villager'), count: 4 },
    { roleId: RoleIdSchema.parse('role-seer'), count: 1 },
    { roleId: RoleIdSchema.parse('role-witch'), count: 1 },
    { roleId: RoleIdSchema.parse('role-hunter'), count: 1 },
    { roleId: RoleIdSchema.parse('role-guard'), count: 1 },
  ],
  sheriff: true,
  policies: defaultPolicies,
  phases: classicPhaseGraph,
}

const boards = new Map(
  [sixPlayerBoard, ninePlayerBoard, standardBoard, guardBoard].map((board) => [board.id, board]),
)

export function getBoard(id: BoardManifest['id']): BoardManifest {
  const board = boards.get(id)
  assertRule(board, `Unknown board ${id}`)
  return board
}

export function listBoards(): readonly BoardManifest[] {
  return [...boards.values()]
}
