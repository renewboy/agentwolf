import { createReadStream, existsSync } from 'node:fs'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import staticPlugin from '@fastify/static'
import websocket from '@fastify/websocket'
import {
  AgentDiscoveryInputSchema,
  AgentProfileIdSchema,
  AgentProfileInputSchema,
  AgentProfileOrderInputSchema,
  AgentToolIdSchema,
  AgentToolInputSchema,
  BoardIdSchema,
  CharacterCardInputSchema,
  CharacterIdSchema,
  CharacterPortraitAssetIdSchema,
  CharacterPortraitUploadSchema,
  CreateMatchRequestSchema,
  CustomBoardInputSchema,
  GlobalSettingsSchema,
  LiveClientMessageSchema,
  MatchIdSchema,
  PlayerIdSchema,
  SimulationApprovalRequestSchema,
  SimulationIdSchema,
  SpectatorViewSchema,
  TrajectoryOwnerIdSchema,
  type SpectatorView,
} from '@agentwolf/contracts'
import { ZodError } from 'zod'
import { AgentCatalogService } from './agent-catalog.js'
import { AgentProbeService } from './agent-probe.js'
import { BoardCatalogService } from './board-catalog.js'
import { CharacterCatalogService } from './character-catalog.js'
import type { ServerConfig } from './config.js'
import { handleMcpRequest } from './mcp.js'
import { MatchManager, MatchNotFoundError } from './match-manager.js'
import { PostgameReviewConflictError } from './postgame-review-repository.js'
import type { PlayerSessionFactory } from './player-runtime.js'
import { SqliteRepository } from './repository.js'
import { SimulationService } from './simulation-service.js'
import { TrajectoryService } from './trajectory-service.js'
import { RulesetCatalog } from './ruleset-catalog.js'
import { auditTrajectory } from './trajectory-audit.js'

export interface BuildServerOptions {
  readonly config: ServerConfig
  readonly repository?: SqliteRepository
  readonly sessionFactory?: PlayerSessionFactory
  readonly logger?: boolean
}

export interface AgentWolfServer {
  readonly app: FastifyInstance
  readonly repository: SqliteRepository
  readonly catalog: AgentCatalogService
  readonly characters: CharacterCatalogService
  readonly boards: BoardCatalogService
  readonly trajectories: TrajectoryService
  readonly simulations: SimulationService
  readonly matches: MatchManager
  close(): Promise<void>
}

