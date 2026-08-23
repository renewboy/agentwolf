import {
  GameEventSchema,
  MatchIdSchema,
  PlayerIdSchema,
  type LiveMessage,
  type SpectatorView,
} from '@agentwolf/contracts'
import { describe, expect, it, vi } from 'vitest'
import type { LiveSubscriber } from '../src/live-hub.js'
import {
  SpeechPlaybackCoordinator,
  type SpeechCommittedEvent,
} from '../src/speech-playback-coordinator.js'

const matchId = MatchIdSchema.parse('match-playback-test')
const playerId = PlayerIdSchema.parse('player-1')

describe('SpeechPlaybackCoordinator', () => {
  it('grants one controller and resolves only the exact pending sequence', async () => {
    const changed = vi.fn()
    const coordinator = createCoordinator(changed)
    const first = subscriber({ kind: 'god' })
    const second = subscriber({ kind: 'god' })
    expect(coordinator.setEnabled(first, true)).toBe('accepted')
    expect(coordinator.setEnabled(second, true)).toBe('busy')

    const pending = coordinator.waitFor(speechEvent(7, { kind: 'public' }))
    expect(coordinator.stateFor(first)).toEqual({
      enabled: true,
      controlledByThisClient: true,
      pendingSequence: 7,
    })
    expect(coordinator.resolve(first, 8, 'completed')).toBe('invalid')
    expect(coordinator.resolve(first, 7, 'completed')).toBe('accepted')
    expect(await pending).toBe('completed')
    expect(coordinator.resolve(first, 7, 'completed')).toBe('accepted')
    expect(changed).toHaveBeenCalled()
  })

  it('skips a hidden pending speech on view change while keeping playback enabled', async () => {
    const coordinator = createCoordinator()
    const owner = subscriber({ kind: 'god' })
    coordinator.setEnabled(owner, true)
    const pending = coordinator.waitFor(speechEvent(9, { kind: 'faction', faction: 'werewolf' }))

    owner.view = { kind: 'closed-eye' }
    coordinator.viewChanged(owner)

    expect(await pending).toBe('skipped')
    expect(coordinator.stateFor(owner)).toEqual({
      enabled: true,
      controlledByThisClient: true,
      pendingSequence: null,
    })
  })

  it('releases a pending barrier and disables playback when its owner disconnects', async () => {
    const coordinator = createCoordinator()
    const owner = subscriber({ kind: 'god' })
    coordinator.setEnabled(owner, true)
    const pending = coordinator.waitFor(speechEvent(11, { kind: 'public' }))

    coordinator.disconnect(owner)

    expect(await pending).toBe('skipped')
    expect(coordinator.stateFor(owner)).toEqual({
      enabled: false,
      controlledByThisClient: false,
      pendingSequence: null,
    })
  })
})

function createCoordinator(changed = vi.fn()): SpeechPlaybackCoordinator {
  return new SpeechPlaybackCoordinator({
    isVisible: (event, view) => event.visibility.kind === 'public' || view.kind === 'god',
    onStateChange: changed,
  })
}

function subscriber(view: SpectatorView): LiveSubscriber {
  return { view, send: (_message: LiveMessage) => undefined }
}

function speechEvent(
  sequence: number,
  visibility: { kind: 'public' } | { kind: 'faction'; faction: 'werewolf' },
): SpeechCommittedEvent {
  return GameEventSchema.parse({
    matchId,
    sequence,
    occurredAt: '2026-08-23T00:00:00.000Z',
    visibility,
    payload: {
      type: 'speech.committed',
      playerId,
      kind: visibility.kind === 'faction' ? 'wolf-council' : 'day',
      text: '测试发言',
      sanitized: false,
    },
  }) as SpeechCommittedEvent
}
