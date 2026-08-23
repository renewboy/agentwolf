import { assertRule } from './errors.js'
import { visibility, type RuleRuntime } from './rule-registry.js'

export function appendFinalRoleReveals(runtime: RuleRuntime): void {
  const revealed = new Set(
    runtime.events
      .filter((event) => event.payload.type === 'role.revealed')
      .map((event) => {
        assertRule(event.payload.type === 'role.revealed', 'Expected role reveal event')
        return event.payload.playerId
      }),
  )
  const players = [...runtime.state.players.values()].sort((left, right) => left.seat - right.seat)
  for (const player of players) {
    if (revealed.has(player.id)) continue
    assertRule(player.roleId, `Role reveal target ${player.id} has no role`)
    runtime.append(
      { type: 'role.revealed', playerId: player.id, roleId: player.roleId },
      visibility.public,
    )
  }
}
