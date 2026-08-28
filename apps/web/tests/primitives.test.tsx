import { useState } from 'react'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentProfileSchema, type AgentProfile } from '@agentwolf/contracts'

const apiMocks = vi.hoisted(() => ({
  reorderProfiles: vi.fn(),
  runtimeConfig: vi.fn(),
}))

vi.mock('../src/api.js', () => ({ api: apiMocks }))

import { AgentProfileList } from '../src/components/AgentProfileList.js'
import { AppShell } from '../src/components/AppShell.js'
import { ErrorState, LoadingState } from '../src/components/AsyncState.js'
import { ConfirmDialog } from '../src/components/ConfirmDialog.js'
import {
  CustomToolEditor,
  emptyToolDraft,
  type ToolDraft,
} from '../src/components/CustomToolEditor.js'
import { FormField } from '../src/components/FormField.js'
import { GameSelect } from '../src/components/GameSelect.js'
import { ModalDialog } from '../src/components/ModalDialog.js'
import { RoleBadge } from '../src/components/RoleBadge.js'
import { StatusBadge } from '../src/components/StatusBadge.js'
import { useProfileOrdering } from '../src/hooks/useProfileOrdering.js'
import { RuntimeConfigProvider, useRuntimeConfig } from '../src/hooks/useRuntimeConfig.js'

const firstProfile = AgentProfileSchema.parse({
  id: 'profile-first',
  name: 'First Agent',
  toolId: 'tool-test',
  model: 'model-a',
  reasoningEffort: 'high',
  promptTimeoutMs: 5_000,
  connection: {},
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
})
const secondProfile = AgentProfileSchema.parse({
  ...firstProfile,
  id: 'profile-second',
  name: 'Second Agent',
  reasoningEffort: undefined,
})
const thirdProfile = AgentProfileSchema.parse({
  ...firstProfile,
  id: 'profile-third',
  name: 'Third Agent',
})

beforeEach(() => {
  apiMocks.reorderProfiles.mockReset()
  apiMocks.runtimeConfig.mockReset()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0)
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
})