export async function buildServer(options: BuildServerOptions): Promise<AgentWolfServer> {
  const app = Fastify({ logger: options.logger ?? false })
  const repository = options.repository ?? new SqliteRepository(options.config.databasePath)
  const catalog = new AgentCatalogService(repository)
  const characters = new CharacterCatalogService(repository, options.config)
  const rulesets = new RulesetCatalog()
  const boards = new BoardCatalogService(repository, characters, rulesets)
  boards.backfillMatchSnapshots()
  const trajectories = new TrajectoryService(repository, catalog, options.config.dataDirectory)
  const simulations = new SimulationService(repository, boards, options.config)
  const matches = new MatchManager({
    repository,
    catalog,
    boards,
    characters,
    trajectories,
    rulesets,
    config: options.config,
    ...(options.sessionFactory ? { sessionFactory: options.sessionFactory } : {}),
  })
  const probe = new AgentProbeService(catalog, options.config)

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
  await app.register(websocket)

  app.setErrorHandler(async (error, _request, reply) => {
    const normalized = error instanceof Error ? error : new Error(String(error))
    const notFound =
      normalized instanceof MatchNotFoundError || normalized.name === 'DeveloperModeDisabledError'
    const conflict =
      normalized.name === 'SimulationSourceError' ||
      normalized.name === 'SimulationWorkflowError' ||
      normalized instanceof PostgameReviewConflictError
    const postgameConflict = normalized instanceof PostgameReviewConflictError
    const clientError =
      normalized instanceof ZodError ||
      normalized.name === 'RuleViolation' ||
      normalized.name === 'CharacterCatalogError'
    await reply.code(notFound ? 404 : conflict ? 409 : clientError ? 400 : 500).send({
      error: notFound
        ? 'not-found'
        : postgameConflict
          ? 'postgame-review-conflict'
          : conflict
            ? 'simulation-source-unavailable'
            : clientError
              ? 'invalid-request'
              : 'internal-error',
      message: normalized.message,
    })
  })

  app.get('/api/health', async () => ({ ok: true }))
  app.get('/api/runtime-config', async () => ({ developerMode: options.config.developerMode }))
  app.get('/api/settings', async () => repository.getGlobalSettings())
  app.put('/api/settings', async (request) =>
    repository.saveGlobalSettings(GlobalSettingsSchema.parse(request.body)),
  )

  app.get('/api/agent-tools', async () => catalog.listTools())
  app.post('/api/agent-tools', async (request, reply) => {
    const tool = catalog.createTool(AgentToolInputSchema.parse(request.body))
    return reply.code(201).send(tool)
  })
  app.put('/api/agent-tools/:id', async (request) => {
    const id = AgentToolIdSchema.parse((request.params as { id: string }).id)
    return catalog.updateTool(id, AgentToolInputSchema.parse(request.body))
  })
  app.delete('/api/agent-tools/:id', async (request, reply) => {
    const id = AgentToolIdSchema.parse((request.params as { id: string }).id)
    catalog.deleteTool(id)
    return reply.code(204).send()
  })
  app.post('/api/agent-tools/:id/discover', async (request) => {
    const id = AgentToolIdSchema.parse((request.params as { id: string }).id)
    return probe.discoverTool(id, AgentDiscoveryInputSchema.parse(request.body ?? {}))
  })

  app.get('/api/agent-profiles', async () => catalog.listProfiles())
  app.post('/api/agent-profiles', async (request, reply) => {
    const profile = catalog.createProfile(AgentProfileInputSchema.parse(request.body))
    return reply.code(201).send(profile)
  })
  app.put('/api/agent-profiles/order', async (request) =>
    catalog.reorderProfiles(AgentProfileOrderInputSchema.parse(request.body)),
  )
  app.put('/api/agent-profiles/:id', async (request) => {
    const id = AgentProfileIdSchema.parse((request.params as { id: string }).id)
    return catalog.updateProfile(id, AgentProfileInputSchema.parse(request.body))
  })
  app.delete('/api/agent-profiles/:id', async (request, reply) => {
    const id = AgentProfileIdSchema.parse((request.params as { id: string }).id)
    catalog.deleteProfile(id)
    return reply.code(204).send()
  })
  app.post('/api/agent-profiles/:id/probe', async (request) => {
    const id = AgentProfileIdSchema.parse((request.params as { id: string }).id)
    return probe.probe(id)
  })

  app.get('/api/characters', async () => characters.list())
  app.post('/api/characters', async (request, reply) =>
    reply.code(201).send(characters.create(CharacterCardInputSchema.parse(request.body))),
  )
  app.post('/api/characters/:id/copy', async (request, reply) => {
    const id = CharacterIdSchema.parse((request.params as { id: string }).id)
    return reply.code(201).send(characters.copy(id))
  })
  app.put('/api/characters/:id', async (request) => {
    const id = CharacterIdSchema.parse((request.params as { id: string }).id)
    return characters.update(id, CharacterCardInputSchema.parse(request.body))
  })
  app.delete('/api/characters/:id', async (request, reply) => {
    const id = CharacterIdSchema.parse((request.params as { id: string }).id)
    characters.delete(id)
    return reply.code(204).send()
  })
  app.post('/api/character-assets', { bodyLimit: 7_500_000 }, async (request, reply) =>
    reply
      .code(201)
      .send(await characters.uploadPortrait(CharacterPortraitUploadSchema.parse(request.body))),
  )
  app.get('/api/character-assets/:id', async (request, reply) => {
    const id = CharacterPortraitAssetIdSchema.parse((request.params as { id: string }).id)
    const portrait = characters.portrait(id)
    if (!portrait || !existsSync(portrait.path))
      return reply.code(404).send({ message: 'Not found' })
    return reply
      .type(portrait.mediaType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(createReadStream(portrait.path))
  })

  app.get('/api/boards', async () => matches.listBoards())
  app.get('/api/roles', async () => boards.listRoles())
  app.post('/api/boards', async (request, reply) =>
    reply.code(201).send(boards.create(CustomBoardInputSchema.parse(request.body))),
  )
  app.put('/api/boards/:id', async (request) => {
    const id = BoardIdSchema.parse((request.params as { id: string }).id)
    return boards.update(id, CustomBoardInputSchema.parse(request.body))
  })
  app.delete('/api/boards/:id', async (request, reply) => {
    const id = BoardIdSchema.parse((request.params as { id: string }).id)
    boards.delete(id)
    return reply.code(204).send()
  })
  app.get('/api/matches', async () => matches.listMatches())
  app.post('/api/matches', async (request, reply) => {
    const match = matches.createMatch(CreateMatchRequestSchema.parse(request.body))
    return reply.code(201).send(match)
  })
  app.post('/api/matches/:id/start', async (request, reply) => {
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    const match = matches.beginMatch(id)
    return reply.code(202).send(match)
  })
  app.post('/api/matches/:id/resume', async (request, reply) => {
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    return reply.code(202).send(await matches.resumeMatch(id))
  })
  app.post('/api/matches/:id/postgame-review/start', async (request, reply) => {
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    return reply.code(202).send(matches.startPostgameReview(id))
  })
  app.post('/api/matches/:id/postgame-review/skip', async (request, reply) => {
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    return reply.code(202).send(await matches.skipPostgameReview(id))
  })
  app.post('/api/matches/:id/postgame-review/resume', async (request, reply) => {
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    return reply.code(202).send(matches.resumePostgameReview(id))
  })
  app.delete('/api/matches/:id', async (request, reply) => {
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    await matches.deleteMatch(id)
    return reply.code(204).send()
  })
  app.get('/api/matches/:id', async (request) => {
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    return matches.getMatch(id, viewFromQuery(request.query as Record<string, unknown>))
  })
  app.get('/api/developer/matches/:id/trajectory/summary', async (request) => {
    requireDeveloperMode(options.config)
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    return trajectories.summary(id)
  })
  app.get('/api/developer/matches/:id/trajectory', async (request) => {
    requireDeveloperMode(options.config)
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    const query = request.query as Record<string, unknown>
    const ownerId = TrajectoryOwnerIdSchema.parse(query['ownerId'] ?? 'system')
    const beforeTurn = optionalInteger(query['beforeTurn'])
    const limit = optionalInteger(query['limit']) ?? 20
    return trajectories.page(id, ownerId, beforeTurn, limit)
  })
  app.get('/api/developer/matches/:id/trajectory/players/:playerId', async (request) => {
    requireDeveloperMode(options.config)
    const params = request.params as { id: string; playerId: string }
    return trajectories.playerDebug(
      MatchIdSchema.parse(params.id),
      PlayerIdSchema.parse(params.playerId),
    )
  })
  app.get('/api/developer/matches/:id/trajectory/audit', async (request) => {
    requireDeveloperMode(options.config)
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    return auditTrajectory(repository, boards, id)
  })
  app.get('/api/developer/matches/:id/simulation/export', async (request, reply) => {
    requireDeveloperMode(options.config)
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    const capture = await simulations.capture(id)
    return reply
      .header('Content-Disposition', `attachment; filename="${capture.simulationId}.sim.json"`)
      .send(capture)
  })
  app.post('/api/developer/matches/:id/simulation/candidates', async (request, reply) => {
    requireDeveloperMode(options.config)
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    return reply.code(201).send(await simulations.addCandidate(id))
  })
  app.post('/api/developer/matches/:id/simulation/review', async (request) => {
    requireDeveloperMode(options.config)
    const id = MatchIdSchema.parse((request.params as { id: string }).id)
    return simulations.review(id)
  })
  app.post('/api/developer/simulations/:id/approve', async (request) => {
    requireDeveloperMode(options.config)
    const id = SimulationIdSchema.parse((request.params as { id: string }).id)
    return simulations.approve(id, SimulationApprovalRequestSchema.parse(request.body ?? {}))
  })
  app.get('/api/developer/matches/:id/trajectory/live', { websocket: true }, (socket, request) => {
    try {
      requireDeveloperMode(options.config)
      const id = MatchIdSchema.parse((request.params as { id: string }).id)
      const query = request.query as Record<string, unknown>
      const afterRevision = optionalInteger(query['afterRevision']) ?? 0
      const unsubscribe = trajectories.subscribe(id, afterRevision, (delta) =>
        socket.send(JSON.stringify(delta)),
      )
      socket.once('close', unsubscribe)
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        }),
      )
      socket.close()
    }
  })
  app.get('/api/matches/:id/live', { websocket: true }, (socket, request) => {
    try {
      const id = MatchIdSchema.parse((request.params as { id: string }).id)
      const view = viewFromQuery(request.query as Record<string, unknown>)
      const connection = matches.connect(id, {
        view,
        send: (message) => socket.send(JSON.stringify(message)),
      })
      socket.on('message', (data: unknown) => {
        try {
          connection.receive(LiveClientMessageSchema.parse(JSON.parse(String(data))))
        } catch (error) {
          socket.send(
            JSON.stringify({
              type: 'error',
              code: 'invalid-live-message',
              message: error instanceof Error ? error.message : String(error),
            }),
          )
        }
      })
      socket.once('close', () => connection.close())
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        }),
      )
      socket.close()
    }
  })

  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    handler: async (request, reply) => handleMcpRequest(request, reply, matches.mailbox),
  })

  app.addHook('onListen', async () => matches.initializePostgameReviews())

  if (existsSync(options.config.webDistPath)) {
    await app.register(staticPlugin, {
      root: options.config.webDistPath,
      wildcard: false,
    })
    app.get('/*', async (_request, reply) => reply.sendFile('index.html'))
  }

  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await matches.close()
    await app.close()
    repository.close()
  }

  return {
    app,
    repository,
    catalog,
    characters,
    boards,
    trajectories,
    simulations,
    matches,
    close,
  }
}

function viewFromQuery(query: Record<string, unknown>): SpectatorView {
  const kind = query['view']
  if (kind === 'player') {
    return SpectatorViewSchema.parse({
      kind,
      playerId: PlayerIdSchema.parse(query['playerId']),
    })
  }
  return SpectatorViewSchema.parse({ kind: kind === 'god' ? 'god' : 'closed-eye' })
}

function requireDeveloperMode(config: ServerConfig): void {
  if (config.developerMode) return
  const error = new Error('Developer mode is disabled')
  error.name = 'DeveloperModeDisabledError'
  throw error
}

function optionalInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error('Expected a non-negative integer')
  return parsed
}
