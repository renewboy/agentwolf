import { describe, expect, it } from 'vitest'
import {
  AgentProfileIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  RoleCardIdSchema,
  RoleIdSchema,
  type RoleId,
} from '@agentwolf/contracts'
import {
  GameEngine,
  createClassicRuleset,
  standardBoard,
  thiefAbilityIds,
  thiefCupidBoard,
  thiefState,
} from '../src/index.js'

const werewolf = RoleIdSchema.parse('role-werewolf')
const villager = RoleIdSchema.parse('role-villager')
const seer = RoleIdSchema.parse('role-seer')
const witch = RoleIdSchema.parse('role-witch')
const hunter = RoleIdSchema.parse('role-hunter')
const idiot = RoleIdSchema.parse('role-idiot')
const cupid = RoleIdSchema.parse('role-cupid')
const thief = RoleIdSchema.parse('role-thief')

describe('Thief Role plugin', () => {
  it('forces a Werewolf reserve choice, transforms immediately, and restores the result', () => {
    const engine = createManualThiefEngine(
      [
        werewolf,
        werewolf,
        villager,
        villager,
        villager,
        villager,
        seer,
        witch,
        hunter,
        idiot,
        cupid,
        thief,
      ],
      [werewolf, villager],
    )
    engine.start()
    const thiefId = playerWithRole(engine, thief)
    const ruleset = createClassicRuleset()
    const endgame = ruleset.endgames.model(thief)
    if (!endgame?.prepareWerewolfProof) throw new Error('Missing Thief endgame model')
    const initialPreparation = {
      activeRoleIds: thiefCupidBoard.roles.flatMap(({ roleId, count }) =>
        Array.from({ length: count }, () => roleId),
      ),
      hunterShotWolfLoss: 1,
    }
    expect(
      endgame.prepareWerewolfProof(
        {
          state: engine.state,
          board: standardBoard,
          roles: ruleset.roles,
          events: engine.events,
        },
        new Set(),
        initialPreparation,
      ),
    ).toBe(initialPreparation)
    expect(
      endgame.prepareWerewolfProof(
        {
          state: engine.state,
          board: thiefCupidBoard,
          roles: ruleset.roles,
          events: engine.events,
        },
        new Set(),
        initialPreparation,
      ),
    ).toBeNull()
    expect(engine.state.phaseId).toBe('phase-night-thief')
    expect(engine.roleCardChoicesFor(thiefId)).toEqual([
      {
        abilityId: thiefAbilityIds.chooseCard,
        cardId: RoleCardIdSchema.parse('role-card-r01'),
        roleId: werewolf,
        selectable: true,
      },
      {
        abilityId: thiefAbilityIds.chooseCard,
        cardId: RoleCardIdSchema.parse('role-card-r02'),
        roleId: villager,
        selectable: false,
        reason: 'werewolf-card-required',
      },
    ])
    expect(() =>
      engine.submit(choice(engine, thiefId, RoleCardIdSchema.parse('role-card-r02'))),
    ).toThrow('must choose the Werewolf card')
    expect(() =>
      engine.submit({
        ...choice(engine, thiefId, RoleCardIdSchema.parse('role-card-r01')),
        option: 'pass',
      }),
    ).toThrow('does not allow pass')

    engine.submit(choice(engine, thiefId, RoleCardIdSchema.parse('role-card-r01')))

    expect(engine.state.players.get(thiefId)).toMatchObject({
      roleId: werewolf,
      faction: 'werewolf',
    })
    expect(
      [...engine.state.players.values()].filter((player) => player.faction === 'werewolf'),
    ).toHaveLength(3)
    expect(thiefState(engine.state).selection).toMatchObject({
      playerId: thiefId,
      selectedCard: { roleId: werewolf },
      buriedCard: { roleId: villager },
    })
    const selectedEvent = engine.events.find(
      (event) =>
        event.payload.type === 'plugin.event' && event.payload.eventType === 'event-thief-selected',
    )
    const selectedPayload = selectedEvent?.payload
    if (!selectedPayload || selectedPayload.type !== 'plugin.event') {
      throw new Error('Missing Thief selection event')
    }
    const selection = thiefState(engine.state).selection!
    expect(() =>
      ruleset.events.apply(engine.state.pluginState, {
        pluginId: selectedPayload.pluginId,
        eventType: selectedPayload.eventType,
        schemaVersion: selectedPayload.schemaVersion,
        data: {
          ...selection,
          selectedCard: selection.buriedCard,
          buriedCard: selection.selectedCard,
        },
      }),
    ).toThrow('Thief selection cannot be replaced')
    const wolfRoster = [...engine.events]
      .reverse()
      .find((event) => event.payload.type === 'faction.members')
    expect(wolfRoster?.payload).toMatchObject({ type: 'faction.members' })
    if (wolfRoster?.payload.type !== 'faction.members') throw new Error('Missing wolf roster')
    expect(wolfRoster.payload.playerIds).toContain(thiefId)

    const context = {
      state: engine.state,
      board: thiefCupidBoard,
      roles: ruleset.roles,
      events: engine.events,
    }
    const prepared = endgame.prepareWerewolfProof(
      context,
      new Set(wolfRoster.payload.playerIds),
      initialPreparation,
    )
    expect(prepared?.activeRoleIds).toHaveLength(thiefCupidBoard.playerCount)
    expect(prepared?.activeRoleIds).not.toContain(thief)
    expect(
      endgame.prepareWerewolfProof(
        { ...context, events: [] },
        new Set(wolfRoster.payload.playerIds),
        initialPreparation,
      ),
    ).toBeNull()
    const restored = GameEngine.restore({
      matchId: engine.state.matchId,
      board: thiefCupidBoard,
      events: engine.events,
      status: engine.state.status,
      pausedReason: null,
      ruleset,
    })
    expect(restored.state.players.get(thiefId)).toMatchObject({
      roleId: werewolf,
      faction: 'werewolf',
    })
    expect(thiefState(restored.state)).toEqual(thiefState(engine.state))
  })

  it('becomes Cupid before the Cupid phase and can link lovers in the same night', () => {
    const engine = createManualThiefEngine(
      [
        werewolf,
        werewolf,
        werewolf,
        villager,
        villager,
        villager,
        villager,
        seer,
        witch,
        hunter,
        idiot,
        thief,
      ],
      [cupid, villager],
    )
    engine.start()
    const thiefId = playerWithRole(engine, thief)
    engine.submit(choice(engine, thiefId, RoleCardIdSchema.parse('role-card-r01')))
    expect(engine.state.players.get(thiefId)?.roleId).toBe(cupid)
    expect(engine.state.phaseId).toBe('phase-night-cupid')
    expect(engine.expectedActors()).toEqual([thiefId])
  })

  it('skips the Thief phase when the Thief card is reserved', () => {
    const engine = createManualThiefEngine(
      [
        werewolf,
        werewolf,
        werewolf,
        villager,
        villager,
        villager,
        villager,
        seer,
        witch,
        hunter,
        idiot,
        cupid,
      ],
      [thief, villager],
    )
    engine.start()
    expect(engine.state.phaseId).toBe('phase-night-cupid')
    expect([...engine.state.players.values()].some((player) => player.roleId === thief)).toBe(false)
  })

  it('rejects manual deals that bury two Wolves or bury Thief with a Wolf', () => {
    expect(() =>
      createManualThiefEngine(
        [
          werewolf,
          villager,
          villager,
          villager,
          villager,
          villager,
          seer,
          witch,
          hunter,
          idiot,
          cupid,
          thief,
        ],
        [werewolf, werewolf],
      ),
    ).toThrow('cannot receive two Werewolf reserve cards')
    expect(() =>
      createManualThiefEngine(
        [
          werewolf,
          werewolf,
          villager,
          villager,
          villager,
          villager,
          villager,
          seer,
          witch,
          hunter,
          idiot,
          cupid,
        ],
        [thief, werewolf],
      ),
    ).toThrow('cannot be paired with a Werewolf card')
  })

  it('uses deterministic legal reserves for random assignment', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const engine = GameEngine.create({
        matchId: MatchIdSchema.parse(`match-thief-random-${seed}`),
        board: thiefCupidBoard,
        players: playerInputs(Array.from({ length: 12 }, () => undefined)),
        roleAssignment: 'random',
        seed,
        ruleset: createClassicRuleset(),
      })
      const assignedThief = [...engine.state.players.values()].some(
        (player) => player.roleId === thief,
      )
      const reservedWolves = engine.state.reservedRoleCards.filter(
        (card) => createClassicRuleset().roles.role(card.roleId).faction === 'werewolf',
      )
      expect(reservedWolves.length).toBeLessThanOrEqual(assignedThief ? 1 : 0)
    }
  })
})

