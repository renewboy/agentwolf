import { formatCopy, getCopy } from '@agentwolf/assets'
import type { PostgameAggregateScores, PostgameReviewScores } from '@agentwolf/contracts'

const dimensions = [
  'information',
  'communication',
  'decision',
  'objective',
  'adaptability',
] as const satisfies readonly (keyof PostgameReviewScores)[]

export function PostgameRadar({
  scores,
  overall,
  ariaLabel,
}: {
  readonly scores: PostgameReviewScores | PostgameAggregateScores
  readonly overall?: number
  readonly ariaLabel?: string
}) {
  const center = 100
  const radius = 66
  const point = (index: number, scale: number): [number, number] => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / dimensions.length
    return [center + Math.cos(angle) * radius * scale, center + Math.sin(angle) * radius * scale]
  }
  const polygon = (scale: number): string =>
    dimensions.map((_dimension, index) => point(index, scale).join(',')).join(' ')
  const scorePolygon = dimensions
    .map((dimension, index) => point(index, scores[dimension] / 10).join(','))
    .join(' ')

  return (
    <div className="aw-postgame-radar">
      <svg
        aria-label={ariaLabel ?? getCopy('postgame.finalResult')}
        className="aw-postgame-radar__chart"
        role="img"
        viewBox="0 0 200 200"
      >
        {[0.2, 0.4, 0.6, 0.8, 1].map((scale) => (
          <polygon className="aw-postgame-radar__grid" key={scale} points={polygon(scale)} />
        ))}
        {dimensions.map((dimension, index) => {
          const [x, y] = point(index, 1)
          return (
            <line
              className="aw-postgame-radar__axis"
              key={dimension}
              x1={center}
              x2={x}
              y1={center}
              y2={y}
            />
          )
        })}
        <polygon className="aw-postgame-radar__value" points={scorePolygon} />
        {dimensions.map((dimension, index) => {
          const [x, y] = point(index, scores[dimension] / 10)
          return <circle className="aw-postgame-radar__point" cx={x} cy={y} key={dimension} r="3" />
        })}
      </svg>
      {overall === undefined ? null : (
        <strong className="aw-postgame-radar__overall">
          {formatCopy(getCopy('postgame.overall'), { score: overall.toFixed(1) })}
        </strong>
      )}
      <dl className="aw-postgame-radar__values">
        {dimensions.map((dimension) => (
          <div key={dimension}>
            <dt>{getCopy(`postgame.dimensions.${dimension}`)}</dt>
            <dd>{scores[dimension].toFixed(1)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
