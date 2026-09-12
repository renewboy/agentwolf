import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builtInCharacterCards } from '@agentwolf/assets'
import { SpeechIdSchema } from '@agentwolf/contracts'
import type { SpeechPlaybackController } from '../src/hooks/useSpeechPlayback.js'
import { SpeechPortraitStage } from '../src/components/match/SpeechPortraitStage.js'
import { matchView } from './fixtures/match.js'

const load = vi.hoisted(() => vi.fn())
vi.mock('../src/components/match/CharacterPortrait.js', () => ({
  loadPortraitImages: load,
  CharacterPortrait: ({ side, motion }: { side: string; motion: boolean }) => (
    <div data-testid="portrait" data-side={side} data-motion={motion} />
  ),
}))
const key = SpeechIdSchema.parse(42)
const gin = builtInCharacterCards.find((character) => character.id === 'character-gin')!
function create(overrides: Partial<SpeechPlaybackController> = {}) {
  const seats = matchView().seats.map((seat) => ({ ...seat, character: gin }))
  const playback: SpeechPlaybackController = {
    playbackId: 'automatic:42:0',
    supported: true,
    mode: 'automatic',
    activeSpeechId: key,
    automaticSequence: 42,
    automaticPlayerId: seats[0]!.playerId,
    automaticBusy: true,
    manualSequence: null,
    notice: null,
    noticeSpeechId: null,
    noticeTitle: '',
    noticeKind: 'error',
    output: {
      key,
      actor: seats[0]!.playerId,
      text: '先核对每个人的发言，再判断这一票。',
      status: 'playing',
    },
    readLevel: vi.fn(() => 0.2),
    setCaptionCapacity: vi.fn(),
    playManual: vi.fn(),
    stopManual: vi.fn(),
    skipAutomatic: vi.fn(),
    cancelAll: vi.fn(),
    prepareAudio: vi.fn(),
    ...overrides,
  }
  return {
    playback,
    seats,
    blocked: false,
    motion: true,
    jumpRequest: undefined,
    children: (bar: ReactNode) => bar,
  }
}
beforeEach(() => load.mockReset().mockResolvedValue([{ src: 'base' }]))
describe('speech portrait stage', () => {
  it('continues acting across speech chunks and starts a fresh performance on replay', async () => {
    const props = create({ mode: 'manual', playbackId: 'manual:42:1' })
    const view = render(<SpeechPortraitStage {...props} />)
    const original = await screen.findByTestId('portrait')
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{
          ...props.playback,
          output: { ...props.playback.output!, text: '下一句继续。' },
        }}
      />,
    )
    expect(screen.getByTestId('portrait')).toBe(original)
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{ ...props.playback, playbackId: 'manual:42:2' }}
      />,
    )
    expect(screen.getByTestId('portrait')).not.toBe(original)
  })
  it('leaves keyboard focus on records when narration appears', async () => {
    const props = create()
    render(
      <div>
        <div className="aw-match-conversation">
          <button type="button">Record control</button>
        </div>
        <SpeechPortraitStage {...props} />
      </div>,
    )
    const record = screen.getByRole('button', { name: 'Record control' })
    record.focus()
    await screen.findByRole('region', { name: '角色播报' })
    expect(record).toHaveFocus()
  })

  it('keeps two short clauses in the reading area and clears prior words on a speaker change', async () => {
    const props = create({
      output: {
        key,
        actor: matchView().seats[0]!.playerId,
        text: '先核对发言。',
        status: 'playing',
      },
    })
    const view = render(<SpeechPortraitStage {...props} />)
    await screen.findByRole('region', { name: '角色播报' })
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{
          ...props.playback,
          output: { ...props.playback.output!, text: '再检查投票。' },
        }}
      />,
    )
    expect(screen.getByText('先核对发言。')).toHaveClass('aw-speech-subtitles__previous')
    expect(screen.getByText('再检查投票。')).toHaveClass('aw-speech-subtitles__current')
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{
          ...props.playback,
          output: {
            ...props.playback.output!,
            actor: props.seats[1]!.playerId,
            text: '另一位发言。',
          },
        }}
      />,
    )
    expect(screen.queryByText('再检查投票。')).not.toBeInTheDocument()
    expect(screen.queryByText('先核对发言。')).not.toBeInTheDocument()
  })
  it('waits for actual output, retains the caption during buffering, and follows player rail ownership', async () => {
    const props = create()
    const view = render(
      <SpeechPortraitStage
        {...props}
        playback={{ ...props.playback, output: { ...props.playback.output!, status: 'preparing' } }}
      />,
    )
    expect(screen.queryByRole('region', { name: '角色播报' })).not.toBeInTheDocument()
    view.rerender(<SpeechPortraitStage {...props} />)
    await screen.findByRole('region', { name: '角色播报' })
    expect(screen.getByTestId('portrait')).toHaveAttribute('data-side', 'left')
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{
          ...props.playback,
          output: { ...props.playback.output!, status: 'buffering', text: '尚未播放的新片段' },
        }}
      />,
    )
    expect(screen.getByText(props.playback.output!.text)).toBeInTheDocument()
    expect(screen.queryByText('尚未播放的新片段')).not.toBeInTheDocument()
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{
          ...props.playback,
          output: { ...props.playback.output!, actor: props.seats[1]!.playerId },
        }}
      />,
    )
    expect(screen.getByTestId('portrait')).toHaveAttribute('data-side', 'right')
  })
  it('offers record reading independently from skipping or stopping sound', async () => {
    const props = create(),
      view = render(<SpeechPortraitStage {...props} />)
    await screen.findByRole('region', { name: '角色播报' })
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('region', { name: '角色播报' })).not.toBeInTheDocument()
    expect(props.playback.skipAutomatic).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '显示立绘' }))
    fireEvent.click(screen.getByRole('button', { name: '跳过' }))
    expect(props.playback.skipAutomatic).toHaveBeenCalledWith(key)
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{ ...props.playback, mode: 'manual', playbackId: 'manual:42:1' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '跳过' }))
    expect(props.playback.stopManual).toHaveBeenCalledOnce()
  })
  it('keeps a closed portrait hidden through buffering and clauses, then shows the next playback', async () => {
    const props = create(),
      view = render(<SpeechPortraitStage {...props} />)
    await screen.findByRole('region', { name: '角色播报' })
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.getByRole('region', { name: '语音播放' })).toHaveTextContent('正在播放')
    for (const status of ['buffering', 'preparing', 'playing'] as const) {
      view.rerender(
        <SpeechPortraitStage
          {...props}
          playback={{
            ...props.playback,
            output: { ...props.playback.output!, text: '同一次发言的下一句。', status },
          }}
        />,
      )
      expect(screen.queryByRole('region', { name: '角色播报' })).not.toBeInTheDocument()
    }
    const next = SpeechIdSchema.parse(43)
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{
          ...props.playback,
          playbackId: 'automatic:43:0',
          activeSpeechId: next,
          output: { ...props.playback.output!, key: next },
        }}
      />,
    )
    expect(screen.getByRole('region', { name: '角色播报' })).toBeInTheDocument()
    expect(props.playback.skipAutomatic).not.toHaveBeenCalled()
    expect(props.playback.stopManual).not.toHaveBeenCalled()
  })
  it('shows the same speech again for a new manual playback and drops the previous caption', async () => {
    const props = create({ mode: 'manual', playbackId: 'manual:42:1' }),
      view = render(<SpeechPortraitStage {...props} />)
    await screen.findByRole('region', { name: '角色播报' })
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{
          ...props.playback,
          playbackId: 'manual:42:2',
          output: { ...props.playback.output!, status: 'preparing' },
        }}
      />,
    )
    expect(screen.queryByRole('region', { name: '角色播报' })).not.toBeInTheDocument()
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{ ...props.playback, playbackId: 'manual:42:2' }}
      />,
    )
    expect(screen.getByRole('region', { name: '角色播报' })).toBeInTheDocument()
    expect(view.container.querySelector('.aw-speech-subtitles__previous')).toBeNull()
  })
  it('hides stale output during projection changes and leaves unsupported characters in the feed', async () => {
    const props = create(),
      view = render(<SpeechPortraitStage {...props} />)
    await screen.findByRole('region', { name: '角色播报' })
    view.rerender(<SpeechPortraitStage {...props} blocked />)
    expect(screen.queryByRole('region', { name: '角色播报' })).not.toBeInTheDocument()
    view.rerender(<SpeechPortraitStage {...props} seats={matchView().seats} />)
    expect(screen.queryByRole('region', { name: '角色播报' })).not.toBeInTheDocument()
    expect(view.container.querySelector('.aw-speech-stage-content')).toHaveAttribute(
      'data-portrait-visible',
      'false',
    )
  })
  it('keeps still artwork in reduced motion and allows history navigation', async () => {
    const props = create(),
      view = render(<SpeechPortraitStage {...props} motion={false} />)
    await screen.findByRole('region', { name: '角色播报' })
    expect(screen.getByTestId('portrait')).toHaveAttribute('data-motion', 'false')
    view.rerender(<SpeechPortraitStage {...props} jumpRequest={1} />)
    expect(screen.queryByRole('region', { name: '角色播报' })).not.toBeInTheDocument()
    view.rerender(
      <SpeechPortraitStage
        {...props}
        jumpRequest={1}
        playback={{ ...props.playback, playbackId: 'manual:42:1' }}
      />,
    )
    expect(screen.getByRole('region', { name: '角色播报' })).toBeInTheDocument()
    view.rerender(
      <SpeechPortraitStage
        {...props}
        playback={{ ...props.playback, mode: 'idle', output: null, activeSpeechId: null }}
      />,
    )
    expect(screen.queryByRole('button', { name: '显示立绘' })).not.toBeInTheDocument()
  })
  it('does not obstruct sound or records when artwork fails', async () => {
    load.mockRejectedValueOnce(new Error('unavailable'))
    const props = create()
    render(<SpeechPortraitStage {...props} />)
    await waitFor(() => expect(load).toHaveBeenCalledOnce())
    expect(screen.queryByRole('region', { name: '角色播报' })).not.toBeInTheDocument()
    expect(props.playback.cancelAll).not.toHaveBeenCalled()
  })
})
