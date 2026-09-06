import { describe, expect, it } from 'vitest'
import { roleArtwork } from '../src/role-art.js'

describe('visible identity artwork', () => {
  it('keeps concealed and unconfigured identities on the same neutral material', () => {
    const hidden = roleArtwork(undefined)
    expect(hidden.avatar).toContain('/hidden/avatar-')
    expect(roleArtwork('role-unconfigured' as never)).toBe(hidden)
  })

  it('loads distinct identity assets while preserving the source artwork roles', () => {
    const seer = roleArtwork('role-seer' as never)
    const wolf = roleArtwork('role-werewolf' as never)
    expect(seer.avatar).toContain('/role-seer/avatar-')
    expect(wolf.avatar).toContain('/role-werewolf/avatar-')
    expect(seer.id).not.toEqual(wolf.id)
  })
})
