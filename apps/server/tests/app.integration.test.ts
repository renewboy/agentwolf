import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AbilityIdSchema, MatchIdSchema, PlayerIdSchema } from '@agentwolf/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildServer, type AgentWolfServer } from '../src/app.js'
import { AgentProbeService } from '../src/agent-probe.js'
import type { ServerConfig } from '../src/config.js'
import { PostgameReviewConflictError } from '../src/postgame-review-repository.js'

const roots: string[] = []
const servers: AgentWolfServer[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.allSettled(servers.splice(0).map((server) => server.close()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Fastify API', () => {
  it('routes every catalog, match lifecycle, and error response surface', async () => {
    const probeResult = {
      ok: true,
      models: ['route-model'],
      reasoningEfforts: [],
      modes: [],
      message: 'connection-ok',
      durationMs: 1,
    }
    vi.spyOn(AgentProbeService.prototype, 'discoverTool').mockResolvedValue(probeResult)
    vi.spyOn(AgentProbeService.prototype, 'probe').mockResolvedValue(probeResult)
    const server = await createTestServer()

    expect((await server.app.inject({ method: 'GET', url: '/api/runtime-config' })).json()).toEqual(
      { developerMode: false },
    )

    const toolInput = {
      name: 'Route tool',
      kind: 'custom',
      command: process.execPath,
      args: ['--version'],
      environment: {},
      initialMode: 'read-only',
      modelConfigKey: 'model',
    }
    const createdTool = (
      await server.app.inject({ method: 'POST', url: '/api/agent-tools', payload: toolInput })
    ).json()
    expect(
      (
        await server.app.inject({
          method: 'PUT',
          url: `/api/agent-tools/${createdTool.id}`,
          payload: { ...toolInput, name: 'Updated route tool' },
        })
      ).json(),
    ).toMatchObject({ name: 'Updated route tool' })
    expect(
      (
        await server.app.inject({
          method: 'POST',
          url: `/api/agent-tools/${createdTool.id}/discover`,
          payload: { model: 'route-model' },
        })
      ).json(),
    ).toMatchObject({ ok: true })

    const profile = (
      await server.app.inject({
        method: 'POST',
        url: '/api/agent-profiles',
        payload: {
          name: 'Route profile',
          toolId: createdTool.id,
          model: 'route-model',
          promptTimeoutMs: 5_000,
          connection: {},
        },
      })
    ).json()
    expect(
      (
        await server.app.inject({
          method: 'POST',
          url: `/api/agent-profiles/${profile.id}/probe`,
        })
      ).json(),
    ).toMatchObject({ ok: true })
    expect(
      (
        await server.app.inject({
          method: 'DELETE',
          url: `/api/agent-tools/${createdTool.id}`,
        })
      ).statusCode,
    ).toBe(500)
    expect(
      (
        await server.app.inject({
          method: 'DELETE',
          url: `/api/agent-profiles/${profile.id}`,
        })
      ).statusCode,
    ).toBe(204)
    expect(
      (await server.app.inject({ method: 'DELETE', url: `/api/agent-tools/${createdTool.id}` }))
        .statusCode,
    ).toBe(204)

    const characters = (await server.app.inject({ method: 'GET', url: '/api/characters' })).json()
    const copied = (
      await server.app.inject({
        method: 'POST',
        url: `/api/characters/${characters[0].id}/copy`,
      })
    ).json()
    const characterInput = {
      name: 'Route character',
      universe: copied.universe,
      summary: copied.summary,
      personality: copied.personality,
      socialStyle: copied.socialStyle,
      reasoningPresentation: copied.reasoningPresentation,
      speechStyle: copied.speechStyle,
      boundaries: copied.boundaries,
      portraitAssetId: copied.portraitAssetId,
    }
    expect(
      (
        await server.app.inject({
          method: 'PUT',
          url: `/api/characters/${copied.id}`,
          payload: characterInput,
        })
      ).json(),
    ).toMatchObject({ name: 'Route character' })
    expect(
      (await server.app.inject({ method: 'DELETE', url: `/api/characters/${copied.id}` }))
        .statusCode,
    ).toBe(204)
    expect(
      (
        await server.app.inject({
          method: 'GET',
          url: '/api/character-assets/portrait-missing-route',
        })
      ).statusCode,
    ).toBe(404)
    const roleCatalog = (await server.app.inject({ method: 'GET', url: '/api/roles' })).json()
    expect(roleCatalog.length).toBeGreaterThan(0)
    expect(roleCatalog).toContainEqual({
      id: 'role-cupid',
      name: '丘比特',
      faction: 'independent',
      kind: 'independent',
    })

    const matchId = MatchIdSchema.parse('match-route-coverage')
    vi.spyOn(server.matches, 'beginMatch').mockReturnValue({ id: matchId } as never)
    vi.spyOn(server.matches, 'resumeMatch').mockResolvedValue({ id: matchId } as never)
    vi.spyOn(server.matches, 'startPostgameReview').mockReturnValue({ id: matchId } as never)
    vi.spyOn(server.matches, 'skipPostgameReview').mockResolvedValue({ id: matchId } as never)
    vi.spyOn(server.matches, 'resumePostgameReview').mockReturnValue({ id: matchId } as never)
    vi.spyOn(server.matches, 'deleteMatch').mockResolvedValue()
    vi.spyOn(server.matches, 'getMatch').mockImplementation(
      (_id, view) => ({ id: matchId, view }) as never,
    )
    for (const [path, statusCode] of [
      ['start', 202],
      ['resume', 202],
      ['postgame-review/start', 202],
      ['postgame-review/skip', 202],
      ['postgame-review/resume', 202],
    ] as const) {
      expect(
        (
          await server.app.inject({
            method: 'POST',
            url: `/api/matches/${matchId}/${path}`,
          })
        ).statusCode,
      ).toBe(statusCode)
    }
    expect(
      (
        await server.app.inject({
          method: 'GET',
          url: `/api/matches/${matchId}?view=player&playerId=player-1`,
        })
      ).json().view,
    ).toEqual({ kind: 'player', playerId: 'player-1' })
    expect(
      (await server.app.inject({ method: 'GET', url: `/api/matches/${matchId}?view=god` })).json()
        .view,
    ).toEqual({ kind: 'god' })
    expect(
      (
        await server.app.inject({ method: 'GET', url: `/api/matches/${matchId}?view=invalid` })
      ).json().view,
    ).toEqual({ kind: 'closed-eye' })
    expect(
      (await server.app.inject({ method: 'DELETE', url: `/api/matches/${matchId}` })).statusCode,
    ).toBe(204)

    vi.spyOn(server.matches, 'startPostgameReview').mockImplementation(() => {
      throw new PostgameReviewConflictError('already running')
    })
    expect(
      (
        await server.app.inject({
          method: 'POST',
          url: `/api/matches/${matchId}/postgame-review/start`,
        })
      ).json(),
    ).toMatchObject({ error: 'postgame-review-conflict' })
  })

  it('rejects invalid Match ownership, seat, profile, and lifecycle transitions', async () => {
    const server = await createTestServer()
    const seats = Array.from({ length: 6 }, (_, index) => ({
      seat: index + 1,
      name: `Guarded seat ${index + 1}`,
    }))
    expect(() => server.matches.createMatch({ boardId: 'board-quick-6', seats } as never)).toThrow(
      /requires at least one Agent Profile/,
    )

    const profile = server.catalog.createProfile({
      name: 'Match guard profile',
      toolId: server.catalog.listTools()[0]!.id,
      model: 'guard-model',
      promptTimeoutMs: 5_000,
      connection: {},
    })
    expect(() =>
      server.matches.createMatch({ boardId: 'board-standard-9', seats } as never),
    ).toThrow(/requires 9 seats/)
    expect(() =>
      server.matches.createMatch({
        boardId: 'board-quick-6',
        seats: seats.map((seat, index) => (index === 5 ? { ...seat, seat: 7 } : seat)),
      } as never),
    ).toThrow(/numbered consecutively/)
    expect(() =>
      server.matches.createMatch({
        boardId: 'board-quick-6',
        seats: seats.map((seat, index) =>
          index === 0 ? { ...seat, profileId: 'profile-missing-match' } : seat,
        ),
      } as never),
    ).toThrow(/Unknown Agent Profile/)
    expect(() =>
      server.matches.createMatch({
        boardId: 'board-quick-6',
        seats: seats.map((seat) => ({ ...seat, name: 'Duplicated', profileId: profile.id })),
      } as never),
    ).toThrow(/names must be unique/)

    const missing = MatchIdSchema.parse('match-missing-lifecycle')
    expect(() => server.matches.beginMatch(missing)).toThrow(/cannot start/)
    await expect(server.matches.resumeMatch(missing)).rejects.toThrow(/Unknown match/)
    await expect(server.matches.deleteMatch(missing)).rejects.toThrow(/Unknown match/)
  })

  it('routes developer trajectory and simulation requests with paging validation', async () => {
    const server = await createTestServer(true)
    const matchId = MatchIdSchema.parse('match-developer-routes')
    const simulationId = 'simulation-route-coverage'
    vi.spyOn(server.trajectories, 'summary').mockReturnValue({ owners: [] } as never)
    vi.spyOn(server.trajectories, 'page').mockReturnValue({ records: [] } as never)
    vi.spyOn(server.trajectories, 'playerDebug').mockReturnValue({ playerId: 'player-1' } as never)
    const capture = vi
      .spyOn(server.simulations, 'capture')
      .mockResolvedValue({ simulationId } as never)
    vi.spyOn(server.simulations, 'addCandidate').mockResolvedValue({ simulationId } as never)
    vi.spyOn(server.simulations, 'review').mockReturnValue({ simulationId } as never)
    vi.spyOn(server.simulations, 'approve').mockReturnValue({ simulationId } as never)

    expect(
      (
        await server.app.inject({
          method: 'GET',
          url: `/api/developer/matches/${matchId}/trajectory/summary`,
        })
      ).statusCode,
    ).toBe(200)
    for (const query of ['', '?ownerId=system&beforeTurn=4&limit=3']) {
      expect(
        (
          await server.app.inject({
            method: 'GET',
            url: `/api/developer/matches/${matchId}/trajectory${query}`,
          })
        ).statusCode,
      ).toBe(200)
    }
    expect(
      (
        await server.app.inject({
          method: 'GET',
          url: `/api/developer/matches/${matchId}/trajectory?limit=-1`,
        })
      ).statusCode,
    ).toBe(500)
    expect(
      (
        await server.app.inject({
          method: 'GET',
          url: `/api/developer/matches/${matchId}/trajectory/players/player-1`,
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await server.app.inject({
          method: 'GET',
          url: `/api/developer/matches/${matchId}/trajectory/audit`,
        })
      ).statusCode,
    ).toBe(500)
    for (const [method, path, payload, statusCode] of [
      ['GET', `matches/${matchId}/simulation/export`, undefined, 200],
      ['POST', `matches/${matchId}/simulation/candidates`, undefined, 201],
      ['POST', `matches/${matchId}/simulation/review`, undefined, 200],
      ['POST', `simulations/${simulationId}/approve`, {}, 200],
    ] as const) {
      expect(
        (
          await server.app.inject({
            method,
            url: `/api/developer/${path}`,
            ...(payload ? { payload } : {}),
          })
        ).statusCode,
      ).toBe(statusCode)
    }

    capture.mockRejectedValueOnce(
      Object.assign(new Error('source unavailable'), { name: 'SimulationSourceError' }),
    )
    expect(
      (
        await server.app.inject({
          method: 'GET',
          url: `/api/developer/matches/${matchId}/simulation/export`,
        })
      ).json(),
    ).toMatchObject({ error: 'simulation-source-unavailable' })
  })

  it('serves a built web client and closes idempotently', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-static-web-'))
    roots.push(root)
    const webDistPath = resolve(root, 'web')
    await mkdir(webDistPath, { recursive: true })
    await writeFile(resolve(webDistPath, 'index.html'), '<main>AgentWolf route fallback</main>')
    const server = await buildServer({
      config: testConfig(root, false, webDistPath),
      logger: false,
    })
    servers.push(server)
    const response = await server.app.inject({ method: 'GET', url: '/unmatched-client-route' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('AgentWolf route fallback')
    await server.close()
    await server.close()
  })

  it('supports profile, board, and draft-match HTTP workflows', async () => {
    const server = await createTestServer()
    const health = await server.app.inject({ method: 'GET', url: '/api/health' })
    expect(health.json()).toEqual({ ok: true })
    const tools = (await server.app.inject({ method: 'GET', url: '/api/agent-tools' })).json()
    expect(tools).toHaveLength(4)
    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'tool-codebuddy',
          name: 'CodeBuddy',
          kind: 'codebuddy',
          builtIn: true,
        }),
      ]),
    )
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
    const secondProfileResponse = await server.app.inject({
      method: 'POST',
      url: '/api/agent-profiles',
      payload: {
        name: 'HTTP second player',
        toolId: tools[0].id,
        model: 'test-model-2',
        promptTimeoutMs: 5_000,
        connection: {},
      },
    })
    expect(secondProfileResponse.statusCode).toBe(201)
    const secondProfile = secondProfileResponse.json()
    const reorderedProfiles = await server.app.inject({
      method: 'PUT',
      url: '/api/agent-profiles/order',
      payload: { profileIds: [secondProfile.id, profile.id] },
    })
    expect(reorderedProfiles.statusCode).toBe(200)
    expect(reorderedProfiles.json().map(({ id }: { id: string }) => id)).toEqual([
      secondProfile.id,
      profile.id,
    ])
    const incompleteOrder = await server.app.inject({
      method: 'PUT',
      url: '/api/agent-profiles/order',
      payload: { profileIds: [profile.id] },
    })
    expect(incompleteOrder.statusCode).toBe(400)
    const updatedProfile = await server.app.inject({
      method: 'PUT',
      url: `/api/agent-profiles/${profile.id}`,
      payload: {
        name: 'HTTP player updated',
        toolId: tools[0].id,
        model: 'test-model',
        promptTimeoutMs: 5_000,
        connection: {},
      },
    })
    expect(updatedProfile.statusCode).toBe(200)
    expect(
      (await server.app.inject({ method: 'GET', url: '/api/agent-profiles' }))
        .json()
        .map(({ id }: { id: string }) => id),
    ).toEqual([secondProfile.id, profile.id])
    const boards = (await server.app.inject({ method: 'GET', url: '/api/boards' })).json()
    expect(boards.map((board: { id: string }) => board.id)).toEqual([
      'board-quick-6',
      'board-standard-9',
      'board-standard-12',
      'board-guard-12',
      'board-cupid-12',
      'board-mirror-hidden-10',
      'board-white-wolf-king-12',
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
    const token = server.matches.mailbox.issueToken(matchId, playerId, [
      {
        abilityId: AbilityIdSchema.parse('ability-guard-protect'),
        label: '守护',
        description: '每夜守护一名存活玩家，也可以空守。',
        actionTypes: ['night-action'],
      },
      {
        abilityId: AbilityIdSchema.parse('ability-seer-inspect'),
        label: '查验阵营',
        description: '每夜查验一名其他存活玩家的阵营。',
        actionTypes: ['night-action'],
      },
      {
        abilityId: AbilityIdSchema.parse('ability-hunter-shot'),
        label: '开枪',
        description: '出局时带走一名其他存活玩家，也可以放弃。',
        actionTypes: ['skill-trigger'],
      },
    ])
    expect((await server.app.inject({ method: 'GET', url: '/mcp' })).statusCode).toBe(401)
    expect(
      (
        await server.app.inject({
          method: 'GET',
          url: '/mcp',
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(405)
    const client = new Client({ name: 'agentwolf-test-client', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL('/mcp', address), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    })
    await client.connect(transport as never)
    const initialTools = await client.listTools()
    const initialNightSchema = JSON.stringify(
      initialTools.tools.find((tool) => tool.name === 'submit_night_action')?.inputSchema,
    )
    const initialTriggerSchema = JSON.stringify(
      initialTools.tools.find((tool) => tool.name === 'trigger_skill')?.inputSchema,
    )
    expect(initialNightSchema).toContain('"const":"ability-guard-protect"')
    expect(initialNightSchema).toContain('守护：每夜守护一名存活玩家，也可以空守。')
    expect(initialNightSchema).toContain('"const":"ability-seer-inspect"')
    expect(initialNightSchema).toContain('查验阵营：每夜查验一名其他存活玩家的阵营。')
    expect(initialTriggerSchema).toContain('"const":"ability-hunter-shot"')
    expect(initialTriggerSchema).toContain('开枪：出局时带走一名其他存活玩家，也可以放弃。')
    server.matches.mailbox.expect({
      matchId,
      playerId,
      actionType: 'night-action',
      allowedAbilityIds: [AbilityIdSchema.parse('ability-witch-poison')],
      abilityContracts: [
        {
          abilityId: AbilityIdSchema.parse('ability-witch-poison'),
          label: '毒药',
          description: '使一名你以外的其他存活玩家死亡；毒药整局只能使用一次。',
        },
      ],
      validate: (action) => {
        if (action.type === 'night-action' && action.option !== 'pass') {
          throw new Error('Poison has already been used')
        }
      },
    })
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'submit_speech',
      'submit_vote',
      'submit_night_action',
      'submit_sheriff_action',
      'trigger_skill',
      'pass_skill',
      'submit_postgame_review',
    ])
    const voteTool = tools.tools.find((tool) => tool.name === 'submit_vote')
    const nightTool = tools.tools.find((tool) => tool.name === 'submit_night_action')
    const sheriffTool = tools.tools.find((tool) => tool.name === 'submit_sheriff_action')
    const triggerSkillTool = tools.tools.find((tool) => tool.name === 'trigger_skill')
    const passSkillTool = tools.tools.find((tool) => tool.name === 'pass_skill')
    const postgameTool = tools.tools.find((tool) => tool.name === 'submit_postgame_review')
    if (!nightTool || !sheriffTool || !triggerSkillTool || !passSkillTool || !postgameTool) {
      throw new Error('Missing AgentWolf MCP tools')
    }
    expect(voteTool?.description).toContain('狼人袭击阶段表示空刀')
    expect(JSON.stringify(voteTool?.inputSchema)).toContain('狼人袭击阶段的 null 表示空刀')
    expect(JSON.stringify(nightTool.inputSchema)).toContain('"const":"ability-witch-poison"')
    expect(JSON.stringify(nightTool.inputSchema)).toContain(
      '毒药：使一名你以外的其他存活玩家死亡；毒药整局只能使用一次。',
    )
    expect(JSON.stringify(nightTool.inputSchema)).toContain('确切数量')
    expect(JSON.stringify(sheriffTool.inputSchema)).toContain('仅 transfer 需要')
    expect(triggerSkillTool.inputSchema).toMatchObject({
      required: expect.arrayContaining(['abilityId']),
    })
    expect((triggerSkillTool.inputSchema as { required?: string[] }).required).not.toContain(
      'targetPlayerId',
    )
    expect(JSON.stringify(triggerSkillTool.inputSchema)).not.toContain('"use"')
    expect(passSkillTool.inputSchema).toMatchObject({ properties: {} })
    expect(JSON.stringify(postgameTool.inputSchema)).toContain('每名玩家恰好一条评分')
    const rejectedPoison = await client.callTool({
      name: 'submit_night_action',
      arguments: {
        abilityId: 'ability-witch-poison',
        targetPlayerIds: ['player-2'],
      },
    })
    expect(rejectedPoison.isError).toBe(true)
    expect(rejectedPoison.content).toContainEqual(
      expect.objectContaining({ text: expect.stringContaining('Poison has already been used') }),
    )
    const correctedPass = await client.callTool({
      name: 'submit_night_action',
      arguments: {
        abilityId: 'ability-witch-poison',
        targetPlayerIds: [],
        option: 'pass',
      },
    })
    expect(correctedPass.isError).not.toBe(true)
    expect(server.matches.mailbox.take(matchId, playerId)).toMatchObject({
      type: 'night-action',
      option: 'pass',
    })

    server.matches.mailbox.expect({ matchId, playerId, actionType: 'vote', voteKind: 'exile' })
    const result = await client.callTool({
      name: 'submit_vote',
      arguments: { targetPlayerId: 'player-2' },
    })
    expect(result.isError).not.toBe(true)
    expect(result.content).toContainEqual(
      expect.objectContaining({
        text: '动作已登记。立即结束本回合，不要再发言或输出任何文字。',
      }),
    )
    expect(server.matches.mailbox.take(matchId, playerId)).toMatchObject({
      type: 'vote',
      targetId: 'player-2',
    })
    server.matches.mailbox.expect({ matchId, playerId, actionType: 'vote', voteKind: 'wolf-kill' })
    const noKill = await client.callTool({
      name: 'submit_vote',
      arguments: { targetPlayerId: null },
    })
    expect(noKill.isError).not.toBe(true)
    expect(server.matches.mailbox.take(matchId, playerId)).toMatchObject({
      type: 'vote',
      kind: 'wolf-kill',
      targetId: null,
    })

    server.matches.mailbox.expect({
      matchId,
      playerId,
      actionType: 'sheriff-action',
      allowedSheriffActions: ['transfer'],
    })
    const sheriffTools = await client.listTools()
    expect(
      JSON.stringify(
        sheriffTools.tools.find((tool) => tool.name === 'submit_sheriff_action')?.inputSchema,
      ),
    ).toContain('"const":"transfer"')
    const badgeTransfer = await client.callTool({
      name: 'submit_sheriff_action',
      arguments: { action: 'transfer', targetPlayerId: 'player-2' },
    })
    expect(badgeTransfer.isError).not.toBe(true)
    expect(server.matches.mailbox.take(matchId, playerId)).toMatchObject({
      type: 'sheriff-action',
      action: 'transfer',
      targetId: 'player-2',
    })

    server.matches.mailbox.expect({
      matchId,
      playerId,
      actionType: 'skill-trigger',
      allowedAbilityIds: [AbilityIdSchema.parse('ability-hunter-shot')],
    })
    const triggerTools = await client.listTools()
    expect(
      JSON.stringify(triggerTools.tools.find((tool) => tool.name === 'trigger_skill')?.inputSchema),
    ).toContain('"const":"ability-hunter-shot"')
    const triggered = await client.callTool({
      name: 'trigger_skill',
      arguments: {
        abilityId: 'ability-hunter-shot',
        targetPlayerId: 'player-2',
      },
    })
    expect(triggered.isError).not.toBe(true)
    expect(server.matches.mailbox.take(matchId, playerId)).toMatchObject({
      type: 'skill-trigger',
      abilityId: 'ability-hunter-shot',
      targetId: 'player-2',
    })

    server.matches.mailbox.expect({
      matchId,
      playerId,
      actionType: 'skill-trigger',
      allowedAbilityIds: [AbilityIdSchema.parse('ability-werewolf-self-destruct')],
    })
    const noTargetTrigger = await client.callTool({
      name: 'trigger_skill',
      arguments: { abilityId: 'ability-werewolf-self-destruct' },
    })
    expect(noTargetTrigger.isError).not.toBe(true)
    expect(server.matches.mailbox.take(matchId, playerId)).toMatchObject({
      type: 'skill-trigger',
      abilityId: 'ability-werewolf-self-destruct',
      targetId: null,
    })

    server.matches.mailbox.expect({
      matchId,
      playerId,
      actionType: 'skill-trigger',
      allowedAbilityIds: [AbilityIdSchema.parse('ability-hunter-shot')],
    })
    const rejectedDecline = await client.callTool({ name: 'pass_skill', arguments: {} })
    expect(rejectedDecline.isError).toBe(true)
    server.matches.mailbox.expect({
      matchId,
      playerId,
      actionType: 'skill-trigger',
      allowedAbilityIds: [AbilityIdSchema.parse('ability-hunter-shot')],
      passAllowed: true,
    })
    const declinedTrigger = await client.callTool({
      name: 'pass_skill',
      arguments: {},
    })
    expect(declinedTrigger.isError).not.toBe(true)
    expect(server.matches.mailbox.take(matchId, playerId)).toMatchObject({
      type: 'skill-trigger',
      abilityId: 'ability-hunter-shot',
      targetId: null,
      option: 'pass',
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

    const emptyToken = server.matches.mailbox.issueToken(matchId, PlayerIdSchema.parse('player-2'))
    const emptyClient = new Client({ name: 'agentwolf-empty-schema-client', version: '1.0.0' })
    await emptyClient.connect(
      new StreamableHTTPClientTransport(new URL('/mcp', address), {
        requestInit: { headers: { Authorization: `Bearer ${emptyToken}` } },
      }) as never,
    )
    const emptyTools = await emptyClient.listTools()
    expect(
      emptyTools.tools.find((tool) => tool.name === 'submit_night_action')?.inputSchema,
    ).toMatchObject({ properties: { abilityId: { type: 'string' } } })
    await emptyClient.close()
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
    const boardProfile = (
      await server.app.inject({
        method: 'POST',
        url: '/api/agent-profiles',
        payload: {
          name: 'Board-default player',
          toolId: tools[0].id,
          model: 'board-model',
          reasoningEffort: 'high',
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
        agentProfiles: Array.from({ length: 6 }, (_, index) => ({
          seat: index + 1,
          profileId: index < 2 ? boardProfile.id : null,
        })),
        sheriff: false,
        victory: 'slaughter-all',
      },
    })
    expect(createdResponse.statusCode).toBe(201)
    const board = createdResponse.json()
    expect(board).toMatchObject({
      playerCount: 6,
      source: 'custom',
      editable: true,
      revision: 1,
      agentProfiles: expect.arrayContaining([
        { seat: 1, profileId: boardProfile.id },
        { seat: 2, profileId: boardProfile.id },
        { seat: 3, profileId: null },
      ]),
    })
    const duplicateHiddenWolf = await server.app.inject({
      method: 'POST',
      url: '/api/boards',
      payload: {
        name: '非法双觉醒隐狼板子',
        description: '',
        roles: [
          { roleId: 'role-awakened-hidden-wolf', count: 2 },
          { roleId: 'role-werewolf', count: 1 },
          { roleId: 'role-villager', count: 2 },
          { roleId: 'role-guard', count: 1 },
        ],
        sheriff: false,
        victory: 'slaughter-edge',
      },
    })
    expect(duplicateHiddenWolf.statusCode).toBe(400)
    expect(duplicateHiddenWolf.json().message).toContain(
      'role-awakened-hidden-wolf allows at most 1',
    )
    const duplicateCupid = await server.app.inject({
      method: 'POST',
      url: '/api/boards',
      payload: {
        name: '非法双丘比特板子',
        description: '',
        roles: [
          { roleId: 'role-cupid', count: 2 },
          { roleId: 'role-werewolf', count: 1 },
          { roleId: 'role-villager', count: 2 },
          { roleId: 'role-seer', count: 1 },
        ],
        sheriff: false,
        victory: 'slaughter-edge',
      },
    })
    expect(duplicateCupid.statusCode).toBe(400)
    expect(duplicateCupid.json().message).toContain('role-cupid allows at most 1')
    const unknownAgentDefault = await server.app.inject({
      method: 'POST',
      url: '/api/boards',
      payload: {
        name: '非法 Agent 默认板子',
        description: '',
        roles: [
          { roleId: 'role-werewolf', count: 2 },
          { roleId: 'role-villager', count: 3 },
          { roleId: 'role-seer', count: 1 },
        ],
        agentProfiles: Array.from({ length: 6 }, (_, index) => ({
          seat: index + 1,
          profileId: index === 0 ? 'profile-missing-default' : null,
        })),
        sheriff: false,
        victory: 'slaughter-all',
      },
    })
    expect(unknownAgentDefault.statusCode).toBe(400)
    expect(unknownAgentDefault.json().message).toContain(
      'Unknown Agent Profile profile-missing-default',
    )

    const matchResponse = await server.app.inject({
      method: 'POST',
      url: '/api/matches',
      payload: {
        boardId: board.id,
        roleAssignment: 'random',
        seats: Array.from({ length: 6 }, (_, index) => ({
          seat: index + 1,
          name: `Custom board seat ${index + 1}`,
          ...(index === 1 ? { profileId: profile.id } : {}),
        })),
      },
    })
    expect(matchResponse.statusCode).toBe(201)
    const match = matchResponse.json()
    expect(match.boardName).toBe('六人预女场')
    expect(match.seats[0]?.agent).toEqual({
      name: 'Trae',
      model: 'board-model',
      reasoningEffort: 'high',
    })
    expect(
      server.repository.getMatch(match.id)?.setup.seats.map(({ profileId }) => profileId),
    ).toEqual([boardProfile.id, profile.id, profile.id, profile.id, profile.id, profile.id])
    const snapshot = server.repository.getMatch(match.id)?.boardSnapshot
    expect(snapshot).toMatchObject({
      schemaVersion: 2,
      rulesetId: 'classic-v5',
      ruleset: { id: 'ruleset-classic-v5', version: 5 },
      policies: { victory: 'slaughter-all' },
      agentProfiles: expect.arrayContaining([
        { seat: 1, profileId: boardProfile.id },
        { seat: 3, profileId: null },
      ]),
    })
    if (!snapshot || snapshot.schemaVersion !== 2) throw new Error('Expected ruleset lock snapshot')
    expect(() =>
      server.boards.resolveSnapshot({
        ...snapshot,
        ruleset: { ...snapshot.ruleset, fingerprint: '0'.repeat(64) },
      }),
    ).toThrow(/fingerprint mismatch/)
    const protectedProfile = await server.app.inject({
      method: 'DELETE',
      url: `/api/agent-profiles/${boardProfile.id}`,
    })
    expect(protectedProfile.statusCode).toBe(400)
    expect(protectedProfile.json().message).toContain(`used by board ${board.name}`)

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
    const deletedProfile = await server.app.inject({
      method: 'DELETE',
      url: `/api/agent-profiles/${boardProfile.id}`,
    })
    expect(deletedProfile.statusCode).toBe(204)
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
    expect(() => server.boards.update('board-quick-6' as never, {} as never)).toThrow(/read-only/)
    expect(() => server.boards.update('board-missing-update' as never, {} as never)).toThrow(
      /Unknown board/,
    )
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
      publicSpeechInterruptMode: 'legacy',
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

async function createTestServer(developerMode = false): Promise<AgentWolfServer> {
  const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-app-'))
  roots.push(root)
  const server = await buildServer({ config: testConfig(root, developerMode) })
  servers.push(server)
  return server
}

function testConfig(
  root: string,
  developerMode: boolean,
  webDistPath = resolve(root, 'missing'),
): ServerConfig {
  return {
    host: '127.0.0.1',
    port: 4310,
    dataDirectory: root,
    databasePath: ':memory:',
    publicBaseUrl: 'http://127.0.0.1:4310',
    projectRoot: process.cwd(),
    webDistPath,
    developerMode,
    publicSpeechInterruptMode: 'legacy',
  }
}
