import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { formatAgentConfiguration } from '../src/agent-configuration.js'
import { characterPortraitUrl, normalizeCharacterPortrait } from '../src/character-portraits.js'
import {
  timelineGroupId,
  timelineGroupLabel,
} from '../src/components/developer/trajectory-timeline.js'
import { parseRecordInput } from '../src/input.js'
import { completeSentences } from '../src/hooks/speech-playback-text.js'
import { useRoleEffectMode } from '../src/hooks/useRoleEffectMode.js'

describe('Web pure helpers', () => {
  it('formats available and unavailable Agent configurations', () => {
    expect(formatAgentConfiguration(null)).toContain('不可用')
    expect(
      formatAgentConfiguration({
        name: '测试 Agent',
        model: 'model-a',
        reasoningEffort: 'high',
      }),
    ).toContain('测试 Agent')
    expect(
      formatAgentConfiguration({
        name: '默认推理',
        model: 'model-b',
        reasoningEffort: null,
      }),
    ).toContain('跟随 Agent 默认')
  })

  it('parses JSON records and rejects non-record inputs', () => {
    expect(parseRecordInput('{"key":1}')).toEqual({ key: 1 })
    for (const value of ['null', '[]', '1', '"text"']) {
      expect(() => parseRecordInput(value)).toThrow('JSON')
    }
    expect(() => parseRecordInput('{')).toThrow(SyntaxError)
  })

  it('extracts every complete sentence and its consumed length', () => {
    expect(completeSentences('第一句。 第二句！尾巴')).toEqual({
      segments: ['第一句。', '第二句！'],
      consumedLength: 9,
    })
    expect(completeSentences('；\n未完成')).toEqual({ segments: ['；'], consumedLength: 2 })
    expect(completeSentences('没有句号')).toEqual({ segments: [], consumedLength: 0 })
  })

  it('labels every trajectory group', () => {
    const cases = [
      [{ kind: 'setup' as const, index: null }, 'setup:0', '开局'],
      [{ kind: 'night' as const, index: 2 }, 'night:2', '第2夜'],
      [{ kind: 'sheriff' as const, index: null }, 'sheriff:0', '上警'],
      [{ kind: 'day' as const, index: 3 }, 'day:3', '第3天'],
      [{ kind: 'end' as const, index: null }, 'end:0', '结束'],
      [{ kind: 'review' as const, index: null }, 'review:0', '复盘'],
    ] as const
    for (const [group, id, label] of cases) {
      expect(timelineGroupId(group)).toBe(id)
      expect(timelineGroupLabel(group)).toContain(label)
    }
    expect(timelineGroupLabel({ kind: 'unknown' } as never)).toBe('unknown')
  })

  it('persists role-effect mode and honors reduced-motion defaults', () => {
    window.localStorage.setItem('agentwolf.role-effect-mode', 'off')
    const stored = renderHook(() => useRoleEffectMode())
    expect(stored.result.current[0]).toBe('off')
    act(() => stored.result.current[1]('full'))
    expect(stored.result.current[0]).toBe('full')
    expect(window.localStorage.getItem('agentwolf.role-effect-mode')).toBe('full')
    stored.unmount()

    window.localStorage.setItem('agentwolf.role-effect-mode', 'invalid')
    vi.mocked(window.matchMedia).mockReturnValue(mediaQuery(true))
    const reduced = renderHook(() => useRoleEffectMode())
    expect(reduced.result.current[0]).toBe('reduced')
    reduced.unmount()

    window.localStorage.removeItem('agentwolf.role-effect-mode')
    vi.mocked(window.matchMedia).mockReturnValue(mediaQuery(false))
    const full = renderHook(() => useRoleEffectMode())
    expect(full.result.current[0]).toBe('full')
  })
})

function mediaQuery(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }
}

