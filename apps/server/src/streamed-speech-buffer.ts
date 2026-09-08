import type { GameEvent, MatchView, PlayerId, SpeechId } from '@agentwolf/contracts'

interface SpeechAttempt {
  readonly speechId: SpeechId
  readonly playerId: PlayerId
}

export class StreamedSpeechBuffer {
  #current: { readonly attempt: SpeechAttempt; text: string } | null = null

  public begin(speechId: SpeechId | null, playerId: PlayerId): SpeechAttempt | null {
    if (speechId === null) return null
    const attempt = { speechId, playerId }
    this.#current = { attempt, text: '' }
    return attempt
  }

  public append(attempt: SpeechAttempt | null, text: string): boolean {
    if (!this.#current || this.#current.attempt !== attempt) return false
    this.#current.text += text
    return true
  }

  public project(authorizedProjection: MatchView): MatchView {
    const active = authorizedProjection.activeSpeech
    const current = this.#current
    if (
      !current ||
      !active ||
      active.final ||
      active.speechId !== current.attempt.speechId ||
      active.playerId !== current.attempt.playerId
    ) {
      return authorizedProjection
    }
    return { ...authorizedProjection, activeSpeech: { ...active, text: current.text } }
  }

  public clear(attempt?: SpeechAttempt | null): void {
    if (attempt === undefined || this.#current?.attempt === attempt) this.#current = null
  }

  public clearOnBoundary(events: readonly GameEvent[]): void {
    if (
      events.some(
        ({ payload }) => payload.type === 'speech.started' || payload.type === 'speech.committed',
      )
    ) {
      this.clear()
    }
  }
}
