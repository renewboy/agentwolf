import { ArrowClockwise, ArrowRight, Plus, Pulse, Trash } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { MatchView } from '@agentwolf/contracts'
import { api } from '../api.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { ErrorState, LoadingState } from '../components/AsyncState.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { useRuntimeConfig } from '../hooks/useRuntimeConfig.js'

export function LobbyPage() {
  const { developerMode } = useRuntimeConfig()
  const [matches, setMatches] = useState<MatchView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<MatchView['id'] | null>(null)
  const [pendingDelete, setPendingDelete] = useState<MatchView | null>(null)
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

  return (
    <main className="aw-page">
      <section className="aw-lobby-hero">
        <div className="aw-page-heading">
          <h1>{getCopy('lobby.title')}</h1>
          <p>{getCopy('lobby.subtitle')}</p>
        </div>
        <Link className="aw-button aw-button--primary aw-link-button" to="/matches/new">
          <Plus size={18} aria-hidden />
          {getCopy('lobby.create')}
        </Link>
      </section>
      <section className="aw-match-section" aria-labelledby="match-list-heading">
        <div className="aw-section-toolbar">
          <h2 id="match-list-heading">{getCopy('lobby.activeMatches')}</h2>
          <button className="aw-button aw-button--icon" type="button" onClick={() => void load()}>
            <ArrowClockwise size={18} aria-hidden />
            {getCopy('lobby.refresh')}
          </button>
        </div>
        {error ? (
          <ErrorState message={error} retry={() => void load()} />
        ) : matches === null ? (
          <LoadingState />
        ) : matches.length === 0 ? (
          <div className="aw-empty-state aw-panel">
            <h3>{getCopy('lobby.empty')}</h3>
            <p>{getCopy('lobby.emptyHint')}</p>
            <Link className="aw-button" to="/matches/new">
              {getCopy('lobby.create')}
            </Link>
          </div>
        ) : (
          <div className="aw-match-list">
            {matches.map((match) => (
              <article className="aw-match-row aw-panel" data-match-id={match.id} key={match.id}>
                <div>
                  <StatusBadge status={match.status} />
                  <h3>{match.boardName}</h3>
                  <p>
                    {formatCopy(getCopy('lobby.matchMeta'), {
                      day: match.day,
                      phase: match.phaseLabel,
                    })}
                  </p>
                </div>
                <div className="aw-match-row__actions">
                  <Link className="aw-button aw-button--icon" to={`/matches/${match.id}`}>
                    {getCopy('lobby.watch')}
                    <ArrowRight size={18} aria-hidden />
                  </Link>
                  {developerMode ? (
                    <Link
                      className="aw-button aw-button--icon"
                      to={`/matches/${match.id}/trajectory`}
                    >
                      <Pulse size={18} aria-hidden />
                      {getCopy('lobby.trajectory')}
                    </Link>
                  ) : null}
                  <button
                    className="aw-button aw-button--danger aw-button--square"
                    disabled={deletingId === match.id}
                    title={getCopy('match.delete')}
                    type="button"
                    onClick={() => setPendingDelete(match)}
                  >
                    <Trash size={18} aria-hidden />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <ConfirmDialog
        busy={deletingId !== null}
        confirmLabel={getCopy('match.delete')}
        description={getCopy('match.deleteConfirm')}
        open={pendingDelete !== null}
        title={getCopy('match.deleteTitle')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && void deleteMatch(pendingDelete)}
      />
    </main>
  )
}
