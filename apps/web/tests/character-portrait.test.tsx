import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builtInCharacterCards, characterPerformance } from '@agentwolf/assets'
import { CharacterPortrait, loadPortraitImages } from '../src/components/match/CharacterPortrait.js'

const meshes = vi.hoisted(() => ({
  fail: false,
  instances: [] as Array<{ draw: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }>,
}))
vi.mock('../src/components/match/portrait-mesh.js', () => ({
  PortraitMesh: class {
    draw = vi.fn()
    dispose = vi.fn()
    constructor() {
      if (meshes.fail) throw new Error('unavailable')
      meshes.instances.push(this)
    }
  },
}))
const rig = characterPerformance(builtInCharacterCards.find((card) => card.id === 'character-gin'))!
const images = Array.from({ length: 1 }, (_, i) => ({
  src: `image-${i}.webp`,
})) as HTMLImageElement[]
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
beforeEach(() => {
  meshes.fail = false
  meshes.instances = []
  frames.clear()
  frameId = 0
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    }),
  )
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id)),
  )
})
describe('character portrait resource lifecycle', () => {
  it('loads registered resources, retries failures and reuses completed image loads', async () => {
    let fail = true
    class TestImage extends EventTarget {
      set src(_value: string) {
        const rejected = fail
        queueMicrotask(() => this.dispatchEvent(new Event(rejected ? 'error' : 'load')))
      }
    }
    vi.stubGlobal('Image', TestImage)
    await expect(loadPortraitImages('absent')).rejects.toThrow('artwork')
    await expect(loadPortraitImages('gin')).rejects.toThrow('asset')
    fail = false
    const first = loadPortraitImages('gin')
    expect(loadPortraitImages('gin')).toBe(first)
    await expect(first).resolves.toHaveLength(1)
  })
  it('draws only while enabled and cancels animation and GPU resources when disabled', () => {
    const props = { rig, images, side: 'right' as const, motion: true, readLevel: () => 0.1 }
    const view = render(<CharacterPortrait {...props} />)
    expect(view.container.firstElementChild).toHaveAttribute('data-mirrored', 'true')
    const [id, callback] = frames.entries().next().value!
    frames.delete(id)
    act(() => callback(50))
    expect(meshes.instances[0]!.draw).toHaveBeenCalledWith(0.05, 0.05, 0.1)
    const [nextId, next] = frames.entries().next().value!
    frames.delete(nextId)
    act(() => next(55))
    expect(meshes.instances[0]!.draw).toHaveBeenCalledOnce()
    view.rerender(<CharacterPortrait {...props} motion={false} />)
    expect(view.container.querySelector('canvas')).toBeNull()
    expect(meshes.instances[0]!.dispose).toHaveBeenCalledOnce()
    expect(frames.size).toBe(0)
  })
  it('retains transparent still artwork when graphics are unavailable or lost', () => {
    const props = { rig, images, side: 'left' as const, motion: true, readLevel: () => 0 }
    meshes.fail = true
    const first = render(<CharacterPortrait {...props} />)
    expect(first.container.querySelector('canvas')).toHaveAttribute('data-ready', 'false')
    expect(first.container.firstElementChild).toHaveAttribute('data-portrait', 'gin')
    expect(first.container.querySelector('img')).toHaveAttribute('src', 'image-0.webp')
    first.unmount()
    meshes.fail = false
    const second = render(<CharacterPortrait {...props} />)
    const canvas = second.container.querySelector('canvas')!
    fireEvent(canvas, new Event('webglcontextlost', { cancelable: true }))
    expect(canvas).toHaveAttribute('data-ready', 'false')
    expect(frames.size).toBe(0)
    second.unmount()
    expect(meshes.instances[0]!.dispose).toHaveBeenCalledOnce()
  })
})
