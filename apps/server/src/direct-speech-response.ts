import type { AcpPromptCallbacks } from '@agentwolf/acp'

const retainedBoundaryTail = 48
const filteredDiagnostic =
  'Filtered embedded ACP role content or post-tool text from the direct speech response.'

const embeddedRoleBoundary =
  /(?:^|(?:\r?\n)+)[ \t]{0,16}(?:user|assistant|analysis|system|human)[ \t]*(?=[:\uFF1A]|\p{Script=Han}|#|\r|\n)/iu

export class DirectSpeechResponse {
  readonly #emit: (chunk: string) => void
  #pending = ''
  #text = ''
  #sawTextChunk = false
  #closed = false
  #filtered = false

  public constructor(emit: (chunk: string) => void) {
    this.#emit = emit
  }

  public get diagnostic(): string | null {
    return this.#filtered ? filteredDiagnostic : null
  }

  public push(chunk: string): void {
    this.#sawTextChunk = true
    if (!chunk) return
    if (this.#closed) {
      this.#filtered = true
      return
    }
    this.#pending += chunk
    this.#flush(false)
  }

  public actionToolBoundary(): void {
    if (this.#closed && this.#text.trim()) return
    if (this.#closed) this.#closed = false
    this.#flush(true)
    this.#filtered = true
    if (this.#text.trim()) {
      this.#closed = true
    } else {
      this.#pending = ''
      this.#text = ''
      this.#closed = false
    }
  }

  public finish(fallbackText: string): string {
    if (!this.#sawTextChunk && !this.#closed) this.#pending += fallbackText
    if (!this.#closed) this.#flush(true)
    return this.#text
  }

  #flush(final: boolean): void {
    const boundary = this.#pending.search(embeddedRoleBoundary)
    if (boundary >= 0) {
      this.#append(this.#pending.slice(0, boundary).replace(/[ \t\r\n]+$/u, ''))
      this.#pending = ''
      this.#closed = true
      this.#filtered = true
      return
    }
    const length = final
      ? this.#pending.length
      : Math.max(0, this.#pending.length - retainedBoundaryTail)
    if (length === 0) return
    this.#append(this.#pending.slice(0, length))
    this.#pending = this.#pending.slice(length)
  }

  #append(value: string): void {
    if (!value) return
    this.#text += value
    this.#emit(value)
  }
}

export function prepareDirectSpeechResponse(callbacks: AcpPromptCallbacks): {
  readonly response: DirectSpeechResponse
  readonly callbacks: AcpPromptCallbacks
} {
  const response = new DirectSpeechResponse((chunk) => callbacks.onTextChunk?.(chunk))
  return {
    response,
    callbacks: {
      onTextChunk: (chunk) => response.push(chunk),
      onUpdate: (update) => {
        if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
          response.actionToolBoundary()
        }
        callbacks.onUpdate?.(update)
      },
    },
  }
}
