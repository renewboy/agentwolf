import { resolve } from 'node:path'
import { sourceFiles, text, localPath, failIfErrors, projectRoot } from './files.js'

const roots = [
  'packages/contracts/src',
  'packages/assets/src',
  'packages/game-engine/src',
  'packages/acp/src',
  'apps/server/src',
  'apps/web/src',
]
const allowedInternalDependencies: Readonly<Record<string, ReadonlySet<string>>> = {
  contracts: new Set(),
  assets: new Set(['contracts']),
  'game-engine': new Set(['contracts']),
  acp: new Set(['contracts']),
  server: new Set(['contracts', 'assets', 'game-engine', 'acp']),
  web: new Set(['contracts', 'assets']),
}
const allowedCoreDependencies: Readonly<Record<string, ReadonlySet<string>>> = {
  contracts: new Set(),
  assets: new Set(['prompt-runtime']),
  'game-engine': new Set(['contracts', 'game-runtime', 'ruleset']),
  acp: new Set(['acp-runtime']),
  server: new Set(['contracts', 'match-runtime', 'simulation', 'trajectory']),
  web: new Set(),
}

const files = await sourceFiles(roots, new Set(['.ts', '.tsx']))
const e2eFiles = await sourceFiles(['e2e'], new Set(['.ts']))
const maxProductionFileLines = 600
const maxE2eSpecFileLines = 500
const productionFileLineLimitOverrides = new Map<string, number>([
  ['packages/game-engine/src/engine.ts', 800],
])
const errors: string[] = []
for (const path of e2eFiles.filter((candidate) => localPath(candidate).endsWith('.spec.ts'))) {
  const relativePath = localPath(path)
  const lines = (await text(path)).split(/\r?\n/).length
  if (lines > maxE2eSpecFileLines) {
    errors.push(
      `${relativePath} has ${lines} lines; E2E specs are limited to ${maxE2eSpecFileLines}`,
    )
  }
}
for (const path of files) {
  const relativePath = localPath(path)
  const content = await text(path)
  const lines = content.split(/\r?\n/).length
  const maxLines = productionFileLineLimitOverrides.get(relativePath) ?? maxProductionFileLines
  if (lines > maxLines) {
    errors.push(`${relativePath} has ${lines} lines; production files are limited to ${maxLines}`)
  }
  const owner = packageOwner(relativePath)
  for (const match of content.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s*)?['"](@agentwolf\/[^'"]+)['"]/g,
  )) {
    const imported = match[1]?.match(/^@agentwolf\/([^/]+)/)?.[1]
    if (!imported || imported === owner) continue
    if (!allowedInternalDependencies[owner]?.has(imported)) {
      const line = content.slice(0, match.index).split(/\r?\n/).length
      errors.push(`${relativePath}:${line} cannot import @agentwolf/${imported}`)
    }
  }
  for (const match of content.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s*)?['"](@agent-arena\/[^'"]+)['"]/g,
  )) {
    const imported = match[1]?.match(/^@agent-arena\/([^/]+)/)?.[1]
    if (!imported) continue
    if (!allowedCoreDependencies[owner]?.has(imported)) {
      const line = content.slice(0, match.index).split(/\r?\n/).length
      errors.push(`${relativePath}:${line} cannot import @agent-arena/${imported}`)
    }
  }
}

