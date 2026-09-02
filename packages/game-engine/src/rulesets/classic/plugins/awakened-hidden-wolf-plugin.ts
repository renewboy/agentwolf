import { PlayerIdSchema, RoleIdSchema, type PlayerAction } from '@agentwolf/contracts'
import { z } from 'zod'
import type { RulePlugin } from '../../../plugins/loader.js'
import type { RulesetBuilder } from '../../../plugins/ruleset.js'
import { visibility, type RuleRuntime } from '../../../rule-registry.js'
import { classicIdentityQueries } from '../identity-queries.js'
import {
  AwakenedHiddenWolfRole,
  awakenedHiddenWolfAbilityIds,
  awakenedHiddenWolfCapabilityFor,
  awakenedHiddenWolfEventDataSchemas,
  awakenedHiddenWolfEventTypes,
  awakenedHiddenWolfLearning,
  awakenedHiddenWolfRoleId,
  awakenedHiddenWolfStateSchema,
  initialAwakenedHiddenWolfState,
} from '../roles/awakened-hidden-wolf.js'
import { classicCapabilities } from '../capabilities.js'
import { v1AbilityIds } from '../ability-ids.js'
import { classicPluginIds } from './ids.js'
import { bySeat, phase } from './shared.js'

const aliveSelector = 'awakened-hidden-wolf-alive'
const learnSelector = 'awakened-hidden-wolf-can-learn'
const copySelector = 'awakened-hidden-wolf-copy-active'
const alivePredicate = 'has-awakened-hidden-wolf'
const learnPredicate = 'has-awakened-hidden-wolf-learning'
const copyPredicate = 'has-awakened-hidden-wolf-copy'
const hiddenNightPhaseId = phase('phase-night-hidden')
const actorPrivateNightPresentation = {
  visibility: 'actors',
  hiddenPhaseId: hiddenNightPhaseId,
  hiddenLabelKey: 'phases.nightHidden',
} as const
const godPrivateNightPresentation = {
  visibility: 'god',
  hiddenPhaseId: hiddenNightPhaseId,
  hiddenLabelKey: 'phases.nightHidden',
} as const

export const awakenedHiddenWolfPlugin: RulePlugin<RulesetBuilder> = {
  id: classicPluginIds.awakenedHiddenWolf,
  version: 3,
  requires: [
    { id: classicPluginIds.phases, version: 1 },
    { id: classicPluginIds.identityQueries, version: 1 },
    { id: classicPluginIds.werewolf, version: 1 },
    { id: classicPluginIds.witch, version: 1 },
    { id: classicPluginIds.hunter, version: 1 },
    { id: classicPluginIds.guard, version: 1 },
    { id: classicPluginIds.magicMirrorGirl, version: 1 },
    { id: classicPluginIds.wolfTeam, version: 2 },
    { id: classicPluginIds.resolution, version: 1 },
    { id: classicPluginIds.night, version: 3 },
    { id: classicPluginIds.death, version: 3 },
  ],
  register: ({ endgames, events, phases, queries, roles, rules }) => {
    const role = new AwakenedHiddenWolfRole()
    roles.register(role)
    endgames.registerRole({
      roleId: role.id,
      wolfControl: 'isolated',
      materialAbilityIds: [
        awakenedHiddenWolfAbilityIds.learn,
        awakenedHiddenWolfAbilityIds.poison,
        awakenedHiddenWolfAbilityIds.shield,
        awakenedHiddenWolfAbilityIds.kill,
        awakenedHiddenWolfAbilityIds.doubleKill,
      ],
      traits: { witchPotions: true, nightProtection: 'single-use' },
      canControlWerewolfProof: (context, playerId) => {
        const player = context.state.players.get(playerId)
        return Boolean(
          player && context.roles.hasCapability(player, classicCapabilities.awakenedHiddenWolfKill),
        )
      },
    })
    registerEvents(events)
    registerSelectors(rules)
    registerPhases(phases)
    registerHandlers(rules)
    queries.registerModifier({
      id: 'awakened-hidden-wolf-exact-role-mask',
      type: classicIdentityQueries.exactRole,
      order: 100,
      inputSchema: z.object({ targetId: PlayerIdSchema }),
      resultSchema: RoleIdSchema,
      transform: ({ targetId }, current, context) => {
        const target = context.state.players.get(targetId)
        if (target?.roleId !== awakenedHiddenWolfRoleId) return current
        return awakenedHiddenWolfLearning(context.state, targetId)?.roleId ?? current
      },
    })
  },
}

