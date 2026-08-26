import { PlayerIdSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { PostgamePromptAssets } from '../src/prompts.js'

describe('postgame Prompt assets', () => {
  it('renders a ruleset-neutral review contract and direct reflection', () => {
    const prompts = new PostgamePromptAssets()
    const player1 = PlayerIdSchema.parse('player-1')
    const player2 = PlayerIdSchema.parse('player-2')
    const review = prompts.review({
      reviewerId: player1,
      terminalDay: 3,
      terminalNight: 3,
      winnerLabel: '第三方阵营',
      publicHistory: ['投票结果：2 号乙 2 票、1 号甲 0 票。', '2 号乙出局。'],
      roster: [
        {
          playerId: player1,
          seat: 1,
          name: '甲',
          roleLabel: '村民',
          factionLabel: '好人阵营',
        },
        {
          playerId: player2,
          seat: 2,
          name: '乙',
          roleLabel: '第三方',
          factionLabel: '第三方阵营',
        },
      ],
      mvpCandidateIds: [player2],
      svpCandidateIds: [player1],
      ratingTargetIds: [player2],
    })
    expect(review).toContain('submit_postgame_review')
    expect(review).toContain('你上次行动后发生的公开对局记录')
    expect(review).toContain('投票结果：2 号乙 2 票')
    expect(review).toContain('最终胜负：第三方阵营获胜')
    expect(review).toContain('获胜玩家：2 号 乙（player-2）')
    expect(review).toContain('第三方阵营')
    expect(review).toContain('每位玩家恰好评分一次')
    expect(prompts.reviewContinuation()).not.toContain('公开对局记录')

    const reflection = prompts.reflection({
      playerId: player1,
      roster: [
        {
          playerId: player1,
          seat: 1,
          name: '甲',
          roleLabel: '村民',
          factionLabel: '好人阵营',
        },
        {
          playerId: player2,
          seat: 2,
          name: '乙',
          roleLabel: '第三方',
          factionLabel: '第三方阵营',
        },
      ],
      mvpPlayerId: player2,
      svpPlayerId: player1,
      ownResult: {
        playerId: player1,
        scores: {
          information: 7.5,
          communication: 8,
          decision: 7,
          objective: 8.5,
          adaptability: 7.5,
        },
        overall: 7.7,
        ratingCount: 1,
      },
      priorReflections: [{ playerId: player2, text: '这局很精彩。' }],
      speechCharacterLimit: 300,
    })
    expect(reflection).toContain('此前感言')
    expect(reflection).toContain('不要调用工具')
    expect(reflection).toContain('300')
  })
})
