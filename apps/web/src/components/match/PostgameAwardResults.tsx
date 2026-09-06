import { GameIcon } from '../GameIcon.js'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { PostgameReviewResult, SeatView } from '@agentwolf/contracts'
import { PostgameRadar } from './PostgameRadar.js'

type PostgameAwardKind = 'mvp' | 'svp'

export function PostgameFeedAwards({
  result,
  seats,
}: {
  readonly result: PostgameReviewResult
  readonly seats: readonly SeatView[]
}) {
  return (
    <article className="aw-panel aw-feed-item aw-postgame-feed-result">
      <header className="aw-postgame-feed-result__header">
        <GameIcon name="award" size={23} />
        <div>
          <small>{getCopy('postgame.title')}</small>
          <h3>{getCopy('postgame.feedAwardsTitle')}</h3>
        </div>
      </header>
      <div className="aw-postgame-feed-awards">
        {(['mvp', 'svp'] as const).map((award) => {
          const awardResult = result[award]
          const playerResult = result.players.find(
            (player) => player.playerId === awardResult.playerId,
          )
          const seat = seats.find((candidate) => candidate.playerId === awardResult.playerId)
          return (
            <section className="aw-postgame-feed-award" data-award={award} key={award}>
              <PostgameAwardCard award={award} result={result} seats={seats} />
              {playerResult ? (
                <PostgameRadar
                  ariaLabel={formatCopy(getCopy('postgame.awardRadarAria'), {
                    award: award.toUpperCase(),
                    player: seat?.name ?? awardResult.playerId,
                  })}
                  overall={playerResult.overall}
                  scores={playerResult.scores}
                />
              ) : null}
            </section>
          )
        })}
      </div>
    </article>
  )
}

export function PostgameAwardCard({
  award,
  result,
  seats,
}: {
  readonly award: PostgameAwardKind
  readonly result: PostgameReviewResult
  readonly seats: readonly SeatView[]
}) {
  const awardResult = result[award]
  const seat = seats.find((candidate) => candidate.playerId === awardResult.playerId)
  const method = getCopy(
    awardResult.resolvedBy === 'votes'
      ? 'postgame.resolveVotes'
      : awardResult.resolvedBy === 'score'
        ? 'postgame.resolveScore'
        : 'postgame.resolveStableDraw',
  )
  return (
    <article className="aw-panel aw-postgame-award" data-award={award}>
      <GameIcon name="award" size={24} />
      <div>
        <small>{getCopy(`postgame.${award}`)}</small>
        <strong className="aw-player-name">
          {seat ? `${seat.seat} · ${seat.name}` : awardResult.playerId}
        </strong>
        <span>
          {formatCopy(getCopy('postgame.awardVotes'), {
            votes: awardResult.votes,
            method,
          })}
        </span>
      </div>
    </article>
  )
}
