import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentProfile, BoardSummary, CharacterCard } from '@agentwolf/contracts'

const apiMocks = vi.hoisted(() => ({
  listBoards: vi.fn(),
  listProfiles: vi.fn(),
  listCharacters: vi.fn(),
  createMatch: vi.fn(),
  startMatch: vi.fn(),
}))

vi.mock('../src/api.js', () => ({ api: apiMocks }))

import { NewMatchPage } from '../src/pages/NewMatchPage.js'
import { matchView } from './fixtures/match.js'

const profile = {
  id: 'profile-test',
  name: 'Test Profile',
  toolId: 'tool-test',
  model: 'model-x',
  reasoningEffort: null,
  promptTimeoutMs: 5000,
  connection: {},
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
} as unknown as AgentProfile

const secondProfile = { ...profile, id: 'profile-second', name: 'Second Profile' } as AgentProfile

const character = {
  id: 'character-test',
  name: '固定角色',
  universe: '测试宇宙',
  portraitAssetId: 'portrait-test',
  source: 'built-in',
  editable: false,
} as CharacterCard

function board(id: string, playerCount: number, options: Partial<BoardSummary> = {}): BoardSummary {
  return {
    id,
    name: `${playerCount} 人板子`,
    description: '测试板子说明',
    playerCount,
    cardCount: playerCount,
    reserveCount: 0,
    roles: [
      { roleId: 'role-villager', count: Math.max(1, playerCount - 1), name: '平民' },
      { roleId: 'role-werewolf', count: 1, name: '狼人' },
    ],
    characters: Array.from({ length: playerCount }, (_, index) => ({
      seat: index + 1,
      characterId: index === 0 ? 'character-test' : null,
    })),
    agentProfiles: Array.from({ length: playerCount }, (_, index) => ({
      seat: index + 1,
      profileId: index === 0 ? 'profile-second' : 'profile-test',
    })),
    sheriff: false,
    victory: 'eliminate-all-wolves',
    source: 'built-in',
    editable: false,
    revision: 1,
    ...options,
  } as BoardSummary
}

function renderPage(path = '/matches/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/matches/new" element={<NewMatchPage />} />
        <Route path="/matches/:matchId" element={<div>navigated match</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  for (const mock of Object.values(apiMocks)) mock.mockReset()
  apiMocks.listBoards.mockResolvedValue([board('board-two', 2), board('board-three', 3)])
  apiMocks.listProfiles.mockResolvedValue([profile, secondProfile])
  apiMocks.listCharacters.mockResolvedValue([character])
  apiMocks.createMatch.mockResolvedValue(matchView())
  apiMocks.startMatch.mockResolvedValue(matchView({ status: 'running' }))
})

