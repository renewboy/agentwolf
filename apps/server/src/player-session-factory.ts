import type { McpServer, RequestPermissionRequest } from '@agentclientprotocol/sdk'
import {
  AcpPlayerSession,
  playerActionToolNames,
  playerApprovedToolNames,
  playerSessionMeta,
  resolvePlayerLaunchSpec,
  type AcpPromptCallbacks,
  type AcpPromptResult,
} from '@agentwolf/acp'
import type { AgentProfile, AgentTool, MatchId, PlayerId } from '@agentwolf/contracts'
import { loadPromptCore } from '@agentwolf/assets/prompts'

const promptCore = loadPromptCore()

export interface PlayerSession {
  readonly sessionId: string
  readonly connected: boolean
  finishAfterAcceptedAction(): void
  prompt(
    prompt: string,
    timeoutMs: number,
    callbacks?: AcpPromptCallbacks,
  ): Promise<AcpPromptResult>
  close(): Promise<void>
}

export type PlayerSessionFactory = (options: {
  readonly cwd: string
  readonly tool: AgentTool
  readonly profile: AgentProfile
  readonly mcpServer: McpServer
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly onStderr?: (chunk: string) => void
  readonly onPermissionDecision?: (request: RequestPermissionRequest, allowed: boolean) => void
  readonly resumeSessionId?: string
}) => Promise<PlayerSession>

export const defaultPlayerSessionFactory: PlayerSessionFactory = async (options) => {
  const mode = options.profile.mode ?? options.tool.initialMode
  // ACP processes may report provider defaults after resume; the Profile remains authoritative.
  return AcpPlayerSession.start({
    cwd: options.cwd,
    launch: resolvePlayerLaunchSpec(options.tool, options.cwd),
    model: options.profile.model,
    modelConfigKey: options.tool.modelConfigKey,
    ...(options.profile.reasoningEffort
      ? { reasoningEffort: options.profile.reasoningEffort }
      : {}),
    ...(mode ? { mode } : {}),
    mcpServers: [options.mcpServer],
    sessionMeta: {
      ...playerSessionMeta(options.tool.kind, promptCore.playerContract()),
      agentwolf: { matchId: options.matchId, playerId: options.playerId },
    },
    approvedToolNames: playerApprovedToolNames(options.tool.kind),
    requireSessionResume: true,
    ...(options.resumeSessionId ? { resumeSessionId: options.resumeSessionId } : {}),
    allowOpaqueMcpPermissions: options.tool.kind === 'codex',
    approvedMcpTools: playerActionToolNames.map((tool) => ({
      server: 'agentwolf-player-actions',
      tool,
      title: promptCore.tool(tool).title,
    })),
    ...(options.onStderr ? { onStderr: options.onStderr } : {}),
    ...(options.onPermissionDecision ? { onPermissionDecision: options.onPermissionDecision } : {}),
  })
}
