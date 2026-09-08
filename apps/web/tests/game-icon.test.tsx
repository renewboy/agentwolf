import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GameIcon, GameIconInk } from '../src/components/GameIcon.js'

const materials = vi.hoisted(() => ({ grain: '/ink-grain.webp' }))
vi.mock('../src/motion/effect-materials.js', () => ({ effectArt: materials }))

class MaterialImage extends EventTarget {
  static instances: MaterialImage[] = []
  src = ''
  constructor() {
    super()
    MaterialImage.instances.push(this)
  }
}

beforeEach(() => {
  materials.grain = '/ink-grain.webp'
  MaterialImage.instances = []
  vi.stubGlobal('Image', MaterialImage)
})

describe('GameIcon', () => {
  it('renders decorative artwork without adding an accessible image', () => {
    const { container } = render(
      <button type="button">
        <GameIcon name="save" />
        保存
      </button>,
    )
    const image = container.querySelector('img')!
    expect(image).toHaveAttribute(
      'src',
      expect.stringMatching(/\/icons\/woodcut-save-[a-f0-9]{8}\.webp$/u),
    )
    expect(image).toHaveAttribute('width', '20')
    expect(image).toHaveAttribute('height', '20')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('aria-hidden', 'true')
    expect(image).toHaveAttribute('draggable', 'false')
    expect(image).toHaveClass('aw-icon')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeVisible()
  })

  it('supports a custom size and state class using image attributes', () => {
    const { container, rerender } = render(
      <GameIcon name="refresh" size={32} className="aw-spin" />,
    )
    const image = container.querySelector('img')!
    expect(image).toHaveAttribute('width', '32')
    expect(image).toHaveAttribute('height', '32')
    expect(image).toHaveClass('aw-icon', 'aw-spin')
    expect(image).not.toHaveAttribute('style')
    rerender(<GameIcon name="check" size={16} />)
    expect(image).toHaveAttribute(
      'src',
      expect.stringMatching(/\/icons\/woodcut-check-[a-f0-9]{8}\.webp$/u),
    )
    expect(image).toHaveAttribute('width', '16')
    expect(image).not.toHaveClass('aw-spin')
  })
})

describe('GameIconInk material lifecycle', () => {
  it('keeps procedural grain until the material loads and releases the load listener on unmount', () => {
    const { container, unmount } = render(<GameIconInk />)
    const image = MaterialImage.instances[0]!
    expect(image.src).toBe('/ink-grain.webp')
    expect(container.querySelector('feTurbulence')).not.toBeNull()
    expect(container.querySelector('feImage')).toBeNull()
    act(() => {
      image.dispatchEvent(new Event('error'))
    })
    expect(container.querySelector('feTurbulence')).not.toBeNull()
    act(() => {
      image.dispatchEvent(new Event('load'))
    })
    expect(container.querySelector('feTurbulence')).toBeNull()
    expect(container.querySelector('feImage')).toHaveAttribute('href', '/ink-grain.webp')
    expect(container.querySelector('feColorMatrix')).toHaveAttribute('type', 'luminanceToAlpha')
    const remove = vi.spyOn(image, 'removeEventListener')
    unmount()
    expect(remove).toHaveBeenCalledWith('load', expect.any(Function))
  })

  it('uses procedural grain without requesting the transparent placeholder', () => {
    materials.grain = 'data:image/svg+xml,placeholder'
    const { container } = render(<GameIconInk />)
    expect(MaterialImage.instances).toHaveLength(0)
    expect(container.querySelector('feTurbulence')).toHaveAttribute('seed', '12')
    expect(container.querySelector('feColorMatrix')).toHaveAttribute('type', 'matrix')
  })
})
