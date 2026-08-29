import {
  BoardIdSchema,
  BoardSummarySchema,
  CustomBoardInputSchema,
  CustomBoardSchema,
  MatchBoardSnapshotSchema,
  RoleSummarySchema,
  type BoardId,
  type BoardSummary,
  type CustomBoard,
  type CustomBoardInput,
  type MatchBoardSnapshot,
  type RoleSummary,
} from '@agentwolf/contracts'
import { getCopy } from '@agentwolf/assets'
import {
  RuleViolation,
  boardManifestFromSnapshot,
  classicBoardPolicyDefaults,
  cupidBoard,
  guardBoard,
  mirrorHiddenBoard,
  ninePlayerBoard,
  sixPlayerBoard,
  standardBoard,
  whiteWolfKingBoard,
  type BoardManifest,
} from '@agentwolf/game-engine'
import { createReadableId } from './ids.js'
import type { SqliteRepository } from './repository.js'
import type { CharacterCatalogService } from './character-catalog.js'
import { RulesetCatalog } from './ruleset-catalog.js'

interface BuiltInBoardDefinition {
  readonly manifest: BoardManifest
  readonly nameKey: string
  readonly descriptionKey: string
}

const builtInBoards: readonly BuiltInBoardDefinition[] = [
  {
    manifest: sixPlayerBoard,
    nameKey: 'boards.quick6.name',
    descriptionKey: 'boards.quick6.description',
  },
  {
    manifest: ninePlayerBoard,
    nameKey: 'boards.standard9.name',
    descriptionKey: 'boards.standard9.description',
  },
  {
    manifest: standardBoard,
    nameKey: 'boards.standard12.name',
    descriptionKey: 'boards.standard12.description',
  },
  {
    manifest: guardBoard,
    nameKey: 'boards.guard12.name',
    descriptionKey: 'boards.guard12.description',
  },
  {
    manifest: cupidBoard,
    nameKey: 'boards.cupid12.name',
    descriptionKey: 'boards.cupid12.description',
  },
  {
    manifest: mirrorHiddenBoard,
    nameKey: 'boards.mirrorHidden10.name',
    descriptionKey: 'boards.mirrorHidden10.description',
  },
  {
    manifest: whiteWolfKingBoard,
    nameKey: 'boards.whiteWolfKing12.name',
    descriptionKey: 'boards.whiteWolfKing12.description',
  },
]

export interface ResolvedBoard {
  readonly manifest: BoardManifest
  readonly summary: BoardSummary
  readonly snapshot: MatchBoardSnapshot
}

export class BoardCatalogService {
  readonly #repository: SqliteRepository
  readonly #characters: CharacterCatalogService | null
  readonly #rulesets: RulesetCatalog

  public constructor(
    repository: SqliteRepository,
    characters: CharacterCatalogService | null = null,
    rulesets: RulesetCatalog = new RulesetCatalog(),
  ) {
    this.#repository = repository
    this.#characters = characters
    this.#rulesets = rulesets
  }

