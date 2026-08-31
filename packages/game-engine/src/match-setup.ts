import { RoleCardIdSchema, type RoleCard, type RoleId } from '@agentwolf/contracts'
import { SeededRandom, shuffled } from '@agent-arena/game-runtime'
import { RuleViolation, assertRule } from './errors.js'
import type { EnginePlayerInput } from './engine-contracts.js'
import type { DealRegistry } from './plugins/deal-registry.js'
import type { RoleRegistry } from './roles/registry.js'
import type { BoardManifest } from './types.js'

export interface PreparedMatchSetup {
  readonly players: readonly EnginePlayerInput[]
  readonly assignments: readonly RoleId[]
  readonly reserveCards: readonly RoleCard[]
}

export function prepareMatchSetup(
  board: BoardManifest,
  players: readonly EnginePlayerInput[],
  roleAssignment: 'random' | 'manual',
  seed: number,
  roles: RoleRegistry,
  deals: DealRegistry,
  manualReserveRoleIds: readonly RoleId[] = [],
): PreparedMatchSetup {
  assertRule(players.length === board.playerCount, 'Player count does not match board')
  const seats = new Set(players.map((player) => player.seat))
  const ids = new Set(players.map((player) => player.id))
  const names = new Set(players.map((player) => player.name))
  assertRule(seats.size === players.length, 'Seat numbers must be unique')
  assertRule(ids.size === players.length, 'Player IDs must be unique')
  assertRule(names.size === players.length, 'Player names must be unique')

  const ordered = [...players].sort((left, right) => left.seat - right.seat)
  const roleCards = expandedRoleCards(board)
  assertRule(
    roleCards.length === board.playerCount + board.reserveCount,
    'Board role card count does not match seats and reserves',
  )
  deals.validateBoard(board, roles)

  if (roleAssignment === 'manual') {
    assertRule(
      manualReserveRoleIds.length === board.reserveCount,
      `Manual role assignment requires ${board.reserveCount} reserve roles`,
    )
    const assignmentRoleIds = ordered.map((player) => {
      assertRule(player.roleId, `Seat ${player.seat} requires a role`)
      return player.roleId
    })
    assertSameRoleMultiset(
      roleCards.map((card) => card.roleId),
      [...assignmentRoleIds, ...manualReserveRoleIds],
    )
    const remaining = [...roleCards]
    const reserveCards = manualReserveRoleIds.map((roleId) => takeRoleCard(remaining, roleId))
    const assignmentCards = assignmentRoleIds.map((roleId) => takeRoleCard(remaining, roleId))
    assertPlayableAssignments(board, roles, assignmentCards)
    deals.validateDeal({ board, roles, assignments: assignmentCards, reserveCards })
    return {
      players: ordered,
      assignments: assignmentRoleIds,
      reserveCards: normalizedReserveCards(reserveCards),
    }
  }

  assertRule(manualReserveRoleIds.length === 0, 'Random role assignment cannot set reserve roles')
  const legalReserves = reserveIndexCombinations(roleCards.length, board.reserveCount).filter(
    (indices) => {
      const selected = new Set(indices)
      const reserveCards = indices.map((index) => roleCards[index]!)
      const assignments = roleCards.filter((_card, index) => !selected.has(index))
      try {
        assertPlayableAssignments(board, roles, assignments)
        deals.validateDeal({ board, roles, assignments, reserveCards })
        return true
      } catch (error) {
        if (error instanceof RuleViolation) return false
        throw error
      }
    },
  )
  assertRule(legalReserves.length > 0, 'Board has no legal role-card deal')
  const random = new SeededRandom(seed)
  const reserveIndices = shuffled(legalReserves, random)[0]!
  const reserved = new Set(reserveIndices)
  const reserveCards = reserveIndices.map((index) => roleCards[index]!)
  const assignments = shuffled(
    roleCards.filter((_card, index) => !reserved.has(index)),
    random,
  ).map((card) => card.roleId)
  return { players: ordered, assignments, reserveCards: normalizedReserveCards(reserveCards) }
}

export function hasLegalRoleDeal(
  board: BoardManifest,
  roles: RoleRegistry,
  deals: DealRegistry,
): boolean {
  deals.validateBoard(board, roles)
  const cards = expandedRoleCards(board)
  if (cards.length !== board.playerCount + board.reserveCount) return false
  return reserveIndexCombinations(cards.length, board.reserveCount).some((indices) => {
    const selected = new Set(indices)
    try {
      const assignments = cards.filter((_card, index) => !selected.has(index))
      assertPlayableAssignments(board, roles, assignments)
      deals.validateDeal({
        board,
        roles,
        assignments,
        reserveCards: indices.map((index) => cards[index]!),
      })
      return true
    } catch (error) {
      if (error instanceof RuleViolation) return false
      throw error
    }
  })
}

function assertPlayableAssignments(
  board: BoardManifest,
  roles: RoleRegistry,
  assignments: readonly RoleCard[],
): void {
  const assignedRoles = assignments.map((card) => roles.role(card.roleId))
  const werewolves = assignedRoles.filter((role) => role.faction === 'werewolf').length
  assertRule(
    werewolves > 0 && werewolves < assignedRoles.length,
    'Role-card deal requires at least one Werewolf and one non-Werewolf',
  )
  if (board.policies.victory !== 'slaughter-edge') return
  assertRule(
    assignedRoles.some((role) => role.faction === 'village' && role.kind === 'villager') &&
      assignedRoles.some((role) => role.faction === 'village' && role.kind === 'god'),
    'Slaughter-edge role-card deal requires Villagers and village gods',
  )
}

function expandedRoleCards(board: BoardManifest): RoleCard[] {
  const roleIds = board.roles.flatMap(({ roleId, count }) =>
    Array.from({ length: count }, () => roleId),
  )
  return roleIds.map((roleId, index) => ({
    id: RoleCardIdSchema.parse(`role-card-c${String(index + 1).padStart(2, '0')}`),
    roleId,
  }))
}

function normalizedReserveCards(cards: readonly RoleCard[]): RoleCard[] {
  return cards.map((card, index) => ({
    id: RoleCardIdSchema.parse(`role-card-r${String(index + 1).padStart(2, '0')}`),
    roleId: card.roleId,
  }))
}

function reserveIndexCombinations(cardCount: number, reserveCount: number): number[][] {
  if (reserveCount === 0) return [[]]
  if (reserveCount === 1) return Array.from({ length: cardCount }, (_value, index) => [index])
  assertRule(reserveCount === 2, 'Role-card deals support at most two reserves')
  const combinations: number[][] = []
  for (let left = 0; left < cardCount; left += 1) {
    for (let right = left + 1; right < cardCount; right += 1) combinations.push([left, right])
  }
  return combinations
}

function takeRoleCard(cards: RoleCard[], roleId: RoleId): RoleCard {
  const index = cards.findIndex((card) => card.roleId === roleId)
  assertRule(index >= 0, `Role card pool does not contain ${roleId}`)
  return cards.splice(index, 1)[0]!
}

function assertSameRoleMultiset(expected: readonly RoleId[], actual: readonly RoleId[]): void {
  const sortedExpected = [...expected].sort()
  const sortedActual = [...actual].sort()
  assertRule(
    sortedExpected.length === sortedActual.length &&
      sortedExpected.every((roleId, index) => roleId === sortedActual[index]),
    'Manual role assignment does not match board role-card pool',
  )
}
