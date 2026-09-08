import { describe, expect, it } from 'vitest'
import {
  getRoleEffectDefinition,
  getRoleEffectOutcome,
  roleEffectCatalog,
} from '../src/role-effects.js'

describe('role effect presentation contract', () => {
  it('resolves each registered effect and rejects an unknown effect', () => {
    for (const definition of Object.values(roleEffectCatalog)) {
      expect(getRoleEffectDefinition(definition.id)).toBe(definition)
      expect(definition.durationMs).toBeGreaterThanOrEqual(2500)
      expect(definition.durationMs).toBeLessThanOrEqual(3000)
    }
    expect(() => getRoleEffectDefinition('missing-effect' as never)).toThrow('Unknown role effect')
  })

  it.each([
    ['seer-inspect', 'werewolf', { label: '狼人阵营', roleId: null }],
    ['seer-inspect', 'village', { label: '好人阵营', roleId: null }],
    ['idiot-reveal', null, { label: '白痴', roleId: 'role-idiot' }],
    ['magic-mirror-inspect', 'role-witch', { label: '女巫', roleId: 'role-witch' }],
    ['awakened-hidden-wolf-inspect', 'role-seer', { label: '预言家', roleId: 'role-seer' }],
    ['awakened-hidden-wolf-learn', 'role-guard', { label: '守卫', roleId: 'role-guard' }],
    ['thief-choose-card', 'role-villager', { label: '平民', roleId: 'role-villager' }],
    ['seer-inspect', 'role-witch', null],
    ['magic-mirror-inspect', 'missing-role', null],
    ['magic-mirror-inspect', 'hidden', null],
    ['thief-choose-card', null, null],
    ['werewolf-attack', 'role-witch', null],
  ] as const)('only presents authorized results for %s / %s', (effect, variant, expected) => {
    expect(getRoleEffectOutcome(effect, variant)).toEqual(expected)
  })
})
