import { Readable, Writable } from 'node:stream'
import {
  PROTOCOL_VERSION,
  client,
  methods,
  ndJsonStream,
  type ActiveSession,
  type ClientConnection,
  type ClientContext,
  type InitializeResponse,
  type McpServer,
  type RequestPermissionRequest,
  type SessionConfigOption,
  type SessionMode,
  type SessionUpdate,
  type StopReason,
} from '@agentclientprotocol/sdk'
import { AcpDeliveryUncertainError, AcpLifecycleError } from './errors.js'
import { AgentProcess } from './process.js'
import type { ProcessLaunchSpec } from './tool-catalog.js'

export interface AcpSessionStartOptions {
  readonly cwd: string
  readonly launch: ProcessLaunchSpec
  readonly model?: string
  readonly modelConfigKey?: string
  readonly mode?: string
  readonly mcpServers?: readonly McpServer[]
  readonly sessionMeta?: Readonly<Record<string, unknown>>
  readonly approvedToolNames?: readonly string[]
  readonly approvedMcpTools?: readonly {
    readonly server: string
    readonly tool: string
    readonly title?: string
  }[]
  readonly onPermissionRequest?: (request: RequestPermissionRequest) => void
  readonly onStderr?: (chunk: string) => void
}

export interface AcpPromptCallbacks {
  readonly onTextChunk?: (chunk: string) => void
  readonly onUpdate?: (update: SessionUpdate) => void
}

export interface AcpPromptResult {
  readonly text: string
  readonly stopReason: StopReason
  readonly updates: readonly SessionUpdate[]
}

export class AcpPlayerSession {
  readonly #process: AgentProcess
  readonly #connection: ClientConnection
  readonly #context: ClientContext
  readonly #session: ActiveSession
  readonly #initializeResponse: InitializeResponse
  #closed = false

  private constructor(
    process: AgentProcess,
    connection: ClientConnection,
    context: ClientContext,
    session: ActiveSession,
    initializeResponse: InitializeResponse,
  ) {
    this.#process = process
    this.#connection = connection
    this.#context = context
    this.#session = session
    this.#initializeResponse = initializeResponse
  }

  public static async start(options: AcpSessionStartOptions): Promise<AcpPlayerSession> {
    const process = new AgentProcess({
      cwd: options.cwd,
      launch: options.launch,
      ...(options.onStderr ? { onStderr: options.onStderr } : {}),
    })
    try {
      const app = client({ name: 'AgentWolf' }).onRequest(
        methods.client.session.requestPermission,
        ({ params }) => permissionDecision(params, options),
      )
      const stream = ndJsonStream(
        Writable.toWeb(process.child.stdin) as WritableStream<Uint8Array>,
        Readable.toWeb(process.child.stdout) as ReadableStream<Uint8Array>,
      )
      const connection = app.connect(stream)
      const context = connection.agent
      const initialized = await context.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: 'agentwolf', version: '0.1.0' },
      })
      if (initialized.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(
          `ACP protocol mismatch: expected ${PROTOCOL_VERSION}, received ${initialized.protocolVersion}`,
        )
      }
      const session = await context
        .buildSession({
          cwd: options.cwd,
          mcpServers: [...(options.mcpServers ?? [])],
          ...(options.sessionMeta ? { _meta: { ...options.sessionMeta } } : {}),
        })
        .start()
      await configureSession(context, session, options)
      return new AcpPlayerSession(process, connection, context, session, initialized)
    } catch (error) {
      await process.close()
      throw new AcpLifecycleError('Unable to start ACP player session', process.stderrTail, {
        cause: error,
      })
    }
  }

  public get sessionId(): string {
    return this.#session.sessionId
  }

  public get initializeResponse(): InitializeResponse {
    return this.#initializeResponse
  }

  public get stderrTail(): string {
    return this.#process.stderrTail
  }

  public get availableModes(): readonly SessionMode[] {
    return this.#session.modes?.availableModes ?? []
  }

  public get configOptions(): readonly SessionConfigOption[] {
    return this.#session.newSessionResponse.configOptions ?? []
  }

  public async prompt(
    prompt: string,
    timeoutMs: number,
    callbacks: AcpPromptCallbacks = {},
  ): Promise<AcpPromptResult> {
    if (this.#closed) throw new AcpLifecycleError('ACP session is closed', this.stderrTail)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('ACP prompt timed out')), timeoutMs)
    timer.unref()
    const updates: SessionUpdate[] = []
    let text = ''
    const timeoutFailure = new Promise<never>((_resolve, reject) => {
      const onAbort = (): void => reject(controller.signal.reason)
      if (controller.signal.aborted) onAbort()
      else controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      const promptRequest = this.#session.prompt(prompt, {
        cancellationSignal: controller.signal,
      })
      void promptRequest.catch(() => undefined)
      for (;;) {
        const message = await Promise.race([this.#session.nextUpdate(), timeoutFailure])
        if (message.kind === 'stop') {
          return { text, stopReason: message.stopReason, updates }
        }
        updates.push(message.update)
        callbacks.onUpdate?.(message.update)
        if (
          message.update.sessionUpdate === 'agent_message_chunk' &&
          message.update.content.type === 'text'
        ) {
          text += message.update.content.text
          callbacks.onTextChunk?.(message.update.content.text)
        }
      }
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error)
      try {
        await this.#context.notify(methods.agent.session.cancel, {
          sessionId: this.#session.sessionId,
        })
      } catch (cancelError) {
        throw new AcpDeliveryUncertainError(
          `ACP prompt failed: ${failure}; cancellation was not confirmed`,
          {
            cause: new AggregateError([error, cancelError]),
          },
        )
      }
      throw new AcpDeliveryUncertainError(`ACP prompt failed: ${failure}`, { cause: error })
    } finally {
      clearTimeout(timer)
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    try {
      await this.#context.request(methods.agent.session.close, {
        sessionId: this.#session.sessionId,
      })
    } catch (error) {
      if (!this.#connection.signal.aborted) {
        this.#connection.close(error)
      }
    } finally {
      this.#session.dispose()
      this.#connection.close()
      await this.#process.close()
    }
  }
}

