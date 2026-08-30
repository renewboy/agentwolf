import { PlayerIdSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { initialPlayerLabel, playerFact, seatLabel, speakerLabel } from '../src/prompts/labels.js'

describe('Prompt player labels', () => {
  it('renders opening, speech, and ordinary references from the same fact', () => {
    const playerId = PlayerIdSchema.parse('player-1')
    const players = new Map([
      [playerId, { playerId, seat: 1, name: '测试玩家', alive: true, roleId: null }],
    ])

    expect(playerFact(playerId, players)).toMatchObject({ seat: 1, name: '测试玩家' })
    expect(seatLabel(playerId, players)).toBe('1 号玩家')
    expect(speakerLabel(playerId, players)).toBe('测试玩家（1 号玩家）')
    expect(initialPlayerLabel(playerId, players)).toBe('测试玩家（1 号玩家，Player ID：player-1）')
  })

  it('rejects a Player ID absent from visible Prompt facts', () => {
    expect(() => playerFact(PlayerIdSchema.parse('player-9'), new Map())).toThrow(
      /Unknown Prompt Player/,
    )
  })
})
