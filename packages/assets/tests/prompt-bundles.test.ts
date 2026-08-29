import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  AbilityIdSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
  PluginEventTypeSchema,
  PluginIdSchema,
  RoleIdSchema,
} from '@agentwolf/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { loadPromptBundles, type PromptSemanticInventory } from '../src/prompts.js'
import { PromptBundleManifestSchema } from '../src/prompts/schema.js'
import {
  bundleEventPresentations,
  loadPromptBundle,
  promptEnvironment,
  resolvePromptRoot,
  validateCorePromptTools,
  validatePromptBundleGraph,
  type LoadedPromptBundle,
} from '../src/prompts/loader.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Prompt bundle runtime', () => {
  it('rejects malformed manifests at every refinement boundary', () => {
    const pluginId = PluginIdSchema.parse('plugin-schema-test')
    const roleId = RoleIdSchema.parse('role-schema-test')
    const malformed = [
      {
        pluginId,
        roles: [{ id: roleId, label: '角色', template: '/escape.njk' }],
      },
      {
        pluginId,
        roles: [{ id: roleId, label: '两行\n角色', template: 'role.njk' }],
      },
      {
        pluginId,
        roles: [{ id: roleId, label: '{% if true %}', template: 'role.njk' }],
      },
      { pluginId: '_core' },
      { pluginId, imports: [pluginId, pluginId] },
      { pluginId, events: [{ eventType: 'day.completed', audience: 'public' }] },
    ]

    for (const manifest of malformed) {
      expect(PromptBundleManifestSchema.safeParse(manifest).success).toBe(false)
    }
  })

  it('loads frozen bundles and rejects missing, mismatched, unsupported, and linked files', async () => {
    const fixture = await promptFixture()
    const directory = join(fixture.root, 'bundles', fixture.pluginId)
    expect(resolvePromptRoot(pathToFileURL(fixture.root))).toBe(await realpath(fixture.root))
    expect(loadPromptBundle(fixture.pluginId, directory).id).toBe(fixture.pluginId)
    expect(() => loadPromptBundle(fixture.pluginId, join(fixture.root, 'missing'))).toThrow(
      /Missing Prompt bundle/,
    )
    expect(() => loadPromptBundle(PluginIdSchema.parse('plugin-other'), directory)).toThrow(
      /declares/,
    )

    await writeFile(join(directory, 'unsupported.txt'), 'not a Prompt template')
    expect(() => loadPromptBundle(fixture.pluginId, directory)).toThrow(/Unsupported Prompt bundle/)

    const linked = await promptFixture()
    const linkedDirectory = join(linked.root, 'bundles', linked.pluginId)
    await symlink(join(linkedDirectory, 'role.njk'), join(linkedDirectory, 'linked.njk'))
    expect(() => loadPromptBundle(linked.pluginId, linkedDirectory)).toThrow(
      /cannot contain symlinks/,
    )
  })

  it('rejects missing templates and unknown frozen template lookups', async () => {
    const fixture = await promptFixture()
    const directory = join(fixture.root, 'bundles', fixture.pluginId)
    const manifestPath = join(directory, 'bundle.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      roles: Array<{ template: string }>
    }
    manifest.roles[0]!.template = 'missing.njk'
    await writeFile(manifestPath, JSON.stringify(manifest))
    expect(() => loadPromptBundle(fixture.pluginId, directory)).toThrow(
      /references missing template/,
    )

    const coreFixture = await promptFixture()
    const core = loadPromptBundle('_core', join(coreFixture.root, '_core'))
    const environment = promptEnvironment([core])
    expect(() => environment.getTemplate('_core/missing.njk', true)).toThrow(
      /Unknown Prompt template/,
    )
  })

  it('normalizes announcement presentation variants and validates core tool uniqueness', async () => {
    const pluginId = PluginIdSchema.parse('plugin-announcement-test')
    const manifest = PromptBundleManifestSchema.parse({
      pluginId,
      announcements: [
        { code: 'text', audience: 'public', text: 'text' },
        { code: 'template', audience: 'public', template: 'event.njk' },
        { code: 'omit', audience: 'god', omit: true },
      ],
    })
    expect(bundleEventPresentations(manifest)).toEqual([
      expect.objectContaining({ where: { code: 'text' }, text: 'text' }),
      expect.objectContaining({ where: { code: 'template' }, template: 'event.njk' }),
      expect.objectContaining({ where: { code: 'omit' }, omit: true }),
    ])

    const fixture = await promptFixture()
    const core = loadPromptBundle('_core', join(fixture.root, '_core'))
    const tools = core.manifest.core!.tools.map((tool, index) =>
      index === 1 ? { ...tool, name: core.manifest.core!.tools[0]!.name } : tool,
    )
    expect(() =>
      validateCorePromptTools({
        ...core.manifest,
        core: { ...core.manifest.core!, tools },
      }),
    ).toThrow(/must be unique/)
  })

  it('rejects missing and cyclic imports plus dynamic and unqualified template imports', async () => {
    const fixture = await promptFixture()
    const core = loadPromptBundle('_core', join(fixture.root, '_core'))
    const plugin = loadPromptBundle(
      fixture.pluginId,
      join(fixture.root, 'bundles', fixture.pluginId),
    )
    const missingId = PluginIdSchema.parse('plugin-missing-import')
    expect(() =>
      validatePromptBundleGraph([
        core,
        { ...plugin, manifest: { ...plugin.manifest, imports: [missingId] } },
      ]),
    ).toThrow(/imports missing/)

    const firstId = PluginIdSchema.parse('plugin-cycle-first')
    const secondId = PluginIdSchema.parse('plugin-cycle-second')
    const bundle = (id: typeof firstId, imports: (typeof firstId)[]): LoadedPromptBundle => ({
      id,
      root: fixture.root,
      manifest: PromptBundleManifestSchema.parse({ pluginId: id, imports }),
      templates: new Map(),
    })
    expect(() =>
      validatePromptBundleGraph([bundle(firstId, [secondId]), bundle(secondId, [firstId])]),
    ).toThrow(/import cycle/)

    for (const [source, message] of [
      ['{% include target %}', 'dynamic import'],
      ['{% include "local.njk" %}', 'unqualified import'],
    ] as const) {
      const templates = new Map(plugin.templates)
      templates.set(`${plugin.id}/turn.njk`, source)
      expect(() => validatePromptBundleGraph([core, { ...plugin, templates }])).toThrow(message)
    }
  })

  it('installs a synthetic Role, Ability, Phase, and plugin event without a production catalog', async () => {
    const fixture = await promptFixture()
    const registry = loadPromptBundles(fixture.inventory, { root: fixture.root })
    expect(registry.roleLabel(fixture.roleId)).toBe('合成身份')
    expect(registry.abilityLabel(fixture.abilityId)).toBe('合成能力')
    expect(registry.phasePresentation(fixture.phaseId).label).toBe('合成阶段')

    const playerId = PlayerIdSchema.parse('player-1')
    const event = {
      matchId: MatchIdSchema.parse('match-synthetic-prompt'),
      sequence: 1,
      occurredAt: '2026-08-25T00:00:00.000Z',
      visibility: { kind: 'players' as const, playerIds: [playerId] },
      payload: {
        type: 'plugin.event' as const,
        pluginId: fixture.pluginId,
        eventType: fixture.eventType,
        schemaVersion: 1,
        data: { value: '已生效' },
      },
    }
    const prompt = registry.renderTurn({
      actor: {
        playerId,
        seat: 1,
        name: '合成玩家',
        alive: true,
        roleId: fixture.roleId,
        faction: 'independent',
        abilityUses: {},
      },
      roster: [{ playerId, seat: 1, name: '合成玩家', alive: true }],
      board: {
        roles: [{ roleId: fixture.roleId, faction: 'independent', count: 1 }],
        nightActionOrder: [{ phaseId: fixture.phaseId, firstNightOnly: false }],
        sheriff: false,
        policies: policies(),
      },
      game: { day: 1, night: 1, status: 'running', pausedReason: null },
      events: [event],
      turn: {
        phaseId: fixture.phaseId,
        actionType: 'night-action',
        allowedAbilityIds: [fixture.abilityId],
        passAllowed: true,
        interruptAbilityIds: [],
        sheriffActions: [],
      },
      speechCharacterLimit: 300,
      continuation: false,
    })
    expect(prompt).toContain('合成阶段行动')
    expect(prompt).toContain('插件结果：已生效')
  })

  it('fails closed for missing owned semantics and locale axes', async () => {
    const fixture = await promptFixture()
    expect(() =>
      loadPromptBundles(
        {
          ...fixture.inventory,
          contributions: [
            {
              ...fixture.inventory.contributions[0]!,
              phaseIds: [fixture.phaseId, PhaseIdSchema.parse('phase-synthetic-missing')],
            },
          ],
        },
        { root: fixture.root },
      ),
    ).toThrow('Phases mismatch')

    await mkdir(join(fixture.root, 'zh-CN'))
    await writeFile(join(fixture.root, 'zh-CN', 'copy.njk'), '不允许的语言目录')
    expect(() => loadPromptBundles(fixture.inventory, { root: fixture.root })).toThrow(
      'locale axis',
    )
  })

  it('rejects a public entry that references a faction-private shared template', async () => {
    const fixture = await promptFixture()
    const privateManifestPath = join(fixture.root, 'bundles', fixture.pluginId, 'bundle.json')
    const privateManifest = JSON.parse(await readFile(privateManifestPath, 'utf8')) as Record<
      string,
      unknown
    >
    privateManifest['shared'] = [{ template: 'private.njk', audience: 'faction' }]
    await writeFile(privateManifestPath, JSON.stringify(privateManifest))
    await writeFile(join(fixture.root, 'bundles', fixture.pluginId, 'private.njk'), '狼队私密内容')

    const publicPluginId = PluginIdSchema.parse('plugin-synthetic-public')
    const publicPhaseId = PhaseIdSchema.parse('phase-synthetic-public')
    await mkdir(join(fixture.root, 'bundles', publicPluginId), { recursive: true })
    await writeFile(
      join(fixture.root, 'bundles', publicPluginId, 'bundle.json'),
      JSON.stringify({
        pluginId: publicPluginId,
        imports: [fixture.pluginId],
        phases: [
          {
            id: publicPhaseId,
            label: '公开阶段',
            audience: 'public',
            daytime: true,
            template: `@${fixture.pluginId}/private.njk`,
          },
        ],
      }),
    )
    const inventory: PromptSemanticInventory = {
      ...fixture.inventory,
      plugins: [...fixture.inventory.plugins, publicPluginId],
      contributions: [
        ...fixture.inventory.contributions,
        {
          pluginId: publicPluginId,
          roleIds: [],
          abilityIds: [],
          phaseIds: [publicPhaseId],
          pluginEvents: [],
        },
      ],
      interactivePhaseIds: [...fixture.inventory.interactivePhaseIds, publicPhaseId],
    }
    expect(() => loadPromptBundles(inventory, { root: fixture.root })).toThrow(
      'cannot use faction asset',
    )
  })

  it('rejects overlapping event matchers with equal specificity at installation', async () => {
    const fixture = await promptFixture()
    const manifestPath = join(fixture.root, 'bundles', fixture.pluginId, 'bundle.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      events: Array<Record<string, unknown>>
    }
    manifest.events.push({ ...manifest.events[0] })
    await writeFile(manifestPath, JSON.stringify(manifest))
    expect(() => loadPromptBundles(fixture.inventory, { root: fixture.root })).toThrow(
      'Ambiguous Prompt event matchers',
    )
  })
})

