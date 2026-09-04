import { lstat, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  AgentProfileSchema,
  AgentToolSchema,
  MatchIdSchema,
  PlayerIdSchema,
  type PlayerAction,
} from '@agentwolf/contracts'
import { copyPlayerSkills } from '@agentwolf/assets/player-skills'
import { playerIsolationWorkspace } from '@agentwolf/acp'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createPlayerSessionBinding,
  withActivePlayerSession,
  withPendingPlayerAction,
  withoutPendingPlayerAction,
} from '../src/player-session-binding.js'
import {
  playerWorkspacePath,
  preparePlayerWorkspace,
  removeMatchPlayerWorkspaces,
} from '../src/player-workspace.js'
import { PlayerSessionSqliteRepository } from '../src/player-session-repository.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Player Session binding persistence', () => {
  it('enforces activation, ownership, delivery identity, and generation invariants', () => {
    const { matchId, playerId, profile, tool } = fixture()
    const created = createPlayerSessionBinding(
      { matchId, playerId, profile, tool, sessionGeneration: 2 },
      '2026-08-28T00:00:00.000Z',
    )
    expect(created.sessionGeneration).toBe(2)
    const active = withActivePlayerSession(created, 'session-binding-test')
    expect(() => withActivePlayerSession(active, 'session-again')).toThrow(/already active/)

    const action = voteAction(matchId, playerId, PlayerIdSchema.parse('player-2'))
    const pending = withPendingPlayerAction(active, 'delivery-one', action)
    const storedAction = pending.pendingAction!.action
    if (storedAction.type !== 'vote') throw new Error('Expected stored vote action')
    expect(
      withPendingPlayerAction(pending, 'delivery-one', storedAction).pendingAction?.deliveryId,
    ).toBe('delivery-one')
    expect(() => withPendingPlayerAction(pending, 'delivery-two', storedAction)).toThrow(
      /already has pending action/,
    )
    expect(() =>
      withPendingPlayerAction(pending, 'delivery-one', {
        ...storedAction,
        targetId: PlayerIdSchema.parse('player-3'),
      }),
    ).toThrow(/different accepted action/)
    expect(() =>
      withPendingPlayerAction(
        active,
        'delivery-owner',
        voteAction(MatchIdSchema.parse('match-other-binding'), playerId, null),
      ),
    ).toThrow(/ownership does not match/)
    expect(() =>
      withPendingPlayerAction(
        active,
        'delivery-actor',
        voteAction(matchId, PlayerIdSchema.parse('player-9'), null),
      ),
    ).toThrow(/ownership does not match/)
    expect(withoutPendingPlayerAction(pending).pendingAction).toBeNull()
  })

  it('reserves, adopts, advances, clears, lists, and rejects invalid repository transitions', () => {
    const database = new Database(':memory:')
    database.exec(`
      CREATE TABLE player_session_bindings (
        match_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (match_id, player_id)
      )
    `)
    const sessions = new PlayerSessionSqliteRepository(database)
    const first = fixture()
    const reserved = sessions.reserve(first)
    expect(sessions.get(first.matchId, first.playerId)).toEqual(reserved)
    expect(() => sessions.reserve(first)).toThrow(/already exists/)
    expect(sessions.activate(first.matchId, first.playerId, 'session-one').state).toBe('active')
    expect(
      sessions.markBootstrap(first.matchId, first.playerId, 'acknowledged').bootstrapState,
    ).toBe('acknowledged')
    expect(() => sessions.markBootstrap(first.matchId, first.playerId, 'pending')).toThrow(
      /cannot move/,
    )
    expect(sessions.clearPendingAction(first.matchId, first.playerId).pendingAction).toBeNull()

    const action = voteAction(first.matchId, first.playerId, null)
    expect(
      sessions.savePendingAction(first.matchId, first.playerId, 'delivery-repository', action)
        .pendingAction,
    ).toMatchObject({ deliveryId: 'delivery-repository' })
    expect(sessions.clearPendingAction(first.matchId, first.playerId).pendingAction).toBeNull()

    const second = {
      ...first,
      playerId: PlayerIdSchema.parse('player-2'),
      sessionGeneration: 3,
      sessionId: 'session-adopted',
    }
    expect(sessions.adopt(second).sessionId).toBe('session-adopted')
    expect(sessions.list(first.matchId)).toHaveLength(2)
    expect(() =>
      sessions.activate(first.matchId, PlayerIdSchema.parse('player-99'), 'missing-session'),
    ).toThrow(/Missing Player Session binding/)
    database.close()
  })
})

describe('Player workspace links', () => {
  it('requires built skills, repairs stale links, reuses valid links, and removes only valid roots', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-player-workspace-'))
    roots.push(root)
    const matchId = MatchIdSchema.parse('match-workspace-test')
    const playerId = PlayerIdSchema.parse('player-1')
    await expect(preparePlayerWorkspace(root, matchId, playerId)).rejects.toThrow(
      /Player Skills have not been built/,
    )
    await copyPlayerSkills({
      dataDirectory: root,
      sourceRoot: resolve(process.cwd(), 'packages/assets/player-skills'),
    })
    const workspace = await preparePlayerWorkspace(root, matchId, playerId)
    expect(workspace).toBe(playerWorkspacePath(root, matchId, playerId))
    const detachedWorkspace = playerIsolationWorkspace(workspace)
    await mkdir(detachedWorkspace, { recursive: true })
    await preparePlayerWorkspace(root, matchId, playerId)
    expect((await lstat(resolve(workspace, '.agents/skills'))).isSymbolicLink()).toBe(true)

    await rm(resolve(workspace, '.agents/skills'), { recursive: true, force: true })
    await mkdir(resolve(workspace, '.agents/skills'), { recursive: true })
    await preparePlayerWorkspace(root, matchId, playerId)
    expect((await lstat(resolve(workspace, '.agents/skills'))).isSymbolicLink()).toBe(true)

    await removeMatchPlayerWorkspaces(root, matchId)
    await expect(lstat(workspace)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(detachedWorkspace)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(removeMatchPlayerWorkspaces(root, '../escape' as never)).rejects.toThrow(
      /Invalid Match workspace path/,
    )
    expect(() => playerWorkspacePath(root, matchId, '../escape' as never)).toThrow(
      /Invalid Player workspace path/,
    )
  })
})

function fixture() {
  const matchId = MatchIdSchema.parse('match-session-persistence')
  const playerId = PlayerIdSchema.parse('player-1')
  const tool = AgentToolSchema.parse({
    id: 'tool-session-persistence',
    name: 'Session tool',
    kind: 'custom',
    command: 'session-tool',
    args: [],
    environment: {},
    modelConfigKey: 'model',
    builtIn: false,
  })
  const profile = AgentProfileSchema.parse({
    id: 'profile-session-persistence',
    name: 'Session profile',
    toolId: tool.id,
    model: 'session-model',
    promptTimeoutMs: 5_000,
    connection: {},
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  })
  return { matchId, playerId, profile, tool }
}

function voteAction(
  matchId: ReturnType<typeof MatchIdSchema.parse>,
  actorId: ReturnType<typeof PlayerIdSchema.parse>,
  targetId: ReturnType<typeof PlayerIdSchema.parse> | null,
): PlayerAction {
  return { type: 'vote', matchId, actorId, targetId, kind: 'exile' }
}
