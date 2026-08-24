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

const files = await sourceFiles(roots, new Set(['.ts', '.tsx']))
const maxProductionFileLines = 600
const errors: string[] = []
for (const path of files) {
  const relativePath = localPath(path)
  const content = await text(path)
  const lines = content.split(/\r?\n/).length
  if (lines > maxProductionFileLines) {
    errors.push(
      `${relativePath} has ${lines} lines; production files are limited to ${maxProductionFileLines}`,
    )
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
for (const cause of ['werewolf', 'self-destruct']) {
  const owners = damageAuthorityFiles
    .filter(({ content }) => new RegExp(`cause\\s*:\\s*['"]${cause}['"]`).test(content))
    .map(({ path }) => path)
  if (owners.length !== 1 || owners[0] !== 'packages/game-engine/src/roles/werewolf.ts') {
    errors.push(`${cause} damage effects must be defined only by roles/werewolf.ts`)
  }
}
const roleFiles = files.filter((path) =>
  /packages\/game-engine\/src\/roles\/(?!base|helpers|registry)[^/]+\.ts$/.test(localPath(path)),
)
const copyCatalog = JSON.parse(
  await text(resolve(projectRoot, 'packages/assets/copy/zh-CN.json')),
) as Record<string, unknown>
for (const path of roleFiles) {
  const content = await text(path)
  if (!/export class \w+Role extends Role/.test(content)) {
    errors.push(`${localPath(path)} must export a concrete Role class`)
  }
  const publicRulesKey = content.match(/public readonly publicRulesKey = '([^']+)'/)?.[1]
  if (!publicRulesKey) {
    errors.push(`${localPath(path)} must declare a publicRulesKey`)
  } else if (typeof copyValue(copyCatalog, publicRulesKey) !== 'string') {
    errors.push(`${localPath(path)} references non-string public rules copy ${publicRulesKey}`)
  }
}

const playerRuntime = await text(
  files.find((path) => localPath(path) === 'apps/server/src/player-runtime.ts')!,
)
for (const required of [
  'requireSessionResume: true',
  'resumeSessionId',
  'repository.playerSessions.reserve',
  'repository.playerSessions.activate',
]) {
  if (!playerRuntime.includes(required)) {
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
const sessionNewLocations: string[] = []
for (const path of files) {
  if ((await text(path)).includes('methods.agent.session.new')) {
    sessionNewLocations.push(localPath(path))
  }
}
if (sessionNewLocations.length !== 1 || sessionNewLocations[0] !== 'packages/acp/src/session.ts') {
  errors.push(
    `session/new must have one generic ACP owner; found ${sessionNewLocations.join(', ') || 'none'}`,
  )
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

function copyValue(catalog: Record<string, unknown>, key: string): unknown {
  let value: unknown = catalog
  for (const segment of key.split('.')) {
    if (typeof value !== 'object' || value === null || !(segment in value)) return undefined
    value = (value as Record<string, unknown>)[segment]
  }
  return value
}
