import type {
  AbilityId,
  AgentProfileId,
  BoardId,
  EventSequence,
  Faction,
  GameEvent,
  MatchId,
  PhaseId,
  PlayerAction,
  PlayerId,
  RoleId,
} from '@agentwolf/contracts'

export interface RoleSlot {
  readonly roleId: RoleId
  readonly count: number
}

export interface BoardPolicies {
  readonly witchSelfSave: 'never' | 'first-night' | 'always'
  readonly witchPotionsPerNight: 1 | 2
  readonly guardAntidoteCollision: 'death' | 'survive'
  readonly guardCanSelfProtect: boolean
  readonly sheriffExplosion: 'single-explosion-loses-badge' | 'double-explosion-loses-badge'
  readonly nightLastWords: 'first-night-only' | 'every-night' | 'none'
  readonly victory: 'slaughter-edge' | 'slaughter-all'
}

export interface PhaseEdge {
  readonly to: PhaseId
  readonly when?: string
}

export type PhaseMode = 'automatic' | 'parallel' | 'sequential'

export interface PhaseNode {
  readonly id: PhaseId
  readonly labelKey: string
  readonly mode: PhaseMode
  readonly actionType?: PlayerAction['type']
  readonly abilityId?: AbilityId
  readonly actorSelector?: string
  readonly activeWhen?: string
  readonly edges: readonly PhaseEdge[]
}

export interface PhaseGraph {
  readonly id: string
  readonly entry: PhaseId
  readonly nodes: ReadonlyMap<PhaseId, PhaseNode>
}

export interface BoardManifest {
  readonly id: BoardId
  readonly playerCount: number
  readonly roles: readonly RoleSlot[]
  readonly sheriff: boolean
  readonly policies: BoardPolicies
  readonly phases: PhaseGraph
}

export interface PlayerRoleState {
  readonly abilityUses: Readonly<Record<string, number>>
  readonly memory: Readonly<Record<string, string | number | boolean | null>>
}

export interface PlayerState {
  readonly id: PlayerId
  readonly seat: number
  readonly name: string
  readonly profileId: AgentProfileId
  readonly roleId: RoleId | null
  readonly faction: Faction | null
  readonly alive: boolean
  readonly canVote: boolean
  readonly roleState: PlayerRoleState
}

export interface SheriffState {
  readonly enabled: boolean
  readonly holderId: PlayerId | null
  readonly badgeLost: boolean
  readonly initialCandidates: ReadonlySet<PlayerId>
  readonly standingCandidates: ReadonlySet<PlayerId>
}

export interface PendingDeath {
  readonly playerId: PlayerId
  readonly causes: readonly string[]
}

export interface GameState {
  readonly matchId: MatchId
  readonly boardId: BoardId
  readonly status: 'draft' | 'starting' | 'running' | 'paused' | 'ended'
  readonly day: number
  readonly night: number
  readonly phaseId: PhaseId | null
  readonly phaseLabelKey: string
  readonly players: ReadonlyMap<PlayerId, PlayerState>
  readonly sheriff: SheriffState
  readonly pendingDeaths: ReadonlyMap<PlayerId, PendingDeath>
  readonly recentDeaths: ReadonlyMap<PlayerId, PendingDeath>
  readonly phaseActions: readonly PlayerAction[]
  readonly phaseActors: readonly PlayerId[]
  readonly completedActors: ReadonlySet<PlayerId>
  readonly speechOrder: readonly PlayerId[]
  readonly lastVote: {
    readonly kind: string
    readonly selectedPlayerId: PlayerId | null
    readonly tiedPlayerIds: readonly PlayerId[]
    readonly totals: Readonly<Record<string, number>>
  } | null
  readonly nightAttackTargetId: PlayerId | null
  readonly interruptToNight: boolean
  readonly lastSequence: EventSequence
  readonly winner: Faction | null
  readonly pausedReason: string | null
}

export interface GameSnapshot {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

export interface ActionValidationContext {
  readonly state: GameState
  readonly board: BoardManifest
  readonly action: PlayerAction
  readonly actor: PlayerState
}

export interface TargetEffect {
  readonly kind: 'target-map'
  readonly priority: 100
  readonly sourceId: PlayerId
  readonly fromTargetId: PlayerId
  readonly toTargetId: PlayerId
}

export interface ProtectEffect {
  readonly kind: 'protect'
  readonly priority: 300
  readonly sourceId: PlayerId
  readonly targetId: PlayerId
  readonly protection: 'guard' | 'antidote'
}

export interface DamageEffect {
  readonly kind: 'damage'
  readonly priority: 400 | 700
  readonly sourceId: PlayerId | null
  readonly targetId: PlayerId
  readonly cause: 'werewolf' | 'poison' | 'shot' | 'exile' | 'self-destruct' | 'linked'
}

export interface InspectEffect {
  readonly kind: 'inspect'
  readonly priority: 500
  readonly sourceId: PlayerId
  readonly targetId: PlayerId
}

export interface PreventDeathEffect {
  readonly kind: 'prevent-death'
  readonly priority: 600
  readonly sourceId: PlayerId
  readonly targetId: PlayerId
  readonly cause: 'exile'
  readonly reason: string
}

export type ResolutionEffect =
  | TargetEffect
  | ProtectEffect
  | DamageEffect
  | InspectEffect
  | PreventDeathEffect

export interface ResolvedInspection {
  readonly sourceId: PlayerId
  readonly targetId: PlayerId
  readonly result: 'village' | 'werewolf'
}

export interface ResolutionResult {
  readonly pendingDeaths: readonly PendingDeath[]
  readonly savedPlayerIds: readonly PlayerId[]
  readonly inspections: readonly ResolvedInspection[]
  readonly consumedAbilityIds: readonly { playerId: PlayerId; abilityId: AbilityId }[]
}
