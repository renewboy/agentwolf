import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SpeechAudioNotice } from '../src/components/match/SpeechAudioNotice.js'

const props = {
  title: '本段使用默认语音',
  message: '角色语音正在准备。',
  kind: 'fallback' as const,
}
beforeEach(() => localStorage.clear())
describe('speech fallback notice preference', () => {
  it('remembers dismissal across remounts while keeping playback errors visible', () => {
    const first = render(<SpeechAudioNotice {...props} />)
    expect(screen.getByRole('status', { name: '本段使用默认语音' })).toHaveTextContent(
      props.message,
    )
    fireEvent.click(screen.getByRole('button', { name: '不再提示' }))
    expect(screen.queryByRole('status')).toBeNull()
    first.unmount()
    const second = render(<SpeechAudioNotice {...props} />)
    expect(screen.queryByRole('status')).toBeNull()
    second.rerender(<SpeechAudioNotice {...props} kind="error" message="语音连接失败" />)
    expect(screen.getByRole('status')).toHaveTextContent('语音连接失败')
    expect(screen.queryByRole('button', { name: '不再提示' })).toBeNull()
  })
  it('synchronizes the preference and tolerates unavailable storage', () => {
    const view = render(<SpeechAudioNotice {...props} />)
    fireEvent(window, new StorageEvent('storage', { key: 'unrelated', newValue: 'true' }))
    expect(screen.getByRole('status')).toBeVisible()
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'agentwolf.hide-speech-fallback-notice',
        newValue: 'true',
      }),
    )
    expect(screen.queryByRole('status')).toBeNull()
    view.unmount()
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<SpeechAudioNotice {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '不再提示' }))
    expect(screen.queryByRole('status')).toBeNull()
    read.mockRestore()
    write.mockRestore()
  })
  it('does not show an empty notice', () => {
    render(<SpeechAudioNotice {...props} message={null} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
