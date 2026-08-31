import {
  PlayerActionSchema,
  SimulationCaptureSchema,
  SimulationControlSchema,
  SimulationFixtureSchema,
  SimulationRunReportSchema,
  type MatchId,
  type PlayerAction,
  type CanonicalSimulationEvent,
  type SimulationCapture,
  type SimulationControl,
  type SimulationExpected,
  type SimulationFixture,
  type SimulationRunReport,
  type SimulationTurn,
  type SimulationVariant,
} from '@agentwolf/contracts'
import { GameEngine } from '@agentwolf/game-engine'
import {
  canonicalizeSimulationEvents,
  createSimulationNormalization,
  reviewedSimulationExpected,
  simulationCheckpoint,
  simulationSeed,
} from './simulation-canonical.js'
import { createSimulationEngine } from './simulation-engine.js'

type SimulationInput = SimulationCapture | SimulationFixture

interface EngineSimulationOptions {
  readonly matchId?: MatchId
  readonly onDeterministicIndex?: (key: string, length: number, index: number) => void
}

export function runEngineSimulation(
  input: SimulationInput,
  variant: SimulationVariant = 'recorded',
): SimulationRunReport {
  return runEngineSimulationWithOptions(input, variant)
}

function runEngineSimulationWithOptions(
  input: SimulationInput,
  variant: SimulationVariant,
  options: EngineSimulationOptions = {},
): SimulationRunReport {
  const simulation = parseInput(input)
  const expected = simulation.stage === 'candidate' ? simulation.observed : simulation.expected
  const failures: string[] = []
  const created = createSimulationEngine(simulation, options)
  const { board, clock, deterministicIndex, matchId, ruleset } = created
  let engine = created.engine
  const consumed = new Set<number>()
  let restarted = false
  try {
    engine.prepareStart()
    const expectedTypes =
      simulation.stage === 'candidate'
        ? simulation.observed.events.map((event) => event.payload.type)
        : simulation.expected.eventTypes
    if (expectedTypes.includes('match.started')) {
      engine.start()
    } else {
      const bootstrapFault = simulation.turns.find(
        (turn) => turn.kind === 'bootstrap' && turn.fault !== null,
      )
      if (!bootstrapFault)
        throw new Error('Simulation pauses before start without a bootstrap fault')
      consumed.add(bootstrapFault.completionOrder)
      engine.pause(bootstrapFault.fault ?? 'other')
    }
    let boundaries = 0
    while (engine.state.status === 'running') {
      if (boundaries++ > 1_000) throw new Error('Simulation exceeded 1000 action boundaries')
      const descriptor = engine.currentTurn()
      if (!descriptor || descriptor.actors.length === 0) {
        throw new Error(`Engine stopped without a turn at ${engine.state.phaseId}`)
      }
      if (
        simulation.setup.publicSpeechInterruptMode === 'rolling' &&
        submitRollingInterruptTurn(simulation.turns, consumed, descriptor, engine)
      ) {
        continue
      }
      const activeActors =
        descriptor.mode === 'sequential' ? descriptor.actors.slice(0, 1) : descriptor.actors
      const actions = activeActors.map((actorId) =>
        findAction(simulation.turns, consumed, descriptor.phaseId, descriptor.actionType, actorId),
      )
      const missingActor = activeActors.find((_actorId, index) => !actions[index]?.action)
      if (missingActor) {
        const fault = findFault(
          simulation.turns,
          consumed,
          descriptor.phaseId,
          descriptor.actionType,
          missingActor,
        )
        if (!fault)
          throw new Error(`No scripted action for ${missingActor} in ${descriptor.phaseId}`)
        consumed.add(fault.completionOrder)
        engine.pause(fault.fault ?? 'other')
        break
      }
      const ordered = actions
        .filter(
          (turn): turn is SimulationTurn & { action: NonNullable<SimulationTurn['action']> } =>
            Boolean(turn?.action),
        )
        .sort(
          (left, right) => seatOf(simulation, left.playerId) - seatOf(simulation, right.playerId),
        )
      for (const turn of ordered) {
        consumed.add(turn.completionOrder)
        assertBoundary(turn, descriptor)
        try {
          engine.submit(replayAction(turn.action, engine.state.matchId))
        } catch (error) {
          if (turn.fault !== 'invalid-action') throw error
          engine.pause('invalid-action', turn.playerId)
          break
        }
      }
      if (variant === 'restart-boundary' && !restarted && engine.state.status === 'running') {
        engine = GameEngine.restore({
          matchId,
          board,
          events: engine.events,
          status: engine.state.status,
          pausedReason: engine.state.pausedReason,
          clock,
          ruleset,
          deterministicIndex,
        })
        restarted = true
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error))
  }

  const normalization = createSimulationNormalization(
    simulation.setup.board,
    simulation.setup.players,
    simulation.setup.speechCharacterLimit,
    simulation.setup.publicSpeechInterruptMode,
    simulation.setup.reserveRoleIds,
  )
  const events = canonicalizeSimulationEvents(engine.events, normalization)
  const actual: SimulationExpected = {
    events,
    checkpoint: simulationCheckpoint(engine.state, engine.state.status, events.length),
  }
  failures.push(
    ...checkSimulationInvariants(events, simulation.setup.players.length, simulation.turns),
  )
  const comparableActual =
    simulation.stage === 'candidate' ? actual : reviewedSimulationExpected(actual)
  const divergence = firstSimulationDifference(expected, comparableActual)
  if (divergence) failures.push(divergence)
  return SimulationRunReportSchema.parse({
    simulationId: simulation.simulationId,
    variant,
    seed: simulationSeed(simulation.simulationId, variant),
    ok: failures.length === 0,
    failures,
    actual,
  })
}

