import { describe, expect, it } from 'vitest'
import type { GameEvent, PlayerId } from '@agentwolf/contracts'
import { formatCopy, getCopy } from '../src/catalog.js'
import {
  registeredEventEffect,
  registeredEventNarration,
  registeredEventPlayerIds,
  registeredTimelineNarration,
} from '../src/classic-event-presentations.js'
import { renderEventNarration, type NarrationCatalog } from '../src/narration.js'
import {
  pluginEventEffect,
  pluginEventPlayerMarkers,
  pluginEventPlayerIds,
  renderPluginEventNarration,
} from '../src/plugin-events.js'
import { getPlayerMarkerDefinition } from '../src/player-markers.js'
import { getRoleEffectDefinition } from '../src/role-effects.js'

const player1 = 'player-1' as PlayerId
const player2 = 'player-2' as PlayerId
const player3 = 'player-3' as PlayerId
const catalog: NarrationCatalog = {
  players: new Map([
    [player1, { playerId: player1, seat: 1, name: '一号' }],
    [player2, { playerId: player2, seat: 2, name: '二号' }],
    [player3, { playerId: player3, seat: 3, name: '三号' }],
  ]),
  roleName: (roleId) =>
    (
      ({
        'role-guard': '守卫',
        'role-witch': '女巫',
        'role-werewolf': '狼人',
      }) as Record<string, string>
    )[roleId] ?? roleId,
  viewerPlayerId: player1,
}

function event(payload: Record<string, unknown>): GameEvent {
  return {
    matchId: 'match-assets-events',
    sequence: 1,
    occurredAt: '2026-08-28T00:00:00.000Z',
    visibility: { kind: 'public' },
    payload,
  } as GameEvent
}

function plugin(pluginId: string, eventType: string, data: unknown): GameEvent {
  return event({
    type: 'plugin.event',
    pluginId,
    eventType,
    schemaVersion: 1,
    data,
  })
}

describe('copy catalog', () => {
  it('resolves and formats copy and rejects invalid paths and missing values', () => {
    expect(getCopy('common.cancel')).toBeTruthy()
    expect(formatCopy('{{count}} / {{enabled}}', { count: 2, enabled: true })).toBe('2 / true')
    expect(() => formatCopy('{{missing}}', {})).toThrow(/Missing copy value/)
    expect(() => getCopy(['common', 'missing'].join('.'))).toThrow(/Unknown copy key/)
    expect(() => getCopy(['common', 'cancel', 'child'].join('.'))).toThrow(/Unknown copy key/)
    expect(() => getCopy(['com', 'mon'].join(''))).toThrow(/not a string/)
  })

  it('resolves known effects and rejects unknown effect IDs', () => {
    expect(getRoleEffectDefinition('werewolf-attack')).toMatchObject({ tier: 'large' })
    expect(getRoleEffectDefinition('seer-inspect')).toMatchObject({ tier: 'medium' })
    expect(() => getRoleEffectDefinition('unknown-effect')).toThrow(/Unknown role effect/)
  })

  it('resolves known player markers and rejects unknown marker IDs', () => {
    expect(getPlayerMarkerDefinition('cupid-lover')).toMatchObject({
      labelKey: 'playerMarkers.cupidLover',
      icon: 'heart',
    })
    expect(() => getPlayerMarkerDefinition('unknown-marker')).toThrow(/Unknown player marker/)
  })
})

