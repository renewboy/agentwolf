import type { Faction, PlayerId } from '@agentwolf/contracts'
import { visibility, type RuleRuntime } from './rule-registry.js'

export function appendFactionKnowledge(
  runtime: Pick<RuleRuntime, 'state' | 'roles' | 'append'>,
): void {
  const membersByFaction = new Map<Faction, PlayerId[]>()
  for (const player of runtime.state.players.values()) {
    if (!player.faction || !player.roleId) continue
    const members = membersByFaction.get(player.faction) ?? []
    members.push(player.id)
    membersByFaction.set(player.faction, members)
  }
  for (const [faction, memberIds] of membersByFaction) {
    const playerIds = memberIds.filter((playerId) => {
      const roleId = runtime.state.players.get(playerId)?.roleId
      return roleId ? runtime.roles.role(roleId).sharesFactionKnowledge : false
    })
    if (playerIds.length === 0) continue
    runtime.append(
      { type: 'faction.members', faction, playerIds },
      playerIds.length === memberIds.length
        ? visibility.faction(faction)
        : visibility.players(playerIds),
    )
  }
}
