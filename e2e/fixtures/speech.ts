import type { Page } from '@playwright/test'
import type { MatchView } from '@agentwolf/contracts'

export async function installSpeechSynthesisStub(page: Page): Promise<void> {
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
      active: StubUtterance | null
      cancelCount: number
      rates: number[]
      spoken: string[]
    } = {
      active: null,
      cancelCount: 0,
      rates: [],
      spoken: [],
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: StubUtterance,
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: () => {
          state.cancelCount += 1
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
          active?.dispatchEvent(new Event('end'))
        },
        fail: () => {
          const active = state.active
          state.active = null
          active?.dispatchEvent(new Event('error'))
        },
      },
    })
  })
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
