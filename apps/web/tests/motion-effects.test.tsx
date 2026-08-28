import { createRef, useRef } from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchView, RoleEffectCue } from '@agentwolf/contracts'

const motion = vi.hoisted(() => {
  const timelineOptions: Array<{ onComplete?: () => void }> = []
  const timelines: Array<{
    fromTo: ReturnType<typeof vi.fn>
    to: ReturnType<typeof vi.fn>
    pause: ReturnType<typeof vi.fn>
    resume: ReturnType<typeof vi.fn>
  }> = []
  const gsap = {
    timeline: vi.fn((options: { onComplete?: () => void } = {}) => {
      timelineOptions.push(options)
      const timeline = {
        fromTo: vi.fn((_target: unknown, _from: unknown, to: Record<string, unknown>) => {
          if (typeof to?.['x'] === 'function') (to['x'] as (index: number) => number)(1)
          if (typeof to?.['y'] === 'function') (to['y'] as (index: number) => number)(2)
          return timeline
        }),
        to: vi.fn(() => timeline),
        pause: vi.fn(() => timeline),
        resume: vi.fn(() => timeline),
      }
      timelines.push(timeline)
      return timeline
    }),
    utils: {
      selector: vi.fn((root: ParentNode) => (selector: string) => [
        ...root.querySelectorAll(selector),
      ]),
      random: vi.fn(() => 0.8),
    },
    killTweensOf: vi.fn(),
    set: vi.fn(),
    to: vi.fn(),
    fromTo: vi.fn(),
  }
  return {
    gsap,
    timelines,
    timelineOptions,
    flipGetState: vi.fn(() => ({ state: true })),
    flipFrom: vi.fn(),
  }
})

vi.mock('../src/motion/gsap.js', async () => {
  const { useEffect } = await import('react')
  return {
    gsap: motion.gsap,
    Flip: { getState: motion.flipGetState, from: motion.flipFrom },
    useGSAP: (
      callback: () => void | (() => void),
      options: { dependencies?: readonly unknown[] } = {},
    ) => useEffect(callback, [callback, options.dependencies]),
  }
})

import {
  deriveMatchPresenceState,
  MatchMotionController,
  type MatchPresenceState,
} from '../src/components/match/MatchMotionController.js'
import { RoleEffectController } from '../src/components/match/RoleEffectController.js'
import { matchView } from './fixtures/match.js'

beforeEach(() => {
  motion.timelineOptions.length = 0
  motion.timelines.length = 0
  for (const mock of [
    motion.gsap.timeline,
    motion.gsap.killTweensOf,
    motion.gsap.set,
    motion.gsap.to,
    motion.gsap.fromTo,
    motion.flipGetState,
    motion.flipFrom,
  ]) {
    mock.mockClear()
  }
})

describe('deriveMatchPresenceState', () => {
  it.each([
    [null, 'connecting', false, false, 'initial-loading'],
    [matchView(), 'live', true, false, 'switching-view'],
    [matchView({ postgameReview: { state: 'paused' } as never }), 'live', false, false, 'paused'],
    [matchView({ status: 'ended', winner: 'village' }), 'settled', false, false, 'ended'],
    [matchView(), 'reconnecting', false, false, 'reconnecting'],
    [matchView({ status: 'starting' }), 'live', false, false, 'starting'],
    [matchView({ status: 'paused' }), 'live', false, false, 'paused'],
    [matchView(), 'live', false, true, 'narrating'],
    [withSession('failed'), 'live', false, false, 'recovering-agents'],
    [
      matchView({ activeSpeech: { playerId: 'player-1', text: 'stream', final: false } as never }),
      'live',
      false,
      false,
      'streaming',
    ],
    [withPostgame('thinking'), 'live', false, false, 'thinking'],
    [withPostgame('ready'), 'live', false, false, 'awaiting-actions'],
    [matchView({ phaseId: 'phase-night-resolve' }), 'live', false, false, 'resolving'],
    [matchView({ phaseId: 'phase-day-announcement' }), 'live', false, false, 'resolving'],
    [withSession('thinking', 'phase-day-vote'), 'live', false, false, 'awaiting-actions'],
    [withSession('thinking'), 'live', false, false, 'thinking'],
    [withSession('ready'), 'live', false, false, 'awaiting-actions'],
  ] as const)('derives %s / %s as %s', (match, connection, viewPending, narration, expected) => {
    expect(
      deriveMatchPresenceState(match as MatchView | null, connection, viewPending, narration),
    ).toBe(expected)
  })
})

