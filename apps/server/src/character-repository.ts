import type Database from 'better-sqlite3'
import {
  CharacterCardSchema,
  CharacterPortraitAssetSchema,
  type CharacterCard,
  type CharacterId,
  type CharacterPortraitAsset,
  type CharacterPortraitAssetId,
} from '@agentwolf/contracts'

interface DatabaseRow {
  readonly json: string
}

export class CharacterSqliteRepository {
  readonly #database: Database.Database

  public constructor(database: Database.Database) {
    this.#database = database
  }

  public list(): CharacterCard[] {
    const rows = this.#database
      .prepare('SELECT json FROM custom_characters ORDER BY updated_at DESC, id ASC')
      .all() as DatabaseRow[]
    return rows.map((row) => CharacterCardSchema.parse(JSON.parse(row.json)))
  }

  public get(id: CharacterId): CharacterCard | null {
    const row = this.#database.prepare('SELECT json FROM custom_characters WHERE id = ?').get(id) as
      | DatabaseRow
      | undefined
    return row ? CharacterCardSchema.parse(JSON.parse(row.json)) : null
  }

  public save(character: CharacterCard): void {
    const parsed = CharacterCardSchema.parse(character)
    if (parsed.source !== 'custom' || !parsed.editable) {
      throw new Error('Only editable custom Character cards can be persisted')
    }
    this.#database
      .prepare(
        `INSERT INTO custom_characters (id, json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      )
      .run(parsed.id, JSON.stringify(parsed), parsed.updatedAt)
  }

  public delete(id: CharacterId): boolean {
    return this.#database.prepare('DELETE FROM custom_characters WHERE id = ?').run(id).changes > 0
  }

  public saveAsset(asset: CharacterPortraitAsset): CharacterPortraitAsset {
    const parsed = CharacterPortraitAssetSchema.parse(asset)
    this.#database
      .prepare(
        `INSERT INTO character_assets (id, json, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      )
      .run(parsed.id, JSON.stringify(parsed), parsed.createdAt)
    return this.getAsset(parsed.id) ?? parsed
  }

  public getAsset(id: CharacterPortraitAssetId): CharacterPortraitAsset | null {
    const row = this.#database.prepare('SELECT json FROM character_assets WHERE id = ?').get(id) as
      | DatabaseRow
      | undefined
    return row ? CharacterPortraitAssetSchema.parse(JSON.parse(row.json)) : null
  }
}
