import { beforeEach, describe, expect, it, vi } from 'vitest'

const schema = vi.hoisted(() => ({
  parse: vi.fn((value: unknown) => value),
  safeParse: vi.fn((value: unknown) => ({ success: true, data: value })),
  array: vi.fn(() => ({ parse: vi.fn((value: unknown) => value) })),
}))

vi.mock('@agentwolf/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agentwolf/contracts')>()),
  AgentDiscoveryInputSchema: schema,
  AgentProbeResultSchema: schema,
  AgentProfileOrderInputSchema: schema,
  AgentProfileSchema: schema,
  AgentToolSchema: schema,
  BoardSummarySchema: schema,
  CharacterCardInputSchema: schema,
  CharacterCardSchema: schema,
  CharacterPortraitAssetSchema: schema,
  CustomBoardInputSchema: schema,
  GlobalSettingsSchema: schema,
  MatchViewSchema: schema,
  RoleSummarySchema: schema,
  RuntimeConfigSchema: schema,
  SimulationApprovalResultSchema: schema,
  SimulationReviewResultSchema: schema,
  TrajectoryAuditReportSchema: schema,
  TrajectoryPageSchema: schema,
  TrajectoryPlayerDebugSchema: schema,
  TrajectorySummarySchema: schema,
}))

import { api } from '../src/api.js'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(Response.json({ id: 'result' }))
  vi.stubGlobal('fetch', fetchMock)
})