async function promptFixture() {
  const root = await mkdtemp(join(tmpdir(), 'agentwolf-prompt-bundle-'))
  roots.push(root)
  const pluginId = PluginIdSchema.parse('plugin-synthetic-prompt')
  const roleId = RoleIdSchema.parse('role-synthetic-prompt')
  const abilityId = AbilityIdSchema.parse('ability-synthetic-prompt')
  const phaseId = PhaseIdSchema.parse('phase-synthetic-prompt')
  const eventType = PluginEventTypeSchema.parse('event-synthetic-prompt')
  await mkdir(join(root, '_core'), { recursive: true })
  await mkdir(join(root, 'bundles', pluginId), { recursive: true })
  await writeFile(
    join(root, '_core', 'bundle.json'),
    JSON.stringify({
      pluginId: '_core',
      imports: [],
      events: [],
      core: {
        layouts: {
          foundation: 'foundation.njk',
          continuation: 'continuation.njk',
          bootstrapContinuation: 'bootstrap.njk',
          character: 'character.njk',
          playerContract: 'player-contract.njk',
        },
        factions: { village: '好人', werewolf: '狼人', independent: '独立' },
        receipts: { accepted: '接受', rejected: '拒绝：{{ reason }}' },
        tools: toolDeclarations(),
      },
    }),
  )
  await writeFile(join(root, '_core', 'foundation.njk'), '{{ ownerRoleContext }}')
  await writeFile(join(root, '_core', 'continuation.njk'), '{{ currentTurn }}')
  await writeFile(join(root, '_core', 'bootstrap.njk'), '继续准备')
  await writeFile(join(root, '_core', 'character.njk'), '{{ character.name }}')
  await writeFile(join(root, '_core', 'player-contract.njk'), '合成玩家契约')
  await writeFile(
    join(root, 'bundles', pluginId, 'bundle.json'),
    JSON.stringify({
      pluginId,
      imports: [],
      roles: [
        {
          id: roleId,
          label: '合成身份',
          template: 'role.njk',
          abilities: [{ id: abilityId, label: '合成能力', foundation: true }],
        },
      ],
      phases: [
        {
          id: phaseId,
          label: '合成阶段',
          audience: 'player',
          daytime: false,
          template: 'turn.njk',
        },
      ],
      events: [
        {
          eventType: 'plugin.event',
          where: { pluginId, eventType },
          audience: 'player',
          template: 'event.njk',
        },
      ],
    }),
  )
  await writeFile(
    join(root, 'bundles', pluginId, 'role.njk'),
    "{% if section == 'public' %}公开合成规则{% else %}你的身份是{{ role.label }}{% endif %}",
  )
  await writeFile(
    join(root, 'bundles', pluginId, 'turn.njk'),
    '合成阶段行动\n{% for line in narration %}{{ line }}{% endfor %}',
  )
  await writeFile(
    join(root, 'bundles', pluginId, 'event.njk'),
    '插件结果：{{ payload.data.value }}',
  )
  const inventory: PromptSemanticInventory = {
    plugins: [pluginId],
    contributions: [
      {
        pluginId,
        roleIds: [roleId],
        abilityIds: [abilityId],
        phaseIds: [phaseId],
        pluginEvents: [{ pluginId, eventType }],
      },
    ],
    interactivePhaseIds: [phaseId],
    coreEventTypes: [],
  }
  return { root, pluginId, roleId, abilityId, phaseId, eventType, inventory }
}

function toolDeclarations() {
  return [
    'submit_speech',
    'submit_vote',
    'submit_night_action',
    'submit_sheriff_action',
    'trigger_skill',
    'submit_postgame_review',
  ].map((name) => ({ name, title: name, description: name, fields: [] }))
}

function policies() {
  return {
    witchSelfSave: 'never' as const,
    witchPotionsPerNight: 1 as const,
    guardAntidoteCollision: 'death' as const,
    guardCanSelfProtect: false,
    sheriffExplosion: 'single-explosion-loses-badge' as const,
    nightLastWords: 'first-night-only' as const,
    victory: 'slaughter-all' as const,
  }
}