describe('MatchMotionController', () => {
  function Harness({
    presenceState,
    phaseId = 'phase-day-speech',
    lastSequence = 1,
    sheriffId = null,
  }: {
    readonly presenceState: MatchPresenceState
    readonly phaseId?: string
    readonly lastSequence?: number
    readonly sheriffId?: string | null
  }) {
    const scope = useRef<HTMLElement>(null)
    return (
      <section className="aw-match-shell" ref={scope}>
        <div className="aw-lunar-field__glow" />
        <div className="aw-lunar-field__haze" />
        <div className="aw-presence__orb" />
        <div className="aw-presence__signal" />
        <div className="aw-presence__wave">
          <span />
        </div>
        <div className="aw-player-avatar__ring" />
        <div className="aw-player-card" data-session="thinking">
          <span className="aw-player-avatar__ring" />
        </div>
        <h2 className="aw-phase-title">Phase</h2>
        <div className="aw-feed-item" data-sequence={lastSequence} />
        <span className="aw-player-crown" />
        <MatchMotionController
          lastSequence={lastSequence}
          phaseId={phaseId}
          presenceState={presenceState}
          scope={scope}
          sessionStateKey="session"
          sheriffId={sheriffId}
        />
      </section>
    )
  }

  it('runs ambient, presence, phase, feed, and Sheriff motion and cleans visibility', () => {
    const { rerender, unmount } = render(<Harness presenceState="thinking" />)
    expect(motion.gsap.timeline).toHaveBeenCalled()
    expect(motion.gsap.to).toHaveBeenCalled()
    expect(motion.gsap.fromTo).toHaveBeenCalledTimes(2)
    const ambient = motion.timelines[0]!
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    void act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(ambient.pause).toHaveBeenCalled()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    void act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(ambient.resume).toHaveBeenCalled()

    rerender(<Harness presenceState="streaming" sheriffId="player-1" />)
    rerender(<Harness presenceState="starting" sheriffId="player-2" />)
    expect(motion.flipFrom).toHaveBeenCalled()
    rerender(<Harness presenceState="reconnecting" sheriffId="player-2" />)
    rerender(<Harness presenceState="recovering-agents" sheriffId="player-2" />)
    rerender(<Harness presenceState="awaiting-actions" sheriffId="player-2" />)
    rerender(<Harness presenceState="narrating" sheriffId="player-2" />)
    expect(motion.gsap.killTweensOf).toHaveBeenCalled()
    unmount()
    expect(motion.flipGetState).toHaveBeenCalled()
  })

  it('skips motion for reduced preference, missing roots, phases, and records', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })
    const nullScope = createRef<HTMLElement>()
    const { rerender } = render(
      <MatchMotionController
        lastSequence={0}
        phaseId=""
        presenceState="ended"
        scope={nullScope}
        sessionStateKey="none"
        sheriffId={null}
      />,
    )
    rerender(
      <MatchMotionController
        lastSequence={2}
        phaseId="phase-day"
        presenceState="paused"
        scope={nullScope}
        sessionStateKey="none-2"
        sheriffId="player-2"
      />,
    )
    expect(motion.gsap.to).not.toHaveBeenCalled()
  })
})

