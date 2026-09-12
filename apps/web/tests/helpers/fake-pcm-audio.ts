import { vi } from 'vitest'

export class FakePcmBuffer {
  readonly data: Float32Array
  readonly duration: number
  readonly length: number

  public constructor(samples: number, rate: number) {
    this.length = samples
    this.data = new Float32Array(samples)
    this.duration = samples / rate
  }

  public getChannelData(): Float32Array {
    return this.data
  }
}

export class FakePcmSource extends EventTarget {
  public buffer: FakePcmBuffer | null = null
  public playbackRate = { value: 1 }
  readonly connect = vi.fn()
  readonly disconnect = vi.fn()
  readonly start = vi.fn<(when: number) => void>()
  readonly stop = vi.fn()

  public finish(): void {
    this.dispatchEvent(new Event('ended'))
  }
}

export class FakePcmContext {
  static readonly instances: FakePcmContext[] = []
  public state = 'running'
  public currentTime = 0
  public readonly destination = {}
  public readonly sources: FakePcmSource[] = []
  readonly resume = vi.fn(async () => {
    this.state = 'running'
  })
  readonly close = vi.fn(async () => {
    this.state = 'closed'
  })

  public constructor() {
    FakePcmContext.instances.push(this)
  }
  public createAnalyser() {
    return {
      fftSize: 1024,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getFloatTimeDomainData: (wave: Float32Array) => wave.fill(0.2),
    }
  }
  public createMediaElementSource() {
    return { connect: vi.fn(), disconnect: vi.fn() }
  }
  public createBuffer(_channels: number, samples: number, rate: number): FakePcmBuffer {
    return new FakePcmBuffer(samples, rate)
  }
  public createBufferSource(): FakePcmSource {
    const source = new FakePcmSource()
    this.sources.push(source)
    return source
  }
}

export function installPcmAudio(): void {
  FakePcmContext.instances.length = 0
  vi.stubGlobal('AudioContext', FakePcmContext)
}

export function pcmSamples(count = 2_400): Uint8Array {
  const bytes = new Uint8Array(count * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < count; index += 1)
    view.setInt16(index * 2, index % 2 ? -32768 : 16384, false)
  return bytes
}

export function pcmResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: { 'Content-Type': 'audio/L16;rate=24000;channels=1' } })
}
