import { access } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { sourceFiles, text, localPath, failIfErrors, projectRoot } from './files.js'

const errors: string[] = []
const required = [
  'AGENTS.md',
  'apps/server/AGENTS.md',
  'apps/web/AGENTS.md',
  'README.md',
  'artifacts_rules.md',
  'docs/product.md',
  'docs/architecture.md',
  'docs/frontend.md',
  'docs/testing.md',
  'docs/information-sync.md',
  'docs/acceptance.md',
  'docs/research/preflight.md',
  'docs/plans/completed/v1.md',
  'docs/plans/completed/immersive-match-ui.md',
]
for (const path of required) {
  try {
    await access(resolve(projectRoot, path))
  } catch {
    errors.push(`missing required document ${path}`)
  }
}

const completedPlans = await sourceFiles(['docs/plans/completed'], new Set(['.md']))
for (const path of completedPlans) {
  const content = await text(path)
  const relativePath = localPath(path)
  for (const heading of ['## Goal', '## Completed work', '## Completion evidence']) {
    if (!content.includes(heading)) errors.push(`${relativePath} is missing ${heading}`)
  }
  if (/- \[ \]|\bTODO\b|^## (?:Pending|Next steps|Future)/imu.test(content)) {
    errors.push(`${relativePath} contains unfinished or future work`)
  }
}

const currentStateDocs = [
  'README.md',
  'docs/product.md',
  'docs/architecture.md',
  'docs/frontend.md',
  'docs/testing.md',
]
for (const path of currentStateDocs) {
  const content = await text(resolve(projectRoot, path))
  if (/旧版|替代旧|原来.{0,20}现在|不再使用|相比上一版/.test(content)) {
    errors.push(`${path} contains migration narration in a current-state document`)
  }
}

const markdownFiles = await sourceFiles(['docs'], new Set(['.md']))
const rootAgentsPath = resolve(projectRoot, 'AGENTS.md')
const nestedAgentFiles = (await sourceFiles(['.'], new Set(['.md']))).filter(
  (path) => path !== rootAgentsPath && path.endsWith('/AGENTS.md'),
)

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
  const parentLabel =
    parentAgentsPath === rootAgentsPath ? 'the root AGENTS.md' : 'the parent AGENTS.md'
  const expectedReference = `See [${parentLabel}](${parentLink})`
  const content = await text(path)
  if (!content.includes(expectedReference)) {
    errors.push(`${localPath(path)} must contain ${expectedReference}`)
  }
}

for (const path of new Set([
  resolve(projectRoot, 'README.md'),
  rootAgentsPath,
  ...nestedAgentFiles,
  ...markdownFiles,
])) {
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

const agents = await text(resolve(projectRoot, 'AGENTS.md'))
if (agents.split(/\r?\n/).length > 200)
  errors.push('AGENTS.md must remain a concise map under 200 lines')

const workflow = await text(resolve(projectRoot, '.github/workflows/ci.yml')).catch(() => '')
for (const requiredText of [
  'pnpm install --frozen-lockfile',
  'pnpm run check:static',
  'pnpm test:coverage',
  'pnpm build',
  'pnpm test:e2e',
]) {
  if (!workflow.includes(requiredText)) errors.push(`CI workflow is missing ${requiredText}`)
}
if (workflow.includes('continue-on-error: true'))
  errors.push('CI workflow contains a non-blocking required gate')

failIfErrors(errors, 'docs')
