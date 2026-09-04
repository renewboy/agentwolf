import { deletePlayerProviderSessions } from '@agentwolf/acp'
import type { AgentTool, MatchId, PlayerId } from '@agentwolf/contracts'

export interface PlayerSessionDeletionInput {
  readonly cwd: string
  readonly tool: AgentTool
  readonly sessionId: string
  readonly matchId: MatchId
  readonly playerId: PlayerId
}

export type PlayerSessionDeleter = (inputs: readonly PlayerSessionDeletionInput[]) => Promise<void>

export const defaultPlayerSessionDeleter: PlayerSessionDeleter = async (inputs) => {
  await deletePlayerProviderSessions(
    inputs.map((input) => ({
      tool: input.tool,
      workspace: input.cwd,
      sessionId: input.sessionId,
    })),
  )
}
