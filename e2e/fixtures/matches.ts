import type {
  MatchView,
  PostgameReviewResult,
  PostgameReviewSubmission,
} from '@agentwolf/contracts'

export function ignoreLiveMessage(_message: unknown): void {}

export function thinkingMatchFixture(): MatchView {
  const occurredAt = '2026-08-23T00:00:00.000Z'
  const seats = Array.from({ length: 6 }, (_, index) => ({
    playerId: `player-${index + 1}`,
    seat: index + 1,
    name: `测试玩家${index + 1}`,
    agent: { name: 'Mock Agent', model: 'mock-model', reasoningEffort: 'high' },
    alive: true,
    canVote: true,
    sheriff: index === 1,
    active: index === 5,
    roleId: index === 5 ? 'role-werewolf' : 'role-villager',
    roleName: index === 5 ? '狼人' : '平民',
    faction: index === 5 ? 'werewolf' : 'village',
    sessionStatus: index === 5 ? 'thinking' : 'ready',
  }))
  const timeline = [
    {
      sequence: 1,
      kind: 'night.started',
      title: '第 1 夜开始',
      playerIds: [],
      occurredAt,
    },
    ...Array.from({ length: 28 }, (_, index) => ({
      sequence: index + 2,
      kind: 'speech.committed',
      title: `这是第 ${index + 1} 条用于验证独立滚动区域的测试发言。`,
      playerIds: [`player-${(index % 6) + 1}`],
      speechId: index + 2,
      occurredAt,
    })),
    {
      sequence: 30,
      kind: 'vote.resolved',
      title: '投票结算：1号、4号同为3票。',
      detail: '投1号：2号、3号、4号\n投4号：1号、5号、6号',
      playerIds: ['player-1', 'player-4'],
      occurredAt,
    },
  ]
  return {
    id: 'match-layout-motion-test',
    boardId: 'board-quick-6',
    boardName: '6 人快速场',
    status: 'running',
    day: 1,
    phaseId: 'phase-day-speech',
    phaseLabel: '白天发言',
    seats,
    timeline,
    activeSpeech: null,
    winner: null,
    pausedReason: null,
  } as unknown as MatchView
}

export function postgameMatchFixture(
  base: MatchView,
  matchId: string,
  state: 'countdown' | 'collecting',
): MatchView {
  return {
    ...base,
    id: matchId,
    status: 'ended',
    phaseId: 'phase-match-ended',
    phaseLabel: '对局结束',
    winner: 'village',
    activeSpeech: null,
    seats: base.seats.map((seat) => ({ ...seat, active: false, sessionStatus: 'ready' })),
    postgameReview: {
      state,
      decisionDeadlineAt:
        state === 'countdown' ? new Date(Date.now() + 10_000).toISOString() : null,
      startedAt: state === 'countdown' ? null : '2026-08-26T00:00:00.000Z',
      winningPlayerIds: ['player-1', 'player-2'],
      losingPlayerIds: ['player-3', 'player-4', 'player-5', 'player-6'],
      submittedCount: 0,
      totalPlayers: 6,
      currentSpeakerId: null,
      submissions: [],
      result: null,
      reflections: [],
      pausedReason: null,
    },
  } as unknown as MatchView
}

export function postgameSubmission(matchId: string): PostgameReviewSubmission {
  return {
    matchId,
    reviewerId: 'player-1',
    mvpPlayerId: 'player-2',
    svpPlayerId: 'player-3',
    submittedAt: '2026-08-26T00:00:00.000Z',
    ratings: ['player-2', 'player-3', 'player-4', 'player-5', 'player-6'].map(
      (playerId, index) => ({
        playerId,
        scores: {
          information: 6 + (index % 5),
          communication: 7,
          decision: 8,
          objective: 9,
          adaptability: 8,
        },
      }),
    ),
  } as unknown as PostgameReviewSubmission
}

export function postgameResult(): PostgameReviewResult {
  return {
    mvp: { playerId: 'player-2', votes: 4, resolvedBy: 'votes' },
    svp: { playerId: 'player-3', votes: 3, resolvedBy: 'score' },
    players: Array.from({ length: 6 }, (_, index) => ({
      playerId: `player-${index + 1}`,
      scores: {
        information: 7 + (index % 2) * 0.5,
        communication: 7.2,
        decision: 8,
        objective: 8.4,
        adaptability: 7.8,
      },
      overall: 7.8,
      ratingCount: 5,
    })),
    completedAt: '2026-08-26T00:00:30.000Z',
  } as unknown as PostgameReviewResult
}

export function votingMatchFixture(): MatchView {
  const match = thinkingMatchFixture()
  return {
    ...match,
    id: 'match-vote-progress-test',
    phaseId: 'phase-day-vote',
    phaseLabel: '放逐投票',
    seats: match.seats.map((seat, index) => ({
      ...seat,
      active: false,
      sessionStatus: index === 0 ? 'submitted' : index === 5 ? 'thinking' : 'ready',
    })),
  } as unknown as MatchView
}

export function closedEyeFixture(match: MatchView): MatchView {
  return {
    ...match,
    seats: match.seats.map((seat) => {
      const { roleId: _roleId, roleName: _roleName, faction: _faction, ...publicSeat } = seat
      return { ...publicSeat, sessionStatus: 'idle' }
    }),
  }
}
