import { useCallback, useMemo, type RefObject } from 'react'
import { useSequencedCues } from '@agent-arena/react'
import { SequencedCueQueue } from '@agent-arena/web-runtime'
import type { RoleEffectCue, RoleEffectMode } from '@agentwolf/contracts'
import { RoleEffectScene } from '../../motion/role-effects/RoleEffectScene.js'

export function RoleEffectController({
  scope,
  cues,
  lastSequence,
  projectionKey,
  mode,
}: {
  readonly scope: RefObject<HTMLElement | null>
  readonly cues: readonly RoleEffectCue[]
  readonly lastSequence: number
  readonly projectionKey: string
  readonly mode: RoleEffectMode
}) {
  const queue = useMemo(
    () =>
      new SequencedCueQueue<RoleEffectCue, string>({
        key: (cue) => cue.cueId,
        sequence: (cue) => cue.sequence,
      }),
    [],
  )
  const update = useMemo(
    () => ({ cues, lastSequence, projectionKey, enabled: mode !== 'off' }),
    [cues, lastSequence, mode, projectionKey],
  )
  const { current } = useSequencedCues(queue, update)
  const complete = useCallback(() => queue.completeCurrent(), [queue])
  if (!current || mode === 'off') return null
  return (
    <RoleEffectScene
      key={current.cueId}
      cue={current}
      mode={mode}
      scope={scope}
      onComplete={complete}
    />
  )
}
