import {
  AgentProbeResultSchema,
  AgentProfileSchema,
  AgentToolSchema,
  BoardSummarySchema,
  CustomBoardInputSchema,
  MatchViewSchema,
  RoleSummarySchema,
  RuntimeConfigSchema,
  SimulationApprovalResultSchema,
  SimulationReviewResultSchema,
  TrajectoryPageSchema,
  TrajectoryAuditReportSchema,
  TrajectorySummarySchema,
  type AgentProfile,
  type AgentProfileId,
  type AgentProfileInput,
  type AgentProbeResult,
  type AgentTool,
  type AgentToolId,
  type AgentToolInput,
  type BoardSummary,
  type BoardId,
  type CustomBoardInput,
  type CreateMatchRequest,
  type MatchId,
  type MatchView,
  type SpectatorView,
  type RoleSummary,
  type RuntimeConfig,
  type SimulationApprovalRequest,
  type SimulationApprovalResult,
  type SimulationReviewResult,
  type TrajectoryOwnerId,
  type TrajectoryPage,
  type TrajectoryAuditReport,
  type TrajectorySummary,
} from '@agentwolf/contracts'

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, {
    ...init,
    headers,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new ApiError(body?.message ?? response.statusText, response.status)
  }
  if (response.status === 204) return null
  return response.json()
}

export const api = {
  async runtimeConfig(): Promise<RuntimeConfig> {
    return RuntimeConfigSchema.parse(await requestJson('/api/runtime-config'))
  },
  async listTools(): Promise<AgentTool[]> {
    return AgentToolSchema.array().parse(await requestJson('/api/agent-tools'))
  },
  async createTool(input: AgentToolInput): Promise<AgentTool> {
    return AgentToolSchema.parse(
      await requestJson('/api/agent-tools', { method: 'POST', body: JSON.stringify(input) }),
    )
  },
  async updateTool(id: AgentToolId, input: AgentToolInput): Promise<AgentTool> {
    return AgentToolSchema.parse(
      await requestJson(`/api/agent-tools/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    )
  },
  async deleteTool(id: AgentToolId): Promise<void> {
    await requestJson(`/api/agent-tools/${id}`, { method: 'DELETE' })
  },
  async discoverTool(id: AgentToolId): Promise<AgentProbeResult> {
    return AgentProbeResultSchema.parse(
      await requestJson(`/api/agent-tools/${id}/discover`, { method: 'POST' }),
    )
  },
  async listProfiles(): Promise<AgentProfile[]> {
    return AgentProfileSchema.array().parse(await requestJson('/api/agent-profiles'))
  },
  async createProfile(input: AgentProfileInput): Promise<AgentProfile> {
    return AgentProfileSchema.parse(
      await requestJson('/api/agent-profiles', { method: 'POST', body: JSON.stringify(input) }),
    )
  },
  async updateProfile(id: AgentProfileId, input: AgentProfileInput): Promise<AgentProfile> {
    return AgentProfileSchema.parse(
      await requestJson(`/api/agent-profiles/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    )
  },
  async deleteProfile(id: AgentProfileId): Promise<void> {
    await requestJson(`/api/agent-profiles/${id}`, { method: 'DELETE' })
  },
  async probeProfile(id: AgentProfileId): Promise<AgentProbeResult> {
    return AgentProbeResultSchema.parse(
      await requestJson(`/api/agent-profiles/${id}/probe`, { method: 'POST' }),
    )
  },
  async listBoards(): Promise<BoardSummary[]> {
    return BoardSummarySchema.array().parse(await requestJson('/api/boards'))
  },
  async listRoles(): Promise<RoleSummary[]> {
    return RoleSummarySchema.array().parse(await requestJson('/api/roles'))
  },
  async createBoard(input: CustomBoardInput): Promise<BoardSummary> {
    return BoardSummarySchema.parse(
      await requestJson('/api/boards', {
        method: 'POST',
        body: JSON.stringify(CustomBoardInputSchema.parse(input)),
      }),
    )
  },
  async updateBoard(id: BoardId, input: CustomBoardInput): Promise<BoardSummary> {
    return BoardSummarySchema.parse(
      await requestJson(`/api/boards/${id}`, {
        method: 'PUT',
        body: JSON.stringify(CustomBoardInputSchema.parse(input)),
      }),
    )
  },
  async deleteBoard(id: BoardId): Promise<void> {
    await requestJson(`/api/boards/${id}`, { method: 'DELETE' })
  },
  async trajectorySummary(id: MatchId): Promise<TrajectorySummary> {
    return TrajectorySummarySchema.parse(
      await requestJson(`/api/developer/matches/${id}/trajectory/summary`),
    )
  },
  async trajectoryAudit(id: MatchId): Promise<TrajectoryAuditReport> {
    return TrajectoryAuditReportSchema.parse(
      await requestJson(`/api/developer/matches/${id}/trajectory/audit`),
    )
  },
  async trajectoryPage(
    id: MatchId,
    ownerId: TrajectoryOwnerId,
    beforeTurn: number | null = null,
  ): Promise<TrajectoryPage> {
    const query = new URLSearchParams({ ownerId })
    if (beforeTurn !== null) query.set('beforeTurn', String(beforeTurn))
    return TrajectoryPageSchema.parse(
      await requestJson(`/api/developer/matches/${id}/trajectory?${query}`),
    )
  },
  async reviewSimulation(id: MatchId): Promise<SimulationReviewResult> {
    return SimulationReviewResultSchema.parse(
      await requestJson(`/api/developer/matches/${id}/simulation/review`, { method: 'POST' }),
    )
  },
  async approveSimulation(
    id: SimulationReviewResult['simulationId'],
    input: SimulationApprovalRequest,
  ): Promise<SimulationApprovalResult> {
    return SimulationApprovalResultSchema.parse(
      await requestJson(`/api/developer/simulations/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  },
  async listMatches(): Promise<MatchView[]> {
    return MatchViewSchema.array().parse(await requestJson('/api/matches'))
  },
  async createMatch(input: CreateMatchRequest): Promise<MatchView> {
    return MatchViewSchema.parse(
      await requestJson('/api/matches', { method: 'POST', body: JSON.stringify(input) }),
    )
  },
  async startMatch(id: MatchId): Promise<MatchView> {
    return MatchViewSchema.parse(await requestJson(`/api/matches/${id}/start`, { method: 'POST' }))
  },
  async resumeMatch(id: MatchId): Promise<MatchView> {
    return MatchViewSchema.parse(await requestJson(`/api/matches/${id}/resume`, { method: 'POST' }))
  },
  async deleteMatch(id: MatchId): Promise<void> {
    await requestJson(`/api/matches/${id}`, { method: 'DELETE' })
  },
  async getMatch(id: MatchId, view: SpectatorView): Promise<MatchView> {
    const query = new URLSearchParams({ view: view.kind })
    if (view.kind === 'player') query.set('playerId', view.playerId)
    return MatchViewSchema.parse(await requestJson(`/api/matches/${id}?${query}`))
  },
}
