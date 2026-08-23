import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { MatchIdSchema, PlayerIdSchema } from '@agentwolf/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer, type AgentWolfServer } from '../src/app.js'
import type { ServerConfig } from '../src/config.js'

const roots: string[] = []
const servers: AgentWolfServer[] = []

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Fastify API', () => {
  it('supports profile, board, and draft-match HTTP workflows', async () => {
    const server = await createTestServer()
    const health = await server.app.inject({ method: 'GET', url: '/api/health' })
    expect(health.json()).toEqual({ ok: true })
    const tools = (await server.app.inject({ method: 'GET', url: '/api/agent-tools' })).json()
    expect(tools).toHaveLength(3)
    expect((await server.app.inject({ method: 'GET', url: '/api/settings' })).json()).toEqual({
      speechCharacterLimit: 300,
    })
    const settingsResponse = await server.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { speechCharacterLimit: 420 },
    })
    expect(settingsResponse.statusCode).toBe(200)

    const profileResponse = await server.app.inject({
      method: 'POST',
      url: '/api/agent-profiles',
      payload: {
        name: 'HTTP player',
        toolId: tools[0].id,
        model: 'test-model',
        promptTimeoutMs: 5_000,
        connection: {},
      },
    })
    expect(profileResponse.statusCode).toBe(201)
    const profile = profileResponse.json()
    const boards = (await server.app.inject({ method: 'GET', url: '/api/boards' })).json()
    expect(boards.map((board: { id: string }) => board.id)).toEqual([
      'board-quick-6',
      'board-standard-9',
      'board-standard-12',
      'board-guard-12',
    ])

    const matchResponse = await server.app.inject({
      method: 'POST',
      url: '/api/matches',
      payload: {
        boardId: 'board-standard-12',
        roleAssignment: 'random',
        seats: Array.from({ length: 12 }, (_, index) => ({
          seat: index + 1,
          name: `HTTP seat ${index + 1}`,
          profileId: profile.id,
        })),
      },
    })
    expect(matchResponse.statusCode).toBe(201)
    const match = matchResponse.json()
    expect(server.repository.getMatch(match.id)?.setup.speechCharacterLimit).toBe(420)
    const closed = await server.app.inject({
      method: 'GET',
      url: `/api/matches/${match.id}?view=closed-eye`,
    })
    expect(closed.statusCode).toBe(200)
    expect(
      closed.json().seats.every((seat: { roleId?: string }) => seat.roleId === undefined),
    ).toBe(true)
    expect((await server.app.inject({ method: 'GET', url: '/api/matches' })).json()).toHaveLength(1)

    const compactMatchIds: string[] = []
    for (const [boardId, playerCount] of [
      ['board-quick-6', 6],
      ['board-standard-9', 9],
    ] as const) {
      const compactMatchResponse = await server.app.inject({
        method: 'POST',
        url: '/api/matches',
        payload: {
          boardId,
          roleAssignment: 'random',
          seats: Array.from({ length: playerCount }, (_, index) => ({
            seat: index + 1,
            name: `${boardId} seat ${index + 1}`,
            profileId: profile.id,
          })),
        },
      })
      expect(compactMatchResponse.statusCode).toBe(201)
      const compactMatch = compactMatchResponse.json()
      compactMatchIds.push(compactMatch.id)
      expect(compactMatch.seats).toHaveLength(playerCount)
    }
    const deleted = await server.app.inject({
      method: 'DELETE',
      url: `/api/matches/${compactMatchIds[0]}`,
    })
    expect(deleted.statusCode).toBe(204)
    const missing = await server.app.inject({
      method: 'GET',
      url: `/api/matches/${compactMatchIds[0]}?view=god`,
    })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toMatchObject({ error: 'not-found' })
    expect((await server.app.inject({ method: 'GET', url: '/api/matches' })).json()).toHaveLength(2)

    const invalid = await server.app.inject({
      method: 'POST',
      url: '/api/agent-profiles',
      payload: { name: '' },
    })
    expect(invalid.statusCode).toBe(400)
  })

  it('serves authenticated AgentWolf action tools over Streamable HTTP MCP', async () => {
    const server = await createTestServer()
    const address = await server.app.listen({ host: '127.0.0.1', port: 0 })
    const matchId = MatchIdSchema.parse('match-mcp-001')
    const playerId = PlayerIdSchema.parse('player-1')
    const token = server.matches.mailbox.issueToken(matchId, playerId)
    server.matches.mailbox.expect({ matchId, playerId, actionType: 'vote', voteKind: 'exile' })

    const client = new Client({ name: 'agentwolf-test-client', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL('/mcp', address), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    })
    await client.connect(transport)
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'submit_speech',
      'submit_vote',
      'submit_night_action',
      'submit_sheriff_action',
      'trigger_skill',
    ])
    const result = await client.callTool({
      name: 'submit_vote',
      arguments: { targetPlayerId: 'player-2' },
    })
    expect(result.isError).not.toBe(true)
    expect(server.matches.mailbox.take(matchId, playerId)).toMatchObject({
      type: 'vote',
      targetId: 'player-2',
    })
    server.matches.mailbox.expect({
      matchId,
      playerId,
      actionType: 'speech',
      speechKind: 'day',
    })
    const rejectedSpeech = await client.callTool({
      name: 'submit_speech',
      arguments: { text: '不应由工具提交的发言。' },
    })
    expect(rejectedSpeech.isError).toBe(true)
    expect(rejectedSpeech.content).toContainEqual(
      expect.objectContaining({ text: expect.stringContaining('直接将完整发言正文') }),
    )
    expect(server.matches.mailbox.take(matchId, playerId)).toBeNull()
    await client.close()
  })

  it('creates editable custom boards while keeping presets and match snapshots immutable', async () => {
    const server = await createTestServer()
    const tools = (await server.app.inject({ method: 'GET', url: '/api/agent-tools' })).json()
    const profile = (
      await server.app.inject({
        method: 'POST',
        url: '/api/agent-profiles',
        payload: {
          name: 'Custom-board player',
          toolId: tools[0].id,
          model: 'test-model',
          promptTimeoutMs: 5_000,
          connection: {},
        },
      })
    ).json()
    const createdResponse = await server.app.inject({
      method: 'POST',
      url: '/api/boards',
      payload: {
        name: '六人预女场',
        description: '两狼两民预言家女巫',
        roles: [
          { roleId: 'role-werewolf', count: 2 },
          { roleId: 'role-villager', count: 2 },
          { roleId: 'role-seer', count: 1 },
          { roleId: 'role-witch', count: 1 },
        ],
        sheriff: false,
        victory: 'slaughter-all',
      },
    })
    expect(createdResponse.statusCode).toBe(201)
    const board = createdResponse.json()
    expect(board).toMatchObject({ playerCount: 6, source: 'custom', editable: true, revision: 1 })

    const matchResponse = await server.app.inject({
      method: 'POST',
      url: '/api/matches',
      payload: {
        boardId: board.id,
        roleAssignment: 'random',
        seats: Array.from({ length: 6 }, (_, index) => ({
          seat: index + 1,
          name: `Custom board seat ${index + 1}`,
          profileId: profile.id,
        })),
      },
    })
    expect(matchResponse.statusCode).toBe(201)
    const match = matchResponse.json()
    expect(match.boardName).toBe('六人预女场')

    const updatedResponse = await server.app.inject({
      method: 'PUT',
      url: `/api/boards/${board.id}`,
      payload: {
        name: '六人预女上警场',
        description: '两狼两民预言家女巫',
        roles: board.roles.map(({ roleId, count }: { roleId: string; count: number }) => ({
          roleId,
          count,
        })),
        sheriff: true,
        victory: 'slaughter-edge',
      },
    })
    expect(updatedResponse.json()).toMatchObject({ revision: 2, sheriff: true })
    expect(
      (await server.app.inject({ method: 'DELETE', url: `/api/boards/${board.id}` })).statusCode,
    ).toBe(204)

    const historical = await server.app.inject({
      method: 'GET',
      url: `/api/matches/${match.id}?view=god`,
    })
    expect(historical.json()).toMatchObject({ boardName: '六人预女场', boardId: board.id })
    expect(
      (await server.app.inject({ method: 'DELETE', url: '/api/boards/board-quick-6' })).statusCode,
    ).toBe(400)
  })

  it('records trajectories in normal mode and exposes them only after developer restart', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-developer-mode-'))
    roots.push(root)
    const databasePath = resolve(root, 'agentwolf.sqlite')
    const baseConfig: ServerConfig = {
      host: '127.0.0.1',
      port: 4310,
      dataDirectory: root,
      databasePath,
      publicBaseUrl: 'http://127.0.0.1:4310',
      projectRoot: process.cwd(),
      webDistPath: resolve(root, 'missing'),
      developerMode: false,
    }
    const normal = await buildServer({ config: baseConfig })
    servers.push(normal)
    const tools = (await normal.app.inject({ method: 'GET', url: '/api/agent-tools' })).json()
    const profile = (
      await normal.app.inject({
        method: 'POST',
        url: '/api/agent-profiles',
        payload: {
          name: 'Trajectory player',
          toolId: tools[0].id,
          model: 'test-model',
          promptTimeoutMs: 5_000,
          connection: {},
        },
      })
    ).json()
    const match = (
      await normal.app.inject({
        method: 'POST',
        url: '/api/matches',
        payload: {
          boardId: 'board-quick-6',
          seats: Array.from({ length: 6 }, (_, index) => ({
            seat: index + 1,
            name: `Trajectory seat ${index + 1}`,
            profileId: profile.id,
          })),
        },
      })
    ).json()
    expect(normal.repository.listTrajectoryTurns(match.id, 'system')).not.toHaveLength(0)
    expect(
      (
        await normal.app.inject({
          method: 'GET',
          url: `/api/developer/matches/${match.id}/trajectory/summary`,
        })
      ).statusCode,
    ).toBe(404)
    await normal.close()

    const developer = await buildServer({ config: { ...baseConfig, developerMode: true } })
    servers.push(developer)
    const summary = await developer.app.inject({
      method: 'GET',
      url: `/api/developer/matches/${match.id}/trajectory/summary`,
    })
    expect(summary.statusCode).toBe(200)
    expect(summary.json().owners[0]).toMatchObject({ ownerId: 'system' })
  })
})

async function createTestServer(): Promise<AgentWolfServer> {
  const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-app-'))
  roots.push(root)
  const config: ServerConfig = {
    host: '127.0.0.1',
    port: 4310,
    dataDirectory: root,
    databasePath: ':memory:',
    publicBaseUrl: 'http://127.0.0.1:4310',
    projectRoot: process.cwd(),
    webDistPath: resolve(root, 'missing'),
    developerMode: false,
  }
  const server = await buildServer({ config })
  servers.push(server)
  return server
}
