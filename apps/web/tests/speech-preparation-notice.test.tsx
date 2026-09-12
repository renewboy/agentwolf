import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { api } from '../src/api.js'
import { SpeechPreparationNotice } from '../src/components/SpeechPreparationNotice.js'

const base = { state: 'preparing', model: 'qwen3-tts-0.6b', voices: 12, message: null } as const
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('shows real download progress, completion, disconnection and recovery without playing speech', async () => {
  vi.useFakeTimers()
  const status = vi.spyOn(api, 'speechAudioStatus').mockResolvedValue({
    ...base,
    progress: { stage: 'downloading', downloadedBytes: 1_000_000_000, totalBytes: 2_500_000_000 },
  })
  const { unmount } = render(<SpeechPreparationNotice />)
  await act(async () => {
    await Promise.resolve()
  })
  expect(screen.getByText('40%')).toBeVisible()
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '1000000000')
  status.mockResolvedValue({ ...base, state: 'loading' })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(screen.queryByRole('complementary')).toBeNull()
  status.mockResolvedValue({ ...base, state: 'ready' })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(screen.getByText('角色语音已就绪')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '知道了' }))
  expect(screen.queryByRole('complementary')).toBeNull()
  status.mockRejectedValue(new Error('offline'))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000)
  })
  expect(screen.getByText('语音服务连接中断')).toBeVisible()
  expect(screen.queryByRole('progressbar')).toBeNull()
  status.mockResolvedValue({
    ...base,
    progress: { stage: 'downloading', downloadedBytes: 1_250_000_000, totalBytes: 2_500_000_000 },
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(screen.getByText('50%')).toBeVisible()
  unmount()
  const count = status.mock.calls.length
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000)
  })
  expect(status).toHaveBeenCalledTimes(count)
})

it('shows preparation failures and dependency installation without an invented percentage', async () => {
  vi.useFakeTimers()
  const status = vi.spyOn(api, 'speechAudioStatus').mockResolvedValue({ ...base })
  render(<SpeechPreparationNotice />)
  await act(async () => {
    await Promise.resolve()
  })
  expect(screen.getByText('正在准备角色语音环境')).toBeVisible()
  expect(screen.queryByRole('progressbar')).toBeNull()
  status.mockResolvedValue({ ...base, state: 'error' })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(screen.getByText('角色语音准备失败')).toBeVisible()
  status.mockResolvedValue({ ...base, state: 'loading' })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(screen.queryByRole('complementary')).toBeNull()
  status.mockResolvedValue({ ...base, state: 'ready' })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(screen.queryByRole('complementary')).toBeNull()
})

it('keeps progress and completion visible when minimized and restores the saved layout', async () => {
  vi.useFakeTimers()
  const status = vi.spyOn(api, 'speechAudioStatus').mockResolvedValue({
    ...base,
    progress: { stage: 'downloading', downloadedBytes: 500, totalBytes: 1000 },
  })
  const view = render(<SpeechPreparationNotice />)
  await act(async () => {
    await Promise.resolve()
  })
  fireEvent.click(screen.getByRole('button', { name: '最小化语音通知' }))
  expect(screen.getByText('语音下载中')).toBeVisible()
  expect(screen.getByText('50%')).toBeVisible()
  expect(screen.getByRole('progressbar')).toBeVisible()
  expect(screen.queryByText(/准备期间使用默认语音/)).toBeNull()
  status.mockResolvedValue({ ...base, state: 'ready' })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(screen.getByText('语音已就绪')).toBeVisible()
  expect(screen.getByRole('button', { name: '展开语音通知' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  view.unmount()
  render(<SpeechPreparationNotice />)
  await act(async () => {
    await Promise.resolve()
  })
  expect(screen.queryByRole('complementary')).toBeNull()
  status.mockResolvedValue(base)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000)
  })
  expect(screen.getByText('语音准备中')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '展开语音通知' }))
  expect(screen.getByText('正在准备角色语音环境')).toBeVisible()
})

it('moves with keyboard controls and constrains a saved position to the viewport', async () => {
  vi.spyOn(api, 'speechAudioStatus').mockResolvedValue(base)
  localStorage.setItem(
    'agentwolf.speech-notice-layout',
    JSON.stringify({ minimized: true, position: { x: 9000, y: 9000 } }),
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 120,
    y: 130,
    width: 284,
    height: 60,
    left: 120,
    top: 130,
    right: 404,
    bottom: 190,
    toJSON: () => ({}),
  })
  render(<SpeechPreparationNotice />)
  const handle = await screen.findByRole('button', { name: '移动语音通知，可拖动或使用方向键' })
  const notice = screen.getByRole('complementary')
  expect(notice).toHaveStyle({
    left: `${window.innerWidth - 300}px`,
    top: `${window.innerHeight - 76}px`,
  })
  fireEvent.keyDown(handle, { key: 'ArrowLeft' })
  expect(notice).toHaveStyle({ left: '104px', top: '130px' })
  fireEvent.keyDown(handle, { key: 'ArrowDown', shiftKey: true })
  expect(notice).toHaveStyle({ top: '131px' })
})

it.each(['pointerup', 'pointercancel', 'lostpointercapture'])(
  'finishes dragging on %s and ignores another pointer or late movement',
  async (finishEvent) => {
    vi.spyOn(api, 'speechAudioStatus').mockResolvedValue(base)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 120,
      width: 360,
      height: 180,
      left: 100,
      top: 120,
      right: 460,
      bottom: 300,
      toJSON: () => ({}),
    })
    render(<SpeechPreparationNotice />)
    const handle = await screen.findByRole('button', { name: '移动语音通知，可拖动或使用方向键' })
    const notice = screen.getByRole('complementary')
    const pointer = (type: string, id: number, x = 120, y = 140, button = 0) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button })
      Object.defineProperty(event, 'pointerId', { value: id })
      fireEvent(handle, event)
    }
    pointer('pointerdown', 3, 120, 140, 2)
    expect(notice).toHaveAttribute('data-dragging', 'false')
    pointer('pointerdown', 3)
    pointer('pointermove', 9, 220, 240)
    expect(notice.style.left).toBe('')
    pointer('pointermove', 3, 220, 240)
    expect(notice).toHaveStyle({ left: '200px', top: '220px' })
    expect(notice).toHaveAttribute('data-dragging', 'true')
    pointer(finishEvent, 3)
    expect(notice).toHaveAttribute('data-dragging', 'false')
    pointer('pointermove', 3, 500, 500)
    expect(notice).toHaveStyle({ left: '200px', top: '220px' })
    expect(JSON.parse(localStorage.getItem('agentwolf.speech-notice-layout')!)).toMatchObject({
      position: { x: 200, y: 220 },
    })
  },
)

it.each(['success', 'failure'])(
  'ignores a late status %s after unmount and aborts polling',
  async (outcome) => {
    vi.useFakeTimers()
    let resolve!: (value: Awaited<ReturnType<typeof api.speechAudioStatus>>) => void
    let reject!: (error: Error) => void
    const status = vi.spyOn(api, 'speechAudioStatus').mockImplementation(
      () =>
        new Promise((done, fail) => {
          resolve = done
          reject = fail
        }),
    )
    const view = render(<SpeechPreparationNotice />)
    view.unmount()
    expect(status.mock.calls[0]![0]!.aborted).toBe(true)
    await act(async () => {
      if (outcome === 'success') resolve({ ...base, state: 'ready' })
      else reject(new Error('cancelled'))
      await vi.advanceTimersByTimeAsync(10000)
    })
    expect(status).toHaveBeenCalledOnce()
    expect(screen.queryByRole('complementary')).toBeNull()
  },
)