  public listBoards(): BoardSummary[] {
    return [
      ...builtInBoards.map((definition) => this.#builtInSummary(definition)),
      ...this.#repository.listCustomBoards().map((board) => this.#customSummary(board)),
    ]
  }

  public listRoles(): RoleSummary[] {
    return this.#roles()
      .list()
      .map((role) =>
        RoleSummarySchema.parse({
          id: role.id,
          name: getCopy(role.displayNameKey),
          faction: role.faction,
          kind: role.kind,
        }),
      )
  }

  public resolve(id: BoardId): ResolvedBoard {
    const summary = this.listBoards().find((board) => board.id === id)
    if (!summary) throw new RuleViolation(`Unknown board ${id}`)
    const snapshot = this.#snapshot(summary)
    return { summary, snapshot, manifest: boardManifestFromSnapshot(snapshot) }
  }

  public resolveSnapshot(snapshot: MatchBoardSnapshot): ResolvedBoard {
    const parsed = MatchBoardSnapshotSchema.parse(snapshot)
    this.#rulesets.forSnapshot(parsed)
    const summary = BoardSummarySchema.parse({
      ...parsed,
      roles: parsed.roles.map((slot) => ({
        ...slot,
        name: getCopy(this.#roles().role(slot.roleId).displayNameKey),
      })),
      editable: false,
    })
    return { summary, snapshot: parsed, manifest: boardManifestFromSnapshot(parsed) }
  }

  public rulesetForSnapshot(snapshot: MatchBoardSnapshot) {
    return this.#rulesets.forSnapshot(snapshot)
  }

  public create(input: CustomBoardInput): BoardSummary {
    const parsed = this.#validateInput(input)
    const timestamp = new Date().toISOString()
    const board = CustomBoardSchema.parse({
      ...parsed,
      id: BoardIdSchema.parse(createReadableId('board', parsed.name)),
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    this.#repository.saveCustomBoard(board)
    return this.#customSummary(board)
  }

  public update(id: BoardId, input: CustomBoardInput): BoardSummary {
    const current = this.#repository.getCustomBoard(id)
    if (!current) {
      if (builtInBoards.some((definition) => definition.manifest.id === id)) {
        throw new RuleViolation('Built-in boards are read-only')
      }
      throw new RuleViolation(`Unknown board ${id}`)
    }
    const parsed = this.#validateInput(input)
    const board = CustomBoardSchema.parse({
      ...parsed,
      id,
      revision: current.revision + 1,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    })
    this.#repository.saveCustomBoard(board)
    return this.#customSummary(board)
  }

  public delete(id: BoardId): void {
    if (builtInBoards.some((definition) => definition.manifest.id === id)) {
      throw new RuleViolation('Built-in boards are read-only')
    }
    if (!this.#repository.deleteCustomBoard(id)) throw new RuleViolation(`Unknown board ${id}`)
  }

  public backfillMatchSnapshots(): void {
    for (const record of this.#repository.listMatches()) {
      if (record.boardSnapshot) continue
      this.#repository.updateMatchBoardSnapshot(record.id, this.resolve(record.boardId).snapshot)
    }
  }

  #validateInput(input: CustomBoardInput): CustomBoardInput {
    const parsed = CustomBoardInputSchema.parse(input)
    const roleIds = parsed.roles.map((role) => role.roleId)
    if (new Set(roleIds).size !== roleIds.length) {
      throw new RuleViolation('Board role entries must be unique')
    }
    const count = parsed.roles.reduce((total, role) => total + role.count, 0)
    if (count < 6 || count > 24) throw new RuleViolation('Board requires between 6 and 24 players')
    this.#validateCharacters(parsed.characters, count)
    this.#validateAgentProfiles(parsed.agentProfiles, count)

    const resolved = parsed.roles.map((slot) => ({
      slot,
      role: this.#roles().role(slot.roleId),
    }))
    for (const { slot, role } of resolved) {
      if (role.maximumCount !== undefined && slot.count > role.maximumCount) {
        throw new RuleViolation(`${role.id} allows at most ${role.maximumCount} per board`)
      }
    }
    const werewolves = resolved
      .filter(({ role }) => role.faction === 'werewolf')
      .reduce((total, { slot }) => total + slot.count, 0)
    if (werewolves === 0 || werewolves === count) {
      throw new RuleViolation('Board requires at least one Werewolf and one non-Werewolf')
    }
    if (parsed.victory === 'slaughter-edge') {
      const villagers = resolved
        .filter(({ role }) => role.faction === 'village' && role.kind === 'villager')
        .reduce((total, { slot }) => total + slot.count, 0)
      const gods = resolved
        .filter(({ role }) => role.faction === 'village' && role.kind === 'god')
        .reduce((total, { slot }) => total + slot.count, 0)
      if (villagers === 0 || gods === 0) {
        throw new RuleViolation('Slaughter-edge boards require both Villagers and village gods')
      }
    }
    return parsed
  }

  #builtInSummary(definition: BuiltInBoardDefinition): BoardSummary {
    return this.#summary({
      id: definition.manifest.id,
      name: getCopy(definition.nameKey),
      description: getCopy(definition.descriptionKey),
      roles: definition.manifest.roles,
      characters: [],
      agentProfiles: [],
      sheriff: definition.manifest.sheriff,
      victory: definition.manifest.policies.victory,
      revision: 1,
      source: 'built-in',
      editable: false,
    })
  }

  #customSummary(board: CustomBoard): BoardSummary {
    return this.#summary({ ...board, source: 'custom', editable: true })
  }

