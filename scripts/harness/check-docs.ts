import { access } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { renderGameCatalog, gameCatalogPath } from './generate-game-catalog.js'
import { sourceFiles, text, localPath, failIfErrors, projectRoot } from './files.js'

const errors: string[] = []
const required = [
  'AGENTS.md',
  'README.md',
  'artifacts_rules.md',
  '.github/workflows/ci.yml',
  '.jscpd.json',
  '.oxfmtrc.json',
  '.oxlintrc.json',
  'lefthook.yml',
  'apps/server/AGENTS.md',
  'apps/server/README.md',
  'apps/web/AGENTS.md',
  'apps/web/README.md',
  'packages/contracts/README.md',
  'packages/contracts/AGENTS.md',
  'packages/game-engine/README.md',
  'packages/game-engine/AGENTS.md',
  'packages/acp/README.md',
  'packages/acp/AGENTS.md',
  'packages/assets/README.md',
  'packages/assets/AGENTS.md',
  'docs/AGENTS.md',
  'docs/product.md',
  'docs/architecture.md',
  'docs/architecture/game-runtime.md',
  'docs/architecture/prompt-and-context.md',
  'docs/architecture/acp-session-runtime.md',
  'docs/architecture/information-synchronization.md',
  'docs/architecture/match-lifecycle.md',
  'docs/architecture/trajectory.md',
  'docs/architecture/simulation.md',
  'docs/architecture/web-client.md',
  'docs/frontend.md',
  'docs/testing.md',
  'docs/reference/game-rules.md',
  'docs/generated/game-catalog.md',
  '.agents/skills/agentwolf-architecture-documentation/SKILL.md',
  '.agents/skills/agentwolf-architecture-documentation/references/architecture-document-template.md',
  '.agents/notes/AGENTS.md',
  '.agents/notes/README.md',
  '.agents/notes/implemented/AGENTS.md',
  '.agents/notes/archived/AGENTS.md',
]

for (const path of required) {
  try {
    await access(resolve(projectRoot, path))
  } catch {
    errors.push(`missing required document ${path}`)
  }
}

for (const path of [
  'docs/information-sync.md',
  'docs/architecture/trajectory-and-simulation.md',
  'docs/research/preflight.md',
  'docs/plans',
  'docs/acceptance',
  'docs/decisions',
]) {
  try {
    await access(resolve(projectRoot, path))
    errors.push(`${path} is a retired documentation location`)
  } catch {
    // Retired locations remain absent.
  }
}

const markdownFiles = await sourceFiles(['docs'], new Set(['.md']))
const allInstructionFiles = (await sourceFiles(['.'], new Set(['.md']))).filter((path) =>
  path.endsWith('/AGENTS.md'),
)
const rootAgentsPath = resolve(projectRoot, 'AGENTS.md')

for (const path of [rootAgentsPath, ...allInstructionFiles]) {
  const lines = (await text(path)).split(/\r?\n/).length
  if (lines > 200) errors.push(`${localPath(path)} exceeds the 200-line AGENTS.md limit`)
}

const architectureFiles = [
  resolve(projectRoot, 'docs/architecture.md'),
  ...(await sourceFiles(['docs/architecture'], new Set(['.md']))),
]
for (const path of architectureFiles) {
  const lines = (await text(path)).split(/\r?\n/).length
  if (lines > 500) errors.push(`${localPath(path)} exceeds the 500-line architecture limit`)
}

const currentStateDocs = [
  'README.md',
  'docs/product.md',
  'docs/architecture.md',
  'docs/frontend.md',
  'docs/testing.md',
  ...architectureFiles.slice(1).map(localPath),
]
for (const path of currentStateDocs) {
  const content = await text(resolve(projectRoot, path))
  if (/旧版|替代旧|原来.{0,20}现在|不再使用|相比上一版/.test(content)) {
    errors.push(`${path} contains migration narration in a current-state document`)
  }
}

