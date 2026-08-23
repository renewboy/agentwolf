import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { sourceFiles, text, localPath, failIfErrors, projectRoot } from './files.js'

const errors: string[] = []
const required = [
  'AGENTS.md',
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
for (const path of [
  resolve(projectRoot, 'README.md'),
  resolve(projectRoot, 'AGENTS.md'),
  ...markdownFiles,
]) {
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
if (agents.split(/\r?\n/).length > 150)
  errors.push('AGENTS.md must remain a concise map under 150 lines')

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
