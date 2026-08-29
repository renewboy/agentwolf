import {
  MatchViewSchema,
  RoleEffectCueSchema,
  CharacterSummarySchema,
  type AgentConfigurationSummary,
  type CharacterCardSnapshot,
  type GameEvent,
  type MatchId,
  type MatchView,
  type PlayerMarkerId,
  type PostgameReviewView,
  type TimelineItem,
  type PlayerId,
  type RoleEffectCue,
  type SpectatorView,
} from '@agentwolf/contracts'
import {
  formatCopy,
  getCopy,
  getRoleEffectDefinition,
  pluginEventEffect,
  pluginEventPlayerMarkers,
  pluginEventPlayerIds,
  registeredEventEffect,
  registeredEventPlayerIds,
  registeredTimelineNarration,
  renderEventNarration,
  roleEffectCatalog,
  type NarrationCatalog,
} from '@agentwolf/assets'
import {
  publiclyEliminatedPlayerIds,
  visibleEvents,
  visibleRoleId,
  type BoardManifest,
  type GameState,
  type RoleRegistry,
} from '@agentwolf/game-engine'

export type SessionStatus = MatchView['seats'][number]['sessionStatus']

const sheriffElectionPhases = new Set([
  'phase-sheriff-signup',
  'phase-sheriff-speech',
  'phase-sheriff-withdraw',
  'phase-sheriff-vote',
  'phase-sheriff-runoff-speech',
  'phase-sheriff-runoff-vote',
])

export interface ProjectMatchOptions {
  readonly matchId: MatchId
  readonly board: BoardManifest
  readonly boardName: string
  readonly state: GameState
  readonly events: readonly GameEvent[]
  readonly view: SpectatorView
  readonly roles: RoleRegistry
  readonly agent?: (playerId: PlayerId) => AgentConfigurationSummary | null
  readonly characterForSeat?: (seat: number) => CharacterCardSnapshot | null
  readonly sessionStatus?: (playerId: PlayerId) => SessionStatus
  readonly postgameReview?: PostgameReviewView | null
  readonly activeSpeech?: MatchView['activeSpeech']
}

function localizePausedReason(reason: string | null): string | null {
  if (
    reason === 'server-restarted-session-resume-required' ||
    reason === 'server-restarted-session-not-replayable'
  ) {
    return getCopy('errors.serverRestartedSessionResumeRequired')
  }
  return reason
}

