import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({
  globalSettings: vi.fn(),
  updateGlobalSettings: vi.fn(),
  listMatches: vi.fn(),
  deleteMatch: vi.fn(),
}))
const runtime = vi.hoisted(() => ({ developerMode: true }))

vi.mock('../src/api.js', () => ({ api: apiMocks }))
vi.mock('../src/hooks/useRuntimeConfig.js', () => ({ useRuntimeConfig: () => runtime }))
vi.mock('../src/components/SimulationWizardDialog.js', () => ({
  SimulationWizardDialog: ({
    match,
    onClose,
  }: {
    match: { boardName: string } | null
    onClose: () => void
  }) =>
    match ? (
      <div data-testid="simulation-dialog">
        {match.boardName}
        <button type="button" onClick={onClose}>
          close simulation
        </button>
      </div>
    ) : null,
}))

import { LobbyPage } from '../src/pages/LobbyPage.js'
import { SettingsPage } from '../src/pages/SettingsPage.js'
import { matchView } from './fixtures/match.js'

beforeEach(() => {
  for (const mock of Object.values(apiMocks)) mock.mockReset()
  runtime.developerMode = true
})

describe('SettingsPage', () => {
  it('loads, edits, saves, clears prior errors, and reports success', async () => {
    apiMocks.globalSettings.mockResolvedValue({ speechCharacterLimit: 240 })
    let resolveSave!: (value: { speechCharacterLimit: number }) => void
    apiMocks.updateGlobalSettings.mockReturnValue(
      new Promise((resolvePromise) => {
        resolveSave = resolvePromise
      }),
    )
    render(<SettingsPage />)
    expect(screen.getByRole('status')).toBeVisible()
    const input = await screen.findByRole('spinbutton', { name: /建议发言字数/ })
    expect(input).toHaveValue(240)
    fireEvent.change(input, { target: { value: '360' } })
    await userEvent.click(screen.getByRole('button', { name: '保存设置' }))
    expect(screen.getByRole('button', { name: '保存中' })).toBeDisabled()
    expect(apiMocks.updateGlobalSettings).toHaveBeenCalledWith({ speechCharacterLimit: 360 })
    resolveSave({ speechCharacterLimit: 360 })
    expect(await screen.findByText('全局设置已保存。')).toBeVisible()
    expect(input).toHaveValue(360)
  })

  it('handles load Error/string causes, retry, validation, and save failures', async () => {
    apiMocks.globalSettings
      .mockRejectedValueOnce(new Error('load error'))
      .mockRejectedValueOnce('string load error')
      .mockResolvedValueOnce({ speechCharacterLimit: 200 })
    apiMocks.updateGlobalSettings
      .mockRejectedValueOnce('save failed')
      .mockResolvedValueOnce({ speechCharacterLimit: 220 })
    render(<SettingsPage />)
    expect(await screen.findByText('load error')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('string load error')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    const input = await screen.findByRole('spinbutton')
    fireEvent.change(input, { target: { value: '1' } })
    await userEvent.click(screen.getByRole('button', { name: '保存设置' }))
    expect(await screen.findByText(/Too small|太小|greater than/u)).toBeVisible()
    fireEvent.change(input, { target: { value: '220' } })
    await userEvent.click(screen.getByRole('button', { name: '保存设置' }))
    expect(await screen.findByText('save failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '保存设置' }))
    expect(await screen.findByText('全局设置已保存。')).toBeVisible()
  })
})

describe('LobbyPage', () => {
  it('renders loading, load failures, retry, empty, and refresh states', async () => {
    apiMocks.listMatches
      .mockRejectedValueOnce(new Error('load failed'))
      .mockRejectedValueOnce('string failed')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    render(
      <MemoryRouter>
        <LobbyPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('load failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('string failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('村庄还没有开局')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '刷新列表' }))
    expect(apiMocks.listMatches).toHaveBeenCalledTimes(4)
  })

  it('renders product and developer actions with simulation eligibility', async () => {
    const running = matchView({ id: 'match-running', boardName: 'Running' })
    const paused = matchView({ id: 'match-paused', boardName: 'Paused', status: 'paused' })
    const ended = matchView({
      id: 'match-ended',
      boardName: 'Ended',
      status: 'ended',
      winner: 'village',
    })
    const collecting = matchView({
      id: 'match-collecting',
      boardName: 'Collecting',
      status: 'ended',
      winner: 'village',
      postgameReview: { state: 'collecting' } as never,
    })
    const completed = matchView({
      id: 'match-completed',
      boardName: 'Completed',
      status: 'ended',
      winner: 'village',
      postgameReview: { state: 'completed' } as never,
    })
    apiMocks.listMatches.mockResolvedValue([running, paused, ended, collecting, completed])
    render(
      <MemoryRouter>
        <LobbyPage />
      </MemoryRouter>,
    )
    await screen.findByText('Running')
    expect(screen.getAllByRole('link', { name: '进入观战' })).toHaveLength(5)
    expect(screen.getAllByRole('link', { name: '查看轨迹' })).toHaveLength(5)
    const simulation = screen.getAllByRole('button', { name: '添加仿真' })
    expect(simulation[0]).toBeDisabled()
    expect(simulation[1]).toBeEnabled()
    expect(simulation[2]).toBeEnabled()
    expect(simulation[3]).toBeDisabled()
    expect(simulation[4]).toBeEnabled()
    await userEvent.click(simulation[1]!)
    expect(screen.getByTestId('simulation-dialog')).toHaveTextContent('Paused')
    await userEvent.click(screen.getByRole('button', { name: 'close simulation' }))
    expect(screen.queryByTestId('simulation-dialog')).not.toBeInTheDocument()
  })

  it('deletes matches, cancels confirmation, and reports delete failures', async () => {
    const first = matchView({ id: 'match-first', boardName: 'First' })
    const second = matchView({ id: 'match-second', boardName: 'Second' })
    apiMocks.listMatches.mockResolvedValueOnce([first, second]).mockResolvedValueOnce([second])
    apiMocks.deleteMatch.mockResolvedValueOnce(undefined).mockRejectedValueOnce('delete failed')
    render(
      <MemoryRouter>
        <LobbyPage />
      </MemoryRouter>,
    )
    await screen.findByText('First')
    const deleteButtons = document.querySelectorAll<HTMLButtonElement>('.aw-button--danger')
    await userEvent.click(deleteButtons[0]!)
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(apiMocks.deleteMatch).not.toHaveBeenCalled()
    await userEvent.click(deleteButtons[0]!)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '删除对局' }),
    )
    await waitFor(() => expect(screen.queryByText('First')).not.toBeInTheDocument())
    await userEvent.click(document.querySelector<HTMLButtonElement>('.aw-button--danger')!)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '删除对局' }),
    )
    expect(await screen.findByText('delete failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(screen.getByText('Second')).toBeVisible()
  })

  it('hides developer-only controls in public mode', async () => {
    runtime.developerMode = false
    apiMocks.listMatches.mockResolvedValue([matchView()])
    render(
      <MemoryRouter>
        <LobbyPage />
      </MemoryRouter>,
    )
    await screen.findByText('测试板子')
    expect(screen.queryByRole('link', { name: '查看轨迹' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '添加仿真' })).not.toBeInTheDocument()
  })
})
