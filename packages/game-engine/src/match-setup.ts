import type { RoleId } from '@agentwolf/contracts'
import { SeededRandom, shuffled } from '@agent-arena/game-runtime'
import { assertRule } from './errors.js'
import type { EnginePlayerInput } from './engine-contracts.js'
import type { BoardManifest } from './types.js'

function expandedRoles(board: BoardManifest): RoleId[] {
  return board.roles.flatMap(({ roleId, count }) => Array.from({ length: count }, () => roleId))
}

export interface PreparedMatchSetup {
  readonly players: readonly EnginePlayerInput[]
  readonly assignments: readonly RoleId[]
}

export function prepareMatchSetup(
  board: BoardManifest,
  players: readonly EnginePlayerInput[],
  roleAssignment: 'random' | 'manual',
  seed: number,
): PreparedMatchSetup {
  assertRule(players.length === board.playerCount, 'Player count does not match board')
  const seats = new Set(players.map((player) => player.seat))
  const ids = new Set(players.map((player) => player.id))
  const names = new Set(players.map((player) => player.name))
  assertRule(seats.size === players.length, 'Seat numbers must be unique')
  assertRule(ids.size === players.length, 'Player IDs must be unique')
  assertRule(names.size === players.length, 'Player names must be unique')

  const ordered = [...players].sort((left, right) => left.seat - right.seat)
  const boardRoles = expandedRoles(board)
  const assignments =
    roleAssignment === 'manual'
      ? ordered.map((player) => {
          assertRule(player.roleId, `Seat ${player.seat} requires a role`)
          return player.roleId
        })
      : shuffled(boardRoles, new SeededRandom(seed))
  const expected = [...boardRoles].sort()
  const actual = [...assignments].sort()
  assertRule(
    expected.length === actual.length &&
      expected.every((roleId, index) => roleId === actual[index]),
    'Manual role assignment does not match board composition',
  )
  return { players: ordered, assignments }
}
