import {
  AgentProbeResultSchema,
  AgentProfileSchema,
  AgentToolSchema,
  BoardSummarySchema,
  MatchViewSchema,
  type AgentProfile,
  type AgentProfileId,
  type AgentProfileInput,
  type AgentProbeResult,
  type AgentTool,
  type AgentToolId,
  type AgentToolInput,
  type BoardSummary,
  type CreateMatchRequest,
  type MatchId,
  type MatchView,
  type SpectatorView,
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
