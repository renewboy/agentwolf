import { Readable, Writable } from 'node:stream'
import { PROTOCOL_VERSION, agent, methods, ndJsonStream } from '@agentclientprotocol/sdk'

const modelOption = (currentValue = 'mock-default') => ({
  id: 'model',
  name: 'Model',
  category: 'model',
  type: 'select',
  currentValue,
  options: [
    { value: 'mock-default', name: 'Mock default' },
    { value: 'mock-model', name: 'Mock model' },
  ],
})

const sessions = new Set()
let promptIndex = 0
const promptDelayMs = Math.max(
  0,
  Number.parseInt(process.env['AGENTWOLF_MOCK_PROMPT_DELAY_MS'] ?? '0', 10) || 0,
)
const app = agent({ name: 'AgentWolf mock agent' })
  .onRequest(methods.agent.initialize, () => ({
    protocolVersion: PROTOCOL_VERSION,
    agentCapabilities: {},
    agentInfo: { name: 'agentwolf-mock', version: '1.0.0' },
  }))
  .onRequest(methods.agent.session.new, () => {
    const sessionId = `mock-session-${sessions.size + 1}`
    sessions.add(sessionId)
    return {
      sessionId,
      modes: {
        currentModeId: 'read-only',
        availableModes: [{ id: 'read-only', name: 'Read only' }],
      },
      configOptions: [modelOption()],
    }
  })
  .onRequest(methods.agent.session.setConfigOption, ({ params }) => ({
    configOptions: [modelOption(String(params.value))],
  }))
  .onRequest(methods.agent.session.setMode, () => ({}))
  .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
    if (!sessions.has(params.sessionId)) throw new Error('Unknown session')
    if (promptDelayMs > 0) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, promptDelayMs))
    }
    const promptText = params.prompt
      .filter((content) => content.type === 'text')
      .map((content) => content.text)
      .join('')
    promptIndex += 1
    const traceToolCallId = `mock-trace-${promptIndex}`
    await client.notify(methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'agent_thought_chunk',
        messageId: `thought-${promptIndex}`,
        content: { type: 'text', text: '检查上下文' },
      },
    })
    await client.notify(methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: traceToolCallId,
        title: '读取局面摘要',
        kind: 'read',
        status: 'pending',
        rawInput: { promptCharacters: promptText.length },
      },
    })
    await client.notify(methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: traceToolCallId,
        status: 'completed',
        rawOutput: { checked: true },
      },
    })
    await client.notify(methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'usage_update',
        used: Math.min(promptText.length, 4096),
        size: 32768,
      },
    })
    if (promptText.includes('permission-check')) {
      const opaqueCodex = promptText.includes('permission-check-codex')
      const permission = await client.request(methods.client.session.requestPermission, {
        sessionId: params.sessionId,
        toolCall: {
          toolCallId: 'permission-tool',
          ...(opaqueCodex ? {} : { title: 'Approve 提交投票' }),
          kind: opaqueCodex ? 'execute' : 'other',
          status: 'pending',
          ...(opaqueCodex
            ? {}
            : {
                rawInput: {
                  server_name: 'agentwolf-player-actions',
                  request: { _meta: { tool_title: '提交投票' } },
                },
              }),
        },
        ...(opaqueCodex ? { _meta: { is_mcp_tool_approval: true } } : {}),
        options: [
          { kind: 'allow_once', name: 'Allow once', optionId: 'allow' },
          { kind: 'reject_once', name: 'Reject once', optionId: 'reject' },
        ],
      })
      const text =
        permission.outcome.outcome === 'selected'
          ? `permission-${permission.outcome.optionId}`
          : 'permission-cancelled'
      await client.notify(methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text },
        },
      })
      return { stopReason: 'end_turn' }
    }
    await client.notify(methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: '你' },
      },
    })
    await client.notify(methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: '好' },
      },
    })
    return { stopReason: 'end_turn' }
  })
  .onRequest(methods.agent.session.close, ({ params }) => {
    sessions.delete(params.sessionId)
    return {}
  })

const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))
const connection = app.connect(stream)
await connection.closed
