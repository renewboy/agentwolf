import { PluginIdSchema } from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { installRulePlugins, type RulePlugin } from '../src/index.js'

interface Registrar {
  readonly installed: string[]
}

function plugin(
  id: string,
  options: { readonly version?: number; readonly requires?: readonly [string, number][] } = {},
): RulePlugin<Registrar> {
  return {
    id: PluginIdSchema.parse(id),
    version: options.version ?? 1,
    ...(options.requires
      ? {
          requires: options.requires.map(([requiredId, version]) => ({
            id: PluginIdSchema.parse(requiredId),
            version,
          })),
        }
      : {}),
    register: (registrar) => registrar.installed.push(id),
  }
}

describe('rule plugin loader', () => {
  it('installs dependencies before dependents with stable ordering', () => {
    const registrar: Registrar = { installed: [] }
    const installed = installRulePlugins(registrar, [
      plugin('plugin-role-seer', { requires: [['plugin-classic-core', 1]] }),
      plugin('plugin-classic-core'),
      plugin('plugin-role-witch', { requires: [['plugin-classic-core', 1]] }),
    ])

    expect(registrar.installed).toEqual([
      'plugin-classic-core',
      'plugin-role-seer',
      'plugin-role-witch',
    ])
    expect(installed.map((entry) => entry.order)).toEqual([0, 1, 2])
  })

  it('rejects duplicates, missing versions, and dependency cycles', () => {
    expect(() =>
      installRulePlugins({ installed: [] }, [plugin('plugin-one'), plugin('plugin-one')]),
    ).toThrow(/Duplicate plugin/)
    expect(() =>
      installRulePlugins({ installed: [] }, [
        plugin('plugin-one', { requires: [['plugin-missing', 1]] }),
      ]),
    ).toThrow(/requires missing/)
    expect(() =>
      installRulePlugins({ installed: [] }, [
        plugin('plugin-one', { requires: [['plugin-two', 1]] }),
        plugin('plugin-two', { requires: [['plugin-one', 1]] }),
      ]),
    ).toThrow(/dependency cycle/)
    expect(() =>
      installRulePlugins({ installed: [] }, [
        { ...plugin('plugin-configured'), config: { enabled: true } },
      ]),
    ).toThrow(/config without a schema/)
  })
})
