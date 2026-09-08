import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../packages/assets/art/effects/manifest.json', () => ({
  default: {
    material: {
      grain: '../rice-paper.webp',
      paper: 'missing-paper.webp',
      crown: '../icons/woodcut-crown-bc4bf254.webp',
      cardBack: '../missing-card.webp',
    },
  },
}))

import { effectArt } from '../src/motion/effect-materials.js'

describe('effect material loading', () => {
  it('resolves shared and icon artwork, and replaces unavailable files with a transparent image', () => {
    expect(effectArt.grain).toMatch(/\/rice-paper\.webp$/)
    expect(effectArt.crown).toMatch(/\/icons\/woodcut-crown-bc4bf254\.webp$/)
    for (const source of [effectArt.paper, effectArt.cardBack]) {
      expect(source).toMatch(/^data:image\/svg\+xml,/)
      expect(decodeURIComponent(source)).toContain('width="1" height="1"')
      expect(decodeURIComponent(source)).not.toContain('<image')
    }
  })
})
