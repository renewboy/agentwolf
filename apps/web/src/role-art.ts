/// <reference types="vite/client" />

import type { RoleId } from '@agentwolf/contracts'
import manifest from '../../../packages/assets/art/roles/manifest.json'

const materialFiles = import.meta.glob<string>(
  '../../../packages/assets/art/roles/*/avatar-*.webp',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
)

function materialUrl(path: string): string {
  const url = materialFiles[`../../../packages/assets/art/roles/${path}`]
  if (!url) throw new Error(`Missing role artwork: ${path}`)
  return url
}

const materials = Object.fromEntries(
  manifest.roles.map((role) => [
    role.id,
    {
      id: role.id,
      avatar: materialUrl(role.avatar),
    },
  ]),
)

export function roleArtwork(roleId: RoleId | undefined) {
  return materials[roleId ?? 'hidden'] ?? materials['hidden']!
}
