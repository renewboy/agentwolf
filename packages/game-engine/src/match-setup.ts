import type { RoleId } from '@agentwolf/contracts'
import { assertRule } from './errors.js'
import type { EnginePlayerInput } from './engine-contracts.js'
import type { BoardManifest } from './types.js'

class SeededRandom {
  #state: number

  public constructor(seed: number) {
    this.#state = seed >>> 0 || 0x9e37_79b9
  }

  public next(): number {
    let value = this.#state
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.#state = value >>> 0
    return this.#state / 0x1_0000_0000
  }
}

function shuffled<Value>(values: readonly Value[], random: SeededRandom): Value[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random.next() * (index + 1))
    const current = result[index]!
    result[index] = result[swapIndex]!
    result[swapIndex] = current
  }
  return result
}

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
