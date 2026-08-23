import type {
  BoardId,
  MatchBoardSnapshot,
  MatchId,
  MatchSetupSnapshot,
  MatchStatus,
} from '@agentwolf/contracts'

export interface MatchRecord {
  readonly id: MatchId
  readonly boardId: BoardId
  readonly status: MatchStatus
  readonly setup: MatchSetupSnapshot
  readonly boardSnapshot: MatchBoardSnapshot | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly pausedReason: string | null
}
