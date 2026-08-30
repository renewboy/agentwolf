import { PlayerMarkerIdSchema, type PlayerId, type PlayerMarkerId } from '@agentwolf/contracts'

export interface PlayerMarkerContribution {
  readonly markerId: PlayerMarkerId
  readonly playerIds: readonly PlayerId[]
}

export interface PlayerMarkerDefinition {
  readonly id: PlayerMarkerId
  readonly labelKey: string
  readonly icon: 'heart'
  readonly tone: 'rose'
}

export const cupidLoverMarkerId = PlayerMarkerIdSchema.parse('cupid-lover')

export const playerMarkerCatalog: Readonly<Record<string, PlayerMarkerDefinition>> = {
  [cupidLoverMarkerId]: {
    id: cupidLoverMarkerId,
    labelKey: 'playerMarkers.cupidLover',
    icon: 'heart',
    tone: 'rose',
  },
}

export function getPlayerMarkerDefinition(id: PlayerMarkerId): PlayerMarkerDefinition {
  const definition = playerMarkerCatalog[id]
  if (!definition) throw new Error(`Unknown player marker ${id}`)
  return definition
}
