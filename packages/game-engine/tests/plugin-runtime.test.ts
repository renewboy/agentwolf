import { z } from 'zod'
import {
  AbilityIdSchema,
  AgentProfileIdSchema,
  CapabilityIdSchema,
  MatchIdSchema,
  PhaseIdSchema,
  PlayerIdSchema,
  PluginEventTypeSchema,
  PluginIdSchema,
  QueryTypeSchema,
  RoleIdSchema,
  RulesetIdSchema,
  TriggerIdSchema,
} from '@agentwolf/contracts'
import { describe, expect, it } from 'vitest'
import {
  Role,
  RulesetBuilder,
  emptyGameState,
  sixPlayerBoard,
  type ExtensibleResolutionEffect,
  type PlayerState,
  type RulePlugin,
} from '../src/index.js'

const pluginId = PluginIdSchema.parse('plugin-synthetic-role')
const capabilityId = CapabilityIdSchema.parse('capability-synthetic-action')
const roleId = RoleIdSchema.parse('role-synthetic')
const receiverRoleId = RoleIdSchema.parse('role-synthetic-receiver')
const abilityId = AbilityIdSchema.parse('ability-synthetic-mark')
const eventType = PluginEventTypeSchema.parse('event-synthetic-counted')
const queryType = QueryTypeSchema.parse('query-synthetic-score')
const insertedPhaseId = PhaseIdSchema.parse('phase-synthetic-action')
const endPhaseId = PhaseIdSchema.parse('phase-synthetic-end')

interface SyntheticEffect extends ExtensibleResolutionEffect {
  readonly kind: 'synthetic-mark'
  readonly playerId: ReturnType<typeof PlayerIdSchema.parse>
}

class SyntheticRole extends Role {
  public readonly id = roleId
  public readonly displayNameKey = 'roles.villager'
  public readonly faction = 'independent' as const
  public readonly kind = 'independent' as const
  public readonly endgameModel = 'plugin' as const
  public override readonly capabilities = [capabilityId] as const
  public readonly abilities = [
    {
      id: abilityId,
      endgameImpact: 'material' as const,
      nightResolutionStage: 'post-wolf-priority' as const,
      requiredCapability: capabilityId,
      actionTypes: ['night-action' as const],
      validate: () => undefined,
      effects: (context: Parameters<Role['abilities'][number]['effects']>[0]) => [
        { kind: 'synthetic-mark', priority: 1, playerId: context.actor.id },
      ],
    },
  ]
}

class SyntheticReceiverRole extends Role {
  public readonly id = receiverRoleId
  public readonly displayNameKey = 'roles.villager'
  public readonly faction = 'village' as const
  public readonly kind = 'villager' as const
  public readonly endgameModel = 'inert' as const
  public readonly abilities = []
}

