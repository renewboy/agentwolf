import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { AcpPlayerSession, builtInAgentTools, resolveLaunchSpec } from '@agentwolf/acp'
import { MatchIdSchema, PlayerIdSchema } from '@agentwolf/contracts'
import { buildServer } from '../../src/app.js'

const model = process.argv[2] ?? 'gpt-5.6-luna'
const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-trae-action-'))
const matchId = MatchIdSchema.parse('match-trae-action-probe')
const playerId = PlayerIdSchema.parse('player-1')
const tokenTarget = PlayerIdSchema.parse('player-2')
const tool = builtInAgentTools().find((entry) => entry.kind === 'trae-cli')
if (!tool) throw new Error('Trae CLI tool is unavailable')

const server = await buildServer({
  config: {
    host: '127.0.0.1',
    port: 4310,
    dataDirectory: root,
    databasePath: ':memory:',
    publicBaseUrl: 'http://127.0.0.1:4310',
    projectRoot: process.cwd(),
    webDistPath: resolve(root, 'missing-web'),
  },
})
let session: AcpPlayerSession | null = null
const permissionRequests: unknown[] = []
try {
  const address = await server.app.listen({ host: '127.0.0.1', port: 0 })
  const token = server.matches.mailbox.issueToken(matchId, playerId)
  server.matches.mailbox.expect({
    matchId,
    playerId,
    actionType: 'vote',
    voteKind: 'wolf-kill',
  })
  session = await AcpPlayerSession.start({
    cwd: root,
    launch: resolveLaunchSpec(tool),
    model,
    modelConfigKey: tool.modelConfigKey,
    mcpServers: [
      {
        type: 'http',
        name: 'agentwolf-player-actions',
        url: `${address}/mcp`,
        headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
      },
    ],
    approvedToolNames: ['submit_vote'],
    approvedMcpTools: [
      { server: 'agentwolf-player-actions', tool: 'submit_vote', title: '提交投票' },
    ],
    onPermissionRequest: (request) => permissionRequests.push(request),
  })
  const result = await session.prompt(
    `Call the submit_vote tool with targetPlayerId ${tokenTarget}. End the turn immediately after the accepted receipt. Do not answer with text instead of the tool.`,
    90_000,
  )
  const action = server.matches.mailbox.take(matchId, playerId)
  if (!action) {
    const updates = result.updates.map((update) =>
      update.sessionUpdate === 'agent_message_chunk'
        ? { sessionUpdate: update.sessionUpdate, content: update.content }
        : update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update'
          ? {
              sessionUpdate: update.sessionUpdate,
              name: update.name,
              title: update.title,
              status: update.status,
              rawInput: update.rawInput,
              rawOutput: update.rawOutput,
            }
          : { sessionUpdate: update.sessionUpdate },
    )
    throw new Error(
      `Trae returned without an action. Permissions: ${JSON.stringify(permissionRequests).slice(0, 4_000)} Text: ${result.text.slice(0, 500)} Updates: ${JSON.stringify(updates).slice(0, 4_000)}`,
    )
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        agent: session.initializeResponse.agentInfo,
        model,
        stopReason: result.stopReason,
        action,
      },
      null,
      2,
    )}\n`,
  )
} finally {
  await session?.close()
  await server.close()
  await rm(root, { recursive: true, force: true })
}
