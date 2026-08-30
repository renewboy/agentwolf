export class PlayerTurnSupersededError extends Error {
  public constructor(public readonly partialText: string) {
    super('Player turn was superseded')
    this.name = 'PlayerTurnSupersededError'
  }
}
