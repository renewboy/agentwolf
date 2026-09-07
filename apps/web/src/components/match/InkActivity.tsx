export type InkActivityState =
  | 'idle'
  | 'starting'
  | 'syncing'
  | 'thinking'
  | 'waiting'
  | 'voting'
  | 'reconnecting'
  | 'speaking'
  | 'narrating'
  | 'ready'
  | 'paused'
  | 'ended'

export function InkActivity({
  state,
  className = '',
}: {
  readonly state: InkActivityState
  readonly className?: string
}) {
  return (
    <svg
      className={`aw-ink-activity ${className}`}
      data-motion={state}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
    >
      <g className="aw-ink-activity__orbit">
        <path
          className="aw-ink-activity__arc"
          d="M10 35C3 24 8 11 20 7L27 6M37 13C45 23 40 38 29 41L21 42"
        />
        <path className="aw-ink-activity__echo" d="M14 39C4 30 4 17 13 10M35 8C45 16 46 30 36 39" />
      </g>
      <g className="aw-ink-activity__moons">
        <path d="M23 9C9 14 9 34 25 39C16 30 16 19 23 9Z" />
        <path d="M27 10C38 17 38 31 26 39C33 26 32 19 27 10Z" />
      </g>
      <g className="aw-ink-activity__marks">
        <path d="M10 16L34 15L38 17L12 18Z" />
        <path d="M8 24L38 23L40 25L11 27Z" />
        <path d="M12 33L35 31L38 33L14 35Z" />
      </g>
      <g className="aw-ink-activity__voice">
        <path d="M13 17L16 16L17 33L13 34Z" />
        <path d="M22 9L26 8L27 40L23 39Z" />
        <path d="M32 15L35 16L36 34L32 33Z" />
      </g>
      <g className="aw-ink-activity__clouds">
        <path d="M5 19H23C35 19 34 10 27 11C23 12 24 16 27 16M4 23H31C45 23 42 7 33 8" />
        <path d="M43 31H23C10 31 13 41 20 39C24 38 21 34 19 35M43 27H16C3 27 5 44 14 43" />
      </g>
      <g className="aw-ink-activity__ballot">
        <path d="M12 10L33 9L37 15L36 33L30 39L11 37Z" />
        <path d="M12 13L24 23L35 13M12 35L21 26M35 34L27 26" />
        <path className="aw-ink-activity__ballot-seal" d="M24 20L29 25L24 30L19 25Z" />
      </g>
      <g className="aw-ink-activity__connection">
        <path d="M3 25L15 24L21 15L21 33L27 24" />
        <path d="M45 25L33 24L27 15L27 33L21 24" />
      </g>
      <g className="aw-ink-activity__ending">
        <path d="M10 8L35 7L41 13L39 38L33 43L9 40L6 14ZM13 14L31 13M12 34L31 35M16 20L31 20M20 18L20 29M14 29L31 28" />
      </g>
      <path className="aw-ink-activity__seal" d="M24 17L30 24L24 31L18 24Z" />
    </svg>
  )
}