describe('Web API transport', () => {
  it.each([
    ['runtimeConfig', () => api.runtimeConfig(), '/api/runtime-config', 'GET', undefined],
    ['globalSettings', () => api.globalSettings(), '/api/settings', 'GET', undefined],
    [
      'updateGlobalSettings',
      () => api.updateGlobalSettings({ speechCharacterLimit: 360 }),
      '/api/settings',
      'PUT',
      { speechCharacterLimit: 360 },
    ],
    ['listTools', () => api.listTools(), '/api/agent-tools', 'GET', undefined],
    [
      'createTool',
      () =>
        api.createTool({
          name: 'Tool',
          kind: 'custom',
          command: 'node',
          args: [],
          environment: {},
          initialMode: 'read-only',
          modelConfigKey: 'model',
        }),
      '/api/agent-tools',
      'POST',
      expect.any(Object),
    ],
    [
      'updateTool',
      () =>
        api.updateTool('tool-1' as never, {
          name: 'Tool',
          kind: 'custom',
          command: 'node',
          args: [],
          environment: {},
          initialMode: 'read-only',
          modelConfigKey: 'model',
        }),
      '/api/agent-tools/tool-1',
      'PUT',
      expect.any(Object),
    ],
    ['deleteTool', () => api.deleteTool('tool-1' as never), '/api/agent-tools/tool-1', 'DELETE'],
    [
      'discoverTool',
      () => api.discoverTool('tool-1' as never),
      '/api/agent-tools/tool-1/discover',
      'POST',
      {},
    ],
    ['listProfiles', () => api.listProfiles(), '/api/agent-profiles', 'GET'],
    [
      'createProfile',
      () =>
        api.createProfile({
          name: 'Profile',
          toolId: 'tool-1' as never,
          model: 'model',
          promptTimeoutMs: 5_000,
          connection: {},
        }),
      '/api/agent-profiles',
      'POST',
      expect.any(Object),
    ],
    [
      'updateProfile',
      () =>
        api.updateProfile('profile-1' as never, {
          name: 'Profile',
          toolId: 'tool-1' as never,
          model: 'model',
          promptTimeoutMs: 5_000,
          connection: {},
        }),
      '/api/agent-profiles/profile-1',
      'PUT',
      expect.any(Object),
    ],
    [
      'reorderProfiles',
      () => api.reorderProfiles({ profileIds: ['profile-1' as never] }),
      '/api/agent-profiles/order',
      'PUT',
      { profileIds: ['profile-1'] },
    ],
    [
      'deleteProfile',
      () => api.deleteProfile('profile-1' as never),
      '/api/agent-profiles/profile-1',
      'DELETE',
    ],
    [
      'probeProfile',
      () => api.probeProfile('profile-1' as never),
      '/api/agent-profiles/profile-1/probe',
      'POST',
    ],
    ['listBoards', () => api.listBoards(), '/api/boards', 'GET'],
    ['listCharacters', () => api.listCharacters(), '/api/characters', 'GET'],
    [
      'createCharacter',
      () => api.createCharacter({ name: 'Character' } as never),
      '/api/characters',
      'POST',
      expect.any(Object),
    ],
    [
      'copyCharacter',
      () => api.copyCharacter('character-1' as never),
      '/api/characters/character-1/copy',
      'POST',
    ],
    [
      'updateCharacter',
      () => api.updateCharacter('character-1' as never, { name: 'Character' } as never),
      '/api/characters/character-1',
      'PUT',
      expect.any(Object),
    ],
    [
      'deleteCharacter',
      () => api.deleteCharacter('character-1' as never),
      '/api/characters/character-1',
      'DELETE',
    ],
    [
      'uploadCharacterPortrait',
      () => api.uploadCharacterPortrait({ dataUrl: 'data:image/webp;base64,YWJj' }),
      '/api/character-assets',
      'POST',
      { dataUrl: 'data:image/webp;base64,YWJj' },
    ],
    ['listRoles', () => api.listRoles(), '/api/roles', 'GET'],
    [
      'createBoard',
      () => api.createBoard({ name: 'Board' } as never),
      '/api/boards',
      'POST',
      expect.any(Object),
    ],
    [
      'updateBoard',
      () => api.updateBoard('board-1' as never, { name: 'Board' } as never),
      '/api/boards/board-1',
      'PUT',
      expect.any(Object),
    ],
    ['deleteBoard', () => api.deleteBoard('board-1' as never), '/api/boards/board-1', 'DELETE'],
    [
      'trajectorySummary',
      () => api.trajectorySummary('match-1' as never),
      '/api/developer/matches/match-1/trajectory/summary',
      'GET',
    ],
    [
      'trajectoryAudit',
      () => api.trajectoryAudit('match-1' as never),
      '/api/developer/matches/match-1/trajectory/audit',
      'GET',
    ],
    [
      'trajectoryPlayerDebug',
      () => api.trajectoryPlayerDebug('match-1' as never, 'player-1' as never),
      '/api/developer/matches/match-1/trajectory/players/player-1',
      'GET',
    ],
    [
      'trajectoryPage',
      () => api.trajectoryPage('match-1' as never, 'player-1' as never, 4),
      '/api/developer/matches/match-1/trajectory?ownerId=player-1&beforeTurn=4',
      'GET',
    ],
    [
      'trajectoryPage without cursor',
      () => api.trajectoryPage('match-1' as never, 'player-1' as never),
      '/api/developer/matches/match-1/trajectory?ownerId=player-1',
      'GET',
    ],
    [
      'reviewSimulation',
      () => api.reviewSimulation('match-1' as never),
      '/api/developer/matches/match-1/simulation/review',
      'POST',
    ],
    [
      'approveSimulation',
      () =>
        api.approveSimulation('simulation-1' as never, {
          acceptCurrent: false,
          acknowledgeWarnings: true,
        }),
      '/api/developer/simulations/simulation-1/approve',
      'POST',
      { acceptCurrent: false, acknowledgeWarnings: true },
    ],
    ['listMatches', () => api.listMatches(), '/api/matches', 'GET'],
    [
      'createMatch',
      () => api.createMatch({ boardId: 'board-1' } as never),
      '/api/matches',
      'POST',
      { boardId: 'board-1' },
    ],
    ['startMatch', () => api.startMatch('match-1' as never), '/api/matches/match-1/start', 'POST'],
    [
      'resumeMatch',
      () => api.resumeMatch('match-1' as never),
      '/api/matches/match-1/resume',
      'POST',
    ],
    [
      'startPostgameReview',
      () => api.startPostgameReview('match-1' as never),
      '/api/matches/match-1/postgame-review/start',
      'POST',
    ],
    [
      'skipPostgameReview',
      () => api.skipPostgameReview('match-1' as never),
      '/api/matches/match-1/postgame-review/skip',
      'POST',
    ],
    [
      'resumePostgameReview',
      () => api.resumePostgameReview('match-1' as never),
      '/api/matches/match-1/postgame-review/resume',
      'POST',
    ],
    ['deleteMatch', () => api.deleteMatch('match-1' as never), '/api/matches/match-1', 'DELETE'],
    [
      'getMatch god',
      () => api.getMatch('match-1' as never, { kind: 'god' }),
      '/api/matches/match-1?view=god',
      'GET',
    ],
    [
      'getMatch player',
      () => api.getMatch('match-1' as never, { kind: 'player', playerId: 'player-2' as never }),
      '/api/matches/match-1?view=player&playerId=player-2',
      'GET',
    ],
  ] as unknown as ReadonlyArray<
    readonly [string, () => Promise<unknown>, string, string, unknown?]
  >)('%s sends the expected request', async (...args: unknown[]) => {
    const [, invoke, path, method, body] = args as [
      string,
      () => Promise<unknown>,
      string,
      string,
      unknown?,
    ]
    if (method === 'DELETE') fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await invoke()
    expect(fetchMock).toHaveBeenCalledOnce()
    const [actualPath, init] = fetchMock.mock.calls[0]!
    expect(actualPath).toBe(path)
    expect(init?.method ?? 'GET').toBe(method)
    expect(new Headers(init?.headers).get('Content-Type')).toBe(
      body === undefined ? null : 'application/json',
    )
    if (body !== undefined) {
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body')
      expect(JSON.parse(init.body)).toEqual(body)
    }
  })

  it('uses a caller header and surfaces structured and fallback HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ message: 'bad input' }, { status: 422, statusText: 'Invalid' }),
    )
    await expect(api.runtimeConfig()).rejects.toMatchObject({
      name: 'ApiError',
      message: 'bad input',
      status: 422,
    })

    fetchMock.mockResolvedValueOnce(
      new Response('not-json', { status: 503, statusText: 'Unavailable' }),
    )
    await expect(api.runtimeConfig()).rejects.toEqual(
      expect.objectContaining({ message: 'Unavailable', status: 503 }),
    )
  })

  it('propagates response schema failures', async () => {
    schema.parse.mockImplementationOnce(() => {
      throw new Error('schema mismatch')
    })
    await expect(api.runtimeConfig()).rejects.toThrow('schema mismatch')
  })
})
