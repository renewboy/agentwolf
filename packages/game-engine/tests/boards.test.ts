import { describe, expect, it } from 'vitest'
import { listBoards, mirrorHiddenBoard, ninePlayerBoard, sixPlayerBoard } from '../src/index.js'

describe('board catalog', () => {
  it('offers 6, 9, 10, and 12-player presets with complete role manifests', () => {
    const boards = listBoards()
    expect([...new Set(boards.map((board) => board.playerCount))].sort((a, b) => a - b)).toEqual([
      6, 9, 10, 12,
    ])
    for (const board of boards) {
      expect(board.roles.reduce((total, slot) => total + slot.count, 0)).toBe(
        board.playerCount + board.reserveCount,
      )
    }
  })

  it('encodes the player-count-specific sheriff and victory rules', () => {
    expect(sixPlayerBoard).toMatchObject({
      sheriff: false,
      policies: { victory: 'slaughter-all' },
    })
    expect(ninePlayerBoard).toMatchObject({
      sheriff: true,
      policies: { victory: 'slaughter-edge' },
    })
    expect(mirrorHiddenBoard).toMatchObject({
      playerCount: 10,
      sheriff: true,
      policies: { victory: 'slaughter-edge' },
    })
    expect(listBoards().find((board) => board.id === 'board-thief-cupid-12')).toMatchObject({
      playerCount: 12,
      reserveCount: 2,
    })
  })
})
