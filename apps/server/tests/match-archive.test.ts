import {
  MatchIdSchema,
  MatchViewSchema,
  PlayerIdSchema,
  type MatchView,
  type SpectatorView,
} from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { createMatchArchive, projectMatchArchive } from '../src/match-archive.js'
import { SqliteRepository } from '../src/repository.js'

const matchId = MatchIdSchema.parse('match-archive-service')
const playerId = PlayerIdSchema.parse('player-1')

function viewFor(view: SpectatorView): MatchView {
  return MatchViewSchema.parse({
    id: matchId,
    boardId: 'board-archive-service',
    boardName: 'Archive service board',
    status: 'ended',
    day: 1,
    phaseId: 'phase-match-ended',
    phaseLabel: view.kind,
    lastSequence: 20,
    seats: [
      {
        playerId,
        seat: 1,
        name: 'Archived player',
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
    winningPlayerIds: [playerId],
    pausedReason: null,
  })
}

describe('Match archive', () => {
  it('freezes and selects each authorized spectator projection', () => {
    const archive = createMatchArchive({
      matchId,
      sourceRuleset: { familyId: 'classic', revision: 6, fingerprint: 'a'.repeat(64) },
      project: viewFor,
      trajectoryAudit: { matchId, ok: true, auditedTurns: 3, issues: [] },
      archivedAt: '2026-08-30T00:00:00.000Z',
    })

    expect(projectMatchArchive(archive, { kind: 'god' }).phaseLabel).toBe('god')
    expect(projectMatchArchive(archive, { kind: 'closed-eye' }).phaseLabel).toBe('closed-eye')
    expect(projectMatchArchive(archive, { kind: 'player', playerId }).phaseLabel).toBe('player')
    expect(() =>
      projectMatchArchive(archive, {
        kind: 'player',
        playerId: PlayerIdSchema.parse('player-2'),
      }),
    ).toThrow(/no player view/)
  })

  it('persists archives idempotently and rejects replacement data', () => {
    const repository = new SqliteRepository(':memory:')
    const archive = createMatchArchive({
      matchId,
      sourceRuleset: { familyId: 'classic', revision: 6, fingerprint: 'a'.repeat(64) },
      project: viewFor,
      trajectoryAudit: { matchId, ok: true, auditedTurns: 3, issues: [] },
      archivedAt: '2026-08-30T00:00:00.000Z',
    })

    expect(repository.getMatchArchive(matchId)).toBeNull()
    expect(() => repository.saveMatchArchive(archive)).toThrow(/FOREIGN KEY/)
    repository.createMatch(
      {
        id: matchId,
        boardId: 'board-archive-service' as never,
        boardSnapshot: null,
        status: 'ended',
        setup: {
          boardId: 'board-archive-service' as never,
          roleAssignment: 'random',
          seats: Array.from({ length: 6 }, (_, index) => ({
            seat: index + 1,
            name: `Player ${index + 1}`,
            profileId: `profile-${index + 1}` as never,
            character: null,
          })),
          speechCharacterLimit: 300,
        },
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
        pausedReason: null,
      },
      [],
    )
    expect(repository.saveMatchArchive(archive)).toEqual(archive)
    expect(repository.saveMatchArchive(archive)).toEqual(archive)
    expect(() =>
      repository.saveMatchArchive({
        ...archive,
        archivedAt: '2026-08-30T00:00:01.000Z',
      }),
    ).toThrow(/immutable/)
    expect(repository.getMatchArchive(matchId)).toEqual(archive)
    repository.deleteMatch(matchId)
    expect(repository.getMatchArchive(matchId)).toBeNull()
    repository.close()
  })
})
