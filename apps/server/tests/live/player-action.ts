import { access, appendFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  AcpPlayerSession,
  builtInAgentTools,
  playerApprovedToolNames,
  playerSessionMeta,
  resolveLaunchSpec,
  resolvePlayerLaunchSpec,
  type AcpSessionStartOptions,
} from '@agentwolf/acp'
import { AgentToolKindSchema, MatchIdSchema, PlayerIdSchema } from '@agentwolf/contracts'
import { copyPlayerSkills } from '@agentwolf/assets/player-skills'
import { loadPromptCore } from '@agentwolf/assets/prompts'
import { buildServer } from '../../src/app.js'
import { preparePlayerWorkspace } from '../../src/player-workspace.js'

const toolKind = AgentToolKindSchema.parse(
  process.argv.find((argument) => argument.startsWith('--tool='))?.slice('--tool='.length) ??
    'trae-cli',
)
const model =
  process.argv.slice(2).find((argument) => !argument.startsWith('--')) ??
  (toolKind === 'claude' ? undefined : 'gpt-5.6-luna')
const inspectTools = process.argv.includes('--inspect-tools')
const probeForbidden = process.argv.includes('--probe-forbidden')
const probeStrategy = process.argv.includes('--probe-strategy')
const probeSandbox = process.argv.includes('--probe-sandbox')
const probeResume = process.argv.includes('--resume')
const isolated = !process.argv.includes('--unisolated')
const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-player-action-'))
const matchId = MatchIdSchema.parse('match-player-action-probe')
const playerId = PlayerIdSchema.parse('player-1')
const tokenTarget = PlayerIdSchema.parse('player-2')
const tool = builtInAgentTools().find((entry) => entry.kind === toolKind)
if (!tool) throw new Error(`${toolKind} Agent Tool is unavailable`)
const promptCore = loadPromptCore()
const sandboxAcceptanceInstruction = `
## Sandbox acceptance

When the judge explicitly requests the sandbox acceptance check, attempt each exact command once
without requesting elevated or unsandboxed access. Report the real tool failures.
`

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
const stderrChunks: string[] = []
try {
  const address = await server.app.listen({ host: '127.0.0.1', port: 0 })
  const builtSkills = await copyPlayerSkills({
    dataDirectory: root,
    sourceRoot: resolve(process.cwd(), 'packages/assets/player-skills'),
  })
  if (probeSandbox) {
    await appendFile(
      resolve(builtSkills, 'agentwolf-player/SKILL.md'),
      sandboxAcceptanceInstruction,
      'utf8',
    )
  }
  const workspace = await preparePlayerWorkspace(root, matchId, playerId)
  const token = server.matches.mailbox.issueToken(matchId, playerId)
  server.matches.mailbox.expect({
    matchId,
    playerId,
    actionType: 'vote',
    voteKind: 'wolf-kill',
  })
  const sessionOptions: AcpSessionStartOptions = {
    cwd: workspace,
    launch: isolated ? resolvePlayerLaunchSpec(tool, workspace) : resolveLaunchSpec(tool),
    ...(model ? { model } : {}),
    modelConfigKey: tool.modelConfigKey,
    sessionMeta: {
      ...(isolated
        ? playerSessionMeta(
            toolKind,
            probeSandbox
              ? `${promptCore.playerContract()}${sandboxAcceptanceInstruction}`
              : promptCore.playerContract(),
          )
        : {}),
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
    approvedToolNames: isolated ? playerApprovedToolNames(toolKind) : ['submit_vote'],
    allowOpaqueMcpPermissions: toolKind === 'codex',
    approvedMcpTools: [
      {
        server: 'agentwolf-player-actions',
        tool: 'submit_vote',
        title: promptCore.tool('submit_vote').title,
      },
    ],
    onStderr: (chunk) => stderrChunks.push(chunk),
    onPermissionRequest: (request) => permissionRequests.push(request),
    requireSessionResume: true,
  }
  session = await AcpPlayerSession.start(sessionOptions)
  const initialSessionId = session.sessionId
  const result = await session.prompt(
    `Call the submit_vote tool with targetPlayerId ${tokenTarget}. End the turn immediately after the accepted receipt. Do not answer with text instead of the tool.`,
    90_000,
  )
  const action = server.matches.mailbox.take(matchId, playerId)
  if (!action) {
    const updates = result.updates.map((update) =>
      update.sessionUpdate === 'agent_message_chunk'
        ? { sessionUpdate: update.sessionUpdate, content: update.content }
        : update.sessionUpdate === 'agent_thought_chunk'
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
      `Trae returned without an action. Permissions: ${JSON.stringify(permissionRequests).slice(0, 4_000)} Text: ${result.text.slice(0, 500)} Updates: ${JSON.stringify(updates).slice(0, 4_000)} Stderr: ${stripAnsi(stderrChunks.join('')).slice(-4_000)}`,
    )
  }
  let resumeResult: Awaited<ReturnType<AcpPlayerSession['prompt']>> | null = null
  let resumedAction: ReturnType<typeof server.matches.mailbox.take> = null
  if (probeResume) {
    await session.close()
    session = await AcpPlayerSession.start({
      ...sessionOptions,
      resumeSessionId: initialSessionId,
    })
    if (session.sessionId !== initialSessionId) {
      throw new Error(`Resumed Session ${session.sessionId}; expected ${initialSessionId}`)
    }
    server.matches.mailbox.expect({
      matchId,
      playerId,
      actionType: 'vote',
      voteKind: 'wolf-kill',
    })
    resumeResult = await session.prompt(
      `Continue the current judge stage. Call submit_vote with targetPlayerId ${tokenTarget}, then end the turn after the accepted receipt.`,
      90_000,
    )
    resumedAction = server.matches.mailbox.take(matchId, playerId)
    if (!resumedAction) throw new Error('Resumed Session returned without an accepted action')
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
  const strategyProbe = probeStrategy
    ? await session.prompt(
        "Use Bash to run exactly: rg -n '统一战线' .agents/skills/werewolf-strategy/references/articles/2023080801.md . Do not call a game action. Reply only 统一战线 after the command succeeds.",
        120_000,
      )
    : null
  if (strategyProbe) {
    const strategyCalls = toolUpdates(strategyProbe.updates)
    if (!strategyProbe.text.includes('统一战线') || strategyCalls.length === 0) {
      throw new Error(
        `Strategy probe was not grounded in a local tool call: ${JSON.stringify({ text: strategyProbe.text, calls: strategyCalls }).slice(0, 8_000)}`,
      )
    }
  }
  const sandboxProbePath = resolve(workspace, 'sandbox-write-probe.txt')
  const sandboxProbe = probeSandbox
    ? await session.prompt(
        `Use Bash to attempt both of these exact checks and report their actual failures: printf blocked > ${JSON.stringify(sandboxProbePath)} ; curl --max-time 3 -sS ${address}/api/health . Do not call a game action.`,
        90_000,
      )
    : null
  if (sandboxProbe) {
    const sandboxCalls = toolUpdates(sandboxProbe.updates)
    const serializedCalls = JSON.stringify(sandboxCalls)
    if (
      sandboxCalls.length === 0 ||
      !serializedCalls.includes('sandbox-write-probe.txt') ||
      !serializedCalls.includes('/api/health')
    ) {
      throw new Error(
        `Sandbox probe did not attempt both checks: ${serializedCalls.slice(0, 8_000)}`,
      )
    }
    if (await pathExists(sandboxProbePath)) {
      throw new Error(`Read-only Bash created ${sandboxProbePath}`)
    }
    if (serializedCalls.includes('{\\"ok\\":true}')) {
      throw new Error('Read-only Bash reached the local HTTP endpoint')
    }
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        agent: session.initializeResponse.agentInfo,
        agentTool: toolKind,
        isolated,
        model: model ?? null,
        initialSessionId,
        resumedSessionId: probeResume ? session.sessionId : null,
        stopReason: result.stopReason,
        action,
        resume: resumeResult
          ? { stopReason: resumeResult.stopReason, action: resumedAction }
          : null,
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
        strategyProbe: strategyProbe
          ? { text: strategyProbe.text, toolUpdates: toolUpdates(strategyProbe.updates) }
          : null,
        sandboxProbe: sandboxProbe
          ? { text: sandboxProbe.text, toolUpdates: toolUpdates(sandboxProbe.updates) }
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

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, 'g'), '')
}

function toolUpdates(updates: Awaited<ReturnType<AcpPlayerSession['prompt']>>['updates']) {
  return updates
    .filter(
      (update) =>
        update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update',
    )
    .map((update) => ({
      sessionUpdate: update.sessionUpdate,
      name: update.name,
      title: update.title,
      status: update.status,
      rawInput: update.rawInput,
      rawOutput: update.rawOutput,
    }))
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
