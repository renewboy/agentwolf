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
    const state: { active: StubUtterance | null; spoken: string[] } = {
      active: null,
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
          state.active = null
        },
        speak: (utterance: StubUtterance) => {
          state.active = utterance
          state.spoken.push(utterance.text)
        },
      },
    })
    Object.defineProperty(window, 'speechTest', {
      configurable: true,
      value: {
        spoken: state.spoken,
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
    occurredAt: '2026-08-23T00:00:00.000Z',
  } as MatchView['timeline'][number]
}
