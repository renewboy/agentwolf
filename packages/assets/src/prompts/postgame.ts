import { join } from 'node:path'
import { z } from 'zod'
import {
  PlayerIdSchema,
  PluginIdSchema,
  PostgamePlayerResultSchema,
  type PostgameReflection,
  type PostgameReviewResult,
} from '@agentwolf/contracts'
import {
  loadPromptBundle,
  precompilePromptTemplates,
  promptEnvironment,
  resolvePromptRoot,
  resolvePromptTemplate,
  validatePromptBundleGraph,
} from './loader.js'
import type { LoadPromptBundlesOptions } from './runtime.js'

const featureId = PluginIdSchema.parse('plugin-feature-postgame-review')

const PromptRosterPlayerSchema = z
  .object({
    playerId: PlayerIdSchema,
    seat: z.number().int().positive(),
    name: z.string().min(1),
    roleLabel: z.string().min(1),
    factionLabel: z.string().min(1),
  })
  .strict()

const PostgameReviewPromptFactsSchema = z
  .object({
    reviewerId: PlayerIdSchema,
    terminalDay: z.number().int().nonnegative(),
    terminalNight: z.number().int().nonnegative(),
    winnerLabel: z.string().min(1),
    publicHistory: z.array(z.string().min(1)),
    roster: z.array(PromptRosterPlayerSchema).min(2).max(24),
    mvpCandidateIds: z.array(PlayerIdSchema).min(1).max(24),
    svpCandidateIds: z.array(PlayerIdSchema).min(1).max(24),
    ratingTargetIds: z.array(PlayerIdSchema).min(1).max(23),
  })
  .strict()
export type PostgameReviewPromptFacts = z.infer<typeof PostgameReviewPromptFactsSchema>

const PostgameReflectionPromptFactsSchema = z
  .object({
    playerId: PlayerIdSchema,
    roster: z.array(PromptRosterPlayerSchema).min(2).max(24),
    mvpPlayerId: PlayerIdSchema,
    svpPlayerId: PlayerIdSchema,
    ownResult: PostgamePlayerResultSchema,
    priorReflections: z.array(
      z.object({ playerId: PlayerIdSchema, text: z.string().min(1) }).strict(),
    ),
    speechCharacterLimit: z.number().int().positive(),
  })
  .strict()
export type PostgameReflectionPromptFacts = z.infer<typeof PostgameReflectionPromptFactsSchema>

export class PostgamePromptAssets {
  readonly #environment: ReturnType<typeof promptEnvironment>

  public constructor(options: LoadPromptBundlesOptions = {}) {
    const root = resolvePromptRoot(options.root)
    const bundle = loadPromptBundle(featureId, join(root, 'bundles', featureId))
    validatePromptBundleGraph([bundle])
    this.#environment = promptEnvironment([bundle])
    precompilePromptTemplates(this.#environment, [bundle])
  }

  public review(facts: PostgameReviewPromptFacts): string {
    const parsed = PostgameReviewPromptFactsSchema.parse(facts)
    return this.#render('review-turn.njk', { ...parsed, helpers: promptHelpers(parsed.roster) })
  }

  public reviewContinuation(): string {
    return this.#render('review-continuation.njk', {})
  }

  public reflection(facts: PostgameReflectionPromptFacts): string {
    const parsed = PostgameReflectionPromptFactsSchema.parse(facts)
    return this.#render('reflection-turn.njk', {
      ...parsed,
      helpers: promptHelpers(parsed.roster),
    })
  }

  public reflectionContinuation(): string {
    return this.#render('reflection-continuation.njk', {})
  }

  #render(template: string, facts: object): string {
    return this.#environment.render(resolvePromptTemplate(featureId, template), facts).trim()
  }
}

function promptHelpers(roster: z.infer<typeof PromptRosterPlayerSchema>[]) {
  const players = new Map(roster.map((player) => [player.playerId, player]))
  return {
    player: (playerId: z.infer<typeof PlayerIdSchema>) => {
      const player = players.get(playerId)
      if (!player) throw new Error(`Unknown postgame Prompt player ${playerId}`)
      return `${player.seat} 号 ${player.name}（${player.playerId}）`
    },
  }
}

export function postgameResultFor(
  result: PostgameReviewResult,
  playerId: PostgameReflection['playerId'],
) {
  const player = result.players.find((entry) => entry.playerId === playerId)
  if (!player) throw new Error(`Postgame result has no player ${playerId}`)
  return player
}
