import {
  AbilityIdSchema,
  GameEventSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
  PluginIdSchema,
  RoleIdSchema,
  type GameEvent,
} from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import { builtInCharacterCards } from '../src/characters.js'
import {
  PromptBundleRegistry,
  loadPromptBundles,
  loadPromptCore,
  type PromptSemanticInventory,
} from '../src/prompts.js'
import type { LoadedPromptBundle } from '../src/prompts/loader.js'
import { PromptBundleManifestSchema, type PromptBundleManifest } from '../src/prompts/schema.js'

const pluginId = PluginIdSchema.parse('plugin-runtime-test')
const roleId = RoleIdSchema.parse('role-runtime-test')
const abilityId = AbilityIdSchema.parse('ability-runtime-test')
const phaseId = PhaseIdSchema.parse('phase-runtime-test')
const player1 = PlayerIdSchema.parse('player-1')
const player2 = PlayerIdSchema.parse('player-2')
const matchId = MatchIdSchema.parse('match-runtime-test')

describe('Prompt runtime behavior matrix', () => {
  it('publishes separate trigger and deterministic pass contracts', () => {
    const core = loadPromptCore()

    expect(core.tool('trigger_skill').description).toContain('发动')
    expect(core.toolField('trigger_skill', 'targetPlayerId')).toContain('只有技能规则要求')
    expect(core.tool('pass_skill').description).toContain('没有参数')
  })

  it('renders core assets, helper-rich foundations, events, turns, and continuations', () => {
    const registry = runtimeRegistry()
    const core = registry.coreAssets()
    expect(core.tool('submit_vote').title).toBe('submit_vote')
    expect(core.toolField('submit_vote', 'targetPlayerId')).toBe('target field')
    expect(core.acceptedReceipt()).toBe('accepted')
    expect(core.rejectedReceipt('bad target')).toBe('rejected bad target')
    expect(core.playerContract()).toBe('player contract')
    expect(() => core.tool('missing' as never)).toThrow(/Unknown Prompt tool/)
    expect(() => core.toolField('submit_vote', 'missing')).toThrow(/Unknown Prompt field/)

    const events = [
      gameEvent({ type: 'day.completed' }),
      gameEvent({ type: 'public.announcement', code: 'hello', playerIds: [], params: {} }),
      gameEvent({
        type: 'action.submitted',
        playerId: player1,
        action: {
          type: 'skill-trigger',
          matchId,
          actorId: player1,
          abilityId,
          targetId: player2,
        },
      }),
      gameEvent({
        type: 'player.died',
        playerId: player2,
        causes: ['exile'],
        announced: true,
        timing: 'day',
      }),
    ]
    const foundation = registry.renderFoundation(foundationFacts(events, true))
    expect(foundation).toContain('1 号玩家')
    expect(foundation).toContain('玩家一（1 号玩家，Player ID：player-1）')
    expect(foundation).toContain('玩家二（2 号玩家）')
    expect(foundation).toContain('运行身份')
    expect(foundation).toContain('完成')
    expect(foundation).toContain('你好 player-1')
    expect(foundation).toContain('targeted')
    expect(foundation).toContain(builtInCharacterCards[0]!.name)

    expect(registry.renderEventNarration(foundationFacts(events, false))).toEqual([
      '完成',
      '你好 player-1',
      'targeted',
    ])
    expect(
      registry.renderEventNarration(
        foundationFacts([gameEvent({ type: 'night.started', night: 1 }), events.at(-1)!], false),
      ),
    ).toEqual([])

    const turn = turnFacts(events, false)
    expect(registry.renderTurn(turn)).toContain('current turn')
    expect(registry.renderTurn({ ...turn, continuation: true })).toContain('continue current turn')
    expect(registry.renderBootstrapContinuation()).toBe('bootstrap')
  })

  it('fails closed for unknown semantic lookups and unpresented events', () => {
    const registry = runtimeRegistry()
    expect(() => registry.roleLabel(RoleIdSchema.parse('role-unknown'))).toThrow(
      /Unknown Prompt Role/,
    )
    expect(() => registry.abilityLabel(AbilityIdSchema.parse('ability-unknown'))).toThrow(
      /Unknown Prompt Ability/,
    )
    expect(() => registry.phasePresentation(PhaseIdSchema.parse('phase-unknown'))).toThrow(
      /Unknown Prompt Phase/,
    )
    expect(registry.phasePresentation(phaseId).daytime).toBe(true)
    expect(() =>
      registry.renderEventNarration(
        foundationFacts([gameEvent({ type: 'day.started', day: 1 })], false),
      ),
    ).toThrow(/No Prompt event presentation/)
  })

  it('rejects missing core, duplicate Role, Ability, and Phase ownership', () => {
    const { core, plugin, inventory } = runtimeFixture()
    expect(() => new PromptBundleRegistry([plugin], inventory)).toThrow(/no _core/)

    const duplicateId = PluginIdSchema.parse('plugin-runtime-duplicate')
    const duplicate = {
      ...plugin,
      id: duplicateId,
      manifest: { ...plugin.manifest, pluginId: duplicateId },
    } satisfies LoadedPromptBundle
    expect(() => new PromptBundleRegistry([core, plugin, duplicate], inventory)).toThrow(
      /Duplicate Prompt Role/,
    )

    const roleWithoutDuplicate = {
      ...duplicate,
      manifest: {
        ...duplicate.manifest,
        roles: [
          {
            ...duplicate.manifest.roles[0]!,
            id: RoleIdSchema.parse('role-runtime-other'),
          },
        ],
      },
    } satisfies LoadedPromptBundle
    expect(() => new PromptBundleRegistry([core, plugin, roleWithoutDuplicate], inventory)).toThrow(
      /Duplicate Prompt Ability/,
    )

    const abilityWithoutDuplicate = {
      ...roleWithoutDuplicate,
      manifest: {
        ...roleWithoutDuplicate.manifest,
        roles: [
          {
            ...roleWithoutDuplicate.manifest.roles[0]!,
            abilities: [
              {
                ...roleWithoutDuplicate.manifest.roles[0]!.abilities[0]!,
                id: AbilityIdSchema.parse('ability-runtime-other'),
              },
            ],
          },
        ],
      },
    } satisfies LoadedPromptBundle
    expect(
      () => new PromptBundleRegistry([core, plugin, abilityWithoutDuplicate], inventory),
    ).toThrow(/Duplicate Prompt Phase/)
  })

  it('rejects incomplete turn presentations and interrupt instructions', () => {
    const fixture = runtimeFixture()
    const phaseWithoutTemplate = {
      ...fixture.plugin,
      manifest: {
        ...fixture.plugin.manifest,
        phases: [{ ...fixture.plugin.manifest.phases[0]!, template: null }],
      },
    } satisfies LoadedPromptBundle
    const noInteractiveInventory = { ...fixture.inventory, interactivePhaseIds: [] }
    const registry = new PromptBundleRegistry(
      [fixture.core, phaseWithoutTemplate],
      noInteractiveInventory,
    )
    expect(() => registry.renderTurn(turnFacts([], false))).toThrow(/has no turn template/)

    const abilityWithoutInterrupt = {
      ...fixture.plugin,
      manifest: {
        ...fixture.plugin.manifest,
        roles: [
          {
            ...fixture.plugin.manifest.roles[0]!,
            abilities: [
              {
                ...fixture.plugin.manifest.roles[0]!.abilities[0]!,
                interruptTemplate: undefined,
              },
            ],
          },
        ],
      },
    } as LoadedPromptBundle
    const missingInterrupt = new PromptBundleRegistry(
      [fixture.core, abilityWithoutInterrupt],
      fixture.inventory,
    )
    expect(() => missingInterrupt.renderTurn(turnFacts([], false))).toThrow(
      /has no interrupt template/,
    )
  })

  it('enforces semantic inventory ownership and completeness', () => {
    const fixture = runtimeFixture()
    expect(
      () =>
        new PromptBundleRegistry([fixture.core, fixture.plugin], {
          ...fixture.inventory,
          contributions: [],
        }),
    ).toThrow(/Missing semantic contribution/)

    const absentId = PluginIdSchema.parse('plugin-runtime-absent')
    expect(
      () =>
        new PromptBundleRegistry([fixture.core], {
          plugins: [absentId],
          contributions: [
            { pluginId: absentId, roleIds: [], abilityIds: [], phaseIds: [], pluginEvents: [] },
          ],
          interactivePhaseIds: [],
          coreEventTypes: [],
        }),
    ).toThrow(/Missing Prompt bundle/)

    expect(
      () =>
        new PromptBundleRegistry([fixture.core, fixture.plugin], {
          plugins: [],
          contributions: [],
          interactivePhaseIds: [],
          coreEventTypes: [],
        }),
    ).toThrow(/claims unowned Role/)

    expect(
      () =>
        new PromptBundleRegistry([fixture.core, fixture.plugin], {
          plugins: [],
          contributions: [
            { pluginId, roleIds: [roleId], abilityIds: [], phaseIds: [], pluginEvents: [] },
          ],
          interactivePhaseIds: [],
          coreEventTypes: [],
        }),
    ).toThrow(/claims unowned Ability/)

    expect(
      () =>
        new PromptBundleRegistry([fixture.core, fixture.plugin], {
          plugins: [],
          contributions: [
            {
              pluginId,
              roleIds: [roleId],
              abilityIds: [abilityId],
              phaseIds: [],
              pluginEvents: [],
            },
          ],
          interactivePhaseIds: [],
          coreEventTypes: [],
        }),
    ).toThrow(/claims unowned Phase/)

    const noTemplate = {
      ...fixture.plugin,
      manifest: {
        ...fixture.plugin.manifest,
        phases: [{ ...fixture.plugin.manifest.phases[0]!, template: null }],
      },
    } satisfies LoadedPromptBundle
    expect(() => new PromptBundleRegistry([fixture.core, noTemplate], fixture.inventory)).toThrow(
      /has no complete template/,
    )

    expect(
      () =>
        new PromptBundleRegistry([fixture.core, fixture.plugin], {
          ...fixture.inventory,
          coreEventTypes: ['match.started'],
        }),
    ).toThrow(/has no Prompt presentation/)
  })

  it('caches production core assets and rejects duplicate installed plugin IDs', () => {
    expect(loadPromptCore()).toBe(loadPromptCore())
    const duplicated = PluginIdSchema.parse('plugin-classic-day')
    expect(() =>
      loadPromptBundles({
        plugins: [duplicated, duplicated],
        contributions: [],
        interactivePhaseIds: [],
        coreEventTypes: [],
      }),
    ).toThrow(/Duplicate installed Prompt plugin/)
  })
})

