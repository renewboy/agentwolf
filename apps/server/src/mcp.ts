import type { FastifyReply, FastifyRequest } from 'fastify'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { z } from 'zod'
import { formatCopy, getCopy } from '@agentwolf/assets'
import type { ActionMailbox } from './action-mailbox.js'

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) return null
  return authorization.slice('Bearer '.length).trim() || null
}

function toolResult(operation: () => unknown) {
  try {
    const receipt = operation()
    return {
      content: [{ type: 'text' as const, text: getCopy('tools.accepted') }],
      structuredContent: receipt as Record<string, unknown>,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: formatCopy(getCopy('tools.rejected'), { reason }),
        },
      ],
    }
  }
}

function createPlayerMcpServer(mailbox: ActionMailbox, token: string): McpServer {
  const server = new McpServer({ name: 'agentwolf-player-actions', version: '0.1.0' })
  server.registerTool(
    'submit_speech',
    {
      title: getCopy('tools.speechTitle'),
      description: getCopy('tools.speechDescription'),
      inputSchema: { text: z.string().min(1).max(8_000) },
    },
    ({ text }) => toolResult(() => mailbox.submitSpeech(token, text)),
  )
  server.registerTool(
    'submit_vote',
    {
      title: getCopy('tools.voteTitle'),
      description: getCopy('tools.voteDescription'),
      inputSchema: { targetPlayerId: z.string().nullable() },
    },
    ({ targetPlayerId }) => toolResult(() => mailbox.submitVote(token, targetPlayerId)),
  )
  server.registerTool(
    'submit_night_action',
    {
      title: getCopy('tools.nightTitle'),
      description: getCopy('tools.nightDescription'),
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
      title: getCopy('tools.sheriffTitle'),
      description: getCopy('tools.sheriffDescription'),
      inputSchema: {
        action: z.enum([
          'join',
          'decline',
          'withdraw',
          'keep-running',
          'speech-clockwise',
          'speech-counterclockwise',
        ]),
      },
    },
    ({ action }) => toolResult(() => mailbox.submitSheriffAction(token, action)),
  )
  server.registerTool(
    'trigger_skill',
    {
      title: getCopy('tools.skillTitle'),
      description: getCopy('tools.skillDescription'),
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
