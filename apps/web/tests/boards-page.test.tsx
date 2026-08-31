import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCopy } from '@agentwolf/assets'
import type { AgentProfile, BoardSummary, CharacterCard, RoleSummary } from '@agentwolf/contracts'

const apiMocks = vi.hoisted(() => ({
  listBoards: vi.fn(),
  listRoles: vi.fn(),
  listCharacters: vi.fn(),
  listProfiles: vi.fn(),
  createBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
}))

vi.mock('../src/api.js', () => ({ api: apiMocks }))

import { BoardsPage } from '../src/pages/BoardsPage.js'

const roles = [
  { id: 'role-villager', name: '平民', faction: 'village', kind: 'villager' },
  { id: 'role-werewolf', name: '狼人', faction: 'werewolf', kind: 'werewolf' },
] as RoleSummary[]
const profile = {
  id: 'profile-test',
  name: 'Profile',
  toolId: 'tool-test',
  model: 'model',
  reasoningEffort: null,
  promptTimeoutMs: 5000,
  connection: {},
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
} as unknown as AgentProfile
const character = {
  id: 'character-test',
  name: 'Character',
  universe: 'Universe',
  portraitAssetId: 'portrait-test',
} as CharacterCard

function board(id: string, editable: boolean): BoardSummary {
  return {
    id,
    name: editable ? '自建板子' : '内置板子',
    description: '板子说明',
    playerCount: 6,
    cardCount: 6,
    reserveCount: 0,
    roles: [
      { roleId: 'role-villager', count: 5, name: '平民' },
      { roleId: 'role-werewolf', count: 1, name: '狼人' },
    ],
    characters: [
      { seat: 2, characterId: null },
      { seat: 1, characterId: 'character-test' },
      ...Array.from({ length: 4 }, (_, index) => ({ seat: index + 3, characterId: null })),
    ],
    agentProfiles: [
      { seat: 2, profileId: null },
      { seat: 1, profileId: 'profile-test' },
      ...Array.from({ length: 4 }, (_, index) => ({ seat: index + 3, profileId: null })),
    ],
    sheriff: true,
    victory: 'slaughter-edge',
    source: editable ? 'custom' : 'built-in',
    editable,
    revision: 1,
  } as BoardSummary
}

const builtIn = board('board-built-in', false)
const custom = board('board-custom', true)

beforeEach(() => {
  for (const mock of Object.values(apiMocks)) mock.mockReset()
  apiMocks.listBoards.mockResolvedValue([builtIn, custom])
  apiMocks.listRoles.mockResolvedValue(roles)
  apiMocks.listCharacters.mockResolvedValue([character])
  apiMocks.listProfiles.mockResolvedValue([profile])
  apiMocks.createBoard.mockResolvedValue(custom)
  apiMocks.updateBoard.mockResolvedValue(custom)
  apiMocks.deleteBoard.mockResolvedValue(undefined)
})