describe('ruleset plugin runtime', () => {
  it('adds a role, phase, effect, event state, capability, and victory evaluator without kernel edits', () => {
    const basePlugin: RulePlugin<RulesetBuilder> = {
      id: PluginIdSchema.parse('plugin-synthetic-base'),
      version: 1,
      register: ({ phases }) =>
        phases.registerBase({
          id: 'synthetic-graph',
          entry: endPhaseId,
          nodes: new Map([
            [
              endPhaseId,
              { id: endPhaseId, labelKey: 'phases.matchEnded', mode: 'automatic', edges: [] },
            ],
          ]),
        }),
    }
    const rolePlugin: RulePlugin<RulesetBuilder> = {
      id: pluginId,
      version: 1,
      requires: [{ id: basePlugin.id, version: 1 }],
      register: ({ endgames, events, phases, queries, resolution, roles, triggers, victories }) => {
        roles.register(new SyntheticRole())
        roles.register(new SyntheticReceiverRole())
        endgames.registerRole({
          roleId,
          wolfControl: 'none',
          materialAbilityIds: [abilityId],
        })
        phases.insert({
          node: {
            id: insertedPhaseId,
            labelKey: 'phases.nightSeer',
            mode: 'parallel',
            action: {
              type: 'night-action',
              abilityIds: [],
              capabilityIds: [capabilityId],
              visibility: 'actor',
            },
            actorSelector: `capability-alive:${capabilityId}`,
            edges: [],
          },
          after: null,
          before: endPhaseId,
        })
        resolution.registerEffect<SyntheticEffect>({
          kind: 'synthetic-mark',
          schema: z.object({
            kind: z.literal('synthetic-mark'),
            priority: z.number(),
            playerId: PlayerIdSchema,
          }),
          lane: 'information',
          apply: (effect, _context, frame) => {
            frame
              .fact('synthetic.marked', () => new Set<ReturnType<typeof PlayerIdSchema.parse>>())
              .add(effect.playerId)
          },
        })
        resolution.registerFinalizer({
          id: 'synthetic-finalizer',
          finalize: (_context, frame) => ({
            savedPlayerIds: [
              ...(frame.read<Set<ReturnType<typeof PlayerIdSchema.parse>>>('synthetic.marked') ??
                []),
            ],
          }),
        })
        events.register({
          pluginId,
          eventType,
          schemaVersion: 1,
          stateSchema: z.object({ count: z.number().int() }),
          dataSchema: z.object({ delta: z.number().int() }),
          initialState: { count: 0 },
          reduce: (state, data) => ({ count: state.count + data.delta }),
        })
        triggers.registerDecision({
          id: TriggerIdSchema.parse('trigger-synthetic-decision'),
          signal: 'synthetic-signal',
          abilityId,
          eligible: () => true,
        })
        queries.register({
          type: queryType,
          inputSchema: z.object({ value: z.number() }),
          resultSchema: z.number(),
          resolve: ({ value }) => value + 1,
        })
        queries.registerModifier({
          id: 'synthetic-query-double',
          type: queryType,
          inputSchema: z.object({ value: z.number() }),
          resultSchema: z.number(),
          transform: (_input, current) => current * 2,
        })
        victories.register({
          id: 'synthetic-victory',
          evaluate: () => ({
            winner: 'independent',
            winningPlayerIds: [PlayerIdSchema.parse('player-1')],
            reason: 'synthetic-condition',
          }),
        })
      },
    }
    const runtime = new RulesetBuilder({
      id: RulesetIdSchema.parse('ruleset-synthetic-test'),
      revision: 1,
      plugins: [rolePlugin, basePlugin],
    }).build()
    expect(runtime.phases.entry).toBe(insertedPhaseId)
    expect(runtime.contributions.find((entry) => entry.pluginId === basePlugin.id)).toMatchObject({
      roleIds: [],
      abilityIds: [],
      phaseIds: [endPhaseId],
    })
    expect(runtime.contributions.find((entry) => entry.pluginId === pluginId)).toMatchObject({
      roleIds: [roleId, receiverRoleId],
      abilityIds: [abilityId],
      phaseIds: [insertedPhaseId],
      pluginEvents: [{ pluginId, eventType }],
      queryTypes: [queryType],
      triggerIds: ['trigger-synthetic-decision'],
    })
    expect(runtime.roles.role(roleId)).toBeInstanceOf(SyntheticRole)
    expect(runtime.roles.role(receiverRoleId)).toBeInstanceOf(SyntheticReceiverRole)

    const playerId = PlayerIdSchema.parse('player-1')
    const player: PlayerState = {
      id: playerId,
      seat: 1,
      name: 'Synthetic player',
      profileId: AgentProfileIdSchema.parse('profile-synthetic-player'),
      roleId,
      faction: 'independent' as const,
      alive: true,
      canVote: true,
      roleState: {
        abilityUses: {},
        capabilities: new Set<ReturnType<typeof CapabilityIdSchema.parse>>(),
        memory: {},
      },
    }
    expect(runtime.roles.hasCapability(player, capabilityId)).toBe(true)
    const receiver: PlayerState = {
      ...player,
      id: PlayerIdSchema.parse('player-2'),
      roleId: receiverRoleId,
      roleState: {
        abilityUses: {},
        capabilities: new Set<ReturnType<typeof CapabilityIdSchema.parse>>([capabilityId]),
        memory: {},
      },
    }
    expect(runtime.roles.canUseAbility(receiver, abilityId)).toBe(true)
    expect(runtime.roles.abilitiesFor(receiver).map((ability) => ability.id)).toContain(abilityId)
    const state = emptyGameState(MatchIdSchema.parse('match-synthetic-test'), sixPlayerBoard)
    const effect: SyntheticEffect = { kind: 'synthetic-mark', priority: 1, playerId }
    expect(
      runtime.triggers.abilityIdsFor(
        'synthetic-signal',
        player,
        state,
        sixPlayerBoard,
        runtime.roles,
      ),
    ).toEqual([abilityId])
    expect(
      runtime.resolution.settle([effect], {
        state,
        board: sixPlayerBoard,
        roles: runtime.roles,
      }).savedPlayerIds,
    ).toEqual([playerId])
    expect(
      runtime.events
        .apply(new Map(), {
          pluginId,
          eventType,
          schemaVersion: 1,
          data: { delta: 2 },
        })
        .get(pluginId),
    ).toEqual({ count: 2 })
    expect(
      runtime.queries.resolve(
        queryType,
        { value: 2 },
        {
          state,
          board: sixPlayerBoard,
          roles: runtime.roles,
        },
      ),
    ).toBe(6)
    expect(
      runtime.victories.evaluate({
        state,
        board: sixPlayerBoard,
        roles: runtime.roles,
        events: [],
      }),
    ).toEqual({
      winner: 'independent',
      winningPlayerIds: ['player-1'],
      reason: 'synthetic-condition',
    })
  })
})
