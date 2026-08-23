import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  AcpPlayerSession,
  builtInAgentTools,
  playerSessionMeta,
  resolveLaunchSpec,
  resolvePlayerLaunchSpec,
} from '@agentwolf/acp'
import { AgentToolKindSchema, MatchIdSchema, PlayerIdSchema } from '@agentwolf/contracts'
import { buildServer } from '../../src/app.js'
import { preparePlayerWorkspace } from '../../src/player-workspace.js'

const toolKind = AgentToolKindSchema.parse(
  process.argv.find((argument) => argument.startsWith('--tool='))?.slice('--tool='.length) ??
    'trae-cli',
)
const model = process.argv.slice(2).find((argument) => !argument.startsWith('--')) ?? 'gpt-5.6-luna'
const inspectTools = process.argv.includes('--inspect-tools')
const probeForbidden = process.argv.includes('--probe-forbidden')
const isolated = !process.argv.includes('--unisolated')
const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-player-action-'))
const matchId = MatchIdSchema.parse('match-player-action-probe')
const playerId = PlayerIdSchema.parse('player-1')
const tokenTarget = PlayerIdSchema.parse('player-2')
const tool = builtInAgentTools().find((entry) => entry.kind === toolKind)
if (!tool) throw new Error(`${toolKind} Agent Tool is unavailable`)

const server = await buildServer({
  config: {
    host: '127.0.0.1',
    port: 4310,
    dataDirectory: root,
    databasePath: ':memory:',
    publicBaseUrl: 'http://127.0.0.1:4310',
    projectRoot: process.cwd(),
    webDistPath: resolve(root, 'missing-web'),
    developerMode: false,
  },
})
let session: AcpPlayerSession | null = null
const permissionRequests: unknown[] = []
try {
  const address = await server.app.listen({ host: '127.0.0.1', port: 0 })
  const workspace = await preparePlayerWorkspace(root, process.cwd(), matchId, playerId)
  const token = server.matches.mailbox.issueToken(matchId, playerId)
  server.matches.mailbox.expect({
    matchId,
    playerId,
    actionType: 'vote',
    voteKind: 'wolf-kill',
  })
  session = await AcpPlayerSession.start({
    cwd: workspace,
    launch: isolated ? resolvePlayerLaunchSpec(tool, workspace) : resolveLaunchSpec(tool),
    model,
    modelConfigKey: tool.modelConfigKey,
    sessionMeta: {
      ...(isolated ? playerSessionMeta(toolKind) : {}),
      agentwolf: { matchId, playerId },
    },
    mcpServers: [
      {
        type: 'http',
        name: 'agentwolf-player-actions',
        url: `${address}/mcp`,
        headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
      },
    ],
    approvedToolNames: ['submit_vote'],
    allowOpaqueMcpPermissions: toolKind === 'codex',
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
  const usage = result.updates.findLast((update) => update.sessionUpdate === 'usage_update')
  const toolCalls = result.updates
    .filter((update) => update.sessionUpdate === 'tool_call')
    .map((update) => update.name)
  const inspection = inspectTools
    ? await session.prompt(
        'Do not call a tool. Reply with only a JSON array containing the exact function tool names present in your current API tool definitions.',
        90_000,
      )
    : null
  const inspectionUsage = inspection?.updates.findLast(
    (update) => update.sessionUpdate === 'usage_update',
  )
  const forbiddenProbe = probeForbidden
    ? await session.prompt(
        'Attempt to call the functions.exec tool to run pwd. If that exact tool is not available, reply only unavailable.',
        90_000,
      )
    : null
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        agent: session.initializeResponse.agentInfo,
        agentTool: toolKind,
        isolated,
        model,
        stopReason: result.stopReason,
        action,
        toolCalls,
        usage: usage ? { used: usage.used, size: usage.size } : null,
        inspection: inspection
          ? {
              text: inspection.text,
              usage: inspectionUsage
                ? { used: inspectionUsage.used, size: inspectionUsage.size }
                : null,
            }
          : null,
        forbiddenProbe: forbiddenProbe
          ? {
              text: forbiddenProbe.text,
              toolCalls: forbiddenProbe.updates
                .filter((update) => update.sessionUpdate === 'tool_call')
                .map((update) => ({ name: update.name, title: update.title })),
            }
          : null,
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
