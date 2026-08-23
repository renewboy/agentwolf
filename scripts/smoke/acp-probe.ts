import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { AcpPlayerSession, builtInAgentTools, resolveLaunchSpec } from '@agentwolf/acp'

const kind = process.argv[2]
const model = process.argv[3]
const prompt = process.argv[4]
if (!kind || !model) throw new Error('Usage: pnpm smoke:acp <trae-cli|codex|claude> <model>')
const tool = builtInAgentTools().find((entry) => entry.kind === kind)
if (!tool) throw new Error(`Unknown built-in Agent Tool ${kind}`)

const smokeRoot = resolve(process.cwd(), '.agentwolf', 'smoke')
await mkdir(smokeRoot, { recursive: true })
const cwd = await mkdtemp(resolve(smokeRoot, `${kind}-`))
let session: AcpPlayerSession | null = null
try {
  session = await AcpPlayerSession.start({
    cwd,
    launch: resolveLaunchSpec(tool),
    model,
    modelConfigKey: tool.modelConfigKey,
    ...(tool.initialMode ? { mode: tool.initialMode } : {}),
  })
  const models = session.configOptions
    .flatMap((option) =>
      option.category === 'model' && option.type === 'select'
        ? option.options.flatMap((entry) => ('options' in entry ? entry.options : [entry]))
        : [],
    )
    .map((entry) => entry.value)
  const promptResult = prompt ? await session.prompt(prompt, 120_000) : null
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        tool: kind,
        agent: session.initializeResponse.agentInfo,
        protocolVersion: session.initializeResponse.protocolVersion,
        sessionId: session.sessionId,
        model,
        advertisedModels: models,
        modes: session.availableModes.map((mode) => mode.id),
        ...(promptResult
          ? { responseText: promptResult.text, stopReason: promptResult.stopReason }
          : {}),
      },
      null,
      2,
    )}\n`,
  )
} finally {
  await session?.close()
  await rm(cwd, { recursive: true, force: true })
}
