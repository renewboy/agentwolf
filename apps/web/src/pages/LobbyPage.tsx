import { GameIcon } from '../components/GameIcon.js'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { MatchView } from '@agentwolf/contracts'
import { api } from '../api.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { useRuntimeConfig } from '../hooks/useRuntimeConfig.js'
import { gameArt } from '../game-art.js'

const SimulationWizardDialog = lazy(async () => {
  const module = await import('../components/SimulationWizardDialog.js')
  return { default: module.SimulationWizardDialog }
})

export function LobbyPage() {
  const { developerMode } = useRuntimeConfig()
  const [filter, setFilter] = useState<'all' | 'ongoing' | 'finished'>('all')
  const [matches, setMatches] = useState<MatchView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<MatchView['id'] | null>(null)
  const [pendingDelete, setPendingDelete] = useState<MatchView | null>(null)
  const [pendingSimulation, setPendingSimulation] = useState<MatchView | null>(null)
  const load = useCallback(async () => {
    setError(null)
    try {
      setMatches(await api.listMatches())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])
  useEffect(() => void load(), [load])

  const deleteMatch = async (match: MatchView): Promise<void> => {
    setDeletingId(match.id)
    setError(null)
    try {
      await api.deleteMatch(match.id)
      setMatches((current) => current?.filter((entry) => entry.id !== match.id) ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setDeletingId(null)
      setPendingDelete(null)
    }
  }

  const visibleMatches = matches?.filter(
    (match) =>
      filter === 'all' ||
      (filter === 'finished' ? match.status === 'ended' : match.status !== 'ended'),
  )

  return (
    <main className="aw-page aw-lobby-page">
      <section className="aw-lobby-hero">
        <img className="aw-lobby-hero__art" src={gameArt.village} alt="" fetchPriority="high" />
        <div className="aw-lobby-hero__content">
          <h1>{getCopy('lobby.title')}</h1>
          <p>{getCopy('lobby.subtitle')}</p>
          <div className="aw-lobby-hero__actions">
            <Link
              className="aw-button aw-button--primary aw-button--hero aw-lobby-hero__start"
              to="/matches/new"
            >
              {getCopy('lobby.create')}
            </Link>
            <Link className="aw-lobby-hero__browse" to="/boards">
              <GameIcon name="cards" size={18} />
              {getCopy('tableDesign.boardsLink')}
            </Link>
          </div>
        </div>
      </section>
      <section className="aw-match-section" aria-labelledby="match-list-heading">
        <div className="aw-section-toolbar">
          <h2 id="match-list-heading">{getCopy('lobby.activeMatches')}</h2>
          <button
            className="aw-button aw-button--compact"
            type="button"
            onClick={() => void load()}
          >
            <GameIcon name="refresh" size={18} />
            {getCopy('lobby.refresh')}
          </button>
        </div>
        <div className="aw-lobby-filters" role="group" aria-label={getCopy('lobby.activeMatches')}>
          {(['all', 'ongoing', 'finished'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {getCopy(`tableDesign.${value}`)}
              <span>
                {matches?.filter(
                  (match) =>
                    value === 'all' ||
                    (value === 'finished' ? match.status === 'ended' : match.status !== 'ended'),
                ).length ?? 0}
              </span>
            </button>
          ))}
        </div>
        {error ? (
          <ErrorState message={error} retry={() => void load()} />
        ) : matches === null ? (
          <LoadingState />
        ) : visibleMatches?.length === 0 ? (
          <div className="aw-empty-state aw-panel">
            <img className="aw-empty-state__art" src={gameArt.cardBack} alt="" />
            <h3>{getCopy(matches.length === 0 ? 'lobby.empty' : 'tableDesign.emptyFilter')}</h3>
            <p>{getCopy('lobby.emptyHint')}</p>
            <Link className="aw-button" to="/matches/new">
              {getCopy('lobby.create')}
            </Link>
          </div>
        ) : (
          <div className="aw-match-list">
            {visibleMatches?.map((match) => (
              <article className="aw-match-row aw-panel" data-match-id={match.id} key={match.id}>
                <img className="aw-match-row__art" src={gameArt.cardBack} alt="" loading="lazy" />
                <div className="aw-match-row__summary">
                  <h3>{match.boardName}</h3>
                  <p>{lobbyMatchMeta(match)}</p>
                </div>
                <div className="aw-match-row__state">
                  <StatusBadge status={match.status} variant="plain" />
                  {match.postgameReview ? (
                    <span className="aw-postgame-state">
                      {getCopy(`postgame.states.${match.postgameReview.state}`)}
                    </span>
                  ) : null}
                </div>
                <span className="aw-match-row__seats">
                  <GameIcon name="group" size={18} />
                  {formatCopy(getCopy('tableDesign.matchSeats'), { count: match.seats.length })}
                </span>
                <div className="aw-match-row__actions" data-has-tools={developerMode}>
                  <Link
                    className="aw-button aw-button--primary aw-button--compact aw-match-row__open"
                    to={`/matches/${match.id}`}
                  >
                    {getCopy(
                      match.status === 'ended' ? 'tableDesign.review' : 'tableDesign.resume',
                    )}
                  </Link>
                  {developerMode ? (
                    <div className="aw-match-row__tools">
                      <Link
                        className="aw-button aw-button--compact"
                        to={`/matches/${match.id}/trajectory`}
                      >
                        {getCopy('lobby.trajectory')}
                      </Link>
                      <button
                        className="aw-button aw-button--compact"
                        disabled={match.status !== 'paused' && match.status !== 'ended'}
                        aria-label={getCopy('simulationWizard.open')}
                        aria-description={
                          match.status === 'paused' || match.status === 'ended'
                            ? getCopy('simulationWizard.open')
                            : getCopy('simulationWizard.unavailable')
                        }
                        type="button"
                        onClick={() => setPendingSimulation(match)}
                      >
                        {getCopy('simulationWizard.open')}
                      </button>
                    </div>
                  ) : null}
                  <button
                    className="aw-button aw-button--compact aw-button--danger aw-button--square aw-match-row__delete"
                    disabled={deletingId === match.id}
                    aria-label={getCopy('match.delete')}
                    type="button"
                    onClick={() => setPendingDelete(match)}
                  >
                    <GameIcon name="trash" size={18} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer className="aw-lobby-footer">
        <span className="aw-lobby-footer__brand">
          <img src={gameArt.emblem} alt="" width={24} height={24} />
          <span>{getCopy('brand')}</span>
        </span>
        <p>{getCopy('tableDesign.lobbyMotto')}</p>
      </footer>
      <ConfirmDialog
        busy={deletingId !== null}
        confirmLabel={getCopy('match.delete')}
        description={getCopy('match.deleteConfirm')}
        open={pendingDelete !== null}
        title={getCopy('match.deleteTitle')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && void deleteMatch(pendingDelete)}
      />
      {pendingSimulation ? (
        <Suspense fallback={null}>
          <SimulationWizardDialog
            match={pendingSimulation}
            onClose={() => setPendingSimulation(null)}
          />
        </Suspense>
      ) : null}
    </main>
  )
}

function lobbyMatchMeta(match: MatchView): string {
  const night = match.phaseId.includes('night')
  const day = night ? match.day + 1 : match.day
  if (match.status === 'ended') return formatCopy(getCopy('match.day'), { day })
  return formatCopy(getCopy(night ? 'tableDesign.nightMeta' : 'lobby.matchMeta'), {
    day,
    phase: match.phaseLabel,
  })
}
