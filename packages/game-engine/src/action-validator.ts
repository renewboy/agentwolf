import type { AbilityId, EventVisibility, PlayerAction, PlayerId } from '@agentwolf/contracts'
import { assertRule } from './errors.js'
import type { RoleRegistry } from './roles/registry.js'
import type { TriggerRegistry } from './plugins/trigger-registry.js'
import { sanitizeSpeech } from './speech.js'
import type {
  BoardManifest,
  GameState,
  PhaseActionDefinition,
  PhaseInterruptDefinition,
  PhaseNode,
  PlayerState,
} from './types.js'

export function phaseSpeechKind(
  node: PhaseNode,
): Extract<PlayerAction, { type: 'speech' }>['kind'] {
  assertRule(node.action?.type === 'speech', `${node.id} is not a speech phase`)
  return node.action.kind
}

export function expectedVoteKind(node: PhaseNode): Extract<PlayerAction, { type: 'vote' }>['kind'] {
  assertRule(node.action?.type === 'vote', `${node.id} is not a vote phase`)
  return node.action.kind
}

export function validateTurnAction(
  node: PhaseNode,
  action: PlayerAction,
  state: GameState,
  board: BoardManifest,
  roles: RoleRegistry,
  triggers: TriggerRegistry,
): void {
  const definition = node.action
  assertRule(definition, `${node.id} does not accept player actions`)
  assertRule(definition.type === action.type, `${node.id} requires ${definition.type}`)
  const actor = state.players.get(action.actorId)
  assertRule(actor?.roleId, `Actor ${action.actorId} has no role`)

  switch (definition.type) {
    case 'speech': {
      assertRule(action.type === 'speech', `${node.id} requires speech`)
      assertRule(action.kind === definition.kind, `Unexpected speech kind ${action.kind}`)
      const result = sanitizeSpeech(action.text, state.players)
      assertRule(
        result.unknownIds.length === 0,
        `Speech contains unknown Player ID ${result.unknownIds[0]}`,
      )
      return
    }
    case 'vote':
      assertRule(action.type === 'vote', `${node.id} requires vote`)
      validateVote(definition, action, state, board, roles, actor)
      return
    case 'sheriff-action':
      assertRule(action.type === 'sheriff-action', `${node.id} requires a Sheriff action`)
      validateSheriffAction(definition, action, state, actor)
      return
    case 'night-action': {
      assertRule(action.type === 'night-action', `${node.id} requires a night action`)
      assertAllowedAbility(
        node,
        phaseAbilityIdsForActor(definition, actor, state, board, roles),
        action.abilityId,
      )
      const entry = roles.ability(action.abilityId)
      assertRule(
        roles.canUseAbility(actor, action.abilityId),
        `${actor.name} cannot use ${action.abilityId}`,
      )
      assertRule(
        entry.ability.actionTypes.includes(action.type),
        `${action.abilityId} does not accept ${action.type}`,
      )
      if (action.option === 'pass') {
        assertRule(definition.passAllowed !== false, `${node.id} does not allow pass`)
        assertRule(action.targetIds.length === 0, 'A pass action cannot have targets')
        return
      }
      entry.ability.validate({ state, board, roles, action, actor })
      return
    }
    case 'skill-trigger':
      assertRule(action.type === 'skill-trigger', `${node.id} requires a skill trigger`)
      assertAllowedAbility(
        node,
        allowedSkillAbilityIds(definition, actor, state, board, roles, triggers),
        action.abilityId,
      )
      if (action.option === 'pass') {
        assertRule(definition.passAllowed !== false, `${node.id} does not allow pass`)
      }
      validateRoleSkill(action, state, board, roles, actor)
      return
  }
}

function validateSheriffAction(
  definition: Extract<PhaseActionDefinition, { type: 'sheriff-action' }>,
  action: Extract<PlayerAction, { type: 'sheriff-action' }>,
  state: GameState,
  actor: PlayerState,
): void {
  assertRule(
    definition.actions.includes(action.action),
    `${action.action} is invalid during ${state.phaseId}`,
  )
  if (action.action === 'transfer') {
    assertRule(action.targetId, 'Badge transfer requires a target')
    const target = state.players.get(action.targetId)
    assertRule(target?.alive, 'Badge target must be alive')
    assertRule(target.id !== actor.id, 'Badge cannot remain with a dead sheriff')
    return
  }
  assertRule(!action.targetId, `${action.action} cannot target a player`)
}

function allowedSkillAbilityIds(
  definition: Extract<PhaseActionDefinition, { type: 'skill-trigger' }>,
  actor: PlayerState,
  state: GameState,
  board: BoardManifest,
  roles: RoleRegistry,
  triggers: TriggerRegistry,
): readonly Extract<PlayerAction, { type: 'skill-trigger' }>['abilityId'][] {
  return definition.abilitySource === 'decision-trigger'
    ? triggers.abilityIdsFor(definition.triggerSignal ?? '', actor, state, board, roles)
    : phaseAbilityIdsForActor(definition, actor, state, board, roles)
}

export function phaseAbilityIdsForActor(
  definition: Extract<PhaseActionDefinition, { type: 'night-action' | 'skill-trigger' }>,
  actor: PlayerState,
  _state: GameState,
  _board: BoardManifest,
  roles: RoleRegistry,
): readonly Extract<PlayerAction, { type: 'night-action' }>['abilityId'][] {
  const capabilityAbilityIds = (definition.capabilityIds ?? []).flatMap((capabilityId) =>
    roles.abilityIdsForCapability(capabilityId),
  )
  return [...new Set([...definition.abilityIds, ...capabilityAbilityIds])].filter(
    (abilityId) =>
      roles.canUseAbility(actor, abilityId) &&
      roles.ability(abilityId).ability.actionTypes.includes(definition.type),
  )
}

