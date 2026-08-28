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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/matches/new']}>
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
    expect(await screen.findByRole('heading', { name: '编排今晚的对局' })).toBeVisible()
    expect(screen.getByRole('button', { name: '2 人' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(seatNameInputs()).toHaveLength(2))
    expect(screen.getAllByRole('combobox', { name: 'Agent 配置' })[0]).toHaveAttribute(
      'data-value',
      'profile-second',
    )
    expect(screen.getByAltText('')).toHaveAttribute('src', '/api/character-assets/portrait-test')
    const before = seatNameInputs()[1]!.value
    await userEvent.click(screen.getAllByTitle('换一个名字')[1]!)
    expect(seatNameInputs()[1]!.value).not.toBe(before)
    await userEvent.click(screen.getByRole('button', { name: '全部换名' }))
    expect(new Set(seatNameInputs().map((input) => input.value)).size).toBe(2)

    await userEvent.click(screen.getByRole('button', { name: '3 人' }))
    expect(seatNameInputs()).toHaveLength(3)
  })

  it('changes Characters and Profiles and preserves unique generated names', async () => {
    renderPage()
    await screen.findByRole('heading', { name: '编排今晚的对局' })
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
    await screen.findByRole('heading', { name: '编排今晚的对局' })
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
    await screen.findByRole('heading', { name: '编排今晚的对局' })
    await waitFor(() => expect(seatNameInputs()).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: '开始对局' }))
    expect(apiMocks.createMatch).toHaveBeenCalledWith(
      expect.objectContaining({ roleAssignment: 'random' }),
    )
    expect(apiMocks.createMatch.mock.calls[0]![0].seats[0]).not.toHaveProperty('roleId')
    expect(await screen.findByText('navigated match')).toBeVisible()

    apiMocks.createMatch.mockRejectedValueOnce(new Error('create failed'))
    const secondRender = renderPage()
    await screen.findByRole('heading', { name: '编排今晚的对局' })
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
    expect(screen.getByText('自建')).toBeVisible()
    await waitFor(() => expect(seatNameInputs()).toHaveLength(12))
  })
})

function seatNameInputs(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('.aw-seat-config input.aw-input')]
}
