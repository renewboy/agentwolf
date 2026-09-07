/// <reference types="vite/client" />

import type { RoleEffectDefinition } from '@agentwolf/assets'
import manifest from '../../../../packages/assets/art/effects/manifest.json'
import { effectArt } from './effect-materials.js'

export { effectArt } from './effect-materials.js'

const glyphs = import.meta.glob<string>('../../../../packages/assets/art/effects/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
})

export function effectGlyph(family: RoleEffectDefinition['family']): string {
  const source = manifest.families[family].source
  const svg = glyphs[`../../../../packages/assets/art/effects/${source}`]
  const artwork =
    svg ??
    '<svg class="aw-role-effect-glyph" viewBox="-90 -90 180 180"><path d="M0-45L36 0L0 45L-36 0Z" fill="none" stroke="currentColor" stroke-width="4"/></svg>'
  return artwork
    .replaceAll('__CROWN__', effectArt.crown.replaceAll('&', '&amp;'))
    .replaceAll('__CARD_BACK__', effectArt.cardBack.replaceAll('&', '&amp;'))
}