export function recordSimulationDeterministicControls(
  input: SimulationCapture,
  executionMatchId: MatchId,
): SimulationControl[] {
  const controls = new Map<string, Extract<SimulationControl, { type: 'deterministic.index' }>>()
  let conflict: Error | null = null
  runEngineSimulationWithOptions(input, 'recorded', {
    matchId: executionMatchId,
    onDeterministicIndex: (key, length, index) => {
      const sourcePrefix = `${executionMatchId}:`
      const canonicalKey = key.startsWith(sourcePrefix)
        ? `${input.setup.matchId}:${key.slice(sourcePrefix.length)}`
        : key
      const control = SimulationControlSchema.parse({
        type: 'deterministic.index',
        key: canonicalKey,
        length,
        index,
      }) as Extract<SimulationControl, { type: 'deterministic.index' }>
      const existing = controls.get(canonicalKey)
      if (existing && (existing.length !== control.length || existing.index !== control.index)) {
        conflict = new Error(`Conflicting deterministic index control for ${canonicalKey}`)
        return
      }
      controls.set(canonicalKey, control)
    },
  })
  if (conflict) throw conflict
  return [...controls.values()].sort((left, right) => left.key.localeCompare(right.key))
}

function submitRollingInterruptTurn(
  turns: readonly SimulationTurn[],
  consumed: Set<number>,
  descriptor: NonNullable<ReturnType<GameEngine['currentTurn']>>,
  engine: GameEngine,
): boolean {
  if (descriptor.mode !== 'sequential' || descriptor.actionType !== 'speech') return false
  const speakerId = descriptor.actors[0]
  if (!speakerId) return false
  const listeners = turns
    .filter(
      (turn) =>
        !consumed.has(turn.completionOrder) &&
        turn.kind === 'action' &&
        turn.phaseId === descriptor.phaseId &&
        turn.actionType === 'skill-trigger',
    )
    .sort((left, right) => left.completionOrder - right.completionOrder)
  for (const ignored of listeners.filter((turn) => turn.action === null && turn.fault !== null)) {
    consumed.add(ignored.completionOrder)
  }
  for (const pass of listeners.filter(
    (turn) => turn.action?.type === 'skill-trigger' && turn.action.option === 'pass',
  )) {
    consumed.add(pass.completionOrder)
  }
  const interrupt = listeners.find(
    (turn) => turn.action?.type === 'skill-trigger' && turn.action.option !== 'pass',
  )
  if (!interrupt?.action || interrupt.action.type !== 'skill-trigger') return false
  const speaker = turns
    .filter(
      (turn) =>
        !consumed.has(turn.completionOrder) &&
        turn.kind === 'action' &&
        turn.phaseId === descriptor.phaseId &&
        turn.actionType === 'speech' &&
        turn.playerId === speakerId,
    )
    .sort((left, right) => left.completionOrder - right.completionOrder)[0]
  if (speaker?.status === 'completed' && speaker.completionOrder < interrupt.completionOrder) {
    return false
  }
  if (speaker?.action) {
    consumed.add(speaker.completionOrder)
    engine.submit(replayAction(speaker.action, engine.state.matchId), {
      deferContinuation: true,
    })
  } else if (speaker) {
    consumed.add(speaker.completionOrder)
  }
  consumed.add(interrupt.completionOrder)
  engine.submit(replayAction(interrupt.action, engine.state.matchId))
  return true
}