describe('character portraits', () => {
  it('builds an encoded asset URL and rejects invalid files', async () => {
    expect(characterPortraitUrl('portrait/a b' as never)).toBe(
      '/api/character-assets/portrait%2Fa%20b',
    )
    await expect(
      normalizeCharacterPortrait(new File([], 'empty.png', { type: 'image/png' })),
    ).rejects.toThrow('PNG')
    await expect(
      normalizeCharacterPortrait(new File(['x'], 'bad.gif', { type: 'image/gif' })),
    ).rejects.toThrow('PNG')
    const oversized = new File([new Uint8Array(5_000_001)], 'large.jpg', {
      type: 'image/jpeg',
    })
    await expect(normalizeCharacterPortrait(oversized)).rejects.toThrow('PNG')
  })

  it('crops, encodes, reads, and closes a valid portrait', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1600, height: 900, close })),
    )
    const drawImage = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName !== 'canvas') return originalCreateElement(tagName)
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (callback: BlobCallback) => callback(new Blob(['encoded'], { type: 'image/webp' })),
      } as unknown as HTMLCanvasElement
    })
    class FileReaderStub extends EventTarget {
      public result: string | ArrayBuffer | null = null
      public error: DOMException | null = null
      public readAsDataURL(): void {
        this.result = 'data:image/webp;base64,ZW5jb2RlZA=='
        this.dispatchEvent(new Event('load'))
      }
    }
    vi.stubGlobal('FileReader', FileReaderStub)

    await expect(
      normalizeCharacterPortrait(new File(['image'], 'portrait.png', { type: 'image/png' })),
    ).resolves.toBe('data:image/webp;base64,ZW5jb2RlZA==')
    expect(drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1600, height: 900 }),
      350,
      0,
      900,
      900,
      0,
      0,
      1024,
      1024,
    )
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes the bitmap when no canvas context or encoded blob is available', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 10, height: 20, close })),
    )
    const originalCreateElement = document.createElement.bind(document)
    const createElement = vi.spyOn(document, 'createElement')
    createElement.mockImplementation((tagName: string) =>
      tagName === 'canvas'
        ? ({ getContext: () => null } as unknown as HTMLCanvasElement)
        : originalCreateElement(tagName),
    )
    const file = new File(['image'], 'portrait.webp', { type: 'image/webp' })
    await expect(normalizeCharacterPortrait(file)).rejects.toThrow()
    expect(close).toHaveBeenCalledOnce()

    createElement.mockImplementation((tagName: string) =>
      tagName === 'canvas'
        ? ({
            getContext: () => ({ drawImage: vi.fn() }),
            toBlob: (callback: BlobCallback) => callback(null),
          } as unknown as HTMLCanvasElement)
        : originalCreateElement(tagName),
    )
    await expect(normalizeCharacterPortrait(file)).rejects.toThrow('encode')
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('rejects non-string FileReader results and reader failures', async () => {
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 10, height: 10, close })),
    )
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) =>
      tagName === 'canvas'
        ? ({
            getContext: () => ({ drawImage: vi.fn() }),
            toBlob: (callback: BlobCallback) => callback(new Blob(['encoded'])),
          } as unknown as HTMLCanvasElement)
        : originalCreateElement(tagName),
    )
    const file = new File(['image'], 'portrait.png', { type: 'image/png' })

    class NonStringReader extends EventTarget {
      public result: string | ArrayBuffer | null = new ArrayBuffer(1)
      public error: DOMException | null = null
      public readAsDataURL(): void {
        this.dispatchEvent(new Event('load'))
      }
    }
    vi.stubGlobal('FileReader', NonStringReader)
    await expect(normalizeCharacterPortrait(file)).rejects.toThrow()

    class ErrorReader extends EventTarget {
      public result: string | ArrayBuffer | null = null
      public error: DOMException | null = new DOMException('reader failed')
      public readAsDataURL(): void {
        this.dispatchEvent(new Event('error'))
      }
    }
    vi.stubGlobal('FileReader', ErrorReader)
    await expect(normalizeCharacterPortrait(file)).rejects.toThrow('reader failed')

    class EmptyErrorReader extends ErrorReader {
      public override error: DOMException | null = null
    }
    vi.stubGlobal('FileReader', EmptyErrorReader)
    await expect(normalizeCharacterPortrait(file)).rejects.toThrow()
    expect(close).toHaveBeenCalledTimes(3)
  })
})
