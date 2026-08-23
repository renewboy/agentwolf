export class AcpLifecycleError extends Error {
  public constructor(
    message: string,
    public readonly stderrTail: string = '',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'AcpLifecycleError'
  }
}

export class AcpDeliveryUncertainError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AcpDeliveryUncertainError'
  }
}
