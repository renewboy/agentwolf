import type {
  AbilityId,
  AgentProfileId,
  BoardId,
  CapabilityId,
  EventSequence,
  Faction,
  GameEvent,
  MatchId,
  PhaseId,
  PlayerAction,
  PlayerId,
  RoleId,
  JsonValue,
  PluginId,
} from '@agentwolf/contracts'
import type { RoleRegistry } from './roles/registry.js'

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

export type PhasePresentation =
  | { readonly visibility: 'public' }
  | {
      readonly visibility: 'actors' | 'god'
      readonly hiddenPhaseId: PhaseId
      readonly hiddenLabelKey: string
    }

export type PhaseActionVisibility =
  | 'public'
  | 'actor'
  | 'actors'
  | { readonly kind: 'faction'; readonly faction: Faction }

export type PhaseActionDefinition =
  | {
      readonly type: 'speech'
      readonly kind: Extract<PlayerAction, { type: 'speech' }>['kind']
      readonly visibility: PhaseActionVisibility
    }
  | {
      readonly type: 'vote'
      readonly kind: Extract<PlayerAction, { type: 'vote' }>['kind']
      readonly visibility: PhaseActionVisibility
      readonly abilityId?: AbilityId
    }
  | {
      readonly type: 'night-action'
      readonly abilityIds: readonly AbilityId[]
      readonly capabilityIds?: readonly CapabilityId[]
      readonly visibility: PhaseActionVisibility
    }
  | {
      readonly type: 'sheriff-action'
      readonly actions: readonly Extract<PlayerAction, { type: 'sheriff-action' }>['action'][]
      readonly visibility: PhaseActionVisibility
    }
  | {
      readonly type: 'skill-trigger'
      readonly abilityIds: readonly AbilityId[]
      readonly capabilityIds?: readonly CapabilityId[]
      readonly abilitySource?: 'decision-trigger'
      readonly triggerSignal?: string
      readonly validation: 'role-ability'
      readonly visibility: PhaseActionVisibility
    }

export interface PhaseInterruptDefinition {
  readonly handlerId: string
  readonly capabilityIds: readonly CapabilityId[]
  readonly context: 'sheriff-election' | 'daytime'
  readonly visibility: PhaseActionVisibility
}

export interface PhaseNode {
  readonly id: PhaseId
  readonly labelKey: string
  readonly mode: PhaseMode
  readonly presentation?: PhasePresentation
  readonly action?: PhaseActionDefinition
  readonly interrupts?: readonly PhaseInterruptDefinition[]
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
  readonly capabilities: ReadonlySet<CapabilityId>
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
  readonly pluginState: ReadonlyMap<PluginId, JsonValue>
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
  readonly preventedExilePlayerId: PlayerId | null
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
  readonly roles: RoleRegistry
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

export type DamageCause =
  | 'werewolf'
  | 'poison'
  | 'shot'
  | 'exile'
  | 'self-destruct'
  | 'white-wolf-detonate'
  | 'linked'

export interface ProtectEffect {
  readonly kind: 'protect'
  readonly priority: 300
  readonly sourceId: PlayerId
  readonly targetId: PlayerId
  readonly protection: string
  readonly blocks: readonly DamageCause[]
}

export interface DamageEffect {
  readonly kind: 'damage'
  readonly priority: 400 | 700
  readonly sourceId: PlayerId | null
  readonly targetId: PlayerId
  readonly ignoredProtections?: readonly string[] | undefined
  readonly cause: DamageCause
}

export interface InspectEffect {
  readonly kind: 'inspect'
  readonly priority: 500
  readonly sourceId: PlayerId
  readonly targetId: PlayerId
}

export interface ExactInspectEffect {
  readonly kind: 'inspect-role'
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

export type KnownResolutionEffect =
  | TargetEffect
  | ProtectEffect
  | DamageEffect
  | InspectEffect
  | ExactInspectEffect
  | PreventDeathEffect

export interface ExtensibleResolutionEffect {
  readonly kind: string
  readonly priority: number
}

export type ResolutionEffect = KnownResolutionEffect | ExtensibleResolutionEffect

export interface ResolvedInspection {
  readonly sourceId: PlayerId
  readonly targetId: PlayerId
  readonly result: 'village' | 'werewolf'
}

export interface ResolvedExactInspection {
  readonly sourceId: PlayerId
  readonly targetId: PlayerId
  readonly roleId: RoleId
}

export interface ResolutionResult {
  readonly pendingDeaths: readonly PendingDeath[]
  readonly savedPlayerIds: readonly PlayerId[]
  readonly inspections: readonly ResolvedInspection[]
  readonly exactInspections: readonly ResolvedExactInspection[]
  readonly consumedAbilityIds: readonly { playerId: PlayerId; abilityId: AbilityId }[]
}