export function projectMatch(options: ProjectMatchOptions): MatchView {
  const projectedEvents = visibleEvents(options.events, options.view, options.state)
  const playerMarkers = projectPlayerMarkers(projectedEvents)
  const phase = projectedPhase(options)
  const publicDead = publiclyEliminatedPlayerIds(options.events)
  const catalog = {
    players: new Map(
      [...options.state.players.values()].map((player) => [
        player.id,
        { playerId: player.id, seat: player.seat, name: player.name },
      ]),
    ),
    roleName: (roleId: NonNullable<ReturnType<typeof visibleRoleId>>) =>
      getCopy(options.roles.role(roleId).displayNameKey),
  }
  const projectedActiveSpeech = projectedEvents.reduce<MatchView['activeSpeech']>(
    (active, event) => {
      if (event.payload.type === 'speech.started') {
        return { playerId: event.payload.playerId, text: '', final: false }
      }
      if (event.payload.type === 'speech.committed') {
        return { playerId: event.payload.playerId, text: event.payload.text, final: true }
      }
      return active
    },
    null,
  )
  const activeSpeech = options.activeSpeech ?? projectedActiveSpeech
  const publiclyRevealedIdiots = new Set(
    options.events
      .filter((event) => event.payload.type === 'idiot.revealed')
      .map((event) => {
        if (event.payload.type !== 'idiot.revealed') throw new Error('Unexpected event')
        return event.payload.playerId
      }),
  )
  const winnerEvent = projectedEvents.findLast((event) => event.payload.type === 'match.ended')

  return MatchViewSchema.parse({
    id: options.matchId,
    boardId: options.board.id,
    boardName: options.boardName,
    status: options.state.status,
    day: options.state.day,
    phaseId: phase.id,
    phaseLabel: phase.label,
    lastSequence: options.state.lastSequence,
    seats: [...options.state.players.values()]
      .sort((left, right) => left.seat - right.seat)
      .map((player) => {
        const roleId = visibleRoleId(player.id, options.view, options.state, options.events)
        const visibleAlive = options.view.kind === 'god' ? player.alive : !publicDead.has(player.id)
        return {
          playerId: player.id,
          seat: player.seat,
          name: player.name,
          agent: options.agent?.(player.id) ?? null,
          alive: visibleAlive,
          canVote:
            options.view.kind === 'god'
              ? player.canVote
              : visibleAlive && !publiclyRevealedIdiots.has(player.id),
          sheriff: options.state.sheriff.holderId === player.id,
          sheriffCandidate:
            sheriffElectionPhases.has(options.state.phaseId ?? '') &&
            options.state.sheriff.standingCandidates.has(player.id),
          active: activeSpeech?.playerId === player.id && !activeSpeech.final,
          markers: playerMarkers.get(player.id) ?? [],
          ...(roleId
            ? {
                roleId,
                roleName: getCopy(options.roles.role(roleId).displayNameKey),
                faction: options.roles.role(roleId).faction,
              }
            : {}),
          character: options.characterForSeat?.(player.seat)
            ? CharacterSummarySchema.parse({
                ...options.characterForSeat(player.seat),
                editable: false,
              })
            : null,
          sessionStatus: visibleSessionStatus(options, player.id, activeSpeech),
        }
      }),
    timeline: [
      ...projectTimeline(projectedEvents, catalog),
      ...(options.postgameReview?.reflections.map((reflection) => ({
        sequence: reflection.speechSequence,
        kind: 'speech.committed',
        title: reflection.text,
        playerIds: [reflection.playerId],
        occurredAt: reflection.occurredAt,
        postgame: true,
      })) ?? []),
    ],
    effectCues: projectRoleEffectCues(projectedEvents),
    activeSpeech,
    winner: winnerEvent?.payload.type === 'match.ended' ? winnerEvent.payload.winner : null,
    winningPlayerIds:
      winnerEvent?.payload.type === 'match.ended'
        ? (winnerEvent.payload.winningPlayerIds ?? options.state.winningPlayerIds)
        : [],
    pausedReason: localizePausedReason(options.state.pausedReason),
    postgameReview: options.postgameReview ?? null,
  })
}

export function projectPlayerMarkers(
  events: readonly GameEvent[],
): ReadonlyMap<PlayerId, readonly PlayerMarkerId[]> {
  const markers = new Map<PlayerId, Set<PlayerMarkerId>>()
  for (const event of events) {
    for (const marker of pluginEventPlayerMarkers(event)) {
      for (const playerId of marker.playerIds) {
        const playerMarkers = markers.get(playerId) ?? new Set<PlayerMarkerId>()
        playerMarkers.add(marker.markerId)
        markers.set(playerId, playerMarkers)
      }
    }
  }
  return new Map([...markers].map(([playerId, markerIds]) => [playerId, [...markerIds]]))
}

function projectedPhase(options: ProjectMatchOptions): {
  readonly id: string
  readonly label: string
} {
  const phaseId = options.state.phaseId
  const node = phaseId ? options.board.phases.nodes.get(phaseId) : null
  const presentation = node?.presentation
  const canSeeExactPhase =
    !presentation ||
    presentation.visibility === 'public' ||
    options.view.kind === 'god' ||
    (presentation.visibility === 'actors' &&
      options.view.kind === 'player' &&
      options.state.phaseActors.includes(options.view.playerId))
  if (canSeeExactPhase) {
    return {
      id: phaseId ?? '',
      label: options.state.phaseLabelKey ? getCopy(options.state.phaseLabelKey) : '',
    }
  }
  return {
    id: presentation.hiddenPhaseId,
    label: getCopy(presentation.hiddenLabelKey),
  }
}