function registerEvents(events: RulesetBuilder['events']): void {
  events.register({
    pluginId: classicPluginIds.awakenedHiddenWolf,
    eventType: awakenedHiddenWolfEventTypes.learned,
    schemaVersion: 1,
    stateSchema: awakenedHiddenWolfStateSchema,
    dataSchema: awakenedHiddenWolfEventDataSchemas.learned,
    initialState: initialAwakenedHiddenWolfState,
    reduce: (state, data) => ({
      ...state,
      learnings: [...state.learnings.filter((entry) => entry.actorId !== data.actorId), data],
    }),
  })
  events.register({
    pluginId: classicPluginIds.awakenedHiddenWolf,
    eventType: awakenedHiddenWolfEventTypes.status,
    schemaVersion: 1,
    stateSchema: awakenedHiddenWolfStateSchema,
    dataSchema: awakenedHiddenWolfEventDataSchemas.status,
    initialState: initialAwakenedHiddenWolfState,
    reduce: (state, data) => ({
      ...state,
      statuses: [
        ...state.statuses.filter(
          (entry) => entry.actorId !== data.actorId || entry.night !== data.night,
        ),
        data,
      ],
    }),
  })
  events.register({
    pluginId: classicPluginIds.awakenedHiddenWolf,
    eventType: awakenedHiddenWolfEventTypes.attacked,
    schemaVersion: 1,
    stateSchema: awakenedHiddenWolfStateSchema,
    dataSchema: awakenedHiddenWolfEventDataSchemas.attacked,
    initialState: initialAwakenedHiddenWolfState,
    reduce: (state, data) => ({
      ...state,
      attacks: [
        ...state.attacks.filter(
          (entry) => entry.actorId !== data.actorId || entry.night !== data.night,
        ),
        data,
      ],
    }),
  })
  for (const [eventType, dataSchema] of [
    [awakenedHiddenWolfEventTypes.inspected, awakenedHiddenWolfEventDataSchemas.inspected],
    [awakenedHiddenWolfEventTypes.poisoned, awakenedHiddenWolfEventDataSchemas.poisoned],
    [awakenedHiddenWolfEventTypes.protected, awakenedHiddenWolfEventDataSchemas.protected],
  ] as const) {
    events.register({
      pluginId: classicPluginIds.awakenedHiddenWolf,
      eventType,
      schemaVersion: 1,
      stateSchema: awakenedHiddenWolfStateSchema,
      dataSchema,
      initialState: initialAwakenedHiddenWolfState,
      reduce: (state) => state,
    })
  }
}

function registerSelectors(rules: RulesetBuilder['rules']): void {
  rules.registerActorSelector(aliveSelector, (runtime) =>
    bySeat(
      runtime,
      [...runtime.state.players.values()]
        .filter((player) => player.alive && player.roleId === awakenedHiddenWolfRoleId)
        .map((player) => player.id),
    ),
  )
  rules.registerActorSelector(learnSelector, (runtime) =>
    rules
      .selectActors(aliveSelector, runtime)
      .filter((playerId) => !awakenedHiddenWolfLearning(runtime.state, playerId)),
  )
  rules.registerActorSelector(copySelector, (runtime) =>
    rules.selectActors(aliveSelector, runtime).filter((playerId) => {
      const player = runtime.state.players.get(playerId)
      const learning = awakenedHiddenWolfLearning(runtime.state, playerId)
      return Boolean(
        player &&
        learning &&
        learning.night < runtime.state.night &&
        [
          classicCapabilities.awakenedHiddenWolfInspect,
          classicCapabilities.awakenedHiddenWolfPoison,
          classicCapabilities.awakenedHiddenWolfShield,
        ].some((capabilityId) => runtime.roles.hasCapability(player, capabilityId)),
      )
    }),
  )
  rules.registerPredicate(
    alivePredicate,
    (runtime) => rules.selectActors(aliveSelector, runtime).length > 0,
  )
  rules.registerPredicate(
    learnPredicate,
    (runtime) => rules.selectActors(learnSelector, runtime).length > 0,
  )
  rules.registerPredicate(
    copyPredicate,
    (runtime) => rules.selectActors(copySelector, runtime).length > 0,
  )
}

