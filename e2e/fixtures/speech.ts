import type { Page } from '@playwright/test'
import type { MatchView } from '@agentwolf/contracts'

export async function installSpeechSynthesisStub(
  page: Page,
  { nativePcm = false }: { readonly nativePcm?: boolean } = {},
): Promise<void> {
  if (!nativePcm) {
    await page.route(/\/api\/matches\/[^/]+\/speech-audio(?:\?.*)?$/u, async (route) => {
      const input = route.request().postDataJSON() as { text: string }
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: input.text,
        headers: {
          'X-AgentWolf-Speech-Source': JSON.stringify({
            provider: 'edge-tts',
            voice: 'zh-CN-YunxiNeural',
            reason: 'browser',
          }),
        },
      })
    })
  }
  if (!nativePcm) {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined })
      Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined })
    })
  }
  await page.addInitScript(() => {
    class StubUtterance extends EventTarget {
      public readonly text: string
      public lang = ''
      public rate = 1

      public constructor(text: string) {
        super()
        this.text = text
      }
    }
    const state: {
      active: StubUtterance | StubMedia | null
      cancelCount: number
      rates: number[]
      spoken: string[]
    } = {
      active: null,
      cancelCount: 0,
      rates: [],
      spoken: [],
    }
    class StubMedia extends EventTarget {
      src = ''
      onended: ((event: Event) => void) | null = null
      onerror: ((event: Event) => void) | null = null
      async play() {
        const url = this.src
        const text = await fetch(url).then((response) => response.text())
        if (this.src !== url) return
        state.active = this
        state.spoken.push(text)
        state.rates.push(1)
      }
      pause() {
        if (state.active === this) {
          state.cancelCount += 1
          state.active = null
        }
      }
      removeAttribute() {
        this.src = ''
      }
      load() {}
    }
    Object.defineProperty(window, 'Audio', { configurable: true, value: StubMedia })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: StubUtterance,
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: () => {
          if (state.active) state.cancelCount += 1
          state.active = null
        },
        speak: (utterance: StubUtterance) => {
          state.active = utterance
          state.spoken.push(utterance.text)
          state.rates.push(utterance.rate)
        },
      },
    })
    Object.defineProperty(window, 'speechTest', {
      configurable: true,
      value: {
        spoken: state.spoken,
        rates: state.rates,
        get cancelCount() {
          return state.cancelCount
        },
        finish: () => {
          const active = state.active
          state.active = null
          if (active instanceof StubMedia) active.dispatchEvent(new Event('ended'))
          else active?.dispatchEvent(new Event('end'))
        },
        fail: () => {
          const active = state.active
          state.active = null
          if (active instanceof StubMedia) active.dispatchEvent(new Event('error'))
          else active?.dispatchEvent(new Event('error'))
        },
      },
    })
  })
}

export interface PcmPlaybackObservation {
  readonly receivedBytes: number
  readonly eofAt: number | null
  readonly abortCount: number
  readonly nodes: readonly {
    readonly rate: number
    readonly samples: readonly number[]
    readonly sampleRate: number
    readonly frames: number
    readonly endedAt: number | null
    readonly stopped: boolean
  }[]
}

export async function observeNativePcmPlayback(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state: {
      receivedBytes: number
      eofAt: number | null
      abortCount: number
      nodes: Array<{
        rate: number
        samples: number[]
        sampleRate: number
        frames: number
        endedAt: number | null
        stopped: boolean
      }>
    } = { receivedBytes: 0, eofAt: null, abortCount: 0, nodes: [] }
    const nativeCreateSource = Reflect.get(
      AudioContext.prototype,
      'createBufferSource',
    ) as AudioContext['createBufferSource']
    AudioContext.prototype.createBufferSource = function (this: AudioContext) {
      const node = nativeCreateSource.call(this)
      const observation = {
        rate: 1,
        samples: [] as number[],
        sampleRate: 0,
        frames: 0,
        endedAt: null as number | null,
        stopped: false,
      }
      state.nodes.push(observation)
      const nativeStart = node.start.bind(node)
      const nativeStop = node.stop.bind(node)
      node.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
        observation.rate = node.playbackRate.value
        observation.sampleRate = node.buffer?.sampleRate ?? 0
        observation.frames = node.buffer?.length ?? 0
        observation.samples = [...(node.buffer?.getChannelData(0).slice(0, 4) ?? [])]
        nativeStart(...args)
      }
      node.stop = (...args: Parameters<AudioBufferSourceNode['stop']>) => {
        observation.stopped = true
        nativeStop(...args)
      }
      node.addEventListener(
        'ended',
        () => {
          observation.endedAt = performance.now()
        },
        { once: true },
      )
      return node
    }

    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const input = args[0]
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const isSpeech = /\/api\/matches\/[^/]+\/speech-audio(?:\?.*)?$/u.test(url)
      if (isSpeech)
        args[1]?.signal?.addEventListener('abort', () => {
          state.abortCount += 1
        })
      const response = await nativeFetch(...args)
      if (isSpeech && response.ok && response.body) {
        const nativeGetReader = response.body.getReader.bind(response.body)
        Object.defineProperty(response.body, 'getReader', {
          configurable: true,
          value: () => {
            const reader = nativeGetReader()
            const nativeRead = reader.read.bind(reader)
            reader.read = async () => {
              const result = await nativeRead()
              if (result.done) state.eofAt = performance.now()
              else state.receivedBytes += result.value.byteLength
              return result
            }
            return reader
          },
        })
      }
      return response
    }

    Object.defineProperty(window, 'pcmPlaybackTest', { configurable: true, value: state })
  })
}

export async function pcmPlaybackObservation(page: Page): Promise<PcmPlaybackObservation> {
  return page.evaluate(
    () => (window as unknown as { pcmPlaybackTest: PcmPlaybackObservation }).pcmPlaybackTest,
  )
}

export async function speechStubRates(page: Page): Promise<number[]> {
  return page.evaluate(() => [
    ...(window as unknown as { speechTest: { rates: number[] } }).speechTest.rates,
  ])
}

export async function speechStubCancelCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { speechTest: { cancelCount: number } }).speechTest.cancelCount,
  )
}

export async function speechStubState(page: Page, _key: 'spoken' = 'spoken'): Promise<string[]> {
  return page.evaluate(() => [
    ...(window as unknown as { speechTest: { spoken: string[] } }).speechTest.spoken,
  ])
}

export async function finishSpeech(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { speechTest: { finish: () => void } }).speechTest.finish(),
  )
}

export async function failSpeech(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { speechTest: { fail: () => void } }).speechTest.fail(),
  )
}

export function speechTimelineItem(
  sequence: number,
  playerId: string,
  text: string,
): MatchView['timeline'][number] {
  return {
    sequence,
    kind: 'speech.committed',
    title: text,
    playerIds: [playerId],
    speechId: sequence,
    occurredAt: '2026-08-23T00:00:00.000Z',
  } as MatchView['timeline'][number]
}