export function projectRoleEffectCues(events: readonly GameEvent[]): RoleEffectCue[] {
  const cues: RoleEffectCue[] = []
  for (const event of events) {
    const payload = event.payload
    const append = (
      effectId: keyof typeof roleEffectCatalog,
      sourcePlayerIds: readonly PlayerId[],
      targetPlayerIds: readonly PlayerId[],
      variant: string | null = null,
    ): void => {
      const definition = getRoleEffectDefinition(effectId)
      cues.push(
        RoleEffectCueSchema.parse({
          cueId: `${event.sequence}:${effectId}`,
          sequence: event.sequence,
          effectId,
          roleId: definition.roleId,
          abilityId: definition.abilityId,
          sourcePlayerIds,
          targetPlayerIds,
          variant,
          tier: definition.tier,
          occurredAt: event.occurredAt,
        }),
      )
    }
    const registeredEffect = registeredEventEffect(event)
    if (registeredEffect) {
      append(
        registeredEffect.effectId,
        registeredEffect.sourcePlayerIds,
        registeredEffect.targetPlayerIds,
        registeredEffect.variant,
      )
      continue
    }
    switch (payload.type) {
      case 'sheriff.elected':
        append('sheriff-elected', [], [payload.playerId])
        break
      case 'sheriff.transferred':
        if (payload.toPlayerId) {
          append('sheriff-transferred', [payload.fromPlayerId], [payload.toPlayerId])
        }
        break
      case 'plugin.event': {
        const effect = pluginEventEffect(event)
        if (effect) {
          append(effect.effectId, effect.sourcePlayerIds, effect.targetPlayerIds, effect.variant)
        }
        break
      }
      default:
        break
    }
  }
  return cues
}

function visibleSessionStatus(
  options: ProjectMatchOptions,
  playerId: PlayerId,
  activeSpeech: MatchView['activeSpeech'],
): SessionStatus {
  if (
    options.state.status === 'ended' &&
    (!options.postgameReview || ['completed', 'skipped'].includes(options.postgameReview.state))
  ) {
    return 'closed'
  }
  const status = options.sessionStatus?.(playerId) ?? 'idle'
  if (options.view.kind === 'god') return status
  if (options.view.kind === 'player' && options.view.playerId === playerId) return status
  if (activeSpeech?.playerId === playerId && !activeSpeech.final) return status
  return 'idle'
}

