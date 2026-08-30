import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCopy } from '@agentwolf/assets'
import type { AgentProfile, AgentProbeResult, AgentTool } from '@agentwolf/contracts'

const apiMocks = vi.hoisted(() => ({
  listTools: vi.fn(),
  listProfiles: vi.fn(),
  discoverTool: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  probeProfile: vi.fn(),
  createTool: vi.fn(),
}))

vi.mock('../src/api.js', () => ({ api: apiMocks }))
vi.mock('../src/hooks/useProfileOrdering.js', () => ({
  useProfileOrdering: () => ({
    reordering: false,
    draggingProfileId: null,
    dropTarget: null,
    startProfileDrag: vi.fn(),
    updateProfileDropTarget: vi.fn(),
    allowProfileDrop: vi.fn(),
    finishProfileDrop: vi.fn(),
    cancelProfileDrag: vi.fn(),
    moveProfileWithKeyboard: vi.fn(),
  }),
}))

import { AgentsPage } from '../src/pages/AgentsPage.js'

const tool = {
  id: 'tool-test',
  name: 'Test Tool',
  kind: 'custom',
  command: 'node',
  args: [],
  environment: {},
  initialMode: 'read-only',
  modelConfigKey: 'model',
  builtIn: false,
} as unknown as AgentTool
const secondTool = {
  ...tool,
  id: 'tool-second',
  name: 'Second Tool',
  builtIn: true,
  initialMode: undefined,
} as AgentTool
const profile = {
  id: 'profile-test',
  name: 'Existing Profile',
  toolId: tool.id,
  model: 'model-a',
  reasoningEffort: 'high',
  mode: 'read-only',
  promptTimeoutMs: 5000,
  connection: { endpoint: 'local' },
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
} as unknown as AgentProfile

function probe(overrides: Partial<AgentProbeResult> = {}): AgentProbeResult {
  return {
    ok: true,
    agentName: 'Mock',
    models: ['model-a', 'model-b'],
    currentModel: 'model-a',
    reasoningEfforts: ['low', 'high'],
    currentReasoningEffort: 'low',
    modes: ['read-only'],
    message: 'ok',
    durationMs: 1,
    ...overrides,
  }
}

beforeEach(() => {
  for (const mock of Object.values(apiMocks)) mock.mockReset()
  apiMocks.listTools.mockResolvedValue([tool, secondTool])
  apiMocks.listProfiles.mockResolvedValue([profile])
  apiMocks.discoverTool.mockResolvedValue(probe())
  apiMocks.createProfile.mockResolvedValue(profile)
  apiMocks.updateProfile.mockResolvedValue(profile)
  apiMocks.deleteProfile.mockResolvedValue(undefined)
  apiMocks.probeProfile.mockResolvedValue(probe({ message: 'probe ok' }))
  apiMocks.createTool.mockResolvedValue(tool)
})