const engine = await text(
  files.find((path) => localPath(path) === 'packages/game-engine/src/engine.ts')!,
)
if (/switch\s*\([^)]*roleId/.test(engine)) {
  errors.push(
    'game-engine/src/engine.ts must not switch on role IDs; register role behavior instead',
  )
}
const gameEngineSource = (
  await Promise.all(
    files
      .filter((path) => localPath(path).startsWith('packages/game-engine/src/'))
      .map((path) => text(path)),
  )
).join('\n')
if (/\b(?:CharacterId|CharacterCard|CharacterCardSnapshot)\b/.test(gameEngineSource)) {
  errors.push('game-engine must not depend on Character persona data')
}
for (const path of files.filter((candidate) => {
  const relative = localPath(candidate)
  return (
    relative.startsWith('packages/game-engine/src/') &&
    !relative.startsWith('packages/game-engine/src/rulesets/classic/') &&
    relative !== 'packages/game-engine/src/index.ts'
  )
})) {
  const content = await text(path)
  if (
    /(?:RoleIdSchema|AbilityIdSchema)\.parse\(['"](?:role|ability)-/.test(content) ||
    /(?:===|!==)\s*['"](?:role|ability)-/.test(content)
  ) {
    errors.push(`${localPath(path)} kernel code must not contain concrete Role or Ability IDs`)
  }
}
if (files.some((path) => localPath(path) === 'packages/game-engine/src/classic-rules.ts')) {
  errors.push('classic-rules.ts must not exist; classic behavior is composed from ruleset plugins')
}
if (
  files.some(
    (path) => localPath(path) === 'packages/game-engine/src/rulesets/classic/phase-graph.ts',
  )
) {
  errors.push('classic phase nodes must be registered by their functional or Role plugins')
}
const actionValidator = await text(
  files.find((path) => localPath(path) === 'packages/game-engine/src/action-validator.ts')!,
)
if (/['"]phase-[a-z0-9-]+['"]/.test(actionValidator)) {
  errors.push('action-validator must read action semantics from PhaseNode, not phase ID literals')
}
const matchRuntimeHelpers = await text(
  files.find((path) => localPath(path) === 'apps/server/src/match-runtime-helpers.ts')!,
)
if (/phaseId\.(?:includes|startsWith|endsWith)\(/.test(matchRuntimeHelpers)) {
  errors.push('match-runtime helpers must read interrupt semantics from TurnDescriptor')
}
const damageAuthorityFiles = await Promise.all(
  files
    .filter(
      (path) =>
        localPath(path).startsWith('packages/game-engine/src/') &&
        localPath(path) !== 'packages/game-engine/src/types.ts',
    )
    .map(async (path) => ({
      path: localPath(path),
      content: await text(path),
    })),
)
const sharedTypes = await text(
  files.find((candidate) => localPath(candidate) === 'packages/game-engine/src/types.ts')!,
)
if (!/readonly protection:\s*string/.test(sharedTypes)) {
  errors.push('ProtectEffect protection IDs must remain open to Rule plugins')
}
const classicResolution = await text(
  files.find(
    (candidate) =>
      localPath(candidate) === 'packages/game-engine/src/rulesets/classic/resolution-registry.ts',
  )!,
)
if (/protection:\s*z\.enum/.test(classicResolution)) {
  errors.push('classic resolution must not enumerate Role-specific protection IDs')
}
for (const match of classicResolution.matchAll(/protection\s*[!=]==?\s*['"]([^'"]+)['"]/g)) {
  if (match[1] !== 'guard' && match[1] !== 'antidote') {
    errors.push(`classic resolution contains Role-specific protection branch ${match[1]}`)
  }
}
for (const [cause, expectedOwners] of [
  [
    'werewolf',
    [
      'packages/game-engine/src/rulesets/classic/roles/werewolf.ts',
      'packages/game-engine/src/rulesets/classic/roles/awakened-hidden-wolf.ts',
    ],
  ],
  ['self-destruct', ['packages/game-engine/src/rulesets/classic/roles/werewolf.ts']],
  ['white-wolf-detonate', ['packages/game-engine/src/rulesets/classic/roles/white-wolf-king.ts']],
] as const) {
  const owners = damageAuthorityFiles
    .filter(({ content }) => new RegExp(`cause\\s*:\\s*['"]${cause}['"]`).test(content))
    .map(({ path }) => path)
    .sort()
  const expected = [...expectedOwners].sort()
  if (
    owners.length !== expected.length ||
    owners.some((owner, index) => owner !== expected[index])
  ) {
    errors.push(`${cause} damage effects must be defined only by ${expected.join(', ')}`)
  }
}
const roleFiles = files.filter((path) =>
  /packages\/game-engine\/src\/rulesets\/classic\/roles\/[^/]+\.ts$/.test(localPath(path)),
)
for (const path of roleFiles) {
  const content = await text(path)
  if (!/export class \w+Role extends Role/.test(content)) {
    errors.push(`${localPath(path)} must export a concrete Role class`)
  }
  if (/publicRulesKey|interruptInstructionKey|promptContext|promptActions/.test(content)) {
    errors.push(`${localPath(path)} must not contain Prompt presentation metadata`)
  }
}

for (const relativePath of [
  'packages/assets/src/prompts/runtime.ts',
  'packages/assets/src/prompts/schema.ts',
  'packages/assets/src/prompts/facts.ts',
  'apps/server/src/context-renderer.ts',
  'apps/server/src/prompt-registry.ts',
  'apps/server/src/match-runtime-helpers.ts',
]) {
  const content = await text(resolve(projectRoot, relativePath))
  if (/['"](?:role|ability|phase|plugin)-[a-z0-9-]+['"]/.test(content)) {
    errors.push(`${relativePath} generic Prompt code contains a concrete game semantic ID`)
  }
}

for (const path of files.filter((candidate) => localPath(candidate).startsWith('apps/web/src/'))) {
  const content = await text(path)
  if (content.includes('@agentwolf/assets/prompts')) {
    errors.push(`${localPath(path)} must not import the server-only Prompt runtime`)
  }
  if (content.includes('@agentwolf/assets/player-skills')) {
    errors.push(`${localPath(path)} must not import the server-only Player Skill builder`)
  }
}
const assetsIndex = await text(
  files.find((path) => localPath(path) === 'packages/assets/src/index.ts')!,
)
if (assetsIndex.includes('./player-skills')) {
  errors.push('packages/assets main entry must not export the server-only Player Skill builder')
}

const playerRuntime = await text(
  files.find((path) => localPath(path) === 'apps/server/src/player-runtime.ts')!,
)
const playerSessionFactory = await text(
  files.find((path) => localPath(path) === 'apps/server/src/player-session-factory.ts')!,
)
for (const required of [
  'requireSessionResume: true',
  'resumeSessionId',
  'repository.playerSessions.reserve',
  'repository.playerSessions.activate',
]) {
  if (!`${playerRuntime}\n${playerSessionFactory}`.includes(required)) {
    errors.push(`player-runtime.ts must preserve durable Session invariant: ${required}`)
  }
}
const matchRuntime = await text(
  files.find((path) => localPath(path) === 'apps/server/src/match-runtime.ts')!,
)
for (const forbidden of ['replacePlayerSessions', 'resetDeliveryLedger']) {
  if (matchRuntime.includes(forbidden)) {
    errors.push(`match-runtime.ts must not recreate player Sessions through ${forbidden}`)
  }
}
for (const path of files.filter((candidate) =>
  localPath(candidate).startsWith('apps/server/src/postgame-'),
)) {
  const content = await text(path)
  if (/['"](?:village|werewolf|role-[a-z0-9-]+)['"]/.test(content)) {
    errors.push(`${localPath(path)} must consume explicit winning players, not faction or Role IDs`)
  }
}
const matchPostgame = await text(
  files.find((path) => localPath(path) === 'apps/server/src/match-postgame.ts')!,
)
if (!matchPostgame.includes('victory.winningPlayerIds')) {
  errors.push('match-postgame.ts must freeze explicit winning Player IDs for postgame review')
}
const sessionNewLocations: string[] = []
for (const path of files) {
  if ((await text(path)).includes('methods.agent.session.new')) {
    sessionNewLocations.push(localPath(path))
  }
}
if (sessionNewLocations.length > 0) {
  errors.push(
    `AgentWolf production code must delegate session/new to Core; found ${sessionNewLocations.join(', ')}`,
  )
}
const coreAcpSession = await text(
  resolve(projectRoot, 'vendor/agent-arena-core/packages/acp-runtime/src/session.ts'),
)
if ((coreAcpSession.match(/methods\.agent\.session\.new/g) ?? []).length !== 1) {
  errors.push('Core ACP runtime must contain the single session/new protocol call')
}

const webPackage = JSON.parse(await text(resolve(projectRoot, 'apps/web/package.json'))) as {
  dependencies?: Record<string, string>
}
const webDependencies = webPackage.dependencies ?? {}
for (const [name, expected] of [
  ['gsap', '3.15.0'],
  ['@gsap/react', '2.1.2'],
] as const) {
  if (webDependencies[name] !== expected) {
    errors.push(`apps/web must pin ${name} to ${expected}`)
  }
}
for (const forbidden of ['motion', 'framer-motion', 'animejs', 'lottie-web']) {
  if (webDependencies[forbidden])
    errors.push(`apps/web must not add animation runtime ${forbidden}`)
}
for (const path of files.filter((candidate) => localPath(candidate).startsWith('apps/web/src/'))) {
  const relativePath = localPath(path)
  if (relativePath === 'apps/web/src/motion/gsap.ts') continue
  const content = await text(path)
  if (/from ['"](?:gsap|gsap\/|@gsap\/react)/.test(content)) {
    errors.push(`${relativePath} must import the frozen animation runtime through motion/gsap.ts`)
  }
}

failIfErrors(errors, 'architecture')

function packageOwner(path: string): string {
  const match = path.match(/^(?:packages|apps)\/([^/]+)\/src\//)
  if (!match?.[1]) throw new Error(`Cannot determine package owner for ${path}`)
  return match[1]
}
