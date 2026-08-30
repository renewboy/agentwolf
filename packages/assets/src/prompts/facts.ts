import { z } from 'zod'
import {
  AbilityIdSchema,
  CharacterCardSnapshotSchema,
  FactionSchema,
  GameEventSchema,
  PhaseIdSchema,
  PlayerIdSchema,
  RoleIdSchema,
  SheriffActionKindSchema,
} from '@agentwolf/contracts'

export const PromptPlayerFactSchema = z
  .object({
    playerId: PlayerIdSchema,
    seat: z.number().int().positive(),
    name: z.string().min(1),
    alive: z.boolean(),
    roleId: RoleIdSchema.nullable().optional(),
  })
  .strict()
export type PromptPlayerFact = z.infer<typeof PromptPlayerFactSchema>

export const PromptActorFactSchema = PromptPlayerFactSchema.extend({
  roleId: RoleIdSchema,
  faction: FactionSchema,
  abilityUses: z.record(z.string(), z.number().int().nonnegative()),
}).strict()
export type PromptActorFact = z.infer<typeof PromptActorFactSchema>

const PromptBoardPoliciesSchema = z
  .object({
    witchSelfSave: z.enum(['never', 'first-night', 'always']),
    witchPotionsPerNight: z.union([z.literal(1), z.literal(2)]),
    guardAntidoteCollision: z.enum(['death', 'survive']),
    guardCanSelfProtect: z.boolean(),
    sheriffExplosion: z.enum(['single-explosion-loses-badge', 'double-explosion-loses-badge']),
    nightLastWords: z.enum(['first-night-only', 'every-night', 'none']),
    victory: z.enum(['slaughter-edge', 'slaughter-all']),
  })
  .strict()

export const PromptBoardFactSchema = z
  .object({
    roles: z.array(
      z
        .object({
          roleId: RoleIdSchema,
          faction: FactionSchema,
          count: z.number().int().positive(),
        })
        .strict(),
    ),
    nightActionOrder: z
      .array(
        z
          .object({
            phaseId: PhaseIdSchema,
            firstNightOnly: z.boolean(),
          })
          .strict(),
      )
      .default([]),
    sheriff: z.boolean(),
    policies: PromptBoardPoliciesSchema,
  })
  .strict()
export type PromptBoardFact = z.infer<typeof PromptBoardFactSchema>

export const PromptGameFactSchema = z
  .object({
    day: z.number().int().nonnegative(),
    night: z.number().int().nonnegative(),
    status: z.enum(['draft', 'starting', 'running', 'paused', 'ended']),
    pausedReason: z.string().nullable(),
  })
  .strict()
export type PromptGameFact = z.infer<typeof PromptGameFactSchema>

export const FoundationPromptFactsSchema = z
  .object({
    actor: PromptActorFactSchema,
    roster: z.array(PromptPlayerFactSchema).min(1),
    board: PromptBoardFactSchema,
    game: PromptGameFactSchema,
    events: z.array(GameEventSchema),
    character: CharacterCardSnapshotSchema.nullable(),
  })
  .strict()
export type FoundationPromptFacts = z.infer<typeof FoundationPromptFactsSchema>

export const PromptTurnFactSchema = z
  .object({
    phaseId: PhaseIdSchema,
    actionType: z.enum(['speech', 'vote', 'night-action', 'sheriff-action', 'skill-trigger']),
    speechKind: z.string().optional(),
    voteKind: z.string().optional(),
    abilityId: AbilityIdSchema.optional(),
    allowedAbilityIds: z.array(AbilityIdSchema).default([]),
    passAllowed: z.boolean().default(true),
    interruptAbilityIds: z.array(AbilityIdSchema).default([]),
    interruptWindow: z.boolean().default(false),
    sheriffActions: z.array(SheriffActionKindSchema).default([]),
  })
  .strict()
export type PromptTurnFact = z.infer<typeof PromptTurnFactSchema>

export const TurnPromptFactsSchema = z
  .object({
    actor: PromptActorFactSchema,
    roster: z.array(PromptPlayerFactSchema).min(1),
    board: PromptBoardFactSchema,
    game: PromptGameFactSchema,
    events: z.array(GameEventSchema),
    turn: PromptTurnFactSchema,
    speechCharacterLimit: z.number().int().positive(),
    continuation: z.boolean(),
  })
  .strict()
export type TurnPromptFacts = z.infer<typeof TurnPromptFactsSchema>
