import type { MatchView } from '@agentwolf/contracts'

export function matchView(overrides: Partial<Record<keyof MatchView, unknown>> = {}): MatchView {
  return {
    id: 'match-test-abcdef',
    boardId: 'board-test',
    boardName: '测试板子',
    status: 'running',
    day: 1,
    phaseId: 'phase-day-speech',
    phaseLabel: '白天发言',
    seats: [
      {
        playerId: 'player-1',
        seat: 1,
        name: '一号玩家',
        agent: { name: 'Agent', model: 'model', reasoningEffort: null },
        alive: true,
        canVote: true,
        sheriff: false,
        active: true,
        roleId: 'role-villager',
        roleName: '平民',
        faction: 'village',
        sessionStatus: 'ready',
      },
      {
        playerId: 'player-2',
        seat: 2,
        name: '二号玩家',
        agent: { name: 'Agent', model: 'model', reasoningEffort: 'high' },
        alive: true,
        canVote: true,
        sheriff: true,
        active: false,
        roleId: 'role-werewolf',
        roleName: '狼人',
        faction: 'werewolf',
        sessionStatus: 'thinking',
      },
    ],
    timeline: [],
    activeSpeech: null,
    winner: null,
    pausedReason: null,
    ...overrides,
  } as unknown as MatchView
}