describe('plugin event presentations', () => {
  const cases = [
    [
      'plugin-role-magic-mirror-girl',
      'event-magic-mirror-inspected',
      { actorId: player1, targetId: player2, roleId: 'role-guard' },
      'magic-mirror-inspect',
    ],
    [
      'plugin-role-white-wolf-king',
      'event-white-wolf-detonated',
      { actorId: player1, targetId: player2 },
      'white-wolf-detonate',
    ],
    [
      'plugin-role-awakened-hidden-wolf',
      'event-awakened-hidden-wolf-learned',
      { actorId: player1, targetId: player2, roleId: 'role-witch', night: 1 },
      'awakened-hidden-wolf-learn',
    ],
    [
      'plugin-role-awakened-hidden-wolf',
      'event-awakened-hidden-wolf-inspected',
      { actorId: player1, targetId: player2, roleId: 'role-werewolf' },
      'awakened-hidden-wolf-inspect',
    ],
    [
      'plugin-role-awakened-hidden-wolf',
      'event-awakened-hidden-wolf-poisoned',
      { actorId: player1, targetId: player2 },
      'awakened-hidden-wolf-poison',
    ],
    [
      'plugin-role-awakened-hidden-wolf',
      'event-awakened-hidden-wolf-protected',
      { actorId: player1, targetId: player2 },
      'awakened-hidden-wolf-shield',
    ],
    [
      'plugin-role-awakened-hidden-wolf',
      'event-awakened-hidden-wolf-attacked',
      { actorId: player1, targetIds: [player2] },
      'awakened-hidden-wolf-attack',
    ],
    [
      'plugin-role-awakened-hidden-wolf',
      'event-awakened-hidden-wolf-attacked',
      { actorId: player1, targetIds: [player2, player3] },
      'awakened-hidden-wolf-double-attack',
    ],
  ] as const

  it.each(cases)('renders %s / %s', (pluginId, eventType, data, effectId) => {
    const value = plugin(pluginId, eventType, data)
    expect(renderPluginEventNarration(value, catalog)).toBeTruthy()
    expect(pluginEventPlayerIds(value)).toContain(player1)
    expect(pluginEventEffect(value)).toMatchObject({ effectId })
  })

  it('renders armed/dormant status without an effect', () => {
    for (const armed of [true, false]) {
      const value = plugin(
        'plugin-role-awakened-hidden-wolf',
        'event-awakened-hidden-wolf-status',
        { actorId: player1, armed },
      )
      expect(renderPluginEventNarration(value, catalog)).toBeTruthy()
      expect(pluginEventPlayerIds(value)).toEqual([player1])
      expect(pluginEventEffect(value)).toBeNull()
    }
  })

  it('contributes persistent lover markers only from the Cupid link event', () => {
    const linked = plugin('plugin-role-cupid', 'event-cupid-linked', {
      loverIds: [player1, player2],
    })
    expect(pluginEventPlayerMarkers(linked)).toEqual([
      { markerId: 'cupid-lover', playerIds: [player1, player2] },
    ])
    expect(
      pluginEventPlayerMarkers(
        plugin('plugin-role-cupid', 'event-cupid-linked-death', {
          sourceId: player1,
          targetId: player2,
          timing: 'night',
        }),
      ),
    ).toEqual([])
  })

  it('ignores unrelated and unknown events', () => {
    const ordinary = event({ type: 'night.started', night: 1 })
    expect(renderPluginEventNarration(ordinary, catalog)).toBeNull()
    expect(pluginEventPlayerIds(ordinary)).toEqual([])
    expect(pluginEventEffect(ordinary)).toBeNull()
    expect(pluginEventPlayerMarkers(ordinary)).toEqual([])
    const unknown = plugin('plugin-unknown', 'event-unknown', {})
    expect(renderPluginEventNarration(unknown, catalog)).toBeNull()
    expect(pluginEventPlayerIds(unknown)).toEqual([])
    expect(pluginEventEffect(unknown)).toBeNull()
    expect(pluginEventPlayerMarkers(unknown)).toEqual([])
  })

  it('rejects malformed plugin payloads and unknown narration players', () => {
    for (const [pluginId, eventType, data, message] of [
      ['plugin-role-magic-mirror-girl', 'event-magic-mirror-inspected', null, 'Magic Mirror'],
      ['plugin-role-magic-mirror-girl', 'event-magic-mirror-inspected', [], 'Magic Mirror'],
      ['plugin-role-white-wolf-king', 'event-white-wolf-detonated', null, 'White Wolf'],
      ['plugin-role-white-wolf-king', 'event-white-wolf-detonated', [], 'White Wolf'],
      ['plugin-role-awakened-hidden-wolf', 'event-awakened-hidden-wolf-learned', null, 'Role'],
      ['plugin-role-awakened-hidden-wolf', 'event-awakened-hidden-wolf-status', [], 'status'],
      [
        'plugin-role-awakened-hidden-wolf',
        'event-awakened-hidden-wolf-status',
        { actorId: player1, armed: 'yes' },
        'Invalid awakened status',
      ],
      ['plugin-role-awakened-hidden-wolf', 'event-awakened-hidden-wolf-poisoned', null, 'target'],
      ['plugin-role-awakened-hidden-wolf', 'event-awakened-hidden-wolf-attacked', null, 'attack'],
      ['plugin-role-cupid', 'event-cupid-linked', null, 'Cupid link'],
      [
        'plugin-role-awakened-hidden-wolf',
        'event-awakened-hidden-wolf-attacked',
        { actorId: player1, targetIds: 'player-2' },
        'targets',
      ],
    ] as const) {
      expect(() => pluginEventPlayerIds(plugin(pluginId, eventType, data))).toThrow(message)
    }
    const missing = plugin('plugin-role-magic-mirror-girl', 'event-magic-mirror-inspected', {
      actorId: player1,
      targetId: 'player-99',
      roleId: 'role-guard',
    })
    expect(() => renderPluginEventNarration(missing, catalog)).toThrow(/Unknown narration player/)
  })
})