describe('BoardsPage', () => {
  it('handles Error/string load failures and retry', async () => {
    apiMocks.listBoards
      .mockRejectedValueOnce(new Error('load failed'))
      .mockRejectedValueOnce('string load failed')
      .mockResolvedValueOnce([builtIn])
    render(<BoardsPage />)
    expect(await screen.findByText('load failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: getCopy('common.retry') }))
    expect(await screen.findByText('string load failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: getCopy('common.retry') }))
    expect(await screen.findByText(getCopy('boardManagement.readOnly'))).toBeVisible()
  })

  it('renders built-in defaults, clones the current board, and edits all rule/default fields', async () => {
    render(<BoardsPage />)
    expect(await screen.findByText(getCopy('boardManagement.readOnly'))).toBeVisible()
    expect(screen.getByAltText('')).toHaveAttribute('src', '/api/character-assets/portrait-test')
    expect(screen.getByRole('switch')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: getCopy('boardManagement.clone') }))
    expect(screen.queryByText(getCopy('boardManagement.readOnly'))).not.toBeInTheDocument()
    const editor = document.querySelector<HTMLElement>('.aw-agent-editor')!
    const [name, description] = within(editor).getAllByRole('textbox')
    expect((name as HTMLInputElement).value).toContain('自建')
    fireEvent.change(name!, { target: { value: '克隆板子' } })
    fireEvent.change(description!, { target: { value: '克隆说明' } })
    await userEvent.click(screen.getByRole('switch'))
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(screen.getByRole('button', { name: '屠边' }))
    await userEvent.click(screen.getByRole('button', { name: '屠城' }))

    const selects = screen.getAllByRole('combobox')
    await userEvent.click(selects[0]!)
    await userEvent.click(screen.getByRole('option', { name: /未指定/u }))
    await userEvent.click(selects[1]!)
    await userEvent.click(screen.getByRole('option', { name: '无角色' }))
    expect(selects[0]).toHaveAttribute('data-value', 'none')
    expect(selects[1]).toHaveAttribute('data-value', 'none')
  })

  it('creates a six-player board, clamps counters, assigns defaults, and saves', async () => {
    apiMocks.createBoard
      .mockRejectedValueOnce(new Error('create failed'))
      .mockRejectedValueOnce('create string failed')
      .mockResolvedValueOnce(custom)
    render(<BoardsPage />)
    await screen.findByText(getCopy('boardManagement.readOnly'))
    await userEvent.click(screen.getByRole('button', { name: getCopy('boardManagement.create') }))
    const editor = document.querySelector<HTMLElement>('.aw-agent-editor')!
    const [name] = within(editor).getAllByRole('textbox')
    fireEvent.change(name!, { target: { value: '新板子' } })
    const addVillager = screen.getByRole('button', { name: '增加平民' })
    const addWolf = screen.getByRole('button', { name: '增加狼人' })
    for (let index = 0; index < 5; index += 1) await userEvent.click(addVillager)
    await userEvent.click(addWolf)
    expect(document.querySelector('.aw-board-role-editor')).toHaveTextContent('6 张牌 · 6 个席位')
    expect(document.querySelectorAll('.aw-board-character-slot')).toHaveLength(6)
    await userEvent.click(screen.getByRole('button', { name: '减少平民' }))
    await userEvent.click(addVillager)

    const selects = screen.getAllByRole('combobox')
    await userEvent.click(selects[0]!)
    await userEvent.click(screen.getByRole('option', { name: /Profile/u }))
    await userEvent.click(selects[1]!)
    await userEvent.click(screen.getByRole('option', { name: /Character/u }))
    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(screen.getByRole('button', { name: '屠边' }))

    const save = screen.getByRole('button', { name: getCopy('boardManagement.save') })
    await userEvent.click(save)
    expect(await screen.findByText('create failed')).toBeVisible()
    await userEvent.click(save)
    expect(await screen.findByText('create string failed')).toBeVisible()
    await userEvent.click(save)
    expect(apiMocks.createBoard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: '新板子',
        sheriff: true,
        victory: 'slaughter-edge',
        reserveCount: 0,
        roles: expect.arrayContaining([
          { roleId: 'role-villager', count: 5 },
          { roleId: 'role-werewolf', count: 1 },
        ]),
      }),
    )
    expect(await screen.findByText(getCopy('boardManagement.saved'))).toBeVisible()
  })

  it('updates, cancels deletion, deletes, and reports failures', async () => {
    apiMocks.updateBoard.mockRejectedValueOnce('update failed').mockResolvedValueOnce(custom)
    apiMocks.deleteBoard
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockRejectedValueOnce('delete string failed')
      .mockResolvedValueOnce(undefined)
    apiMocks.listBoards.mockResolvedValueOnce([builtIn, custom]).mockResolvedValue([builtIn])
    render(<BoardsPage />)
    await screen.findByText(getCopy('boardManagement.readOnly'))
    await userEvent.click(screen.getByRole('button', { name: /自建板子/u }))
    const save = screen.getByRole('button', { name: getCopy('boardManagement.save') })
    await userEvent.click(save)
    expect(await screen.findByText('update failed')).toBeVisible()
    await userEvent.click(save)
    expect(apiMocks.updateBoard).toHaveBeenCalled()

    const deleteButton = screen.getByRole('button', { name: getCopy('boardManagement.delete') })
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '取消' }),
    )
    for (const expected of ['delete failed', 'delete string failed']) {
      await userEvent.click(deleteButton)
      await userEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: getCopy('boardManagement.delete'),
        }),
      )
      expect(await screen.findByText(expected)).toBeVisible()
    }
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: getCopy('boardManagement.delete'),
      }),
    )
    expect(await screen.findByText(getCopy('boardManagement.readOnly'))).toBeVisible()
  })

  it('derives player seats from a custom role-card pool and Thief reserves', async () => {
    apiMocks.listRoles.mockResolvedValue([
      ...roles,
      {
        id: 'role-thief',
        name: '盗贼',
        faction: 'independent',
        kind: 'independent',
        requiredReserveCount: 2,
      },
    ])
    render(<BoardsPage />)
    await screen.findByText(getCopy('boardManagement.readOnly'))
    await userEvent.click(screen.getByRole('button', { name: getCopy('boardManagement.create') }))
    const editor = document.querySelector<HTMLElement>('.aw-agent-editor')!
    fireEvent.change(within(editor).getAllByRole('textbox')[0]!, {
      target: { value: '盗贼自建板' },
    })
    for (let index = 0; index < 4; index += 1) {
      await userEvent.click(screen.getByRole('button', { name: '增加平民' }))
    }
    for (let index = 0; index < 3; index += 1) {
      await userEvent.click(screen.getByRole('button', { name: '增加狼人' }))
    }
    await userEvent.click(screen.getByRole('button', { name: '增加盗贼' }))
    expect(document.querySelector('.aw-board-role-editor')).toHaveTextContent('8 张牌 · 6 个席位')
    expect(document.querySelector('.aw-board-reserve-counter output')).toHaveTextContent('2')
    expect(document.querySelectorAll('.aw-board-character-slot')).toHaveLength(6)
    await userEvent.click(screen.getByRole('button', { name: getCopy('boardManagement.save') }))
    expect(apiMocks.createBoard).toHaveBeenLastCalledWith(
      expect.objectContaining({ reserveCount: 2 }),
    )
  })
})
