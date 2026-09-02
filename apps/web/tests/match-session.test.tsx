import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const live = vi.hoisted(() => ({
  playbackState: {
    enabled: false,
    controlledByThisClient: false,
    pendingSequence: null,
  } as {
    enabled: boolean
    controlledByThisClient: boolean
    pendingSequence: number | null
  },
  connectionState: 'live' as string,
  setSpeechPlaybackEnabled: vi.fn(() => true),
  resolveSpeechPlayback: vi.fn(() => true),
}))
const speech = vi.hoisted(() => ({
  mode: 'idle' as 'idle' | 'automatic' | 'manual',
  skipAutomatic: vi.fn(),
}))

vi.mock('../src/hooks/useLiveMatch.js', () => ({
  useLiveMatch: () => ({
    match: null,
    error: null,
    controlError: null,
    retry: vi.fn(),
    connectionState: live.connectionState,
    playbackState: live.playbackState,
    setSpeechPlaybackEnabled: live.setSpeechPlaybackEnabled,
    resolveSpeechPlayback: live.resolveSpeechPlayback,
    viewPending: false,
  }),
}))
vi.mock('../src/hooks/useSpeechPlayback.js', () => ({
  useSpeechPlayback: () => ({
    supported: true,
    mode: speech.mode,
    activeSpeechId: speech.mode === 'automatic' ? 7 : null,
    automaticSequence: null,
    automaticPlayerId: null,
    automaticBusy: speech.mode === 'automatic',
    manualSequence: speech.mode === 'manual' ? 1 : null,
    notice: null,
    playManual: vi.fn(),
    stopManual: vi.fn(),
    skipAutomatic: speech.skipAutomatic,
    cancelAll: vi.fn(),
  }),
}))

import { MatchSessionProvider, useMatchSession } from '../src/hooks/useMatchSession.js'
import { voicePreferenceStorageKey } from '../src/hooks/useVoicePreference.js'

function Probe() {
  const session = useMatchSession()
  return (
    <div>
      <output>{session.voiceEnabled ? 'voice-on' : 'voice-off'}</output>
      <output>{`${session.viewKind}:${session.playerId}`}</output>
      <button type="button" onClick={session.toggleVoice}>
        toggle
      </button>
      <button type="button" onClick={() => session.setViewKind('player')}>
        player view
      </button>
      <button type="button" onClick={() => session.setPlayerId('player-2' as never)}>
        player two
      </button>
    </div>
  )
}

function Wrapper({ children }: { readonly children: ReactNode }) {
  return <MatchSessionProvider matchId="match-test-abcdef">{children}</MatchSessionProvider>
}

beforeEach(() => {
  window.localStorage.clear()
  live.connectionState = 'live'
  live.playbackState = {
    enabled: false,
    controlledByThisClient: false,
    pendingSequence: null,
  }
  speech.mode = 'idle'
  live.setSpeechPlaybackEnabled.mockReset()
  live.setSpeechPlaybackEnabled.mockReturnValue(true)
  live.resolveSpeechPlayback.mockReset()
  live.resolveSpeechPlayback.mockReturnValue(true)
  speech.skipAutomatic.mockReset()
})

describe('MatchSessionProvider', () => {
  it('keeps an enabled preference without retrying when another window owns speech', async () => {
    window.localStorage.setItem(voicePreferenceStorageKey, 'true')
    live.playbackState = {
      enabled: true,
      controlledByThisClient: false,
      pendingSequence: null,
    }
    render(<Probe />, { wrapper: Wrapper })
    expect(screen.getByText('voice-on')).toBeVisible()
    await waitFor(() => expect(live.setSpeechPlaybackEnabled).not.toHaveBeenCalled())
  })

  it('reconciles the saved browser preference and preserves view state', async () => {
    window.localStorage.setItem(voicePreferenceStorageKey, 'true')
    const rendered = render(<Probe />, { wrapper: Wrapper })
    expect(screen.getByText('voice-on')).toBeVisible()
    await waitFor(() => expect(live.setSpeechPlaybackEnabled).toHaveBeenCalledWith(true))
    await userEvent.click(screen.getByRole('button', { name: 'player view' }))
    await userEvent.click(screen.getByRole('button', { name: 'player two' }))
    expect(screen.getByText('player:player-2')).toBeVisible()
    rendered.rerender(<Probe />)
    expect(screen.getByText('player:player-2')).toBeVisible()
  })

  it('stops automatic speech when disabled but leaves selected playback alone', async () => {
    window.localStorage.setItem(voicePreferenceStorageKey, 'true')
    speech.mode = 'automatic'
    live.playbackState = {
      enabled: true,
      controlledByThisClient: true,
      pendingSequence: 7,
    }
    const rendered = render(<Probe />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }))
    expect(speech.skipAutomatic).toHaveBeenCalledOnce()
    expect(window.localStorage.getItem(voicePreferenceStorageKey)).toBe('false')
    await waitFor(() => expect(live.setSpeechPlaybackEnabled).toHaveBeenCalledWith(false))

    act(() => {
      speech.mode = 'manual'
    })
    rendered.rerender(<Probe />)
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }))
    expect(speech.skipAutomatic).toHaveBeenCalledOnce()
  })
})
