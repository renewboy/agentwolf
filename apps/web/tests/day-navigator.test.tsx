import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TimelineItem, TrajectoryPage } from '@agentwolf/contracts'
import { DayNavigator } from '../src/components/DayNavigator.js'
import { currentMatchDay, matchTimelineDays } from '../src/match-timeline.js'
import { trajectoryDayTargets } from '../src/components/developer/trajectory-timeline.js'

describe('DayNavigator', () => {
  it('supports keyboard selection and selecting the same date again', async () => {
    const onSelect = vi.fn()
    const { rerender } = render(<DayNavigator day={3} days={[1, 3]} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: '第 1 天' }))
    rerender(<DayNavigator day={1} days={[1, 3]} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: '第 1 天' }))
    expect(onSelect.mock.calls).toEqual([[1], [1]])
    await userEvent.click(screen.getByRole('combobox'))
    await waitFor(() => expect(screen.getByRole('listbox')).toHaveFocus())
    await userEvent.keyboard('{End}{Enter}')
    expect(onSelect).toHaveBeenLastCalledWith(3)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('disables navigation when no date has readable records', () => {
    render(<DayNavigator day={4} days={[]} onSelect={vi.fn()} />)
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('combobox')).toHaveTextContent('第 4 天')
  })

  it('closes a pending projection menu before its dates become unavailable', async () => {
    const onSelect = vi.fn()
    const { rerender } = render(<DayNavigator day={1} days={[1, 2]} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeVisible()
    rerender(<DayNavigator day={1} days={[1, 2]} disabled onSelect={onSelect} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('visible date navigation', () => {
  it('uses the same night/day cycles as the speech feed and excludes postgame entries', () => {
    const timeline = [
      { kind: 'match.created' },
      { kind: 'night.started' },
      { kind: 'day.started' },
      { kind: 'speech.committed' },
      { kind: 'night.started' },
      { kind: 'speech.committed', postgame: true },
    ] as TimelineItem[]
    expect(matchTimelineDays(timeline)).toEqual([1, 2])
    expect(matchTimelineDays([{ kind: 'day.started' }] as TimelineItem[])).toEqual([1])
    expect(matchTimelineDays([])).toEqual([])
    expect(currentMatchDay({ day: 0, phaseId: 'phase-night-wolf' })).toBe(1)
    expect(currentMatchDay({ day: 2, phaseId: 'phase-match-ended' })).toBe(2)
  })

  it('lists only owner days with reachable records, using the earliest record in each cycle', () => {
    const page = {
      turns: [
        { turnId: 'night', timelineGroup: { kind: 'night', index: 1 } },
        { turnId: 'sheriff', timelineGroup: { kind: 'sheriff', index: 1 } },
        { turnId: 'empty', timelineGroup: { kind: 'day', index: 2 } },
        { turnId: 'day', timelineGroup: { kind: 'day', index: 3 } },
        { turnId: 'review', timelineGroup: { kind: 'review', index: null } },
      ],
      records: [
        { recordId: 'later', turnId: 'sheriff', ordinal: 5 },
        { recordId: 'third', turnId: 'day', ordinal: 7 },
        { recordId: 'first', turnId: 'night', ordinal: 2 },
        { recordId: 'review', turnId: 'review', ordinal: 9 },
      ],
    } as unknown as TrajectoryPage
    expect(trajectoryDayTargets(page)).toEqual([
      { day: 1, recordId: 'first' },
      { day: 3, recordId: 'third' },
    ])
    expect(trajectoryDayTargets(null)).toEqual([])
  })
})
