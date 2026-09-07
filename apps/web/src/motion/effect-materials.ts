/// <reference types="vite/client" />

import manifest from '../../../../packages/assets/art/effects/manifest.json'

const files = import.meta.glob<string>(
  [
    '../../../../packages/assets/art/*.webp',
    '../../../../packages/assets/art/icons/*.webp',
    '../../../../packages/assets/art/effects/*.{png,webp}',
  ],
  { eager: true, query: '?url', import: 'default' },
)

function materialUrl(path: string): string {
  const relative = path.startsWith('../') ? path.slice(3) : `effects/${path}`
  return (
    files[`../../../../packages/assets/art/${relative}`] ??
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E'
  )
}

export const effectArt = {
  grain: materialUrl(manifest.material.grain),
  paper: materialUrl(manifest.material.paper),
  crown: materialUrl(manifest.material.crown),
  cardBack: materialUrl(manifest.material.cardBack),
}
