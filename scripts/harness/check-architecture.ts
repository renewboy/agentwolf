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
const errors: string[] = []
for (const path of files) {
  const relativePath = localPath(path)
  const content = await text(path)
  const lines = content.split(/\r?\n/).length
  if (lines > 500)
    errors.push(`${relativePath} has ${lines} lines; production files are limited to 500`)
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
const roleFiles = files.filter((path) =>
  /packages\/game-engine\/src\/roles\/(?!base|helpers|registry)[^/]+\.ts$/.test(localPath(path)),
)
for (const path of roleFiles) {
  const content = await text(path)
  if (!/export class \w+Role extends Role/.test(content)) {
    errors.push(`${localPath(path)} must export a concrete Role class`)
  }
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
