import { describe, expect, it } from 'vitest'
import { MatchArchiveSchema, MatchViewSchema } from '../src/index.js'

const endedView = MatchViewSchema.parse({
  id: 'match-archive-test',
  boardId: 'board-archive-test',
  boardName: 'Archive board',
  status: 'ended',
  day: 2,
  phaseId: 'phase-match-ended',
  phaseLabel: '对局结束',
  lastSequence: 10,
  seats: [
    {
      playerId: 'player-1',
      seat: 1,
      name: 'Archive player',
      agent: null,
      alive: true,
      canVote: true,
      sheriff: false,
      active: false,
      sessionStatus: 'closed',
      character: null,
    },
  ],
  timeline: [],
  activeSpeech: null,
  winner: 'village',
  winningPlayerIds: ['player-1'],
  pausedReason: null,
})

function archiveInput() {
  return {
    schemaVersion: 1,
    matchId: endedView.id,
    sourceRuleset: {
      familyId: 'classic',
      revision: 6,
      fingerprint: 'a'.repeat(64),
    },
    archivedAt: '2026-08-30T00:00:00.000Z',
    projections: {
      god: endedView,
      closedEye: endedView,
      players: [{ playerId: 'player-1', view: endedView }],
    },
    trajectoryAudit: {
      matchId: endedView.id,
      ok: true,
      auditedTurns: 0,
      issues: [],
    },
  }
}

describe('MatchArchiveSchema', () => {
  it('accepts one immutable ended projection per spectator identity', () => {
    expect(MatchArchiveSchema.parse(archiveInput())).toMatchObject({
      matchId: 'match-archive-test',
      sourceRuleset: { familyId: 'classic', revision: 6 },
    })
  })

  it('rejects active, mismatched, and duplicate projections', () => {
    const input = archiveInput()
    expect(() =>
      MatchArchiveSchema.parse({
        ...input,
        projections: {
          ...input.projections,
          god: { ...endedView, status: 'running' },
        },
      }),
    ).toThrow(/must be ended/)
    expect(() =>
      MatchArchiveSchema.parse({
        ...input,
        projections: {
          ...input.projections,
          closedEye: { ...endedView, id: 'match-other' },
        },
        trajectoryAudit: { ...input.trajectoryAudit, matchId: 'match-other' },
      }),
    ).toThrow(/Match IDs must match/)
    expect(() =>
      MatchArchiveSchema.parse({
        ...input,
        projections: {
          ...input.projections,
          players: [input.projections.players[0], input.projections.players[0]],
        },
      }),
    ).toThrow(/must be unique/)
  })
})