export function projectTimeline(
  events: readonly GameEvent[],
  catalog: NarrationCatalog,
): TimelineItem[] {
  const items: TimelineItem[] = []
  const ballots = new Map<string, Extract<GameEvent['payload'], { type: 'vote.cast' }>[]>()
  for (const event of events) {
    const payload = event.payload
    if (payload.type === 'vote.cast') {
      const group = ballots.get(payload.kind) ?? []
      group.push(payload)
      ballots.set(payload.kind, group)
      continue
    }
    if (payload.type === 'vote.resolved') {
      const voteBallots = ballots.get(payload.kind) ?? []
      ballots.delete(payload.kind)
      const totalEntries = Object.entries(payload.totals)
        .map(([playerId, total]) => ({ playerId: playerId as PlayerId, total }))
        .sort(
          (left, right) => right.total - left.total || left.playerId.localeCompare(right.playerId),
        )
      const maximum = totalEntries[0]?.total ?? 0
      const noTargetTotal = voteBallots
        .filter((ballot) => ballot.targetId === null)
        .reduce((total, ballot) => total + ballot.weight, 0)
      const wolfKill = payload.kind === 'wolf-kill'
      const wolfTie =
        wolfKill &&
        payload.selectedPlayerId !== null &&
        (payload.tiedPlayerIds.length > 1 || (maximum > 0 && noTargetTotal === maximum))
      const wolfTieContenders = [
        ...payload.tiedPlayerIds.map((playerId) => timelineSeatLabel(playerId, catalog)),
        ...(maximum > 0 && noTargetTotal === maximum ? [getCopy('timeline.wolfNoKillLabel')] : []),
      ]
      const title = wolfKill
        ? payload.selectedPlayerId
          ? formatCopy(
              getCopy(wolfTie ? 'timeline.wolfVoteTiedSelected' : 'timeline.wolfVoteSelected'),
              {
                player: timelineSeatLabel(payload.selectedPlayerId, catalog),
                players: wolfTieContenders.join(getCopy('narration.listJoiner')),
                count: maximum,
              },
            )
          : formatCopy(getCopy('timeline.wolfVoteNoKill'), { count: noTargetTotal })
        : payload.selectedPlayerId
          ? formatCopy(getCopy('timeline.voteSelected'), {
              player: timelineSeatLabel(payload.selectedPlayerId, catalog),
              count: maximum,
            })
          : payload.tiedPlayerIds.length > 1
            ? formatCopy(getCopy('timeline.voteTied'), {
                players: payload.tiedPlayerIds
                  .map((playerId) => timelineSeatLabel(playerId, catalog))
                  .join(getCopy('narration.listJoiner')),
                count: maximum,
              })
            : getCopy('timeline.voteNone')
      const ballotLines = totalEntries
        .map(({ playerId }) => {
          const voters = voteBallots
            .filter((ballot) => ballot.targetId === playerId)
            .sort(
              (left, right) =>
                playerSeat(left.voterId, catalog) - playerSeat(right.voterId, catalog),
            )
            .map((ballot) => voteVoterLabel(ballot, catalog))
          return voters.length > 0
            ? formatCopy(getCopy('timeline.voteGroup'), {
                target: timelineSeatLabel(playerId, catalog),
                voters: voters.join(getCopy('narration.listJoiner')),
              })
            : null
        })
        .filter((line): line is string => Boolean(line))
      const abstainers = voteBallots
        .filter((ballot) => ballot.targetId === null)
        .sort(
          (left, right) => playerSeat(left.voterId, catalog) - playerSeat(right.voterId, catalog),
        )
        .map((ballot) => voteVoterLabel(ballot, catalog))
      if (abstainers.length > 0) {
        ballotLines.push(
          formatCopy(getCopy(wolfKill ? 'timeline.wolfNoKillGroup' : 'timeline.voteAbstainGroup'), {
            voters: abstainers.join(getCopy('narration.listJoiner')),
          }),
        )
      }
      const votePlayerIds = uniquePlayerIds([
        ...voteBallots.flatMap((ballot) => [
          ballot.voterId,
          ...(ballot.targetId ? [ballot.targetId] : []),
        ]),
        ...payload.tiedPlayerIds,
      ]).filter((playerId) => playerId !== payload.selectedPlayerId)
      if (payload.selectedPlayerId) votePlayerIds.push(payload.selectedPlayerId)
      items.push({
        sequence: event.sequence,
        kind: payload.type,
        title,
        ...(ballotLines.length > 0 ? { detail: ballotLines.join('\n') } : {}),
        playerIds: votePlayerIds,
        occurredAt: event.occurredAt,
        postgame: false,
      })
      continue
    }
    const text = timelineNarration(event, catalog)
    if (!text) continue
    items.push({
      sequence: event.sequence,
      kind: payload.type,
      title: text,
      playerIds: playerIdsForEvent(event),
      occurredAt: event.occurredAt,
      postgame: false,
    })
  }
  return items
}

