import { formatCopy, getCopy } from '@agentwolf/assets'
import type { MatchView, TimelineItem } from '@agentwolf/contracts'

export interface MatchTimelineGroup {
  readonly key: string
  readonly label: string
  readonly items: readonly TimelineItem[]
}

export function matchTimelineDays(timeline: readonly TimelineItem[]): readonly number[] {
  return groupMatchTimeline(timeline, false)
    .filter((group) => group.key.startsWith('day-'))
    .map((group) => Number(group.key.slice(4)))
}

export function currentMatchDay(match: Pick<MatchView, 'day' | 'phaseId'>): number {
  return Math.max(1, match.day + Number(match.phaseId.includes('night')))
}

export function groupMatchTimeline(
  timeline: readonly TimelineItem[],
  postgameStarted: boolean,
): MatchTimelineGroup[] {
  const groups: Array<{ key: string; label: string; items: TimelineItem[] }> = [
    { key: 'setup', label: getCopy('match.setupGroup'), items: [] },
  ]
  let cycle = 0
  let current = groups[0]!
  for (const item of timeline) {
    if (item.postgame) {
      const existing = groups.find((group) => group.key === 'postgame')
      current =
        existing ??
        ({
          key: 'postgame',
          label: getCopy('postgame.feedGroup'),
          items: [],
        } satisfies MatchTimelineGroup)
      if (!existing) groups.push(current)
    } else if (item.kind === 'night.started') {
      cycle += 1
      current = {
        key: `day-${cycle}`,
        label: formatCopy(getCopy('match.dayGroup'), { day: cycle }),
        items: [],
      }
      groups.push(current)
    } else if (item.kind === 'day.started' && cycle === 0) {
      cycle = 1
      current = {
        key: `day-${cycle}`,
        label: formatCopy(getCopy('match.dayGroup'), { day: cycle }),
        items: [],
      }
      groups.push(current)
    }
    current.items.push(item)
  }
  if (postgameStarted && !groups.some((group) => group.key === 'postgame')) {
    groups.push({ key: 'postgame', label: getCopy('postgame.feedGroup'), items: [] })
  }
  return groups.filter(
    (group) => group.items.length > 0 || (postgameStarted && group.key === 'postgame'),
  )
}
