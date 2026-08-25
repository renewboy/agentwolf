import type { FastifyReply, FastifyRequest } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { z } from 'zod'
import { loadPromptCore } from '@agentwolf/assets/prompts'
import { SheriffActionKindSchema } from '@agentwolf/contracts'
import type { ActionMailbox } from './action-mailbox.js'

const promptCore = loadPromptCore()

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim() || null
}

function toolResult(operation: () => unknown) {
  try {
    const receipt = operation()
    return {
      content: [{ type: 'text' as const, text: promptCore.acceptedReceipt() }],
      structuredContent: receipt as Record<string, unknown>,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: promptCore.rejectedReceipt(reason),
        },
      ],
    }
  }
}

function createPlayerMcpServer(mailbox: ActionMailbox, token: string): McpServer {
  const server = new McpServer({ name: 'agentwolf-player-actions', version: '0.1.0' })
  const speechTool = promptCore.tool('submit_speech')
  const voteTool = promptCore.tool('submit_vote')
  const nightTool = promptCore.tool('submit_night_action')
  const sheriffTool = promptCore.tool('submit_sheriff_action')
  const skillTool = promptCore.tool('trigger_skill')
  server.registerTool(
    'submit_speech',
    {
      title: speechTool.title,
      description: speechTool.description,
      inputSchema: { text: z.string().min(1).max(8_000) },
    },
    ({ text }) => toolResult(() => mailbox.submitSpeech(token, text)),
  )
  server.registerTool(
    'submit_vote',
    {
      title: voteTool.title,
      description: voteTool.description,
      inputSchema: {
        targetPlayerId: z
          .string()
          .nullable()
          .describe(promptCore.toolField('submit_vote', 'targetPlayerId')),
      },
    },
    ({ targetPlayerId }) => toolResult(() => mailbox.submitVote(token, targetPlayerId)),
  )
  server.registerTool(
    'submit_night_action',
    {
      title: nightTool.title,
      description: nightTool.description,
      inputSchema: {
        abilityId: z.string(),
        targetPlayerIds: z.array(z.string()).max(3),
        option: z.string().optional(),
      },
    },
    ({ abilityId, targetPlayerIds, option }) =>
      toolResult(() => mailbox.submitNightAction(token, abilityId, targetPlayerIds, option)),
  )
  server.registerTool(
    'submit_sheriff_action',
    {
      title: sheriffTool.title,
      description: sheriffTool.description,
      inputSchema: {
        action: SheriffActionKindSchema,
        targetPlayerId: z.string().nullable().optional(),
      },
    },
    ({ action, targetPlayerId }) =>
      toolResult(() => mailbox.submitSheriffAction(token, action, targetPlayerId)),
  )
  server.registerTool(
    'trigger_skill',
    {
      title: skillTool.title,
      description: skillTool.description,
      inputSchema: {
        abilityId: z.string(),
        targetPlayerId: z.string().nullable(),
        option: z.string().optional(),
      },
    },
    ({ abilityId, targetPlayerId, option }) =>
      toolResult(() => mailbox.submitSkillTrigger(token, abilityId, targetPlayerId, option)),
  )
  return server
}

export async function handleMcpRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  mailbox: ActionMailbox,
): Promise<void> {
  const token = bearerToken(request)
  if (!token || !mailbox.binding(token)) {
    await reply.code(401).send({ error: 'invalid-player-token' })
    return
  }
  if (request.method !== 'POST') {
    await reply.code(405).send({ error: 'method-not-allowed' })
    return
  }
  const server = createPlayerMcpServer(mailbox, token)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0])
  reply.hijack()
  try {
    await server.connect(transport as unknown as Transport)
    await transport.handleRequest(request.raw, reply.raw, request.body)
  } finally {
    await transport.close()
    await server.close()
  }
}
