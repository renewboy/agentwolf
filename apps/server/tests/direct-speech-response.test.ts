import { describe, expect, it } from 'vitest'
import { DirectSpeechResponse } from '../src/direct-speech-response.js'

describe('direct speech response', () => {
  it('accepts a clean correction after a tool boundary when no speech preceded it', () => {
    const streamed: string[] = []
    const response = new DirectSpeechResponse((chunk) => streamed.push(chunk))

    response.actionToolBoundary()
    response.push('纠正后的自然语言发言。')

    expect(response.finish('ignored aggregate response')).toBe('纠正后的自然语言发言。')
    expect(streamed.join('')).toBe('纠正后的自然语言发言。')
    expect(response.diagnostic).not.toBeNull()
  })
})