  #summary(input: {
    readonly id: BoardId
    readonly name: string
    readonly description: string
    readonly roles: readonly CustomBoard['roles'][number][]
    readonly characters: readonly CustomBoard['characters'][number][]
    readonly agentProfiles: readonly CustomBoard['agentProfiles'][number][]
    readonly sheriff: boolean
    readonly victory: CustomBoard['victory']
    readonly revision: number
    readonly source: BoardSummary['source']
    readonly editable: boolean
  }): BoardSummary {
    return BoardSummarySchema.parse({
      ...input,
      playerCount: input.roles.reduce((total, role) => total + role.count, 0),
      characters: this.#normalizedCharacters(
        input.characters,
        input.roles.reduce((total, role) => total + role.count, 0),
      ),
      agentProfiles: this.#normalizedAgentProfiles(
        input.agentProfiles,
        input.roles.reduce((total, role) => total + role.count, 0),
      ),
      roles: input.roles.map((slot) => ({
        ...slot,
        name: getCopy(this.#roles().role(slot.roleId).displayNameKey),
      })),
    })
  }

  #snapshot(summary: BoardSummary): MatchBoardSnapshot {
    return MatchBoardSnapshotSchema.parse({
      schemaVersion: 2,
      rulesetId: this.#rulesets.currentSnapshotId(),
      ruleset: this.#rulesets.lock(),
      id: summary.id,
      name: summary.name,
      description: summary.description,
      roles: summary.roles.map(({ roleId, count }) => ({ roleId, count })),
      characters: summary.characters,
      agentProfiles: summary.agentProfiles,
      playerCount: summary.playerCount,
      sheriff: summary.sheriff,
      victory: summary.victory,
      policies: { ...classicBoardPolicyDefaults, victory: summary.victory },
      source: summary.source,
      revision: summary.revision,
    })
  }

  #validateCharacters(
    characters: readonly CustomBoard['characters'][number][],
    playerCount: number,
  ): void {
    if (characters.length === 0) return
    if (characters.length !== playerCount) {
      throw new RuleViolation('Board Character defaults must contain one slot per seat')
    }
    const seats = [...characters].map(({ seat }) => seat).sort((left, right) => left - right)
    if (seats.some((seat, index) => seat !== index + 1)) {
      throw new RuleViolation('Board Character default seats must be consecutive')
    }
    for (const { characterId } of characters) {
      if (characterId && !this.#characters?.get(characterId)) {
        throw new RuleViolation(`Unknown Character ${characterId}`)
      }
    }
  }

  #normalizedCharacters(
    characters: readonly CustomBoard['characters'][number][],
    playerCount: number,
  ): CustomBoard['characters'] {
    const bySeat = new Map(characters.map((slot) => [slot.seat, slot.characterId]))
    return Array.from({ length: playerCount }, (_, index) => ({
      seat: index + 1,
      characterId: bySeat.get(index + 1) ?? null,
    }))
  }

  #validateAgentProfiles(
    agentProfiles: readonly CustomBoard['agentProfiles'][number][],
    playerCount: number,
  ): void {
    if (agentProfiles.length === 0) return
    if (agentProfiles.length !== playerCount) {
      throw new RuleViolation('Board Agent Profile defaults must contain one slot per seat')
    }
    const seats = [...agentProfiles].map(({ seat }) => seat).sort((left, right) => left - right)
    if (seats.some((seat, index) => seat !== index + 1)) {
      throw new RuleViolation('Board Agent Profile default seats must be consecutive')
    }
    for (const { profileId } of agentProfiles) {
      if (profileId && !this.#repository.getProfile(profileId)) {
        throw new RuleViolation(`Unknown Agent Profile ${profileId}`)
      }
    }
  }

  #normalizedAgentProfiles(
    agentProfiles: readonly CustomBoard['agentProfiles'][number][],
    playerCount: number,
  ): CustomBoard['agentProfiles'] {
    const bySeat = new Map(agentProfiles.map((slot) => [slot.seat, slot.profileId]))
    return Array.from({ length: playerCount }, (_, index) => ({
      seat: index + 1,
      profileId: bySeat.get(index + 1) ?? null,
    }))
  }

  #roles() {
    return this.#rulesets.current().roles
  }
}
