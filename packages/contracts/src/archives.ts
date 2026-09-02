import { z } from 'zod'
import { MatchViewSchema } from './game.js'
import { MatchIdSchema, PlayerIdSchema } from './ids.js'
import { TrajectoryAuditReportSchema } from './trajectory.js'

const ArchivedProjectionSchema = z
  .preprocess(normalizeArchivedProjection, MatchViewSchema)
  .refine((view) => view.status === 'ended', {
    message: 'Archived Match projections must be ended',
  })

function normalizeArchivedProjection(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value['activeSpeech'])) return value
  const activeSpeech = value['activeSpeech']
  if (activeSpeech['speechId'] !== undefined) return value
  const timeline = Array.isArray(value['timeline']) ? value['timeline'] : []
  const matchingSpeech = [...timeline].reverse().find((item) => {
    if (!isRecord(item) || item['kind'] !== 'speech.committed') return false
    const playerIds = Array.isArray(item['playerIds']) ? item['playerIds'] : []
    return playerIds.includes(activeSpeech['playerId']) && item['title'] === activeSpeech['text']
  })
  const speechId =
    isRecord(matchingSpeech) && typeof matchingSpeech['speechId'] === 'number'
      ? matchingSpeech['speechId']
      : isRecord(matchingSpeech) && typeof matchingSpeech['sequence'] === 'number'
        ? matchingSpeech['sequence']
        : value['lastSequence']
  if (typeof speechId !== 'number' || !Number.isInteger(speechId) || speechId <= 0) return value
  return { ...value, activeSpeech: { ...activeSpeech, speechId } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const MatchArchiveSchema = z
  .object({
    schemaVersion: z.literal(1),
    matchId: MatchIdSchema,
    sourceRuleset: z.object({
      familyId: z.literal('classic'),
      revision: z.number().int().positive(),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    }),
    archivedAt: z.string().datetime(),
    projections: z.object({
      god: ArchivedProjectionSchema,
      closedEye: ArchivedProjectionSchema,
      players: z.array(
        z.object({
          playerId: PlayerIdSchema,
          view: ArchivedProjectionSchema,
        }),
      ),
    }),
    trajectoryAudit: TrajectoryAuditReportSchema,
  })
  .superRefine((archive, context) => {
    const projections = [
      archive.projections.god,
      archive.projections.closedEye,
      ...archive.projections.players.map((entry) => entry.view),
    ]
    if (projections.some((view) => view.id !== archive.matchId)) {
      context.addIssue({ code: 'custom', message: 'Archive projection Match IDs must match' })
    }
    if (archive.trajectoryAudit.matchId !== archive.matchId) {
      context.addIssue({ code: 'custom', message: 'Archive audit Match ID must match' })
    }
    const playerIds = archive.projections.players.map((entry) => entry.playerId)
    if (new Set(playerIds).size !== playerIds.length) {
      context.addIssue({ code: 'custom', message: 'Archive player projections must be unique' })
    }
  })

export type MatchArchive = z.infer<typeof MatchArchiveSchema>
