import {
  MatchArchiveSchema,
  type MatchArchive,
  type MatchId,
  type MatchView,
  type SpectatorView,
  type TrajectoryAuditReport,
} from '@agentwolf/contracts'

export interface MatchArchiveSourceRuleset {
  readonly familyId: 'classic'
  readonly revision: number
  readonly fingerprint: string
}

export function createMatchArchive(options: {
  readonly matchId: MatchId
  readonly sourceRuleset: MatchArchiveSourceRuleset
  readonly project: (view: SpectatorView) => MatchView
  readonly trajectoryAudit: TrajectoryAuditReport
  readonly archivedAt?: string
}): MatchArchive {
  const god = options.project({ kind: 'god' })
  const closedEye = options.project({ kind: 'closed-eye' })
  return MatchArchiveSchema.parse({
    schemaVersion: 1,
    matchId: options.matchId,
    sourceRuleset: options.sourceRuleset,
    archivedAt: options.archivedAt ?? new Date().toISOString(),
    projections: {
      god,
      closedEye,
      players: god.seats.map((seat) => ({
        playerId: seat.playerId,
        view: options.project({ kind: 'player', playerId: seat.playerId }),
      })),
    },
    trajectoryAudit: options.trajectoryAudit,
  })
}

export function projectMatchArchive(archive: MatchArchive, view: SpectatorView): MatchView {
  if (view.kind === 'god') return archive.projections.god
  if (view.kind === 'closed-eye') return archive.projections.closedEye
  const projection = archive.projections.players.find((entry) => entry.playerId === view.playerId)
  if (!projection) throw new Error(`Archived Match has no player view for ${view.playerId}`)
  return projection.view
}
