import copy from '../../packages/assets/copy/zh-CN.json' with { type: 'json' }
import names from '../../packages/assets/names/zh-CN.json' with { type: 'json' }
import characters from '../../packages/assets/characters/zh-CN.json' with { type: 'json' }
import { sourceFiles, text, localPath, failIfErrors, projectRoot } from './files.js'
import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const errors: string[] = []
const productionFiles = await sourceFiles(
  [
    'apps/web/src',
    'apps/server/src',
    'packages/contracts/src',
    'packages/game-engine/src',
    'packages/acp/src',
  ],
  new Set(['.ts', '.tsx']),
)
for (const path of productionFiles) {
  const content = await text(path)
  const relativePath = localPath(path)
  if (/\p{Script=Han}/u.test(content)) {
    errors.push(`${relativePath} contains Chinese copy outside packages/assets`)
  }
  if (relativePath.startsWith('apps/web/') && /\bstyle\s*=\s*\{/.test(content)) {
    errors.push(`${relativePath} contains an inline style prop`)
  }
  if (relativePath.startsWith('apps/web/') && /#[0-9a-fA-F]{3,8}\b/.test(content)) {
    errors.push(`${relativePath} contains a raw color outside the style asset package`)
  }
  if (relativePath.startsWith('apps/web/') && /<select\b/.test(content)) {
    errors.push(`${relativePath} contains a native select instead of GameSelect`)
  }
  if (
    relativePath.startsWith('apps/web/') &&
    /\b(?:(?:window|globalThis)\.)?(?:alert|confirm|prompt)\s*\(/.test(content)
  ) {
    errors.push(`${relativePath} contains a browser prompt instead of an application dialog`)
  }
  if (
    relativePath.startsWith('apps/web/') &&
    relativePath !== 'apps/web/src/hooks/useSpeechPlayback.ts' &&
    /\b(?:speechSynthesis|SpeechSynthesisUtterance)\b/.test(content)
  ) {
    errors.push(`${relativePath} bypasses the centralized speech playback controller`)
  }
}

const cssFiles = await sourceFiles(['apps', 'packages'], new Set(['.css']))
for (const path of cssFiles) {
  if (!localPath(path).startsWith('packages/assets/styles/')) {
    errors.push(`${localPath(path)} is CSS outside packages/assets/styles`)
  }
}

const promptFiles = await sourceFiles(
  ['packages/assets/prompts'],
  new Set(['.md', '.njk', '.json']),
)
for (const path of promptFiles) {
  const content = await text(path)
  const relativePath = localPath(path)
  if (/新增|以下是补充|补充信息|此前版本|旧版/.test(content)) {
    errors.push(`${relativePath} contains delivery metadata or history narration`)
  }
  if (/\bplayer-\d+\b/.test(content)) {
    errors.push(`${relativePath} hardcodes a concrete Player ID`)
  }
  if (/(?:^|\/)zh-CN(?:\/|$)|(?:^|\/)(?:locale|locales|i18n)(?:\/|$)/.test(relativePath)) {
    errors.push(`${relativePath} introduces a locale dimension into Prompt assets`)
  }
  if (relativePath.endsWith('.md')) {
    errors.push(`${relativePath} uses the retired Markdown Prompt asset format`)
  }
  if (relativePath.endsWith('/bundle.json') && /"version"\s*:/.test(content)) {
    errors.push(`${relativePath} declares a forbidden Prompt version`)
  }
  if (
    /\/(?:self-save-blocked|antidote-unavailable|no-target|target-required)\./.test(relativePath)
  ) {
    errors.push(`${relativePath} is a condition-fragment Prompt asset`)
  }
  if (relativePath.endsWith('/role.njk')) {
    const lines = content.split(/\r?\n/)
    const publicBranch = lines.some((line) =>
      /^\s*{%\s*if\s+section\s*==\s*['"]public['"]\s*%}\s*$/.test(line),
    )
    const ownerBranch = lines.some((line) =>
      /^\s*{%\s*elif\s+section\s*==\s*['"]owner['"]\s*%}\s*$/.test(line),
    )
    if (!publicBranch || !ownerBranch) {
      errors.push(`${relativePath} must keep public and owner Role branches on readable lines`)
    }
  }
  for (const interpolation of content.matchAll(/{{([^}]*)}}/g)) {
    const expression = interpolation[1]!.trim()
    if (
      /(?:^|\.)(?:playerId|playerIds|targetId|voterId|selectedPlayerId|fromPlayerId|toPlayerId)(?:\[[^\]]+\])?$/.test(
        expression,
      )
    ) {
      errors.push(`${relativePath} directly renders a Player ID instead of a Prompt reference`)
    }
  }
  if (
    content.includes('helpers.initialPlayer') &&
    relativePath !== 'packages/assets/prompts/_core/foundation.njk'
  ) {
    errors.push(`${relativePath} renders opening Player identity outside the foundation`)
  }
  if (
    /{{[^}]*\b(?:actor|player)\.name\b[^}]*}}/.test(content) &&
    relativePath !== 'packages/assets/prompts/_core/foundation.njk' &&
    relativePath !== 'packages/assets/prompts/_core/character.njk'
  ) {
    errors.push(`${relativePath} directly renders a Player nickname outside the foundation`)
  }
  if (
    content.includes('helpers.speaker') &&
    relativePath !== 'packages/assets/prompts/_core/events/speech.njk' &&
    relativePath !==
      'packages/assets/prompts/bundles/plugin-classic-wolf-team/events/council-speech.njk'
  ) {
    errors.push(`${relativePath} renders a Player nickname outside a speech heading`)
  }
}

const corePromptSource = (
  await Promise.all(
    promptFiles
      .filter((path) => localPath(path).startsWith('packages/assets/prompts/_core/'))
      .map((path) => text(path)),
  )
).join('\n')
if (/['"`](?:role|ability|phase|plugin)-[a-z0-9-]+/.test(corePromptSource)) {
  errors.push('packages/assets/prompts/_core contains a concrete game semantic ID')
}
const corePromptManifest = JSON.parse(
  await text(resolve(projectRoot, 'packages/assets/prompts/_core/bundle.json')),
) as {
  events?: Array<{ eventType?: string; omit?: boolean; template?: string }>
}
const phaseChangedPresentation = corePromptManifest.events?.find(
  (presentation) => presentation.eventType === 'phase.changed',
)
if (phaseChangedPresentation?.omit !== true || phaseChangedPresentation.template !== undefined) {
  errors.push('phase.changed must be omitted from every model Prompt')
}

const promptAnnouncementCodes = new Set<string>()
for (const manifestPath of promptFiles.filter((path) => path.endsWith('/bundle.json'))) {
  const manifest = JSON.parse(await text(manifestPath)) as {
    roles?: Array<{
      id: string
      abilities?: Array<{ id: string }>
    }>
    phases?: Array<{ id: string }>
    announcements?: Array<{ code: string }>
  }
  for (const announcement of manifest.announcements ?? []) {
    if (promptAnnouncementCodes.has(announcement.code)) {
      errors.push(`duplicate Prompt announcement ${announcement.code}`)
    }
    promptAnnouncementCodes.add(announcement.code)
  }
  const allowed = {
    role: new Set((manifest.roles ?? []).map((role) => role.id)),
    ability: new Set(
      (manifest.roles ?? []).flatMap((role) => (role.abilities ?? []).map((ability) => ability.id)),
    ),
    phase: new Set((manifest.phases ?? []).map((phase) => phase.id)),
  }
  const bundleDirectory = dirname(manifestPath)
  for (const templatePath of promptFiles.filter(
    (path) => path.startsWith(`${bundleDirectory}/`) && path.endsWith('.njk'),
  )) {
    const content = await text(templatePath)
    for (const kind of ['role', 'ability', 'phase'] as const) {
      for (const match of content.matchAll(new RegExp(`\\b${kind}-[a-z0-9-]+\\b`, 'g'))) {
        if (!allowed[kind].has(match[0])) {
          errors.push(`${localPath(templatePath)} contains unowned ${kind} semantic ${match[0]}`)
        }
      }
    }
  }
}

const emittedAnnouncementCodes = new Set<string>()
for (const path of productionFiles.filter((candidate) =>
  localPath(candidate).startsWith('packages/game-engine/src/'),
)) {
  for (const match of (await text(path)).matchAll(/\bcode:\s*['"]([a-z0-9-]+)['"]/g)) {
    emittedAnnouncementCodes.add(match[1]!)
  }
}
for (const code of emittedAnnouncementCodes) {
  if (!promptAnnouncementCodes.has(code)) {
    errors.push(`domain announcement ${code} has no owning Prompt presentation`)
  }
}
for (const code of promptAnnouncementCodes) {
  if (!emittedAnnouncementCodes.has(code)) {
    errors.push(`Prompt announcement ${code} has no domain emission`)
  }
}

if ('promptContext' in copy || 'promptActions' in copy || 'tools' in copy) {
  errors.push('localized UI copy contains model-only Prompt dictionaries')
}

const promptVersionFiles = await sourceFiles(
  ['apps', 'packages', 'scripts'],
  new Set(['.ts', '.tsx', '.json', '.njk']),
)
for (const path of promptVersionFiles) {
  const relativePath = localPath(path)
  if (
    relativePath === 'apps/server/src/database-schema.ts' ||
    relativePath === 'apps/server/tests/migration.test.ts' ||
    relativePath === 'scripts/harness/check-artifacts.ts'
  ) {
    continue
  }
  if (/promptVersion|promptContractVersion/.test(await text(path))) {
    errors.push(`${relativePath} reintroduces the retired Prompt version concept`)
  }
}

const copyKeys = new Set<string>()
collectCopyKeys(copy, '', copyKeys)
for (const path of await sourceFiles(['apps', 'packages'], new Set(['.ts', '.tsx']))) {
  const content = await text(path)
  for (const match of content.matchAll(/get(?:Asset)?Copy\(['"]([^'"]+)['"]\)/g)) {
    const key = match[1]!
    if (!copyKeys.has(key)) errors.push(`${localPath(path)} references missing copy key ${key}`)
  }
  for (const match of content.matchAll(
    /(?:labelKey|nameKey|descriptionKey|displayNameKey):\s*['"]([^'"]+)['"]/g,
  )) {
    const key = match[1]!
    if (!copyKeys.has(key)) errors.push(`${localPath(path)} references missing asset key ${key}`)
  }
}

if (new Set(names.prefixes).size !== names.prefixes.length || names.prefixes.length < 30) {
  errors.push('nickname prefixes must contain at least 30 unique values')
}
if (new Set(names.suffixes).size !== names.suffixes.length || names.suffixes.length < 30) {
  errors.push('nickname suffixes must contain at least 30 unique values')
}

if (characters.length !== 12 || new Set(characters.map(({ id }) => id)).size !== 12) {
  errors.push('built-in Character catalog must contain exactly 12 unique cards')
}
for (const character of characters) {
  if (character.editable || character.source !== 'built-in') {
    errors.push(`built-in Character ${character.id} must be read-only`)
  }
  if (character.personality.length < 2 || character.boundaries.length < 1) {
    errors.push(`built-in Character ${character.id} has an incomplete portrayal contract`)
  }
  try {
    await access(
      resolve(projectRoot, 'packages/assets/characters/portraits', character.portraitFile),
    )
  } catch {
    errors.push(`missing built-in Character portrait ${character.portraitFile}`)
  }
}

for (const required of [
  'packages/assets/styles/index.css',
  'packages/assets/prompts/_core/bundle.json',
  'packages/assets/names/zh-CN.json',
  'docs/design/reference/match-stage.png',
  'docs/design/reference/match-stage.prompt.md',
  'docs/design/reference/match-motion.md',
]) {
  try {
    await access(resolve(projectRoot, required))
  } catch {
    errors.push(`missing required asset ${required}`)
  }
}

failIfErrors(errors, 'artifacts')

function collectCopyKeys(value: unknown, prefix: string, keys: Set<string>): void {
  if (typeof value === 'string') {
    keys.add(prefix)
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, child] of Object.entries(value)) {
    collectCopyKeys(child, prefix ? `${prefix}.${key}` : key, keys)
  }
}