describe('RoleEffectController', () => {
  function cue(sequence: number, effectId = 'werewolf-attack'): RoleEffectCue {
    return {
      cueId: `cue-${sequence}`,
      sequence,
      effectId,
      roleId: null,
      abilityId: null,
      sourcePlayerIds: ['player-1' as never],
      targetPlayerIds: ['player-2' as never],
      variant: null,
      tier: effectId === 'seer-inspect' ? 'medium' : 'large',
      occurredAt: '2026-08-28T00:00:00.000Z',
    } as RoleEffectCue
  }

  function Harness({
    cues,
    lastSequence,
    projectionKey = 'god',
    mode = 'full',
  }: {
    readonly cues: readonly RoleEffectCue[]
    readonly lastSequence: number
    readonly projectionKey?: string
    readonly mode?: 'full' | 'reduced' | 'off'
  }) {
    const scope = useRef<HTMLElement>(null)
    return (
      <section ref={scope}>
        <div className="aw-stage-grid" />
        <article className="aw-player-card" data-player-id="player-1" />
        <article className="aw-player-card" data-player-id="player-2" />
        <RoleEffectController
          cues={cues}
          lastSequence={lastSequence}
          mode={mode}
          projectionKey={projectionKey}
          scope={scope}
        />
      </section>
    )
  }

  it('queues sorted unique effects, animates full effects, and advances completion', () => {
    const { rerender } = render(<Harness cues={[]} lastSequence={1} />)
    rerender(<Harness cues={[cue(3, 'seer-inspect'), cue(2), cue(2)]} lastSequence={3} />)
    expect(screen.getByText('狼人夜袭')).toBeVisible()
    expect(document.querySelectorAll('.aw-role-effect-particle')).toHaveLength(10)
    expect(document.querySelector('[data-player-id="player-1"]')).toHaveAttribute(
      'data-role-effect',
      'werewolf-attack',
    )
    expect(motion.gsap.timeline).toHaveBeenCalled()
    const completion = motion.timelineOptions.find((options) => options.onComplete)?.onComplete
    act(() => completion?.())
    expect(screen.getByText('预言家查验')).toBeVisible()
    rerender(<Harness cues={[cue(3, 'seer-inspect'), cue(2)]} lastSequence={3} mode="off" />)
    expect(document.querySelector('.aw-role-effect-overlay')).toBeNull()
  })

  it('animates reduced effects and resets when projection changes', () => {
    const { rerender } = render(<Harness cues={[]} lastSequence={4} mode="reduced" />)
    rerender(<Harness cues={[cue(5, 'seer-inspect')]} lastSequence={5} mode="reduced" />)
    expect(screen.getByText('预言家查验')).toBeVisible()
    rerender(
      <Harness
        cues={[cue(5, 'seer-inspect')]}
        lastSequence={5}
        mode="reduced"
        projectionKey="player:player-1"
      />,
    )
    expect(document.querySelector('.aw-role-effect-overlay')).toBeNull()
  })

  it('does nothing without an effect root and establishes an initial baseline', () => {
    const scope = createRef<HTMLElement>()
    const { rerender } = render(
      <RoleEffectController
        cues={[]}
        lastSequence={1}
        mode="full"
        projectionKey="god"
        scope={scope}
      />,
    )
    rerender(
      <RoleEffectController
        cues={[cue(2)]}
        lastSequence={2}
        mode="full"
        projectionKey="god"
        scope={scope}
      />,
    )
    expect(document.querySelector('.aw-role-effect-overlay')).not.toBeNull()
  })
})

function withSession(status: string, phaseId = 'phase-day-speech'): MatchView {
  const base = matchView({ phaseId })
  return {
    ...base,
    seats: base.seats.map((seat, index) => ({
      ...seat,
      sessionStatus: index === 0 ? status : 'ready',
    })),
  } as MatchView
}

function withPostgame(status: string): MatchView {
  return {
    ...withSession(status),
    status: 'ended',
    winner: 'village',
    postgameReview: { state: 'collecting' },
  } as MatchView
}
