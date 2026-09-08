import type { InkActivityState } from './InkActivity.js'

const movingStates = new Set<InkActivityState>([
  'starting',
  'syncing',
  'thinking',
  'voting',
  'reconnecting',
  'speaking',
  'narrating',
])

export function AvatarActivity({ state }: { readonly state: InkActivityState }) {
  if (!movingStates.has(state)) return null
  return (
    <svg className="aw-avatar-orbit" viewBox="0 0 100 100" fill="none" aria-hidden>
      <circle className="aw-avatar-orbit__track" cx="50" cy="50" r="45" />
      <g className="aw-avatar-orbit__rotor">
        <path
          className="aw-avatar-orbit__trail"
          d="M50 5A45 45 0 0 1 95 50M50 95A45 45 0 0 1 5 50"
        />
        <path
          className="aw-avatar-orbit__cut"
          d="M51 5A45 45 0 0 1 90 29M49 95A45 45 0 0 1 10 71"
        />
        <path
          className="aw-avatar-orbit__etch"
          d="M60 10A41 41 0 0 1 90 41M40 90A41 41 0 0 1 10 59"
        />
        <path className="aw-avatar-orbit__tip" d="M95 46L97 50L95 54L93 50ZM5 46L7 50L5 54L3 50Z" />
      </g>
    </svg>
  )
}
