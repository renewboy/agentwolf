import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../packages/assets/art/effects/manifest.json', async (importOriginal) => {
  const { default: manifest } = await importOriginal<{
    default: typeof import('../../../packages/assets/art/effects/manifest.json')
  }>()
  return {
    default: {
      ...manifest,
      families: {
        ...manifest.families,
        claw: { ...manifest.families.claw, source: 'unavailable.svg' },
      },
    },
  }
})
vi.mock('../src/motion/effect-materials.js', () => ({
  effectArt: { crown: '/crown.webp?theme=ink&size=32', cardBack: '/back.webp?theme=ink&size=64' },
}))

import { effectGlyph } from '../src/motion/effect-art.js'

describe('effect artwork', () => {
  it('renders a complete neutral imprint when a registered source is missing', () => {
    const glyph = effectGlyph('claw')
    expect(glyph).toContain('viewBox="-90 -90 180 180"')
    expect(glyph).toContain('<path')
    expect(glyph).toContain('</svg>')
    expect(glyph).not.toContain('undefined')
  })

  it('loads editable glyphs and escapes substituted image URLs', () => {
    expect(effectGlyph('inspect')).toContain('aw-role-effect-eclipse')
    expect(effectGlyph('crown')).toContain('/crown.webp?theme=ink&amp;size=32')
    expect(effectGlyph('cards')).toContain('/back.webp?theme=ink&amp;size=64')
    expect(effectGlyph('crown')).not.toContain('__CROWN__')
    expect(effectGlyph('cards')).not.toContain('__CARD_BACK__')
  })
})