function registerPhases(phases: RulesetBuilder['phases']): void {
  phases.insert({
    node: {
      id: phase('phase-night-awakened-hidden-wolf-status'),
      labelKey: 'phases.nightAwakenedHiddenWolfStatus',
      mode: 'automatic',
      presentation: godPrivateNightPresentation,
      activeWhen: alivePredicate,
      edges: [],
    },
    after: phase('phase-night-guard'),
    before: phase('phase-night-wolf-council'),
  })
  phases.insert({
    node: {
      id: phase('phase-night-awakened-hidden-wolf-attack'),
      labelKey: 'phases.nightAwakenedHiddenWolfAttack',
      mode: 'parallel',
      presentation: actorPrivateNightPresentation,
      action: {
        type: 'night-action',
        abilityIds: [],
        capabilityIds: [
          classicCapabilities.awakenedHiddenWolfKill,
          classicCapabilities.awakenedHiddenWolfDoubleKill,
        ],
        visibility: 'actor',
      },
      actorSelector: `capability-alive:${classicCapabilities.awakenedHiddenWolfKill}`,
      activeWhen: `capability-active:${classicCapabilities.awakenedHiddenWolfKill}`,
      edges: [],
    },
    after: phase('phase-night-wolf-vote'),
    before: phase('phase-night-witch'),
  })
  phases.insert({
    node: {
      id: phase('phase-night-awakened-hidden-wolf-copy'),
      labelKey: 'phases.nightAwakenedHiddenWolfCopy',
      mode: 'parallel',
      presentation: actorPrivateNightPresentation,
      action: {
        type: 'night-action',
        abilityIds: [],
        capabilityIds: [
          classicCapabilities.awakenedHiddenWolfInspect,
          classicCapabilities.awakenedHiddenWolfPoison,
          classicCapabilities.awakenedHiddenWolfShield,
        ],
        visibility: 'actor',
      },
      actorSelector: copySelector,
      activeWhen: copyPredicate,
      edges: [],
    },
    after: phase('phase-night-magic-mirror'),
    before: phase('phase-night-resolve'),
  })
  phases.insert({
    node: {
      id: phase('phase-night-awakened-hidden-wolf-learn'),
      labelKey: 'phases.nightAwakenedHiddenWolfLearn',
      mode: 'parallel',
      presentation: actorPrivateNightPresentation,
      action: {
        type: 'night-action',
        abilityIds: [awakenedHiddenWolfAbilityIds.learn],
        visibility: 'actor',
      },
      actorSelector: learnSelector,
      activeWhen: learnPredicate,
      edges: [],
    },
    after: phase('phase-night-seer'),
    before: phase('phase-night-magic-mirror'),
  })
}

function registerHandlers(rules: RulesetBuilder['rules']): void {
  rules.registerPhaseHandler(phase('phase-night-awakened-hidden-wolf-status'), updateAttackStatus, {
    id: 'awakened-hidden-wolf-status',
  })
  rules.registerPhaseHandler(
    phase('phase-night-awakened-hidden-wolf-attack'),
    publishAttackSelection,
    { id: 'awakened-hidden-wolf-attack-selection' },
  )
  rules.registerPhaseHandler(phase('phase-night-awakened-hidden-wolf-learn'), settleLearning, {
    id: 'awakened-hidden-wolf-learning',
  })
}

function updateAttackStatus(runtime: RuleRuntime): void {
  const actors = [...runtime.state.players.values()].filter(
    (player) => player.alive && player.roleId === awakenedHiddenWolfRoleId,
  )
  for (const actor of actors) {
    const packAlive = [...runtime.state.players.values()].some((player) => {
      if (!player.alive || player.id === actor.id || player.faction !== 'werewolf') return false
      return player.roleId ? runtime.roles.role(player.roleId).sharesFactionKnowledge : false
    })
    const armed = !packAlive
    if (armed && !runtime.roles.hasCapability(actor, classicCapabilities.awakenedHiddenWolfKill)) {
      runtime.append(
        {
          type: 'capability.granted',
          playerId: actor.id,
          capabilityId: classicCapabilities.awakenedHiddenWolfKill,
        },
        visibility.players([actor.id]),
      )
    }
    const state = awakenedHiddenWolfStateSchema.parse(
      runtime.state.pluginState.get(classicPluginIds.awakenedHiddenWolf) ??
        initialAwakenedHiddenWolfState,
    )
    if (
      (runtime.state.night >= 2 || armed) &&
      !state.statuses.some(
        (status) => status.actorId === actor.id && status.night === runtime.state.night,
      )
    ) {
      runtime.append(
        {
          type: 'plugin.event',
          pluginId: classicPluginIds.awakenedHiddenWolf,
          eventType: awakenedHiddenWolfEventTypes.status,
          schemaVersion: 1,
          data: { actorId: actor.id, night: runtime.state.night, armed },
        },
        visibility.players([actor.id]),
      )
    }
  }
}