export function checkSimulationInvariants(
  events: readonly CanonicalSimulationEvent[],
  playerCount: number,
  turns: readonly SimulationTurn[] = [],
): string[] {
  const failures: string[] = []
  events.forEach((event, index) => {
    if (event.sequence !== index + 1)
      failures.push(`event ${index + 1} has sequence ${event.sequence}`)
  })
  if (events[0]?.payload.type !== 'match.created') failures.push('match.created is not first')
  const roleAssignments = events.filter((event) => event.payload.type === 'role.assigned')
  if (roleAssignments.length !== playerCount) {
    failures.push(`expected ${playerCount} role assignments, received ${roleAssignments.length}`)
  }

  let phaseActors = new Set<string>()
  let completedActors = new Set<string>()
  let phaseId: string | null = null
  let endedAt = -1
  for (const [index, event] of events.entries()) {
    const payload = event.payload
    if (endedAt >= 0 && payload.type === 'action.submitted') {
      failures.push(`action submitted after match.ended at event ${index + 1}`)
    }
    switch (payload.type) {
      case 'role.assigned':
        if (
          event.visibility.kind !== 'players' ||
          event.visibility.playerIds.length !== 1 ||
          event.visibility.playerIds[0] !== payload.playerId
        ) {
          failures.push(`role assignment for ${payload.playerId} has invalid visibility`)
        }
        break
      case 'faction.members':
        if (event.visibility.kind !== 'faction' || event.visibility.faction !== payload.faction) {
          failures.push(`faction roster for ${payload.faction} has invalid visibility`)
        }
        break
      case 'phase.changed':
        phaseId = payload.phaseId
        phaseActors = new Set()
        completedActors = new Set()
        break
      case 'phase.actors-set':
        if (event.visibility.kind !== 'god') {
          failures.push(`actor snapshot for ${payload.phaseId} is not god-only`)
        }
        if (payload.phaseId !== phaseId)
          failures.push(`actors set for inactive phase ${payload.phaseId}`)
        if (new Set(payload.playerIds).size !== payload.playerIds.length) {
          failures.push(`duplicate actor in ${payload.phaseId}`)
        }
        phaseActors = new Set(payload.playerIds)
        break
      case 'phase.actor-completed':
        if (!phaseActors.has(payload.playerId)) {
          failures.push(
            `${payload.playerId} completed without actor membership in ${payload.phaseId}`,
          )
        }
        if (completedActors.has(payload.playerId)) {
          failures.push(`${payload.playerId} completed twice in ${payload.phaseId}`)
        }
        completedActors.add(payload.playerId)
        break
      case 'vote.resolved':
        failures.push(...validateVoteResolution(events.slice(0, index + 1), payload))
        break
      case 'death.pending':
        if (event.visibility.kind !== 'god') {
          failures.push(`pending death for ${payload.playerId} is not god-only`)
        }
        break
      case 'match.ended':
        endedAt = index
        break
      default:
        break
    }
  }
  if (endedAt >= 0) {
    const finalReveals = events
      .slice(endedAt + 1)
      .filter((event) => event.payload.type === 'role.revealed')
    if (finalReveals.length !== playerCount) {
      failures.push(`expected ${playerCount} final role reveals, received ${finalReveals.length}`)
    }
  }
  failures.push(...checkTurnInvariants(turns))
  return failures
}