function createManualThiefEngine(assignments: RoleId[], reserves: RoleId[]): GameEngine {
  return GameEngine.create({
    matchId: MatchIdSchema.parse('match-thief-manual'),
    board: thiefCupidBoard,
    players: playerInputs(assignments),
    roleAssignment: 'manual',
    manualReserveRoleIds: reserves,
    seed: 17,
    ruleset: createClassicRuleset(),
  })
}

function playerInputs(assignments: readonly (RoleId | undefined)[]) {
  return assignments.map((roleId, index) => ({
    id: PlayerIdSchema.parse(`player-${index + 1}`),
    seat: index + 1,
    name: `盗丘玩家${index + 1}`,
    profileId: AgentProfileIdSchema.parse(`profile-thief-${index + 1}`),
    ...(roleId ? { roleId } : {}),
  }))
}

function playerWithRole(engine: GameEngine, roleId: RoleId) {
  const player = [...engine.state.players.values()].find((entry) => entry.roleId === roleId)
  if (!player) throw new Error(`Missing ${roleId}`)
  return player.id
}

function choice(
  engine: GameEngine,
  actorId: ReturnType<typeof PlayerIdSchema.parse>,
  roleCardId: ReturnType<typeof RoleCardIdSchema.parse>,
) {
  return {
    type: 'night-action' as const,
    matchId: engine.state.matchId,
    actorId,
    abilityId: thiefAbilityIds.chooseCard,
    targetIds: [],
    roleCardId,
  }
}