describe('classic event presentations', () => {
  const values = [
    event({ type: 'night.attack-selected', targetId: player2 }),
    event({ type: 'night.attack-selected', targetId: null }),
    event({ type: 'player.died', playerId: player1, causes: ['self-destruct'], announced: true }),
    event({ type: 'guard.protected', actorId: player1, targetId: player2 }),
    event({ type: 'guard.protected', actorId: player1, targetId: null }),
    event({ type: 'witch.potion-used', actorId: player1, targetId: player2, potion: 'antidote' }),
    event({ type: 'witch.potion-used', actorId: player1, targetId: player2, potion: 'poison' }),
    event({ type: 'seer.inspected', actorId: player1, targetId: player2, result: 'werewolf' }),
    event({ type: 'seer.inspected', actorId: player1, targetId: player2, result: 'village' }),
    event({ type: 'hunter.shot', playerId: player1, targetId: player2 }),
    event({ type: 'idiot.revealed', playerId: player1 }),
  ]

  it('renders all registered families and their effects/player IDs', () => {
    for (const value of values) {
      const narration = registeredEventNarration(value, catalog)
      const timeline = registeredTimelineNarration(value, catalog)
      const ids = registeredEventPlayerIds(value)
      const effect = registeredEventEffect(value)
      expect(narration ?? timeline ?? effect).not.toBeNull()
      if (ids) expect(ids.every((id) => id.startsWith('player-'))).toBe(true)
    }
    expect(registeredEventEffect(values[1]!)).toBeNull()
    expect(registeredEventEffect(values[4]!)).toBeNull()
  })

  it('ignores unregistered events and non-self-destruct deaths', () => {
    for (const value of [
      event({ type: 'day.completed', day: 1 }),
      event({ type: 'player.died', playerId: player1, causes: ['poison'], announced: true }),
    ]) {
      expect(registeredEventNarration(value, catalog)).toBeNull()
      expect(registeredTimelineNarration(value, catalog)).toBeNull()
      expect(registeredEventPlayerIds(value)).toBeNull()
      expect(registeredEventEffect(value)).toBeNull()
    }
  })

  it('throws when a registered presentation references an unknown player', () => {
    expect(() =>
      registeredEventNarration(
        event({
          type: 'seer.inspected',
          actorId: player1,
          targetId: 'player-99',
          result: 'village',
        }),
        catalog,
      ),
    ).toThrow(/Unknown narration player/)
  })

  it('fails closed when an invalid payload changes type during presentation', () => {
    const changingEvent = (): GameEvent => {
      let reads = 0
      const payload = new Proxy(
        { targetId: player2 },
        {
          get(target, property, receiver) {
            if (property === 'type')
              return reads++ === 0 ? 'night.attack-selected' : 'day.completed'
            return Reflect.get(target, property, receiver)
          },
        },
      )
      return event(payload)
    }

    expect(registeredEventNarration(changingEvent(), catalog)).toBeNull()
    expect(registeredTimelineNarration(changingEvent(), catalog)).toBeNull()
  })
})

