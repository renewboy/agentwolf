import {
  ArrowLeft,
  ArrowsLeftRight,
  CheckCircle,
  Eye,
  EyeClosed,
  SpeakerHigh,
  SpeakerSlash,
  UserFocus,
  WifiHigh,
  WifiSlash,
} from '@phosphor-icons/react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatCopy, getCopy } from '@agentwolf/assets'
import {
  PlayerIdSchema,
  type MatchView,
  type PlayerId,
  type RoleEffectMode,
  type SpectatorView,
} from '@agentwolf/contracts'
import type { LiveConnectionState } from '../../hooks/useLiveMatch.js'
import { useRuntimeConfig } from '../../hooks/useRuntimeConfig.js'
import { GameSelect } from '../GameSelect.js'
import { StatusBadge } from '../StatusBadge.js'

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
  effectMode,
  setEffectMode,
}: {
  readonly match: MatchView
  readonly viewKind: SpectatorView['kind']
  readonly setViewKind: (view: SpectatorView['kind']) => void
  readonly playerId: PlayerId
  readonly setPlayerId: (playerId: PlayerId) => void
  readonly connectionState: LiveConnectionState
  readonly audioEnabled: boolean
  readonly audioBusyElsewhere: boolean
  readonly audioSupported: boolean
  readonly onToggleAudio: () => void
  readonly effectMode: RoleEffectMode
  readonly setEffectMode: (mode: RoleEffectMode) => void
}) {
  const { developerMode } = useRuntimeConfig()
  const showTrajectoryLink = developerMode && match.status !== 'paused'
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
    !audioSupported || audioBusyElsewhere || connectionState !== 'live' || match.status === 'ended'
  const effectOptions = useMemo(
    () =>
      (['full', 'reduced', 'off'] as const).map((mode) => ({
        value: mode,
        label: getCopy(`effects.${mode}`),
      })),
    [],
  )
  return (
    <header className="aw-match-hud">
      <div className="aw-match-hud__inner">
        <div className="aw-match-brand">
          <Link
            className="aw-button aw-button--square aw-tooltip-button aw-tooltip-button--start"
            aria-label={getCopy('match.backLobby')}
            data-tooltip={getCopy('match.backLobby')}
            to="/"
          >
            <ArrowLeft size={18} aria-hidden />
          </Link>
          {showTrajectoryLink ? (
            <Link
              className="aw-button aw-button--square aw-tooltip-button"
              aria-label={getCopy('match.openTrajectory')}
              data-tooltip={getCopy('match.openTrajectory')}
              to={`/matches/${match.id}/trajectory`}
            >
              <ArrowsLeftRight size={18} aria-hidden />
            </Link>
          ) : null}
          <div>
            <span className="aw-brand">{getCopy('brand')}</span>
            <small>{match.boardName}</small>
          </div>
        </div>

        <div className="aw-phase-display">
          <span>
            {formatCopy(getCopy(match.phaseId.includes('night') ? 'match.night' : 'match.day'), {
              day: match.phaseId.includes('night') ? match.day + 1 : match.day,
            })}
          </span>
          <strong className="aw-phase-title">{match.phaseLabel}</strong>
          <StatusBadge status={match.status} />
        </div>

        <div className="aw-match-controls">
          <div className="aw-segmented aw-view-switch" aria-label={getCopy('match.viewSelector')}>
            <ViewButton
              active={viewKind === 'god'}
              icon={<Eye />}
              label={getCopy('views.god')}
              onClick={() => setViewKind('god')}
            />
            <ViewButton
              active={viewKind === 'closed-eye'}
              icon={<EyeClosed />}
              label={getCopy('views.closedEye')}
              onClick={() => setViewKind('closed-eye')}
            />
            <ViewButton
              active={viewKind === 'player'}
              icon={<UserFocus />}
              label={getCopy('views.player')}
              onClick={() => setViewKind('player')}
            />
          </div>

          {viewKind === 'player' ? (
            <div className="aw-view-player-select">
              <GameSelect
                ariaLabel={getCopy('match.selectPlayer')}
                value={playerId}
                options={playerOptions}
                onChange={(nextPlayerId) => setPlayerId(PlayerIdSchema.parse(nextPlayerId))}
              />
            </div>
          ) : null}

          <ConnectionIndicator state={connectionState} />
          <div className="aw-effect-mode-select">
            <GameSelect
              ariaLabel={getCopy('effects.mode')}
              value={effectMode}
              options={effectOptions}
              onChange={(mode) => setEffectMode(mode)}
            />
          </div>
          <button
            className="aw-button aw-button--square aw-audio-toggle"
            aria-label={audioLabel}
            aria-pressed={audioEnabled}
            data-enabled={audioEnabled}
            disabled={audioDisabled}
            title={audioLabel}
            type="button"
            onClick={onToggleAudio}
          >
            {audioEnabled ? (
              <SpeakerHigh size={19} aria-hidden />
            ) : (
              <SpeakerSlash size={19} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </header>
  )
}

function ConnectionIndicator({ state }: { readonly state: LiveConnectionState }) {
  const label = getCopy(
    state === 'live'
      ? 'match.connectionLive'
      : state === 'settled'
        ? 'match.connectionSettled'
        : state === 'unavailable'
          ? 'match.connectionUnavailable'
          : state === 'reconnecting'
            ? 'match.connectionReconnecting'
            : 'match.connectionConnecting',
  )
  return (
    <div className="aw-connection-indicator" data-state={state} title={label} role="status">
      {state === 'live' ? (
        <WifiHigh size={17} aria-hidden />
      ) : state === 'settled' ? (
        <CheckCircle size={17} weight="fill" aria-hidden />
      ) : (
        <WifiSlash size={17} aria-hidden />
      )}
      <span>{label}</span>
      <span className="aw-connection-indicator__bars" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </div>
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
      className="aw-segmented__item"
      aria-pressed={active}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
