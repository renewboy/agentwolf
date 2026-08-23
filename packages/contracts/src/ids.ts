import { z } from 'zod'

export type Brand<Value, Name extends string> = Value & { readonly __brand: Name }

export const PlayerIdSchema = z
  .string()
  .regex(/^player-[1-9]\d*$/, 'Player ID must use the readable player-N format')
  .transform((value) => value as PlayerId)
export type PlayerId = Brand<string, 'PlayerId'>

export const MatchIdSchema = z
  .string()
  .regex(/^match-[a-z0-9][a-z0-9-]{5,63}$/)
  .transform((value) => value as MatchId)
export type MatchId = Brand<string, 'MatchId'>

export const AgentToolIdSchema = z
  .string()
  .regex(/^tool-[a-z0-9][a-z0-9-]{1,63}$/)
  .transform((value) => value as AgentToolId)
export type AgentToolId = Brand<string, 'AgentToolId'>

export const AgentProfileIdSchema = z
  .string()
  .regex(/^profile-[a-z0-9][a-z0-9-]{1,63}$/)
  .transform((value) => value as AgentProfileId)
export type AgentProfileId = Brand<string, 'AgentProfileId'>

export const BoardIdSchema = z
  .string()
  .regex(/^board-[a-z0-9][a-z0-9-]{1,63}$/)
  .transform((value) => value as BoardId)
export type BoardId = Brand<string, 'BoardId'>

export const RoleIdSchema = z
  .string()
  .regex(/^role-[a-z0-9][a-z0-9-]{1,63}$/)
  .transform((value) => value as RoleId)
export type RoleId = Brand<string, 'RoleId'>

export const AbilityIdSchema = z
  .string()
  .regex(/^ability-[a-z0-9][a-z0-9-]{1,63}$/)
  .transform((value) => value as AbilityId)
export type AbilityId = Brand<string, 'AbilityId'>

export const PhaseIdSchema = z
  .string()
  .regex(/^phase-[a-z0-9][a-z0-9-]{1,95}$/)
  .transform((value) => value as PhaseId)
export type PhaseId = Brand<string, 'PhaseId'>

export const EventSequenceSchema = z.number().int().positive()
export type EventSequence = number

export const SimulationIdSchema = z
  .string()
  .regex(/^simulation-[a-z0-9][a-z0-9-]{5,95}$/)
  .transform((value) => value as SimulationId)
export type SimulationId = Brand<string, 'SimulationId'>

export function playerIdForSeat(seat: number): PlayerId {
  return PlayerIdSchema.parse(`player-${seat}`)
}
