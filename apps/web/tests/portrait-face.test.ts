import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builtInCharacterCards, characterPerformance } from '@agentwolf/assets'
import { PortraitFace } from '../src/components/match/portrait-face.js'

const rig = characterPerformance(builtInCharacterCards.find((card) => card.id === 'character-gin'))!

function context() {
  const saved: Array<{ alpha: number; clips: number }> = []
  const ctx = {
    globalAlpha: 1,
    clips: 0,
    save() {
      saved.push({ alpha: ctx.globalAlpha, clips: ctx.clips })
    },
    restore() {
      const state = saved.pop()
      if (!state) throw new Error('Canvas restore without save')
      ctx.globalAlpha = state.alpha
      ctx.clips = state.clips
    },
    clip() {
      ctx.clips++
    },
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  }
  return ctx
}

beforeEach(() => {
  vi.stubGlobal(
    'Path2D',
    class {
      moveTo() {}
      bezierCurveTo() {}
      closePath() {}
    },
  )
})

describe('procedural portrait face', () => {
  it('clips a brief lens reflection and supports one eye closing without changing canvas opacity', () => {
    const contexts: ReturnType<typeof context>[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const ctx = context()
      contexts.push(ctx)
      return ctx as unknown as CanvasRenderingContext2D
    })
    const conan = characterPerformance(
      builtInCharacterCards.find((card) => card.id === 'character-edogawa-conan'),
    )!
    const face = new PortraitFace(conan, new Image()),
      output = contexts[0]!
    face.draw([0.5, 0], 0, 0.4)
    expect(output.scale).toHaveBeenCalledOnce()
    expect(output.createLinearGradient).toHaveBeenCalledOnce()
    expect(output.fillRect).toHaveBeenCalledOnce()
    expect(output.clips).toBe(0)
    expect(output.globalAlpha).toBe(1)
    face.draw([0, 0], 0, 1)
    face.draw([0, 0], 0, -1)
    expect(output.fillRect).toHaveBeenCalledOnce()
  })
  it('derives all repairs from the same source and restores an exact neutral frame after expressions', () => {
    const contexts: ReturnType<typeof context>[] = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const ctx = context()
      contexts.push(ctx)
      return ctx as unknown as CanvasRenderingContext2D
    })
    const image = new Image(),
      face = new PortraitFace(rig, image),
      output = contexts[0]!
    expect(face.canvas.width).toBe(rig.face.bounds[2])
    expect(face.canvas.height).toBe(rig.face.bounds[3])
    for (const repair of contexts.slice(1)) {
      expect(repair.drawImage).toHaveBeenCalledOnce()
      expect(repair.drawImage.mock.calls[0]![0]).toBe(image)
      expect(repair.clips).toBe(1)
    }
    for (const [blink, mouth] of [
      [0.98, 0.7],
      [0.3, 0.08],
      [0, 0],
    ] as const) {
      output.drawImage.mockClear()
      output.clearRect.mockClear()
      face.draw(blink, mouth)
      // Each frame starts from the original crop, so deformations cannot accumulate.
      expect(output.clearRect).toHaveBeenCalledExactlyOnceWith(
        0,
        0,
        face.canvas.width,
        face.canvas.height,
      )
      expect(output.drawImage.mock.calls[0]).toEqual([
        image,
        -rig.face.bounds[0],
        -rig.face.bounds[1],
      ])
      expect(output.clips).toBe(0)
      expect(output.globalAlpha).toBe(1)
      if (blink === 0 && mouth === 0) expect(output.drawImage).toHaveBeenCalledOnce()
    }
  })
  it('reports missing canvas support to the static portrait fallback', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(() => new PortraitFace(rig, new Image())).toThrow('graphics unavailable')
  })
})
