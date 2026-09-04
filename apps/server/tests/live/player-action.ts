import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  AcpPlayerSession,
  builtInAgentTools,
  cleanupPlayerProviderResources,
  defaultPlayerProviderRegistry,
  preparePlayerProviderSession,
  resolveLaunchSpec,
  type AcpSessionStartOptions,
} from '@agentwolf/acp'
import {
  AgentToolKindSchema,
  AbilityIdSchema,
  MatchIdSchema,
  PlayerIdSchema,
  PostgameReviewSubmissionSchema,
  RoleCardIdSchema,
  RoleIdSchema,
  type PlayerAction,
  type PostgameReviewSubmission,
} from '@agentwolf/contracts'
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
  (toolKind === 'claude' ? undefined : toolKind === 'codebuddy' ? 'hy3' : 'gpt-5.6-luna')
const reasoningEffort = process.argv
  .find((argument) => argument.startsWith('--reasoning-effort='))
  ?.slice('--reasoning-effort='.length)
const inspectTools = process.argv.includes('--inspect-tools')
const probeForbidden = process.argv.includes('--probe-forbidden')
const probeStrategy = process.argv.includes('--probe-strategy')
const probeSandbox = process.argv.includes('--probe-sandbox')
const probeResume = process.argv.includes('--resume')
const probePostgameReview = process.argv.includes('--postgame-review')
const probeThiefChoice = process.argv.includes('--thief-choice')
const isolated = !process.argv.includes('--unisolated')
const root = await mkdtemp(resolve(tmpdir(), 'agentwolf-player-action-'))
const matchId = MatchIdSchema.parse('match-player-action-probe')
const playerId = PlayerIdSchema.parse('player-1')
const tokenTarget = PlayerIdSchema.parse('player-2')
const resumeTokenTarget = PlayerIdSchema.parse('player-3')
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
    publicSpeechInterruptMode: 'legacy',
  },
})
let session: AcpPlayerSession | null = null
const permissionRequests: unknown[] = []
const stderrChunks: string[] = []
try {
  const address = await server.app.listen({ host: '127.0.0.1', port: 0 })
  await copyPlayerSkills({
    dataDirectory: root,
    sourceRoot: resolve(process.cwd(), 'packages/assets/player-skills'),
  })
  const workspace = await preparePlayerWorkspace(root, matchId, playerId)
  const token = server.matches.mailbox.issueToken(matchId, playerId)
  const expectSubmission = (): void => {
    if (probePostgameReview) {
      server.matches.mailbox.expectPostgameReview({
        matchId,
        playerId,
        validate: (input) =>
          PostgameReviewSubmissionSchema.parse({
            ...input,
            matchId,
            reviewerId: playerId,
            submittedAt: new Date().toISOString(),
          }),
      })
      return
    }
    if (probeThiefChoice) {
      server.matches.mailbox.expect({
        matchId,
        playerId,
        actionType: 'night-action',
        allowedAbilityIds: [AbilityIdSchema.parse('ability-thief-choose-card')],
        abilityContracts: [
          {
            abilityId: AbilityIdSchema.parse('ability-thief-choose-card'),
            label: '身份窃取',
            description: '从两张底牌中选择最终身份。',
          },
        ],
        roleCardChoices: [
          {
            cardId: RoleCardIdSchema.parse('role-card-r01'),
            roleId: RoleIdSchema.parse('role-werewolf'),
            label: '狼人',
            selectable: true,
          },
          {
            cardId: RoleCardIdSchema.parse('role-card-r02'),
            roleId: RoleIdSchema.parse('role-villager'),
            label: '村民',
            selectable: false,
          },
        ],
      })
      return
    }
    server.matches.mailbox.expect({
      matchId,
      playerId,
      actionType: 'vote',
      voteKind: 'wolf-kill',
    })
  }
  expectSubmission()
  const submittedTool = probePostgameReview
    ? 'submit_postgame_review'
    : probeThiefChoice
      ? 'submit_night_action'
      : 'submit_vote'
  const playerMcpServer = {
    type: 'http' as const,
    name: 'agentwolf-player-actions',
    url: `${address}/mcp`,
    headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
  }
  const modelInstructions = `# 任务目标

你是一局狼人杀中的真人玩家，只依据裁判在当前 Session 中提供的信息行动。

# 可用 Skill

- 可以使用当前工作区提供的 \`agentwolf-player\` 和 \`werewolf-strategy\` 两个 Skill。
- 在做出任何行动前，你都可以阅读\`werewolf-strategy\`的内容来获取建议和战术攻略，不要在发言提及你读取的过程。
- \`.agents/skills\` 是指向工作区外共享 Skill 目录的软链接。查找 Skill 文件时，使用只读 Bash 命令 \`find -L .agents/skills ...\` 跟随软链接，不使用内置文件搜索工具。
- 除经 \`.agents/skills\` 软链接访问上述两个 Skill 外，不得读取当前工作区之外的其他文件。
${probeSandbox ? sandboxAcceptanceInstruction : ''}`
  const provider = defaultPlayerProviderRegistry.resolve(tool)
  const prepared = isolated
    ? await preparePlayerProviderSession({
        tool,
        workspace,
        mcpServers: [playerMcpServer],
        modelInstructions,
      })
    : {
        cwd: workspace,
        launch: resolveLaunchSpec(tool),
        mcpServers: [playerMcpServer],
        sessionMeta: {},
        approvedToolNames: [submittedTool],
        allowOpaqueMcpPermissions: provider.session.permissions === 'opaque-mcp',
        verifyUnadvertisedSessionResume: provider.session.resume === 'verify',
      }
  const sessionOptions: AcpSessionStartOptions = {
    cwd: prepared.cwd,
    launch: prepared.launch,
    ...(model ? { model } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    modelConfigKey: tool.modelConfigKey,
    sessionMeta: {
      ...prepared.sessionMeta,
      agentwolf: { matchId, playerId },
    },
    mcpServers: prepared.mcpServers,
    approvedToolNames: prepared.approvedToolNames,
    allowOpaqueMcpPermissions: prepared.allowOpaqueMcpPermissions,
    approvedMcpTools: [
      {
        server: 'agentwolf-player-actions',
        tool: submittedTool,
        title: promptCore.tool(submittedTool).title,
      },
    ],
    onStderr: (chunk) => stderrChunks.push(chunk),
    onPermissionRequest: (request) => permissionRequests.push(request),
    requireSessionResume: true,
    verifyUnadvertisedSessionResume: prepared.verifyUnadvertisedSessionResume,
  }
  session = await AcpPlayerSession.start(sessionOptions)
  const initialSessionId = session.sessionId
  const postgameInput = {
    mvpPlayerId: tokenTarget,
    svpPlayerId: PlayerIdSchema.parse('player-3'),
    ratings: Array.from({ length: 5 }, (_, index) => ({
      playerId: PlayerIdSchema.parse(`player-${index + 2}`),
      scores: {
        information: 8,
        communication: 8,
        decision: 8,
        objective: 8,
        adaptability: 8,
      },
    })),
  }
  const result = await session.prompt(
    probePostgameReview
      ? `Call submit_postgame_review exactly once with this JSON input: ${JSON.stringify(postgameInput)}. End the turn immediately after the accepted receipt.`
      : probeThiefChoice
        ? 'Call submit_night_action exactly once with abilityId ability-thief-choose-card, targetPlayerIds [], and roleCardId role-card-r01. End the turn immediately after the accepted receipt.'
        : `Call the submit_vote tool with targetPlayerId ${tokenTarget}. End the turn immediately after the accepted receipt. Do not answer with text instead of the tool.`,
    90_000,
  )
  const action = probePostgameReview
    ? server.matches.mailbox.takePostgameReview(matchId, playerId)
    : server.matches.mailbox.take(matchId, playerId)
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
  const reflectionChunks: string[] = []
  const postgameReflection = probePostgameReview
    ? await session.prompt(
        'The structured postgame review is accepted. Now reply directly with one short natural postgame reflection. Do not call any tool.',
        90_000,
        { onTextChunk: (text) => reflectionChunks.push(text) },
      )
    : null
  if (postgameReflection && reflectionChunks.join('').length === 0) {
    throw new Error('Postgame reflection did not stream any direct speech')
  }
  let resumeResult: Awaited<ReturnType<AcpPlayerSession['prompt']>> | null = null
  let resumedAction: PlayerAction | PostgameReviewSubmission | null = null
  if (probeResume) {
    await session.close()
    session = await AcpPlayerSession.start({
      ...sessionOptions,
      resumeSessionId: initialSessionId,
    })
    if (session.sessionId !== initialSessionId) {
      throw new Error(`Resumed Session ${session.sessionId}; expected ${initialSessionId}`)
    }
    expectSubmission()
    resumeResult = await session.prompt(
      probePostgameReview
        ? `Continue the current postgame review. Call submit_postgame_review with this JSON input: ${JSON.stringify(postgameInput)}, then end the turn after the accepted receipt.`
        : probeThiefChoice
          ? 'Continue the current judge stage. Call submit_night_action with abilityId ability-thief-choose-card, targetPlayerIds [], and roleCardId role-card-r01, then end the turn after the accepted receipt.'
          : `A new independent judge stage has begun after the previous accepted action. Call submit_vote with targetPlayerId ${resumeTokenTarget}, then end the turn after the accepted receipt.`,
      90_000,
    )
    resumedAction = probePostgameReview
      ? server.matches.mailbox.takePostgameReview(matchId, playerId)
      : server.matches.mailbox.take(matchId, playerId)
    if (!resumedAction) {
      throw new Error(
        `Resumed Session returned without an accepted action: ${JSON.stringify({ text: resumeResult.text, updates: toolUpdates(resumeResult.updates), stderr: stripAnsi(stderrChunks.join('')).slice(-4_000) }).slice(0, 12_000)}`,
      )
    }
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
  const forbiddenProbePath = resolve(workspace, 'forbidden-apply-patch.txt')
  const forbiddenProbe = probeForbidden
    ? await session.prompt(
        `Attempt to call the apply_patch tool exactly once to create ${JSON.stringify(forbiddenProbePath)}. Do not use any other tool. If apply_patch is not present in your current API tool definitions, reply only unavailable.`,
        90_000,
      )
    : null
  if (forbiddenProbe) {
    const forbiddenCalls = toolUpdates(forbiddenProbe.updates)
    if (
      forbiddenCalls.some((call) => call.status === 'completed') ||
      (await pathExists(forbiddenProbePath))
    ) {
      throw new Error(
        `Forbidden apply_patch write completed: ${JSON.stringify(forbiddenCalls).slice(0, 8_000)}`,
      )
    }
  }
  const strategyProbe = probeStrategy
    ? await session.prompt(
        'Use the `werewolf-strategy` Skill to find the phrase 统一战线 in its strategy guidance. Do not call a game action. Reply only 统一战线 after the Skill lookup succeeds.',
        120_000,
      )
    : null
  if (strategyProbe) {
    const strategyCalls = toolUpdates(strategyProbe.updates)
    const namedSkillUsed = strategyCalls.some((call) =>
      JSON.stringify(call).includes('werewolf-strategy'),
    )
    if (!strategyProbe.text.includes('统一战线') || !namedSkillUsed) {
      throw new Error(
        `Strategy probe did not use the named Skill: ${JSON.stringify({ text: strategyProbe.text, calls: strategyCalls }).slice(0, 8_000)}`,
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
        reasoningEffort: reasoningEffort ?? null,
        initialSessionId,
        resumedSessionId: probeResume ? session.sessionId : null,
        stopReason: result.stopReason,
        action,
        postgameReview: probePostgameReview,
        postgameReflection: postgameReflection
          ? { text: postgameReflection.text, chunks: reflectionChunks }
          : null,
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
  await cleanupPlayerProviderResources(
    resolve(root, 'matches', matchId, 'players', playerId, 'workspace'),
  )
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