describe('AgentsPage', () => {
  it('handles Error/string load failures, retries, and empty profile state', async () => {
    apiMocks.listTools
      .mockRejectedValueOnce(new Error('load failed'))
      .mockRejectedValueOnce('string load failed')
      .mockResolvedValueOnce([tool])
    apiMocks.listProfiles
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    render(<AgentsPage />)
    expect(await screen.findByText('load failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: getCopy('common.retry') }))
    expect(await screen.findByText('string load failed')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: getCopy('common.retry') }))
    expect(await screen.findByText(getCopy('agents.empty'))).toBeVisible()
  })

  it('creates a Profile with discovered model/reasoning and reports validation/save failures', async () => {
    apiMocks.listProfiles.mockResolvedValue([])
    apiMocks.createProfile
      .mockRejectedValueOnce(new Error('save failed'))
      .mockRejectedValueOnce('save string failed')
      .mockResolvedValueOnce(profile)
    render(<AgentsPage />)
    await waitFor(() => expect(apiMocks.discoverTool).toHaveBeenCalledWith(tool.id, {}))
    const editor = document.querySelector<HTMLElement>('.aw-agent-editor')!
    expect(within(editor).getByRole('spinbutton')).toHaveValue(600_000)
    const textboxes = within(editor).getAllByRole('textbox')
    fireEvent.change(textboxes[0]!, { target: { value: 'New Profile' } })
    const model = within(editor).getByRole('combobox', { name: getCopy('agents.model') })
    await waitFor(() => expect(model).toBeEnabled())
    await userEvent.click(model)
    await userEvent.click(screen.getByRole('option', { name: 'model-b' }))
    const reasoning = within(editor).getByRole('combobox', {
      name: getCopy('agentFields.reasoningEffort'),
    })
    await waitFor(() => expect(reasoning).toBeEnabled())
    await userEvent.click(reasoning)
    await userEvent.click(screen.getByRole('option', { name: 'high' }))
    fireEvent.change(within(editor).getByRole('spinbutton'), { target: { value: '6000' } })
    fireEvent.change(textboxes.at(-1)!, { target: { value: '{' } })
    const save = within(editor).getByRole('button', { name: getCopy('agents.save') })
    await userEvent.click(save)
    await waitFor(() => expect(document.querySelector('.aw-form-message--error')).not.toBeNull())
    fireEvent.change(textboxes.at(-1)!, { target: { value: '{"endpoint":"local"}' } })
    await userEvent.click(save)
    expect(await screen.findByText('save failed')).toBeVisible()
    await userEvent.click(save)
    expect(await screen.findByText('save string failed')).toBeVisible()
    await userEvent.click(save)
    expect(apiMocks.createProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'New Profile',
        model: 'model-b',
        reasoningEffort: 'high',
        promptTimeoutMs: 6000,
        connection: { endpoint: 'local' },
      }),
    )
    expect(await screen.findByText(getCopy('common.saveSuccess'))).toBeVisible()
  })

  it('selects, updates, probes, and deletes an existing Profile', async () => {
    apiMocks.updateProfile.mockRejectedValueOnce('update failed').mockResolvedValueOnce(profile)
    apiMocks.probeProfile
      .mockResolvedValueOnce(probe({ ok: false, message: 'probe bad' }))
      .mockRejectedValueOnce(new Error('probe failed'))
      .mockRejectedValueOnce('probe string failed')
    apiMocks.deleteProfile
      .mockRejectedValueOnce(new Error('delete failed'))
      .mockRejectedValueOnce('delete string failed')
      .mockResolvedValueOnce(undefined)
    render(<AgentsPage />)
    await screen.findByText('Existing Profile')
    await userEvent.click(screen.getByText('Existing Profile'))
    const editor = document.querySelector<HTMLElement>('.aw-agent-editor')!
    const save = within(editor).getByRole('button', { name: getCopy('agents.save') })
    await waitFor(() => expect(save).toBeEnabled())
    await userEvent.click(save)
    expect(await screen.findByText('update failed')).toBeVisible()
    await userEvent.click(save)
    expect(apiMocks.updateProfile).toHaveBeenCalled()

    const probeButton = within(editor).getByRole('button', { name: getCopy('agents.probe') })
    await userEvent.click(probeButton)
    expect(await screen.findByText(/probe bad/u)).toBeVisible()
    await userEvent.click(probeButton)
    expect(await screen.findByText('probe failed')).toBeVisible()
    await userEvent.click(probeButton)
    expect(await screen.findByText('probe string failed')).toBeVisible()

    const deleteButton = within(editor).getByRole('button', { name: getCopy('agents.delete') })
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '取消' }),
    )
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: getCopy('agents.delete'),
      }),
    )
    expect(await screen.findByText('delete failed')).toBeVisible()
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: getCopy('agents.delete'),
      }),
    )
    expect(await screen.findByText('delete string failed')).toBeVisible()
    await userEvent.click(deleteButton)
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: getCopy('agents.delete'),
      }),
    )
    expect(apiMocks.deleteProfile).toHaveBeenCalledTimes(3)
  })

  it('handles failed discovery fallback, empty models, thrown errors, caching, and tool changes', async () => {
    apiMocks.discoverTool
      .mockResolvedValueOnce(probe({ ok: false, message: 'preferred failed' }))
      .mockResolvedValueOnce(probe({ models: [], currentModel: undefined }))
      .mockRejectedValueOnce(new Error('discover failed'))
      .mockRejectedValueOnce('discover string failed')
      .mockResolvedValue(probe())
    render(<AgentsPage />)
    await waitFor(() => expect(apiMocks.discoverTool).toHaveBeenCalledOnce())
    expect(await screen.findByText(/preferred failed/u)).toBeVisible()

    const toolSelect = screen.getByRole('combobox', { name: getCopy('agents.tool') })
    await userEvent.click(toolSelect)
    await userEvent.click(screen.getByRole('option', { name: secondTool.name }))
    expect(await screen.findByText(/未返回可选模型/u)).toBeVisible()
    await userEvent.click(toolSelect)
    await userEvent.click(screen.getByRole('option', { name: tool.name }))
    expect(await screen.findByText(/discover failed/u)).toBeVisible()
    await userEvent.click(toolSelect)
    await userEvent.click(screen.getByRole('option', { name: secondTool.name }))
    expect(await screen.findByText(/未返回可选模型/u)).toBeVisible()
    await userEvent.click(toolSelect)
    await userEvent.click(screen.getByRole('option', { name: tool.name }))
    expect(await screen.findByText(/discover string failed/u)).toBeVisible()
    await userEvent.click(toolSelect)
    await userEvent.click(screen.getByRole('option', { name: secondTool.name }))
    await userEvent.click(toolSelect)
    await userEvent.click(screen.getByRole('option', { name: tool.name }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: getCopy('agents.model') })).toBeEnabled(),
    )
  })

  it('creates and closes custom tools and reports validation/API failures', async () => {
    apiMocks.createTool
      .mockRejectedValueOnce(new Error('tool failed'))
      .mockRejectedValueOnce('tool string failed')
      .mockResolvedValueOnce(tool)
    render(<AgentsPage />)
    await screen.findByText('Existing Profile')
    const toggle = screen.getByRole('button', { name: getCopy('agentFields.newTool') })
    await userEvent.click(toggle)
    let toolEditor = document.querySelector<HTMLElement>('.aw-tool-editor')!
    let controls = within(toolEditor).getAllByRole('textbox')
    const values = ['Custom Tool', 'node', ' --one \n\n --two ', '{', 'read-only', 'model']
    values.forEach((value, index) => fireEvent.change(controls[index]!, { target: { value } }))
    await userEvent.click(
      within(toolEditor).getByRole('button', { name: getCopy('agentFields.saveTool') }),
    )
    await waitFor(() => expect(document.querySelector('.aw-form-message--error')).not.toBeNull())
    fireEvent.change(controls[3]!, { target: { value: '{}' } })
    await userEvent.click(
      within(toolEditor).getByRole('button', { name: getCopy('agentFields.saveTool') }),
    )
    expect(await screen.findByText('tool failed')).toBeVisible()
    await userEvent.click(
      within(toolEditor).getByRole('button', { name: getCopy('agentFields.saveTool') }),
    )
    expect(await screen.findByText('tool string failed')).toBeVisible()
    await userEvent.click(
      within(toolEditor).getByRole('button', { name: getCopy('agentFields.saveTool') }),
    )
    expect(apiMocks.createTool).toHaveBeenLastCalledWith(
      expect.objectContaining({ args: ['--one', '--two'], initialMode: 'read-only' }),
    )
    await waitFor(() => expect(document.querySelector('.aw-tool-editor')).toBeNull())

    await userEvent.click(toggle)
    toolEditor = document.querySelector<HTMLElement>('.aw-tool-editor')!
    await userEvent.click(within(toolEditor).getByRole('button', { name: getCopy('common.close') }))
    expect(document.querySelector('.aw-tool-editor')).toBeNull()
  })
})