function checkTurnInvariants(turns: readonly SimulationTurn[]): string[] {
  const failures: string[] = []
  const completionOrders = turns.map((turn) => turn.completionOrder)
  if (new Set(completionOrders).size !== completionOrders.length) {
    failures.push('simulation turns contain duplicate completion order values')
  }
  const parallelGroups = new Map<string, SimulationTurn[]>()
  for (const turn of turns) {
    if (turn.fromSequence > turn.toSequence) {
      failures.push(`turn ${turn.ordinal}/${turn.playerId} has an inverted event range`)
    }
    if (turn.visibleEventSequences.some((sequence) => sequence > turn.toSequence)) {
      failures.push(`turn ${turn.ordinal}/${turn.playerId} exposes an event after its boundary`)
    }
    if (new Set(turn.expectedActors).size !== turn.expectedActors.length) {
      failures.push(`turn ${turn.ordinal}/${turn.playerId} has duplicate expected actors`)
    }
    if (turn.kind === 'bootstrap' && turn.action !== null) {
      failures.push(`bootstrap turn ${turn.ordinal}/${turn.playerId} contains an action`)
    }
    if (turn.kind === 'action' && turn.action && turn.action.actorId !== turn.playerId) {
      failures.push(`turn ${turn.ordinal}/${turn.playerId} contains another actor's action`)
    }
    if (
      turn.kind === 'action' &&
      turn.expectedActors.length > 0 &&
      !turn.expectedActors.includes(turn.playerId)
    ) {
      failures.push(`turn ${turn.ordinal}/${turn.playerId} is outside its actor snapshot`)
    }
    if (
      turn.status === 'completed' &&
      turn.kind === 'action' &&
      turn.action === null &&
      turn.fault === null
    ) {
      failures.push(`completed action turn ${turn.ordinal}/${turn.playerId} has no action`)
    }
    if (turn.mode === 'parallel' && turn.phaseId) {
      const key = `${turn.phaseId}:${turn.toSequence}:${turn.sessionGeneration}:${turn.attempt}`
      const group = parallelGroups.get(key) ?? []
      group.push(turn)
      parallelGroups.set(key, group)
    }
  }
  for (const [key, group] of parallelGroups) {
    const expected = group[0]?.expectedActors ?? []
    if (group.some((turn) => !sameValues(turn.expectedActors, expected))) {
      failures.push(`parallel turn group ${key} contains different actor snapshots`)
    }
  }
  return failures
}

function validateVoteResolution(
  history: readonly CanonicalSimulationEvent[],
  resolved: Extract<CanonicalSimulationEvent['payload'], { type: 'vote.resolved' }>,
): string[] {
  const phaseStart = history.findLastIndex((event) => event.payload.type === 'phase.changed')
  const casts = history
    .slice(phaseStart + 1, -1)
    .filter(
      (event): event is CanonicalSimulationEvent & { payload: { type: 'vote.cast' } } =>
        event.payload.type === 'vote.cast' && event.payload.kind === resolved.kind,
    )
  const totals: Record<string, number> = {}
  for (const cast of casts) {
    if (cast.payload.targetId) {
      totals[cast.payload.targetId] = (totals[cast.payload.targetId] ?? 0) + cast.payload.weight
    }
  }
  return JSON.stringify(totals) === JSON.stringify(resolved.totals)
    ? []
    : [`vote totals differ for ${resolved.kind}`]
}