function permissionDecision(request: RequestPermissionRequest, options: AcpSessionStartOptions) {
  options.onPermissionRequest?.(request)
  const name = request.toolCall.name ?? ''
  const nameAllowed = (options.approvedToolNames ?? []).some(
    (allowed) =>
      name === allowed ||
      ['__', ':', '/', '.'].some((separator) => name.endsWith(`${separator}${allowed}`)),
  )
  const rawInput = request.toolCall.rawInput
  const mcpAllowed = (options.approvedMcpTools ?? []).some(
    (approved) =>
      (isRecord(rawInput) &&
        rawInput['server'] === approved.server &&
        rawInput['tool'] === approved.tool) ||
      (isRecord(rawInput) &&
        rawInput['server_name'] === approved.server &&
        isRecord(rawInput['request']) &&
        isRecord(rawInput['request']['_meta']) &&
        rawInput['request']['_meta']['tool_title'] === approved.title),
  )
  const selection = request.options.find((option) => option.kind === 'allow_once')
  return nameAllowed || mcpAllowed
    ? selection
      ? { outcome: { outcome: 'selected' as const, optionId: selection.optionId } }
      : { outcome: { outcome: 'cancelled' as const } }
    : { outcome: { outcome: 'cancelled' as const } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function configureSession(
  context: ClientContext,
  session: ActiveSession,
  options: AcpSessionStartOptions,
): Promise<void> {
  if (options.model) {
    const modelConfigKey = options.modelConfigKey ?? 'model'
    const modelOption = session.newSessionResponse.configOptions?.find(
      (option) => option.id === modelConfigKey || option.category === 'model',
    )
    if (!modelOption) {
      throw new Error('ACP agent does not advertise a model configuration option')
    }
    await context.request(methods.agent.session.setConfigOption, {
      sessionId: session.sessionId,
      configId: modelOption.id,
      value: options.model,
    })
  }

  if (options.mode) {
    const available = session.modes?.availableModes.some((mode) => mode.id === options.mode)
    if (!available) throw new Error(`ACP agent does not advertise mode ${options.mode}`)
    await context.request(methods.agent.session.setMode, {
      sessionId: session.sessionId,
      modeId: options.mode,
    })
  }
}
