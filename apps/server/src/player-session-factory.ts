import type { McpServer, RequestPermissionRequest } from '@agentclientprotocol/sdk'
import {
  AcpPlayerSession,
  playerActionToolNames,
  preparePlayerProviderSession,
  type AcpPromptCallbacks,
  type AcpPromptResult,
} from '@agentwolf/acp'
import type { AgentProfile, AgentTool, MatchId, PlayerId } from '@agentwolf/contracts'
import { loadPromptCore } from '@agentwolf/assets/prompts'

const promptCore = loadPromptCore()

export interface PlayerSession {
  readonly sessionId: string
  readonly connected: boolean
  readonly modelInstructions?: string
  finishAfterAcceptedAction(): void
  cancelActivePrompt?(): Promise<boolean>
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
  readonly modelInstructions: string
  readonly mcpServer: McpServer
  readonly matchId: MatchId
  readonly playerId: PlayerId
  readonly onStderr?: (chunk: string) => void
  readonly onPermissionDecision?: (request: RequestPermissionRequest, allowed: boolean) => void
  readonly resumeSessionId?: string
}) => Promise<PlayerSession>

export const defaultPlayerSessionFactory: PlayerSessionFactory = async (options) => {
  const mode = options.profile.mode ?? options.tool.initialMode
  const mcpServers = [options.mcpServer]
  const prepared = await preparePlayerProviderSession({
    tool: options.tool,
    workspace: options.cwd,
    mcpServers,
    modelInstructions: options.modelInstructions,
  })
  // ACP processes may report provider defaults after resume; the Profile remains authoritative.
  const session = await AcpPlayerSession.start({
    cwd: prepared.cwd,
    clientInfo: { name: 'agentwolf', version: '0.1.0' },
    launch: prepared.launch,
    model: options.profile.model,
    modelConfigKey: options.tool.modelConfigKey,
    ...(options.profile.reasoningEffort
      ? { reasoningEffort: options.profile.reasoningEffort }
      : {}),
    ...(mode ? { mode } : {}),
    mcpServers: prepared.mcpServers,
    sessionMeta: {
      ...prepared.sessionMeta,
      agentwolf: { matchId: options.matchId, playerId: options.playerId },
    },
    approvedToolNames: prepared.approvedToolNames,
    requireSessionResume: true,
    verifyUnadvertisedSessionResume: prepared.verifyUnadvertisedSessionResume,
    ...(options.resumeSessionId ? { resumeSessionId: options.resumeSessionId } : {}),
    allowOpaqueMcpPermissions: prepared.allowOpaqueMcpPermissions,
    approvedMcpTools: playerActionToolNames.map((tool) => ({
      server: 'agentwolf-player-actions',
      tool,
      title: promptCore.tool(tool).title,
    })),
    ...(options.onStderr ? { onStderr: options.onStderr } : {}),
    ...(options.onPermissionDecision ? { onPermissionDecision: options.onPermissionDecision } : {}),
  })
  return Object.assign(session, { modelInstructions: prepared.modelInstructions })
}