function runtimeRegistry(): PromptBundleRegistry {
  const fixture = runtimeFixture()
  return new PromptBundleRegistry([fixture.core, fixture.plugin], fixture.inventory)
}

function runtimeFixture(): {
  core: LoadedPromptBundle
  plugin: LoadedPromptBundle
  inventory: PromptSemanticInventory
} {
  const coreManifest = PromptBundleManifestSchema.parse({
    pluginId: '_core',
    core: {
      layouts: {
        foundation: 'foundation.njk',
        continuation: 'continuation.njk',
        bootstrapContinuation: 'bootstrap.njk',
        character: 'character.njk',
        playerContract: 'player-contract.njk',
      },
      factions: { village: 'village', werewolf: 'werewolf', independent: 'independent' },
      receipts: { accepted: 'accepted', rejected: 'rejected {{ reason }}' },
      tools: toolDeclarations(),
    },
  })
  const core = loadedBundle('_core', coreManifest, {
    'foundation.njk': [
      '{{ helpers.player(actor.playerId) }}',
      '{{ helpers.initialPlayer(actor.playerId) }}',
      '{{ helpers.speaker(roster[1].playerId) }}',
      '{{ helpers.playerList([actor.playerId, roster[1].playerId]) }}',
      '{{ helpers.playerListExcept([actor.playerId, roster[1].playerId], actor.playerId) }}',
      '{{ helpers.knownPlayerRoleListExcept([actor.playerId, roster[1].playerId], actor.playerId) }}',
      '{{ helpers.livingPlayerIds() | length }}',
      '{{ helpers.livingPlayerIds(actor.playerId) | length }}',
      '{{ helpers.role(actor.roleId) }}',
      `{{ helpers.ability("${abilityId}") }}`,
      `{{ helpers.phase("${phaseId}") }}`,
      '{{ helpers.faction(actor.faction) }}',
      '{{ helpers.visibleEvent("day.completed").type }}',
      '{{ helpers.announcement("hello").code }}',
      '{{ helpers.hasEvent("day.completed") }}',
      `{{ helpers.abilityUses("${abilityId}") }}`,
      '{{ characterContext }} {{ ownerRoleContext }} {{ publicRoleContexts | join(" ") }}',
      '{{ history | join(" ") }}',
    ].join('\n'),
    'continuation.njk': 'continue {{ currentTurn }}',
    'bootstrap.njk': 'bootstrap',
    'character.njk': '{{ character.name }}',
    'player-contract.njk': 'player contract',
  })
  const pluginManifest = PromptBundleManifestSchema.parse({
    pluginId,
    roles: [
      {
        id: roleId,
        label: '运行身份',
        template: 'role.njk',
        abilities: [
          {
            id: abilityId,
            label: '运行能力',
            description: '运行能力说明',
            foundation: false,
            interruptTemplate: 'interrupt.njk',
          },
        ],
      },
    ],
    phases: [
      {
        id: phaseId,
        label: '运行阶段',
        audience: 'player',
        daytime: true,
        template: 'turn.njk',
      },
    ],
    events: [
      {
        eventType: 'day.completed',
        audience: 'public',
        text: '完成',
        paragraphAfter: true,
      },
      {
        eventType: 'public.announcement',
        where: { code: 'hello' },
        audience: 'public',
        template: 'event.njk',
      },
      {
        eventType: 'action.submitted',
        where: { 'action.targetId': { exists: true } },
        audience: 'god',
        text: 'targeted',
      },
      { eventType: 'player.died', audience: 'god', omit: true },
      { eventType: 'night.started', audience: 'public', text: ' ' },
    ],
  })
  const plugin = loadedBundle(pluginId, pluginManifest, {
    'role.njk':
      '{% if section == "owner" %}owner {{ role.label }}{% else %}public {{ role.label }}{% endif %}',
    'interrupt.njk': 'interrupt {{ ability.label }}',
    'turn.njk': 'current turn {{ narration | join(" ") }} {{ interruptInstructions | join(" ") }}',
    'event.njk': '你好 {{ actor.playerId }}',
  })
  return {
    core,
    plugin,
    inventory: {
      plugins: [pluginId],
      contributions: [
        {
          pluginId,
          roleIds: [roleId],
          abilityIds: [abilityId],
          phaseIds: [phaseId],
          pluginEvents: [],
        },
      ],
      interactivePhaseIds: [phaseId],
      coreEventTypes: [],
    },
  }
}

