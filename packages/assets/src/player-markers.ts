import { PlayerMarkerIdSchema, type PlayerId, type PlayerMarkerId } from '@agentwolf/contracts'

export interface PlayerMarkerContribution {
  readonly markerId: PlayerMarkerId
  readonly playerIds: readonly PlayerId[]
}

export interface PlayerMarkerDefinition {
  readonly id: PlayerMarkerId
  readonly labelKey: string
  readonly icon: 'heart' | 'cards'
  readonly tone: 'rose' | 'amber'
}

export const cupidLoverMarkerId = PlayerMarkerIdSchema.parse('cupid-lover')
export const thiefOriginMarkerId = PlayerMarkerIdSchema.parse('thief-origin')

export const playerMarkerCatalog: Readonly<Record<string, PlayerMarkerDefinition>> = {
  [cupidLoverMarkerId]: {
    id: cupidLoverMarkerId,
    labelKey: 'playerMarkers.cupidLover',
    icon: 'heart',
    tone: 'rose',
  },
  [thiefOriginMarkerId]: {
    id: thiefOriginMarkerId,
    labelKey: 'playerMarkers.thiefOrigin',
    icon: 'cards',
    tone: 'amber',
  },
}

export function getPlayerMarkerDefinition(id: PlayerMarkerId): PlayerMarkerDefinition {
  const definition = playerMarkerCatalog[id]
  if (!definition) throw new Error(`Unknown player marker ${id}`)
  return definition
}
