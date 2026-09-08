import { GameIcon } from '../GameIcon.js'
import { useMemo } from 'react'
import { Select } from '@agent-arena/react'
import { formatCopy, getCopy } from '@agentwolf/assets'
import {
  PlayerIdSchema,
  type MatchView,
  type PlayerId,
  type SpectatorView,
} from '@agentwolf/contracts'
import type { LiveConnectionState } from '../../hooks/useLiveMatch.js'
import { MatchRouteHeader } from './MatchRouteHeader.js'
import { matchTimelineDays } from '../../match-timeline.js'

const playerMenuClasses = {
  root: 'aw-view-player-menu',
  trigger: 'aw-segmented__item aw-choice aw-view-player-menu__trigger',
  layer: 'aw-game-select-layer',
  listbox: 'aw-game-select__listbox',
  option: 'aw-game-select__option aw-choice',
  empty: 'aw-game-select__empty',
}
const selectedPlayerMenuClasses = {
  ...playerMenuClasses,
  trigger: `${playerMenuClasses.trigger} aw-choice--selected`,
}
const playerMenuPosition = {
  left: '--aw-select-left',
  top: '--aw-select-top',
  width: '--aw-select-width',
  maxHeight: '--aw-select-max-height',
}

export function MatchHeader({
  match,
  viewKind,
  setViewKind,
  playerId,
  setPlayerId,
  connectionState,
  audioEnabled,
  audioBusyElsewhere,
  audioSupported,
  onToggleAudio,
  viewPending = false,
  selectedDay,
  onSelectDay,
}: {
  readonly match: MatchView
  readonly viewPending?: boolean
  readonly selectedDay?: number | undefined
  readonly onSelectDay?: ((day: number) => void) | undefined
  readonly viewKind: SpectatorView['kind']
  readonly setViewKind: (view: SpectatorView['kind']) => void
  readonly playerId: PlayerId | null
  readonly setPlayerId: (playerId: PlayerId) => void
  readonly connectionState: LiveConnectionState
  readonly audioEnabled: boolean
  readonly audioBusyElsewhere: boolean
  readonly audioSupported: boolean
  readonly onToggleAudio: () => void
}) {
  const days = useMemo(() => matchTimelineDays(match.timeline), [match.timeline])
  const playerOptions = useMemo(
    () =>
      match.seats.map((seat) => ({
        value: seat.playerId,
        label: formatCopy(getCopy('narration.playerLabel'), {
          seat: seat.seat,
          name: seat.name,
        }),
      })),
    [match.seats],
  )
  const audioLabel = getCopy(
    !audioSupported
      ? 'match.audioUnsupported'
      : audioBusyElsewhere
        ? 'match.audioControllerBusy'
        : audioEnabled
          ? 'match.audioOn'
          : 'match.audioOff',
  )
  const audioDisabled =
    !audioSupported ||
    audioBusyElsewhere ||
    connectionState !== 'live' ||
    (match.status === 'ended' &&
      (!match.postgameReview || ['completed', 'skipped'].includes(match.postgameReview.state)))
  return (
    <MatchRouteHeader
      match={match}
      page="match"
      viewPending={viewPending}
      days={days}
      selectedDay={selectedDay}
      onSelectDay={onSelectDay}
    >
      <div className="aw-match-controls">
        <div
          className="aw-segmented aw-segmented--compact aw-segmented--spectator aw-view-switch"
          aria-label={getCopy('match.viewSelector')}
        >
          <ViewButton
            active={viewKind === 'closed-eye'}
            icon={<GameIcon name="eye-closed" />}
            label={getCopy('views.closedEye')}
            onClick={() => setViewKind('closed-eye')}
          />
          <Select
            ariaLabel={getCopy('views.player')}
            value={viewKind === 'player' ? (playerId ?? '') : ''}
            options={playerOptions}
            classNames={viewKind === 'player' ? selectedPlayerMenuClasses : playerMenuClasses}
            positionVariables={playerMenuPosition}
            selectedIndicator={<GameIcon name="check" size={17} />}
            triggerIndicator={
              <>
                <GameIcon name="pawn" />
                <span>{getCopy('views.player')}</span>
              </>
            }
            onChange={(nextPlayerId) => {
              setPlayerId(PlayerIdSchema.parse(nextPlayerId))
              setViewKind('player')
            }}
          />
          <ViewButton
            active={viewKind === 'god'}
            icon={<GameIcon name="eye" />}
            label={getCopy('views.god')}
            onClick={() => setViewKind('god')}
          />
        </div>

        <button
          className="aw-button aw-button--compact aw-button--square aw-audio-toggle"
          aria-label={audioLabel}
          aria-pressed={audioEnabled}
          data-enabled={audioEnabled}
          disabled={audioDisabled}
          type="button"
          onClick={onToggleAudio}
        >
          {audioEnabled ? <GameIcon name="sound" size={19} /> : <GameIcon name="mute" size={19} />}
        </button>
      </div>
    </MatchRouteHeader>
  )
}

function ViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean
  readonly icon: React.ReactNode
  readonly label: string
  readonly onClick: () => void
}) {
  return (
    <button
      className="aw-segmented__item aw-choice"
      aria-pressed={active}
      aria-label={label}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
