import { vi } from 'vitest'

export const revokeMp3Url = vi.fn()

class FakeSourceBuffer extends EventTarget {
  readonly buffered = { length: 0 }
  readonly appendBuffer = vi.fn((_bytes: ArrayBuffer) => {
    this.buffered.length = 1
    queueMicrotask(() => this.dispatchEvent(new Event('updateend')))
  })
}

export class FakeMediaSource extends EventTarget {
  static all: FakeMediaSource[] = []
  readonly buffer = new FakeSourceBuffer()
  readonly endOfStream = vi.fn()
  readonly addSourceBuffer = vi.fn(() => this.buffer)
  public constructor() {
    super()
    FakeMediaSource.all.push(this)
  }
}

export class FakeMp3Audio extends EventTarget {
  static all: FakeMp3Audio[] = []
  public src = ''
  public ended = false
  readonly play = vi.fn(async () => undefined)
  readonly pause = vi.fn()
  readonly load = vi.fn()
  readonly removeAttribute = vi.fn()
  public constructor() {
    super()
    FakeMp3Audio.all.push(this)
  }
}

export function installMp3Audio(): void {
  revokeMp3Url.mockClear()
  FakeMediaSource.all = []
  FakeMp3Audio.all = []
  vi.stubGlobal('MediaSource', FakeMediaSource)
  vi.stubGlobal('Audio', FakeMp3Audio)
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = vi.fn((object: Blob | MediaSource) => {
        const media = object as unknown as FakeMediaSource
        queueMicrotask(() => media.dispatchEvent(new Event('sourceopen')))
        return 'blob:mp3-test'
      })
      static override revokeObjectURL = revokeMp3Url
    },
  )
}
