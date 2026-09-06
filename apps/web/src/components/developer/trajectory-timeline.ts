import { formatCopy, getCopy } from '@agentwolf/assets'
import type {
  TrajectoryOwnerId,
  TrajectoryPage,
  TrajectoryRecord,
  TrajectoryTimelineGroup,
} from '@agentwolf/contracts'

export interface TrajectoryRecordJump {
  readonly day: number
  readonly recordId: string
  readonly ownerId: TrajectoryOwnerId
  readonly requestId: number
}

export function trajectoryDayTargets(page: TrajectoryPage | null): readonly {
  readonly day: number
  readonly recordId: string
}[] {
  if (!page) return []
  const turnDays = new Map(
    page.turns.map((turn) => [turn.turnId, trajectoryGroupDay(turn.timelineGroup)]),
  )
  const targets = new Map<number, string>()
  for (const record of [...page.records].sort((left, right) => left.ordinal - right.ordinal)) {
    const day = turnDays.get(record.turnId)
    if (day !== null && day !== undefined && !targets.has(day)) targets.set(day, record.recordId)
  }
  return [...targets]
    .sort(([left], [right]) => left - right)
    .map(([day, recordId]) => ({ day, recordId }))
}

function trajectoryGroupDay(group: TrajectoryTimelineGroup): number | null {
  switch (group.kind) {
    case 'night':
    case 'day':
    case 'sheriff':
      return group.index ?? 1
    case 'setup':
    case 'end':
    case 'review':
      return null
    default: {
      const exhaustive: never = group.kind
      return exhaustive
    }
  }
}

export function timelineGroupId(group: TrajectoryTimelineGroup): string {
  return `${group.kind}:${group.index ?? 0}`
}

export function timelineGroupLabel(group: TrajectoryTimelineGroup): string {
  switch (group.kind) {
    case 'setup':
      return getCopy('trajectory.groups.setup')
    case 'night':
      return formatCopy(getCopy('trajectory.groups.night'), { index: group.index ?? 1 })
    case 'sheriff':
      return getCopy('trajectory.groups.sheriff')
    case 'day':
      return formatCopy(getCopy('trajectory.groups.day'), { index: group.index ?? 1 })
    case 'end':
      return getCopy('trajectory.groups.end')
    case 'review':
      return getCopy('trajectory.groups.review')
    default: {
      const exhaustive: never = group.kind
      return exhaustive
    }
  }
}

export function recordLabel(record: TrajectoryRecord): string {
  return getCopy(`trajectory.kinds.${record.kind}`)
}