function publishAttackSelection(runtime: RuleRuntime): void {
  const actions = currentPhaseNightActions(runtime)
  for (const action of actions) {
    if (action.option === 'pass' || action.targetIds.length === 0) continue
    const currentState = awakenedHiddenWolfStateSchema.parse(
      runtime.state.pluginState.get(classicPluginIds.awakenedHiddenWolf) ??
        initialAwakenedHiddenWolfState,
    )
    if (
      !currentState.attacks.some(
        (entry) => entry.actorId === action.actorId && entry.night === runtime.state.night,
      )
    ) {
      runtime.append(
        {
          type: 'plugin.event',
          pluginId: classicPluginIds.awakenedHiddenWolf,
          eventType: awakenedHiddenWolfEventTypes.attacked,
          schemaVersion: 1,
          data: {
            actorId: action.actorId,
            night: runtime.state.night,
            targetIds: action.targetIds,
          },
        },
        visibility.players([action.actorId]),
      )
    }
    const recipients = [...runtime.state.players.values()]
      .filter(
        (player) =>
          player.alive &&
          runtime.roles.hasCapability(player, classicCapabilities.witchAntidote) &&
          (player.roleState.abilityUses[v1AbilityIds.witchAntidote] ?? 0) === 0,
      )
      .map((player) => player.id)
    const targetId = action.targetIds[0]
    const alreadyPublished = runtime.events.some(
      (event) =>
        event.payload.type === 'night.attack-selected' &&
        event.payload.targetId === targetId &&
        event.sequence > currentNightStart(runtime),
    )
    if (targetId && recipients.length > 0 && !alreadyPublished) {
      runtime.append({ type: 'night.attack-selected', targetId }, visibility.players(recipients))
    }
  }
}

function settleLearning(runtime: RuleRuntime): void {
  const actions = currentPhaseNightActions(runtime)
  for (const action of actions) {
    if (action.option === 'pass' || action.abilityId !== awakenedHiddenWolfAbilityIds.learn)
      continue
    const targetId = action.targetIds[0]
    if (!targetId) continue
    let learning = awakenedHiddenWolfLearning(runtime.state, action.actorId)
    if (!learning) {
      const targetRoleId = runtime.state.players.get(targetId)?.roleId
      if (!targetRoleId) throw new Error(`Learning target ${targetId} has no role`)
      runtime.append(
        {
          type: 'plugin.event',
          pluginId: classicPluginIds.awakenedHiddenWolf,
          eventType: awakenedHiddenWolfEventTypes.learned,
          schemaVersion: 1,
          data: {
            actorId: action.actorId,
            targetId,
            roleId: targetRoleId,
            night: runtime.state.night,
          },
        },
        visibility.players([action.actorId]),
      )
      learning = awakenedHiddenWolfLearning(runtime.state, action.actorId)
    }
    const capabilityId = learning ? awakenedHiddenWolfCapabilityFor(learning.roleId) : null
    const actor = runtime.state.players.get(action.actorId)
    if (actor && capabilityId && !runtime.roles.hasCapability(actor, capabilityId)) {
      runtime.append(
        { type: 'capability.granted', playerId: actor.id, capabilityId },
        visibility.players([actor.id]),
      )
    }
  }
}

function currentPhaseNightActions(
  runtime: RuleRuntime,
): Array<Extract<PlayerAction, { type: 'night-action' }>> {
  return runtime.state.phaseActions.filter(
    (action): action is Extract<PlayerAction, { type: 'night-action' }> =>
      action.type === 'night-action',
  )
}

function currentNightStart(runtime: RuleRuntime): number {
  return (
    [...runtime.events].reverse().find((event) => event.payload.type === 'night.started')
      ?.sequence ?? 0
  )
}