describe('NewMatchPage', () => {
  it('supports a custom eight-player board and submits exactly its eight seats', async () => {
    apiMocks.listBoards.mockResolvedValue([
      board('board-twelve', 12),
      board('board-custom-eight', 8, {
        name: '八人自定义牌局',
        source: 'custom',
        editable: true,
      }),
    ])
    renderPage()
    const eightPlayers = await screen.findByRole('button', { name: '8 人' })
    expect(eightPlayers).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(eightPlayers)
    expect(eightPlayers).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /八人自定义牌局/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await arrangeSeats()
    expect(seatNameInputs()).toHaveLength(8)
    await userEvent.click(screen.getByRole('button', { name: '开始对局' }))
    const submitted = apiMocks.createMatch.mock.calls[0]![0]
    expect(submitted.boardId).toBe('board-custom-eight')
    expect(submitted.seats).toHaveLength(8)
    expect(submitted.seats.map((seat: { seat: number }) => seat.seat)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ])
    expect(await screen.findByText('navigated match')).toBeVisible()
  })

  it('selects the linked board and keeps edited seats while moving between steps', async () => {
    renderPage('/matches/new?board=board-three')
    expect(await screen.findByRole('button', { name: /3 人板子/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.queryByRole('textbox', { name: '玩家昵称' })).not.toBeInTheDocument()
    await arrangeSeats()
    expect(seatNameInputs()).toHaveLength(3)
    fireEvent.change(seatNameInputs()[1]!, { target: { value: '留在牌桌的名字' } })
    await userEvent.click(screen.getByRole('button', { name: '选择牌组' }))
    await arrangeSeats()
    expect(seatNameInputs()[1]).toHaveValue('留在牌桌的名字')
    expect(screen.getByRole('heading', { name: '安排玩家' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: '开始对局' }))
    expect(apiMocks.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: 'board-three' }),
    )
  })

  it('applies one Profile to all seats without replacing their names, Characters or roles', async () => {
    renderPage()
    await screen.findByRole('heading', { name: '准备一场对局' })
    await arrangeSeats()
    await userEvent.click(screen.getByRole('button', { name: '指定身份' }))
    const names = seatNameInputs().map((input) => input.value)
    const characters = screen
      .getAllByRole('combobox', { name: '扮演角色' })
      .map((input) => input.getAttribute('data-value'))
    const roles = screen
      .getAllByRole('combobox', { name: '身份牌' })
      .map((input) => input.getAttribute('data-value'))
    await userEvent.click(screen.getByRole('combobox', { name: '统一使用 Agent' }))
    await userEvent.click(screen.getByRole('option', { name: /Second Profile/ }))
    await userEvent.click(screen.getByRole('button', { name: '应用到全部席位' }))
    expect(screen.getByText('全部席位已更新')).toBeVisible()
    expect(
      screen
        .getAllByRole('combobox', { name: 'Agent 配置' })
        .every((input) => input.getAttribute('data-value') === 'profile-second'),
    ).toBe(true)
    expect(seatNameInputs().map((input) => input.value)).toEqual(names)
    expect(
      screen
        .getAllByRole('combobox', { name: '扮演角色' })
        .map((input) => input.getAttribute('data-value')),
    ).toEqual(characters)
    expect(
      screen
        .getAllByRole('combobox', { name: '身份牌' })
        .map((input) => input.getAttribute('data-value')),
    ).toEqual(roles)
  })

  it('selects a different board at the same player count and uses its seat defaults', async () => {
    apiMocks.listBoards.mockResolvedValue([
      board('board-two', 2),
      board('board-custom-two', 2, {
        name: '双人特别牌组',
        source: 'custom',
        editable: true,
        agentProfiles: [
          { seat: 1, profileId: secondProfile.id },
          { seat: 2, profileId: secondProfile.id },
        ],
      }),
    ])
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /双人特别牌组/ }))
    await arrangeSeats()
    expect(
      screen
        .getAllByRole('combobox', { name: 'Agent 配置' })
        .every((select) => select.getAttribute('data-value') === secondProfile.id),
    ).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: '返回选牌' }))
    expect(screen.getByRole('button', { name: /双人特别牌组/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await arrangeSeats()
    await userEvent.click(screen.getByRole('button', { name: '开始对局' }))
    expect(apiMocks.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: 'board-custom-two' }),
    )
  })

  it('falls back from an unavailable board link and provides a usable empty board state', async () => {
    const first = renderPage('/matches/new?board=missing')
    expect(await screen.findByRole('button', { name: /2 人板子/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    first.unmount()
    apiMocks.listBoards.mockResolvedValue([])
    renderPage()
    expect(await screen.findByRole('heading', { name: '还没有可用的牌组' })).toBeVisible()
    expect(screen.getByRole('link', { name: '浏览板型' })).toHaveAttribute('href', '/boards')
  })

  it('handles Error/string load failures, retries, and requires an Agent Profile', async () => {
    apiMocks.listBoards
      .mockRejectedValueOnce(new Error('board load failed'))
      .mockRejectedValueOnce('board string failed')
      .mockResolvedValueOnce([board('board-two', 2)])
    apiMocks.listProfiles
      .mockResolvedValueOnce([profile])
      .mockResolvedValueOnce([profile])
      .mockResolvedValueOnce([])
    apiMocks.listCharacters.mockResolvedValue([character])
    renderPage()
    expect(await screen.findByText('board load failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('board string failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: /Agent/ })).toBeVisible()
    expect(screen.getByRole('link', { name: /Agent/ })).toHaveAttribute('href', '/agents')
  })

  it('selects fallback player counts and boards, initializes seats, and rerolls names', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: '准备一场对局' })).toBeVisible()
    expect(screen.getByRole('button', { name: '2 人' })).toHaveAttribute('aria-pressed', 'true')
    await arrangeSeats()
    await waitFor(() => expect(seatNameInputs()).toHaveLength(2))
    expect(screen.getAllByRole('combobox', { name: 'Agent 配置' })[0]).toHaveAttribute(
      'data-value',
      'profile-second',
    )
    expect(document.querySelector('.aw-seat-config__portrait img')).toHaveAttribute(
      'src',
      '/api/character-assets/portrait-test',
    )
    const before = seatNameInputs()[1]!.value
    await userEvent.click(screen.getAllByRole('button', { name: '换一个名字' })[1]!)
    expect(seatNameInputs()[1]!.value).not.toBe(before)
    await userEvent.click(screen.getByRole('button', { name: '全部换名' }))
    expect(new Set(seatNameInputs().map((input) => input.value)).size).toBe(2)

    await userEvent.click(screen.getByRole('button', { name: '选择牌组' }))
    await userEvent.click(screen.getByRole('button', { name: '3 人' }))
    await arrangeSeats()
    expect(seatNameInputs()).toHaveLength(3)
  })

  it('changes Characters and Profiles and preserves unique generated names', async () => {
    renderPage()
    await screen.findByRole('heading', { name: '准备一场对局' })
    await arrangeSeats()
    await waitFor(() => expect(seatNameInputs()).toHaveLength(2))
    const characterSelects = screen.getAllByRole('combobox', { name: '扮演角色' })
    await userEvent.click(characterSelects[1]!)
    await userEvent.click(screen.getByRole('option', { name: /固定角色/ }))
    expect(seatNameInputs()[1]!.value).toBe('固定角色')
    await userEvent.click(screen.getAllByRole('combobox', { name: '扮演角色' })[1]!)
    await userEvent.click(screen.getByRole('option', { name: '无角色' }))
    expect(seatNameInputs()[1]!.value).not.toBe('固定角色')

    const profileSelect = screen.getAllByRole('combobox', { name: 'Agent 配置' })[1]!
    await userEvent.click(profileSelect)
    await userEvent.click(screen.getByRole('option', { name: /Second Profile/ }))
    expect(profileSelect).toHaveAttribute('data-value', 'profile-second')
  })

  it('marks duplicate/blank names and swaps manual roles without changing the role multiset', async () => {
    renderPage()
    await screen.findByRole('heading', { name: '准备一场对局' })
    await arrangeSeats()
    await waitFor(() => expect(seatNameInputs()).toHaveLength(2))
    const names = seatNameInputs()
    fireEvent.change(names[0]!, { target: { value: '重复名' } })
    fireEvent.change(names[1]!, { target: { value: ' 重复名 ' } })
    expect(screen.getAllByText(/玩家昵称必须唯一/u)).toHaveLength(2)
    expect(screen.getByRole('button', { name: '开始对局' })).toBeDisabled()
    fireEvent.change(names[1]!, { target: { value: '' } })
    expect(screen.getByRole('button', { name: '开始对局' })).toBeDisabled()
    fireEvent.change(names[1]!, { target: { value: '唯一名' } })

    await userEvent.click(screen.getByRole('button', { name: '指定身份' }))
    const roleSelects = screen.getAllByRole('combobox', { name: '身份牌' })
    const before = roleSelects.map((select) => select.getAttribute('data-value')).sort()
    await userEvent.click(roleSelects[0]!)
    await userEvent.click(screen.getByRole('option', { name: '平民' }))
    await userEvent.click(roleSelects[0]!)
    await userEvent.click(screen.getByRole('option', { name: '狼人' }))
    expect(roleSelects.map((select) => select.getAttribute('data-value')).sort()).toEqual(before)
  })

  it('creates random and manual matches, navigates, and recovers from start failures', async () => {
    renderPage()
    await screen.findByRole('heading', { name: '准备一场对局' })
    await arrangeSeats()
    await waitFor(() => expect(seatNameInputs()).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: '开始对局' }))
    expect(apiMocks.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({ roleAssignment: 'random' }),
    )
    expect(apiMocks.createMatch.mock.calls[0]![0].seats[0]).not.toHaveProperty('roleId')
    expect(await screen.findByText('navigated match')).toBeVisible()

    apiMocks.createMatch.mockRejectedValueOnce(new Error('create failed'))
    const secondRender = renderPage()
    await screen.findByRole('heading', { name: '准备一场对局' })
    await arrangeSeats()
    await waitFor(() => expect(seatNameInputs()).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: '指定身份' }))
    await userEvent.click(screen.getByRole('button', { name: '开始对局' }))
    expect(await screen.findByText('create failed')).toBeVisible()
    expect(screen.getByRole('button', { name: '开始对局' })).toBeEnabled()
    expect(apiMocks.createMatch.mock.calls.at(-1)![0].seats[0]).toHaveProperty('roleId')
    apiMocks.createMatch.mockRejectedValueOnce('string create failed')
    await userEvent.click(screen.getByRole('button', { name: '开始对局' }))
    expect(await screen.findByText('string create failed')).toBeVisible()
    secondRender.unmount()
  })

  it('retries the saved Match after a start failure and keeps its setup locked', async () => {
    apiMocks.startMatch
      .mockRejectedValueOnce(new Error('start response failed'))
      .mockRejectedValueOnce(new Error('start still unavailable'))
    renderPage()
    await screen.findByRole('heading', { name: '准备一场对局' })
    await arrangeSeats()
    await userEvent.click(screen.getByRole('button', { name: '开始对局' }))
    expect(await screen.findByText('start response failed', { exact: false })).toBeVisible()
    expect(screen.getByText('牌局已保存，配置已锁定。重试将继续启动这场牌局。')).toBeVisible()
    expect(screen.getByRole('button', { name: '选择牌组' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '应用到全部席位' })).toBeDisabled()
    expect(seatNameInputs().every((input) => input.closest('fieldset')?.disabled)).toBe(true)
    expect(screen.getByRole('link', { name: '返回大厅' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: '返回选牌' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '重试启动' }))
    expect(await screen.findByText('start still unavailable', { exact: false })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试启动' }))
    expect(await screen.findByText('navigated match')).toBeVisible()
    expect(apiMocks.createMatch).toHaveBeenCalledTimes(1)
    expect(apiMocks.startMatch.mock.calls).toEqual([
      [matchView().id],
      [matchView().id],
      [matchView().id],
    ])
  })

  it('prefers the twelve-player board when available and marks custom boards', async () => {
    apiMocks.listBoards.mockResolvedValue([
      board('board-six', 6),
      board('board-twelve', 12, { source: 'custom', editable: true }),
    ])
    renderPage()
    expect(await screen.findByRole('button', { name: /12 人板子/ })).toHaveAttribute(
      'data-selected',
      'true',
    )
    expect(screen.getByText('自建板型')).toBeVisible()
    await arrangeSeats()
    await waitFor(() => expect(seatNameInputs()).toHaveLength(12))
  })

  it('shows reserve slots and submits the complete manual role-card pool', async () => {
    apiMocks.listBoards.mockResolvedValue([
      board('board-thief-six', 6, {
        name: '6 人盗贼板',
        cardCount: 8,
        reserveCount: 2,
        roles: [
          { roleId: 'role-werewolf', count: 2, name: '狼人' },
          { roleId: 'role-villager', count: 4, name: '平民' },
          { roleId: 'role-cupid', count: 1, name: '丘比特' },
          { roleId: 'role-thief', count: 1, name: '盗贼' },
        ] as BoardSummary['roles'],
      }),
    ])
    renderPage()
    expect(await screen.findByText('6 席 · 8 张身份牌 · 2 张底牌')).toBeVisible()
    await arrangeSeats()
    await waitFor(() => expect(seatNameInputs()).toHaveLength(6))
    await userEvent.click(screen.getByRole('button', { name: '指定身份' }))
    const firstReserve = screen.getByRole('combobox', { name: '底牌 1' })
    const secondReserve = screen.getByRole('combobox', { name: '底牌 2' })
    expect(firstReserve).toHaveAttribute('data-value', 'role-cupid')
    expect(secondReserve).toHaveAttribute('data-value', 'role-thief')
    await userEvent.click(firstReserve)
    await userEvent.click(screen.getByRole('option', { name: '平民' }))
    expect(firstReserve).toHaveAttribute('data-value', 'role-villager')
    expect(
      screen
        .getAllByRole('combobox', { name: '身份牌' })
        .some((select) => select.getAttribute('data-value') === 'role-cupid'),
    ).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: '开始对局' }))
    expect(apiMocks.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        roleAssignment: 'manual',
        manualReserveRoleIds: ['role-villager', 'role-thief'],
      }),
    )
  })
})

function seatNameInputs(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('.aw-seat-config input.aw-input')]
}

async function arrangeSeats(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: '确认牌组，安排玩家' }))
}
