import { describe, expect, it } from 'vitest'
import { DirectSpeechResponse } from '../src/direct-speech-response.js'

describe('direct speech response', () => {
  it('accepts speech after a strategy lookup when no speech preceded it', () => {
    const streamed: string[] = []
    const response = new DirectSpeechResponse((chunk) => streamed.push(chunk))

    response.actionToolBoundary()
    response.push('纠正后的自然语言发言。')

    expect(response.finish('ignored aggregate response')).toBe('纠正后的自然语言发言。')
    expect(streamed.join('')).toBe('纠正后的自然语言发言。')
    expect(response.diagnostic).not.toBeNull()
  })

  it('keeps spoken text and filters lookup output after speech has started', () => {
    const streamed: string[] = []
    const response = new DirectSpeechResponse((chunk) => streamed.push(chunk))

    response.push('我先给出今天的归票意见。')
    response.actionToolBoundary()
    response.push('攻略文件内容和第二版发言都不应公开。')

    expect(response.finish('ignored aggregate response')).toBe('我先给出今天的归票意见。')
    expect(streamed.join('')).toBe('我先给出今天的归票意见。')
    expect(response.diagnostic).not.toBeNull()
  })

  it('discards the retained boundary tail when an active speech is superseded', () => {
    const streamed: string[] = []
    const response = new DirectSpeechResponse((chunk) => streamed.push(chunk))

    response.push('A'.repeat(80))

    expect(streamed.join('')).toBe('A'.repeat(32))
    expect(response.cancel()).toBe('A'.repeat(32))
    expect(response.finish('ignored aggregate response')).toBe('A'.repeat(32))
    expect(streamed.join('')).toBe('A'.repeat(32))
  })
})
