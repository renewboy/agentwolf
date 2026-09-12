import { describe, expect, it } from 'vitest'
import { subtitlePages } from '../src/hooks/speech-subtitles.js'

describe('subtitle pages', () => {
  it('keeps visible text in order and favors clause boundaries', () => {
    const text = '先核对发言记录，再判断这张票。先别急着站边。'
    const pages = subtitlePages(text, 13)
    expect(pages.join('')).toBe(text)
    expect(pages[0]).toBe('先核对发言记录，')
    expect(pages.every((page) => Array.from(page).length <= 14)).toBe(true)
  })
  it('preserves mixed model names, emoji and unpunctuated text without loss', () => {
    for (const text of [
      'GPT-6 / test_user: 这一轮的结果如何？',
      '请检查😀发言😀记录😀是否完整。',
      '请检查👨‍👩‍👧‍👦发言是否完整。',
      '没有标点但内容很长也需要分成连续可读的小段',
    ]) {
      expect(subtitlePages(text, 8).join('').replace(/\s+/gu, '')).toBe(text.replace(/\s+/gu, ''))
    }
  })
  it('handles empty, invalid capacity and final punctuation', () => {
    expect(subtitlePages('', 40)).toEqual([])
    expect(subtitlePages('短句。', Number.NaN)).toEqual(['短句。'])
    expect(subtitlePages('一二三四五六七八。', 8)).toEqual(['一二三四五六七八。'])
  })
})
