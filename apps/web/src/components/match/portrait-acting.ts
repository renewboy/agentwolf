import type { PortraitActing, PortraitTrack } from '@agentwolf/assets'

export function samplePortraitTrack(track: PortraitTrack, progress: number): number {
  if (progress < 0) return 0
  for (let i = 1; i < track.keys.length; i++) {
    const [start, from] = track.keys[i - 1]!,
      [end, to] = track.keys[i]!
    if (progress > end) continue
    const t = Math.max(0, Math.min(1, (progress - start) / (end - start)))
    return from + (to - from) * t * t * (3 - 2 * t)
  }
  return track.keys.at(-1)?.[1] ?? 0
}

/** A first speaking gesture followed by infrequent, audible reprises. */
export class PortraitActingState {
  cue = -1
  readonly eyes: [number, number] = [0, 0]
  readonly gestures: number[]
  #cueStarted: number | undefined
  #nextCue: number

  constructor(private readonly definition: PortraitActing | undefined) {
    this.gestures = definition?.gestures.map(() => 0) ?? []
    this.#nextCue = definition?.firstCue ?? Infinity
  }

  step(elapsed: number, level: number): void {
    const acting = this.definition
    if (!acting) {
      const cycle = (elapsed + 2.6) % 5.7
      const blink = cycle < 0.17 ? Math.sin((cycle / 0.17) * Math.PI) ** 0.7 : 0
      this.eyes[0] = this.eyes[1] = blink
      return
    }
    if (elapsed >= this.#nextCue && (this.#cueStarted === undefined || level > 0.012)) {
      this.#cueStarted = elapsed
      this.#nextCue = elapsed + acting.cueInterval
    }
    const progress =
      this.#cueStarted === undefined ? -1 : (elapsed - this.#cueStarted) / acting.cueDuration
    this.cue = progress >= 0 && progress <= 1 ? progress : -1
    acting.gestures.forEach((gesture, i) => {
      this.gestures[i] = samplePortraitTrack(gesture, this.cue)
    })
    const blink = this.blinkAt(elapsed, acting.blink)
    const squint = acting.squint ? samplePortraitTrack(acting.squint, this.cue) : 0
    this.eyes[0] = Math.max(blink, squint * (acting.squint?.amount[0] ?? 0))
    this.eyes[1] = Math.max(blink, squint * (acting.squint?.amount[1] ?? 0))
  }

  private blinkAt(elapsed: number, blink: PortraitActing['blink']): number {
    if (elapsed < blink.first) return 0
    let local = elapsed - blink.first
    const period = blink.intervals.reduce((sum, interval) => sum + interval, 0)
    local %= period
    for (const interval of blink.intervals) {
      if (local < interval) break
      local -= interval
    }
    if (local >= blink.duration) return 0
    const phase = local / blink.duration,
      closing = (1 - blink.hold) * 0.38
    if (phase < closing) return Math.sin(((phase / closing) * Math.PI) / 2)
    if (phase < closing + blink.hold) return 1
    return Math.cos((((phase - closing - blink.hold) / (1 - closing - blink.hold)) * Math.PI) / 2)
  }
}