function loadedBundle(
  id: LoadedPromptBundle['id'],
  manifest: PromptBundleManifest,
  sources: Record<string, string>,
): LoadedPromptBundle {
  return {
    id,
    root: `/virtual/${id}`,
    manifest,
    templates: new Map(Object.entries(sources).map(([name, source]) => [`${id}/${name}`, source])),
  }
}

function foundationFacts(events: GameEvent[], character: boolean) {
  return {
    actor: {
      playerId: player1,
      seat: 1,
      name: '玩家一',
      alive: true,
      roleId,
      faction: 'village' as const,
      abilityUses: { [abilityId]: 2 },
    },
    roster: [
      { playerId: player1, seat: 1, name: '玩家一', alive: true, roleId },
      { playerId: player2, seat: 2, name: '玩家二', alive: true, roleId },
    ],
    board: {
      roles: [{ roleId, faction: 'village' as const, count: 2 }],
      nightActionOrder: [{ phaseId, firstNightOnly: false }],
      sheriff: false,
      policies: policies(),
    },
    game: { day: 1, night: 1, status: 'running' as const, pausedReason: null },
    events,
    character: character ? builtInCharacterCards[0]! : null,
  }
}

function turnFacts(events: GameEvent[], continuation: boolean) {
  const foundation = foundationFacts(events, false)
  return {
    actor: foundation.actor,
    roster: foundation.roster,
    board: foundation.board,
    game: foundation.game,
    events,
    turn: {
      phaseId,
      actionType: 'night-action' as const,
      allowedAbilityIds: [abilityId],
      passAllowed: true,
      interruptAbilityIds: [abilityId],
      interruptWindow: false,
      sheriffActions: [],
    },
    speechCharacterLimit: 300,
    continuation,
  }
}

function gameEvent(payload: GameEvent['payload']): GameEvent {
  return GameEventSchema.parse({
    matchId,
    sequence: gameEvent.sequence++,
    occurredAt: '2026-08-28T00:00:00.000Z',
    visibility: { kind: 'public' },
    payload,
  })
}
gameEvent.sequence = 1

function toolDeclarations() {
  return [
    'submit_speech',
    'submit_vote',
    'submit_night_action',
    'submit_sheriff_action',
    'trigger_skill',
    'pass_skill',
    'submit_postgame_review',
  ].map((name) => ({
    name,
    title: name,
    description: name,
    fields: name === 'submit_vote' ? [{ name: 'targetPlayerId', text: 'target field' }] : [],
  }))
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
