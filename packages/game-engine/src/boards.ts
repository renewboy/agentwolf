import {
  BoardIdSchema,
  MatchBoardSnapshotSchema,
  RoleIdSchema,
  type BoardId,
  type BoardRoleSlot,
  type BoardVictory,
  type MatchBoardSnapshot,
} from '@agentwolf/contracts'
import { assertRule } from './errors.js'
import { classicPhaseGraph } from './phase-graph.js'
import type { BoardManifest } from './types.js'

export const classicBoardPolicyDefaults = {
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
  playerCount: 6,
  roles: [
    { roleId: RoleIdSchema.parse('role-werewolf'), count: 2 },
    { roleId: RoleIdSchema.parse('role-villager'), count: 2 },
    { roleId: RoleIdSchema.parse('role-seer'), count: 1 },
    { roleId: RoleIdSchema.parse('role-hunter'), count: 1 },
  ],
  sheriff: false,
  policies: {
    ...classicBoardPolicyDefaults,
    victory: 'slaughter-all',
  },
  phases: classicPhaseGraph,
}

export const ninePlayerBoard: BoardManifest = {
  id: BoardIdSchema.parse('board-standard-9'),
  playerCount: 9,
  roles: [
    { roleId: RoleIdSchema.parse('role-werewolf'), count: 3 },
    { roleId: RoleIdSchema.parse('role-villager'), count: 3 },
    { roleId: RoleIdSchema.parse('role-seer'), count: 1 },
    { roleId: RoleIdSchema.parse('role-witch'), count: 1 },
    { roleId: RoleIdSchema.parse('role-hunter'), count: 1 },
  ],
  sheriff: true,
  policies: classicBoardPolicyDefaults,
  phases: classicPhaseGraph,
}

export const standardBoard: BoardManifest = {
  id: BoardIdSchema.parse('board-standard-12'),
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
  policies: classicBoardPolicyDefaults,
  phases: classicPhaseGraph,
}

export const guardBoard: BoardManifest = {
  id: BoardIdSchema.parse('board-guard-12'),
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
  policies: classicBoardPolicyDefaults,
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

export function createClassicBoardManifest(input: {
  readonly id: BoardId
  readonly roles: readonly BoardRoleSlot[]
  readonly sheriff: boolean
  readonly victory: BoardVictory
}): BoardManifest {
  const playerCount = input.roles.reduce((total, role) => total + role.count, 0)
  assertRule(playerCount >= 6 && playerCount <= 24, 'Board requires between 6 and 24 players')
  return {
    id: input.id,
    playerCount,
    roles: input.roles.map((role) => ({ ...role })),
    sheriff: input.sheriff,
    policies: { ...classicBoardPolicyDefaults, victory: input.victory },
    phases: classicPhaseGraph,
  }
}

export function boardManifestFromSnapshot(snapshot: MatchBoardSnapshot): BoardManifest {
  const parsed = MatchBoardSnapshotSchema.parse(snapshot)
  return createClassicBoardManifest({
    id: parsed.id,
    roles: parsed.roles,
    sheriff: parsed.sheriff,
    victory: parsed.victory,
  })
}