function timelineNarration(event: GameEvent, catalog: NarrationCatalog): string | null {
  const payload = event.payload
  const registered = registeredTimelineNarration(event, catalog)
  if (registered) return registered
  switch (payload.type) {
    case 'speech.committed':
      return payload.text
    case 'player.saved':
      return formatCopy(getCopy('timeline.playerSaved'), {
        player: timelinePlayerLabel(payload.playerId, catalog),
      })
    case 'death.pending':
      return formatCopy(getCopy('timeline.deathPending'), {
        player: timelinePlayerLabel(payload.playerId, catalog),
      })
    default:
      return renderEventNarration(event, catalog)
  }
}

function timelinePlayerLabel(playerId: PlayerId, catalog: NarrationCatalog): string {
  const player = catalog.players.get(playerId)
  if (!player) return playerId
  return formatCopy(getCopy('narration.playerLabel'), { seat: player.seat, name: player.name })
}

function timelineSeatLabel(playerId: PlayerId, catalog: NarrationCatalog): string {
  const player = catalog.players.get(playerId)
  if (!player) return playerId
  return formatCopy(getCopy('timeline.seatLabel'), { seat: player.seat })
}

function playerSeat(playerId: PlayerId, catalog: NarrationCatalog): number {
  return catalog.players.get(playerId)?.seat ?? Number.MAX_SAFE_INTEGER
}

function voteVoterLabel(
  ballot: Extract<GameEvent['payload'], { type: 'vote.cast' }>,
  catalog: NarrationCatalog,
): string {
  const voter = timelineSeatLabel(ballot.voterId, catalog)
  return ballot.weight === 1
    ? voter
    : formatCopy(getCopy('timeline.voteWeightedVoter'), { voter, weight: ballot.weight })
}

function uniquePlayerIds(playerIds: readonly PlayerId[]): PlayerId[] {
  return [...new Set(playerIds)]
}

function playerIdsForEvent(event: GameEvent): PlayerId[] {
  const payload = event.payload
  const registered = registeredEventPlayerIds(event)
  if (registered) return registered
  switch (payload.type) {
    case 'role.assigned':
    case 'speech.started':
    case 'speech.committed':
    case 'speech.sanitized':
    case 'sheriff.candidacy':
    case 'sheriff.elected':
    case 'player.saved':
    case 'role.revealed':
    case 'ability.used':
    case 'capability.granted':
    case 'capability.revoked':
      return [payload.playerId]
    case 'faction.members':
    case 'phase.actors-set':
    case 'speech.order-set':
    case 'public.announcement':
    case 'players.eliminated-publicly':
      return [...payload.playerIds]
    case 'phase.actor-completed':
      return [payload.playerId]
    case 'action.submitted':
      return [payload.playerId]
    case 'sheriff.transferred':
      return [payload.fromPlayerId, ...(payload.toPlayerId ? [payload.toPlayerId] : [])]
    case 'vote.cast':
      return [payload.voterId, ...(payload.targetId ? [payload.targetId] : [])]
    case 'vote.resolved':
      return [
        ...payload.tiedPlayerIds,
        ...(payload.selectedPlayerId ? [payload.selectedPlayerId] : []),
      ]
    case 'night.attack-selected':
      return payload.targetId ? [payload.targetId] : []
    case 'death.pending':
    case 'death.cancelled':
    case 'exile.prevented':
    case 'player.died':
      return [payload.playerId]
    case 'delivery.started':
    case 'delivery.acknowledged':
      return [payload.playerId]
    case 'match.paused':
      return payload.playerId ? [payload.playerId] : []
    case 'match.created':
      return payload.players.map((player) => player.playerId)
    case 'match.started':
    case 'match.starting':
    case 'night.started':
    case 'day.started':
    case 'phase.changed':
    case 'sheriff.badge-lost':
    case 'death.window-closed':
    case 'day.interrupted':
    case 'day.completed':
    case 'match.resumed':
      return []
    case 'match.ended':
      return payload.winningPlayerIds ?? []
    case 'plugin.event':
      return pluginEventPlayerIds(event)
    default:
      return []
  }
}
