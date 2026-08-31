import type { RoleCard } from '@agentwolf/contracts'
import type { BoardManifest } from '../types.js'
import type { RoleRegistry } from '../roles/registry.js'

export interface RoleDealContext {
  readonly board: BoardManifest
  readonly roles: RoleRegistry
  readonly assignments: readonly RoleCard[]
  readonly reserveCards: readonly RoleCard[]
}

export interface RoleDealValidator {
  readonly id: string
  validateBoard?(board: BoardManifest, roles: RoleRegistry): void
  validateDeal(context: RoleDealContext): void
}

export class DealRegistry {
  readonly #validators: RoleDealValidator[] = []

  public register(validator: RoleDealValidator): void {
    if (this.#validators.some((entry) => entry.id === validator.id)) {
      throw new Error(`Duplicate role deal validator ${validator.id}`)
    }
    this.#validators.push(validator)
  }

  public validateBoard(board: BoardManifest, roles: RoleRegistry): void {
    for (const validator of this.#validators) validator.validateBoard?.(board, roles)
  }

  public validateDeal(context: RoleDealContext): void {
    for (const validator of this.#validators) validator.validateDeal(context)
  }
}