const noteFiles = (await sourceFiles(['.agents/notes'], new Set(['.md']))).filter(
  (path) => !path.endsWith('/AGENTS.md') && !path.endsWith('/README.md'),
)
const notePattern =
  /^\.agents\/notes\/(proposed|implemented|rejected|archived)\/(feature|bug-fix|simplification|architecture|process|testing)\/(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
for (const path of noteFiles) {
  const relativePath = localPath(path)
  const match = relativePath.match(notePattern)
  if (!match) {
    errors.push(`${relativePath} must use .agents/notes/<lifecycle>/<class>/YYYY-MM-DD-<slug>.md`)
    continue
  }
  const lifecycle = match[1]!
  const content = await text(path)
  const lines = content.split(/\r?\n/)
  if (!/^# Agent Note: \S/.test(lines[0] ?? '')) {
    errors.push(`${relativePath} must start with # Agent Note: <title>`)
  }
  const status = lines.find((line) => line.startsWith('Status:'))
  const expectedStatus =
    lifecycle === 'rejected'
      ? /^Status: rejected — .+$/
      : lifecycle === 'archived'
        ? /^Status: implemented$/
        : new RegExp(`^Status: ${lifecycle}$`)
  if (!status || !expectedStatus.test(status)) {
    errors.push(`${relativePath} status does not match its lifecycle`)
  }
  for (const heading of ['## Problem', '## Alternatives considered']) {
    if (!content.includes(heading)) errors.push(`${relativePath} is missing ${heading}`)
  }
  const requiredHeadings =
    lifecycle === 'implemented' || lifecycle === 'archived'
      ? ['## Decision', '## Consequences']
      : ['## Proposal']
  for (const heading of requiredHeadings) {
    if (!content.includes(heading)) errors.push(`${relativePath} is missing ${heading}`)
  }
  if (lifecycle === 'proposed') {
    for (const heading of ['## Acceptance criteria', '## Risks']) {
      if (!content.includes(heading)) errors.push(`${relativePath} is missing ${heading}`)
    }
  }
  if (
    (lifecycle === 'implemented' || lifecycle === 'archived') &&
    (/^## (?:Proposal|Plan|Migration plan|Acceptance criteria)\b/im.test(content) ||
      /- \[ \]|\bTODO\b/im.test(content))
  ) {
    errors.push(`${relativePath} contains unfinished proposal or checklist content`)
  }
}

const nestedAgentFiles = allInstructionFiles.filter((path) => path !== rootAgentsPath)
for (const path of nestedAgentFiles) {
  let ancestorDirectory = dirname(dirname(path))
  let parentAgentsPath: string | undefined
  while (ancestorDirectory.startsWith(projectRoot)) {
    const candidate = resolve(ancestorDirectory, 'AGENTS.md')
    try {
      await access(candidate)
      parentAgentsPath = candidate
      break
    } catch {
      if (ancestorDirectory === projectRoot) break
      const parentDirectory = dirname(ancestorDirectory)
      if (parentDirectory === ancestorDirectory) break
      ancestorDirectory = parentDirectory
    }
  }
  if (!parentAgentsPath) {
    errors.push(`${localPath(path)} has no ancestor AGENTS.md`)
    continue
  }
  const parentLink = relative(dirname(path), parentAgentsPath).replaceAll('\\', '/')
  // 结构不变量:嵌套 AGENTS.md 必须以相对链接指向最近的祖先 AGENTS.md;链接文本语言不限。
  const expectedReference = `](${parentLink})`
  if (!(await text(path)).includes(expectedReference)) {
    errors.push(`${localPath(path)} must link to ${parentLink}`)
  }
}

const packageReadmes = [
  'apps/server/README.md',
  'apps/web/README.md',
  'packages/contracts/README.md',
  'packages/game-engine/README.md',
  'packages/acp/README.md',
  'packages/assets/README.md',
].map((path) => resolve(projectRoot, path))
const skillFiles = await sourceFiles(['.agents/skills'], new Set(['.md']))
const linkSources = new Set([
  resolve(projectRoot, 'README.md'),
  resolve(projectRoot, 'artifacts_rules.md'),
  rootAgentsPath,
  ...allInstructionFiles,
  ...markdownFiles,
  ...packageReadmes,
  ...skillFiles,
  resolve(projectRoot, '.agents/notes/README.md'),
  ...noteFiles,
])
for (const path of linkSources) {
  const content = await text(path)
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1]!
    if (/^(?:https?:|#)/.test(target)) continue
    const file = target.split('#')[0]!
    if (!file) continue
    try {
      await access(resolve(dirname(path), file))
    } catch {
      errors.push(`${localPath(path)} links to missing ${target}`)
    }
  }
}

const generatedCatalog = await text(gameCatalogPath).catch(() => '')
if (generatedCatalog !== renderGameCatalog()) {
  errors.push('docs/generated/game-catalog.md is stale; run pnpm docs:generate')
}

const workflow = await text(resolve(projectRoot, '.github/workflows/ci.yml')).catch(() => '')
for (const requiredText of [
  'pnpm/action-setup@v6',
  'pnpm install --frozen-lockfile',
  'pnpm run check:static',
  'pnpm test:coverage:ci',
  'Process guardian (macOS)',
  'pnpm build',
  'pnpm test:e2e',
]) {
  if (!workflow.includes(requiredText)) errors.push(`CI workflow is missing ${requiredText}`)
}
if (workflow.includes('continue-on-error: true')) {
  errors.push('CI workflow contains a non-blocking required gate')
}
if ([...workflow.matchAll(/pnpm\/action-setup@(\S+)/gu)].some((match) => match[1] !== 'v6')) {
  errors.push('CI workflow uses a pnpm Action without the Node 24 runtime')
}
const browserJob = workflow.match(/\n  e2e:\n[\s\S]*?(?=\n  [a-z][\w-]*:\n|$)/u)?.[0] ?? ''
if (!browserJob.includes('lfs: true')) {
  errors.push('Browser acceptance must materialize Git LFS assets')
}

const hooks = await text(resolve(projectRoot, 'lefthook.yml')).catch(() => '')
for (const requiredText of [
  'pre-commit:',
  'pre-push:',
  'git --no-pager diff --cached --check',
  'run: pnpm check',
]) {
  if (!hooks.includes(requiredText)) errors.push(`lefthook.yml is missing ${requiredText}`)
}
const manifest = JSON.parse(await text(resolve(projectRoot, 'package.json'))) as {
  readonly scripts?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
}
if (manifest.scripts?.['prepare'] !== 'node scripts/harness/install-hooks.mjs') {
  errors.push('package.json must install repository hooks during prepare')
}
if (!manifest.devDependencies?.['lefthook']) {
  errors.push('package.json must declare lefthook')
}

failIfErrors(errors, 'docs')