function assertAllowedAbility(
  node: PhaseNode,
  abilityIds: readonly Extract<PlayerAction, { type: 'night-action' }>['abilityId'][],
  abilityId: Extract<PlayerAction, { type: 'night-action' }>['abilityId'],
): void {
  const required = abilityIds.length === 1 ? abilityIds[0] : null
  assertRule(
    abilityIds.includes(abilityId),
    required ? `${node.id} requires ${required}` : `${node.id} does not allow ${abilityId}`,
  )
}

function validateVote(
  definition: Extract<PhaseActionDefinition, { type: 'vote' }>,
  action: Extract<PlayerAction, { type: 'vote' }>,
  state: GameState,
  board: BoardManifest,
  roles: RoleRegistry,
  actor: PlayerState,
): void {
  assertRule(action.kind === definition.kind, `Expected ${definition.kind} vote`)
  if (definition.abilityId) {
    assertRule(actor.roleId, `${actor.name} has no role`)
    const entry = roles.ability(definition.abilityId)
    assertRule(
      roles.canUseAbility(actor, definition.abilityId),
      `${actor.name} cannot use ${definition.abilityId}`,
    )
    assertRule(
      entry.ability.actionTypes.includes(action.type),
      `${definition.abilityId} does not accept ${action.type}`,
    )
    entry.ability.validate({ state, board, roles, action, actor })
    return
  }
  if (!action.targetId) return
  const target = state.players.get(action.targetId)
  assertRule(target?.alive, 'Vote target must be publicly alive')
  if (definition.kind === 'sheriff') {
    assertRule(state.sheriff.standingCandidates.has(target.id), 'Target is not running for sheriff')
  } else if (definition.kind === 'sheriff-runoff' || definition.kind === 'exile-runoff') {
    assertRule(state.lastVote?.tiedPlayerIds.includes(target.id), 'Target is not in the runoff')
  }
}

function validateRoleSkill(
  action: Extract<PlayerAction, { type: 'skill-trigger' }>,
  state: GameState,
  board: BoardManifest,
  roles: RoleRegistry,
  actor: PlayerState,
): void {
  assertRule(actor.roleId, `${actor.name} has no role`)
  const entry = roles.ability(action.abilityId)
  assertRule(
    roles.canUseAbility(actor, action.abilityId),
    `${actor.name} cannot use ${action.abilityId}`,
  )
  assertRule(
    entry.ability.actionTypes.includes(action.type),
    `${action.abilityId} does not accept ${action.type}`,
  )
  if (action.option === 'pass') {
    assertRule(action.targetId === null, 'A pass trigger cannot have a target')
    return
  }
  entry.ability.validate({ state, board, roles, action, actor })
}

export function normalizeTurnAction(
  node: PhaseNode,
  action: PlayerAction,
  state: GameState,
): PlayerAction {
  if (action.type !== 'speech') return action
  return {
    ...action,
    text: sanitizeSpeech(action.text, state.players).text,
    kind: phaseSpeechKind(node),
  }
}

export function turnActionVisibility(
  node: PhaseNode,
  action: PlayerAction,
  state: GameState,
): EventVisibility {
  return phaseActionVisibility(node, action.actorId, state.phaseActors)
}

export function phaseActionVisibility(
  node: PhaseNode,
  actorId: PlayerId,
  phaseActors: readonly PlayerId[] = [actorId],
): EventVisibility {
  const actionVisibility = node.action?.visibility
  assertRule(actionVisibility, `${node.id} does not define action visibility`)
  if (actionVisibility === 'public') return { kind: 'public' }
  if (typeof actionVisibility === 'object') return actionVisibility
  if (actionVisibility === 'actors') {
    assertRule(phaseActors.length > 0, `${node.id} actor visibility requires phase actors`)
    return { kind: 'players', playerIds: [...phaseActors] }
  }
  return { kind: 'players', playerIds: [actorId] }
}

export function phaseInterruptForAction(
  node: PhaseNode,
  action: PlayerAction,
  state: GameState,
  roles: RoleRegistry,
): PhaseInterruptDefinition | null {
  if (action.type !== 'skill-trigger') return null
  const actor = state.players.get(action.actorId)
  if (!actor || !roles.canUseAbility(actor, action.abilityId)) return null
  const ability = roles.ability(action.abilityId).ability
  return (
    node.interrupts?.find(
      (interrupt) =>
        ability.requiredCapability !== undefined &&
        interrupt.capabilityIds.includes(ability.requiredCapability),
    ) ?? null
  )
}

export function phaseInterruptAbilityIdsForActor(
  node: PhaseNode,
  actor: PlayerState,
  roles: RoleRegistry,
): readonly AbilityId[] {
  if (!actor.alive) return []
  return [
    ...new Set(
      (node.interrupts ?? []).flatMap((interrupt) =>
        interrupt.capabilityIds.flatMap((capabilityId) =>
          roles
            .abilityIdsForCapability(capabilityId)
            .filter(
              (abilityId) =>
                roles.canUseAbility(actor, abilityId) &&
                roles.ability(abilityId).ability.actionTypes.includes('skill-trigger'),
            ),
        ),
      ),
    ),
  ]
}
