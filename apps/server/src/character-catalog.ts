import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  CharacterCardInputSchema,
  CharacterCardSchema,
  CharacterCardSnapshotSchema,
  CharacterIdSchema,
  CharacterPortraitAssetIdSchema,
  CharacterPortraitAssetSchema,
  CharacterPortraitUploadSchema,
  CharacterSummarySchema,
  type CharacterCard,
  type CharacterCardInput,
  type CharacterCardSnapshot,
  type CharacterId,
  type CharacterPortraitAsset,
  type CharacterPortraitAssetId,
  type CharacterPortraitUpload,
  type CharacterSummary,
} from '@agentwolf/contracts'
import {
  builtInCharacterCards,
  builtInCharacterPortraitFile,
  formatCopy,
  getCopy,
} from '@agentwolf/assets'
import type { ServerConfig } from './config.js'
import { createReadableId } from './ids.js'
import type { SqliteRepository } from './repository.js'

export interface ResolvedCharacterPortrait {
  readonly path: string
  readonly mediaType: 'image/png' | 'image/webp'
}

export class CharacterCatalogError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'CharacterCatalogError'
  }
}

export class CharacterCatalogService {
  readonly #repository: SqliteRepository
  readonly #config: ServerConfig

  public constructor(repository: SqliteRepository, config: ServerConfig) {
    this.#repository = repository
    this.#config = config
  }

  public list(): CharacterCard[] {
    return [...builtInCharacterCards, ...this.#repository.characters.list()]
  }

  public summaries(): CharacterSummary[] {
    return this.list().map((character) => CharacterSummarySchema.parse(character))
  }

  public get(id: CharacterId): CharacterCard | null {
    return this.list().find((character) => character.id === id) ?? null
  }

  public require(id: CharacterId): CharacterCard {
    const character = this.get(id)
    if (!character) throw new CharacterCatalogError(`Unknown Character ${id}`)
    return character
  }

  public snapshot(id: CharacterId): CharacterCardSnapshot {
    return CharacterCardSnapshotSchema.parse(this.require(id))
  }

  public create(input: CharacterCardInput): CharacterCard {
    const parsed = this.#validateInput(input)
    const timestamp = new Date().toISOString()
    const character = CharacterCardSchema.parse({
      ...parsed,
      id: CharacterIdSchema.parse(createReadableId('character', parsed.name)),
      revision: 1,
      source: 'custom',
      editable: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    this.#repository.characters.save(character)
    return character
  }

  public copy(id: CharacterId): CharacterCard {
    const source = this.require(id)
    return this.create({
      name: formatCopy(getCopy('characterLibrary.copyName'), { name: source.name }),
      universe: source.universe,
      summary: source.summary,
      personality: source.personality,
      socialStyle: source.socialStyle,
      reasoningPresentation: source.reasoningPresentation,
      speechStyle: source.speechStyle,
      boundaries: source.boundaries,
      portraitAssetId: source.portraitAssetId,
    })
  }

  public update(id: CharacterId, input: CharacterCardInput): CharacterCard {
    const current = this.#repository.characters.get(id)
    if (!current) {
      if (builtInCharacterCards.some((character) => character.id === id)) {
        throw new CharacterCatalogError('Built-in Character cards are read-only')
      }
      throw new CharacterCatalogError(`Unknown Character ${id}`)
    }
    const parsed = this.#validateInput(input)
    const character = CharacterCardSchema.parse({
      ...parsed,
      id,
      revision: current.revision + 1,
      source: 'custom',
      editable: true,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    })
    this.#repository.characters.save(character)
    return character
  }

  public delete(id: CharacterId): void {
    if (builtInCharacterCards.some((character) => character.id === id)) {
      throw new CharacterCatalogError('Built-in Character cards are read-only')
    }
    const referencedBy = this.#repository
      .listCustomBoards()
      .find((board) => board.characters.some((slot) => slot.characterId === id))
    if (referencedBy) {
      throw new CharacterCatalogError(`Character is used by board ${referencedBy.name}`)
    }
    if (!this.#repository.characters.delete(id)) {
      throw new CharacterCatalogError(`Unknown Character ${id}`)
    }
  }

  public async uploadPortrait(input: CharacterPortraitUpload): Promise<CharacterPortraitAsset> {
    const { dataUrl } = CharacterPortraitUploadSchema.parse(input)
    const bytes = Buffer.from(dataUrl.slice('data:image/webp;base64,'.length), 'base64')
    if (bytes.byteLength === 0 || bytes.byteLength > 5_000_000) {
      throw new CharacterCatalogError('Character portrait must be between 1 byte and 5 MB')
    }
    if (
      bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      throw new CharacterCatalogError('Character portrait is not a valid WebP image')
    }
    const hash = createHash('sha256').update(bytes).digest('hex')
    const id = CharacterPortraitAssetIdSchema.parse(`portrait-${hash}`)
    const createdAt = new Date().toISOString()
    const asset = CharacterPortraitAssetSchema.parse({
      id,
      mediaType: 'image/webp',
      byteSize: bytes.byteLength,
      createdAt,
    })
    const directory = resolve(this.#config.dataDirectory, 'character-assets')
    await mkdir(directory, { recursive: true })
    try {
      await writeFile(resolve(directory, `${id}.webp`), bytes, { flag: 'wx' })
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
    }
    return this.#repository.characters.saveAsset(asset)
  }

  public portrait(assetId: CharacterPortraitAssetId): ResolvedCharacterPortrait | null {
    const builtInFile = builtInCharacterPortraitFile(assetId)
    if (builtInFile) {
      return {
        path: resolve(
          this.#config.projectRoot,
          'packages',
          'assets',
          'characters',
          'portraits',
          builtInFile,
        ),
        mediaType: 'image/png',
      }
    }
    const asset = this.#repository.characters.getAsset(assetId)
    return asset
      ? {
          path: resolve(this.#config.dataDirectory, 'character-assets', `${asset.id}.webp`),
          mediaType: asset.mediaType,
        }
      : null
  }

  #validateInput(input: CharacterCardInput): CharacterCardInput {
    const parsed = CharacterCardInputSchema.parse(input)
    if (!this.portrait(parsed.portraitAssetId)) {
      throw new CharacterCatalogError(`Unknown Character portrait ${parsed.portraitAssetId}`)
    }
    return parsed
  }
}