describe('event narration', () => {
  it('renders public announcement codes and ignores unknown announcements', () => {
    for (const code of [
      'player-eliminated',
      'peaceful-night',
      'night-deaths',
      'no-exile',
      'idiot-survived',
      'werewolf-self-destruct',
      'white-wolf-detonation',
    ]) {
      expect(
        renderEventNarration(
          event({ type: 'public.announcement', code, playerIds: [player1], params: {} }),
          catalog,
        ),
      ).toBeTruthy()
    }
    expect(
      renderEventNarration(
        event({ type: 'public.announcement', code: 'unknown', playerIds: [], params: {} }),
        catalog,
      ),
    ).toBeNull()
  })

  it('renders every built-in narration branch', () => {
    const cases = [
      event({ type: 'night.started', night: 2 }),
      event({ type: 'day.started', day: 2 }),
      event({ type: 'phase.changed', phaseId: 'phase-day-speech', labelKey: 'phases.daySpeech' }),
      event({ type: 'speech.order-set', playerIds: [player1, player2] }),
      event({ type: 'speech.committed', playerId: player1, text: '发言', kind: 'day' }),
      event({ type: 'sheriff.candidacy', playerId: player1, standing: true }),
      event({ type: 'sheriff.candidacy', playerId: player1, standing: false }),
      event({ type: 'sheriff.elected', playerId: player1 }),
      event({ type: 'sheriff.badge-lost', playerId: player1 }),
      event({ type: 'sheriff.transferred', fromPlayerId: player1, toPlayerId: player2 }),
      event({ type: 'sheriff.transferred', fromPlayerId: player1, toPlayerId: null }),
      event({ type: 'vote.cast', voterId: player1, targetId: player2, kind: 'exile' }),
      event({ type: 'vote.cast', voterId: player1, targetId: null, kind: 'exile' }),
      event({ type: 'vote.cast', voterId: player1, targetId: null, kind: 'wolf-kill' }),
      event({ type: 'vote.resolved', totals: { [player1]: 2, [player2]: 1 } }),
      event({ type: 'vote.resolved', totals: {} }),
      event({ type: 'faction.members', faction: 'village', playerIds: [player1] }),
      event({ type: 'faction.members', faction: 'werewolf', playerIds: [player1, player2] }),
      event({ type: 'faction.members', faction: 'werewolf', playerIds: [player1] }),
      event({ type: 'role.assigned', playerId: player1, roleId: 'role-guard', faction: 'village' }),
      event({ type: 'role.assigned', playerId: player2, roleId: 'role-witch', faction: 'village' }),
      event({ type: 'role.revealed', playerId: player1, roleId: 'role-guard' }),
      event({ type: 'match.ended', winner: 'village' }),
      event({ type: 'match.ended', winner: 'werewolf' }),
      event({ type: 'match.ended', winner: 'independent' }),
      event({ type: 'match.paused', reason: 'reason' }),
      event({ type: 'match.resumed' }),
      event({ type: 'day.interrupted' }),
    ]
    for (const value of cases) {
      const rendered = renderEventNarration(value, catalog)
      if (value.payload.type === 'faction.members' && value.payload.faction === 'village') {
        expect(rendered).toBeNull()
      } else {
        expect(rendered).toBeTruthy()
      }
    }
    expect(renderEventNarration(event({ type: 'day.completed', day: 1 }), catalog)).toBeNull()
    expect(renderEventNarration(event({ type: 'match.created' }), catalog)).toBeNull()
  })

  it('renders a non-viewer wolf roster and rejects missing players', () => {
    const godCatalog: NarrationCatalog = {
      players: catalog.players,
      roleName: catalog.roleName,
    }
    expect(
      renderEventNarration(
        event({ type: 'faction.members', faction: 'werewolf', playerIds: [player1, player2] }),
        godCatalog,
      ),
    ).toContain('一号')
    expect(() =>
      renderEventNarration(
        event({ type: 'speech.committed', playerId: 'player-99', text: 'x', kind: 'day' }),
        catalog,
      ),
    ).toThrow(/Unknown narration player/)
  })
})
