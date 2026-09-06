import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameIcon } from '../src/components/GameIcon.js'

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