function parseInput(input: SimulationInput): SimulationInput {
  return input.stage === 'candidate'
    ? SimulationCaptureSchema.parse(input)
    : SimulationFixtureSchema.parse(input)
}

function findAction(
  turns: readonly SimulationTurn[],
  consumed: ReadonlySet<number>,
  phaseId: string,
  actionType: string,
  playerId: string,
): SimulationTurn | null {
  return (
    turns
      .filter(
        (turn) =>
          !consumed.has(turn.completionOrder) &&
          turn.kind === 'action' &&
          turn.phaseId === phaseId &&
          turn.actionType === actionType &&
          turn.playerId === playerId &&
          turn.action !== null &&
          turn.fault !== 'invalid-action',
      )
      .sort((left, right) => left.completionOrder - right.completionOrder)[0] ??
    turns
      .filter(
        (turn) =>
          !consumed.has(turn.completionOrder) &&
          turn.kind === 'action' &&
          turn.phaseId === phaseId &&
          turn.actionType === actionType &&
          turn.playerId === playerId &&
          turn.action !== null,
      )
      .sort((left, right) => left.completionOrder - right.completionOrder)[0] ??
    null
  )
}

function findFault(
  turns: readonly SimulationTurn[],
  consumed: ReadonlySet<number>,
  phaseId: string,
  actionType: string,
  playerId: string,
): SimulationTurn | null {
  return (
    turns
      .filter(
        (turn) =>
          !consumed.has(turn.completionOrder) &&
          turn.phaseId === phaseId &&
          turn.actionType === actionType &&
          turn.playerId === playerId &&
          turn.fault !== null,
      )
      .sort((left, right) => left.completionOrder - right.completionOrder)[0] ?? null
  )
}

function assertBoundary(
  turn: SimulationTurn,
  descriptor: NonNullable<ReturnType<GameEngine['currentTurn']>>,
): void {
  if (turn.phaseId !== descriptor.phaseId)
    throw new Error(`Expected ${turn.phaseId}, got ${descriptor.phaseId}`)
  if (turn.actionType !== descriptor.actionType) {
    throw new Error(`Expected ${turn.actionType}, got ${descriptor.actionType}`)
  }
  if (turn.mode && turn.mode !== descriptor.mode) {
    throw new Error(`Expected ${turn.mode}, got ${descriptor.mode}`)
  }
  if (
    descriptor.mode === 'parallel' &&
    turn.expectedActors.length > 0 &&
    !sameValues(turn.expectedActors, descriptor.actors)
  ) {
    throw new Error(`Actor set differs in ${descriptor.phaseId}`)
  }
}

function seatOf(simulation: SimulationInput, playerId: string): number {
  return simulation.setup.players.find((player) => player.playerId === playerId)?.seat ?? 0
}

function replayAction(action: PlayerAction, matchId: MatchId): PlayerAction {
  return PlayerActionSchema.parse({ ...action, matchId })
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function firstSimulationDifference(
  expected: unknown,
  actual: unknown,
  path = 'result',
): string | null {
  if (Object.is(expected, actual)) return null
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return `${path}.length expected ${expected.length}, received ${actual.length}`
    }
    for (let index = 0; index < expected.length; index += 1) {
      const difference = firstSimulationDifference(
        expected[index],
        actual[index],
        `${path}[${index}]`,
      )
      if (difference) return difference
    }
    return null
  }
  if (isRecord(expected) && isRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
    for (const key of keys) {
      const difference = firstSimulationDifference(expected[key], actual[key], `${path}.${key}`)
      if (difference) return difference
    }
    return null
  }
  return `${path} expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