describe('small presentation primitives', () => {
  it('renders loading, errors, fields, roles, and statuses', async () => {
    const retry = vi.fn()
    const { rerender } = render(<LoadingState />)
    expect(screen.getByRole('status')).toHaveTextContent('正在准备')
    rerender(<ErrorState message="network down" retry={retry} />)
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('network down')

    rerender(
      <FormField label="名称" hint="请输入" wide>
        <input />
      </FormField>,
    )
    expect(screen.getByText('请输入')).toBeVisible()
    expect(screen.getByText('名称').closest('label')).toHaveAttribute('data-wide', 'true')
    rerender(
      <FormField label="无提示">
        <input />
      </FormField>,
    )
    expect(screen.queryByText('请输入')).not.toBeInTheDocument()

    rerender(<RoleBadge className="custom" label="女巫" roleId={'role-witch' as never} />)
    expect(screen.getByText('女巫')).toHaveClass('aw-role-badge', 'custom')
    expect(screen.getByText('女巫')).toHaveAttribute('data-role-id', 'role-witch')
    rerender(<RoleBadge label="身份未公开" />)
    expect(screen.getByText('身份未公开')).toHaveAttribute('data-role-id', 'hidden')

    rerender(<StatusBadge status="paused" />)
    expect(screen.getByText('对局暂停')).toHaveClass('aw-status--paused')
  })

  it('renders the application shell and active navigation', () => {
    render(
      <MemoryRouter initialEntries={['/boards']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="boards" element={<main>Board outlet</main>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Board outlet')).toBeVisible()
    expect(screen.getByRole('link', { name: '板子管理' })).toHaveClass('active')
    expect(screen.getAllByRole('link')).toHaveLength(7)
  })
})

describe('dialogs', () => {
  it('traps focus, closes from keyboard and backdrop, and restores focus', async () => {
    const user = userEvent.setup()
    const close = vi.fn()
    const trigger = document.createElement('button')
    trigger.textContent = 'trigger'
    document.body.append(trigger)
    trigger.focus()
    const { rerender, unmount } = render(
      <ModalDialog className="dialog" labelledBy="title" open onClose={close}>
        <h2 id="title">Dialog</h2>
        <button data-dialog-action>First</button>
        <button data-dialog-action>Last</button>
      </ModalDialog>,
      { container: document.getElementById('root') ?? undefined },
    )
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    screen.getByRole('button', { name: 'Last' }).focus()
    await user.keyboard('{Tab}')
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(close).toHaveBeenCalledOnce()
    fireEvent.pointerDown(screen.getByRole('dialog').parentElement!)
    expect(close).toHaveBeenCalledTimes(2)

    rerender(
      <ModalDialog busy className="dialog" labelledBy="title" open onClose={close}>
        <h2 id="title">Dialog</h2>
        <button data-dialog-action disabled>
          Disabled
        </button>
      </ModalDialog>,
    )
    await user.keyboard('{Escape}')
    fireEvent.pointerDown(screen.getByRole('dialog').parentElement!)
    expect(close).toHaveBeenCalledTimes(2)
    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('supports confirm, cancel, busy, and closed states', async () => {
    const confirm = vi.fn()
    const cancel = vi.fn()
    const { rerender } = render(
      <ConfirmDialog
        confirmLabel="确定删除"
        description="无法撤销"
        open
        title="删除对象"
        onCancel={cancel}
        onConfirm={confirm}
      />,
    )
    expect(screen.getByRole('alertdialog', { name: '删除对象' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    await userEvent.click(screen.getByRole('button', { name: '确定删除' }))
    expect(cancel).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenCalledOnce()
    rerender(
      <ConfirmDialog
        busy
        confirmLabel="确定删除"
        description="无法撤销"
        open
        title="删除对象"
        onCancel={cancel}
        onConfirm={confirm}
      />,
    )
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '确定删除' })).toBeDisabled()
    rerender(
      <ConfirmDialog
        confirmLabel="确定删除"
        description="无法撤销"
        open={false}
        title="删除对象"
        onCancel={cancel}
        onConfirm={confirm}
      />,
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('GameSelect', () => {
  const options = [
    { value: 'alpha', label: 'Alpha' },
    { value: 'disabled', label: 'Disabled', disabled: true },
    { value: 'bravo', label: 'Bravo', content: <strong>Bravo rich</strong> },
  ] as const

  it('opens, positions, navigates, searches, and selects enabled options', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    render(
      <GameSelect
        ariaLabel="Choice"
        options={options}
        placeholder="Choose"
        value=""
        onChange={change}
      />,
    )
    const trigger = screen.getByRole('combobox', { name: 'Choice' })
    expect(trigger).toHaveTextContent('Choose')
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      value: () => ({ left: -10, right: 90, top: 10, bottom: 40, width: 100, height: 30 }),
    })
    await user.click(trigger)
    const listbox = screen.getByRole('listbox', { name: 'Choice' })
    expect(listbox).toHaveFocus()
    expect(listbox).toHaveStyle({ '--aw-select-left': '12px' })
    await user.keyboard('{ArrowDown}')
    expect(listbox).toHaveAttribute('aria-activedescendant', expect.stringContaining('option-2'))
    await user.keyboard('{Enter}')
    expect(change).toHaveBeenCalledWith('bravo')
    expect(listbox).not.toBeInTheDocument()

    trigger.focus()
    await user.keyboard('{ArrowUp}')
    await user.keyboard('{Home}')
    await user.keyboard('b')
    await user.keyboard(' ')
    expect(change).toHaveBeenLastCalledWith('bravo')
  })

  it('handles disabled, empty, pointer, escape, tab, outside click, and open-above layouts', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    const { rerender } = render(
      <GameSelect ariaLabel="Choice" options={[]} value="" onChange={change} />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Choice' }))
    expect(screen.getByText('没有可选项')).toBeVisible()
    await user.keyboard('{ArrowDown}{End}{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    rerender(<GameSelect ariaLabel="Choice" options={options} value="alpha" onChange={change} />)
    const trigger = screen.getByRole('combobox', { name: 'Choice' })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 180 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 260 })
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      value: () => ({ left: 230, right: 250, top: 130, bottom: 160, width: 20, height: 30 }),
    })
    await user.click(trigger)
    const disabled = screen.getByRole('option', { name: 'Disabled' })
    fireEvent.pointerEnter(disabled)
    await user.click(disabled)
    expect(change).not.toHaveBeenCalled()
    fireEvent.pointerEnter(screen.getByRole('option', { name: /Bravo/ }))
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.click(trigger)
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())

    rerender(
      <GameSelect disabled ariaLabel="Choice" options={options} value="alpha" onChange={change} />,
    )
    expect(screen.getByRole('combobox', { name: 'Choice' })).toBeDisabled()
  })

  it('covers trigger keyboard navigation, disabled active values, typeahead timers, and empty selection', () => {
    const change = vi.fn()
    const { rerender, unmount } = render(
      <GameSelect ariaLabel="Choice" options={options} value="disabled" onChange={change} />,
    )
    const trigger = screen.getByRole('combobox', { name: 'Choice' })
    expect(trigger).toHaveTextContent('Disabled')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'Home' })
    fireEvent.keyDown(trigger, { key: 'End' })
    fireEvent.keyDown(trigger, { key: 'a' })
    fireEvent.keyDown(trigger, { key: 'l' })
    fireEvent.keyDown(trigger, { key: 'z' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.keyDown(trigger, { key: 'Escape' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })

    const nonNodePointer = new Event('pointerdown', { bubbles: true })
    Object.defineProperty(nonNodePointer, 'target', { value: { outside: true } })
    document.dispatchEvent(nonNodePointer)

    rerender(<GameSelect ariaLabel="Choice" options={[]} value="" onChange={change} />)
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Choice' }), { key: 'ArrowDown' })
    const listbox = screen.getByRole('listbox', { name: 'Choice' })
    fireEvent.keyDown(listbox, { key: 'Enter' })
    fireEvent.keyDown(listbox, { key: ' ' })
    fireEvent.keyDown(listbox, { key: 'Home' })
    fireEvent.keyDown(listbox, { key: 'End' })
    expect(change).not.toHaveBeenCalled()
    unmount()
  })
})

describe('Agent editor and ordering', () => {
  it('edits every custom-tool field and dispatches close/save', async () => {
    const changes: ToolDraft[] = []
    const close = vi.fn()
    const save = vi.fn()
    function Harness() {
      const [draft, setDraft] = useState(emptyToolDraft)
      return (
        <CustomToolEditor
          busy={false}
          draft={draft}
          onChange={(next) => {
            changes.push(next)
            setDraft(next)
          }}
          onClose={close}
          onSave={save}
        />
      )
    }
    render(<Harness />)
    const controls = screen.getAllByRole('textbox')
    for (const [index, value] of [
      'Tool',
      'node',
      '["a"]',
      '{"A":"B"}',
      'read-only',
      'modelKey',
    ].entries()) {
      fireEvent.change(controls[index]!, { target: { value } })
    }
    expect(changes.at(-1)).toEqual({
      name: 'Tool',
      command: 'node',
      args: '["a"]',
      environment: '{"A":"B"}',
      initialMode: 'read-only',
      modelConfigKey: 'modelKey',
    })
    await userEvent.click(screen.getByRole('button', { name: '关闭' }))
    await userEvent.click(screen.getByRole('button', { name: '保存工具' }))
    expect(close).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledOnce()
  })

  it('renders profile ordering state and forwards row events', async () => {
    const onSelect = vi.fn()
    const ordering = {
      reordering: true,
      draggingProfileId: firstProfile.id,
      dropTarget: { profileId: secondProfile.id, position: 'before' as const },
      startProfileDrag: vi.fn(),
      updateProfileDropTarget: vi.fn(),
      allowProfileDrop: vi.fn(),
      finishProfileDrop: vi.fn(),
      cancelProfileDrag: vi.fn(),
      moveProfileWithKeyboard: vi.fn(),
    }
    const { rerender } = render(
      <AgentProfileList
        busy={false}
        ordering={ordering}
        profiles={[firstProfile, secondProfile]}
        selectedProfileId={secondProfile.id}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByText(/拖动整行/)).toBeVisible()
    const firstRow = screen.getByText('First Agent').closest('.aw-profile-item')!
    const secondRow = screen.getByText('Second Agent').closest('.aw-profile-item')!
    expect(firstRow).toHaveAttribute('data-dragging', 'true')
    expect(secondRow).toHaveAttribute('data-drop-position', 'before')
    expect(secondRow).toHaveAttribute('data-selected', 'true')
    fireEvent.dragStart(firstRow)
    fireEvent.dragOver(secondRow)
    fireEvent.dragEnd(firstRow)
    fireEvent.drop(firstRow.parentElement!)
    fireEvent.keyDown(screen.getByRole('button', { name: /调整 First Agent/ }), {
      key: 'ArrowDown',
    })
    await userEvent.click(screen.getByText('First Agent'))
    expect(ordering.startProfileDrag).toHaveBeenCalled()
    expect(ordering.updateProfileDropTarget).toHaveBeenCalled()
    expect(ordering.cancelProfileDrag).toHaveBeenCalled()
    expect(ordering.finishProfileDrop).toHaveBeenCalled()
    expect(ordering.moveProfileWithKeyboard).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(firstProfile)

    rerender(
      <AgentProfileList
        busy
        ordering={{ ...ordering, reordering: false, draggingProfileId: null, dropTarget: null }}
        profiles={[firstProfile]}
        selectedProfileId={null}
        onSelect={onSelect}
      />,
    )
    expect(screen.queryByText(/拖动整行/)).not.toBeInTheDocument()
    expect(screen.getByText('First Agent').closest('.aw-profile-item')).toHaveAttribute(
      'draggable',
      'false',
    )
  })

  it('persists drag and keyboard movement, rolls back failures, and rejects invalid moves', async () => {
    const profiles = [firstProfile, secondProfile]
    const changed = vi.fn()
    const error = vi.fn()
    apiMocks.reorderProfiles.mockResolvedValue([secondProfile, firstProfile])
    const { result, rerender } = renderHook(
      ({ current, busy }: { current: AgentProfile[] | null; busy: boolean }) =>
        useProfileOrdering({
          profiles: current,
          busy,
          onProfilesChange: changed,
          onError: error,
        }),
      {
        initialProps: {
          current: profiles,
          busy: false,
        } as { current: AgentProfile[] | null; busy: boolean },
      },
    )
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    }
    const firstElement = document.createElement('div')
    firstElement.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 40, bottom: 40, right: 100 }) as DOMRect
    act(() =>
      result.current.startProfileDrag(
        {
          preventDefault: vi.fn(),
          dataTransfer,
          currentTarget: firstElement,
          clientX: 10,
          clientY: 10,
        } as never,
        firstProfile.id,
      ),
    )
    expect(result.current.draggingProfileId).toBe(firstProfile.id)
    const secondElement = document.createElement('div')
    secondElement.getBoundingClientRect = () =>
      ({ left: 0, top: 40, width: 100, height: 40, bottom: 80, right: 100 }) as DOMRect
    act(() =>
      result.current.updateProfileDropTarget(
        {
          preventDefault: vi.fn(),
          dataTransfer,
          currentTarget: secondElement,
          clientY: 75,
        } as never,
        secondProfile.id,
      ),
    )
    expect(result.current.dropTarget).toEqual({ profileId: secondProfile.id, position: 'after' })
    act(() => result.current.allowProfileDrop({ preventDefault: vi.fn(), dataTransfer } as never))
    act(() => result.current.finishProfileDrop({ preventDefault: vi.fn() } as never))
    await waitFor(() => expect(apiMocks.reorderProfiles).toHaveBeenCalled())
    expect(changed).toHaveBeenLastCalledWith([secondProfile, firstProfile])

    apiMocks.reorderProfiles.mockRejectedValueOnce(new Error('save failed'))
    act(() =>
      result.current.moveProfileWithKeyboard(
        { key: 'End', preventDefault: vi.fn() } as never,
        firstProfile.id,
      ),
    )
    await waitFor(() => expect(error).toHaveBeenLastCalledWith('save failed'))
    expect(changed).toHaveBeenLastCalledWith(profiles)

    rerender({ current: null, busy: true })
    const preventDefault = vi.fn()
    act(() =>
      result.current.startProfileDrag(
        { preventDefault, dataTransfer, currentTarget: firstElement } as never,
        firstProfile.id,
      ),
    )
    expect(preventDefault).toHaveBeenCalled()
    act(() => result.current.cancelProfileDrag())
    act(() =>
      result.current.moveProfileWithKeyboard(
        { key: 'Unknown', preventDefault } as never,
        firstProfile.id,
      ),
    )
  })

  it('covers drag guards, self/same/invalid targets, keyboard boundaries, and concurrent saves', async () => {
    const profiles = [firstProfile, secondProfile, thirdProfile]
    const changed = vi.fn()
    const error = vi.fn()
    apiMocks.reorderProfiles.mockResolvedValue(profiles)
    const { result } = renderHook(() =>
      useProfileOrdering({
        profiles,
        busy: false,
        onProfilesChange: changed,
        onError: error,
      }),
    )
    const transfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      setDragImage: vi.fn(),
    }
    const preventDefault = vi.fn()
    const element = document.createElement('div')
    element.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40 }) as DOMRect
    const drag = (profileId: typeof firstProfile.id): void =>
      result.current.startProfileDrag(
        {
          preventDefault,
          dataTransfer: transfer,
          currentTarget: element,
          clientX: 20,
          clientY: 20,
        } as never,
        profileId,
      )
    const target = (profileId: typeof firstProfile.id, clientY = 5): void =>
      result.current.updateProfileDropTarget(
        { preventDefault, dataTransfer: transfer, currentTarget: element, clientY } as never,
        profileId,
      )

    act(() => {
      result.current.updateProfileDropTarget(
        { preventDefault, dataTransfer: transfer } as never,
        secondProfile.id,
      )
      result.current.allowProfileDrop({ preventDefault, dataTransfer: transfer } as never)
      result.current.finishProfileDrop({ preventDefault } as never)
      result.current.cancelProfileDrag()
      result.current.moveProfileWithKeyboard(
        { key: 'Unknown', preventDefault } as never,
        'profile-missing' as never,
      )
    })

    act(() => {
      drag(firstProfile.id)
      target(firstProfile.id)
      target(secondProfile.id, 5)
      target(secondProfile.id, 5)
      result.current.allowProfileDrop({ preventDefault, dataTransfer: transfer } as never)
      result.current.finishProfileDrop({ preventDefault } as never)
    })
    expect(apiMocks.reorderProfiles).not.toHaveBeenCalled()

    act(() => {
      drag('profile-missing' as never)
      target(secondProfile.id)
      result.current.finishProfileDrop({ preventDefault } as never)
      drag(firstProfile.id)
      target('profile-missing' as never)
      result.current.finishProfileDrop({ preventDefault } as never)
    })
    expect(apiMocks.reorderProfiles).not.toHaveBeenCalled()

    apiMocks.reorderProfiles.mockRejectedValueOnce('plain failure')
    act(() => {
      drag(secondProfile.id)
      target(firstProfile.id)
      result.current.finishProfileDrop({ preventDefault } as never)
    })
    await waitFor(() => expect(error).toHaveBeenLastCalledWith('plain failure'))

    for (const [profileId, key] of [
      [secondProfile.id, 'ArrowUp'],
      [firstProfile.id, 'ArrowDown'],
      [thirdProfile.id, 'Home'],
      [firstProfile.id, 'End'],
      [firstProfile.id, 'Home'],
      [thirdProfile.id, 'End'],
      [firstProfile.id, 'Other'],
    ] as const) {
      apiMocks.reorderProfiles.mockResolvedValueOnce(profiles)
      act(() => result.current.moveProfileWithKeyboard({ key, preventDefault } as never, profileId))
      await waitFor(() => expect(result.current.reordering).toBe(false))
    }

    let release!: (value: AgentProfile[]) => void
    apiMocks.reorderProfiles.mockReturnValueOnce(
      new Promise((resolvePromise) => {
        release = resolvePromise
      }),
    )
    act(() => {
      drag(thirdProfile.id)
      target(firstProfile.id)
      result.current.moveProfileWithKeyboard(
        { key: 'End', preventDefault } as never,
        firstProfile.id,
      )
      result.current.finishProfileDrop({ preventDefault } as never)
    })
    expect(result.current.reordering).toBe(true)
    release(profiles)
    await waitFor(() => expect(result.current.reordering).toBe(false))
  })
})

describe('runtime configuration', () => {
  function Consumer() {
    const config = useRuntimeConfig()
    return <div>{config.developerMode ? 'developer' : 'public'}</div>
  }

  it('loads config and provides it to descendants', async () => {
    apiMocks.runtimeConfig.mockResolvedValue({ developerMode: true })
    render(
      <RuntimeConfigProvider>
        <Consumer />
      </RuntimeConfigProvider>,
    )
    expect(screen.getByRole('status')).toBeVisible()
    expect(await screen.findByText('developer')).toBeVisible()
  })

  it('shows errors, stringifies unknown causes, and retries', async () => {
    apiMocks.runtimeConfig
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce('still offline')
      .mockResolvedValueOnce({ developerMode: false })
    render(
      <RuntimeConfigProvider>
        <Consumer />
      </RuntimeConfigProvider>,
    )
    expect(await screen.findByText('offline')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('still offline')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('public')).toBeVisible()
  })
})
