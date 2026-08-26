import { formatCopy, getCopy } from '@agentwolf/assets'
import type { TrajectoryTimelineGroup } from '@agentwolf/contracts'

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
